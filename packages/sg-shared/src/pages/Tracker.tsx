import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlarmClock, AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Ban, BookOpen, CheckCircle2, CircleDot, FileText, KanbanSquare, Loader2, Lock, RefreshCw,
  Search, ShieldAlert, ShieldCheck, Sparkles, Timer, UserX, Wrench, X,
} from "lucide-react";
import { EmptyState, ErrorState, Modal, PageHeader, PageSkeleton, SeverityBadge, Spinner, VerificationBadge, Card } from "../ui";
import { Pagination, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS as PAGE_SIZES } from "../components/Pagination";
import DocLink from "../components/DocLink";
import {
  generateTrackerRemediation,
  loadTrackerBundle,
  patchTrackerFinding,
  retestTrackerFinding,
  verifyTrackerFinding,
} from "../data";
import { isDemoMode } from "../api";
import { useSseStream } from "../useSse";
import { CrossAppLink } from "../components/CrossAppLink";
import { useResource } from "../useResource";
import { useStore } from "../store";
import { cx, humanize, normalizeTrackerVerification, timeAgo, titleCase, TRACKER_STATUSES } from "../utils";
import type { TrackerFinding, TrackerRemediation, TrackerSummary, TrackerVerification } from "../types";

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const CLOSED = new Set(["fixed", "accepted"]);

/**
 * Evidence is a separate axis from remediation status: the report gate holds
 * unverified candidates back from the client deliverable, but they are still
 * open work and belong on the tracker.
 */
const EVIDENCE: { key: TrackerVerification | "verified" | "all"; label: string }[] = [
  { key: "verified", label: "Verified" },
  { key: "unverified", label: "Unverified" },
  { key: "auto_verified", label: "Auto-verified" },
  { key: "manually_verified", label: "Human-verified" },
  { key: "all", label: "All evidence" },
];

/** A finding is in the verified group when any evidence level above "unverified". */
function inEvidence(
  finding: TrackerFinding,
  scope: TrackerVerification | "verified" | "all",
): boolean {
  if (scope === "all") return true;
  const v = normalizeTrackerVerification(finding.verification_status);
  if (scope === "verified") return v === "auto_verified" || v === "manually_verified";
  return v === scope;
}

/** The row already carries persisted fix guidance — opening it is a read, not a
 *  model call. */
function fixReady(finding: TrackerFinding): boolean {
  return finding.remediation?.status === "generated";
}

type SortKey = "severity" | "status" | "age" | "updated" | "key";

/** The AI fix artifact the remediation agent persists beside a finding. */
type TrackerProps = {
  /** Where "Export as a report" goes. Defaults to Core's own report library. */
  reportHref?: string;
  /** Base for asset deep links; the attack app points this at Core. */
  assetBase?: string;
};

type FixBlock = TrackerRemediation;

const STATUS_ORDER = ["regressed", "retest_failed", "open", "in_progress", "accepted", "fixed"];

/** The Key column is a glance, not the identifier: the full key stays in the
 *  row's title/aria-label and in the deep link. */
const KEY_DISPLAY_MAX = 10;

const SORTERS: Record<SortKey, (a: TrackerFinding, b: TrackerFinding) => number> = {
  severity: (a, b) => (SEV_RANK[a.severity] ?? 0) - (SEV_RANK[b.severity] ?? 0),
  status: (a, b) => STATUS_ORDER.indexOf(String(b.status)) - STATUS_ORDER.indexOf(String(a.status)),
  age: (a, b) => new Date(b.first_detected_at || b.updated_at || 0).getTime() - new Date(a.first_detected_at || a.updated_at || 0).getTime(),
  updated: (a, b) => new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime(),
  key: (a, b) => a.finding_key.localeCompare(b.finding_key, undefined, { numeric: true }),
};

function isOverdue(f: TrackerFinding): boolean {
  if (!f.target_fix_date || CLOSED.has(String(f.status))) return false;
  return new Date(f.target_fix_date).getTime() < Date.now();
}

function ageDays(f: TrackerFinding): number | null {
  const from = f.first_detected_at;
  if (!from) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 86_400_000));
}

function summaryFrom(findings: TrackerFinding[], server: TrackerSummary | null) {
  const count = (s: string) => findings.filter((f) => f.status === s).length;
  return {
    open: server?.open ?? count("open"),
    in_progress: server?.in_progress ?? count("in_progress"),
    regressed: server?.regressed ?? count("regressed"),
    retest_failed: server?.retest_failed ?? count("retest_failed"),
    fixed: server?.fixed ?? count("fixed"),
    accepted: server?.accepted ?? count("accepted"),
    unassigned: server?.unassigned ?? findings.filter((f) => !f.owner && !CLOSED.has(String(f.status))).length,
    overdue: findings.filter(isOverdue).length,
  };
}

type VerifyDecision = "manually_verified" | "rejected" | "false_positive";

