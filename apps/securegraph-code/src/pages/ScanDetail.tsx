import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { PageHeader, Card, StatCard, SeverityBadge, ErrorState, EmptyState, Spinner, PageBodySkeleton } from "@sg/ui";
import SecurityDbBanner from "@sg/components/SecurityDbBanner";
import { useResource } from "@sg/useResource";
import { isSecurityDbBlocked } from "@sg/api";
import { timeAgo, cx } from "@sg/utils";
import { SEVERITY_ORDER } from "@sg/charts/palette";
import { loadCodeScan, resourceOf, type CodeScanDetail } from "@sg/codeOps";

// ── One repository scan ──────────────────────────────────────────────────────
// The run's metadata, its severity roll-up, and every finding it produced.
// Findings link back into the review surface for the block, the why, and the
// fix — this page does not duplicate the review, it indexes it.
//
// Remediation status is intentionally not editable here: it belongs to the
// finding and is owned by the review workflow. A scan is an audit record.

interface Bundle {
  scan: CodeScanDetail | null;
  securityDbBlocked: boolean;
  error: string | null;
  notFound: boolean;
}

const EMPTY: Bundle = { scan: null, securityDbBlocked: false, error: null, notFound: false };

const STATUS_TONE: Record<string, string> = {
  completed: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  running: "border-gold-400/40 bg-gold-400/10 text-gold-200",
  queued: "border-phantix-600/40 bg-phantix-800/50 text-slate-300",
  pending: "border-phantix-600/40 bg-phantix-800/50 text-slate-300",
  failed: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
};

function stamp(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function ScanDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const id = Number(jobId);

  const load = React.useCallback(async (): Promise<Bundle> => {
    if (!Number.isFinite(id)) return { ...EMPTY, notFound: true };
    try {
      const scan = await loadCodeScan(id);
      return { scan, securityDbBlocked: false, error: null, notFound: false };
    } catch (err) {
      if (isSecurityDbBlocked(err)) return { ...EMPTY, securityDbBlocked: true };
      const status = (err as { status?: number })?.status;
      if (status === 404) return { ...EMPTY, notFound: true };
      return {
        ...EMPTY,
        error: err instanceof Error ? err.message : "Failed to load the scan",
      };
    }
  }, [id]);

  const { data, loading, error, reload } = useResource(load, EMPTY, `code-scan-${id}`);
  const scan = data.scan;

  return (
    <div>
      <PageHeader
        title="Scan detail"
        description="One repository scan: the run's metadata, its severity roll-up, and every finding it produced."
        actions={
          <>
            <button onClick={() => navigate("/code-review/scans")} className="btn-ghost text-xs">
              <ArrowLeft size={13} /> Back to scans
            </button>
            <button onClick={reload} className="btn-secondary text-xs">
              <RefreshCw size={13} /> Refresh
            </button>
          </>
        }
      />

      {data.securityDbBlocked && <SecurityDbBanner />}

      {loading && !scan ? (
        <PageBodySkeleton stats={5} variant="detail" rows={6} />
      ) : data.notFound ? (
        <Card>
          <EmptyState
            icon={<ArrowLeft size={22} />}
            title="Scan not found"
            body="That scan run does not exist for this organization, or it was never recorded."
            action={
              <Link to="/code-review/scans" className="btn-primary !py-2 text-sm">
                Back to scans <ArrowRight size={14} />
              </Link>
            }
          />
        </Card>
      ) : error ? (
        <ErrorState title="Scan unavailable" body={error} onRetry={reload} />
      ) : scan ? (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  {scan.tools.length ? scan.tools.join(" · ") : scan.job_type}
                </p>
                <h2 className="mt-1 font-display text-lg font-semibold text-slate-100">
                  {scan.repository || "Unknown repository"}
                </h2>
                <p className="mt-0.5 font-mono text-xs text-slate-500">
                  {scan.branch ? `branch ${scan.branch}` : "branch unknown"}
                </p>
              </div>
              <div className="shrink-0 rounded-md border border-phantix-700/50 bg-phantix-900/50 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">status</span>
                  <span
                    className={cx("chip !py-0 capitalize", STATUS_TONE[scan.status] ?? STATUS_TONE.queued)}
                  >
                    {scan.status.replace(/_/g, " ")}
                  </span>
                </div>
                <dl className="mt-2 space-y-0.5 text-slate-400">
                  <div className="flex gap-2">
                    <dt className="w-16 text-slate-600">id</dt>
                    <dd className="font-mono">{scan.id}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 text-slate-600">created</dt>
                    <dd>{stamp(scan.created_at)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 text-slate-600">started</dt>
                    <dd>{stamp(scan.started_at)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 text-slate-600">finished</dt>
                    <dd>{stamp(scan.completed_at)}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {scan.error_message && (
              <p className="mt-3 rounded-md border border-severity-critical/30 bg-severity-critical/10 px-3 py-2 text-[13px] text-severity-critical">
                {scan.error_message}
              </p>
            )}
          </Card>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Findings" value={scan.severity_counts?.total ?? 0} />
            {SEVERITY_ORDER.map((s) => (
              <StatCard
                key={s}
                label={s.charAt(0).toUpperCase() + s.slice(1)}
                value={scan.severity_counts?.[s] ?? 0}
                hint={s === "critical" && (scan.severity_counts?.critical ?? 0) > 0 ? "needs attention" : undefined}
              />
            ))}
          </div>

          <Card pad="none" className="mt-4">
            <div className="border-b border-phantix-700/40 px-4 py-3">
              <h3 className="font-display text-[15px] font-semibold text-slate-100">
                Findings from this scan
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Remediation status is editable on the finding, in the Security review.
              </p>
            </div>

            {!scan.findings?.length ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                This scan produced no findings.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-phantix-700/40">
                      <th className="th">Rule</th>
                      <th className="th">Resource</th>
                      <th className="th">File:line</th>
                      <th className="th">Severity</th>
                      <th className="th">Message</th>
                      <th className="th text-right">&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scan.findings.map((f, i) => (
                      <motion.tr
                        key={f.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.015, 0.2) }}
                        className="border-b border-phantix-800/40 hover:bg-phantix-800/35"
                      >
                        <td className="td whitespace-nowrap font-mono text-xs text-slate-300">
                          {f.rule_id || "—"}
                        </td>
                        <td className="td max-w-[16rem] truncate font-mono text-xs text-slate-400" title={resourceOf(f)}>
                          {resourceOf(f) || "—"}
                        </td>
                        <td className="td max-w-[16rem] truncate font-mono text-xs text-slate-400" title={f.path}>
                          {f.path}
                          {f.start_line ? `:${f.start_line}` : ""}
                        </td>
                        <td className="td">
                          <SeverityBadge severity={f.severity} className="!text-[12px]" />
                        </td>
                        <td className="td max-w-[22rem] text-sm text-slate-300">
                          <span className="line-clamp-2">{f.title}</span>
                        </td>
                        <td className="td text-right">
                          <Link
                            to={`/code-review?finding=${f.id}`}
                            className="btn-ghost !py-1 !text-xs"
                          >
                            Review
                          </Link>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
            <Spinner className="h-4 w-4" /> Loading scan…
          </div>
        </Card>
      )}
    </div>
  );
}
