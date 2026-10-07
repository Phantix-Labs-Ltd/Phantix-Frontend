import { Link, useNavigate } from "react-router-dom";
import { ClipboardCheck, Globe2, Plus, RefreshCw } from "lucide-react";
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, PageSkeleton } from "@sg/ui";
import { useResource } from "@sg/useResource";
import {
  AUDIT_TYPE_LABEL, loadEngagements, loadIntelligence, loadMe, loadMonitoringSummary, loadPrograms, loadRegimes,
  type AuditProgram, type Engagement, type Intelligence, type MonitoringSummary, type Regimes,
} from "@sg/assurance";
import { OpinionBadge, ReadinessRing, SourceChips, StageStrip, fmtDate } from "./parts";

type Data = {
  intel: Intelligence | null;
  engagements: Engagement[];
  drift: MonitoringSummary | null;
  programs: AuditProgram[];
  regimes: Regimes | null;
};
const empty: Data = { intel: null, engagements: [], drift: null, programs: [], regimes: null };

async function loadAll(): Promise<Data> {
  // One rollup call for the portfolio (cached ~30s server-side), plus the list
  // for period / lead auditor / programme names.
  const [intel, engagements, drift] = await Promise.all([
    loadIntelligence(),
    loadEngagements(),
    loadMonitoringSummary().catch(() => null),
  ]);
  if (engagements.length) return { intel, engagements, drift, programs: [], regimes: null };
  const [programs, regimes] = await Promise.all([loadPrograms(true).catch(() => []), loadRegimes().catch(() => null)]);
  return { intel, engagements, drift, programs, regimes };
}

