import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "../utils";
import { useDismiss } from "../useDismiss";
import type { DateRangeValue, RangePreset } from "../preferences";

/*
 * Date filter for overviews: a preset menu (Today … Last year, Custom range)
 * beside a button showing the resolved dates, which opens a two-month range
 * calendar. Dates are local calendar days as "YYYY-MM-DD"; the furthest back
 * a range can start is `maxDays` before today (the trend APIs serve a year).
 */

export const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "3m", label: "Last 3 months" },
  { key: "6m", label: "Last 6 months" },
  { key: "1y", label: "Last year" },
  { key: "custom", label: "Custom range" },
];

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export const fmtDay = (s: string) => { const d = parseDay(s); return `${d.getDate()} ${SHORT[d.getMonth()]} ${d.getFullYear()}`; };

export interface ResolvedRange { start: string; end: string; days: number; label: string }

/** Concrete dates for a preset or a custom range (custom is clamped to `maxDays`). */
export function resolveRange(v: DateRangeValue, maxDays = 365): ResolvedRange {
  const end = today();
  const startFor: Record<Exclude<RangePreset, "custom">, Date> = {
    today: end,
    "7d": addDays(end, -6),
    "30d": addDays(end, -29),
    "3m": new Date(end.getFullYear(), end.getMonth() - 3, end.getDate()),
    "6m": new Date(end.getFullYear(), end.getMonth() - 6, end.getDate()),
    "1y": addDays(end, -(maxDays - 1)),
  };
  let s: Date;
  let e: Date = end;
  if (v.preset === "custom" && v.start && v.end) {
    s = parseDay(v.start);
    e = parseDay(v.end);
  } else {
    s = startFor[(v.preset === "custom" ? "30d" : v.preset) as Exclude<RangePreset, "custom">];
  }
  const floor = addDays(end, -(maxDays - 1));
  if (s < floor) s = floor;
  if (e > end) e = end;
  if (e < s) e = s;
  const days = Math.round((e.getTime() - s.getTime()) / 864e5) + 1;
  const label = PRESETS.find((p) => p.key === v.preset)?.label ?? "Custom range";
  return { start: isoDay(s), end: isoDay(e), days, label };
}

/** How many trailing days a trend API must return to cover the range. */
export const daysBackFor = (r: ResolvedRange) =>
  Math.round((today().getTime() - parseDay(r.start).getTime()) / 864e5) + 1;

/**
 * Keep only the points inside the range. Points whose day isn't an ISO date
 * (an older trend source labels days "Jul 8") are kept: they were already
 * fetched for this window.
 */
