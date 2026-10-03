import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { Card, ErrorState, PageHeader, PageSkeleton } from "@sg/ui";
import { useResource } from "@sg/useResource";
import { useStore } from "@sg/store";
import { loadOrgUsers } from "@sg/data";
import { cx } from "@sg/utils";
import type { OrgUser } from "@sg/types";
import {
  AUDIT_TYPE_LABEL, AUDIT_TYPE_ORDER, ROLE_LABEL, SCOPE_TYPE_LABEL, createEngagement, loadPrograms,
  type AuditProgram, type AuditType, type ScopeItemInput, type ScopeItemType, type TeamMemberInput, type TeamRole,
} from "@sg/assurance";
import { InlineError, errMsg } from "./parts";

const STEPS = ["Programme", "Details", "Scope", "Team"] as const;
type Data = { all: AuditProgram[]; applicable: AuditProgram[]; users: OrgUser[] };
const empty: Data = { all: [], applicable: [], users: [] };

async function loadAll(): Promise<Data> {
  const [all, applicable, users] = await Promise.all([
    loadPrograms(false), loadPrograms(true).catch(() => []), loadOrgUsers().catch(() => []),
  ]);
  return { all, applicable, users };
}

/** Core → Assurance → New audit: programme → details → scope → team. */
export default function NewEngagement() {
  const { data, loading, error, reload } = useResource(loadAll, empty, "assurance-new");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast, requireDualControl } = useStore();

  const [step, setStep] = useState(0);
  const [onlyApplicable, setOnlyApplicable] = useState(true);
  const [program, setProgram] = useState<AuditProgram | null>(null);
  const [title, setTitle] = useState("");
  const [auditType, setAuditType] = useState<AuditType>("readiness");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState("");
  const [lead, setLead] = useState("");
  const [auditorOrg, setAuditorOrg] = useState("internal");
  const [summary, setSummary] = useState("");
  const [scope, setScope] = useState<ScopeItemInput[]>([]);
  const [team, setTeam] = useState<TeamMemberInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const framework = params.get("framework");
  const programs = useMemo(() => {
    const base = onlyApplicable && data.applicable.length ? data.applicable : data.all;
    return framework ? base.filter((p) => p.framework_ids.includes(framework)) : base;
  }, [data, onlyApplicable, framework]);

  const choose = (p: AuditProgram) => {
    setProgram(p);
    setAuditType(p.audit_type);
    setTitle(`${p.name} ${new Date().getFullYear()}`);
  };

  // ?program= preselects (from suggestion cards and the regulatory profile).
  useEffect(() => {
    const key = params.get("program");
    if (!key || program) return;
    const p = data.all.find((x) => x.program_key === key);
    if (p) { choose(p); setStep(1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.all]);

  if (loading && !data.all.length) return <PageSkeleton />;
  if (error && !data.all.length) return <ErrorState onRetry={reload} body="We couldn't load the audit programmes. Try again." />;

  const detailsError = !title.trim() ? "Give the audit a name" : end && start && end < start ? "The period has to end on or after it starts" : null;

  const submit = async () => {
    if (!program || detailsError) return;
    setServerError(null);
    if (!(await requireDualControl("Opening an audit is a recorded change."))) return;
    setBusy(true);
    try {
      const created = await createEngagement({
        program_key: program.program_key, title: title.trim(), audit_type: auditType, criteria: program.framework_ids,
        period_start: start || null, period_end: end || null, lead_auditor_name: lead.trim() || null,
        auditor_org: auditorOrg, scope_summary: summary.trim() || null,
        scope_items: scope.filter((s) => (s.description ?? "").trim() || (s.ref ?? "").trim()),
        team,
      });
      toast("success", "Audit opened", "Next: request evidence from the controls in scope.");
      navigate(`/assurance/${created.id}`);
    } catch (err) {
      setServerError(errMsg(err, "Couldn't open the audit"));
    } finally {
      setBusy(false);
    }
  };

  const grouped = AUDIT_TYPE_ORDER.map((t) => ({ type: t, items: programs.filter((p) => p.audit_type === t) })).filter((g) => g.items.length);

  return (
    <div>
      <Link to="/assurance" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"><ArrowLeft size={14} /> Assurance</Link>
      <PageHeader title="New audit" description="Pick what to audit against, then who, when and what's in scope. Scope and team can be added later." />

      <ol className="mb-5 flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}
            className={cx("flex items-center gap-2 rounded-full border px-3 py-1 text-xs", i === step ? "border-gold-400/50 text-gold-300" : i < step ? "border-emerald-400/30 text-emerald-300" : "border-phantix-700 text-slate-500")}>
            {i < step ? <Check size={12} /> : <span>{i + 1}</span>} {s}{i >= 2 ? " (optional)" : ""}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            {data.applicable.length > 0 && (
              <label className="flex items-center gap-2 text-slate-300">
                <input type="checkbox" checked={onlyApplicable} onChange={(e) => setOnlyApplicable(e.target.checked)} /> Only programmes that fit us
              </label>
            )}
            {framework && <span className="text-slate-400">Citing <span className="font-mono text-slate-200">{framework}</span></span>}
          </div>
          {grouped.length === 0 && <Card><p className="text-sm text-slate-400">No programmes match. Clear the filter to see all of them.</p></Card>}
          {grouped.map((g) => (
            <section key={g.type} className="mb-5" aria-label={AUDIT_TYPE_LABEL[g.type]}>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-slate-500">{AUDIT_TYPE_LABEL[g.type]}</h2>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {g.items.map((p) => {
                  const on = program?.program_key === p.program_key;
                  return (
                    <li key={p.program_key}>
                      <button type="button" onClick={() => choose(p)} aria-pressed={on}
                        className={cx("card h-full w-full p-4 text-left transition-colors", on ? "!border-gold-400/60 bg-gold-400/5" : "hover:border-phantix-500")}>
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-white">{p.name}</span>
                          {p.match && <span className="shrink-0 rounded-full border border-phantix-600 px-2 py-0.5 text-[11px] text-slate-300">{p.match}{p.score ? ` · ${p.score}` : ""}</span>}
                        </span>
                        {!!p.reasons?.length && <span className="mt-1 block text-xs text-slate-300">{p.reasons.join(" · ")}</span>}
                        {p.description && <span className="mt-1.5 block text-sm text-slate-400">{p.description}</span>}
                        <span className="mt-2 flex flex-wrap gap-1">
                          {p.framework_ids.map((f) => <span key={f} className="rounded bg-phantix-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">{f}</span>)}
                          {p.sector && <span className="rounded bg-phantix-800 px-1.5 py-0.5 text-[11px] text-slate-400">{p.sector.replace(/_/g, " ")}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {step === 1 && program && (
        <Card className="max-w-2xl space-y-4">
          <p className="text-sm text-slate-400">Against <span className="text-white">{program.name}</span></p>
          <div>
            <label className="label" htmlFor="ne-title">Name</label>
            <input id="ne-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ne-type">Audit type</label>
              <select id="ne-type" className="input" value={auditType} onChange={(e) => setAuditType(e.target.value as AuditType)}>
                {AUDIT_TYPE_ORDER.map((t) => <option key={t} value={t}>{AUDIT_TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ne-org">Who audits</label>
              <select id="ne-org" className="input" value={auditorOrg} onChange={(e) => setAuditorOrg(e.target.value)}>
                <option value="internal">Our own team</option>
                <option value="third_party">A third-party auditor</option>
                <option value="staff">Phantix GRC</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ne-start">Period from</label>
              <input id="ne-start" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="ne-end">to</label>
              <input id="ne-end" type="date" className="input" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="ne-lead">Lead auditor</label>
            <input id="ne-lead" className="input" value={lead} onChange={(e) => setLead(e.target.value)} placeholder="Name" />
          </div>
          <div>
            <label className="label" htmlFor="ne-summary">Scope summary</label>
            <textarea id="ne-summary" rows={3} className="input" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What's covered, in a sentence or two." />
          </div>
          {detailsError && (title || end) && <p className="text-sm text-severity-critical">{detailsError}</p>}
        </Card>
      )}

      {step === 2 && (
        <Card className="max-w-3xl">
          <p className="mb-3 text-sm text-slate-400">Systems, processes, vendors, locations and data flows. Say why anything is left out.</p>
          <ul className="space-y-3">
            {scope.map((s, i) => (
              <li key={i} className="grid grid-cols-1 gap-2 rounded-md border border-phantix-700 p-3 sm:grid-cols-[150px_1fr_1fr_auto]">
                <select aria-label="Type" className="input" value={s.item_type} onChange={(e) => setScope((cur) => cur.map((x, j) => (j === i ? { ...x, item_type: e.target.value as ScopeItemType } : x)))}>
                  {(Object.keys(SCOPE_TYPE_LABEL) as ScopeItemType[]).map((t) => <option key={t} value={t}>{SCOPE_TYPE_LABEL[t]}</option>)}
                </select>
                <input aria-label="Description" className="input" placeholder="Customer API" value={s.description ?? ""} onChange={(e) => setScope((cur) => cur.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                <input aria-label="Reference" className="input font-mono" placeholder="api.acme.com" value={s.ref ?? ""} onChange={(e) => setScope((cur) => cur.map((x, j) => (j === i ? { ...x, ref: e.target.value || null } : x)))} />
                <button type="button" aria-label="Remove" className="rounded p-2 text-slate-500 hover:text-severity-critical" onClick={() => setScope((cur) => cur.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={s.in_scope} onChange={(e) => setScope((cur) => cur.map((x, j) => (j === i ? { ...x, in_scope: e.target.checked } : x)))} /> In scope
                </label>
                <input aria-label="Rationale" className="input sm:col-span-3" placeholder={s.in_scope ? "Why (optional)" : "Why it's out of scope"} value={s.rationale ?? ""} onChange={(e) => setScope((cur) => cur.map((x, j) => (j === i ? { ...x, rationale: e.target.value || null } : x)))} />
              </li>
            ))}
          </ul>
          <button type="button" className="btn-secondary mt-3" onClick={() => setScope((cur) => [...cur, { item_type: "system", ref: null, description: "", in_scope: true, rationale: null }])}>
            <Plus size={14} /> Add item
          </button>
        </Card>
      )}

      {step === 3 && (
        <Card className="max-w-2xl">
          <p className="mb-3 text-sm text-slate-400">Who's involved from your organization. Phantix auditors are added by Phantix.</p>
          <ul className="space-y-2">
            {team.map((m, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-sm text-slate-200">{m.principal_name}<span className="ml-2 text-xs text-slate-500">{m.principal_email}</span></span>
                <select aria-label="Role" className="input w-40" value={m.role} onChange={(e) => setTeam((cur) => cur.map((x, j) => (j === i ? { ...x, role: e.target.value as TeamRole } : x)))}>
                  {(Object.keys(ROLE_LABEL) as TeamRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                <button type="button" aria-label="Remove" className="rounded p-2 text-slate-500 hover:text-severity-critical" onClick={() => setTeam((cur) => cur.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
          {data.users.filter((u) => u.is_active && !team.some((m) => m.principal_id === u.id)).length > 0 && (
            <select aria-label="Add a person" className="input mt-3" value="" onChange={(e) => {
              const u = data.users.find((x) => x.id === Number(e.target.value));
              if (u) setTeam((cur) => [...cur, { principal_type: "org_user", principal_id: u.id, principal_name: u.full_name, principal_email: u.email, role: "auditee" }]);
            }}>
              <option value="">Add a person…</option>
              {data.users.filter((u) => u.is_active && !team.some((m) => m.principal_id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
            </select>
          )}
        </Card>
      )}

      <div className="mt-5 max-w-3xl space-y-3">
        <InlineError message={serverError} />
        <div className="flex flex-wrap gap-2">
          {step > 0 && <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={14} /> Back</button>}
          {step < STEPS.length - 1 && (
            <button type="button" className="btn-secondary" disabled={(step === 0 && !program) || (step === 1 && !!detailsError)} onClick={() => setStep(step + 1)}>
              Next <ArrowRight size={14} />
            </button>
          )}
          {step >= 1 && (
            <button type="button" className="btn-primary" disabled={!program || !!detailsError || busy} onClick={() => void submit()}>
              {busy ? "Opening..." : "Open audit"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

