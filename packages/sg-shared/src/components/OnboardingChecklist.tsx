import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, Circle, X } from "lucide-react";
import { getActiveApplication, isDemoMode } from "../api";
import { PLATFORM_URL } from "../config";
import { loadAppFirsts, type AppFirst } from "../appFirsts";
import type { ApplicationKey } from "../applications";
import { cx } from "../utils";

const hiddenKey = (app: ApplicationKey) => `sg_firsts_hidden:${app}`;
function readHidden(app: ApplicationKey): boolean {
  try { return localStorage.getItem(hiddenKey(app)) === "1"; } catch { return false; }
}

/**
 * Getting started inside an application: that application's own firsts (see
 * appFirsts.ts), in the order a new user should do them. Hidden in the demo,
 * once hidden by the user on this browser, and once every required step is done.
 */
export default function OnboardingChecklist({ application }: { application?: ApplicationKey }) {
  const app = application ?? getActiveApplication();
  const [items, setItems] = useState<AppFirst[] | null>(null);
  const [hidden, setHidden] = useState(() => readHidden(app));

  useEffect(() => {
    if (isDemoMode() || hidden) return;
    let alive = true;
    void loadAppFirsts(app).then((list) => { if (alive) setItems(list); });
    return () => { alive = false; };
  }, [app, hidden]);

  if (hidden || !items || items.every((m) => m.done || m.optional)) return null;
  const done = items.filter((m) => m.done).length;
  // The first step not done yet is the one to do next.
  const next = items.find((m) => !m.done && !m.optional)?.key;

  const hide = () => {
    setHidden(true);
    try { localStorage.setItem(hiddenKey(app), "1"); } catch { /* hidden for this visit only */ }
  };

  return (
    <section aria-labelledby="onboarding-title" className="mb-5 rounded-md border border-phantix-700 bg-phantix-900 p-4">
      <div className="flex items-center gap-3">
        <h2 id="onboarding-title" className="text-sm font-semibold text-white">Getting started</h2>
        <span className="text-xs text-slate-500">{done} of {items.length} done</span>
        <button type="button" onClick={hide} className="ml-auto rounded p-1 text-slate-500 hover:text-slate-300" aria-label="Hide getting started">
          <X size={14} />
        </button>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-phantix-700/50">
        <div className="h-full rounded-full bg-gold-400 transition-[width] duration-700" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <ol className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((m, i) => {
          const body = (
            <>
              <Circle size={14} className={cx("shrink-0", m.key === next ? "text-gold-400" : "text-slate-600")} />
              <span className="min-w-0 flex-1"><span className="text-slate-500">{i + 1}. </span>{m.label}</span>
              {m.optional && <span className="text-[11px] text-slate-600">optional</span>}
              <ArrowUpRight size={12} className="shrink-0 text-gold-400" />
            </>
          );
          const rowClass = cx(
            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-phantix-800",
            m.key === next ? "bg-gold-400/[0.06] text-white" : "text-slate-200",
          );
          return (
            <li key={m.key}>
              {m.done ? (
                <span className="flex items-center gap-2 px-2 py-1.5 text-[13px] text-slate-500 line-through">
                  <CheckCircle2 size={14} className="shrink-0 text-emerald-400" /> {m.label}
                </span>
              ) : m.platform ? (
                <a href={`${PLATFORM_URL}${m.path}`} target="_blank" rel="noopener noreferrer" className={rowClass}>
                  {body}
                  <span className="sr-only">(opens the Platform in a new tab)</span>
                </a>
              ) : (
                <Link to={m.path} className={rowClass}>{body}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