export function withinRange<T>(points: T[], r: ResolvedRange, day: (p: T) => string): T[] {
  return points.filter((p) => {
    const d = String(day(p) ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return true;
    return d >= r.start && d <= r.end;
  });
}

function Month({ month, draft, hover, onPick, onHover, min, max }: {
  month: Date; draft: { start: string | null; end: string | null }; hover: string | null;
  onPick: (d: string) => void; onHover: (d: string | null) => void; min: string; max: string;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => isoDay(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  const lo = draft.start;
  const hi = draft.end ?? (lo && hover && hover > lo ? hover : null);
  const now = isoDay(today());

  return (
    <div className="w-full sm:w-[16.5rem]">
      <p className="mb-3 text-center text-sm font-semibold text-white">{MONTHS[month.getMonth()]} {month.getFullYear()}</p>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((w) => <span key={w} className="pb-1 text-[11px] font-medium text-slate-500">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const disabled = d < min || d > max;
          const edge = d === lo || d === hi;
          const inside = !!lo && !!hi && d > lo && d < hi;
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover(d)}
              aria-pressed={edge}
              aria-label={fmtDay(d)}
              className={cx(
                "relative h-9 text-[13px] transition-colors disabled:cursor-not-allowed disabled:text-slate-700",
                inside && "bg-gold-400/15 text-slate-100",
                edge ? "rounded-md bg-gold-400 font-semibold text-phantix-950" : !disabled && !inside && "rounded-md text-slate-300 hover:bg-phantix-800",
                d === now && !edge && "font-semibold text-gold-300",
              )}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangeFilter({ value, onChange, maxDays = 365, className }: {
  value: DateRangeValue; onChange: (v: DateRangeValue) => void; maxDays?: number; className?: string;
}) {
  const resolved = resolveRange(value, maxDays);
  const [menuOpen, setMenuOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [draft, setDraft] = useState<{ start: string | null; end: string | null }>({ start: resolved.start, end: resolved.end });
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState(() => addMonths(parseDay(resolved.end), -1));
  const menuRef = useDismiss(menuOpen, () => setMenuOpen(false));
  const calRef = useDismiss(calOpen, () => setCalOpen(false));
  const min = isoDay(addDays(today(), -(maxDays - 1)));
  const max = isoDay(today());
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const openCalendar = () => {
    setDraft({ start: resolved.start, end: resolved.end });
    setView(addMonths(parseDay(resolved.end), phone ? 0 : -1));
    setHover(null);
    setCalOpen(true);
  };

  const pick = (d: string) => {
    if (!draft.start || draft.end || d < draft.start) setDraft({ start: d, end: null });
    else setDraft({ start: draft.start, end: d });
  };

  const months = useMemo(() => (phone ? [view] : [view, addMonths(view, 1)]), [phone, view]);
  const canPrev = isoDay(addDays(view, -1)) >= min.slice(0, 8) + "01";
  const canNext = isoDay(addMonths(view, phone ? 1 : 2)) <= max;
  const draftLabel = draft.start ? `${fmtDay(draft.start)}${draft.end ? ` to ${fmtDay(draft.end)}` : " to …"}` : "Pick a start date";

  return (
    <div className={cx("flex flex-wrap items-center gap-2", className)}>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          className="inline-flex items-center gap-2 rounded-md border border-phantix-700 bg-phantix-900 px-3 py-2 text-xs font-medium text-slate-200 hover:border-phantix-600"
        >
          {resolved.label} <ChevronDown size={13} className={cx("text-slate-500 transition-transform", menuOpen && "rotate-180")} />
        </button>
        {menuOpen && (
          <ul role="listbox" aria-label="Date range" className="absolute left-0 top-full z-[60] mt-1.5 w-48 overflow-hidden rounded-lg border border-phantix-700 bg-phantix-900 py-1 shadow-card">
            {PRESETS.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value.preset === p.key}
                  onClick={() => {
                    setMenuOpen(false);
                    if (p.key === "custom") openCalendar();
                    else onChange({ preset: p.key });
                  }}
                  className={cx(
                    "flex w-full items-center justify-between px-3 py-2 text-left text-[13px]",
                    value.preset === p.key ? "bg-gold-400/10 font-medium text-gold-300" : "text-slate-300 hover:bg-phantix-800",
                  )}
                >
                  {p.label} {value.preset === p.key && <Check size={14} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div ref={calRef} className="relative">
        <button
          type="button"
          onClick={() => (calOpen ? setCalOpen(false) : openCalendar())}
          aria-expanded={calOpen}
          className="inline-flex items-center gap-2 rounded-md border border-phantix-700 bg-phantix-900 px-3 py-2 text-xs font-medium text-slate-200 hover:border-phantix-600"
        >
          {resolved.start === resolved.end ? fmtDay(resolved.start) : `${fmtDay(resolved.start)} to ${fmtDay(resolved.end)}`}
          <CalendarDays size={14} className="text-gold-400" />
        </button>
        {calOpen && (
          <div
            role="dialog"
            aria-label="Choose a date range"
            className="fixed inset-x-3 top-20 z-[60] rounded-xl border border-phantix-700 bg-phantix-900 shadow-card sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-1.5"
            onMouseLeave={() => setHover(null)}
          >
            <div className="relative flex gap-6 p-4">
              <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => setView((v) => addMonths(v, -1))}
                className="absolute left-4 top-3.5 rounded-md p-1 text-slate-400 hover:bg-phantix-800 hover:text-white disabled:opacity-30">
                <ChevronLeft size={16} />
              </button>
              <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => setView((v) => addMonths(v, 1))}
                className="absolute right-4 top-3.5 rounded-md p-1 text-slate-400 hover:bg-phantix-800 hover:text-white disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
              {months.map((m) => (
                <Month key={isoDay(m)} month={m} draft={draft} hover={hover} onPick={pick} onHover={setHover} min={min} max={max} />
              ))}
            </div>
            <div className="px-4 pb-3">
              <button type="button" className="text-[13px] font-medium text-gold-400 hover:text-gold-300"
                onClick={() => setView(addMonths(today(), phone ? 0 : -1))}>
                Go to today
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-phantix-700/60 px-4 py-3">
              <span className="text-[13px] text-slate-400">{draftLabel}</span>
              <span className="flex gap-2">
                <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setCalOpen(false)}>Cancel</button>
                <button
                  type="button"
                  className="btn-primary !py-1.5 text-xs"
                  disabled={!draft.start}
                  onClick={() => {
                    const start = draft.start!;
                    const end = draft.end ?? start;
                    setCalOpen(false);
                    onChange({ preset: "custom", start, end });
                  }}
                >
                  Apply range
                </button>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DateRangeFilter;