/** Core → Assurance: where the organization stands, and which audits are running. */
export default function AssuranceHome() {
  const navigate = useNavigate();
  // No auto-poll: the rollup is cached for ~30s server-side; refresh is manual.
  const { data, loading, error, reload } = useResource(loadAll, empty, "assurance-home");
  const { data: me } = useResource(loadMe, { role: "", can_read: true, can_audit: true, can_manage: true }, "assurance-me");

  if (loading && !data.intel) return <PageSkeleton />;
  if (error && !data.intel) return <ErrorState onRetry={reload} body="We couldn't load your audits. Check your connection and try again." />;

  const intel = data.intel;
  const byId = new Map(data.engagements.map((e) => [e.id, e]));
  const sev = intel?.findings.by_severity ?? {};
  const openFindings = intel?.engagements.reduce((n, e) => n + (e.findings_open ?? 0), 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="Assurance"
        description="Every audit of your organization in one place: readiness, findings, and the controls at risk across all of them."
        actions={
          <>
            <button className="btn-ghost" onClick={reload} aria-label="Refresh"><RefreshCw size={15} /></button>
            {me.can_manage && <button className="btn-primary" onClick={() => navigate("/assurance/new")}><Plus size={15} /> New audit</button>}
          </>
        }
      />

      {!intel || intel.engagement_count === 0 ? (
        <NoAudits programs={data.programs} regimes={data.regimes} />
      ) : (
        <>
          <Card className="mb-5 flex flex-wrap items-center gap-4">
            <div>
              <p className="text-[12px] uppercase tracking-wider text-slate-500">Overall opinion</p>
              <div className="mt-1"><OpinionBadge opinion={intel.overall_opinion} withRule /></div>
            </div>
            <dl className="ml-auto grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-5">
              <Kpi label="Audits" value={intel.engagement_count} />
              <Kpi label="Open findings" value={openFindings} />
              <Kpi label="Critical / high" value={`${sev.critical ?? 0} / ${sev.high ?? 0}`} tone={(sev.critical ?? 0) > 0 ? "bad" : undefined} />
              <Kpi label="Correlated controls" value={intel.correlated_controls} tone={intel.correlated_controls > 0 ? "warn" : undefined} />
              <Kpi label="Drifting controls" value={data.drift?.drift ?? "—"} tone={(data.drift?.drift ?? 0) > 0 ? "warn" : undefined} />
            </dl>
          </Card>

          <Card className="mb-5 !p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-phantix-700/50 text-left text-[12px] uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Audit</th>
                    <th className="px-4 py-2.5 font-medium">Stage</th>
                    <th className="px-4 py-2.5 font-medium">Opinion</th>
                    <th className="px-4 py-2.5 text-right font-medium">Readiness</th>
                    <th className="px-4 py-2.5 text-right font-medium">Findings</th>
                    <th className="px-4 py-2.5 font-medium">Period</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-phantix-700/40">
                  {intel.engagements.map((row) => {
                    const e = byId.get(row.id);
                    return (
                      <tr key={row.id} className="cursor-pointer hover:bg-phantix-800/40" onClick={() => navigate(`/assurance/${row.id}`)}>
                        <td className="px-4 py-3">
                          <Link to={`/assurance/${row.id}`} className="font-medium text-white hover:text-gold-300" onClick={(ev) => ev.stopPropagation()}>{row.title}</Link>
                          <p className="text-xs text-slate-500">{AUDIT_TYPE_LABEL[row.audit_type] ?? row.audit_type}{e?.program_name ? ` · ${e.program_name}` : ""}{e?.lead_auditor_name ? ` · ${e.lead_auditor_name}` : ""}</p>
                        </td>
                        <td className="px-4 py-3"><StageStrip status={row.status} compact /></td>
                        <td className="px-4 py-3"><OpinionBadge opinion={row.opinion} /></td>
                        <td className="px-4 py-3 text-right font-mono text-slate-200">{row.readiness_score == null ? "—" : `${Math.round(row.readiness_score)}%`}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{row.findings_open} / {row.findings_total}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(e?.period_start)} – {fmtDate(e?.period_end)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Controls at risk"
              subtitle="Controls with findings, across every audit and the findings SecureGraph already holds. Two or more independent sources agreeing is the strongest signal."
            />
            {intel.controls_at_risk.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No controls have open findings.</p>
            ) : (
              <ul className="mt-3 divide-y divide-phantix-700/40">
                {[...intel.controls_at_risk].sort((a, b) => Number(b.correlated) - Number(a.correlated) || b.source_count - a.source_count).slice(0, 10).map((c) => (
                  <li key={`${c.framework_id}:${c.control_id}`} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="min-w-[12rem] flex-1 font-mono text-sm text-slate-200">{c.framework_id} · {c.control_id}</span>
                    <SourceChips sources={c.sources} correlated={c.correlated} />
                    <span className="w-36 text-right text-xs text-slate-500">{c.audit_findings} audit · {c.peer_findings} other</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: "bad" | "warn" }) {
  return (
    <div>
      <dt className="text-[12px] text-slate-500">{label}</dt>
      <dd className={tone === "bad" ? "font-display text-xl font-bold text-severity-critical" : tone === "warn" ? "font-display text-xl font-bold text-gold-300" : "font-display text-xl font-bold text-white"}>{value}</dd>
    </div>
  );
}

function NoAudits({ programs, regimes }: { programs: AuditProgram[]; regimes: Regimes | null }) {
  const navigate = useNavigate();
  return (
    <>
      {regimes && (regimes.source === "none" || regimes.source === "browser_locale") && (
        <Card className="mb-5 flex flex-wrap items-center gap-3">
          <Globe2 size={18} className="text-gold-400" />
          <p className="min-w-[12rem] flex-1 text-sm text-slate-300">
            {regimes.detected_country
              ? <>We guessed you're in <strong className="text-white">{regimes.detected_country}</strong> from your browser. Confirm it so we suggest the right laws.</>
              : "Tell us where you operate so we can suggest the laws and standards that apply."}
          </p>
          <Link to="/assurance/regimes" className="btn-secondary !py-1.5 text-xs">Set your country</Link>
        </Card>
      )}
      {programs.length === 0 ? (
        <Card>
          <EmptyState icon={<ClipboardCheck size={22} />} title="No audits yet"
            body="Start with a readiness audit: it shows how close you are to passing, and what to fix first."
            action={<button className="btn-primary" onClick={() => navigate("/assurance/new")}><Plus size={15} /> New audit</button>} />
        </Card>
      ) : (
        <section aria-labelledby="suggested">
          <h2 id="suggested" className="mb-3 font-display text-base font-semibold text-white">Audits that fit your organization</h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {programs.slice(0, 6).map((p) => (
              <li key={p.program_key}>
                <Card className="flex h-full flex-col">
                  <p className="text-[12px] uppercase tracking-wider text-slate-500">{AUDIT_TYPE_LABEL[p.audit_type] ?? p.audit_type}{p.match ? ` · ${p.match} match` : ""}</p>
                  <h3 className="mt-1 font-semibold text-white">{p.name}</h3>
                  {!!p.reasons?.length && <p className="mt-1 text-sm text-slate-300">{p.reasons.join(" · ")}</p>}
                  {p.description && <p className="mt-2 flex-1 text-sm text-slate-400">{p.description}</p>}
                  <button className="btn-secondary mt-4 w-fit !py-1.5 text-xs" onClick={() => navigate(`/assurance/new?program=${encodeURIComponent(p.program_key)}`)}>Start this audit</button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
