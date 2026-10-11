import React, { useCallback, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, ChevronDown, ClipboardList, ExternalLink, FileText, FlaskConical, ListChecks, MessageSquare, NotebookPen,
  Plus, RefreshCw, ShieldAlert, Trash2,
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
  createWorkpaper, raiseFinding, recordTest, removeScopeItem, removeTeamMember, retestFinding, updateEngagement,
  updateEvidenceRequest, updateFinding, updateScopeItem, updateTest, updateWorkpaper,
  EVIDENCE_TYPE_LABEL, loadEvidence, loadMe, registerEvidence, type AssuranceMe, type EvidenceType,
  type AuditFinding, type AuditReport, type ControlTest, type EngagementStatus, type EngagementSummary,
  type EvidenceRequest, type EvidenceRequestStatus, type FindingSeverity, type FindingSignificance, type ReportType,
  type ScopeItem, type ScopeItemType, type TestResult, type Workpaper,
} from "@sg/assurance";
import { loadOrgUsers } from "@sg/data";
import {
  EffectivenessBar, InlineError, OpinionBadge, ReadinessRing, ResultChip, SourceChips, StageStrip, errMsg, fmtDate, isOverdue,
} from "./parts";

const TABS = ["overview", "scope", "evidence", "testing", "findings", "readiness", "workpapers", "reports"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview", scope: "Scope", evidence: "Evidence", testing: "Testing", findings: "Findings",
  readiness: "Readiness", workpapers: "Workpapers", reports: "Reports",
};

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
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") || "") ? (params.get("tab") as Tab) : "overview";
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
        <AdvanceStatus e={e} onChanged={(next) => setData(next)} />
      </Card>

      <Tabs tabs={TABS.map((t) => ({ id: t, label: TAB_LABEL[t] }))} active={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === "overview" && <Overview e={e} />}
        {tab === "scope" && <Scope id={e.id} />}
        {tab === "evidence" && <Evidence id={e.id} />}
        {tab === "testing" && <Testing e={e} />}
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
          <input aria-label="Description" className="input" placeholder="Customer API" value={draft.description} onChange={(ev) => setDraft({ ...draft, description: ev.target.value })} />
          <input aria-label="Reference" className="input font-mono" placeholder="api.acme.com" value={draft.ref} onChange={(ev) => setDraft({ ...draft, ref: ev.target.value })} />
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={draft.in_scope} onChange={(ev) => setDraft({ ...draft, in_scope: ev.target.checked })} /> In scope</label>
          <input aria-label="Rationale" className="input sm:col-span-2" placeholder="Why" value={draft.rationale} onChange={(ev) => setDraft({ ...draft, rationale: ev.target.value })} />
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn-primary !py-1.5 text-xs" onClick={() => void save()}>Add</button>
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}
    </Card>
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

  const generate = async () => {
    if (!(await requireDualControl("Creating evidence requests is a recorded change."))) return;
    setBusy(true);
    try {
      const r = await generateEvidenceRequests(id);
      toast("success", r.created ? `${r.created} requests created` : "Nothing new to request", r.skipped ? `${r.skipped} controls already had a request.` : undefined);
      reload();
    } catch (ex) { toast("error", "Couldn't create requests", errMsg(ex, "")); } finally { setBusy(false); }
  };

  const waived = items.filter((r) => r.status === "waived").length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="min-w-[12rem] flex-1 text-sm text-slate-400">Evidence requested from the organization, one per control. {waived ? `${waived} waived.` : ""}</p>
        {can.can_audit && <button className="btn-secondary !py-1.5 text-xs" disabled={busy} onClick={() => void generate()}><ListChecks size={13} /> Generate from controls</button>}
      </div>
      {items.length === 0 ? (
        <Card><EmptyState icon={<ClipboardList size={20} />} title="No evidence requests yet" body="Generate one request per in-scope control, or wait for your auditor to send them." /></Card>
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
                      <li key={r.id} className="rounded-md border border-phantix-700 bg-phantix-900 p-3">
                        <p className="text-sm text-white">{r.request}</p>
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

const parseIds = (v: string) => v.split(/[\s,]+/).map((x) => Number(x.replace(/^#/, ""))).filter((n) => Number.isInteger(n) && n > 0);

function SubmitEvidenceModal({ id, request, onClose, onDone }: { id: number; request: EvidenceRequest | null; onClose: () => void; onDone: () => void }) {
  const { requireDualControl } = useStore();
  const [f, setF] = useState({ title: "", evidence_type: "document" as EvidenceType, source_ref: "", description: "" });
  const [byIds, setByIds] = useState(false);
  const [ids, setIds] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => {
    if (request) { setF({ title: request.request, evidence_type: "document", source_ref: "", description: "" }); setIds(request.evidence_ids.join(", ")); setByIds(false); setErr(null); }
  }, [request]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!request) return;
    setErr(null);
    if (byIds) {
      if (!parseIds(ids).length) return setErr("Add at least one evidence ID.");
    } else {
      if (f.title.trim().length < 2) return setErr("Give the evidence a title.");
      if (f.source_ref.trim() && !/^https?:\/\//i.test(f.source_ref.trim()) && f.source_ref.trim().length < 3) return setErr("Say where the evidence lives.");
    }
    if (!(await requireDualControl("Submitting audit evidence is a recorded change."))) return;
    setBusy(true);
    try {
      if (byIds) await updateEvidenceRequest(id, request.id, { status: "submitted", evidence_ids: parseIds(ids) });
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
            <div>
              <label className="label" htmlFor="pbc-ids">Evidence IDs from your evidence library</label>
              <input id="pbc-ids" className="input font-mono" value={ids} onChange={(ev) => setIds(ev.target.value)} placeholder="12, 15" />
            </div>
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

// ── Testing ──────────────────────────────────────────────────────────────────

const RESULTS: TestResult[] = ["effective", "partially_effective", "ineffective", "not_tested", "na"];

function Testing({ e }: { e: EngagementSummary }) {
  const { data: tests, reload } = useResource(() => loadTests(e.id), [] as ControlTest[], `assurance-${e.id}-tests`);
  const { data: team } = useResource(() => loadTeam(e.id), [], `assurance-${e.id}-team`);
  const { toast, requireDualControl } = useStore();
  const me = useMe();
  const can = useCan();
  const [recording, setRecording] = useState(false);
  const isAuditee = team.some((m) => m.role === "auditee" && !!m.principal_email && m.principal_email.toLowerCase() === me.email);

  const signOff = async (t: ControlTest) => {
    if (!(await requireDualControl("Reviewer sign-off is a recorded change."))) return;
    try {
      await updateTest(e.id, t.id, { reviewed_by: me.email || undefined });
      toast("success", "Test signed off");
      reload();
    } catch (ex) { toast("error", "Couldn't sign off", errMsg(ex, "")); }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="min-w-[12rem] flex-1 text-sm text-slate-400">Design tests check a control is built right; operating tests check it worked over the period.</p>
        {can.can_audit && (
          <span title={isAuditee ? "You're an auditee on this audit, so you can't test its controls." : undefined}>
            <button className="btn-primary !py-1.5 text-xs" disabled={isAuditee} onClick={() => setRecording(true)}><FlaskConical size={13} /> Record test</button>
          </span>
        )}
      </div>
      {isAuditee && <p className="mb-3 text-xs text-slate-500">You're an auditee on this audit, so recording tests is left to the auditors.</p>}
      {tests.length === 0 ? (
        <Card><EmptyState icon={<FlaskConical size={20} />} title="No tests yet" body="Until controls are tested, readiness stays inconclusive rather than 0%." /></Card>
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-phantix-700/50 text-left text-[12px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Control</th><th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Procedure</th><th className="px-4 py-2.5 font-medium">Sample</th>
                  <th className="px-4 py-2.5 font-medium">Result</th><th className="px-4 py-2.5 font-medium">Tester</th><th className="px-4 py-2.5 font-medium">Reviewer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-phantix-700/40">
                {tests.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">{t.framework_id} · {t.control_id}</td>
                    <td className="px-4 py-3 capitalize text-slate-300">{t.test_type}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-400">{t.procedure || "—"}{t.exception_notes && <span className="mt-0.5 block text-xs text-severity-critical">{t.exception_notes}</span>}</td>
                    <td className="px-4 py-3 text-slate-400">{t.sample_size ?? "—"}</td>
                    <td className="px-4 py-3"><ResultChip result={t.result} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400">{t.tested_by || "—"}<span className="block text-slate-600">{fmtDate(t.tested_at)}</span></td>
                    <td className="px-4 py-3 text-xs">
                      {t.reviewed_by ? <span className="text-emerald-300">{t.reviewed_by}</span> : !can.can_audit ? <span className="text-slate-500">Awaiting review</span> : me.is(t.tested_by) ? (
                        <span className="text-slate-500" title="You tested this control, so someone else reviews it.">Needs another reviewer</span>
                      ) : (
                        <button className="text-gold-400 hover:text-gold-300" onClick={() => void signOff(t)}>Sign off</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <RecordTestModal e={e} open={recording} onClose={() => setRecording(false)} onDone={() => { setRecording(false); reload(); }} />
    </div>
  );
}

function RecordTestModal({ e, open, onClose, onDone }: { e: EngagementSummary; open: boolean; onClose: () => void; onDone: () => void }) {
  const { requireDualControl } = useStore();
  const [f, setF] = useState({ framework_id: "", control_id: "", test_type: "design" as "design" | "operating", procedure: "", sample_size: "", sample_ref: "", result: "effective" as TestResult, exception_notes: "", evidence: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (open) { setF((x) => ({ ...x, framework_id: e.criteria[0] ?? "", control_id: "", procedure: "", sample_size: "", sample_ref: "", exception_notes: "", evidence: "" })); setErr(null); } }, [open, e.criteria]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!f.framework_id || !f.control_id.trim()) return setErr("Choose the framework and enter the control ID.");
    if ((f.result === "ineffective" || f.result === "partially_effective") && !f.exception_notes.trim()) return setErr("Describe the exception you found.");
    if (!(await requireDualControl("Recording a control test is a recorded change."))) return;
    setBusy(true);
    try {
      await recordTest(e.id, {
        framework_id: f.framework_id, control_id: f.control_id.trim(), test_type: f.test_type, procedure: f.procedure.trim() || null,
        sample_size: f.sample_size ? Number(f.sample_size) : null, sample_ref: f.sample_ref.trim() || null, result: f.result,
        exception_notes: f.exception_notes.trim() || null, evidence_ids: parseIds(f.evidence),
      });
      onDone();
    } catch (ex) { setErr(errMsg(ex, "Couldn't record the test")); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Record a control test" wide>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="rt-fw">Framework</label>
          <select id="rt-fw" className="input" value={f.framework_id} onChange={(ev) => setF({ ...f, framework_id: ev.target.value })}>{e.criteria.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div><label className="label" htmlFor="rt-ctl">Control ID</label><input id="rt-ctl" className="input font-mono" value={f.control_id} onChange={(ev) => setF({ ...f, control_id: ev.target.value })} /></div>
        <div><label className="label" htmlFor="rt-type">Test type</label>
          <select id="rt-type" className="input" value={f.test_type} onChange={(ev) => setF({ ...f, test_type: ev.target.value as "design" | "operating" })}><option value="design">Design</option><option value="operating">Operating</option></select></div>
        <div><label className="label" htmlFor="rt-res">Result</label>
          <select id="rt-res" className="input" value={f.result} onChange={(ev) => setF({ ...f, result: ev.target.value as TestResult })}>{RESULTS.map((r) => <option key={r} value={r}>{RESULT_LABEL[r]}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="rt-proc">Procedure</label><textarea id="rt-proc" rows={2} className="input" value={f.procedure} onChange={(ev) => setF({ ...f, procedure: ev.target.value })} placeholder="What you inspected, sampled or re-performed." /></div>
        <div><label className="label" htmlFor="rt-ss">Sample size</label><input id="rt-ss" type="number" min={0} className="input" value={f.sample_size} onChange={(ev) => setF({ ...f, sample_size: ev.target.value })} /></div>
        <div><label className="label" htmlFor="rt-sr">Sample reference</label><input id="rt-sr" className="input" value={f.sample_ref} onChange={(ev) => setF({ ...f, sample_ref: ev.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="rt-ex">Exceptions</label><textarea id="rt-ex" rows={2} className="input" value={f.exception_notes} onChange={(ev) => setF({ ...f, exception_notes: ev.target.value })} placeholder="Required when the control isn't fully effective." /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="rt-ev">Evidence IDs</label><input id="rt-ev" className="input font-mono" value={f.evidence} onChange={(ev) => setF({ ...f, evidence: ev.target.value })} placeholder="12, 15" /></div>
        <div className="sm:col-span-2 space-y-3">
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
  React.useEffect(() => { if (open) { setF(blank); setErr(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

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
        <div><label className="label" htmlFor="rf-fw">Framework</label>
          <select id="rf-fw" className="input" value={f.framework_id} onChange={(ev) => setF({ ...f, framework_id: ev.target.value })}>{e.criteria.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div><label className="label" htmlFor="rf-ctl">Control ID</label><input id="rf-ctl" className="input font-mono" value={f.control_id} onChange={(ev) => setF({ ...f, control_id: ev.target.value })} /></div>
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
