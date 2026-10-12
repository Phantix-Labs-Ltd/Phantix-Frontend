// ── Zoho PageSense (marketing analytics) ─────────────────────────────────────
// Heatmaps, session recordings and experiments on the public marketing pages.
// It is a third party that sets its own cookies, so it loads only after the
// visitor accepts it on the consent banner, never in development, and never
// with Do Not Track or the analytics kill-switch on. The signed-in apps never
// load it: their pages hold customers' security data.

import { getMarketingConsent } from "./consent";

// index.html carries the snippet as an inert tag (type="text/plain") so the
// PageSense verifier finds it; the browser neither fetches nor runs it. On
// consent it is replaced by a live script with the same src.
const TAG_ID = "zoho-pagesense";
const SRC = "https://cdn.pagesense.io/js/942607551/d62bd6ac25c94fd6b41c27af8080279f.js";

const ENV = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
const DEV = Boolean(ENV.DEV);
const DISABLED = String(ENV.VITE_ANALYTICS_DISABLED ?? "") === "true";

let loaded = false;

function dnt(): boolean {
  return navigator.doNotTrack === "1" || (window as { doNotTrack?: string }).doNotTrack === "1";
}

/**
 * PageSense's "Verify" opens the site with ?ps_verifyscript=true and waits for
 * its script to run. That URL is only used by Zoho's checker, so on it alone
 * the script loads without a consent choice; every other visit needs consent.
 */
function verifyingSnippet(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("ps_verifyscript") === "true";
  } catch {
    return false;
  }
}

/** Add the PageSense script once, when the visitor has accepted it. */
export function loadPageSense(): void {
  if (loaded || typeof document === "undefined") return;
  if (DEV || DISABLED) return;
  if (!verifyingSnippet() && (dnt() || getMarketingConsent() !== "accepted")) return;
  loaded = true;
  try {
    const inert = document.getElementById(TAG_ID) as HTMLScriptElement | null;
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = inert?.getAttribute("src") || SRC;
    if (inert) inert.replaceWith(script);
    else document.head.appendChild(script);
  } catch {
    /* marketing analytics must never break the page */
  }
}
