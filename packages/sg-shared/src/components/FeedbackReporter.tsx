import React, { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Send, Sparkles } from "lucide-react";
import { Modal } from "../ui";
import { cx } from "../utils";
import { useStore } from "../store";
import {
  claimPendingFeedback,
  FEEDBACK_CATEGORY_OPTIONS,
  FEEDBACK_OPEN_EVENT,
  FEEDBACK_SEVERITY_OPTIONS,
  releaseFeedbackReporter,
  serviceForPath,
  submitFeedback,
  technicalContext,
  type FeedbackCategory,
  type FeedbackPrefill,
  type FeedbackSeverity,
} from "../feedback";

/**
 * The one feedback dialog, mounted by the shell so every page and every error
 * state has it. Opened through ``openFeedbackReporter()``; the service is taken
 * from the route (``/assets`` → ``assets``) unless the caller names one.
 */
export default function FeedbackReporter({ application }: { application?: string }) {
  const location = useLocation();
  const { toast, demoActive } = useStore();
  const [open, setOpen] = useState(false);
  const [service, setService] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [severity, setSeverity] = useState<FeedbackSeverity>("medium");
  const [message, setMessage] = useState("");
  const [extraContext, setExtraContext] = useState<Record<string, unknown>>({});
  const [attachContext, setAttachContext] = useState(true);
  const [sending, setSending] = useState(false);

  const apply = useCallback((prefill: FeedbackPrefill) => {
    setService(prefill.service ?? "");
    setCategory(prefill.category ?? "bug");
    setSeverity(prefill.severity ?? "medium");
    setMessage(prefill.message ?? "");
    setExtraContext(prefill.context ?? {});
    setAttachContext(true);
  }, []);

  useEffect(() => {
    const onOpen = (event: Event) => {
      apply(((event as CustomEvent).detail as FeedbackPrefill | undefined) ?? {});
      setOpen(true);
    };
    window.addEventListener(FEEDBACK_OPEN_EVENT, onOpen);
    // An open request made before this mounted (a page-level error, an early
    // click) is held and replayed now.
    const pending = claimPendingFeedback();
    if (pending) {
      apply(pending);
      setOpen(true);
    }
    return () => {
      window.removeEventListener(FEEDBACK_OPEN_EVENT, onOpen);
      releaseFeedbackReporter();
    };
  }, [apply]);

  const resolvedService = (service || serviceForPath(location.pathname, application)).slice(0, 64);
  const canSubmit = message.trim().length > 0 && !sending && !demoActive;

  const close = () => {
    setOpen(false);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSending(true);
    try {
      const context = attachContext ? { ...prefillSafe(extraContext), ...technicalContext() } : {};
      await submitFeedback({
        service: resolvedService,
        category,
        severity,
        message: message.trim(),
        context,
      });
      toast("success", "Report sent", "Thanks — it goes straight to the team that owns this service.");
      setMessage("");
      setExtraContext({});
      setOpen(false);
    } catch (err) {
      toast("error", "Could not send the report", err instanceof Error ? err.message : undefined);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Report a problem">
      <div className="space-y-4">
        <p className="text-[13px] leading-5 text-slate-400">
          Tell us what happened — a bug, a failure or something that is missing. It is filed against
          the <span className="font-mono text-slate-200">{resolvedService}</span> service and triaged
          by the platform team.
        </p>

        {/* Category */}
        <div>
          <p className="mb-1.5 text-[12px] uppercase tracking-wide text-slate-500">What kind of report?</p>
          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCategory(opt.id)}
                aria-pressed={category === opt.id}
                title={opt.hint}
                className={cx(
                  "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  category === opt.id
                    ? "border-gold-400/40 bg-gold-400/10 text-gold-200"
                    : "border-phantix-700/50 text-slate-400 hover:text-slate-200",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Severity */}
        <label className="block text-[12px] text-slate-400">
          How much is it getting in your way?
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as FeedbackSeverity)}
            className="input mt-1 !py-1.5 !text-xs"
          >
            {FEEDBACK_SEVERITY_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {/* Message */}
        <label className="block text-[12px] text-slate-400">
          What happened?
          <textarea
            autoFocus
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={8000}
            placeholder="What you were doing, what you expected, and what happened instead."
            className="input mt-1 !text-[13px]"
          />
        </label>

        {/* Attach context */}
        <label className="flex items-start gap-2.5 text-[13px] text-slate-400">
          <input
            type="checkbox"
            checked={attachContext}
            onChange={(e) => setAttachContext(e.target.checked)}
            className="mt-0.5 accent-gold-400"
          />
          <span>
            Attach technical context
            <span className="block text-[12px] text-slate-500">
              Page path, browser and correlation id. No security data is included.
            </span>
          </span>
        </label>

        {demoActive && (
          <p className="rounded-lg border border-gold-400/30 bg-gold-400/5 px-3 py-2 text-[12px] text-gold-200">
            <Sparkles size={11} className="mr-1 inline" /> Feedback is disabled in the demo tenant —
            sign in to a real organization to send it.
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button className="btn-ghost !text-sm" onClick={close} disabled={sending}>
            Cancel
          </button>
          <button className="btn-primary !text-sm" onClick={() => void submit()} disabled={!canSubmit}>
            <Send size={13} /> {sending ? "Sending…" : "Send report"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Keep only serializable, bounded context values from the prefill. */
function prefillSafe(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context ?? {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      out[key] = value.slice(0, 2000);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else {
      try {
        out[key] = JSON.stringify(value).slice(0, 2000);
      } catch {
        /* skip unserializable */
      }
    }
  }
  return out;
}
