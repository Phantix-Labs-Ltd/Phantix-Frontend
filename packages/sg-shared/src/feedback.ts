// Service feedback — report a bug, a failure or a missing feature in place.
//
// Every backend service answers `POST /api/v1/{service}/feedback` (see
// app/engines/control_plane/api/feedback.py); the staff portal triages the lot.
// This module is the app-side entry point: the shell mounts one
// <FeedbackReporter/>, and any surface — an error state, the topbar, a page —
// opens it with `openFeedbackReporter()`.
import { api, getCorrelationId, isDemoMode } from "./api";

export type FeedbackCategory = "bug" | "missing_feature" | "error" | "other";
export type FeedbackSeverity = "low" | "medium" | "high" | "critical";

export interface FeedbackInput {
  service: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  message: string;
  context?: Record<string, unknown>;
}

export interface FeedbackResult {
  id: number;
  service: string;
  status: string;
  created_at?: string;
}

export const FEEDBACK_CATEGORY_OPTIONS: { id: FeedbackCategory; label: string; hint: string }[] = [
  { id: "bug", label: "Something is broken", hint: "It should work but does not" },
  { id: "error", label: "It failed or errored", hint: "An action errored or a page would not load" },
  { id: "missing_feature", label: "Missing feature", hint: "There is no way to do what I need" },
  { id: "other", label: "Something else", hint: "Feedback, confusion or a rough edge" },
];

export const FEEDBACK_SEVERITY_OPTIONS: { id: FeedbackSeverity; label: string }[] = [
  { id: "low", label: "Low: annoyance" },
  { id: "medium", label: "Medium: it slows me down" },
  { id: "high", label: "High: it blocks my work" },
  { id: "critical", label: "Critical: data or security risk" },
];

/**
 * Which backend service the current page belongs to. The first segment of the
 * route mirrors the API prefix the page drives (`/assets` → `assets`,
 * `/vapt/...` → `vapt`), and the application is the fallback on `/`.
 */
export function serviceForPath(pathname: string, application?: string): string {
  const segments = (pathname || "")
    .split(/[?#]/)[0]
    .split("/")
    .filter(Boolean);
  return segments[0] || application || "unknown";
}

/** A report. Anything supplied here pre-fills the reporter. */
export interface FeedbackPrefill {
  service?: string;
  category?: FeedbackCategory;
  severity?: FeedbackSeverity;
  /** Pre-filled message, e.g. the error text the operator just saw. */
  message?: string;
  context?: Record<string, unknown>;
}

export const FEEDBACK_OPEN_EVENT = "sg:feedback:open";

let reporterMounted = false;
let pending: FeedbackPrefill | null = null;

/** Open the reporter from anywhere, optionally pre-filled. Safe before mount. */
export function openFeedbackReporter(prefill: FeedbackPrefill = {}): void {
  if (!reporterMounted) pending = { ...(pending ?? {}), ...prefill };
  window.dispatchEvent(new CustomEvent(FEEDBACK_OPEN_EVENT, { detail: prefill }));
}

/** Called by the reporter on mount — returns (and clears) an early request. */
export function claimPendingFeedback(): FeedbackPrefill | null {
  reporterMounted = true;
  const request = pending;
  pending = null;
  return request;
}

/** Called by the reporter on unmount so early requests are held again. */
export function releaseFeedbackReporter(): void {
  reporterMounted = false;
}

/** Facts a triager needs, attached only when the operator leaves it checked. */
export function technicalContext(): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  try {
    context.path = window.location.pathname + window.location.search;
    context.route = window.location.hash || undefined;
  } catch { /* no window (SSR/tests) */ }
  const correlationId = getCorrelationId();
  if (correlationId) context.correlation_id = correlationId;
  try {
    context.user_agent = navigator.userAgent;
    context.viewport = `${window.innerWidth}x${window.innerHeight}`;
  } catch { /* no navigator */ }
  return context;
}

/** POST /feedback — the canonical endpoint; the service is in the body. */
export async function submitFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  if (isDemoMode()) {
    throw new Error("Feedback is unavailable in the demo tenant.");
  }
  return api.post<FeedbackResult>("/feedback", {
    service: input.service,
    category: input.category,
    severity: input.severity,
    message: input.message,
    context: input.context ?? {},
  });
}
