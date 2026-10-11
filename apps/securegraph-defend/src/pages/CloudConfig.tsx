import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Play, Camera, GitCompare } from "lucide-react";
import {
  PageHeader,
  Card,
  StatCard,
  SeverityBadge,
  Modal,
  Tabs,
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
  listCloudChanges,
  listCloudSnapshots,
  sweepConnection,
  CHANGE_TYPE_TONE,
  type CloudChange,
  type CloudSnapshot,
} from "@sg/socOps";

interface Bundle {
  changes: CloudChange[];
  snapshots: CloudSnapshot[];
  securityDbBlocked: boolean;
  error: string | null;
}

const EMPTY: Bundle = { changes: [], snapshots: [], securityDbBlocked: false, error: null };

async function loadCloudConfig(): Promise<Bundle> {
  try {
    const [changes, snapshots] = await Promise.all([listCloudChanges(500), listCloudSnapshots(200)]);
    return { changes: changes.items, snapshots: snapshots.items, securityDbBlocked: false, error: null };
  } catch (err) {
    if (isSecurityDbBlocked(err)) return { ...EMPTY, securityDbBlocked: true };
    return { ...EMPTY, error: err instanceof Error ? err.message : "Failed to load cloud configuration" };
  }
}

function ValueDiff({ prev, next }: { prev: string | null; next: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[12px]">
      <span className="max-w-[160px] truncate text-slate-500 line-through">{prev ?? "∅"}</span>
      <span className="text-slate-600">→</span>
      <span className="max-w-[160px] truncate text-slate-200">{next ?? "∅"}</span>
    </span>
  );
}

