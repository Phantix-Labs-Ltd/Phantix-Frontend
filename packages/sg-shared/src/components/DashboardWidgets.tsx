import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AnimatedNumber } from "../ui";
import { chartColors, useTheme } from "../theme";
import { tooltipStyles } from "../charts/ChartFrame";
import { cx } from "../utils";

const MONO = "'Geist Mono Variable', 'JetBrains Mono', ui-monospace, monospace";

// The dashboard look: raised grey cards, a blue area for a level over time and
// light-blue columns for a count per day, three y-ticks and sparse date labels.
const DASH = {
  dark: {
    card: "#2A2B2E",
    line: "#2F7FF0",
    fillOpacity: 0.55,
    bar: "#9FD6F7",
    grid: "rgba(255,255,255,0.10)",
    axis: "#9B9CA1",
  },
  light: {
    card: "#F4F4F5",
    line: "#1D6FE0",
    fillOpacity: 0.22,
    bar: "#7CC3EE",
    grid: "#E4E4E7",
    axis: "#71717A",
  },
} as const;

function useChartTheme() {
  const { theme } = useTheme();
  const mode = theme === "light" ? "light" : "dark";
  return { mode, c: chartColors(mode), tip: tooltipStyles(mode), d: DASH[mode] } as const;
}

/** Background for a dashboard card, matching the chart panels. */
export function useDashCard() {
  return useChartTheme().d.card;
}

/** The dashboard chart palette plus tooltip styles, for charts outside this file. */
export function useDashTheme() {
  const { d, tip } = useChartTheme();
  return { d, tip };
}

/** A rounded top for the y-axis plus the midpoint: 0, half, top. */
export function niceTicks(max: number, allowDecimals = false): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1, 2];
  const half = max / 2;
  const mag = 10 ** Math.floor(Math.log10(half));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 9, 10].find((n) => n * mag >= half)! * mag;
  const s = allowDecimals ? step : Math.max(1, Math.ceil(step));
  return [0, s, s * 2];
}

/** Up to `count` evenly spaced labels, always the first and the last. */
export function sparseTicks(labels: string[], count = 5): string[] {
  if (labels.length <= count) return labels;
  const out = new Set<string>();
  for (let i = 0; i < count; i++) out.add(labels[Math.round((i * (labels.length - 1)) / (count - 1))]);
  return Array.from(out);
}

/** "2026-10-01" or "10-01" reads as "10/1". */
export function shortDate(label: string): string {
  const m = /(?:\d{4}-)?(\d{1,2})-(\d{1,2})$/.exec(String(label));
  return m ? `${Number(m[1])}/${Number(m[2])}` : String(label);
}

