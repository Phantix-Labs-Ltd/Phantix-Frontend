import React from "react";
import { AlertTriangle, ArrowRight, Gauge, Layers, ShieldCheck } from "lucide-react";
import { cx } from "../utils";

/**
 * Risk prioritisation, rendered from `/reports/risk/priority`.
 *
 * The three panels deliberately do not merge their numbers:
 *  - KRI is one exposure figure, with its drivers and what it excludes;
 *  - assets are ranked by *attention*, not by finding count;
 *  - each finding shows **severity and exploitability separately**, because they are
 *    different questions and fusing them is how real risk gets deprioritised.
 */

export interface FindingAxes {
  id: number;
  title: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  severity_basis?: string;
  exploitability: "unknown" | "difficult" | "moderate" | "easy" | "trivial";
  exploitability_basis?: string;
  priority: "immediate" | "scheduled" | "planned";
  priority_reason?: string;
  provenance?: { chain: { step: string; at: string | null; actor: string | null }[]; gaps: string[]; handoffs: { from: string; to: string; step: string }[]; completeness: number };
}

export interface AssetPriorityRow {
  rank: number;
  asset_id: number | null;
  asset: string | null;
  score: number;
  band: string;
  exposure: string;
  criticality: string;
  verified_findings: number;
  unverified_findings: number;
  drivers: string[];
  top_findings: { id: number; title: string; severity: string; exploitability: string }[];
}

export interface KriSummary {
  value: number;
  band: string;
  counted_findings: number;
  formula: string;
  drivers: { finding_id: number; title: string; weight: number }[];
  excluded: { unverified: number; closed: number };
  coverage: { total_findings: number; counted_ratio: number };
}

const SEV_TONE: Record<string, string> = {
  critical: "border-red-400/40 bg-red-400/10 text-red-200",
  high: "border-orange-400/40 bg-orange-400/10 text-orange-200",
  medium: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  low: "border-sky-400/40 bg-sky-400/10 text-sky-200",
  info: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

const EXP_TONE: Record<string, string> = {
  trivial: "border-red-400/40 bg-red-400/10 text-red-200",
  easy: "border-orange-400/40 bg-orange-400/10 text-orange-200",
  moderate: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  difficult: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  unknown: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

function Pill({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]", tone)}>
      <span className="opacity-60">{label}</span>
      <span className="font-semibold capitalize">{value}</span>
    </span>
  );
}

/** One finding: severity and exploitability side by side, never merged. */
export function FindingAxesRow({ finding }: { finding: FindingAxes }) {
  const p = finding.provenance;
  return (
    <div className="rounded-lg border border-phantix-700/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-200">{finding.title}</span>
        <Pill label="severity" value={finding.severity} tone={SEV_TONE[finding.severity] ?? SEV_TONE.info} />
        <Pill label="exploitability" value={finding.exploitability} tone={EXP_TONE[finding.exploitability] ?? EXP_TONE.unknown} />
        <span className="text-[11px] uppercase tracking-wide text-slate-500">priority: {finding.priority}</span>
      </div>
      {finding.priority_reason && (
        <p className="mt-1 text-[12px] leading-4 text-slate-500">{finding.priority_reason}</p>
      )}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-600">
        {finding.severity_basis && <span>basis: {finding.severity_basis}</span>}
        {finding.exploitability_basis && <span>reach: {finding.exploitability_basis}</span>}
      </div>
      {p && p.handoffs.length > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
          {p.handoffs.map((h, i) => (
            <React.Fragment key={`${h.from}-${h.to}-${i}`}>
              <span>{h.from}</span>
              <ArrowRight size={10} />
              <span>{h.to}</span>
              {i < p.handoffs.length - 1 && <span className="text-slate-700">·</span>}
            </React.Fragment>
          ))}
        </p>
      )}
      {p && p.gaps.length > 0 && (
        <p className="mt-1 text-[11px] text-amber-300/70">not yet recorded: {p.gaps.join(", ")}</p>
      )}
    </div>
  );
}

export function KriPanel({ kri }: { kri: KriSummary }) {
  const tone =
    kri.band === "critical" ? "text-red-300" : kri.band === "high" ? "text-orange-300" : kri.band === "moderate" ? "text-amber-300" : "text-emerald-300";
  return (
    <div className="rounded-xl border border-phantix-700/40 p-4">
      <p className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-slate-500">
        <Gauge size={13} /> Key risk indicator
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className={cx("font-display text-3xl font-semibold", tone)}>{kri.value}</span>
        <span className={cx("text-sm capitalize", tone)}>{kri.band}</span>
        <span className="text-[12px] text-slate-600">from {kri.counted_findings} verified findings</span>
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-600">{kri.formula}</p>
      <p className="mt-1.5 text-[11px] text-slate-500">
        Excluded: {kri.excluded.unverified} unverified (a queue, not risk) · {kri.excluded.closed} closed.
        Coverage {Math.round((kri.coverage.counted_ratio ?? 0) * 100)}% of {kri.coverage.total_findings}.
      </p>
      {kri.drivers.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12px] text-slate-400">
          {kri.drivers.slice(0, 5).map((d) => (
            <li key={d.finding_id} className="flex justify-between gap-3">
              <span className="truncate">{d.title}</span>
              <span className="tabular-nums text-slate-500">{d.weight}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AssetPriorityList({ assets }: { assets: AssetPriorityRow[] }) {
  return (
    <div className="rounded-xl border border-phantix-700/40">
      <p className="flex items-center gap-1.5 border-b border-phantix-700/40 px-4 py-2.5 text-[12px] uppercase tracking-wide text-slate-500">
        <Layers size={13} /> Assets by attention, not finding count
      </p>
      <ul className="divide-y divide-phantix-800/40">
        {assets.map((a) => (
          <li key={`${a.rank}-${a.asset_id}`} className="px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-[12px] tabular-nums text-slate-600">#{a.rank}</span>
              <span className="text-sm font-medium text-slate-200">{a.asset ?? `asset ${a.asset_id}`}</span>
              <span className="chip">{a.band}</span>
              <span className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
                <ShieldCheck size={11} /> {a.verified_findings} verified
                {a.unverified_findings > 0 && (
                  <span className="flex items-center gap-1 text-amber-300/70">
                    <AlertTriangle size={10} /> {a.unverified_findings} unverified
                  </span>
                )}
                <span className="tabular-nums text-slate-400">{a.score}</span>
              </span>
            </div>
            <p className="mt-0.5 pl-8 text-[11px] text-slate-600">
              {a.drivers.slice(0, 3).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
