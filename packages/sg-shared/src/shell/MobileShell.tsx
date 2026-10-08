// Phone shell for the applications (Core, Attack, Defend, Code). Below md the
// sidebar becomes a bottom tab bar built from the app's own nav sections (first
// four as tabs, then "More"), and "More" opens a bottom sheet with every page
// grouped by section plus the account, application switcher and settings.

import React, { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Monitor, Moon, MoreHorizontal, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "../theme";
import type { NavLeaf, NavSection } from "./types";

const TAB_COUNT = 4;

/** Tab label: long section names ("Assets and exposure") keep their first word. */
function tabLabel(label: string): string {
  return label.length > 11 ? label.split(/s+/)[0] : label;
}

function hit(to: string, pathname: string): boolean {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

/** The section holding the current page (longest matching route wins). */
function activeSection(nav: NavSection[], pathname: string): string | null {
  let best: { label: string; length: number } | null = null;
  for (const s of nav) {
    for (const i of s.items) {
      if (hit(i.to, pathname) && (!best || i.to.length > best.length)) best = { label: s.label, length: i.to.length };
    }
  }
  return best?.label ?? null;
}

/** Title for the phone app bar: the current page's nav label. */
export function usePhoneTitle(nav: NavSection[], fallback: string): string {
  const { pathname } = useLocation();
  let best: NavLeaf | null = null;
  for (const s of nav) for (const i of s.items) if (hit(i.to, pathname) && (!best || i.to.length > best.to.length)) best = i;
  return best?.label ?? fallback;
}

export function MobileTabBar({ nav, moreOpen, onMore }: { nav: NavSection[]; moreOpen: boolean; onMore: () => void }) {
  const { pathname } = useLocation();
  const tabs = nav.filter((s) => s.items.length > 0).slice(0, TAB_COUNT);
  const current = activeSection(nav, pathname);
  const onTab = tabs.some((t) => t.label === current);
  const itemCls = "tap flex min-h-[56px] flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium transition-colors";
  const pill = (on: boolean) => `flex h-7 w-12 items-center justify-center rounded-full transition-colors ${on ? "bg-gold-400/15" : ""}`;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-phantix-700/50 bg-[rgb(var(--surface-card)/0.97)] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map((s) => {
          const on = current === s.label && !moreOpen;
          return (
            <NavLink key={s.label} to={s.items[0].to} className={`${itemCls} ${on ? "text-gold-300" : "text-slate-500"}`}>
              <span className={pill(on)}>{s.icon ?? s.items[0].icon}</span>
              <span className="max-w-full truncate">{tabLabel(s.label)}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          aria-expanded={moreOpen}
          className={`${itemCls} ${moreOpen || !onTab ? "text-gold-300" : "text-slate-500"}`}
        >
          <span className={pill(moreOpen || !onTab)}>
            <MoreHorizontal size={21} />
          </span>
          More
        </button>
      </div>
    </nav>
  );
}

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun size={15} /> },
  { value: "dark", label: "Dark", icon: <Moon size={15} /> },
  { value: "system", label: "Auto", icon: <Monitor size={15} /> },
];

export function MobileMoreSheet({
  open,
  onClose,
  nav,
  account,
  status,
  apps,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  nav: NavSection[];
  /** Name, email, organization and role. */
  account: React.ReactNode;
  /** Dual control / operate status card. */
  status?: React.ReactNode;
  /** Application switcher tiles. */
  apps?: React.ReactNode;
  /** Account rows (switch org, platform settings, docs, sign out...). */
  actions: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const { mode, setTheme } = useTheme();

  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="More"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 500) onClose(); }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-3xl border-t border-phantix-600/60 bg-[rgb(var(--surface-card))] pb-[calc(76px+env(safe-area-inset-bottom))] shadow-2xl md:hidden"
          >
            <div className="sticky top-0 z-10 flex justify-center bg-[rgb(var(--surface-card))] pb-2 pt-3">
              <span className="h-1.5 w-10 rounded-full bg-phantix-600/80" aria-hidden="true" />
            </div>
            <div className="space-y-5 px-4">
              {account}
              {status}

              {nav.map((section) => (
                <div key={section.label}>
                  <p className="mb-2 flex items-center gap-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                    {section.label}
                  </p>
                  <div className="divide-y divide-phantix-700/40 overflow-hidden rounded-2xl border border-phantix-700/50 bg-phantix-900/60">
                    {section.items.map((item) => {
                      const on = hit(item.to, pathname);
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          className={`tap flex min-h-[50px] items-center gap-3 px-4 text-sm ${on ? "text-gold-300" : item.locked ? "text-slate-500" : "text-slate-200"}`}
                        >
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${on ? "bg-gold-400/15" : "bg-phantix-800/70"}`}>
                            {item.icon}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.locked && <Lock size={13} className="shrink-0 text-slate-600" />}
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              ))}

              {apps && (
                <div>
                  <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Applications</p>
                  {apps}
                </div>
              )}

              <div>
                <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Appearance</p>
                <div className="grid grid-cols-3 gap-1 rounded-xl border border-phantix-700/50 bg-phantix-900/60 p-1">
                  {THEME_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setTheme(o.value)}
                      className={`tap flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg text-sm transition-colors ${
                        mode === o.value ? "bg-phantix-700/70 text-white" : "text-slate-400"
                      }`}
                    >
                      {o.icon} {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-phantix-700/40 overflow-hidden rounded-2xl border border-phantix-700/50 bg-phantix-900/60">
                {actions}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Row style for the sheet's action list. */
export const SHEET_ROW = "tap flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm";
