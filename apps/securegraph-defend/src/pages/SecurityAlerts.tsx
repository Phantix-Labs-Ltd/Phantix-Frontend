import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { Search, Check, ArrowUpCircle, CheckCircle2, XCircle, ShieldAlert, Clock } from "lucide-react";
import {
  PageHeader,
  Card,
  StatCard,
  SeverityBadge,
  Modal,
  PageSkeleton,
  ErrorState,
  EmptyState,
  Spinner,
} from "@sg/ui";
import { Pagination, usePaged } from "@sg/components/Pagination";
import SecurityDbBanner from "@sg/components/SecurityDbBanner";
import DocLink from "@sg/components/DocLink";
import { useResource } from "@sg/useResource";
import { useStore } from "@sg/store";
import { isSecurityDbBlocked } from "@sg/api";
import { timeAgo, cx } from "@sg/utils";
import type { Severity } from "@sg/types";
import {
  listAlerts,
  alertsSummary,
  slaBreaches,
  alertAction,
  ALERT_STATES,
  ALERT_STATE_LABELS,
  SEVERITIES,
  stateBadgeTone,
  fmtDuration,
  isSlaBreached,
  type CiAlert,
  type AlertSummary,
  type AlertAction,
} from "@sg/socOps";

interface Bundle {
  alerts: CiAlert[];
  summary: AlertSummary | null;
  breaches: number;
  securityDbBlocked: boolean;
  error: string | null;
}

const EMPTY: Bundle = { alerts: [], summary: null, breaches: 0, securityDbBlocked: false, error: null };

async function loadAlertsBundle(): Promise<Bundle> {
  try {
    const [alerts, summary, breaches] = await Promise.all([
      listAlerts({ limit: 500 }),
      alertsSummary(),
      slaBreaches(),
    ]);
    return { alerts: alerts.items, summary, breaches: breaches.total ?? breaches.items.length, securityDbBlocked: false, error: null };
  } catch (err) {
    if (isSecurityDbBlocked(err)) return { ...EMPTY, securityDbBlocked: true };
    return { ...EMPTY, error: err instanceof Error ? err.message : "Failed to load security alerts" };
  }
}

const ACTIVE = new Set(["open", "acknowledged", "escalated"]);

function sum(map: Record<string, number> | undefined): number {
  if (!map) return 0;
  return Object.values(map).reduce((a, b) => a + b, 0);
}

function Entity({ alert }: { alert: CiAlert }) {
  if (!alert.entity_type && !alert.entity_id) return <span className="text-slate-600">—</span>;
  return (
    <span className="inline-flex flex-col">
      <span className="font-mono text-xs text-slate-300">{alert.entity_id ?? "—"}</span>
      <span className="text-[12px] text-slate-500">{alert.entity_type ?? ""}</span>
    </span>
  );
}

