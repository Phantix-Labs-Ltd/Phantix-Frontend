import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UserCheck, X } from "lucide-react";
import { APPROVAL_PENDING_EVENT, type PendingApprovalNotice } from "../api";
import { useStore } from "../store";

/**
 * Shown when a state-changing step is parked for second-level authorization.
 *
 * The API clients raise APPROVAL_PENDING_EVENT for every 202 park, so this one
 * overlay covers every gated step in every application. It names the assigned
 * authorizer (name and title, never their email) so the initiator knows who to
 * chase. The action is already filed by the time this opens, so there is
 * nothing to proceed with: a single Close acknowledges it.
 */
export default function ApprovalSentOverlay() {
  const [notice, setNotice] = useState<PendingApprovalNotice | null>(null);
  // The assigned authorizer, for a notice that does not name one (a workflow
  // that files its own approval, or an older backend).
  const assigned = useStore().dualControl?.authorizer;

  useEffect(() => {
    const onPending = (e: Event) => setNotice((e as CustomEvent<PendingApprovalNotice>).detail);
    window.addEventListener(APPROVAL_PENDING_EVENT, onPending);
    return () => window.removeEventListener(APPROVAL_PENDING_EVENT, onPending);
  }, []);

  const open = notice !== null;

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNotice(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setNotice(null);
  const name = notice?.authorizer?.fullName || assigned?.full_name?.trim() || undefined;
  const title = notice?.authorizer ? notice.authorizer.title : assigned?.title?.trim() || null;
  const action = notice?.actionLabel;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-phantix-950/85 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="approval-sent-title"
          aria-describedby="approval-sent-desc"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-phantix-600/50 bg-phantix-900/95 shadow-card"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gold-400/10 blur-3xl" />
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-lg p-2 text-slate-500 transition-colors hover:bg-phantix-800/60 hover:text-slate-200"
            >
              <X size={16} />
            </button>

            <div className="relative flex flex-col items-center px-6 pb-5 pt-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-400/15 text-gold-400">
                <UserCheck size={26} />
              </span>
              <p className="mt-4 text-xs font-medium uppercase tracking-[0.14em] text-gold-300/90">Sent for approval</p>
              <h2 id="approval-sent-title" className="mt-2 font-display text-xl font-bold leading-snug text-white">
                {name ? (
                  <>
                    Contact <span className="text-gold-300">{name}</span> for approval
                  </>
                ) : (
                  "Contact your authorizer for approval"
                )}
              </h2>
              {title && <p className="mt-1 text-sm text-slate-400">{title}</p>}
              <p id="approval-sent-desc" className="mt-4 text-sm leading-6 text-slate-300">
                {action ? <><span className="font-medium text-slate-100">{action}</span> needs</> : "This step needs"} a
                second approval before it runs. It runs automatically once{" "}
                {name ? name.split(/\s+/)[0] : "the authorizer"} approves it.
              </p>
              <p className="mt-4 w-full rounded-md border border-phantix-700/50 bg-phantix-950/60 px-3.5 py-3 text-left text-xs leading-5 text-slate-400">
                The request expires after 24 hours if no one decides it.
              </p>
            </div>

            <div className="relative border-t border-phantix-700/50 px-6 py-5">
              <button type="button" className="btn-primary w-full !py-3" onClick={close} autoFocus>
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
