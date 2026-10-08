import React, { useMemo, useState } from "react";
import { Activity, Plus } from "lucide-react";
import { Card, EmptyState, ErrorState, Modal, PageHeader, PageSkeleton } from "@sg/ui";
import { useResource } from "@sg/useResource";
import { useStore } from "@sg/store";
import { cx, timeAgo } from "@sg/utils";
import {
  OPINION_LABEL, REPORT_TYPE_LABEL, loadAllReports, loadMonitoring, loadMonitoringSummary, openDriftFindings, upsertMonitoring,
  type AuditReport, type ControlMonitoring, type MonitoringStatus, type MonitoringSummary, type Opinion, type ReportType,
} from "@sg/assurance";
import { ReportList } from "./Workspace";
import { InlineError, errMsg } from "./parts";

/** Core → Assurance → Attestations: published reports across every audit. */
export function AssuranceReports() {
  const { data, loading, error, reload } = useResource(loadAllReports, [] as AuditReport[], "assurance-reports");
  const [type, setType] = useState("");
  const [opinion, setOpinion] = useState("");
  const shown = useMemo(() => data.filter((r) => (!type || r.report_type === type) && (!opinion || r.opinion === opinion)), [data, type, opinion]);

  if (loading && !data.length) return <PageSkeleton />;
  if (error && !data.length) return <ErrorState onRetry={reload} body="We couldn't load your reports. Try again." />;
  return (
    <div>
      <PageHeader title="Attestations" description="Readiness reports, audit opinions and attestations to share with regulators, customers and your board." />
      {data.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <select aria-label="Report type" className="input !w-auto" value={type} onChange={(ev) => setType(ev.target.value)}>
            <option value="">All reports</option>
            {(Object.keys(REPORT_TYPE_LABEL) as ReportType[]).map((t) => <option key={t} value={t}>{REPORT_TYPE_LABEL[t]}</option>)}
          </select>
          <select aria-label="Opinion" className="input !w-auto" value={opinion} onChange={(ev) => setOpinion(ev.target.value)}>
            <option value="">Any opinion</option>
            {(Object.keys(OPINION_LABEL) as Opinion[]).map((o) => <option key={o} value={o}>{OPINION_LABEL[o]}</option>)}
          </select>
        </div>
      )}
      <ReportList items={shown} showEngagement />
    </div>
  );
}

const TONE: Record<MonitoringStatus, string> = { effective: "text-emerald-400", drift: "text-severity-critical", unknown: "text-slate-400" };
const LABEL: Record<MonitoringStatus, string> = { effective: "Effective", drift: "Drift", unknown: "Unknown" };

type MonData = { rows: ControlMonitoring[]; summary: MonitoringSummary | null };

