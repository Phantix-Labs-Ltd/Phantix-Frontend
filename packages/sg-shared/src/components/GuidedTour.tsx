import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";

/**
 * Guided tour — a short, skippable walkthrough of an application's layout.
 *
 * Each step points at a real element by its `data-tour` anchor: a spotlight
 * cuts it out of a dimmed page and a card explains it. A step without an
 * anchor, or whose element is not on screen (the sidebar on a phone), shows as
 * a centred card instead, so the tour reads the same on every screen size.
 *
 * It starts once per application per browser, the first time someone lands in
 * the app, and `startTour()` replays it (the account menu's "Take the tour").
 * The "seen" flag is a per-viewer convenience in localStorage: if storage is
 * unavailable the tour simply offers itself again next time.
 */

export interface TourStep {
  /** `data-tour` value of the element to highlight; omit for a centred card. */
  anchor?: string;
  title: string;
  body: string;
}

export const TOUR_START_EVENT = "sg:tour-start";

/** Replay the tour for the current application. */
export function startTour(): void {
  window.dispatchEvent(new CustomEvent(TOUR_START_EVENT));
}

const PAD = 6;
const CARD_W = 340;
const GAP = 14;

function seen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "done";
  } catch {
    return false;
  }
}

function markSeen(key: string): void {
  try {
    window.localStorage.setItem(key, "done");
  } catch {
    /* storage unavailable: the tour offers itself again next time */
  }
}

function findAnchor(anchor?: string): HTMLElement | null {
  if (!anchor) return null;
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`);
  for (const el of Array.from(nodes)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

type Rect = { top: number; left: number; width: number; height: number };

export default function GuidedTour({
  steps,
  storageKey,
  autoStart = true,
}: {
  steps: TourStep[];
  /** localStorage key for "seen"; bump its version when the tour changes. */
  storageKey: string;
  autoStart?: boolean;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(0);
  const calm =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const open = index !== null;
  const step = open ? steps[index] : null;

  // first visit: offer the tour once the shell has settled
  useEffect(() => {
    if (!autoStart || !steps.length || seen(storageKey)) return;
    const t = window.setTimeout(() => setIndex(0), 1200);
    return () => window.clearTimeout(t);
  }, [autoStart, steps.length, storageKey]);

  useEffect(() => {
    const onStart = () => setIndex(0);
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, []);

  const close = useCallback(() => {
    markSeen(storageKey);
    setIndex(null);
    setRect(null);
  }, [storageKey]);

  const go = useCallback(
    (next: number) => {
      if (next < 0) return;
      if (next >= steps.length) close();
      else setIndex(next);
    },
    [steps.length, close],
  );

  // locate the step's element, bring it into view, and follow it on scroll/resize
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      const el = findAnchor(step?.anchor);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    findAnchor(step?.anchor)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step?.anchor]);

  useLayoutEffect(() => {
    if (open && cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [open, index, viewport.w]);

  // keyboard: Esc ends, arrows move; focus the card so screen readers follow
  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go((index ?? 0) + 1);
      else if (e.key === "ArrowLeft") go((index ?? 0) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, go, close]);

  if (!open || !step) return null;

  const narrow = viewport.w < 640;
  const hole = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // card placement: docked on phones (away from the highlight); beside a
  // left-hand element, else below or above it
  let cardStyle: React.CSSProperties;
  if (narrow) {
    const highlightLow = hole ? hole.top + hole.height / 2 > viewport.h / 2 : true;
    cardStyle = highlightLow ? { left: 12, right: 12, top: 16 } : { left: 12, right: 12, bottom: 16 };
  } else if (!hole) {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: CARD_W };
  } else {
    const clampX = (x: number) => Math.min(Math.max(12, x), viewport.w - CARD_W - 12);
    const clampY = (y: number) => Math.min(Math.max(12, y), viewport.h - cardH - 12);
    const roomRight = viewport.w - (hole.left + hole.width);
    if (roomRight > CARD_W + GAP * 2 && hole.left < viewport.w / 3) {
      cardStyle = { left: hole.left + hole.width + GAP, top: clampY(hole.top), width: CARD_W };
    } else if (hole.top + hole.height + GAP + cardH < viewport.h) {
      cardStyle = { left: clampX(hole.left + hole.width / 2 - CARD_W / 2), top: hole.top + hole.height + GAP, width: CARD_W };
    } else {
      cardStyle = { left: clampX(hole.left + hole.width / 2 - CARD_W / 2), top: clampY(hole.top - GAP - cardH), width: CARD_W };
    }
  }

  const last = index === steps.length - 1;
  const motion = calm ? "" : "transition-all duration-300 ease-out";

  // On <body>, so no ancestor's transform or overflow can clip the dim.
  return createPortal(
    <div className="fixed inset-0 z-[130]" role="presentation">
      {/* the dim, with the step's element cut out of it */}
      {hole ? (
        <div
          className={`pointer-events-none fixed rounded-lg ${motion}`}
          // one shadow draws both the gold ring and the dim around it
          style={{ ...hole, boxShadow: "0 0 0 2px rgba(232, 181, 77, 0.85), 0 0 0 9999px rgba(3, 7, 12, 0.72)" }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgba(3,7,12,0.72)]" />
      )}
      {/* clicks outside the card do nothing: a stray click must not end the tour */}
      <div className="fixed inset-0" />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sg-tour-title"
        aria-describedby="sg-tour-body"
        tabIndex={-1}
        className={`fixed rounded-xl border border-phantix-600/60 bg-phantix-900 p-5 shadow-card outline-none ${motion}`}
        style={cardStyle}
      >
        <button
          type="button"
          onClick={close}
          aria-label="End the tour"
          className="absolute right-2.5 top-2.5 rounded-md p-1.5 text-slate-500 hover:bg-phantix-800 hover:text-slate-200"
        >
          <X size={15} />
        </button>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-300/90">
          <Compass size={12} /> Step {index + 1} of {steps.length}
        </p>
        <h2 id="sg-tour-title" className="mt-2 pr-6 font-display text-lg font-semibold text-white">
          {step.title}
        </h2>
        <p id="sg-tour-body" className="mt-2 text-sm leading-6 text-slate-300">
          {step.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full ${i === index ? "w-4 bg-gold-400" : "w-1.5 bg-phantix-600"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <button type="button" onClick={() => go(index - 1)} className="btn-ghost !px-2.5 !py-1.5 !text-xs">
                <ArrowLeft size={13} /> Back
              </button>
            ) : (
              <button type="button" onClick={close} className="btn-ghost !px-2.5 !py-1.5 !text-xs">
                Skip
              </button>
            )}
            <button type="button" onClick={() => go(index + 1)} className="btn-primary !px-3 !py-1.5 !text-xs">
              {last ? "Finish" : "Next"} {!last && <ArrowRight size={13} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