export default function SecurityAlerts() {
  const { toast, requireDualControl } = useStore();
  const { data, loading, error, reload, setData } = useResource(loadAlertsBundle, EMPTY, "soc-security-alerts");
  const [params, setParams] = useSearchParams();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CiAlert | null>(null);

  const alerts = data.alerts;
  const summary = data.summary;

  // URL is the source of truth for the view, so it can be shared or linked to.
  const state = params.get("state") ?? "active";
  const severity = params.get("severity") ?? "all";
  const q = params.get("q") ?? "";
  const [searchDraft, setSearchDraft] = useState(q);
  React.useEffect(() => setSearchDraft(q), [q]);
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchDraft !== q) update({ q: searchDraft.trim() || null });
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v == null || v === "") next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return alerts.filter((a) => {
      if (state === "active" && !ACTIVE.has(a.state)) return false;
      if (state !== "active" && state !== "all" && a.state !== state) return false;
      if (severity !== "all" && a.severity !== severity) return false;
      if (needle && !(`${a.rule_title} ${a.entity_id ?? ""} ${a.mitre_technique ?? ""}`.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [alerts, state, severity, q]);

  const { pageItems, pagination } = usePaged(filtered, "soc-alerts", { state, severity, q });

  const openTotal = summary ? (summary.byState.open ?? 0) + (summary.byState.acknowledged ?? 0) + (summary.byState.escalated ?? 0) : alerts.filter((a) => ACTIVE.has(a.state)).length;
  const bySev = summary?.openBySeverity ?? {};

  const act = async (alert: CiAlert, action: AlertAction, label: string) => {
    if (!(await requireDualControl(`${label} an alert requires a dual-control operate session.`))) return;
    setBusyId(alert.id);
    // Optimistic: patch the row, then confirm with the server response.
    const prev = data.alerts;
    try {
      const updated = await alertAction(alert.id, action);
      setData((d) => ({ ...d, alerts: d.alerts.map((a) => (a.id === alert.id ? updated : a)) }));
      toast("success", `${label} done`, alert.rule_title);
      reload();
    } catch (err) {
      setData((d) => ({ ...d, alerts: prev }));
      toast("error", `${label} failed`, err instanceof Error ? err.message : "Could not update the alert.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <PageSkeleton variant="list" rows={6} actions />;

  if (error && alerts.length === 0 && !data.securityDbBlocked) {
    return <ErrorState onRetry={reload} body="We could not load security alerts. Check your connection and try again. Your session stays signed in." />;
  }

  const activeFilters: Array<{ key: string; label: string; clear: () => void }> = [];
  if (state !== "active") activeFilters.push({ key: "state", label: `State: ${ALERT_STATE_LABELS[state] ?? state}`, clear: () => update({ state: null }) });
  if (severity !== "all") activeFilters.push({ key: "severity", label: `Severity: ${severity}`, clear: () => update({ severity: null }) });
  if (q) activeFilters.push({ key: "q", label: `“${q}”`, clear: () => { setSearchDraft(""); update({ q: null }); } });

  return (
    <div>
      <PageHeader
        title="Security alerts"
        description="Continuous monitoring & alerting — triage, acknowledge and resolve against SLA."
        actions={<DocLink docId="howto-app-08" label="SOC how-to" />}
      />

      {data.securityDbBlocked && <SecurityDbBanner message={data.error} />}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Open" value={openTotal} hint={`${sum(summary?.byState)} total tracked`} />
        <StatCard label="Critical / High" value={(bySev.critical ?? 0) + (bySev.high ?? 0)} hint={`${bySev.critical ?? 0} critical open`} />
        <StatCard label="SLA breaches" value={data.breaches} />
        <StatCard label="MTTA" value={fmtDuration(summary?.mttaSeconds)} hint="mean time to acknowledge" />
        <StatCard label="MTTR" value={fmtDuration(summary?.mttrSeconds)} hint="mean time to resolve" />
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input !w-64 !py-1.5 !pl-8 text-[13px]"
            placeholder="Search rule, entity, technique…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            aria-label="Search alerts"
          />
        </div>
        <select className="input !w-auto !py-1.5 !pr-8 text-[13px]" aria-label="State" value={state} onChange={(e) => update({ state: e.target.value === "active" ? null : e.target.value })}>
          <option value="active">Active</option>
          <option value="all">Any state</option>
          {ALERT_STATES.map((s) => <option key={s} value={s}>{ALERT_STATE_LABELS[s]}</option>)}
        </select>
        <select className="input !w-auto !py-1.5 !pr-8 text-[13px]" aria-label="Severity" value={severity} onChange={(e) => update({ severity: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">Any severity</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {activeFilters.map((c) => (
          <button key={c.key} type="button" onClick={c.clear} aria-label={`Remove filter ${c.label}`} className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/30 bg-gold-400/10 py-1 pl-3 pr-2 text-xs font-medium text-gold-200 hover:bg-gold-400/15">
            {c.label} <XCircle size={13} />
          </button>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ShieldAlert size={22} />}
              title={alerts.length === 0 ? "No alerts" : "No alerts match these filters"}
              body={alerts.length === 0 ? "Continuous monitoring is watching. New detections that cross a rule open an alert here." : "Widen the filters, or pick Any state to include resolved alerts."}
            />
          </Card>
        ) : (
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Severity</th>
                    <th className="th">Rule</th>
                    <th className="th">Entity</th>
                    <th className="th">Source</th>
                    <th className="th">State</th>
                    <th className="th text-right">Occ.</th>
                    <th className="th">Last seen</th>
                    <th className="th">SLA</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((a) => {
                    const ackBreach = isSlaBreached(a.sla_ack_by, a.state) && !a.acknowledged_at;
                    const resBreach = isSlaBreached(a.sla_resolve_by, a.state);
                    return (
                      <tr key={a.id} className="border-b border-phantix-800/40 hover:bg-phantix-800/35">
                        <td className="td"><SeverityBadge severity={a.severity as Severity} /></td>
                        <td className="td">
                          <button className="text-left font-medium text-slate-200 hover:text-gold-300" onClick={() => setDetail(a)}>{a.rule_title}</button>
                          {a.mitre_technique && <span className="ml-2 rounded bg-phantix-800/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">{a.mitre_technique}</span>}
                        </td>
                        <td className="td"><Entity alert={a} /></td>
                        <td className="td text-xs text-slate-400">{a.rule_source}</td>
                        <td className="td"><span className={cx("inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-medium", stateBadgeTone(a.state))}>{ALERT_STATE_LABELS[a.state] ?? a.state}</span></td>
                        <td className="td text-right font-mono text-xs text-slate-300">{a.occurrence_count}</td>
                        <td className="td whitespace-nowrap text-xs text-slate-500">{a.last_seen_at ? timeAgo(a.last_seen_at) : "—"}</td>
                        <td className="td whitespace-nowrap text-xs">
                          {ackBreach || resBreach ? (
                            <span className="inline-flex items-center gap-1 text-severity-critical"><Clock size={11} /> {ackBreach ? "ack overdue" : "resolve overdue"}</span>
                          ) : (
                            <span className="text-slate-500">{a.sla_resolve_by ? `by ${timeAgo(a.sla_resolve_by)}` : "—"}</span>
                          )}
                        </td>
                        <td className="td">
                          <div className="flex items-center justify-end gap-1.5">
                            {!a.acknowledged_at && a.state !== "resolved" && a.state !== "false_positive" && (
                              <button className="btn-secondary !px-2 !py-1" title="Acknowledge" disabled={busyId === a.id} onClick={() => act(a, "acknowledge", "Acknowledge")}>{busyId === a.id ? <Spinner className="h-3.5 w-3.5" /> : <Check size={13} />}</button>
                            )}
                            {a.state !== "escalated" && a.state !== "resolved" && a.state !== "false_positive" && (
                              <button className="btn-secondary !px-2 !py-1" title="Escalate" disabled={busyId === a.id} onClick={() => act(a, "escalate", "Escalate")}><ArrowUpCircle size={13} /></button>
                            )}
                            {a.state !== "resolved" && a.state !== "false_positive" && (
                              <>
                                <button className="btn-secondary !px-2 !py-1 hover:!text-emerald-300" title="Resolve" disabled={busyId === a.id} onClick={() => act(a, "resolve", "Resolve")}><CheckCircle2 size={13} /></button>
                                <button className="btn-secondary !px-2 !py-1" title="Mark false positive" disabled={busyId === a.id} onClick={() => act(a, "false-positive", "Mark false-positive")}><XCircle size={13} /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} itemLabel="alerts" keyboard />
          </Card>
        )}
      </motion.div>

      {detail && <AlertDetail alert={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm text-slate-200">{value}</p>
    </div>
  );
}

function AlertDetail({ alert, onClose }: { alert: CiAlert; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={alert.rule_title} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={alert.severity as Severity} />
          <span className={cx("inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-medium", stateBadgeTone(alert.state))}>{ALERT_STATE_LABELS[alert.state] ?? alert.state}</span>
          {alert.mitre_technique && <span className="rounded bg-phantix-800/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">{alert.mitre_technique}</span>}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Source" value={`${alert.rule_source}${alert.rule_version ? ` · v${alert.rule_version}` : ""}`} />
          <Field label="Entity" value={<span className="font-mono text-xs">{alert.entity_id ?? "—"}{alert.entity_type ? ` (${alert.entity_type})` : ""}</span>} />
          <Field label="Occurrences" value={alert.occurrence_count} />
          <Field label="First seen" value={alert.first_seen_at ? timeAgo(alert.first_seen_at) : "—"} />
          <Field label="Last seen" value={alert.last_seen_at ? timeAgo(alert.last_seen_at) : "—"} />
          <Field label="Time to acknowledge" value={fmtDuration(alert.time_to_acknowledge_seconds)} />
          <Field label="Time to resolve" value={fmtDuration(alert.time_to_resolve_seconds)} />
          <Field label="Acknowledged by" value={alert.acknowledged_by ?? "—"} />
          <Field label="SOC detection" value={alert.soc_detection_id ?? "—"} />
        </div>
        <div>
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Evidence</p>
          <pre className="max-h-64 overflow-auto rounded-xl border border-phantix-700/40 bg-phantix-950/50 p-3 font-mono text-[12px] text-slate-300">{JSON.stringify(alert.evidence ?? {}, null, 2)}</pre>
        </div>
      </div>
    </Modal>
  );
}