/** Core → Assurance → Continuous assurance: live control status between audits. */
export function AssuranceMonitoring() {
  const { data, loading, error, reload } = useResource<MonData>(
    async () => {
      const [rows, summary] = await Promise.all([loadMonitoring(), loadMonitoringSummary().catch(() => null)]);
      return { rows, summary };
    },
    { rows: [], summary: null },
    "assurance-monitoring",
    60_000,
  );
  const { toast, requireDualControl } = useStore();
  const [detail, setDetail] = useState<ControlMonitoring | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading && !data.rows.length) return <PageSkeleton />;
  if (error && !data.rows.length) return <ErrorState onRetry={reload} body="We couldn't load control monitoring. Try again." />;

  const drift = async () => {
    if (!(await requireDualControl("Opening findings for drifted controls is a recorded change."))) return;
    setBusy(true);
    try {
      const r = await openDriftFindings();
      toast("success", r.created ? `${r.created} finding${r.created === 1 ? "" : "s"} opened` : "No new findings", r.skipped ? `${r.skipped} already had one.` : undefined);
      reload();
    } catch (ex) { toast("error", "Couldn't open findings", errMsg(ex, "")); } finally { setBusy(false); }
  };

  const order: MonitoringStatus[] = ["drift", "unknown", "effective"];
  const rows = [...data.rows].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const s = data.summary;

  return (
    <div>
      <PageHeader
        title="Continuous assurance"
        description="Controls checked between audits by your connectors, or updated by hand. Drift can open findings."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setAdding(true)}><Plus size={14} /> Update a control</button>
            <button className="btn-primary" disabled={busy || !(s?.drift ?? rows.some((r) => r.status === "drift"))} onClick={() => void drift()}>Open findings for drift</button>
          </>
        }
      />
      {s && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          {(["effective", "drift", "unknown"] as const).map((k) => (
            <Card key={k}><p className="text-[12px] text-slate-500">{LABEL[k]}</p><p className={cx("font-display text-2xl font-bold", TONE[k])}>{s[k]}</p></Card>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <Card><EmptyState icon={<Activity size={22} />} title="No controls monitored yet" body="Connect Wazuh, AWS or Azure in Defend, or update a control by hand." /></Card>
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-phantix-700/40">
            {rows.map((c) => (
              <li key={c.id}>
                <button className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-phantix-800/40" onClick={() => setDetail(c)}>
                  <span className="min-w-[12rem] flex-1 break-all font-mono text-sm text-slate-200">{c.framework_id} · {c.control_id}</span>
                  <span className="text-xs text-slate-500">{c.source}</span>
                  <span className={cx("w-20 text-xs font-semibold", TONE[c.status])}>{LABEL[c.status]}</span>
                  <span className="w-24 text-right text-xs text-slate-500">{c.last_checked_at ? timeAgo(c.last_checked_at) : "never"}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.framework_id} · ${detail.control_id}` : ""}>
        {detail && (
          <div className="space-y-2 text-sm">
            <p className={TONE[detail.status]}>{LABEL[detail.status]} · {detail.source}</p>
            <pre className="max-h-80 overflow-auto rounded-md bg-phantix-950 p-3 text-xs text-slate-300">{JSON.stringify(detail.detail ?? {}, null, 2)}</pre>
          </div>
        )}
      </Modal>
      <UpsertModal open={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />
    </div>
  );
}

function UpsertModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { requireDualControl } = useStore();
  const [f, setF] = useState({ framework_id: "", control_id: "", source: "manual", status: "effective" as MonitoringStatus, note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (open) { setF({ framework_id: "", control_id: "", source: "manual", status: "effective", note: "" }); setErr(null); } }, [open]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!f.framework_id.trim() || !f.control_id.trim()) return setErr("Enter the framework and control.");
    if (!(await requireDualControl("Updating a control's status is a recorded change."))) return;
    setBusy(true);
    try {
      await upsertMonitoring({ framework_id: f.framework_id.trim(), control_id: f.control_id.trim(), source: f.source.trim() || "manual", status: f.status, detail: f.note.trim() ? { note: f.note.trim() } : null });
      onDone();
    } catch (ex) { setErr(errMsg(ex, "Couldn't save it")); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Update a control">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="mu-fw">Framework</label><input id="mu-fw" className="input font-mono" value={f.framework_id} onChange={(ev) => setF({ ...f, framework_id: ev.target.value })} placeholder="iso27001" /></div>
        <div><label className="label" htmlFor="mu-ctl">Control</label><input id="mu-ctl" className="input font-mono" value={f.control_id} onChange={(ev) => setF({ ...f, control_id: ev.target.value })} placeholder="A.8.8" /></div>
        <div><label className="label" htmlFor="mu-src">Source</label><input id="mu-src" className="input" value={f.source} onChange={(ev) => setF({ ...f, source: ev.target.value })} /></div>
        <div><label className="label" htmlFor="mu-st">Status</label>
          <select id="mu-st" className="input" value={f.status} onChange={(ev) => setF({ ...f, status: ev.target.value as MonitoringStatus })}>{(["effective", "drift", "unknown"] as const).map((x) => <option key={x} value={x}>{LABEL[x]}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="mu-note">Note</label><textarea id="mu-note" rows={2} className="input" value={f.note} onChange={(ev) => setF({ ...f, note: ev.target.value })} /></div>
        <div className="space-y-3 sm:col-span-2"><InlineError message={err} /><button className="btn-primary w-full" disabled={busy}>{busy ? "Saving..." : "Save"}</button></div>
      </form>
    </Modal>
  );
}