export default function CloudConfig() {
  const { toast, requireDualControl } = useStore();
  const { data, loading, error, reload } = useResource(loadCloudConfig, EMPTY, "soc-cloud-config");
  const [tab, setTab] = useState("changes");
  const [sweepOpen, setSweepOpen] = useState(false);

  const changes = data.changes;
  const snapshots = data.snapshots;

  const { pageItems: changePage, pagination: changePag } = usePaged(changes, "soc-cloud-changes");
  const { pageItems: snapPage, pagination: snapPag } = usePaged(snapshots, "soc-cloud-snapshots");

  // Connections known from recorded snapshots/changes, for the sweep picker.
  const connections = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of snapshots) if (s.connection_id != null) map.set(s.connection_id, s.provider);
    for (const c of changes) if (c.connection_id != null && !map.has(c.connection_id)) map.set(c.connection_id, c.provider);
    return Array.from(map.entries()).map(([id, provider]) => ({ id, provider }));
  }, [snapshots, changes]);

  const criticalHigh = changes.filter((c) => c.severity === "critical" || c.severity === "high").length;

  if (loading) return <PageSkeleton variant="list" rows={6} actions />;

  if (error && changes.length === 0 && snapshots.length === 0 && !data.securityDbBlocked) {
    return <ErrorState onRetry={reload} body="We could not load cloud configuration changes. Check your connection and try again. Your session stays signed in." />;
  }

  return (
    <div>
      <PageHeader
        title="Cloud config changes"
        description="Read-only posture snapshots and the configuration drift detected between them."
        actions={
          <div className="flex items-center gap-2">
            <DocLink docId="howto-app-08" label="Cloud posture how-to" />
            <button className="btn-primary" onClick={() => setSweepOpen(true)}><Play size={15} /> Run sweep now</button>
          </div>
        }
      />

      {data.securityDbBlocked && <SecurityDbBanner message={data.error} />}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Changes" value={changes.length} hint="recent" />
        <StatCard label="Critical / High" value={criticalHigh} />
        <StatCard label="Snapshots" value={snapshots.length} />
        <StatCard label="Connections" value={connections.length} />
      </div>

      <Tabs
        tabs={[
          { id: "changes", label: "Changes", count: changes.length },
          { id: "snapshots", label: "Snapshots", count: snapshots.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "changes" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {changes.length === 0 ? (
            <Card>
              <EmptyState icon={<GitCompare size={22} />} title="No configuration changes" body="When a posture sweep finds drift against the previous snapshot, each changed control appears here." />
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-phantix-700/40">
                      <th className="th">Control</th>
                      <th className="th">Provider</th>
                      <th className="th">Change</th>
                      <th className="th">Previous → New</th>
                      <th className="th">Severity</th>
                      <th className="th">Detected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changePage.map((c) => (
                      <tr key={c.id} className="border-b border-phantix-800/40 hover:bg-phantix-800/35">
                        <td className="td font-mono text-xs text-slate-200">{c.control_id}</td>
                        <td className="td text-xs uppercase text-slate-400">{c.provider}</td>
                        <td className="td"><span className={cx("inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-medium", CHANGE_TYPE_TONE[c.change_type] ?? "border-phantix-600/40 bg-phantix-800/50 text-slate-400")}>{c.change_type}</span></td>
                        <td className="td"><ValueDiff prev={c.previous_value} next={c.new_value} /></td>
                        <td className="td"><SeverityBadge severity={c.severity as Severity} /></td>
                        <td className="td whitespace-nowrap text-xs text-slate-500">{c.detected_at ? timeAgo(c.detected_at) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...changePag} itemLabel="changes" keyboard />
            </Card>
          )}
        </motion.div>
      )}

      {tab === "snapshots" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {snapshots.length === 0 ? (
            <Card>
              <EmptyState icon={<Camera size={22} />} title="No snapshots yet" body="Run a sweep to capture the first read-only posture snapshot for a connection." />
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-phantix-700/40">
                      <th className="th">Provider</th>
                      <th className="th">Connection</th>
                      <th className="th text-right">Controls</th>
                      <th className="th">Posture hash</th>
                      <th className="th">Captured</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapPage.map((s) => (
                      <tr key={s.id} className="border-b border-phantix-800/40 hover:bg-phantix-800/35">
                        <td className="td text-xs uppercase text-slate-300">{s.provider}</td>
                        <td className="td text-xs text-slate-400">#{s.connection_id ?? "—"}</td>
                        <td className="td text-right font-mono text-xs text-slate-300">{s.control_count}</td>
                        <td className="td font-mono text-[12px] text-slate-500">{s.posture_hash ?? "—"}</td>
                        <td className="td whitespace-nowrap text-xs text-slate-500">{s.captured_at ? timeAgo(s.captured_at) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...snapPag} itemLabel="snapshots" />
            </Card>
          )}
        </motion.div>
      )}

      <SweepModal
        open={sweepOpen}
        connections={connections}
        onClose={() => setSweepOpen(false)}
        onDone={() => { setSweepOpen(false); reload(); }}
      />
    </div>
  );
}

function SweepModal({
  open,
  connections,
  onClose,
  onDone,
}: {
  open: boolean;
  connections: Array<{ id: number; provider: string }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast, requireDualControl } = useStore();
  const [connectionId, setConnectionId] = useState<string>(connections[0] ? String(connections[0].id) : "");
  const [running, setRunning] = useState(false);

  React.useEffect(() => {
    if (open && connections[0]) setConnectionId(String(connections[0].id));
  }, [open, connections]);

  const run = async () => {
    const id = Number(connectionId);
    if (!Number.isFinite(id) || id <= 0) {
      toast("warning", "Pick a connection", "Enter a cloud connection id to sweep.");
      return;
    }
    if (!(await requireDualControl("Running a cloud config sweep requires a dual-control operate session."))) return;
    setRunning(true);
    try {
      const res = await sweepConnection(id);
      toast(
        res.alerts_opened ? "warning" : "success",
        res.unchanged ? "Sweep complete — no drift" : `Sweep complete — ${res.changes.length} change(s)`,
        res.alerts_opened ? `${res.alerts_opened} alert(s) opened.` : "Snapshot captured.",
      );
      onDone();
    } catch (err) {
      toast("error", "Sweep failed", err instanceof Error ? err.message : "Could not run the sweep.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Run a configuration sweep">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <div>
          <label className="label">Cloud connection</label>
          {connections.length > 0 ? (
            <select className="input" value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
              {connections.map((c) => <option key={c.id} value={c.id}>#{c.id} · {c.provider.toUpperCase()}</option>)}
            </select>
          ) : (
            <input className="input" inputMode="numeric" placeholder="Connection id" value={connectionId} onChange={(e) => setConnectionId(e.target.value.replace(/\D/g, ""))} />
          )}
          <p className="mt-1 text-[12px] text-slate-500">A read-only posture snapshot is captured and diffed against the previous one. Any drift opens continuous-monitoring alerts.</p>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={running}>{running ? <Spinner className="h-4 w-4" /> : <Play size={14} />} Run sweep</button>
        </div>
      </form>
    </Modal>
  );
}
