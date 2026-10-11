/**
 * The one way untrusted markdown/HTML reaches `dangerouslySetInnerHTML`.
 *
 * Report bodies, AI narratives, advisories and finding evidence are built from
 * what scanned targets and models return, so they are attacker-influenced.
 * `marked` passes raw HTML straight through, and every app keeps its session in
 * localStorage — a single unsanitized sink is a session theft across all four
 * applications. Render through `renderMarkdown`, or pass HTML you did not write
 * through `sanitizeHtml`.
 */
import createDOMPurify from "dompurify";
import { marked } from "marked";

// A private instance: mermaid imports the same DOMPurify module, and hooks added
// to the shared default would leak into its sanitization.
const purify = createDOMPurify(window);

purify.addHook("afterSanitizeAttributes", (node) => {
  // Links in rendered content leave the app; never hand them `window.opener`.
  if (node.tagName === "A" && node.getAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  // Forms and inline styles in rendered content are how an injected body
  // fakes a sign-in prompt or overlays the real UI.
  FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "option"],
  FORBID_ATTR: ["style"],
};

/** Strip scripts, handlers, `javascript:` URLs and UI-spoofing markup. */
export function sanitizeHtml(html: string): string {
  return purify.sanitize(html, PURIFY_CONFIG) as string;
}

/** Markdown → sanitized HTML (GFM, single newlines as breaks). */
export function renderMarkdown(markdown: string): string {
  if (!markdown) return "";
  return sanitizeHtml(marked.parse(markdown, { async: false, gfm: true, breaks: true }) as string);
}
