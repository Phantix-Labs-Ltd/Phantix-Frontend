import { CircleDashed, CircleHelp, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { ProgressRing } from "@sg/ui";
import { cx } from "@sg/utils";
import {
  ENGAGEMENT_STAGES, OPINION_LABEL, OPINION_RULE, RESULT_LABEL, SOURCE_LABEL, STATUS_LABEL,
  type EngagementStatus, type Opinion, type TestResult,
} from "@sg/assurance";

const OPINION_TONE: Record<Opinion, { cls: string; icon: React.ReactNode }> = {
  ready: { cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", icon: <ShieldCheck size={12} /> },
  ready_with_exceptions: { cls: "border-gold-400/30 bg-gold-400/10 text-gold-300", icon: <ShieldAlert size={12} /> },
  not_ready: { cls: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical", icon: <ShieldX size={12} /> },
  // Neutral on purpose: "we couldn't tell" must never read as a pass.
  inconclusive: { cls: "border-phantix-600 bg-phantix-800 text-slate-300", icon: <CircleHelp size={12} /> },
};

export function OpinionBadge({ opinion, withRule }: { opinion: Opinion | null | undefined; withRule?: boolean }) {
  if (!opinion) return <span className="text-xs text-slate-500">No opinion yet</span>;
  const t = OPINION_TONE[opinion];
  return (
    <span className="inline-flex flex-col gap-1">
      <span className={cx("inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", t.cls)}>
        {t.icon} {OPINION_LABEL[opinion]}
      </span>
      {withRule && <span className="text-[12px] text-slate-500">{OPINION_RULE[opinion]}</span>}
    </span>
  );
}

/** Lifecycle: planned → scoping → fieldwork → testing → reporting → completed → archived. */
export function StageStrip({ status, compact }: { status: EngagementStatus; compact?: boolean }) {
  const at = ENGAGEMENT_STAGES.indexOf(status);
  if (compact) {
    return <span className="inline-flex items-center gap-1.5 text-xs text-slate-300"><span className="h-1.5 w-1.5 rounded-full bg-gold-400" />{STATUS_LABEL[status]}</span>;
  }
  return (
    <ol className="flex w-full items-center gap-1" aria-label={`Stage: ${STATUS_LABEL[status]}`}>
      {ENGAGEMENT_STAGES.map((s, i) => (
        <li key={s} className="min-w-0 flex-1" aria-current={i === at ? "step" : undefined}>
          <div className={cx("h-1.5 rounded-full", i < at ? "bg-emerald-400/70" : i === at ? "bg-gold-400" : "bg-phantix-700/60")} />
          <span className={cx("mt-1 block truncate text-[11px]", i === at ? "text-gold-300" : "text-slate-500")}>{STATUS_LABEL[s]}</span>
        </li>
      ))}
    </ol>
  );
}

/** 0–100 readiness. `null` means not enough has been tested — shown as such, not as 0%. */
export function ReadinessRing({ score, size = 96 }: { score: number | null | undefined; size?: number }) {
  if (score == null) {
    return (
      <div className="flex flex-col items-center justify-center text-center" style={{ width: size, height: size }}>
        <CircleDashed size={size * 0.4} className="text-phantix-600" />
        <span className="mt-1 text-[11px] leading-3 text-slate-500">Not enough tested</span>
      </div>
    );
  }
  const color = score >= 90 ? "rgb(52 211 153)" : score >= 70 ? "rgb(var(--gold-400))" : "rgb(var(--severity-critical))";
  return (
    <ProgressRing value={score} size={size} stroke={8} color={color}>
      <span className="font-display text-xl font-bold text-white">{Math.round(score)}%</span>
    </ProgressRing>
  );
}

const RESULT_TONE: Record<TestResult, string> = {
  effective: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  partially_effective: "border-gold-400/30 bg-gold-400/10 text-gold-300",
  ineffective: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
  not_tested: "border-phantix-600 bg-phantix-800 text-slate-400",
  na: "border-phantix-700 bg-phantix-900 text-slate-500",
};

export function ResultChip({ result }: { result: TestResult }) {
  return <span className={cx("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", RESULT_TONE[result])}>{RESULT_LABEL[result]}</span>;
}

/** Independent sources on a control; "2+ sources" when they agree from different places. */
export function SourceChips({ sources, correlated }: { sources: string[]; correlated?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {sources.map((s) => (
        <span key={s} className="rounded border border-phantix-700 px-1.5 py-0.5 text-[11px] text-slate-300">{SOURCE_LABEL[s] ?? s}</span>
      ))}
      {correlated && <span className="rounded border border-severity-critical/40 bg-severity-critical/10 px-1.5 py-0.5 text-[11px] font-semibold text-red-300">2+ sources</span>}
    </span>
  );
}

const BAR: { key: "effective" | "partially_effective" | "ineffective" | "not_tested"; color: string }[] = [
  { key: "effective", color: "bg-emerald-400" },
  { key: "partially_effective", color: "bg-gold-400" },
  { key: "ineffective", color: "bg-severity-critical" },
  { key: "not_tested", color: "bg-phantix-600" },
];

export function EffectivenessBar({ counts }: { counts: Partial<Record<TestResult, number>> }) {
  const total = BAR.reduce((n, b) => n + (counts[b.key] ?? 0), 0);
  if (!total) return <p className="text-sm text-slate-500">No controls tested yet.</p>;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-phantix-800" role="img"
        aria-label={BAR.filter((b) => counts[b.key]).map((b) => `${counts[b.key]} ${RESULT_LABEL[b.key]}`).join(", ")}>
        {BAR.map((b) => (counts[b.key] ? <div key={b.key} className={b.color} style={{ width: `${((counts[b.key] ?? 0) / total) * 100}%` }} /> : null))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {BAR.filter((b) => counts[b.key]).map((b) => (
          <li key={b.key} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className={cx("h-2 w-2 rounded-full", b.color)} /> {counts[b.key]} {RESULT_LABEL[b.key].toLowerCase()}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Inline server message (separation of duties etc.), not just a toast. */
export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-md border border-severity-critical/30 bg-severity-critical/5 px-3 py-2 text-sm text-red-200">{message}</p>;
}

export const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

export const isOverdue = (v: string | null | undefined) => Boolean(v && new Date(v).getTime() < Date.now());

/** The human message from an API error (server 400s carry the SoD explanation). */
export const errMsg = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
