import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, History, RefreshCw } from "lucide-react";
import { PageHeader, Card, StatCard, ErrorState, EmptyState, Spinner, PageBodySkeleton } from "@sg/ui";
import SecurityDbBanner from "@sg/components/SecurityDbBanner";
import SeverityCounts from "@sg/components/SeverityCounts";
import DocLink from "@sg/components/DocLink";
import { useResource } from "@sg/useResource";
import { isSecurityDbBlocked } from "@sg/api";
import { timeAgo, cx } from "@sg/utils";
import {
  loadCodeScans,
  SCAN_STATUS_CHOICES,
  type CodeScanRun,
} from "@sg/codeOps";

// ── Repository scan history ──────────────────────────────────────────────────
// What was scanned, when, with which tool, and what it found. A run is an
// immutable audit record: the remediation workflow lives on the finding, never
// on the run, so this page never offers to "close" a scan.

interface Bundle {
  scans: CodeScanRun[];
  securityDbBlocked: boolean;
  error: string | null;
}

const EMPTY: Bundle = { scans: [], securityDbBlocked: false, error: null };

async function loadBundle(): Promise<Bundle> {
  try {
    const res = await loadCodeScans(100);
    return { scans: res.scans, securityDbBlocked: false, error: null };
  } catch (err) {
    if (isSecurityDbBlocked(err)) return { ...EMPTY, securityDbBlocked: true };
    return { ...EMPTY, error: err instanceof Error ? err.message : "Failed to load scan history" };
  }
}

const SEVERITY_ROLLUP = ["critical", "high", "medium", "low"] as const;

const STATUS_TONE: Record<string, string> = {
  completed: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  running: "border-gold-400/40 bg-gold-400/10 text-gold-200",
  queued: "border-phantix-600/40 bg-phantix-800/50 text-slate-300",
  pending: "border-phantix-600/40 bg-phantix-800/50 text-slate-300",
  failed: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
};

function statusTone(status: string): string {
  return STATUS_TONE[status] ?? "border-phantix-600/40 bg-phantix-800/50 text-slate-400";
}

export default function ScanHistory() {
  const { data, loading, error, reload } = useResource(loadBundle, EMPTY, "code-scan-history");
  const [filter, setFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

  const { scans } = data;

  const counts = useMemo(() => {
    const total = scans.length;
    const completed = scans.filter((s) => s.status === "completed").length;
    const failed = scans.filter((s) => s.status === "failed").length;
    const findings = scans.reduce((n, s) => n + (s.severity_counts?.total ?? 0), 0);
    const critical = scans.reduce((n, s) => n + (s.severity_counts?.critical ?? 0), 0);
    return { total, completed, failed, findings, critical };
  }, [scans]);

  const visible = useMemo(
    () => (filter === "all" ? scans : scans.filter((s) => s.status === filter)),
    [scans, filter],
  );

  const refresh = () => {
    setRefreshing(true);
    reload();
    window.setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div>
      <PageHeader
        title="Repository scans"
        description="Infrastructure-as-code and pipeline scans of your connected repositories. A scan run is an immutable audit record."
        actions={
          <>
            <DocLink docId="howto-app-24" label="Code review how-to" />
            <button onClick={refresh} className="btn-secondary text-xs" disabled={refreshing}>
              {refreshing ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw size={13} />} Refresh
            </button>
          </>
        }
      />

      {data.securityDbBlocked && <SecurityDbBanner />}

      {loading && !scans.length ? (
        <PageBodySkeleton stats={4} variant="section" rows={6} />
      ) : error ? (
        <ErrorState title="Scan history unavailable" body={error} onRetry={reload} />
      ) : !scans.length ? (
        <Card>
          <EmptyState
            icon={<History size={22} />}
            title="No repository scans yet"
            body="Connect a repository and run a branch review. Every scan lands here with its severity roll-up."
            action={
              <Link to="/code-review/repositories" className="btn-primary !py-2 text-sm">
                Go to repositories <ArrowRight size={14} />
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Scans" value={counts.total} hint={`${counts.completed} completed`} />
            <StatCard label="Findings" value={counts.findings} hint="across all runs" />
            <StatCard
              label="Critical"
              value={counts.critical}
              hint={counts.critical ? "needs attention" : "none detected"}
            />
            <StatCard label="Failed" value={counts.failed} hint="clone or tool errors" />
          </div>

          <Card pad="none" className="mt-4">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-phantix-700/40 px-4 py-3">
              {(["all", ...SCAN_STATUS_CHOICES] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  aria-pressed={filter === s}
                  className={cx(
                    "chip !py-0.5 capitalize transition-colors",
                    filter === s
                      ? "border-gold-400/40 bg-gold-400/10 text-gold-200"
                      : "border-phantix-700 text-slate-400 hover:text-slate-200",
                  )}
                >
                  {s === "all" ? "All" : s.replace(/_/g, " ")}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Scan</th>
                    <th className="th">Repository</th>
                    <th className="th">Branch</th>
                    <th className="th">Tool</th>
                    <th className="th">Status</th>
                    <th className="th">Findings</th>
                    <th className="th">Created</th>
                    <th className="th text-right">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((scan, i) => (
                    <motion.tr
                      key={scan.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.2) }}
                      className="border-b border-phantix-800/40 hover:bg-phantix-800/35"
                    >
                      <td className="td font-mono text-xs text-slate-400">{scan.id}</td>
                      <td className="td font-medium text-slate-200">
                        {scan.repository || <span className="text-slate-500">—</span>}
                      </td>
                      <td className="td text-sm text-slate-300">{scan.branch || "—"}</td>
                      <td className="td text-sm text-slate-400">
                        {scan.tools.length ? scan.tools.join(", ") : "—"}
                      </td>
                      <td className="td">
                        <span
                          className={cx(
                            "chip !py-0.5 capitalize",
                            statusTone(scan.status),
                          )}
                          title={scan.error_message ?? undefined}
                        >
                          {scan.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="td">
                        {scan.severity_counts?.total ? (
                          <SeverityCounts counts={scan.severity_counts} severities={SEVERITY_ROLLUP} />
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">
                        {scan.created_at ? timeAgo(scan.created_at) : "—"}
                      </td>
                      <td className="td text-right">
                        <Link
                          to={`/code-review/scans/${scan.id}`}
                          className="btn-secondary !py-1 !text-xs"
                        >
                          Open <ArrowRight size={12} />
                        </Link>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!visible.length && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                No scans with status “{filter.replace(/_/g, " ")}”.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
