import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, X } from "lucide-react";
import { loadTrackerDetail } from "../data";
import { SeverityBadge, Spinner, VerificationBadge } from "../ui";
import { humanize, normalizeTrackerVerification, timeAgo, titleCase } from "../utils";
import type { TrackerFinding } from "../types";

/** The detail payload of GET /reports/tracker/{finding_key} (fields this view reads). */
interface TrackerDetail {
  finding_key: string;
  title?: string;
  description?: string | null;
  severity?: string;
  surface?: string | null;
  status?: string;
  verification_status?: string;
  priority?: string | null;
  assigned_owner?: string | null;
  assigned_owner_email?: string | null;
  target_fix_date?: string | null;
  detection_count?: number | null;
  retest_status?: string | null;
  retest_date?: string | null;
  retest_evidence?: string | null;
  cvss_data?: unknown;
  asset_id?: number | null;
  source_store?: string | null;
  first_detected_at?: string | null;
  last_detected_at?: string | null;
  remediation?: { status?: string; summary?: string; steps?: string[]; validation?: string } | null;
  asset?: { value?: string; name?: string; type?: string } | null;
  related?: {
    asset?: { value?: string; name?: string; type?: string; criticality?: string } | null;
    risks?: { id: number; title?: string; status?: string }[];
    detections?: { id: number | string; title?: string; severity?: string; status?: string }[];
    reports?: { id: number; title?: string; status?: string; reportType?: string }[];
  } | null;
  history?: { id: number; changeType?: string; previousValue?: string | null; newValue?: string | null; changedBy?: string | null; createdAt?: string | null }[] | null;
}

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null);

/** CVSS arrives as a scored object (agent ledger) or a list of vectors (scanner). */
function cvssText(raw: unknown): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const parts = raw.map((v) => (typeof v === "string" ? v : (v as { vector?: string })?.vector)).filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }
  if (typeof raw === "object") {
    const o = raw as { score?: number | string; base_score?: number | string; vector?: string; vector_string?: string };
    const score = o.score ?? o.base_score;
    const vector = o.vector ?? o.vector_string;
    return [score != null ? `Score ${score}` : null, vector].filter(Boolean).join(" · ") || null;
  }
  return null;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] text-slate-200">{children ?? <span className="text-slate-500">Not set</span>}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-phantix-700/50 pt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Everything known about one tracked finding, beside the board. Opened from a
 * finding's key or title; the board stays in place underneath.
 */
