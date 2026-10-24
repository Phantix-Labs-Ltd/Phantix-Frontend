import React, { useCallback, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, CheckCheck, ChevronDown, ClipboardList, ExternalLink, FileText, FlaskConical, ListChecks, MessageSquare, NotebookPen,
  Plus, RefreshCw, ShieldAlert, Sparkles, Trash2, Wand2,
} from "lucide-react";
import { Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, PageSkeleton, SeverityBadge, Tabs } from "@sg/ui";
import { useResource } from "@sg/useResource";
import { useStore } from "@sg/store";
import { cx } from "@sg/utils";
import MarkdownView from "@sg/components/MarkdownView";
import { DEFEND_URL } from "@sg/config";
import {
  AUDIT_TYPE_LABEL, FINDING_STATUS_LABEL, REPORT_TYPE_LABEL, REQUEST_STATUS_LABEL, RESULT_LABEL, ROLE_LABEL,
  SCOPE_TYPE_LABEL, SIGNIFICANCE_LABEL, SIGN_OFF_LABEL, STATUS_LABEL,
  addScopeItem, addTeamMember, generateEvidenceRequests, generateReport, loadEngagement, loadEvidenceRequests,
  loadFindings, loadIntelligence, loadReadiness, loadReports, loadScope, loadTeam, loadTests, loadWorkpapers,
  createWorkpaper, raiseFinding, removeScopeItem, removeTeamMember, retestFinding, updateEngagement,
  updateEvidenceRequest, updateFinding, updateScopeItem, updateTest, updateWorkpaper,
  EVIDENCE_TYPE_LABEL, loadEvidence, loadMe, registerEvidence, type AssuranceMe, type EvidenceType,
  type AuditFinding, type AuditReport, type ControlTest, type EngagementStatus, type EngagementSummary,
  type EvidenceRequest, type EvidenceRequestStatus, type FindingSeverity, type FindingSignificance, type ReportType,
  type ScopeItem, type ScopeItemInput, type ScopeItemType, type TestResult, type Workpaper,
  addScopeItems, bulkRecordTests, bulkSignOff, bulkUpdateEvidenceRequests, loadControls, loadEvidenceLibrary, loadScopeSuggestions,
  prepareEngagement, type ControlTestInput, type EngagementControl, type EngagementControls,
} from "@sg/assurance";
import { loadOrgUsers } from "@sg/data";
import {
  EffectivenessBar, InlineError, OpinionBadge, ReadinessRing, ResultChip, SourceChips, StageStrip, errMsg, fmtDate, isOverdue,
} from "./parts";
import { SCOPE_HINT, ScopePicker, chosenScope, defaultSelection } from "./ScopePicker";

const TABS = ["overview", "scope", "controls", "evidence", "findings", "readiness", "workpapers", "reports"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview", scope: "Scope", controls: "Controls", evidence: "Evidence", findings: "Findings",
  readiness: "Readiness", workpapers: "Workpapers", reports: "Reports",
};
/** Old links used ?tab=testing; that work now lives on the Controls tab. */
const TAB_ALIAS: Record<string, Tab> = { testing: "controls" };

const emptyControls = (id: number): EngagementControls => ({ engagement_id: id, assurance_mode: "independent", controls: [], total: 0, tested: 0, with_proposal: 0, needs_judgement: 0 });

/** What the caller's role allows (from `_meta/me`); actions they can't take are hidden. */
const ALL: AssuranceMe = { role: "unknown", can_read: true, can_audit: true, can_manage: true };
const Can = React.createContext<AssuranceMe>(ALL);
const useCan = () => React.useContext(Can);

/** Who's signed in, for separation-of-duties hints (the server enforces it). */
function useMe() {
  const { session } = useStore();
  return useMemo(() => {
    const ids = [session?.userEmail, session?.userName].filter(Boolean).map((v) => String(v).trim().toLowerCase());
    return { email: (session?.userEmail || "").toLowerCase(), is: (label: string | null | undefined) => !!label && ids.includes(label.trim().toLowerCase()) };
  }, [session?.userEmail, session?.userName]);
}

/** Core → Assurance → one audit. */
export default function AssuranceWorkspace() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const rawTab = TAB_ALIAS[params.get("tab") || ""] ?? params.get("tab") ?? "";
  const tab: Tab = (TABS as readonly string[]).includes(rawTab) ? (rawTab as Tab) : "overview";
  const setTab = (t: string) => setParams((p) => { p.set("tab", t); return p; }, { replace: true });

  const loader = useCallback(() => loadEngagement(id), [id]);
  const { data: e, loading, error, reload, setData } = useResource<EngagementSummary | null>(loader, null, `assurance-${id}`);
  const { data: me } = useResource(loadMe, ALL, "assurance-me");

  if (!Number.isFinite(id)) return <ErrorState title="Audit not found" body="This link doesn't point to an audit." />;
  if (loading && !e) return <PageSkeleton />;
  if (error && !e) return <ErrorState onRetry={reload} body="We couldn't load this audit. Check your connection and try again." />;
  if (!e) return null;

  return (
    <Can.Provider value={me}>
    <div>
      <Link to="/assurance" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"><ArrowLeft size={14} /> Assurance</Link>
      {!me.can_audit && !me.can_manage && (
        <p className="mb-3 rounded-md border border-phantix-700 bg-phantix-900 px-3 py-2 text-xs text-slate-400">You can view this audit. Ask an admin for audit permissions to record tests or change it.</p>
      )}
      <PageHeader title={e.title} description={`${AUDIT_TYPE_LABEL[e.audit_type] ?? e.audit_type}${e.program_name ? ` · ${e.program_name}` : ""} · ${fmtDate(e.period_start)} – ${fmtDate(e.period_end)}${e.lead_auditor_name ? ` · Lead: ${e.lead_auditor_name}` : ""}`} />

      <Card className="mb-5 flex flex-wrap items-center gap-6">
        <ReadinessRing score={e.readiness_score} />
        <div className="min-w-[240px] flex-1">
          <p className="text-[12px] uppercase tracking-wider text-slate-500">Opinion</p>
          <div className="mt-1"><OpinionBadge opinion={e.opinion} withRule /></div>
          <div className="mt-4"><StageStrip status={e.status} /></div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {(e.status === "planned" || e.status === "scoping") && <PrepareButton id={e.id} onDone={() => { reload(); setTab("controls"); }} />}
          <AdvanceStatus e={e} onChanged={(next) => setData(next)} />
        </div>
      </Card>
      {e.assurance_mode === "self_assessment" && (
        <p className="mb-4 rounded-md border border-phantix-700 bg-phantix-900 px-3 py-2 text-xs text-slate-400">
          Self-assessment: your team audits itself, so results aren't signed off by a second reviewer. Use a third-party auditor for an independent opinion.
        </p>
      )}

      <Tabs tabs={TABS.map((t) => ({ id: t, label: TAB_LABEL[t] }))} active={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === "overview" && <Overview e={e} />}
        {tab === "scope" && <Scope id={e.id} />}
        {tab === "evidence" && <Evidence id={e.id} />}
        {tab === "controls" && <Controls e={e} />}
        {tab === "findings" && <Findings e={e} />}
        {tab === "readiness" && <ReadinessTab id={e.id} />}
        {tab === "workpapers" && <Workpapers id={e.id} />}
        {tab === "reports" && <ReportsTab id={e.id} onPublished={reload} />}
      </div>
    </div>
    </Can.Provider>
  );
}

// ── Status ───────────────────────────────────────────────────────────────────