export function compactNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(n / 1_000_000)}M`;
  }
  return n.toLocaleString();
}

// ── Delta chip ────────────────────────────────────────────────────────────────
/** `goodWhen` says which direction is an improvement: posture up is good, findings up is bad. */
export function Delta({
  value,
  unit = "%",
  goodWhen = "up",
}: {
  value: number | null;
  unit?: string;
  goodWhen?: "up" | "down";
}) {
  if (value == null || !Number.isFinite(value)) return null;
  const flat = value === 0;
  const good = flat ? null : (value > 0) === (goodWhen === "up");
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-0.5 font-mono text-[12px] font-semibold",
        good == null ? "text-slate-400" : good ? "text-emerald-400" : "text-severity-critical",
      )}
    >
      <Icon size={13} aria-hidden />
      {/* "0 pts" read as a score of zero; a flat line says so in words. */}
      {flat ? "no change" : `${Math.abs(value)}${unit}`}
    </span>
  );
}

// ── KPI tile ──────────────────────────────────────────────────────────────────
export function KpiTile({
  icon,
  label,
  value,
  suffix,
  delta,
  hint,
  to,
  delay = 0,
  size = "md",
  className,
}: {
  className?: string;
  icon: React.ReactNode;
  label: string;
  value: number | null;
  suffix?: string;
  delta?: React.ReactNode;
  hint: React.ReactNode;
  to?: string;
  delay?: number;
  size?: "md" | "lg";
}) {
  const card = useDashCard();
  const body = (
    <div className="flex items-center gap-3">
      {/* A small marker, not a feature graphic: the number is the content. */}
      <span
        className={cx(
          "flex shrink-0 items-center justify-center rounded-full border border-gold-400/30 bg-gold-400/10 text-gold-300 [&_svg]:h-4 [&_svg]:w-4",
          size === "lg" ? "h-9 w-9" : "h-8 w-8",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-slate-400">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <span
            className={cx(
              "font-mono font-semibold leading-none tracking-tight text-white",
              size === "lg" ? "text-[26px]" : "text-[22px]",
            )}
          >
            {value == null ? "Not set" : <AnimatedNumber value={value} />}
            {value != null && suffix ? <span className="text-[0.6em] text-slate-400">{suffix}</span> : null}
          </span>
          {delta}
        </div>
        <p className="mt-0.5 truncate text-[12px] text-slate-500">{hint}</p>
      </div>
    </div>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {to ? (
        <Link
          to={to}
          className="block h-full rounded-2xl px-5 py-4 transition-shadow hover:ring-1 hover:ring-white/10"
          style={{ backgroundColor: card }}
        >
          {body}
        </Link>
      ) : (
        <div className="h-full rounded-2xl px-5 py-4" style={{ backgroundColor: card }}>
          {body}
        </div>
      )}
    </motion.div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
export function Panel({
  title,
  figure,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
  delay = 0,
}: {
  title: string;
  /** The headline number, set beside the title in a lighter weight ("API requests 15,479"). */
  figure?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  delay?: number;
}) {
  const card = useDashCard();
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cx("flex min-w-0 flex-col rounded-2xl p-5", className)}
      style={{ backgroundColor: card }}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-baseline gap-x-1.5 text-[14px] font-semibold leading-snug text-slate-100">
            <span>{title}</span>
            {figure != null ? (
              <span className="inline-flex items-baseline gap-1.5 font-normal tabular-nums text-slate-400">{figure}</span>
            ) : null}
          </h3>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cx("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </motion.section>
  );
}

export function ViewAll({ to, label = "View all" }: { to: string; label?: string }) {
  return (
    <Link to={to} className="-my-1 -mr-1.5 inline-flex rounded-md px-1.5 py-1 text-xs font-semibold text-gold-400 hover:bg-gold-400/10 hover:text-gold-300">
      {label}
    </Link>
  );
}

export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-slate-500">{children}</p>;
}

// ── Compact table ─────────────────────────────────────────────────────────────
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function MiniTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  empty,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, i: number) => string | number;
  rowHref?: (row: T) => string;
  empty: string;
}) {
  if (rows.length === 0) return <PanelEmpty>{empty}</PanelEmpty>;
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-phantix-700/60 text-[12px] font-medium text-slate-500">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx("whitespace-nowrap px-3 py-2 font-medium first:pl-4 last:pr-4", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="border-b border-phantix-800/70 last:border-0 hover:bg-phantix-900/70">
              {columns.map((c, ci) => (
                <td
                  key={c.key}
                  className={cx(
                    "px-3 py-2.5 text-slate-300 first:pl-4 last:pr-4",
                    // The first column absorbs the slack and truncates; the rest stay on one line.
                    ci === 0 ? "w-full min-w-[7rem] max-w-0 truncate" : "whitespace-nowrap",
                    c.className,
                  )}
                >
                  {ci === 0 && rowHref ? (
                    <Link to={rowHref(row)} className="block truncate hover:text-gold-300">
                      {c.render(row)}
                    </Link>
                  ) : (
                    c.render(row)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────
export interface SeriesPoint {
  label: string;
  /** null for a day with nothing to plot; the line bridges it rather than dropping to 0. */
  value: number | null;
}

function maxOf(points: SeriesPoint[]): number {
  return points.reduce((m, p) => (p.value != null && p.value > m ? p.value : m), 0);
}

function TrendAxes({ points, ticks, d }: { points: SeriesPoint[]; ticks: number[]; d: (typeof DASH)["dark" | "light"] }) {
  const tick = { fill: d.axis, fontSize: 12 };
  return (
    <>
      <CartesianGrid stroke={d.grid} vertical={false} />
      <XAxis
        dataKey="label"
        ticks={sparseTicks(points.map((p) => p.label))}
        interval={0}
        tickFormatter={shortDate}
        tick={tick}
        tickLine={false}
        axisLine={false}
        tickMargin={8}
      />
      <YAxis
        domain={[0, ticks[ticks.length - 1]]}
        ticks={ticks}
        tickFormatter={compactNumber}
        tick={tick}
        tickLine={false}
        axisLine={false}
        width={44}
      />
    </>
  );
}

/**
 * A level over time (the posture score) as a smooth filled area.
 * `scale="score"` fixes the axis at 0–100; otherwise it rounds up from the data.
 */
export function AreaTrend({
  points,
  height = 200,
  name,
  scale = "score",
}: {
  points: SeriesPoint[];
  height?: number;
  name: string;
  scale?: "score" | "auto";
}) {
  const { d, tip } = useChartTheme();
  const ticks = scale === "score" ? [0, 50, 100] : niceTicks(maxOf(points));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
        <TrendAxes points={points} ticks={ticks} d={d} />
        <Tooltip
          {...tip}
          cursor={{ stroke: d.axis, strokeDasharray: "3 3" }}
          labelFormatter={(l: string) => shortDate(l)}
          formatter={(v: number) => [v, name]}
        />
        <Area
          type="monotone"
          dataKey="value"
          name={name}
          stroke={d.line}
          strokeWidth={2}
          fill={d.line}
          fillOpacity={d.fillOpacity}
          connectNulls
          dot={false}
          activeDot={{ r: 4, fill: d.line, stroke: d.card, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** A count per day as light-blue columns. */
export function ColumnTrend({ points, height = 200, name }: { points: SeriesPoint[]; height?: number; name: string }) {
  const { d, tip } = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -8 }} barCategoryGap="28%">
        <TrendAxes points={points} ticks={niceTicks(maxOf(points))} d={d} />
        <Tooltip
          {...tip}
          cursor={{ fill: d.grid }}
          labelFormatter={(l: string) => shortDate(l)}
          formatter={(v: number) => [v, name]}
        />
        <Bar dataKey="value" name={name} fill={d.bar} radius={[3, 3, 0, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Donut with the total in the hole and a labeled legend (never color alone).
 *
 * Hovering a slice (or its legend row) swaps the hole's figure for that slice's
 * count and share. There is no floating tooltip: the ring is only 160px wide,
 * so Recharts drew the tooltip inside it, right over the total, and neither
 * could be read.
 */
export function Donut({ slices, centerLabel }: { slices: Slice[]; centerLabel: string }) {
  const { c } = useChartTheme();
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const shown = slices.filter((s) => s.value > 0);
  const active = shown.find((s) => s.key === activeKey) ?? null;
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-[160px] w-[160px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={shown.length ? shown : [{ key: "none", label: "None", value: 1, color: c.grid }]}
              dataKey="value"
              nameKey="label"
              innerRadius={52}
              outerRadius={76}
              paddingAngle={shown.length > 1 ? 2 : 0}
              stroke={c.surface}
              strokeWidth={2}
              isAnimationActive
              onMouseEnter={(_: unknown, i: number) => setActiveKey(shown[i]?.key ?? null)}
              onMouseLeave={() => setActiveKey(null)}
            >
              {(shown.length ? shown : [{ key: "none", color: c.grid }]).map((s) => (
                <Cell
                  key={s.key}
                  fill={s.color}
                  fillOpacity={active && active.key !== s.key ? 0.35 : 1}
                  style={{ transition: "fill-opacity 150ms ease-out", outline: "none" }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
          aria-live="polite"
        >
          {active ? (
            <>
              <span className="font-mono text-2xl font-semibold text-white">{active.value.toLocaleString()}</span>
              <span className="max-w-[92px] truncate text-[12px] font-medium" style={{ color: active.color }}>
                {active.label} · {pct(active.value)}%
              </span>
            </>
          ) : (
            <>
              <span className="font-mono text-2xl font-semibold text-white">{total.toLocaleString()}</span>
              <span className="text-[12px] text-slate-500">{centerLabel}</span>
            </>
          )}
        </div>
      </div>
      <ul className="grid w-full min-w-0 grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-2">
        {slices.map((s) => (
          <li
            key={s.key}
            onMouseEnter={() => s.value > 0 && setActiveKey(s.key)}
            onMouseLeave={() => setActiveKey(null)}
            className={cx(
              "-mx-1.5 flex items-center gap-2.5 rounded px-1.5 text-[13px] transition-colors",
              active?.key === s.key && "bg-white/[0.04]",
            )}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-slate-300">{s.label}</span>
            <span className="font-mono text-slate-200">{s.value}</span>
            <span className="w-10 text-right font-mono text-[12px] text-slate-500">{pct(s.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranked horizontal meters — one measure across categories, single hue. */
export function RankedBars({
  rows,
  scale = "max",
  total,
}: {
  rows: { key: string; label: string; value: number; icon?: React.ReactNode; to?: string }[];
  /**
   * `max` (default): bars relative to the largest row, for a ranking.
   * `share`: each bar is its share of the total, for a breakdown that adds up
   * (one of two campaigns is half a bar, not a full one).
   */
  scale?: "max" | "share";
  /** For `share`: the whole the rows are a share of, when only the top rows are shown. */
  total?: number;
}) {
  const max =
    scale === "share"
      ? Math.max(1, total ?? rows.reduce((n, r) => n + r.value, 0))
      : Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex items-center gap-2.5">
              {r.icon ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-phantix-700 bg-phantix-900 text-gold-300">
                  {r.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-300">{r.label}</span>
              <span className="font-mono text-[13px] font-semibold text-slate-100">{r.value.toLocaleString()}</span>
            </div>
            <div className={cx("mt-1.5 h-1.5 overflow-hidden rounded-full bg-phantix-800", r.icon ? "ml-[38px]" : null)}>
              <motion.div
                className="h-full rounded-full bg-gold-400"
                initial={{ width: 0 }}
                animate={{ width: `${(r.value / max) * 100}%` }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </>
        );
        return (
          <li key={r.key}>
            {r.to ? (
              <Link to={r.to} className="block rounded-sm hover:opacity-90" title={`${r.label}: ${r.value}`}>
                {inner}
              </Link>
            ) : (
              <div title={`${r.label}: ${r.value}`}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
