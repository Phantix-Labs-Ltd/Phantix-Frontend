import React, { useState } from "react";
import { CheckCircle2, Mail, Send } from "lucide-react";
import { cx } from "../utils";

/**
 * Newsletter capture for the sign-in pages, powered by Substack.
 *
 * The blog already publishes through the `securegraph.substack.com` account, so
 * there is one list and one source of truth. This component collects the
 * address and hands it to Substack's own subscribe page (prefilled), where the
 * reader confirms. The email is never posted to, or stored by, Phantix.
 */

export const SUBSTACK_SUBSCRIBE_URL = "https://securegraph.substack.com/subscribe";

/** The Substack subscribe URL with this reader's address prefilled. */
export function substackSubscribeHref(email: string, source: string): string {
  try {
    const url = new URL(SUBSTACK_SUBSCRIBE_URL);
    const clean = email.trim();
    if (clean) url.searchParams.set("email", clean);
    url.searchParams.set("utm_source", source);
    url.searchParams.set("utm_medium", "signin");
    return url.toString();
  } catch {
    return SUBSTACK_SUBSCRIBE_URL;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SubstackSubscribe({
  source = "phantix-signin",
  title = "Security insights in your inbox",
  className,
}: {
  /** Analytics/source tag passed through to Substack. */
  source?: string;
  title?: string;
  className?: string;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subscribe = () => {
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    window.open(substackSubscribeHref(value, source), "_blank", "noopener,noreferrer");
    setSent(true);
  };

  return (
    <div className={cx("border-t border-phantix-700/40 pt-4", className)}>
      <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      {sent ? (
        <div className="mt-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-400">
          <p className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 size={13} /> Confirm on Substack
          </p>
          <p className="mt-1 text-emerald-400/80">
            We opened Substack in a new tab. Finish there to join the list.{" "}
            <a
              className="underline"
              href={substackSubscribeHref(email, source)}
              target="_blank"
              rel="noreferrer"
            >
              Open Substack again
            </a>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input !pl-9 !py-2 text-xs"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    subscribe();
                  }
                }}
                placeholder="you@company.com"
                aria-label="Newsletter email"
              />
            </div>
            <button
              type="button"
              onClick={subscribe}
              className="btn-secondary !px-3 !py-2"
              aria-label="Subscribe on Substack"
              title="Subscribe on Substack"
            >
              <Send size={14} />
            </button>
          </div>
          {error && <p className="mt-1.5 text-xs text-severity-critical">{error}</p>}
          <p className="mt-1.5 text-[11px] text-slate-600">
            Powered by Substack ·{" "}
            <a
              className="hover:text-slate-400"
              href={SUBSTACK_SUBSCRIBE_URL}
              target="_blank"
              rel="noreferrer"
            >
              securegraph.substack.com
            </a>
          </p>
        </>
      )}
    </div>
  );
}
