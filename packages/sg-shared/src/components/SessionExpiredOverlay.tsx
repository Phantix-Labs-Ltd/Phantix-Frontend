import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Clock, ShieldAlert } from "lucide-react";
import { useStore } from "../store";

/**
 * A dropped main session — expired or revoked while the operator was away —
 * holds the current page under this card instead of an abrupt redirect to the
 * sign-in screen. `onSignIn` takes them there, remembering the application they
 * were in so Core hands the session straight back after sign-in.
 *
 * This is the org/application session, not the dual-control operate session
 * (which has its own DualControlOverlay).
 */
export default function SessionExpiredOverlay({ onSignIn }: { onSignIn: () => void }) {
  const { sessionExpired } = useStore();
  const open = sessionExpired.active;

  // Keep the page behind the card from scrolling while it is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[96] flex items-center justify-center bg-phantix-950/90 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-expired-title"
          aria-describedby="session-expired-desc"
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-phantix-600/50 bg-phantix-900/95 shadow-card"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gold-400/10 blur-3xl" />

            <div className="relative flex flex-col items-center px-6 pb-6 pt-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-400/15 text-gold-400">
                <ShieldAlert size={26} />
              </span>
              <h2 id="session-expired-title" className="mt-4 font-display text-xl font-bold text-white">
                Session has expired
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                For your security, you have been signed out.
              </p>
              <p
                id="session-expired-desc"
                className="mt-4 flex w-full items-start gap-2.5 rounded-md border border-phantix-700/50 bg-phantix-950/60 px-3.5 py-3 text-left text-xs leading-5 text-slate-400"
              >
                <Clock size={14} className="mt-0.5 shrink-0 text-gold-400" />
                <span>
                  We are holding your place. Your session has ended, but you can pick up right where
                  you left off.
                </span>
              </p>
            </div>

            <div className="relative border-t border-phantix-700/50 px-6 py-5">
              <button type="button" className="btn-primary w-full !py-3" onClick={onSignIn} autoFocus>
                Sign back in
                <ArrowRight size={15} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
