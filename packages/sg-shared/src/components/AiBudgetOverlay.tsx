import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, Sparkles } from "lucide-react";
import { loadAiUsage } from "../data";
import { useResource } from "../useResource";
import { isDemoMode } from "../api";

/**
 * Organization users do not buy AI credit, so this is informational only: it
 * tells them AI is paused and to contact their administrator, with a single
 * acknowledgement button. The payment request goes to the platform staff, not
 * to this operator — there is deliberately no top-up CTA here.
 *
 * It is shown once per billing window: acknowledging it records the window in
 * sessionStorage, so a reload does not re-open it, but a new month does.
 */
const DISMISS_KEY = "sg.aiBudgetAck";

export default function AiBudgetOverlay() {
  const { data: usage } = useResource(loadAiUsage, null, "ai-budget", 60_000);
  const [acked, setAcked] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.sessionStorage.getItem(DISMISS_KEY),
  );

  const billingWindow = usage?.year_month ?? "current";
  const budgetStopped = usage?.allowed === false && usage?.ai_enabled !== false;
  const open = Boolean(usage) && !isDemoMode() && budgetStopped && acked !== billingWindow;

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const acknowledge = () => {
    if (typeof window !== "undefined") window.sessionStorage.setItem(DISMISS_KEY, billingWindow);
    setAcked(billingWindow);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[94] flex items-center justify-center bg-phantix-950/90 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-budget-title"
          aria-describedby="ai-budget-desc"
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-phantix-600/50 bg-phantix-900/95 shadow-card"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gold-400/10 blur-3xl" />

            <div className="relative flex flex-col items-center px-6 pb-5 pt-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-400/15 text-gold-400">
                <Sparkles size={26} />
              </span>
              <h2 id="ai-budget-title" className="mt-4 font-display text-xl font-bold text-white">
                AI features are paused
              </h2>
              <p id="ai-budget-desc" className="mt-2 text-sm leading-6 text-slate-300">
                Your organization has used its AI allowance for this period, so AI verification,
                fix guidance and AI summaries are paused. Your findings and scans still work.
              </p>
              <p className="mt-4 w-full rounded-md border border-phantix-700/50 bg-phantix-950/60 px-3.5 py-3 text-left text-xs leading-5 text-slate-400">
                Please contact your administrator or account owner to restore access.
              </p>
            </div>

            <div className="relative border-t border-phantix-700/50 px-6 py-5">
              <button type="button" className="btn-primary w-full !py-3" onClick={acknowledge} autoFocus>
                <CircleCheck size={15} /> Okay
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