export default function FindingDetailDrawer({
  findingKey,
  row,
  assetBase,
  onClose,
}: {
  findingKey: string | null;
  /** The board row, so the header paints at once while the detail loads. */
  row?: TrackerFinding | null;
  /** Where the asset link goes: a path in this app, or a full URL into Core. */
  assetBase: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<TrackerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!findingKey) return;
    let alive = true;
    setDetail(null);
    setFailed(false);
    setLoading(true);
    loadTrackerDetail(findingKey)
      .then((d) => { if (alive) { setDetail(d as TrackerDetail | null); setFailed(!d); } })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [findingKey]);

  useEffect(() => {
    if (!findingKey) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [findingKey, onClose]);

  const d: Partial<TrackerDetail> = { ...(row ?? {}), ...(detail ?? {}) } as Partial<TrackerDetail>;
  const assetValue = d.related?.asset?.value ?? d.asset?.value ?? (row?.asset_value || null);
  const assetHref = assetValue ? `${assetBase}?q=${encodeURIComponent(assetValue)}` : null;
  const owner = d.assigned_owner || (row?.owner ?? null);
  const cvss = cvssText(d.cvss_data);
  const related = d.related ?? null;
  const history = (d.history ?? []).slice().reverse();

  const copyKey = async () => {
    if (!findingKey) return;
    try {
      await navigator.clipboard.writeText(findingKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <AnimatePresence>
      {findingKey && (
        <>
          <motion.div
            key="finding-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[75] bg-black/60 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            key="finding-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`Finding ${findingKey}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed inset-y-0 right-0 z-[80] flex w-full max-w-[560px] flex-col border-l border-phantix-600/60 bg-[rgb(var(--surface-card))] shadow-2xl"
          >
            <header className="flex items-start gap-3 border-b border-phantix-700/50 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => void copyKey()} className="inline-flex items-center gap-1.5 font-mono text-[13px] font-semibold text-gold-300 hover:text-gold-200" title="Copy the finding key">
                  {findingKey} {copied ? <Check size={12} /> : <Copy size={12} className="opacity-60" />}
                </button>
                <h2 className="mt-1 font-display text-lg font-bold leading-snug text-white">{d.title || "Finding"}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {d.severity && <SeverityBadge severity={d.severity as TrackerFinding["severity"]} />}
                  {d.status && <span className="chip text-[12px]">{titleCase(String(d.status))}</span>}
                  {d.verification_status && <VerificationBadge status={normalizeTrackerVerification(d.verification_status)} />}
                </div>
              </div>
              <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-phantix-800 hover:text-white" aria-label="Close finding details">
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
              {loading && !detail && (
                <p className="flex items-center gap-2 text-sm text-slate-400"><Spinner className="h-4 w-4" /> Loading the full record...</p>
              )}
              {failed && !loading && (
                <p className="rounded-md border border-severity-medium/30 bg-severity-medium/10 px-3 py-2 text-[13px] text-slate-300">
                  The full record could not be loaded. Showing what the board has.
                </p>
              )}

              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Description</h3>
                {d.description ? (
                  <p className="whitespace-pre-line text-[13px] leading-6 text-slate-300">{d.description}</p>
                ) : (
                  <p className="text-[13px] text-slate-500">No description recorded for this finding.</p>
                )}
              </section>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-phantix-700/50 pt-4">
                <Fact label="Asset">
                  {assetValue ? (
                    /^https?:\/\//.test(assetBase)
                      ? <a href={assetHref!} className="font-mono text-gold-300 hover:text-gold-200">{assetValue}</a>
                      : <Link to={assetHref!} className="font-mono text-gold-300 hover:text-gold-200">{assetValue}</Link>
                  ) : null}
                </Fact>
                <Fact label="Surface">{d.surface ? humanize(String(d.surface)) : null}</Fact>
                <Fact label="Priority">{d.priority ? titleCase(String(d.priority)) : null}</Fact>
                <Fact label="Owner">{owner ? <>{owner}{d.assigned_owner_email ? <span className="block text-slate-500">{d.assigned_owner_email}</span> : null}</> : null}</Fact>
                <Fact label="Due">{fmtDate(d.target_fix_date)}</Fact>
                <Fact label="Detections">{d.detection_count != null ? String(d.detection_count) : null}</Fact>
                <Fact label="First seen">{fmtDate(d.first_detected_at)}</Fact>
                <Fact label="Last seen">{d.last_detected_at ? `${fmtDate(d.last_detected_at)} · ${timeAgo(d.last_detected_at)}` : null}</Fact>
                <Fact label="Source">{d.source_store ? humanize(String(d.source_store)) : null}</Fact>
                <Fact label="Retest">{d.retest_status ? `${titleCase(String(d.retest_status))}${d.retest_date ? ` · ${fmtDate(String(d.retest_date))}` : ""}` : null}</Fact>
                {cvss && <div className="col-span-2"><Fact label="CVSS"><span className="font-mono text-[12px]">{cvss}</span></Fact></div>}
              </dl>

              {d.retest_evidence && (
                <Section title="Retest evidence">
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-phantix-700/50 bg-phantix-900 p-3 font-mono text-[12px] text-slate-300">{d.retest_evidence}</pre>
                </Section>
              )}

              {d.remediation?.status === "generated" && (d.remediation.summary || d.remediation.steps?.length) && (
                <Section title="Fix guidance">
                  {d.remediation.summary && <p className="text-[13px] leading-6 text-slate-300">{d.remediation.summary}</p>}
                  {!!d.remediation.steps?.length && (
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-slate-300">
                      {d.remediation.steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  )}
                </Section>
              )}

              {related && ((related.risks?.length ?? 0) + (related.detections?.length ?? 0) + (related.reports?.length ?? 0) > 0) && (
                <Section title="Related">
                  <ul className="space-y-1.5 text-[13px]">
                    {related.risks?.map((r) => (
                      <li key={`r${r.id}`} className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-slate-200"><span className="text-slate-500">Risk · </span>{r.title}</span>{r.status && <span className="chip shrink-0 text-[11px]">{titleCase(r.status)}</span>}</li>
                    ))}
                    {related.detections?.map((x) => (
                      <li key={`d${x.id}`} className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-slate-200"><span className="text-slate-500">Detection · </span>{x.title}</span>{x.status && <span className="chip shrink-0 text-[11px]">{titleCase(x.status)}</span>}</li>
                    ))}
                    {related.reports?.map((r) => (
                      <li key={`p${r.id}`} className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-slate-200"><span className="text-slate-500">Report · </span>{r.title}</span>{r.status && <span className="chip shrink-0 text-[11px]">{titleCase(r.status)}</span>}</li>
                    ))}
                  </ul>
                </Section>
              )}

              {history.length > 0 && (
                <Section title="History">
                  <ol className="space-y-2.5 border-l border-phantix-700/60 pl-4">
                    {history.map((h) => (
                      <li key={h.id} className="relative text-[13px]">
                        <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-gold-400/70" aria-hidden="true" />
                        <p className="text-slate-200">
                          {h.changeType ? humanize(h.changeType) : "Change"}
                          {(h.previousValue || h.newValue) && (
                            <span className="text-slate-400">: {h.previousValue ? `${h.previousValue} → ` : ""}{h.newValue ?? ""}</span>
                          )}
                        </p>
                        <p className="text-[12px] text-slate-500">{[h.changedBy, h.createdAt ? timeAgo(h.createdAt) : null].filter(Boolean).join(" · ")}</p>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
