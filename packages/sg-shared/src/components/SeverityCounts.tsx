import React from "react";
import { SEVERITY_ORDER } from "../charts/palette";
import { cx, severityMeta } from "../utils";
import type { Severity } from "../types";

/**
 * A severity roll-up, as every count surface in the product returns it.
 *
 * Declared as explicit optional keys rather than an index signature so an
 * interface like `CodeSeverityCounts` is assignable without a cast.
 */
export type SeverityCount = Partial<Record<Severity, number>> & { total?: number };

/**
 * The severity roll-up chip strip.
 *
 * One component so the code-review header, the scan-history table and any future
 * roll-up cannot drift apart. Styling is the shipped code-review style: a neutral
 * chip with a severity-coloured dot, which stays legible beside the layer and
 * status chips that share the row.
 */
export default function SeverityCounts({
  counts,
  severities = SEVERITY_ORDER,
  className,
  hideEmpty = true,
}: {
  counts: SeverityCount | null | undefined;
  severities?: readonly string[];
  className?: string;
  /** When false, zero-severity entries still render — useful for a fixed grid. */
  hideEmpty?: boolean;
}) {
  const c = counts ?? {};
  const value = (sev: string) => Number((c as Record<string, number | undefined>)[sev] ?? 0);
  const shown = severities.filter((s) => !hideEmpty || value(s) > 0);
  if (!shown.length) return null;
  return (
    <div className={cx("flex flex-wrap items-center gap-1.5", className)}>
      {shown.map((sev) => {
        const m = severityMeta[sev as Severity] ?? severityMeta.info;
        return (
          <span
            key={sev}
            className="chip text-[12px] border-phantix-600/40 bg-phantix-800/50 text-slate-300"
            title={`${value(sev)} ${sev}`}
          >
            <span
              className={cx("mr-1 inline-block h-1.5 w-1.5 rounded-full", m.color.replace("text-", "bg-"))}
            />
            {value(sev)} {sev}
          </span>
        );
      })}
    </div>
  );
}