function AdvanceStatus({ e, onChanged }: { e: EngagementSummary; onChanged: (next: EngagementSummary) => void }) {
  const { toast, requireDualControl } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const can = useCan();
  const [primary, ...others] = e.next_statuses;
  if (!primary || !can.can_manage) return null;

  const move = async (status: EngagementStatus) => {
    setErr(null);
    if (!(await requireDualControl("Moving an audit to its next stage is a recorded change."))) return;
    setBusy(true);
    try {
      onChanged(await updateEngagement(e.id, { status }));
      toast("success", `Moved to ${STATUS_LABEL[status]}`);
    } catch (ex) {
      setErr(errMsg(ex, "Couldn't change the stage"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button className="btn-primary" disabled={busy} onClick={() => void move(primary)}>Move to {STATUS_LABEL[primary]}</button>
        {others.length > 0 && (
          <select aria-label="Other stages" className="input !w-auto !py-2 text-xs" value="" disabled={busy}
            onChange={(ev) => ev.target.value && void move(ev.target.value as EngagementStatus)}>
            <option value="">Other…</option>
            {others.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        )}
      </div>
      {err && <p className="max-w-xs text-right text-xs text-severity-critical">{err}</p>}
    </div>
  );
}

/** One step instead of three: request evidence per control, attach what the library holds, start fieldwork. */
function PrepareButton({ id, onDone, label = "Prepare audit" }: { id: number; onDone: () => void; label?: string }) {
  const { toast, requireDualControl } = useStore();
  const [busy, setBusy] = useState(false);
  const can = useCan();
  if (!can.can_audit && !can.can_manage) return null;

  const run = async () => {
    if (!(await requireDualControl("Preparing an audit creates evidence requests and starts fieldwork."))) return;
    setBusy(true);
    try {
      const r = await prepareEngagement(id);
      const parts = [
        r.requests_created ? `${r.requests_created} evidence requests created` : "Every control already had a request",
        r.requests_with_evidence ? `${r.requests_with_evidence} already have evidence attached` : null,
        r.proposals ? `${r.proposals} controls have a suggested result` : null,
      ].filter(Boolean);
      toast("success", "Audit prepared", `${parts.join(". ")}.`);
      onDone();
    } catch (ex) { toast("error", "Couldn't prepare the audit", errMsg(ex, "")); } finally { setBusy(false); }
  };

  return (
    <button className="btn-primary" disabled={busy} onClick={() => void run()} title="Request evidence for every control and attach what your evidence library already holds.">
      <Wand2 size={14} /> {busy ? "Preparing..." : label}
    </button>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function Overview({ e }: { e: EngagementSummary }) {
  const { data: team, reload } = useResource(() => loadTeam(e.id), [], `assurance-${e.id}-team`);
  const { data: users } = useResource(() => loadOrgUsers().catch(() => []), [], "assurance-org-users");
  const { data: intel } = useResource(() => loadIntelligence(e.id).catch(() => null), null, `assurance-${e.id}-intel`);
  const { toast, requireDualControl } = useStore();
  const can = useCan();

  const add = async (userId: number) => {
    const u = users.find((x) => x.id === userId);
    if (!u || !(await requireDualControl("Changing the audit team is a recorded change."))) return;
    try {
      await addTeamMember(e.id, { principal_type: "org_user", principal_id: u.id, principal_name: u.full_name, principal_email: u.email, role: "auditee" });
      reload();
    } catch (ex) { toast("error", "Couldn't add them", errMsg(ex, "")); }
  };
  const remove = async (memberId: number) => {
    if (!(await requireDualControl("Changing the audit team is a recorded change."))) return;
    try { await removeTeamMember(e.id, memberId); reload(); } catch (ex) { toast("error", "Couldn't remove them", errMsg(ex, "")); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="At a glance" />
        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div><dt className="text-[12px] text-slate-500">Controls</dt><dd className="font-display text-lg text-white">{e.controls_total}</dd></div>
          <div><dt className="text-[12px] text-slate-500">In scope</dt><dd className="font-display text-lg text-white">{e.scope_items_in} / {e.scope_items}</dd></div>
          <div><dt className="text-[12px] text-slate-500">Team</dt><dd className="font-display text-lg text-white">{e.team_size}</dd></div>
        </dl>
        <p className="mt-4 text-[12px] text-slate-500">Criteria</p>
        <div className="mt-1 flex flex-wrap gap-1">{e.criteria.map((c) => <span key={c} className="rounded bg-phantix-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">{c}</span>)}</div>
        <p className="mt-4 text-[12px] text-slate-500">Scope</p>
        <p className="text-sm text-slate-300">{e.scope_summary || "Not described yet."}</p>
      </Card>

      <Card>
        <CardHeader title="Audit team" subtitle="Auditees can't record tests on this audit; preparers can't review their own work." />
        <ul className="mt-2 divide-y divide-phantix-700/40">
          {team.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate text-slate-200">{m.principal_name || m.principal_email || `#${m.principal_id}`}</span>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                {ROLE_LABEL[m.role]}{m.principal_type === "staff" ? " · Phantix" : ""}
                {m.principal_type === "org_user" && can.can_manage && (
                  <button aria-label="Remove from team" className="rounded p-1 hover:text-severity-critical" onClick={() => void remove(m.id)}><Trash2 size={13} /></button>
                )}
              </span>
            </li>
          ))}
          {team.length === 0 && <li className="py-2 text-sm text-slate-500">No one assigned yet.</li>}
        </ul>
        {can.can_manage && users.filter((u) => u.is_active && !team.some((m) => m.principal_type === "org_user" && m.principal_id === u.id)).length > 0 && (
          <select aria-label="Add a person" className="input mt-3" value="" onChange={(ev) => ev.target.value && void add(Number(ev.target.value))}>
            <option value="">Add a person as auditee…</option>
            {users.filter((u) => u.is_active && !team.some((m) => m.principal_type === "org_user" && m.principal_id === u.id)).map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
        )}
      </Card>

      {intel && intel.controls_at_risk.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader title="This audit against the wider programme" subtitle="Controls in this audit that also have findings from risk, VAPT or other audits." />
          <ul className="mt-2 divide-y divide-phantix-700/40">
            {intel.controls_at_risk.slice(0, 8).map((c) => (
              <li key={`${c.framework_id}:${c.control_id}`} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-[12rem] flex-1 font-mono text-sm text-slate-200">{c.framework_id} · {c.control_id}</span>
                <SourceChips sources={c.sources} correlated={c.correlated} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ── Scope ────────────────────────────────────────────────────────────────────

function Scope({ id }: { id: number }) {
  const { data: items, setData, reload } = useResource(() => loadScope(id), [] as ScopeItem[], `assurance-${id}-scope`);
  const { toast, requireDualControl } = useStore();
  const [draft, setDraft] = useState<{ item_type: ScopeItemType; ref: string; description: string; in_scope: boolean; rationale: string } | null>(null);
  const can = useCan();
  const { data: suggestions, reload: reloadSuggestions } = useResource(() => loadScopeSuggestions(id).catch(() => null), null, `assurance-${id}-scope-suggest`);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<ScopeItemInput[]>([]);
  const [adding, setAdding] = useState(false);
  React.useEffect(() => { setPicked(defaultSelection(suggestions)); }, [suggestions]);
  const toAdd = chosenScope(suggestions, picked, custom);

  const addChosen = async () => {
    if (!toAdd.length || !(await guard())) return;
    setAdding(true);
    try {
      await addScopeItems(id, toAdd);
      toast("success", `${toAdd.length} item${toAdd.length === 1 ? "" : "s"} added to scope`);
      setCustom([]);
      reload();
      reloadSuggestions();
    } catch (ex) { toast("error", "Couldn't add them", errMsg(ex, "")); } finally { setAdding(false); }
  };

  const guard = () => requireDualControl("Changing an audit's scope is a recorded change.");
  const toggle = async (s: ScopeItem) => {
    if (!(await guard())) return;
    try {
      const next = await updateScopeItem(id, s.id, { in_scope: !s.in_scope });
      setData(items.map((x) => (x.id === s.id ? { ...x, ...next } : x)));
    } catch (ex) { toast("error", "Couldn't update scope", errMsg(ex, "")); }
  };
  const remove = async (s: ScopeItem) => {
    if (!(await guard())) return;
    try { await removeScopeItem(id, s.id); setData(items.filter((x) => x.id !== s.id)); } catch (ex) { toast("error", "Couldn't remove it", errMsg(ex, "")); }
  };
  const save = async () => {
    if (!draft || !(draft.description.trim() || draft.ref.trim())) return;
    if (!(await guard())) return;
    try {
      await addScopeItem(id, { item_type: draft.item_type, ref: draft.ref.trim() || null, description: draft.description.trim() || null, in_scope: draft.in_scope, rationale: draft.rationale.trim() || null });
      setDraft(null);
      reload();
    } catch (ex) { toast("error", "Couldn't add it", errMsg(ex, "")); }
  };

  return (
    <div className="space-y-4">
    {can.can_manage && suggestions && (suggestions.total > 0 || items.length === 0) && (
      <Card>
        <CardHeader title="Suggested for this audit" subtitle="From your asset inventory, connected evidence sources, business profile and what this programme audits." />
        <div className="mt-3">
          <ScopePicker suggestions={suggestions} selected={picked} custom={custom} onCustom={setCustom}
            onToggle={(keys, on) => setPicked((cur) => { const next = new Set(cur); keys.forEach((k) => (on ? next.add(k) : next.delete(k))); return next; })} />
        </div>
        <button className="btn-primary mt-4" disabled={!toAdd.length || adding} onClick={() => void addChosen()}>
          <Plus size={14} /> {adding ? "Adding..." : toAdd.length ? `Add ${toAdd.length} to scope` : "Add to scope"}
        </button>
      </Card>
    )}
    <Card>
      <CardHeader title="What's being audited" action={can.can_manage ? <button className="btn-secondary !py-1.5 text-xs" onClick={() => setDraft({ item_type: "system", ref: "", description: "", in_scope: true, rationale: "" })}><Plus size={13} /> Add item</button> : undefined} />
      {items.length === 0 && !draft && <p className="mt-3 text-sm text-slate-500">Nothing in scope yet.</p>}
      <ul className="mt-3 divide-y divide-phantix-700/40">
        {items.map((s) => (
          <li key={s.id} className={cx("flex flex-wrap items-center gap-3 py-2.5", !s.in_scope && "opacity-70")}>
            <span className="rounded bg-phantix-800 px-2 py-0.5 text-xs text-slate-300">{SCOPE_TYPE_LABEL[s.item_type] ?? s.item_type}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-200">{s.description || s.ref}{s.ref && s.description ? <span className="ml-2 font-mono text-xs text-slate-500">{s.ref}</span> : null}</p>
              {s.rationale && <p className="text-xs text-slate-500">{s.rationale}</p>}
            </div>
            {can.can_manage ? (
              <>
                <label className="flex items-center gap-1.5 text-xs text-slate-300">
                  <input type="checkbox" checked={s.in_scope} onChange={() => void toggle(s)} /> In scope
                </label>
                <button aria-label="Remove" className="rounded p-1.5 text-slate-500 hover:text-severity-critical" onClick={() => void remove(s)}><Trash2 size={14} /></button>
              </>
            ) : (
              <span className={cx("text-xs", s.in_scope ? "text-emerald-400" : "text-slate-500")}>{s.in_scope ? "In scope" : "Out of scope"}</span>
            )}
          </li>
        ))}
      </ul>
      {draft && (
        <div className="mt-3 grid grid-cols-1 gap-2 rounded-md border border-phantix-700 p-3 sm:grid-cols-[150px_1fr_1fr]">
          <select aria-label="Type" className="input" value={draft.item_type} onChange={(ev) => setDraft({ ...draft, item_type: ev.target.value as ScopeItemType })}>
            {(Object.keys(SCOPE_TYPE_LABEL) as ScopeItemType[]).map((t) => <option key={t} value={t}>{SCOPE_TYPE_LABEL[t]}</option>)}
          </select>
          <input aria-label="What it is" className="input" placeholder={SCOPE_HINT[draft.item_type].description} value={draft.description} onChange={(ev) => setDraft({ ...draft, description: ev.target.value })} />
          <input aria-label="Reference" className="input" placeholder={SCOPE_HINT[draft.item_type].ref} value={draft.ref} onChange={(ev) => setDraft({ ...draft, ref: ev.target.value })} />
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!draft.in_scope} onChange={(ev) => setDraft({ ...draft, in_scope: !ev.target.checked })} /> Leave out</label>
          <input aria-label="Why" className="input sm:col-span-2" placeholder={draft.in_scope ? "Why it's in scope (optional)" : "Why it's left out, e.g. retired in Q2"} value={draft.rationale} onChange={(ev) => setDraft({ ...draft, rationale: ev.target.value })} />
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn-primary !py-1.5 text-xs" onClick={() => void save()}>Add</button>
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}
    </Card>
    </div>
  );
}

// ── Evidence (PBC board) ─────────────────────────────────────────────────────

const BOARD: EvidenceRequestStatus[] = ["open", "submitted", "accepted", "rejected"];

function Evidence({ id }: { id: number }) {
  const { data: items, reload } = useResource(() => loadEvidenceRequests(id), [] as EvidenceRequest[], `assurance-${id}-pbc`);
  const { toast, requireDualControl } = useStore();
  const can = useCan();
  // One call for the titles of every attached evidence row on the board.
  const idKey = items.flatMap((r) => r.evidence_ids).join(",");
  const { data: evidence } = useResource(() => loadEvidence(idKey ? idKey.split(",") : []), [], `assurance-${id}-ev-${idKey}`);
  const titleOf = (x: number | string) => evidence.find((ev) => Number(ev.id) === Number(x));
  const [submitting, setSubmitting] = useState<EvidenceRequest | null>(null);
  const [reviewing, setReviewing] = useState<EvidenceRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (rid: number, on: boolean) => setSelected((cur) => { const next = new Set(cur); if (on) next.add(rid); else next.delete(rid); return next; });

  const generate = async () => {
    if (!(await requireDualControl("Creating evidence requests is a recorded change."))) return;
    setBusy(true);
    try {
      const r = await generateEvidenceRequests(id);
      toast("success", r.created ? `${r.created} requests created` : "Nothing new to request", r.skipped ? `${r.skipped} controls already had a request.` : undefined);
      reload();
    } catch (ex) { toast("error", "Couldn't create requests", errMsg(ex, "")); } finally { setBusy(false); }
  };

  /** Accept or waive many requests behind one unlock. */
  const bulk = async (ids: number[], status: "accepted" | "waived") => {
    if (!ids.length) return;
    if (!(await requireDualControl(status === "accepted" ? "Accepting audit evidence is a recorded change." : "Waiving evidence requests is a recorded change."))) return;
    setBusy(true);
    try {
      const r = await bulkUpdateEvidenceRequests(id, ids, status, status === "waived" ? "Waived in bulk review." : null);
      toast("success", `${r.updated} request${r.updated === 1 ? "" : "s"} ${status === "accepted" ? "accepted" : "waived"}`, r.skipped ? `${r.skipped} had no evidence attached, so they were left open.` : undefined);
      setSelected(new Set());
      reload();
    } catch (ex) { toast("error", "Couldn't update the requests", errMsg(ex, "")); } finally { setBusy(false); }
  };

  const waived = items.filter((r) => r.status === "waived").length;
  const submittedIds = items.filter((r) => r.status === "submitted").map((r) => r.id);
  const chosen = items.filter((r) => selected.has(r.id));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="min-w-[12rem] flex-1 text-sm text-slate-400">One request per control. Evidence your connectors or earlier audits collected is attached for you. {waived ? `${waived} waived.` : ""}</p>
        {can.can_audit && submittedIds.length > 1 && (
          <button className="btn-primary !py-1.5 text-xs" disabled={busy} onClick={() => void bulk(submittedIds, "accepted")}><CheckCheck size={13} /> Accept all {submittedIds.length} submitted</button>
        )}
        {can.can_audit && items.length > 0 && <button className="btn-secondary !py-1.5 text-xs" disabled={busy} onClick={() => void generate()}><ListChecks size={13} /> Request any missing evidence</button>}
      </div>
      {chosen.length > 0 && can.can_audit && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-gold-400/30 bg-gold-400/5 px-3 py-2 text-sm">
          <span className="flex-1 text-slate-200">{chosen.length} selected</span>
          <button className="btn-primary !py-1 text-xs" disabled={busy || !chosen.some((r) => r.status === "submitted")} onClick={() => void bulk(chosen.filter((r) => r.status === "submitted").map((r) => r.id), "accepted")}>Accept</button>
          <button className="btn-secondary !py-1 text-xs" disabled={busy} onClick={() => void bulk(chosen.map((r) => r.id), "waived")}>Waive (not applicable)</button>
          <button className="btn-ghost !py-1 text-xs" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<ClipboardList size={20} />} title="No evidence requests yet" body="Prepare the audit to request evidence for every control and attach what your evidence library already holds." />
          <div className="mt-3 flex justify-center"><PrepareButton id={id} onDone={reload} label="Request evidence for every control" /></div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {BOARD.map((col) => {
            const cards = items.filter((r) => r.status === col);
            return (
              <section key={col} aria-label={REQUEST_STATUS_LABEL[col]} className="rounded-md border border-phantix-700/60 bg-phantix-950/40 p-2">
                <h3 className="mb-2 flex items-center justify-between px-1 text-[12px] font-semibold uppercase tracking-wider text-slate-400">
                  {REQUEST_STATUS_LABEL[col]} <span className="text-slate-600">{cards.length}</span>
                </h3>
                <ul className="space-y-2">
                  {cards.map((r) => {
                    const overdue = (r.status === "open" || r.status === "rejected") && isOverdue(r.due_at);
                    return (
                      <li key={r.id} className={cx("rounded-md border bg-phantix-900 p-3", selected.has(r.id) ? "border-gold-400/50" : "border-phantix-700")}>
                        <div className="flex items-start gap-2">
                          {can.can_audit && (r.status === "open" || r.status === "submitted" || r.status === "rejected") && (
                            <input type="checkbox" className="mt-1" aria-label="Select request" checked={selected.has(r.id)} onChange={(ev) => toggle(r.id, ev.target.checked)} />
                          )}
                          <p className="text-sm text-white">{r.request}</p>
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500">{r.framework_id} · {r.control_id}</p>
                        <p className={cx("mt-1 text-[12px]", overdue ? "font-semibold text-severity-critical" : "text-slate-500")}>
                          {r.owner_name ? `${r.owner_name} · ` : ""}{r.due_at ? `due ${fmtDate(r.due_at)}` : "no due date"}{overdue ? " · overdue" : ""}
                        </p>
                        {r.review_notes && <p className="mt-1.5 rounded bg-severity-critical/5 px-2 py-1 text-[12px] text-slate-300">{r.review_notes}</p>}
                        {r.evidence_ids.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {r.evidence_ids.map((x) => {
                              const ev = titleOf(x);
                              return (
                                <li key={String(x)} className="truncate text-[11px] text-slate-400">
                                  {ev?.source_ref ? <a href={ev.source_ref} target="_blank" rel="noopener noreferrer" className="text-gold-400 hover:text-gold-300">{ev.title || `#${x}`}</a> : (ev?.title || `Evidence #${x}`)}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(r.status === "open" || r.status === "rejected") && <button className="btn-primary !px-2 !py-1 text-[11px]" onClick={() => setSubmitting(r)}>{r.status === "rejected" ? "Resubmit" : "Submit evidence"}</button>}
                          {r.status === "submitted" && can.can_audit && <button className="btn-secondary !px-2 !py-1 text-[11px]" onClick={() => setReviewing(r)}>Review</button>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <SubmitEvidenceModal id={id} request={submitting} onClose={() => setSubmitting(null)} onDone={() => { setSubmitting(null); reload(); }} />
      <ReviewEvidenceModal id={id} request={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); reload(); }} />
    </div>
  );
}


function SubmitEvidenceModal({ id, request, onClose, onDone }: { id: number; request: EvidenceRequest | null; onClose: () => void; onDone: () => void }) {
  const { requireDualControl } = useStore();
  const [f, setF] = useState({ title: "", evidence_type: "document" as EvidenceType, source_ref: "", description: "" });
  const [byIds, setByIds] = useState(false);
  const [ids, setIds] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const libKey = request ? `${request.framework_id}:${request.control_id}` : "";
  const { data: library, loading: libLoading } = useResource(
    () => (request ? loadEvidenceLibrary({ framework: request.framework_id, control_id: request.control_id }) : Promise.resolve([])),
    [], `assurance-lib-${libKey}`,
  );
  React.useEffect(() => {
    if (request) { setF({ title: request.request, evidence_type: "document", source_ref: "", description: "" }); setIds(new Set(request.evidence_ids.map(Number))); setByIds(false); setErr(null); }
  }, [request]);
  // Open on the library when it already holds evidence for this control.
  React.useEffect(() => { if (request && library.length) setByIds(true); }, [request, library.length]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!request) return;
    setErr(null);
    if (byIds) {
      if (!ids.size) return setErr("Tick at least one piece of evidence.");
    } else {
      if (f.title.trim().length < 2) return setErr("Give the evidence a title.");
      if (f.source_ref.trim() && !/^https?:\/\//i.test(f.source_ref.trim()) && f.source_ref.trim().length < 3) return setErr("Say where the evidence lives.");
    }
    if (!(await requireDualControl("Submitting audit evidence is a recorded change."))) return;
    setBusy(true);
    try {
      if (byIds) await updateEvidenceRequest(id, request.id, { status: "submitted", evidence_ids: Array.from(ids) });
      else await registerEvidence(id, request.id, { title: f.title.trim(), evidence_type: f.evidence_type, source_ref: f.source_ref.trim() || null, description: f.description.trim() || null });
      onDone();
    } catch (ex) { setErr(errMsg(ex, "Couldn't submit the evidence")); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!request} onClose={onClose} title={request?.request ?? ""}>
      {request && (
        <form onSubmit={submit} className="space-y-4">
          {request.instructions && <p className="text-sm text-slate-400">{request.instructions}</p>}
          {byIds ? (
            <fieldset>
              <legend className="label">Evidence already in your library for {request.control_id}</legend>
              {libLoading && <p className="text-sm text-slate-500">Loading…</p>}
              {!libLoading && library.length === 0 && <p className="text-sm text-slate-500">Nothing in the library for this control yet. Describe the evidence instead.</p>}
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {library.map((ev) => (
                  <li key={ev.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-phantix-800/40">
                      <input type="checkbox" className="mt-1" checked={ids.has(Number(ev.id))}
                        onChange={(e) => setIds((cur) => { const next = new Set(cur); if (e.target.checked) next.add(Number(ev.id)); else next.delete(Number(ev.id)); return next; })} />
                      <span className="min-w-0 text-sm text-slate-200">
                        {ev.title || `Evidence #${ev.id}`}
                        <span className="block text-xs text-slate-500">{[ev.source, ev.status, ev.collected_at ? fmtDate(ev.collected_at) : null].filter(Boolean).join(" · ")}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : (
            <>
              <div><label className="label" htmlFor="pbc-title">What it is</label>
                <input id="pbc-title" className="input" value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} /></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
                <div><label className="label" htmlFor="pbc-type">Type</label>
                  <select id="pbc-type" className="input" value={f.evidence_type} onChange={(ev) => setF({ ...f, evidence_type: ev.target.value as EvidenceType })}>
                    {(Object.keys(EVIDENCE_TYPE_LABEL) as EvidenceType[]).map((t) => <option key={t} value={t}>{EVIDENCE_TYPE_LABEL[t]}</option>)}
                  </select></div>
                <div><label className="label" htmlFor="pbc-ref">Where it lives</label>
                  <input id="pbc-ref" className="input" value={f.source_ref} onChange={(ev) => setF({ ...f, source_ref: ev.target.value })} placeholder="Link to the document, or the system and record" /></div>
              </div>
              <div><label className="label" htmlFor="pbc-desc">Note for the auditor</label>
                <textarea id="pbc-desc" rows={3} className="input" value={f.description} onChange={(ev) => setF({ ...f, description: ev.target.value })} placeholder="Anything that needs context." /></div>
              <p className="text-[12px] text-slate-500">SecureGraph keeps a reference to the evidence in your own security database, not the file itself.</p>
            </>
          )}
          <button type="button" className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setByIds(!byIds)}>
            {byIds ? "Describe new evidence instead" : "Attach evidence already in your library"}
          </button>
          <InlineError message={err} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Submitting..." : "Submit to auditor"}</button>
        </form>
      )}
    </Modal>
  );
}

function ReviewEvidenceModal({ id, request, onClose, onDone }: { id: number; request: EvidenceRequest | null; onClose: () => void; onDone: () => void }) {
  const { requireDualControl } = useStore();
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (request) { setNotes(""); setErr(null); } }, [request]);

  const decide = async (status: EvidenceRequestStatus) => {
    if (!request) return;
    if (status === "rejected" && !notes.trim()) return setErr("Say what's missing so they can fix it.");
    if (!(await requireDualControl("Reviewing audit evidence is a recorded change."))) return;
    setBusy(true);
    try {
      await updateEvidenceRequest(id, request.id, { status, review_notes: notes.trim() || null });
      onDone();
    } catch (ex) { setErr(errMsg(ex, "Couldn't save the review")); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!request} onClose={onClose} title="Review evidence">
      {request && (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">{request.request}</p>
          <p className="text-xs text-slate-500">Evidence: {request.evidence_ids.map((x) => `#${x}`).join(", ") || "none"}</p>
          <div>
            <label className="label" htmlFor="pbc-notes">Notes</label>
            <textarea id="pbc-notes" rows={3} className="input" value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="Required when sending it back." />
          </div>
          <InlineError message={err} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy} onClick={() => void decide("accepted")}>Accept</button>
            <button className="btn-secondary" disabled={busy} onClick={() => void decide("rejected")}>Send back</button>
            <button className="btn-ghost" disabled={busy} onClick={() => void decide("waived")}>Waive</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Controls (testing worklist) ──────────────────────────────────────────────

const RESULTS: TestResult[] = ["effective", "partially_effective", "ineffective", "not_tested", "na"];
const QUICK: { result: TestResult; label: string; cls: string }[] = [
  { result: "effective", label: "Effective", cls: "hover:border-emerald-400/50 hover:text-emerald-300" },
  { result: "partially_effective", label: "Partly", cls: "hover:border-gold-400/50 hover:text-gold-300" },
  { result: "ineffective", label: "Not effective", cls: "hover:border-severity-critical/50 hover:text-severity-critical" },
  { result: "na", label: "N/A", cls: "hover:border-phantix-500 hover:text-slate-200" },
];
const needsNote = (r: TestResult) => r === "ineffective" || r === "partially_effective";
const RISK_CLS: Record<string, string> = {
  critical: "text-severity-critical", high: "text-severity-high", medium: "text-gold-300", low: "text-slate-400",
};

type ControlFilter = "todo" | "suggested" | "judge" | "done" | "all";
const FILTER_LABEL: Record<ControlFilter, string> = { todo: "To do", suggested: "Suggested", judge: "Needs your judgement", done: "Done", all: "All" };

const testFrom = (c: EngagementControl, result: TestResult, note?: string): ControlTestInput => ({
  framework_id: c.framework_id, control_id: c.control_id,
  test_type: c.proposal?.test_type ?? "design",
  procedure: c.proposal?.procedure ?? null,
  sample_size: c.proposal?.sample_size ?? null,
  sample_ref: null,
  result,
  exception_notes: needsNote(result) ? (note?.trim() || c.proposal?.exception_notes || null) : null,
  evidence_ids: c.proposal?.evidence_ids ?? [],
});

function Controls({ e }: { e: EngagementSummary }) {
  const { data: view, reload } = useResource(() => loadControls(e.id), emptyControls(e.id), `assurance-${e.id}-controls`);
  const { data: tests, reload: reloadTests } = useResource(() => loadTests(e.id), [] as ControlTest[], `assurance-${e.id}-tests`);
  const { data: team } = useResource(() => loadTeam(e.id), [], `assurance-${e.id}-team`);
  const { toast, requireDualControl } = useStore();
  const me = useMe();
  const can = useCan();
  const [filter, setFilter] = useState<ControlFilter>("todo");
  const [busy, setBusy] = useState<string | null>(null);
  const [noting, setNoting] = useState<{ key: string; result: TestResult; text: string } | null>(null);
  const [recording, setRecording] = useState<EngagementControl | true | null>(null);
  const isAuditee = team.some((m) => m.role === "auditee" && !!m.principal_email && m.principal_email.toLowerCase() === me.email);
  const selfAssessed = (view.assurance_mode ?? e.assurance_mode) === "self_assessment";
  const canTest = can.can_audit && !isAuditee;

  const key = (c: EngagementControl) => `${c.framework_id}:${c.control_id}`;
  const todo = view.controls.filter((c) => !!c.proposal);
  const suggested = todo.filter((c) => c.proposal?.result);
  const shown = view.controls.filter((c) =>
    filter === "all" ? true : filter === "done" ? !c.proposal : filter === "suggested" ? !!c.proposal?.result : filter === "judge" ? !!c.proposal && !c.proposal.result : !!c.proposal);
  const refresh = () => { reload(); reloadTests(); };

  const record = async (batch: ControlTestInput[], label: string) => {
    if (!batch.length || !(await requireDualControl("Recording control tests is a recorded change."))) return;
    setBusy(label);
    try {
      const r = await bulkRecordTests(e.id, batch);
      toast("success", `${r.recorded} control${r.recorded === 1 ? "" : "s"} recorded`,
        r.findings_raised ? `${r.findings_raised} finding${r.findings_raised === 1 ? "" : "s"} raised with the details filled in. Review them on the Findings tab.` : undefined);
      setNoting(null);
      refresh();
    } catch (ex) { toast("error", "Couldn't record the results", errMsg(ex, "")); } finally { setBusy(null); }
  };

  const quick = (c: EngagementControl, result: TestResult) => {
    if (needsNote(result) && !c.proposal?.exception_notes) { setNoting({ key: key(c), result, text: "" }); return; }
    void record([testFrom(c, result)], key(c));
  };

  const signable = tests.filter((t) => !t.reviewed_by && !me.is(t.tested_by) && t.result !== "not_tested");
  const signAll = async () => {
    if (!signable.length || !(await requireDualControl("Reviewer sign-off is a recorded change."))) return;
    setBusy("sign");
    try {
      const r = await bulkSignOff(e.id, signable.map((t) => t.id));
      toast("success", `${r.signed} test${r.signed === 1 ? "" : "s"} signed off`, r.skipped_own ? `${r.skipped_own} you tested yourself need another reviewer.` : undefined);
      reloadTests();
    } catch (ex) { toast("error", "Couldn't sign off", errMsg(ex, "")); } finally { setBusy(null); }
  };
  const signOne = async (t: ControlTest) => {
    if (!(await requireDualControl("Reviewer sign-off is a recorded change."))) return;
    try {
      await updateTest(e.id, t.id, { reviewed_by: me.email || undefined });
      toast("success", "Test signed off");
      reloadTests();
    } catch (ex) { toast("error", "Couldn't sign off", errMsg(ex, "")); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-[14rem] flex-1">
            <p className="font-display text-lg text-white">{view.tested} of {view.total} controls tested</p>
            <p className="mt-0.5 text-sm text-slate-400">
              {suggested.length
                ? `${suggested.length} have a suggested result from your monitoring, connectors and findings. `
                : ""}
              {view.needs_judgement ? `${view.needs_judgement} need your judgement: pick a result on each row.` : todo.length ? "" : "Every control has a result."}
            </p>
          </div>
          {canTest && suggested.length > 0 && (
            <button className="btn-primary" disabled={!!busy} onClick={() => void record(suggested.map((c) => testFrom(c, c.proposal!.result!)), "all")}>
              <Sparkles size={14} /> {busy === "all" ? "Recording..." : `Accept ${suggested.length} suggested result${suggested.length === 1 ? "" : "s"}`}
            </button>
          )}
          {canTest && <button className="btn-secondary !py-2 text-xs" onClick={() => setRecording(true)}><FlaskConical size={13} /> Detailed test</button>}
        </div>
        {isAuditee && <p className="mt-3 text-xs text-slate-500">You're an auditee on this audit, so recording results is left to the auditors.</p>}
        {canTest && suggested.length > 0 && <p className="mt-3 text-xs text-slate-500">Controls that aren't effective get a finding with the condition, criteria, effect and recommendation filled in.</p>}
      </Card>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter controls">
        {(Object.keys(FILTER_LABEL) as ControlFilter[]).map((f) => {
          const n = f === "all" ? view.total : f === "done" ? view.tested : f === "suggested" ? suggested.length : f === "judge" ? view.needs_judgement : todo.length;
          return (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              className={cx("rounded-full border px-3 py-1 text-xs", filter === f ? "border-gold-400/50 bg-gold-400/10 text-gold-300" : "border-phantix-700 text-slate-400 hover:text-slate-200")}>
              {FILTER_LABEL[f]} <span className="text-slate-500">{n}</span>
            </button>
          );
        })}
      </div>

      {view.total === 0 ? (
        <Card><EmptyState icon={<FlaskConical size={20} />} title="No controls" body="This audit has no criteria with controls. Check the programme on the Overview tab." /></Card>
      ) : shown.length === 0 ? (
        <Card><p className="text-sm text-slate-400">{filter === "todo" ? "Nothing left to test." : "No controls here."}</p></Card>
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-phantix-700/40">
            {shown.map((c) => {
              const k = key(c);
              const p = c.proposal;
              return (
                <li key={k} className="px-4 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-[14rem] flex-1">
                      <p className="text-sm text-white">{c.title || c.control_id}</p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {c.framework_id} · {c.control_id}
                        {c.risk && <span className={cx("ml-2 font-sans capitalize", RISK_CLS[c.risk] ?? "text-slate-400")}>{c.risk} risk</span>}
                        {c.request_status && <span className="ml-2 font-sans text-slate-500">· evidence {REQUEST_STATUS_LABEL[c.request_status].toLowerCase()}</span>}
                      </p>
                      {p && p.basis.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {p.basis.slice(0, 3).map((b) => <li key={b} className="text-xs text-slate-400">· {b}</li>)}
                        </ul>
                      )}
                    </div>
                    {!p && c.result && (
                      <span className="flex items-center gap-2 text-xs text-slate-500"><ResultChip result={c.result} />{c.tested_by}</span>
                    )}
                    {p && (
                      <div className="flex flex-col items-end gap-1.5">
                        {p.result ? (
                          <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><Sparkles size={11} className="text-gold-400" /> Suggested <ResultChip result={p.result} /></span>
                        ) : (
                          <span className="text-[11px] text-slate-500">No automated signal: your call</span>
                        )}
                        {canTest && (
                          <div className="flex flex-wrap justify-end gap-1">
                            {QUICK.map((q) => (
                              <button key={q.result} disabled={!!busy}
                                className={cx("rounded-md border px-2 py-1 text-[11px] text-slate-300 transition-colors disabled:opacity-40", p.result === q.result ? "border-gold-400/50 bg-gold-400/10 text-gold-200" : "border-phantix-700", q.cls)}
                                onClick={() => quick(c, q.result)}>
                                {busy === k ? "…" : q.label}
                              </button>
                            ))}
                            <button className="rounded-md px-1.5 py-1 text-[11px] text-slate-500 hover:text-slate-200" onClick={() => setRecording(c)}>More</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {noting?.key === k && (
                    <form className="mt-2 flex flex-wrap gap-2" onSubmit={(ev) => { ev.preventDefault(); if (noting.text.trim()) void record([testFrom(c, noting.result, noting.text)], k); }}>
                      <input autoFocus aria-label="What's wrong" className="input min-w-[16rem] flex-1 !py-1.5 text-sm" placeholder="What's wrong, e.g. no access review since March"
                        value={noting.text} onChange={(ev) => setNoting({ ...noting, text: ev.target.value })} />
                      <button className="btn-primary !py-1.5 text-xs" disabled={!noting.text.trim() || !!busy}>Save {RESULT_LABEL[noting.result].toLowerCase()}</button>
                      <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setNoting(null)}>Cancel</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {tests.length > 0 && (
        <Card className="!p-0">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <h3 className="flex-1 text-sm font-semibold text-white">Recorded tests <span className="font-normal text-slate-500">{tests.length}</span></h3>
            {!selfAssessed && can.can_audit && signable.length > 0 && (
              <button className="btn-secondary !py-1.5 text-xs" disabled={!!busy} onClick={() => void signAll()}><CheckCheck size={13} /> Sign off {signable.length} I didn't test</button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-y border-phantix-700/50 text-left text-[12px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Control</th><th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Result</th><th className="px-4 py-2.5 font-medium">Tester</th>
                  {!selfAssessed && <th className="px-4 py-2.5 font-medium">Reviewer</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-phantix-700/40">
                {tests.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-200">{t.framework_id} · {t.control_id}</span>
                      {t.exception_notes && <span className="mt-0.5 block max-w-md text-xs text-severity-critical">{t.exception_notes}</span>}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-300">{t.test_type}</td>
                    <td className="px-4 py-3"><ResultChip result={t.result} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400">{t.tested_by || "Unknown"}<span className="block text-slate-600">{fmtDate(t.tested_at)}</span></td>
                    {!selfAssessed && (
                      <td className="px-4 py-3 text-xs">
                        {t.reviewed_by ? <span className="text-emerald-300">{t.reviewed_by}</span> : !can.can_audit ? <span className="text-slate-500">Awaiting review</span> : me.is(t.tested_by) ? (
                          <span className="text-slate-500" title="You tested this control, so someone else reviews it.">Needs another reviewer</span>
                        ) : (
                          <button className="text-gold-400 hover:text-gold-300" onClick={() => void signOne(t)}>Sign off</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <RecordTestModal e={e} controls={view.controls} initial={recording === true ? null : recording} open={recording !== null}
        onClose={() => setRecording(null)} onDone={() => { setRecording(null); refresh(); }} />
    </div>
  );
}

function RecordTestModal({ e, controls, initial, open, onClose, onDone }: {
  e: EngagementSummary; controls: EngagementControl[]; initial: EngagementControl | null; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const { requireDualControl } = useStore();
  const [ctl, setCtl] = useState("");
  const [f, setF] = useState({ test_type: "design" as "design" | "operating", procedure: "", sample_size: "", sample_ref: "", result: "effective" as TestResult, exception_notes: "" });
  const [evidence, setEvidence] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = controls.find((c) => `${c.framework_id}:${c.control_id}` === ctl) ?? null;
  const { data: library } = useResource(
    () => (chosen ? loadEvidenceLibrary({ framework: chosen.framework_id, control_id: chosen.control_id }) : Promise.resolve([])),
    [], `assurance-lib-${ctl}`,
  );

  // Prefill from the control's proposal so a detailed test starts from what SecureGraph knows.
  const pick = (c: EngagementControl | null) => {
    setCtl(c ? `${c.framework_id}:${c.control_id}` : "");
    const p = c?.proposal;
    setF({
      test_type: p?.test_type ?? "design", procedure: p?.procedure ?? "", sample_size: p?.sample_size != null ? String(p.sample_size) : "",
      sample_ref: "", result: p?.result ?? "effective", exception_notes: p?.exception_notes ?? "",
    });
    setEvidence(new Set(p?.evidence_ids ?? []));
  };
  React.useEffect(() => { if (open) { pick(initial ?? controls.find((c) => !!c.proposal) ?? null); setErr(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, initial]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!chosen) return setErr("Choose the control you tested.");
    if (needsNote(f.result) && !f.exception_notes.trim()) return setErr("Describe the exception you found.");
    if (!(await requireDualControl("Recording a control test is a recorded change."))) return;
    setBusy(true);
    try {
      await bulkRecordTests(e.id, [{
        framework_id: chosen.framework_id, control_id: chosen.control_id, test_type: f.test_type, procedure: f.procedure.trim() || null,
        sample_size: f.sample_size ? Number(f.sample_size) : null, sample_ref: f.sample_ref.trim() || null, result: f.result,
        exception_notes: f.exception_notes.trim() || null, evidence_ids: Array.from(evidence),
      }]);
      onDone();
    } catch (ex) { setErr(errMsg(ex, "Couldn't record the test")); } finally { setBusy(false); }
  };

  const frameworks = Array.from(new Set(controls.map((c) => c.framework_id)));
  return (
    <Modal open={open} onClose={onClose} title="Record a control test" wide>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label" htmlFor="rt-ctl">Control</label>
          <select id="rt-ctl" className="input" value={ctl} onChange={(ev) => pick(controls.find((c) => `${c.framework_id}:${c.control_id}` === ev.target.value) ?? null)}>
            <option value="">Choose a control…</option>
            {frameworks.map((fw) => (
              <optgroup key={fw} label={fw}>
                {controls.filter((c) => c.framework_id === fw).map((c) => (
                  <option key={c.control_id} value={`${c.framework_id}:${c.control_id}`}>{c.control_id} · {c.title}{c.result ? ` (${RESULT_LABEL[c.result]})` : ""}</option>
                ))}
              </optgroup>
            ))}
          </select></div>
        <div><label className="label" htmlFor="rt-type">Test type</label>
          <select id="rt-type" className="input" value={f.test_type} onChange={(ev) => setF({ ...f, test_type: ev.target.value as "design" | "operating" })}><option value="design">Design: is it built right?</option><option value="operating">Operating: did it work over the period?</option></select></div>
        <div><label className="label" htmlFor="rt-res">Result</label>
          <select id="rt-res" className="input" value={f.result} onChange={(ev) => setF({ ...f, result: ev.target.value as TestResult })}>{RESULTS.map((r) => <option key={r} value={r}>{RESULT_LABEL[r]}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="rt-proc">Procedure</label><textarea id="rt-proc" rows={2} className="input" value={f.procedure} onChange={(ev) => setF({ ...f, procedure: ev.target.value })} placeholder="What you inspected, sampled or re-performed." /></div>
        <div><label className="label" htmlFor="rt-ss">Sample size</label><input id="rt-ss" type="number" min={0} className="input" value={f.sample_size} onChange={(ev) => setF({ ...f, sample_size: ev.target.value })} /></div>
        <div><label className="label" htmlFor="rt-sr">Sample reference</label><input id="rt-sr" className="input" value={f.sample_ref} onChange={(ev) => setF({ ...f, sample_ref: ev.target.value })} placeholder="e.g. Q2 access review export" /></div>
        {needsNote(f.result) && (
          <div className="sm:col-span-2"><label className="label" htmlFor="rt-ex">What's wrong</label><textarea id="rt-ex" rows={2} className="input" value={f.exception_notes} onChange={(ev) => setF({ ...f, exception_notes: ev.target.value })} placeholder="e.g. 3 of 10 leavers still had access after 30 days." /></div>
        )}
        {library.length > 0 && (
          <fieldset className="sm:col-span-2">
            <legend className="label">Evidence</legend>
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {library.map((ev) => (
                <li key={ev.id}>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={evidence.has(Number(ev.id))} onChange={(x) => setEvidence((cur) => { const next = new Set(cur); if (x.target.checked) next.add(Number(ev.id)); else next.delete(Number(ev.id)); return next; })} />
                    {ev.title || `Evidence #${ev.id}`}<span className="text-xs text-slate-500">{ev.source ? ` · ${ev.source}` : ""}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <div className="sm:col-span-2 space-y-3">
          <p className="text-xs text-slate-500">If the control isn't effective, a finding is raised with the details filled in.</p>
          <InlineError message={err} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving..." : "Record test"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Findings ─────────────────────────────────────────────────────────────────

const SEVERITIES: FindingSeverity[] = ["critical", "high", "medium", "low"];

function Findings({ e }: { e: EngagementSummary }) {
  const { data: findings, reload } = useResource(() => loadFindings(e.id), [] as AuditFinding[], `assurance-${e.id}-findings`);
  const [params] = useSearchParams();
  const can = useCan();
  const [open, setOpen] = useState<number | null>(() => Number(params.get("finding")) || null);
  const [responding, setResponding] = useState<AuditFinding | null>(null);
  const [retesting, setRetesting] = useState<AuditFinding | null>(null);
  const [raising, setRaising] = useState(false);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="min-w-[12rem] flex-1 text-sm text-slate-400">Audit findings also appear in the risk register and the findings tracker.</p>
        {can.can_audit && <button className="btn-secondary !py-1.5 text-xs" onClick={() => setRaising(true)}><Plus size={13} /> Raise finding</button>}
      </div>
      {findings.length === 0 ? (
        <Card><EmptyState icon={<ShieldAlert size={20} />} title="No findings" body="When a test finds an exception, raise it here with a recommendation." /></Card>
      ) : SEVERITIES.map((sev) => {
        const group = findings.filter((f) => f.severity === sev);
        if (!group.length) return null;
        return (
          <section key={sev} className="mb-4" aria-label={`${sev} findings`}>
            <h3 className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-slate-500"><SeverityBadge severity={sev} /> {group.length}</h3>
            <ul className="space-y-2">
              {group.map((f) => (
                <li key={f.id}>
                  <Card>
                    <button className="flex w-full items-start gap-3 text-left" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white">{f.title}</p>
                        <p className="font-mono text-[12px] text-slate-500">{f.framework_id ?? "—"} · {f.control_id ?? "—"}{f.significance ? ` · ${SIGNIFICANCE_LABEL[f.significance]}` : ""}</p>
                      </div>
                      <span className="text-xs text-slate-400">{FINDING_STATUS_LABEL[f.status]}</span>
                      <ChevronDown size={15} className={cx("mt-0.5 text-slate-500 transition-transform", open === f.id && "rotate-180")} />
                    </button>
                    {open === f.id && (
                      <div className="mt-3 border-t border-phantix-700/40 pt-3">
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                          {([["Condition", f.condition], ["Criteria", f.criteria], ["Cause", f.cause], ["Effect", f.effect], ["Recommendation", f.recommendation]] as const).map(([k, v]) => v ? (
                            <div key={k}><dt className="text-[12px] text-slate-500">{k}</dt><dd className="text-slate-300">{v}</dd></div>
                          ) : null)}
                        </dl>
                        <div className="mt-3 rounded-md border border-phantix-700/50 bg-phantix-950/40 px-3.5 py-2.5 text-sm">
                          <p className="text-[12px] text-slate-500">Management response{f.owner_name ? ` · ${f.owner_name}` : ""}{f.due_at ? ` · by ${fmtDate(f.due_at)}` : ""}</p>
                          <p className="mt-0.5 text-slate-300">{f.management_response || "No response yet."}</p>
                        </div>
                        {f.status !== "closed" && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button className="btn-secondary !py-1 text-xs" onClick={() => setResponding(f)}><MessageSquare size={12} /> {f.management_response ? "Update response" : "Respond"}</button>
                            {can.can_audit && <button className="btn-secondary !py-1 text-xs" onClick={() => setRetesting(f)}><RefreshCw size={12} /> Retest</button>}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <RespondModal id={e.id} finding={responding} onClose={() => setResponding(null)} onDone={() => { setResponding(null); reload(); }} />
      <RetestModal id={e.id} finding={retesting} onClose={() => setRetesting(null)} onDone={() => { setRetesting(null); reload(); }} />
      <RaiseFindingModal e={e} open={raising} onClose={() => setRaising(false)} onDone={() => { setRaising(false); reload(); }} />
    </div>
  );
}

function RespondModal({ id, finding, onClose, onDone }: { id: number; finding: AuditFinding | null; onClose: () => void; onDone: () => void }) {
  const { requireDualControl } = useStore();
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [accept, setAccept] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => {
    if (finding) { setText(finding.management_response ?? ""); setOwner(finding.owner_name ?? ""); setDue(finding.due_at ? finding.due_at.slice(0, 10) : ""); setAccept(false); setErr(null); }
  }, [finding]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!finding || !text.trim()) return;
    if (!(await requireDualControl("Responding to an audit finding is a recorded change."))) return;
    setBusy(true);
    try {
      await updateFinding(id, finding.id, {
        management_response: text.trim(), owner_name: owner.trim() || null, due_at: due ? new Date(due).toISOString() : null,
        ...(accept ? { status: "accepted_risk" as const } : finding.status === "open" ? { status: "in_remediation" as const } : {}),
      });
      onDone();
    } catch (ex) { setErr(errMsg(ex, "Couldn't save the response")); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!finding} onClose={onClose} title="Management response">
      {finding && (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-400">{finding.title}</p>
          <div><label className="label" htmlFor="fr-text">Response</label>
            <textarea id="fr-text" rows={4} className="input" value={text} onChange={(ev) => setText(ev.target.value)} placeholder="What you'll do and by when, or why you accept the risk." /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="fr-owner">Owner</label><input id="fr-owner" className="input" value={owner} onChange={(ev) => setOwner(ev.target.value)} /></div>
            <div><label className="label" htmlFor="fr-due">Fix by</label><input id="fr-due" type="date" className="input" value={due} onChange={(ev) => setDue(ev.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={accept} onChange={(ev) => setAccept(ev.target.checked)} /> We accept this risk instead of fixing it</label>
          <InlineError message={err} />
          <button className="btn-primary w-full" disabled={busy || !text.trim()}>{busy ? "Saving..." : "Save response"}</button>
        </form>
      )}
    </Modal>
  );
}

function RetestModal({ id, finding, onClose, onDone }: { id: number; finding: AuditFinding | null; onClose: () => void; onDone: () => void }) {
  const { toast, requireDualControl } = useStore();
  const [f, setF] = useState({ test_type: "operating" as "design" | "operating", procedure: "", sample_size: "", result: "effective" as TestResult, exception_notes: "", close: true });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (finding) { setF({ test_type: "operating", procedure: "", sample_size: "", result: "effective", exception_notes: "", close: true }); setErr(null); } }, [finding]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!finding) return;
    if (!(await requireDualControl("Retesting a finding is a recorded change."))) return;
    setBusy(true);
    try {
      const next = await retestFinding(id, finding.id, {
        test_type: f.test_type, procedure: f.procedure.trim() || null, sample_size: f.sample_size ? Number(f.sample_size) : null,
        result: f.result, exception_notes: f.exception_notes.trim() || null, close: f.close,
      });
      toast("success", next.status === "closed" ? "Finding closed" : "Retest recorded");
      onDone();
    } catch (ex) { setErr(errMsg(ex, "Couldn't record the retest")); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!finding} onClose={onClose} title="Retest">
      {finding && (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-slate-400">{finding.title} · <span className="font-mono">{finding.control_id}</span></p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="rs-type">Test type</label>
              <select id="rs-type" className="input" value={f.test_type} onChange={(ev) => setF({ ...f, test_type: ev.target.value as "design" | "operating" })}><option value="operating">Operating</option><option value="design">Design</option></select></div>
            <div><label className="label" htmlFor="rs-res">Result</label>
              <select id="rs-res" className="input" value={f.result} onChange={(ev) => setF({ ...f, result: ev.target.value as TestResult })}>{RESULTS.map((r) => <option key={r} value={r}>{RESULT_LABEL[r]}</option>)}</select></div>
          </div>
          <div><label className="label" htmlFor="rs-proc">Procedure</label><textarea id="rs-proc" rows={2} className="input" value={f.procedure} onChange={(ev) => setF({ ...f, procedure: ev.target.value })} /></div>
          <div><label className="label" htmlFor="rs-ss">Sample size</label><input id="rs-ss" type="number" min={0} className="input" value={f.sample_size} onChange={(ev) => setF({ ...f, sample_size: ev.target.value })} /></div>
          {f.result !== "effective" && <div><label className="label" htmlFor="rs-ex">Exceptions</label><textarea id="rs-ex" rows={2} className="input" value={f.exception_notes} onChange={(ev) => setF({ ...f, exception_notes: ev.target.value })} /></div>}
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={f.close} onChange={(ev) => setF({ ...f, close: ev.target.checked })} /> Close the finding if the retest is effective</label>
          <InlineError message={err} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving..." : "Record retest"}</button>
        </form>
      )}
    </Modal>
  );
}

function RaiseFindingModal({ e, open, onClose, onDone }: { e: EngagementSummary; open: boolean; onClose: () => void; onDone: () => void }) {
  const { requireDualControl } = useStore();
  const blank = { title: "", framework_id: e.criteria[0] ?? "", control_id: "", condition: "", criteria: "", cause: "", effect: "", severity: "medium" as FindingSeverity, significance: "deficiency" as FindingSignificance, recommendation: "" };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: view } = useResource(() => loadControls(e.id), emptyControls(e.id), `assurance-${e.id}-controls`);
  React.useEffect(() => { if (open) { setF(blank); setErr(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  const pickControl = (value: string) => {
    const c = view.controls.find((x) => `${x.framework_id}:${x.control_id}` === value);
    if (!c) return setF({ ...f, control_id: "" });
    setF({
      ...f, framework_id: c.framework_id, control_id: c.control_id,
      title: f.title || `${c.title ?? c.control_id} is not effective`,
      criteria: f.criteria || `${c.framework_id.toUpperCase()} ${c.control_id}: ${c.title ?? ""}`.trim(),
    });
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (f.title.trim().length < 4) return setErr("Give the finding a title of at least 4 characters.");
    if (!(await requireDualControl("Raising an audit finding is a recorded change."))) return;
    setBusy(true);
    try {
      await raiseFinding(e.id, {
        title: f.title.trim(), framework_id: f.framework_id || null, control_id: f.control_id.trim() || null, condition: f.condition.trim() || null,
        criteria: f.criteria.trim() || null, cause: f.cause.trim() || null, effect: f.effect.trim() || null, severity: f.severity,
        significance: f.significance, recommendation: f.recommendation.trim() || null,
      });
      onDone();
    } catch (ex) { setErr(errMsg(ex, "Couldn't raise the finding")); } finally { setBusy(false); }
  };

  const text = (key: "condition" | "criteria" | "cause" | "effect" | "recommendation", label: string, hint: string) => (
    <div className="sm:col-span-2"><label className="label" htmlFor={`rf-${key}`}>{label}</label>
      <textarea id={`rf-${key}`} rows={2} className="input" value={f[key]} onChange={(ev) => setF({ ...f, [key]: ev.target.value })} placeholder={hint} /></div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Raise a finding" wide>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label" htmlFor="rf-title">Title</label><input id="rf-title" className="input" value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="rf-ctl">Control</label>
          <select id="rf-ctl" className="input" value={f.control_id ? `${f.framework_id}:${f.control_id}` : ""} onChange={(ev) => pickControl(ev.target.value)}>
            <option value="">Not tied to one control</option>
            {Array.from(new Set(view.controls.map((c) => c.framework_id))).map((fw) => (
              <optgroup key={fw} label={fw}>
                {view.controls.filter((c) => c.framework_id === fw).map((c) => <option key={c.control_id} value={`${c.framework_id}:${c.control_id}`}>{c.control_id} · {c.title}</option>)}
              </optgroup>
            ))}
          </select></div>
        <div><label className="label" htmlFor="rf-sev">Severity</label>
          <select id="rf-sev" className="input" value={f.severity} onChange={(ev) => setF({ ...f, severity: ev.target.value as FindingSeverity })}>{SEVERITIES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}</select></div>
        <div><label className="label" htmlFor="rf-sig">Significance</label>
          <select id="rf-sig" className="input" value={f.significance} onChange={(ev) => setF({ ...f, significance: ev.target.value as FindingSignificance })}>{(Object.keys(SIGNIFICANCE_LABEL) as FindingSignificance[]).map((s) => <option key={s} value={s}>{SIGNIFICANCE_LABEL[s]}</option>)}</select></div>
        {text("condition", "Condition", "What you found")}
        {text("criteria", "Criteria", "The requirement it falls short of")}
        {text("cause", "Cause", "Why it happened")}
        {text("effect", "Effect", "Why it matters")}
        {text("recommendation", "Recommendation", "What to do about it")}
        <div className="sm:col-span-2 space-y-3"><InlineError message={err} /><button className="btn-primary w-full" disabled={busy}>{busy ? "Saving..." : "Raise finding"}</button></div>
      </form>
    </Modal>
  );
}

// ── Readiness ────────────────────────────────────────────────────────────────

function ReadinessTab({ id }: { id: number }) {
  const { data: r, loading, error, reload } = useResource(() => loadReadiness(id), null, `assurance-${id}-readiness`);
  if (loading && !r) return <PageSkeleton />;
  if (error && !r) return <ErrorState onRetry={reload} body="We couldn't load readiness. Try again." />;
  if (!r) return null;
  const fws = Object.entries(r.by_framework);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="flex flex-wrap items-center gap-6">
        <ReadinessRing score={r.readiness_score} size={120} />
        <div className="min-w-[200px] flex-1">
          <OpinionBadge opinion={r.opinion} withRule />
          <p className="mt-3 text-sm text-slate-400">{r.tested} of {r.controls_total} controls tested. Weighted by control risk.</p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Controls" />
        <div className="mt-3"><EffectivenessBar counts={{ effective: r.effective, partially_effective: r.partially_effective, ineffective: r.ineffective, not_tested: r.not_tested }} /></div>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title="By framework" />
        {fws.length === 0 ? <p className="mt-2 text-sm text-slate-500">Not scored yet.</p> : (
          <ul className="mt-3 space-y-3">
            {fws.map(([fid, v]) => (
              <li key={fid}>
                <div className="flex justify-between text-sm">
                  <span className="font-mono text-slate-300">{fid}<span className="ml-2 font-sans text-xs text-slate-500">{v.controls ?? 0} controls</span></span>
                  <span className="font-mono text-slate-200">{v.score == null ? "not enough tested" : `${Math.round(v.score)}%`}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-phantix-800">
                  {v.score != null && <div className={cx("h-full rounded-full", v.score >= 90 ? "bg-emerald-400" : v.score >= 70 ? "bg-gold-400" : "bg-severity-critical")} style={{ width: `${Math.min(100, v.score)}%` }} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ── Workpapers ───────────────────────────────────────────────────────────────

const NEXT_SIGN_OFF: Partial<Record<Workpaper["sign_off_status"], { to: Workpaper["sign_off_status"]; label: string; needsOther: boolean }>> = {
  draft: { to: "prepared", label: "Mark prepared", needsOther: false },
  prepared: { to: "reviewed", label: "Review", needsOther: true },
  reviewed: { to: "signed_off", label: "Sign off", needsOther: true },
};

function Workpapers({ id }: { id: number }) {
  const { data: papers, reload } = useResource(() => loadWorkpapers(id), [] as Workpaper[], `assurance-${id}-wp`);
  const { requireDualControl } = useStore();
  const me = useMe();
  const can = useCan();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [edit, setEdit] = useState<{ section: string; title: string; body: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = papers.find((p) => p.id === selectedId) ?? null;
  const sections = Array.from(new Set(papers.map((p) => p.section)));

  const save = async () => {
    if (!edit || edit.title.trim().length < 2) return setErr("Give the workpaper a title.");
    if (!(await requireDualControl("Saving a workpaper is a recorded change."))) return;
    setBusy(true); setErr(null);
    try {
      const saved = selected
        ? await updateWorkpaper(id, selected.id, { section: edit.section, title: edit.title.trim(), body: edit.body })
        : await createWorkpaper(id, { section: edit.section, title: edit.title.trim(), body: edit.body });
      setEdit(null); setSelectedId(saved.id); reload();
    } catch (ex) { setErr(errMsg(ex, "Couldn't save the workpaper")); } finally { setBusy(false); }
  };

  const advance = async (p: Workpaper) => {
    const step = NEXT_SIGN_OFF[p.sign_off_status];
    if (!step) return;
    if (!(await requireDualControl("Workpaper sign-off is a recorded change."))) return;
    setBusy(true); setErr(null);
    try { await updateWorkpaper(id, p.id, { sign_off_status: step.to }); reload(); }
    catch (ex) { setErr(errMsg(ex, "Couldn't change the sign-off")); } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="!p-0">
        <div className="flex items-center justify-between border-b border-phantix-700/40 px-4 py-3">
          <span className="text-sm font-semibold text-white">Workpapers</span>
          {can.can_audit && <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => { setSelectedId(null); setEdit({ section: "general", title: "", body: "" }); setErr(null); }}><Plus size={12} /> New</button>}
        </div>
        {papers.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">No workpapers yet.</p> : sections.map((s) => (
          <div key={s}>
            <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s}</p>
            <ul>
              {papers.filter((p) => p.section === s).map((p) => (
                <li key={p.id}>
                  <button className={cx("w-full px-4 py-2 text-left text-sm", selectedId === p.id ? "bg-phantix-800 text-white" : "text-slate-300 hover:bg-phantix-800/50")}
                    onClick={() => { setSelectedId(p.id); setEdit(null); setErr(null); }}>
                    {p.title}<span className="block text-[11px] text-slate-500">{SIGN_OFF_LABEL[p.sign_off_status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>

      <Card>
        {edit ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
              <div><label className="label" htmlFor="wp-sec">Section</label><input id="wp-sec" className="input" value={edit.section} onChange={(ev) => setEdit({ ...edit, section: ev.target.value })} /></div>
              <div><label className="label" htmlFor="wp-title">Title</label><input id="wp-title" className="input" value={edit.title} onChange={(ev) => setEdit({ ...edit, title: ev.target.value })} /></div>
            </div>
            <div><label className="label" htmlFor="wp-body">Body (Markdown)</label><textarea id="wp-body" rows={14} className="input font-mono text-xs" value={edit.body} onChange={(ev) => setEdit({ ...edit, body: ev.target.value })} /></div>
            <InlineError message={err} />
            <div className="flex gap-2"><button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving..." : "Save"}</button><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button></div>
          </div>
        ) : selected ? (
          <div>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-[12rem] flex-1">
                <h3 className="font-display text-lg font-semibold text-white">{selected.title}</h3>
                <p className="text-xs text-slate-500">
                  {SIGN_OFF_LABEL[selected.sign_off_status]}
                  {selected.prepared_by ? ` · prepared by ${selected.prepared_by}` : ""}{selected.reviewed_by ? ` · reviewed by ${selected.reviewed_by}` : ""}
                </p>
              </div>
              {can.can_audit && <button className="btn-ghost !py-1 text-xs" onClick={() => setEdit({ section: selected.section, title: selected.title, body: selected.body ?? "" })}><NotebookPen size={13} /> Edit</button>}
              {(() => {
                const step = NEXT_SIGN_OFF[selected.sign_off_status];
                if (!step || !can.can_audit) return null;
                const blocked = step.needsOther && me.is(selected.prepared_by);
                return (
                  <span title={blocked ? "You prepared this, so someone else reviews and signs it off." : undefined}>
                    <button className="btn-primary !py-1 text-xs" disabled={busy || blocked} onClick={() => void advance(selected)}>{step.label}</button>
                  </span>
                );
              })()}
            </div>
            {NEXT_SIGN_OFF[selected.sign_off_status]?.needsOther && me.is(selected.prepared_by) && (
              <p className="mt-2 text-xs text-slate-500">You prepared this workpaper, so a different person reviews and signs it off.</p>
            )}
            <InlineError message={err} />
            <div className="prose-sm mt-4 text-sm text-slate-300"><MarkdownView source={selected.body || "_Empty._"} /></div>
          </div>
        ) : (
          <EmptyState icon={<NotebookPen size={20} />} title="Pick a workpaper" body="Or start a new one. Each is prepared, then reviewed and signed off by someone else." />
        )}
      </Card>
    </div>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────

const REPORT_TYPES = Object.keys(REPORT_TYPE_LABEL) as ReportType[];

function ReportsTab({ id, onPublished }: { id: number; onPublished: () => void }) {
  const { data: reports, reload } = useResource(() => loadReports(id), [] as AuditReport[], `assurance-${id}-reports`);
  const { toast, requireDualControl } = useStore();
  const [type, setType] = useState<ReportType>("readiness");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const can = useCan();

  const generate = async () => {
    if (!(await requireDualControl("Publishing an audit report is a recorded change."))) return;
    setBusy(true); setErr(null);
    try {
      await generateReport(id, type, true);
      toast("success", `${REPORT_TYPE_LABEL[type]} published`);
      reload(); onPublished();
    } catch (ex) { setErr(errMsg(ex, "Couldn't generate the report")); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {can.can_audit && <Card className="flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="rp-type">Report</label>
          <select id="rp-type" className="input" value={type} onChange={(ev) => setType(ev.target.value as ReportType)}>{REPORT_TYPES.map((t) => <option key={t} value={t}>{REPORT_TYPE_LABEL[t]}</option>)}</select></div>
        <button className="btn-primary" disabled={busy} onClick={() => void generate()}><FileText size={14} /> {busy ? "Generating..." : "Generate and publish"}</button>
        <p className="w-full text-xs text-slate-500">Uses the current readiness score and opinion. Each new one is a new version.</p>
        <div className="w-full"><InlineError message={err} /></div>
      </Card>}
      <ReportList items={reports} />
    </div>
  );
}

export function ReportList({ items, showEngagement }: { items: AuditReport[]; showEngagement?: boolean }) {
  if (!items.length) {
    return <Card><EmptyState icon={<FileText size={20} />} title="No reports yet" body="Readiness reports, opinions and attestations appear here once published." /></Card>;
  }
  return (
    <Card className="!p-0">
      <ul className="divide-y divide-phantix-700/40">
        {items.map((r) => {
          const cross = r.artifact_refs?.cross_audit as Record<string, unknown> | undefined | null;
          return (
            <li key={r.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <div className="min-w-[12rem] flex-1">
                <p className="font-medium text-white">{REPORT_TYPE_LABEL[r.report_type as ReportType] ?? r.report_type} <span className="text-xs font-normal text-slate-500">v{r.version}</span></p>
                {showEngagement && r.engagement_title && <Link to={`/assurance/${r.engagement_id}?tab=reports`} className="text-xs text-gold-400 hover:text-gold-300">{r.engagement_title}</Link>}
                {r.executive_summary && <p className="mt-1.5 text-sm text-slate-400">{r.executive_summary}</p>}
                {cross && Object.keys(cross).length > 0 && (
                  <p className="mt-1.5 text-xs text-slate-500">Against the wider programme: {Object.entries(cross).filter(([, v]) => typeof v === "number" || typeof v === "string").map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(" · ")}</p>
                )}
                <p className="mt-1.5 text-xs text-slate-500">{r.published_at ? `Published ${fmtDate(r.published_at)}` : "Draft"}{r.published_by ? ` by ${r.published_by}` : ""}</p>
              </div>
              <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                <OpinionBadge opinion={r.opinion} />
                {r.readiness_score != null && <span className="font-mono text-sm text-slate-300">{Math.round(r.readiness_score)}%</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