export default function Tracker({ reportHref = "/reports", assetBase = "/assets" }: TrackerProps = {}) {
  const { toast, requireDualControl } = useStore();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload, setData } = useResource(
    loadTrackerBundle,
    { trackerFindings: [] as TrackerFinding[], trackerSummary: null as TrackerSummary | null, trackerNote: null as string | null },
    "tracker",
  );
  // Live board over SSE: a finding verified or changed in any app lands here at
  // once, instead of on a polling tick. Falls back to the last load if the
  // stream is unavailable.
  useSseStream("/org/command-center/stream", {
    enabled: !isDemoMode(),
    onEvent: (evt) => {
      if (
        evt.event === "trackerUpdated" ||
        evt.event === "agiFindingRecorded" ||
        evt.event === "newFindingOnAsset"
      ) {
        reload();
      }
    },
  });
  const findings = data.trackerFindings;

  // URL is the source of truth for the view, so it can be shared or linked to.
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "active";
  const severity = params.get("severity") ?? "all";
  // The board opens on evidenced findings; unverified candidates are still one
  // click away, so nothing is hidden — it is just not the default work list.
  const evidence = (params.get("evidence") ?? "verified") as
    | TrackerVerification
    | "verified"
    | "all";
  const owner = params.get("owner") ?? "all";
  // Where a finding came from: GRC audits project their findings here too.
  const source = params.get("source") ?? "all";
  const highlightKey = params.get("key") ?? "";
  const [sortKey, sortDir] = (() => {
    const [k, d] = (params.get("sort") ?? "severity:desc").split(":");
    return [(k in SORTERS ? k : "severity") as SortKey, d === "asc" ? "asc" : "desc"];
  })();
  const pageSize = (() => {
    const n = Number(params.get("size"));
    return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
  })();

  const update = (patch: Record<string, string | null>, resetPage = true) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v == null || v === "") next.delete(k);
          else next.set(k, v);
        }
        if (resetPage) next.delete("page");
        return next;
      },
      { replace: true },
    );

  const [searchDraft, setSearchDraft] = useState(q);
  useEffect(() => setSearchDraft(q), [q]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchDraft !== q) update({ q: searchDraft.trim() || null });
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  // Tiles reflect the current evidence scope, so "Open work" is the verified
  // backlog while the board is on the verified view — not every raw candidate.
  const scoped = useMemo(
    () => findings.filter((f) => inEvidence(f, evidence)),
    [findings, evidence],
  );
  const summary = useMemo(() => summaryFrom(scoped, null), [scoped]);
  const evidenceCounts = useMemo(() => {
    const c: Record<string, number> = { all: findings.length, verified: 0, unverified: 0, auto_verified: 0, manually_verified: 0 };
    for (const f of findings) {
      const v = normalizeTrackerVerification(f.verification_status);
      c[v] += 1;
      if (v === "auto_verified" || v === "manually_verified") c.verified += 1;
    }
    return c;
  }, [findings]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = findings.filter((f) => {
      const s = String(f.status);
      if (status === "active" && CLOSED.has(s)) return false;
      if (status === "overdue" && !isOverdue(f)) return false;
      if (status !== "active" && status !== "all" && status !== "overdue" && s !== status) return false;
      if (severity !== "all" && f.severity !== severity) return false;
      if (!inEvidence(f, evidence)) return false;
      if (owner === "unassigned" && f.owner) return false;
      if (source === "audit" && f.source_store !== "compliance_audit") return false;
      if (source === "testing" && f.source_store === "compliance_audit") return false;
      if (
        needle &&
        ![f.finding_key, f.title, f.asset_value, f.owner ?? "", f.campaign_name].some((v) => String(v || "").toLowerCase().includes(needle))
      )
        return false;
      return true;
    });
    const sorter = SORTERS[sortKey];
    rows.sort((a, b) => (sortDir === "asc" ? sorter(a, b) : sorter(b, a)) || SORTERS.updated(b, a));
    return rows;
  }, [findings, q, status, severity, evidence, owner, sortKey, sortDir]);

  // A deep link (?key=) opens the page that holds that finding, once.
  const jumped = useRef(false);
  useEffect(() => {
    if (!highlightKey || jumped.current || filtered.length === 0) return;
    const idx = filtered.findIndex((f) => f.finding_key === highlightKey);
    if (idx < 0) {
      if (status !== "all") update({ status: "all" }, true);
      return;
    }
    jumped.current = true;
    const pageOf = Math.floor(idx / pageSize) + 1;
    if (pageOf > 1) update({ page: String(pageOf) }, false);
    window.setTimeout(() => document.getElementById(`tracker-${highlightKey}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey, filtered, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, Number(params.get("page")) || 1), totalPages);
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const tableTop = useRef<HTMLDivElement>(null);

  const toggleSort = (k: SortKey) => {
    const dir = sortKey === k ? (sortDir === "asc" ? "desc" : "asc") : k === "key" ? "asc" : "desc";
    update({ sort: k === "severity" && dir === "desc" ? null : `${k}:${dir}` });
  };

  const changeStatus = async (f: TrackerFinding, next: string) => {
    if (!(await requireDualControl("Updating tracker status requires a dual-control operate session."))) return;
    const previous = data;
    setData((b) => ({ ...b, trackerFindings: b.trackerFindings.map((tf) => (tf.finding_key === f.finding_key ? { ...tf, status: next } : tf)) }));
    try {
      await patchTrackerFinding(f.finding_key, { status: next });
      toast("success", "Tracker updated", `${f.finding_key} → ${titleCase(next)}`);
    } catch (err: any) {
      setData(previous);
      toast("error", err?.status === 403 ? "Dual-control required" : "Update failed", err?.message ?? "Status update failed");
    }
  };

  // Unit retest
  const [retestTarget, setRetestTarget] = useState<TrackerFinding | null>(null);
  const [retestBusy, setRetestBusy] = useState(false);
  const [retestForm, setRetestForm] = useState({ tool: "", note: "" });
  const runRetest = async () => {
    if (!retestTarget) return;
    if (!(await requireDualControl("Running a unit retest requires a dual-control operate session."))) return;
    setRetestBusy(true);
    const key = retestTarget.finding_key;
    const previous = data;
    try {
      const updated = await retestTrackerFinding(key, { tool: retestForm.tool.trim() || undefined, note: retestForm.note.trim() || undefined });
      const s = updated?.status ?? "retest_failed";
      setData((b) => ({
        ...b,
        trackerFindings: b.trackerFindings.map((tf) => (tf.finding_key === key ? ({ ...tf, ...(updated ?? {}), status: s } as TrackerFinding) : tf)),
      }));
      if (updated?.retest_status === "queued") {
        // The scan runs on a scan worker; the board updates when it finishes.
        toast("info", "Retest queued", `${key} is being re-scanned. The result appears here when it finishes.`);
      } else {
        toast(
          s === "fixed" ? "success" : s === "retest_failed" ? "error" : "info",
          s === "fixed" ? "Fix confirmed. Finding closed." : "Retest complete",
          s === "fixed" ? `${key} re-scanned clean. Closed as fixed.` : s === "retest_failed" ? `${key} still matches. It stays open.` : `${key} retest inconclusive. Status unchanged.`,
        );
      }
      setRetestTarget(null);
      setRetestForm({ tool: "", note: "" });
      reload();
    } catch (err: any) {
      setData(previous);
      toast("error", err?.status === 403 ? "Dual-control required" : "Retest failed", err?.message ?? "Could not run retest");
    } finally {
      setRetestBusy(false);
    }
  };

  // Remediation popup: a verified finding opens its fix guidance in place, so the
  // board and the fix live on one page. Guidance is carried on the tracker row,
  // so opening it is a read; only a row with no artifact yet calls the model.
  const [fixTarget, setFixTarget] = useState<TrackerFinding | null>(null);
  const [fixBusy, setFixBusy] = useState(false);
  const [fixBlock, setFixBlock] = useState<FixBlock | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);

  const generateFix = async (f: TrackerFinding) => {
    setFixBusy(true);
    setFixError(null);
    try {
      const res = await generateTrackerRemediation(f.finding_key);
      if (res?.remediation && res.remediation.status === "generated") {
        setFixBlock(res.remediation);
      } else {
        setFixError(
          res?.error || "The AI engine could not produce guidance for this finding. Try again.",
        );
      }
    } catch (err: any) {
      setFixError(err?.message ?? "Could not generate fix guidance");
    } finally {
      setFixBusy(false);
    }
  };

  const openFix = async (f: TrackerFinding) => {
    setFixTarget(f);
    setFixError(null);
    const existing =
      f.remediation && f.remediation.status === "generated" ? f.remediation : null;
    setFixBlock(existing);
    if (f.source_finding_id == null) {
      setFixError("This finding has no source row to attach fix guidance to.");
      return;
    }
    if (existing) return;
    await generateFix(f);
  };

  // Verification popup: an unverified candidate is confirmed (or excluded) from
  // the board itself, so triage, the fix queue and the report gate stay on one
  // page instead of sending the operator back to the scan that produced it.
  const [verifyTarget, setVerifyTarget] = useState<TrackerFinding | null>(null);
  const [verifyBusy, setVerifyBusy] = useState<VerifyDecision | null>(null);
  const [verifyNote, setVerifyNote] = useState("");
  const runVerify = async (decision: VerifyDecision) => {
    const target = verifyTarget;
    if (!target) return;
    if (!(await requireDualControl("Changing the verification status of a finding requires a dual-control operate session."))) return;
    setVerifyBusy(decision);
    const key = target.finding_key;
    const previous = data;
    // Confirming makes the finding reportable. The board's evidence axis has
    // three levels and cannot name an excluded finding, so a rejected row reads
    // as unverified until the reload brings the server's own value back.
    setData((b) => ({
      ...b,
      trackerFindings: b.trackerFindings.map((tf) =>
        tf.finding_key === key
          ? { ...tf, verification_status: decision === "manually_verified" ? "manually_verified" : "unverified" }
          : tf,
      ),
    }));
    try {
      await verifyTrackerFinding(target, { verification_status: decision, note: verifyNote.trim() || undefined });
      toast(
        "success",
        decision === "manually_verified" ? "Finding verified" : decision === "false_positive" ? "Marked false positive" : "Finding rejected",
        decision === "manually_verified" ? `${key} is now reportable evidence.` : `${key} stays off client reports.`,
      );
      setVerifyTarget(null);
      setVerifyNote("");
      reload();
    } catch (err: any) {
      setData(previous);
      toast("error", err?.status === 403 ? "Dual-control required" : "Verification failed", err?.message ?? "Could not update verification");
    } finally {
      setVerifyBusy(null);
    }
  };

  if (loading && findings.length === 0) return <PageSkeleton variant="table" rows={8} />;
  if (error && findings.length === 0) {
    return <ErrorState onRetry={reload} body="We could not load the findings tracker. Check your connection and try again. Your session stays signed in." />;
  }

  const tiles: { key: string; label: string; value: number; icon: React.ReactNode; tone: string; hint: string }[] = [
    { key: "active", label: "Open work", value: summary.open + summary.in_progress + summary.regressed + summary.retest_failed, icon: <CircleDot size={18} />, tone: "text-gold-300", hint: "Everything not fixed or accepted" },
    { key: "in_progress", label: "In progress", value: summary.in_progress, icon: <Timer size={18} />, tone: "text-sky-300", hint: "Being remediated" },
    { key: "regressed", label: "Regressed", value: summary.regressed + summary.retest_failed, icon: <ShieldAlert size={18} />, tone: "text-severity-critical", hint: "Came back or failed retest" },
    { key: "overdue", label: "Overdue", value: summary.overdue, icon: <AlarmClock size={18} />, tone: "text-severity-high", hint: "Past the target fix date" },
    { key: "fixed", label: "Fixed", value: summary.fixed, icon: <CheckCircle2 size={18} />, tone: "text-emerald-400", hint: "Confirmed closed" },
  ];

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (q) chips.push({ key: "q", label: `Search: “${q}”`, clear: () => update({ q: null }) });
  if (status !== "active") chips.push({ key: "status", label: `Status: ${status === "all" ? "Any" : titleCase(status)}`, clear: () => update({ status: null }) });
  if (severity !== "all") chips.push({ key: "sev", label: `Severity: ${titleCase(severity)}`, clear: () => update({ severity: null }) });
  // Verified is the default view, so only a deliberate change gets a chip.
  if (evidence !== "verified" && evidence !== "all") chips.push({ key: "ev", label: `Evidence: ${EVIDENCE.find((e) => e.key === evidence)?.label}`, clear: () => update({ evidence: null }) });
  if (owner !== "all") chips.push({ key: "owner", label: "Unassigned only", clear: () => update({ owner: null }) });

  const SortHeader = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => {
    const active = sortKey === k;
    return (
      <th className={cx("th", className)} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => toggleSort(k)} className={cx("-mx-1.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 hover:text-slate-100", active && "text-gold-300")}>
          {children}
          {active ? sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} className="opacity-40" />}
        </button>
      </th>
    );
  };

  return (
    <div>
      <PageHeader
        title="Findings tracker"
        description="The live remediation board: every tracked finding, its owner, and the state of its fix."
        actions={
          <>
            <DocLink docId="howto-app-12" label="Findings tracker how-to" />
            <Link to={reportHref} className="btn-secondary">
              <FileText size={15} /> Export as a report
            </Link>
          </>
        }
      />

      {/* Status tiles double as the main filter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t, i) => {
          const active = status === t.key || (t.key === "regressed" && status === "retest_failed");
          return (
            <motion.button
              key={t.key}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => update({ status: t.key === "active" ? null : t.key })}
              aria-pressed={active}
              className={cx(
                "card flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:border-phantix-600",
                active && "!border-gold-400/50 bg-gold-400/[0.04]",
              )}
            >
              <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-phantix-700 bg-phantix-900 [&_svg]:h-3.5 [&_svg]:w-3.5", t.tone)}>{t.icon}</span>
              <span className="min-w-0">
                <span className="block text-[13px] text-slate-400">{t.label}</span>
                <span className="block font-mono text-xl font-semibold leading-tight text-white">{t.value}</span>
                <span className="hidden truncate text-[12px] text-slate-500 sm:block">{t.hint}</span>
              </span>
            </motion.button>
          );
        })}
      </div>

      <Card className="mt-4 !p-0 overflow-hidden">
        {/* Filters */}
        <div ref={tableTop} className="flex flex-wrap items-center gap-2 border-b border-phantix-700/40 p-4">
          <div className="relative w-72 max-w-full">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input !pl-10"
              placeholder="Search key, finding, asset or owner…"
              aria-label="Search findings"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setSearchDraft(""); }}
            />
          </div>
          <select className="input !w-auto !py-1.5 !pr-8 text-[13px]" aria-label="Status" value={status} onChange={(e) => update({ status: e.target.value === "active" ? null : e.target.value })}>
            <option value="active">Open work</option>
            <option value="all">Any status</option>
            <option value="overdue">Overdue</option>
            {TRACKER_STATUSES.map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </select>
          <select className="input !w-auto !py-1.5 !pr-8 text-[13px]" aria-label="Severity" value={severity} onChange={(e) => update({ severity: e.target.value === "all" ? null : e.target.value })}>
            <option value="all">Any severity</option>
            {["critical", "high", "medium", "low", "info"].map((s) => (
              <option key={s} value={s}>{titleCase(s)} ({findings.filter((f) => f.severity === s).length})</option>
            ))}
          </select>
          {findings.some((f) => f.source_store === "compliance_audit") && (
            <select className="input !w-auto !py-1.5 !pr-8 text-[13px]" aria-label="Source" value={source} onChange={(e) => update({ source: e.target.value === "all" ? null : e.target.value })}>
              <option value="all">Any source</option>
              <option value="audit">Audits ({findings.filter((f) => f.source_store === "compliance_audit").length})</option>
              <option value="testing">Scans and testing</option>
            </select>
          )}
          <button
            type="button"
            onClick={() => update({ owner: owner === "unassigned" ? null : "unassigned" })}
            aria-pressed={owner === "unassigned"}
            className={cx("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] transition-colors", owner === "unassigned" ? "border-gold-400/50 bg-gold-400/10 text-gold-200" : "border-phantix-700 text-slate-300 hover:border-phantix-600")}
          >
            <UserX size={14} /> Unassigned <span className="font-mono text-[12px] text-slate-400">{summary.unassigned}</span>
          </button>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Evidence">
            {EVIDENCE.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => update({ evidence: key })}
                aria-pressed={evidence === key}
                className={cx(
                  "rounded-md border px-2.5 py-1.5 text-[13px] transition-colors",
                  evidence === key ? "border-gold-400/50 bg-gold-400/10 text-gold-200" : "border-transparent text-slate-400 hover:bg-phantix-800/60",
                )}
              >
                {label} <span className="font-mono text-[12px] text-slate-500">{evidenceCounts[key] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-phantix-700/40 bg-phantix-950/40 px-4 py-2.5">
            {chips.map((c) => (
              <button key={c.key} type="button" onClick={c.clear} aria-label={`Remove filter ${c.label}`} className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/30 bg-gold-400/10 py-1 pl-3 pr-2 text-xs font-medium text-gold-200 hover:bg-gold-400/15">
                {c.label} <X size={12} />
              </button>
            ))}
            <button type="button" onClick={() => update({ q: null, status: null, severity: null, evidence: null, owner: null })} className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-phantix-800 hover:text-slate-200">
              Reset view
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<KanbanSquare size={24} />}
            title={findings.length === 0 ? "No tracked findings yet" : "Nothing matches this view"}
            body={
              findings.length === 0
                ? "Findings land here from scans, campaigns and agent sessions, and stay until they are fixed or accepted."
                : "Widen the filters, or pick Any status to include fixed and accepted findings."
            }
            action={findings.length > 0 ? <button className="btn-secondary" onClick={() => update({ q: null, status: "all", severity: null, evidence: null, owner: null })}>Show every finding</button> : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px]">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <SortHeader k="key" className="w-24">Key</SortHeader>
                    <th className="th">Finding</th>
                    <SortHeader k="severity">Severity</SortHeader>
                    <th className="th">Asset</th>
                    <th className="th hidden 2xl:table-cell">Owner</th>
                    <th className="th hidden 2xl:table-cell">Due</th>
                    <th className="th">Evidence</th>
                    <SortHeader k="status">Status</SortHeader>
                    <SortHeader k="age" className="hidden 2xl:table-cell">Age</SortHeader>
                    <th className="th sticky right-0 z-20 border-l border-phantix-700/40 bg-card text-right shadow-[-10px_0_10px_-10px_rgba(0,0,0,0.55)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((f) => {
                    const days = ageDays(f);
                    const overdue = isOverdue(f);
                    return (
                      <tr
                        key={f.finding_key}
                        id={`tracker-${f.finding_key}`}
                        className={cx("h-10 border-b border-phantix-800/40 hover:bg-phantix-800/35", highlightKey === f.finding_key && "bg-gold-400/10 ring-1 ring-inset ring-gold-400/30")}
                      >
                        <td className="td w-24 whitespace-nowrap">
                          <span
                            className="font-mono text-[13px] font-semibold text-gold-300"
                            title={f.finding_key}
                            aria-label={f.finding_key}
                          >
                            {f.finding_key.slice(0, KEY_DISPLAY_MAX)}
                          </span>
                        </td>
                        <td className="td max-w-[14rem]">
                          <span
                            className="block truncate font-medium text-slate-100"
                            title={[f.title, f.campaign_name, f.priority, f.surface ? humanize(f.surface) : ""].filter(Boolean).join(" · ")}
                          >
                            {f.source_store === "compliance_audit" && (
                              <span className="mr-1.5 rounded border border-gold-400/40 bg-gold-400/10 px-1.5 py-0.5 text-[11px] font-semibold text-gold-300" title="Raised in a GRC audit">Audit</span>
                            )}
                            {f.title}
                            {f.campaign_name && <span className="ml-2 font-normal text-slate-500">{f.campaign_name}</span>}
                            {f.source_store === "compliance_audit" && /^AUDIT-\d+$/.test(f.finding_key) && (
                              <CrossAppLink app="core" to={`/assurance/findings/${f.finding_key}`} className="ml-2 text-[12px] font-normal text-gold-400 hover:text-gold-300">
                                Open in audit
                              </CrossAppLink>
                            )}
                          </span>
                        </td>
                        <td className="td whitespace-nowrap"><SeverityBadge severity={f.severity} /></td>
                        <td className="td max-w-[14rem]">
                          <span className="block truncate font-mono text-[13px] text-slate-400" title={f.asset_value}>
                            {f.asset_id != null ? <Link to={`${assetBase}?q=${encodeURIComponent(f.asset_value || "")}`} className="hover:text-gold-300">{f.asset_value}</Link> : f.asset_value}
                          </span>
                        </td>
                        <td className="td hidden max-w-[10rem] 2xl:table-cell">
                          {f.owner ? <span className="block truncate text-[13px] text-slate-300" title={f.owner}>{f.owner}</span> : <span className="text-[13px] text-slate-500">Unassigned</span>}
                        </td>
                        <td className="td hidden whitespace-nowrap 2xl:table-cell">
                          {f.target_fix_date ? (
                            <span className={cx("text-[13px]", overdue ? "font-medium text-severity-high" : "text-slate-400")}>
                              {overdue ? "Overdue · " : ""}{new Date(f.target_fix_date).toLocaleDateString()}
                            </span>
                          ) : <span className="text-slate-600">Not set</span>}
                        </td>
                        <td className="td whitespace-nowrap"><VerificationBadge status={normalizeTrackerVerification(f.verification_status)} /></td>
                        <td className="td whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={(TRACKER_STATUSES as readonly string[]).includes(String(f.status)) ? String(f.status) : "open"}
                              onChange={(e) => void changeStatus(f, e.target.value)}
                              aria-label={`Status of ${f.finding_key}`}
                              className={cx("input !h-7 !w-auto !py-0 !pr-8 text-xs", f.status === "regressed" && "!border-severity-critical/50 text-severity-critical")}
                            >
                              {TRACKER_STATUSES.map((s) => (
                                <option key={s} value={s}>{titleCase(s)}</option>
                              ))}
                            </select>
                            {f.retest_status && (
                              <span className={cx("chip text-[12px]", f.retest_status === "confirmed" ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : f.retest_status === "failed" ? "border-severity-critical/40 bg-severity-critical/10 text-severity-critical" : "border-slate-500/40 bg-slate-500/10 text-slate-400")}>
                                {f.retest_status}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="td hidden whitespace-nowrap 2xl:table-cell" title={`Updated ${timeAgo(f.updated_at)}`}>
                          <span className="text-[13px] text-slate-300">{days == null ? "Not set" : days === 0 ? "Today" : `${days}d`}</span>
                        </td>
                        {/* Last column: the two decisions an operator makes on this
                            page — remediate the finding, or verify it so it can be. */}
                        <td className="td sticky right-0 z-10 whitespace-nowrap border-l border-phantix-700/40 bg-card text-right shadow-[-10px_0_10px_-10px_rgba(0,0,0,0.55)]">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              title={
                                f.source_finding_id == null
                                  ? "This finding has no source row to attach fix guidance to"
                                  : inEvidence(f, "verified")
                                    ? "Open the AI remediation guidance for this finding"
                                    : "Verify this finding first: remediation guidance is for evidenced findings"
                              }
                              aria-label={`Remediation guidance for ${f.finding_key}`}
                              className={cx(
                                "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-40",
                                fixReady(f)
                                  ? "border-emerald-400/50 bg-emerald-400/20 text-emerald-200 hover:bg-emerald-400/30"
                                  : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20",
                              )}
                              disabled={f.source_finding_id == null || !inEvidence(f, "verified")}
                              onClick={() => void openFix(f)}
                            >
                              {fixReady(f) ? <CheckCircle2 size={13} /> : <Wrench size={13} />}
                              {fixReady(f) ? "Fix ready" : "Remediation"}
                            </button>
                            {normalizeTrackerVerification(f.verification_status) === "unverified" && (
                              <button
                                type="button"
                                title="Confirm this finding as evidence, or exclude it"
                                aria-label={`Verify ${f.finding_key}`}
                                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-severity-medium/40 bg-severity-medium/10 px-2.5 text-[12px] font-medium text-severity-medium hover:bg-severity-medium/20 disabled:cursor-not-allowed disabled:opacity-40"
                                onClick={() => { setVerifyTarget(f); setVerifyNote(""); }}
                              >
                                <ShieldCheck size={13} /> Verify
                              </button>
                            )}
                            <button
                              type="button"
                              title="Retest just this finding's asset; closes it automatically when the fix is confirmed"
                              aria-label={`Retest ${f.finding_key}`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gold-400/30 bg-gold-400/10 text-gold-300 hover:bg-gold-400/20 disabled:opacity-40"
                              disabled={CLOSED.has(String(f.status))}
                              onClick={() => { setRetestTarget(f); setRetestForm({ tool: "", note: "" }); }}
                            >
                              <RefreshCw size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              totalItems={filtered.length}
              page={page}
              pageSize={pageSize}
              onPageChange={(p) => {
                update({ page: p > 1 ? String(p) : null }, false);
                const el = tableTop.current;
                if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              onPageSizeChange={(n) => update({ size: n === DEFAULT_PAGE_SIZE ? null : String(n) }, false)}
              itemLabel="findings"
              keyboard
              pageSizeOptions={PAGE_SIZES}
            />
          </>
        )}
      </Card>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        Statuses move <strong className="text-slate-300">open → in progress → fixed</strong> (or accepted). A fixed finding that
        reappears is marked <strong className="text-severity-critical">regressed</strong>. The <strong className="text-slate-300">Actions</strong> column
        carries the two decisions: <strong className="text-emerald-300">Remediation</strong> opens the fix guidance for a verified
        finding, and <strong className="text-severity-medium">Verify</strong> confirms an unverified candidate or excludes it. Both need dual
        control when it is configured. Unverified findings stay off client reports but remain here until someone decides.
      </p>

      <Modal open={!!retestTarget} onClose={() => setRetestTarget(null)} title={retestTarget ? `Unit retest: ${retestTarget.finding_key}` : "Unit retest"}>
        {retestTarget && (
          <div className="space-y-4">
            <div className="rounded-xl border border-phantix-700/50 bg-phantix-950/50 p-3 text-sm">
              <p className="font-medium text-slate-100">{retestTarget.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <SeverityBadge severity={retestTarget.severity} />
                {retestTarget.asset_value && <span className="font-mono">{retestTarget.asset_value}</span>}
                {retestTarget.priority && <span>· {retestTarget.priority}</span>}
              </div>
            </div>
            <p className="rounded-lg bg-phantix-800/40 p-2.5 text-[13px] leading-5 text-slate-400">
              Runs a targeted scan of only this finding's asset with the tool family that originally flagged it (or the override
              below). If it comes back clean, the finding is <strong className="text-emerald-300">closed automatically as fixed</strong>.
            </p>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void runRetest(); }}>
              <div>
                <label className="label" htmlFor="retest-tool">Tool override (optional)</label>
                <input id="retest-tool" className="input" placeholder="nmap · nuclei · web · mobile …" value={retestForm.tool} onChange={(e) => setRetestForm((f) => ({ ...f, tool: e.target.value }))} />
              </div>
              <div>
                <label className="label" htmlFor="retest-note">Note (optional)</label>
                <textarea id="retest-note" className="input min-h-[64px] w-full resize-y" placeholder="e.g. patch applied, expecting a clean retest" value={retestForm.note} onChange={(e) => setRetestForm((f) => ({ ...f, note: e.target.value }))} />
              </div>
              <button className="btn-primary w-full" type="submit" disabled={retestBusy}>
                {retestBusy ? <Spinner className="h-4 w-4" /> : <RefreshCw size={14} />} Run unit retest
              </button>
              <p className="text-[12px] text-slate-500">
                <Lock size={10} className="mr-1 inline text-gold-400" /> Retesting needs an operate session when dual control is configured.
              </p>
            </form>
          </div>
        )}
      </Modal>

      {/* Verification: the second half of the Actions column. Confirming a
          finding makes it reportable; excluding keeps it off the report. */}
      <Modal
        open={!!verifyTarget}
        onClose={() => setVerifyTarget(null)}
        title={verifyTarget ? `Verify: ${verifyTarget.finding_key}` : "Verify finding"}
      >
        {verifyTarget && (
          <div className="space-y-4">
            <div className="rounded-xl border border-phantix-700/50 bg-phantix-950/50 p-3 text-sm">
              <p className="font-medium text-slate-100">{verifyTarget.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <SeverityBadge severity={verifyTarget.severity} />
                {verifyTarget.asset_value && <span className="font-mono">{verifyTarget.asset_value}</span>}
                {verifyTarget.priority && <span>· {verifyTarget.priority}</span>}
                <VerificationBadge status={normalizeTrackerVerification(verifyTarget.verification_status)} />
              </div>
            </div>
            <p className="rounded-lg bg-phantix-800/40 p-2.5 text-[13px] leading-5 text-slate-400">
              Confirming makes this finding reportable evidence: it enters the client report and unlocks the remediation guidance
              for it. A false positive or a rejected finding stays off reports.
            </p>
            <div>
              <label className="label" htmlFor="verify-note">Note (optional)</label>
              <textarea
                id="verify-note"
                className="input min-h-[64px] w-full resize-y"
                placeholder="e.g. reproduced against production, impact confirmed"
                value={verifyNote}
                onChange={(e) => setVerifyNote(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-primary !py-2 text-sm"
                type="button"
                disabled={verifyBusy !== null || normalizeTrackerVerification(verifyTarget.verification_status) === "manually_verified"}
                onClick={() => void runVerify("manually_verified")}
              >
                {verifyBusy === "manually_verified" ? <Spinner className="h-3.5 w-3.5" /> : <CheckCircle2 size={14} />} Verify
              </button>
              <button
                className="btn-danger !py-2 text-sm"
                type="button"
                disabled={verifyBusy !== null}
                onClick={() => void runVerify("false_positive")}
              >
                {verifyBusy === "false_positive" ? <Spinner className="h-3.5 w-3.5" /> : <AlertTriangle size={14} />} False positive
              </button>
              <button
                className="btn-secondary !py-2 text-sm"
                type="button"
                disabled={verifyBusy !== null}
                onClick={() => void runVerify("rejected")}
              >
                {verifyBusy === "rejected" ? <Spinner className="h-3.5 w-3.5" /> : <Ban size={14} />} Reject
              </button>
            </div>
            <p className="text-[12px] text-slate-500">
              <Lock size={10} className="mr-1 inline text-gold-400" /> Verification needs an operate session when dual control is configured.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={!!fixTarget}
        onClose={() => setFixTarget(null)}
        title={fixTarget ? `How to fix: ${fixTarget.title}` : "Fix guidance"}
        wide
      >
        {fixTarget && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={fixTarget.severity} />
              <span className="font-mono text-[12px] text-slate-500">{fixTarget.finding_key}</span>
              {fixBlock?.priority && <span className="chip capitalize">{fixBlock.priority}</span>}
              {fixBlock?.effort && <span className="chip capitalize text-slate-400">effort: {fixBlock.effort}</span>}
              {fixReady(fixTarget) && !fixBusy && (
                <button
                  type="button"
                  className="btn-secondary ml-auto !px-2 !py-1 !text-[12px]"
                  onClick={() => void generateFix(fixTarget)}
                >
                  <RefreshCw size={12} className="mr-1 inline" /> Regenerate
                </button>
              )}
            </div>

            {fixBusy && (
              <p className="flex items-center gap-2 text-[13px] text-slate-400">
                <Loader2 size={14} className="animate-spin text-gold-400" /> Generating fix guidance…
              </p>
            )}
            {fixError && !fixBusy && (
              <p className="flex items-start gap-1.5 text-[13px] text-severity-high">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" /> {fixError}
              </p>
            )}

            {fixBlock?.summary && <p className="text-[13px] leading-relaxed text-slate-200">{fixBlock.summary}</p>}

            {Array.isArray(fixBlock?.steps) && fixBlock!.steps!.length > 0 && (
              <ol className="space-y-2">
                {fixBlock!.steps!.filter((s) => String(s).trim()).map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-300">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-phantix-600/50 bg-phantix-800/60 text-[12px] font-semibold text-phantix-200">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            )}

            {fixBlock?.validation && (
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-emerald-300/80">How to confirm the fix</p>
                <p className="mt-1 text-[13px] leading-relaxed text-emerald-100/90">{fixBlock.validation}</p>
              </div>
            )}

            {Array.isArray(fixBlock?.references) && fixBlock!.references!.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <BookOpen size={13} className="text-slate-500" />
                {fixBlock!.references!.map((r, i) => (
                  <span key={i} className="chip border-slate-500/30 bg-slate-500/10 text-slate-400">{r}</span>
                ))}
              </div>
            )}

            <p className="flex items-center gap-1.5 text-[12px] text-slate-600">
              <Sparkles size={11} /> Generated by AI{fixBlock?.model ? ` · ${fixBlock.model}` : ""}
              {fixBlock?.generated_at ? ` · ${timeAgo(fixBlock.generated_at)}` : ""}
            </p>
            <p className="text-[12px] leading-5 text-slate-500">
              Apply the fix on the asset, then run a unit retest. A fix that is not retested stays open.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
