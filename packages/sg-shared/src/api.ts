// ── SecureGraph API client ────────────────────────────────────────────────────────
// Token model: app_session + device, platform, dual-control, staff (never mixed).
// API base from src/lib/config.ts (no Vite env). Demo only via /demo flag.
import { API_BASE as CONFIG_API_BASE } from "./config";
import { dedupedRequest } from "./dedupe";

export const API_BASE = CONFIG_API_BASE;

const DEMO_FLAG = "phantix_demo";

/** Enter the guided demo tenant (runtime, survives refresh in this tab). */
export function enterDemoMode(): void {
  sessionStorage.setItem(DEMO_FLAG, "1");
}

/** Leave demo mode --- the next sign-in talks to the real organization. */
export function exitDemoMode(): void {
  sessionStorage.removeItem(DEMO_FLAG);
  localStorage.removeItem(DEMO_FLAG);
}

export function isDemoFlagSet(): boolean {
  return sessionStorage.getItem(DEMO_FLAG) === "1" || localStorage.getItem(DEMO_FLAG) === "1";
}

/** Demo mode = visitor explicitly entered the guided demo tenant. */
export function isDemoMode(): boolean {
  return isDemoFlagSet();
}

// ── Token stores (per-surface, never mixed) ──────────────────────────────────
// Tokens are kept in localStorage, not sessionStorage: an operator who leaves
// the page — closes the tab, or restarts the browser — and comes back keeps the
// session until the backend expires it. When it *has* expired, the shell raises
// the "session ended" card instead of silently bouncing to sign-in. Falls back
// to sessionStorage where localStorage is unavailable (private mode), so a
// session still works per-tab there.
const tokenStore: Storage = (() => {
  try {
    const probe = "__sg_storage_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return window.sessionStorage;
  }
})();

function readToken(key: string): string | null {
  try { return tokenStore.getItem(key); } catch { return null; }
}
function writeToken(key: string, value: string | null): void {
  try { value ? tokenStore.setItem(key, value) : tokenStore.removeItem(key); } catch { /* unavailable */ }
}

// One-time migration: these keys used to live in sessionStorage. Adopt any
// existing session into the persistent store so the change does not sign every
// already-signed-in operator out on their first load after deploy.
for (const key of [
  "platform_access_token",
  "platform_org_user_token",
  "app_session_token",
  "app_device_token",
  "staff_access_token",
]) {
  try {
    if (!tokenStore.getItem(key)) {
      const legacy = window.sessionStorage.getItem(key);
      if (legacy) tokenStore.setItem(key, legacy);
    }
  } catch { /* unavailable */ }
}

/** Read a value from the shared session store (localStorage, else sessionStorage). */
export function readStoredToken(key: string): string | null {
  return readToken(key);
}

/** Write (or clear, with null) a value in the shared session store. */
export function writeStoredToken(key: string, value: string | null): void {
  writeToken(key, value);
}

// The dual-control operate token is a short-lived elevation, not the session:
// it stays per-tab (sessionStorage) so closing the tab ends the elevation even
// though the signed-in session persists.
function readSessionToken(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}
function writeSessionToken(key: string, value: string | null): void {
  try { value ? window.sessionStorage.setItem(key, value) : window.sessionStorage.removeItem(key); } catch { /* unavailable */ }
}

/** Read/write a per-tab (non-persisted) token, used for the operate elevation. */
export function readSessionStoredToken(key: string): string | null {
  return readSessionToken(key);
}
export function writeSessionStoredToken(key: string, value: string | null): void {
  writeSessionToken(key, value);
}

export const tokens = {
  get platform() { return readToken("platform_access_token"); },
  set platform(v: string | null) { writeToken("platform_access_token", v); },
  get orgUser() { return readToken("platform_org_user_token"); },
  set orgUser(v: string | null) { writeToken("platform_org_user_token", v); },
  get dualControl() { return readSessionToken("platform_dual_control"); },
  set dualControl(v: string | null) { writeSessionToken("platform_dual_control", v); },
  get appSession() { return readToken("app_session_token"); },
  set appSession(v: string | null) { writeToken("app_session_token", v); },
  get device() { return readToken("app_device_token"); },
  set device(v: string | null) { writeToken("app_device_token", v); },
  get staff() { return readToken("staff_access_token"); },
  set staff(v: string | null) { writeToken("staff_access_token", v); },
};

export function deviceId(): string {
  let id = localStorage.getItem("phantix_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("phantix_device_id", id);
  }
  return id;
}

function detailMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: { msg?: string }) => d?.msg ?? "validation error").join(", ");
  }
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    if (typeof d.message === "string") return d.message;
    if (typeof d.detail === "string") return d.detail;
    if (typeof d.error === "string") return d.error;
  }
  return "Request failed";
}

// ── Customer-facing error copy (normalized) ─────────────────────────────────
// The backend writes `detail` for whoever reads the logs: it can name routes,
// headers, env vars, internal codes and doc paths. Some of it, though, is
// exactly what the customer needs — "Domain/host 'x' is not HTTP(S)-reachable —
// asset not added. Ensure DNS resolves and the host responds on 80/443." This
// turns the raw detail into one safe sentence: keep the human explanation, drop
// anything that reads like an internal diagnostic, and fall back to the status
// copy when nothing safe survives. The raw words stay on `serverMessage`.

/**
 * Statuses whose detail describes the caller's own input or state, so it is
 * worth showing once normalized. Authentication (401), permissions (403),
 * rate limits (429), server faults (5xx) and network errors (0) keep the
 * app-authored copy: that detail is the likeliest to name internals, and the
 * cause is rarely the customer's to fix.
 */
const ACTIONABLE_DETAIL_STATUSES = new Set([400, 409, 412, 413, 415, 422, 423, 424, 428]);

/**
 * A candidate carrying any of these is an internal diagnostic, not customer
 * copy: crash/stack text, routes and headers, SCREAMING_SNAKE codes, SQL,
 * data-layer and broker internals, loopback/private hosts, and repo or spec
 * references. Matching one sends the request back to the status copy.
 */
const INTERNAL_DIAGNOSTIC_PATTERNS: RegExp[] = [
  // Crash / stack text
  /\btraceback\b/i,
  /\bfile\s+"[^"]+"/i,
  /\bline\s+\d+\b/i,
  /\b\w+(?:Error|Exception)\b/,
  /\bexception\b/i,
  /\bstack\s?trace\b/i,
  // Routes, headers and machine codes
  /(?:\/api\/v\d|\/(?:internal|admin|_debug)\/)/i,
  /\b(?:GET|POST|PUT|PATCH|DELETE)\s+[\/\"]/,
  /\bX(?:-[A-Z][A-Za-z0-9]+){2,}\b/,
  /\bWWW-Authenticate\b/i,
  /\b[A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+)+\b/,
  // Data-layer internals
  /\bselect\b[\s\S]{0,80}\bfrom\b/i,
  /\binsert\s+into\b/i,
  /\bupdate\b[\s\S]{0,80}\bset\b/i,
  /\bdelete\s+from\b/i,
  /\b(?:psycopg|sqlalchemy|asyncpg|prisma|sqlite|alembic)\w*\b/i,
  /\b(?:relation|column|table|schema)\b[^.]{0,60}\bdoes not exist\b/i,
  /\bduplicate key value violates\b/i,
  /\bnull value in column\b/i,
  /\bmigration[s]?\b/i,
  /\b(?:redis|celery|rabbitmq|kafka)\b/i,
  // Hosts
  /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i,
  /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/,
  // Repo / spec / support identifiers
  /\b(?:docs?|design|architecture|specs?)\/\S+/i,
  /§\s*\d/,
  /\.(?:py|ts|tsx|js|jsx|mjs|json|ya?ml|toml|ini|sql|sh|md)\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /\bcorrelation[- _]?id\b/i,
  /\bservice[- _]?key\b/i,
];

/** "asset_id" → "asset id" — a field name a person can read. */
function humanizeField(field: string): string {
  return field.replace(/[_-]+/g, " ").trim();
}

/** The one human sentence inside a FastAPI `detail`, or null when there is none. */
function detailCandidate(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // Validation arrays: [{ loc: ["body", "value"], msg: "..." }] — keep the
    // message and name the field, so "invalid" becomes "value: invalid".
    const parts: string[] = [];
    for (const item of detail) {
      if (!item || typeof item !== "object") continue;
      const { msg, loc } = item as { msg?: unknown; loc?: unknown };
      if (typeof msg !== "string" || !msg.trim()) continue;
      const field = Array.isArray(loc)
        ? [...loc].reverse().find(
            (p) => typeof p === "string" && !["body", "query", "path", "header", "cookie"].includes(p),
          )
        : undefined;
      parts.push(field ? `Invalid ${humanizeField(String(field))}: ${msg.trim()}` : msg.trim());
    }
    return parts.length ? parts.join("; ") : null;
  }
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    // Prose first; `error`/`code` are usually bare machine identifiers.
    for (const key of ["message", "detail", "reason", "hint"]) {
      if (typeof d[key] === "string" && (d[key] as string).trim()) return d[key] as string;
    }
    if (typeof d.error === "string" && /\s/.test(d.error) && d.error.trim().length > 12) {
      return d.error;
    }
  }
  return null;
}

/** Clean one candidate into presentable copy, or null when it is internal. */
function sanitizeDetailCopy(raw: string): string | null {
  let text = raw.replace(/\s+/g, " ").trim();
  // A leading machine code — "validation_error: ..." — is not the sentence.
  const lead = text.match(/^([A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*)\s*:\s+(\S.*)$/);
  if (lead) {
    const machineish =
      /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(lead[1]) || /^(?:error|warning|note)$/i.test(lead[1]);
    if (machineish) text = lead[2];
  }
  // Drop a correlation/request suffix the backend may append.
  text = text.replace(/\s*[([]?(?:correlation|request)[-_ ]?id[:\s][^)\]]*[)\]]?\.?$/i, "").trim();
  if (!text) return null;
  // A bare identifier is a code, not a sentence.
  if (!/\s/.test(text) && /^[a-z0-9_.:-]+$/i.test(text)) return null;
  if (INTERNAL_DIAGNOSTIC_PATTERNS.some((re) => re.test(text))) return null;
  // Diagnostics can be long; keep the first sentence or two.
  if (text.length > 300) {
    const cut = text.slice(0, 300);
    const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
    text = stop > 80 ? cut.slice(0, stop + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
  }
  text = text.charAt(0).toUpperCase() + text.slice(1);
  if (!/[.!?…]$/.test(text)) text += ".";
  return text;
}

/**
 * The sentence a failed request may show the customer.
 *
 * Uses the backend's own explanation when the status says the caller's input or
 * state is at fault and the text carries no internal detail; otherwise the
 * app-authored status copy. `serverMessage` keeps the raw text for triage.
 */
export function publicErrorCopy(status: number, detail: unknown): string {
  if (!ACTIONABLE_DETAIL_STATUSES.has(status)) return errorCopyFor(status);
  const candidate = detailCandidate(detail);
  if (!candidate) return errorCopyFor(status);
  return sanitizeDetailCopy(candidate) ?? errorCopyFor(status);
}

/** Normalize a raw backend detail for display (callers that bypass `ApiError`). */
export function publicDetailCopy(detail: unknown): string | null {
  const candidate = detailCandidate(detail);
  return candidate ? sanitizeDetailCopy(candidate) : null;
}

/**
 * What a failed request is allowed to say to the operator.
 *
 * The backend writes its detail for an engineer reading logs: it names
 * endpoints, headers (`X-Dual-Control-Session`), internal codes and doc paths.
 * That text is logged (see `logRequestFailure`) and the UI gets this instead.
 */
export function errorCopyFor(status: number): string {
  if (status === 0) return "We could not reach the server. Check your connection and try again.";
  if (status === 401) return "Your session has expired. Sign in again to continue.";
  if (status === 402) return "That needs an upgrade on your plan.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "That item no longer exists.";
  if (status === 408) return "The request timed out. Try again.";
  if (status === 409) return "That conflicts with the current state. Refresh and try again.";
  if (status === 429) return "Too many attempts. Wait a moment and try again.";
  if (status >= 500) return "The server could not complete that request. Try again shortly.";
  if (status >= 400) return "That request was rejected. Check the details and try again.";
  return "Something went wrong. Try again.";
}

/**
 * Keep the server's own words in the error log, where they can be triaged.
 * Server faults log as errors; client-side rejections (validation, permissions,
 * conflicts) log as warnings so they do not drown the real failures.
 */
function logRequestFailure(
  status: number,
  serverMessage: string,
  detail: unknown,
  correlationId?: string,
): void {
  const line = `[api] ${status || "network"} · ${serverMessage}`;
  const context = correlationId ? `${line} · correlation-id=${correlationId}` : line;
  const write = status >= 500 || status === 0 || status === 408 ? console.error : console.warn;
  write(context, detail);
}

/**
 * Safe, human copy for any thrown value — for inline error panels and toasts
 * that need a domain-specific line ("Repositories unavailable.") rather than the
 * status-only default on ``ApiError.message``.
 *
 * A failed request is an ``ApiError`` whose ``message`` is already normalized
 * for display (see ``publicErrorCopy``): the backend's explanation when it is
 * safe and customer-actionable, otherwise the status copy. Anything else falls
 * back to the caller's copy. The raw backend words stay on ``serverMessage`` /
 * the console (see ``logRequestFailure``).
 */
export function publicErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  return err instanceof ApiError ? err.message : fallback;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  /** The backend's own message: logged for triage, never shown to the operator. */
  serverMessage: string;
  /** Server correlation id (X-Correlation-ID) for support/triage. */
  correlationId?: string;
  constructor(status: number, detail: unknown, correlationId?: string) {
    const serverMessage = detailMessage(detail);
    // Normalized for display: the backend's own explanation when it is safe and
    // actionable, otherwise the status copy. Raw text stays on `serverMessage`.
    super(publicErrorCopy(status, detail));
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.serverMessage = serverMessage;
    this.correlationId = correlationId;
    logRequestFailure(status, serverMessage, detail, correlationId);
  }
}

/**
 * Wait (seconds) carried by a 429 "too many failed attempts" response, if the
 * server put a number in the detail. There is no Retry-After header yet, so the
 * callers should fall back to a generic "try again shortly" when this is null.
 */
export function throttleSeconds(err: unknown): number | null {
  if (!(err instanceof ApiError) || err.status !== 429) return null;
  // The wait is carried in the server's own words, which no longer reach
  // `Error.message` — read the retained copy.
  const msg = typeof err.serverMessage === "string" ? err.serverMessage : "";
  const m = msg.match(/(\d+)\s*seconds?/i);
  return m ? Math.max(1, parseInt(m[1], 10)) : null;
}

/**
 * Middleware-parked action (approvals-and-sensitive-actions §2.2): a 2xx with
 * `pending: true` means the call did NOT run — it was filed for an authorizer.
 * The UI must say "sent for approval", never that the action happened.
 */
export function isPendingApproval(body: unknown): boolean {
  return !!body && typeof body === "object" && (body as { pending?: unknown }).pending === true;
}

// ── Correlation ID (00-shared-auth-and-client.md §6) ────────────────────────
// Surface X-Correlation-ID on failures so support can trace a request.
let lastCorrelationId: string | null = null;

/** Capture X-Correlation-ID from any response (if present). */
function trackCorrelationId(res: Response): void {
  const id = res.headers.get("X-Correlation-ID");
  if (id) lastCorrelationId = id;
}

/** Most recent correlation id seen on any response (or null). */
export function getCorrelationId(): string | null {
  return lastCorrelationId;
}

/** Reset tracking (e.g. on logout). */
export function clearCorrelationId(): void {
  lastCorrelationId = null;
}

/** Copy a correlation detection string into the thrown error's detail when useful. */
function withCorrelation<T extends { status: number; detail: unknown }>(err: T, correlationId?: string): T {
  if (correlationId && err instanceof ApiError) err.correlationId = correlationId;
  return err;
}

/** Apply X-Token-Refreshed response headers to the token store (app sessions). */
function applyTokenRenewal(res: Response): void {
  if (res.headers.get("X-Token-Refreshed") === "1") {
    const access = res.headers.get("X-Refreshed-Access-Token");
    const device = res.headers.get("X-Refreshed-Device-Token");
    if (access) tokens.appSession = access;
    if (device) tokens.device = device;
  }
}

/** 409 on product modules usually means security storage is not bootstrapped. */
export function isSecurityDbBlocked(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  const msg = `${err.message} ${JSON.stringify(err.detail ?? "")}`.toLowerCase();
  return (
    msg.includes("security") ||
    msg.includes("bootstrap") ||
    msg.includes("storage") ||
    msg.includes("schema") ||
    msg.includes("not ready") ||
    msg.includes("connection")
  );
}

type Realm = "platform" | "application" | "staff";

type RequestOpts = {
  body?: unknown;
  realm?: Realm;
  dualControl?: boolean;
  form?: Record<string, string>;
  /** Per-request timeout in ms (e.g. 180_000 for AGI session start). */
  timeoutMs?: number;
};

/**
 * Which application this bundle is running as (`core` / `attack` / `defend` /
 * `code`), declared on every call as `X-Application`.
 *
 * The backend enforces that the declared application owns the route *and* that
 * the operator may enter it, so the Defend shell cannot drive an Attack route
 * just because the operator's role happens to include Attack. The four shells
 * set this once at boot; the Core monolith leaves it at "core".
 */
let activeApplication: ApplicationDeclaration = "core";

export type ApplicationDeclaration = "core" | "attack" | "defend" | "code";

export function setActiveApplication(app: ApplicationDeclaration): void {
  activeApplication = app;
}

/**
 * Whether a shell is mounted that can hold the page under its "session expired"
 * card. Set by `ApplicationShell`; with no shell (a public page) a dropped
 * session still has to fall back to the sign-in redirect.
 */
let sessionCardMounted = false;
export function setSessionCardMounted(mounted: boolean): void {
  sessionCardMounted = mounted;
}

export function getActiveApplication(): ApplicationDeclaration {
  return activeApplication;
}

async function request<T>(
  method: string,
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const realm = opts.realm ?? (tokens.appSession ? "application" : "platform");
  // Whether this request actually carried a session bearer. A 401 on a request
  // that sent NO token means "not signed in (yet)" — e.g. a background call that
  // fired during the cross-app handoff, before the session was redeemed — and it
  // must never tear down or invalidate a session that is valid or still being
  // established. Only a token that was sent and then rejected is a dropped session.
  const hadBearer = !!(
    realm === "staff"
      ? tokens.staff
      : realm === "application"
        ? tokens.appSession
        : tokens.orgUser ?? tokens.platform
  );

  // Demo mode never touches the backend: mutations resolve as a no-op success so
  // every gated action (approve/start/pause/cancel/create, decisions, etc.) passes
  // entirely on the frontend. Data loads already short-circuit via data.ts demo
  // branches and are not routed through this client.
  if (isDemoMode() && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return { ok: true } as T;
  }

  // Build headers fresh on every attempt so a renewal applied by another
  // in-flight response is picked up on retry.
  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    const bearer =
      realm === "staff" ? tokens.staff : realm === "application" ? tokens.appSession : tokens.orgUser ?? tokens.platform;
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
    if (realm === "application" && tokens.device) headers["X-Device-Token"] = tokens.device!;
    // Per 03_APPLICATION_IMPLEMENTATION.md §2.4: every app API call carries X-Device-Id
    if (realm === "application") headers["X-Device-Id"] = deviceId();
    // Which of the four applications this call comes from (see the applications
    // contract §4). Only the application realm is app-gated; declaring it on a
    // platform/staff call would be noise.
    if (realm === "application") headers["X-Application"] = activeApplication;
    // Dual-control operate session: attach on ALL mutations when a token exists so
    // the SecureGraph Agent, Pentest Agent, and platform mutations share ONE operate
    // session. Stale/expired tokens are handled separately (the backend rejects the
    // mutation, not the org/app session — see the 401 handling below).
    const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    if (opts.dualControl && tokens.dualControl) {
      headers["X-Dual-Control-Session"] = tokens.dualControl;
    } else if (isMutation && tokens.dualControl) {
      headers["X-Dual-Control-Session"] = tokens.dualControl;
    }

    let body: BodyInit | undefined;
    if (opts.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(opts.form).toString();
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    const controller = opts.timeoutMs != null ? new AbortController() : null;
    const timer = controller && opts.timeoutMs != null
      ? window.setTimeout(() => controller.abort(), opts.timeoutMs)
      : null;
    try {
      const res = await fetch(`${API_BASE}${path}`, { method, headers, body, signal: controller?.signal });
      // App session token renewal (APP_SESSION_TOKEN_RENEWAL.md): the backend bumps
      // token versions on activity and returns refreshed tokens in response headers.
      applyTokenRenewal(res);
      // Support triage: remember the correlation id even on success, so the next
      // failure can be traced back (00-shared-auth-and-client.md §6).
      trackCorrelationId(res);
      return res;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiError(408, "Request timed out");
      }
      throw err;
    } finally {
      if (timer != null) window.clearTimeout(timer);
    }
  };

  const sentDualControl = !!tokens.dualControl && (opts.dualControl || ["POST", "PUT", "PATCH", "DELETE"].includes(method));
  // A request that is *about* the operate session (the authorizer inbox, the
  // approval queue, any mutation) must never be read as a dead main session.
  // 401s from these mean "no live operate session", not "sign in again".
  const dualControlScoped = !!opts.dualControl || sentDualControl;

  let res = await doFetch();

  // Concurrent-renewal race: another request already bumped the token version,
  // so this one was rejected as superseded. Retry once with the freshly stored
  // token instead of treating it as a dropped session (which logs the user out
  // mid-session).
  if (res.status === 401 && (await isSessionSuperseded(res))) {
    res = await doFetch();
  }

  // The operate session is an *idle* session on the backend: every successful
  // mutation that used it counts as activity and slides the FE expiry forward so
  // the user is not asked for another code while still working.
  if (res.ok && sentDualControl) {
    window.dispatchEvent(new CustomEvent("phantix:operate-activity"));
  }

  if (!res.ok) {
    const correlationId = res.headers.get("X-Correlation-ID") || undefined;
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail;
    } catch { /* non-JSON */ }
    const detailObj = detail && typeof detail === "object" ? detail as Record<string, unknown> : null;
    const relogin = detailObj?.relogin === true || detailObj?.error === "session_invalid";
    // Only treat a 401 as a dropped session when it is genuinely about an
    // invalid/expired token — NOT an authorization gap such as "dual-control
    // session required" (authorizer inbox) and NOT a transient superseded race.
    const msg = typeof detail === "string" ? detail : detailObj?.message ? String(detailObj.message) : "";
    // Service-key gate (00-shared-auth-and-client.md §8): app access disabled on
    // Platform. Not a session problem — the user stays signed in and is told to
    // have an admin enable app access.
    const serviceKeyRequired =
      detailObj?.error === "service_key_required" ||
      detailObj?.code === "service_key_required" ||
      /service[ -_]?key/.test(msg);
    if (res.status === 403 && serviceKeyRequired) {
      window.dispatchEvent(new CustomEvent("phantix:service-key-required"));
    }
    // Explicit main-session invalidation: the backend is saying the org/app JWT
    // itself is dead. Only this should tear down the signed-in session.
    const explicitMainSessionInvalid =
      relogin ||
      /session_invalid|invalid session|sign in again|re-?authenticate/i.test(msg);

    // Main-session authentication failure phrasings (narrow on purpose — a bare
    // "expired" must NOT clear the app session, because it is equally likely to
    // describe the short-lived dual-control operate session).
    const mainSessionAuthFailure =
      /session expired|token expired|authentication expired|jwt expired|bearer token|not authenticated|unauthorized/i.test(msg);

    // A missing/expired dual-control operate session is NOT a dropped org/app
    // session. Match the explicit ``WWW-Authenticate: DualControl`` challenge the
    // operate middleware sends on 401 (concurrent-sessions.md §4.2), the
    // structured operate-middleware shape, and the human message. As long as the
    // main session is still valid, a 401 on a mutation that carried a
    // dual-control token is treated as dual-control expiry so the operator can
    // request a fresh operate session without signing in again.
    const operateChallenge = (res.headers.get("WWW-Authenticate") || "")
      .toLowerCase()
      .includes("dualcontrol");
    const dcSessionIssue =
      operateChallenge ||
      detailObj?.error === "dual_control_session_required" ||
      detailObj?.error === "dual_control_session_expired" ||
      (detailObj as Record<string, unknown>)?.["required_header"] === "X-Dual-Control-Session" ||
      /authenticator session|dual.?control|operate session|operate mode|X-Dual-Control-Session/i.test(msg) ||
      (res.status === 401 && dualControlScoped && !explicitMainSessionInvalid);

    // The backend is authoritative for the operate idle window: if it rejected
    // a mutation because the dual-control session is gone/expired, tell the store
    // to lock so the next action prompts cleanly (instead of the FE guessing).
    if ((res.status === 401 || res.status === 403) && sentDualControl && dcSessionIssue) {
      tokens.dualControl = null;
      window.dispatchEvent(new CustomEvent("phantix:operate-expired", { detail: publicDetailCopy(msg) ?? "Operate session ended." }));
    } else if ((res.status === 401 || res.status === 403) && dualControlScoped && dcSessionIssue) {
      // Dual-control header missing or expired (not a broken main session).
      // Open the unlock overlay so the user can operate and retry instead of
      // being signed out; the inbox shows its own error state meanwhile.
      window.dispatchEvent(new CustomEvent("phantix:operate-required", { detail: publicDetailCopy(msg) ?? undefined }));
    }
    const superseded = detailObj?.error === "session_superseded" || /superseded by renewal/i.test(msg);
    // Never let a dual-control-scoped 401 tear down the main session on a
    // generic "unauthorized" message — only an explicit session_invalid/relogin
    // (or a clear main-session expiry on a non-operate request) does that.
    const sessionInvalid =
      hadBearer &&
      (explicitMainSessionInvalid || (mainSessionAuthFailure && !dualControlScoped));
    if (res.status === 401) {
      if (sessionInvalid && !dcSessionIssue && !superseded) {
        if (realm === "staff") tokens.staff = null;
        else if (realm === "application") { tokens.appSession = null; tokens.device = null; }
        else { tokens.platform = null; tokens.orgUser = null; }
      }
      if (realm === "application" && hadBearer && relogin && !dcSessionIssue && !superseded) {
        // A mounted shell holds the current page under its "session expired"
        // card, so the operator keeps what they were doing and chooses to sign
        // in again. With no shell (a public page), fall back to the redirect.
        if (sessionCardMounted) window.dispatchEvent(new CustomEvent("phantix:session-expired"));
        else window.location.assign("/login");
      }
    }
    // AI credits exhausted gets its own message. The person at the keyboard is
    // usually not the one who can fix it: renewal and top-ups are an
    // organization-admin action on the platform, not an app-user one.
    const detailCode = String(
      (typeof detail === "object" && detail
        ? (detail as { code?: unknown; error?: unknown }).code ??
          (detail as { error?: unknown }).error
        : "") || "",
    ).toLowerCase();
    const detailMsg =
      typeof detail === "string"
        ? detail
        : String((detail as { message?: unknown })?.message ?? "");
    const creditText = `${detailCode} ${detailMsg}`.toLowerCase();
    const creditExhausted =
      /credit|budget|quota|allowance|top[-_ ]?up/.test(creditText) &&
      /exhaust|depleted|insufficient|exceed|run out|out of credit|no credit|required|limit/.test(
        creditText,
      );
    if (creditExhausted) {
      window.dispatchEvent(
        new CustomEvent("phantix:credits-exhausted", { detail: publicDetailCopy(detailMsg) ?? undefined }),
      );
    } else if (res.status === 402) {
      const upgradeMsg = publicDetailCopy(detail) ?? "Upgrade required";
      window.dispatchEvent(new CustomEvent("phantix:billing-required", { detail: upgradeMsg }));
    }
    // Login throttling (staging-rollout §8): failed attempts are throttled per
    // identifier — 5 failures/5 min → 429. Surface the wait; never present it as
    // a wrong-password error.
    if (res.status === 429) {
      const throttleMsg = typeof detail === "string" ? detail : detailObj?.message ? String(detailObj.message) : "";
      const sec = throttleMsg.match(/(\d+)\s*seconds?/i);
      window.dispatchEvent(new CustomEvent("phantix:throttled", {
        detail: { seconds: sec ? Math.max(1, parseInt(sec[1], 10)) : null },
      }));
    }
    throw withCorrelation(new ApiError(res.status, detail, correlationId), correlationId);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** True when a 401 is the retryable "token superseded by renewal" race. */
async function isSessionSuperseded(res: Response): Promise<boolean> {
  try {
    const j = (await res.clone().json()) as { detail?: { error?: string; message?: string } };
    const d = j?.detail;
    return d?.error === "session_superseded" || /superseded by renewal/i.test(d?.message ?? "");
  } catch {
    return false;
  }
}

/** Common auth headers for the auxiliary (non-request) helpers. */
function buildAuthHeaders(method: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const realm: Realm = tokens.appSession ? "application" : "platform";
  const bearer = realm === "application" ? tokens.appSession : tokens.orgUser ?? tokens.platform;
  if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
  if (realm === "application") {
    if (tokens.device) headers["X-Device-Token"] = tokens.device;
    headers["X-Device-Id"] = deviceId();
    headers["X-Application"] = activeApplication;
  }
  if (method !== "GET" && tokens.dualControl) {
    headers["X-Dual-Control-Session"] = tokens.dualControl;
  }
  return headers;
}

export const api = {
  get: <T>(path: string, opts?: RequestOpts) =>
    dedupedRequest("GET", path, opts?.body, () => request<T>("GET", path, opts)),
  post: <T>(path: string, body?: unknown, opts?: RequestOpts) => request<T>("POST", path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOpts) => request<T>("PUT", path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOpts) => request<T>("PATCH", path, { ...opts, body }),
  delete: <T>(path: string, opts?: Parameters<typeof request>[2]) => request<T>("DELETE", path, opts),
  postForm: <T>(path: string, form: Record<string, string>, opts?: Parameters<typeof request>[2]) =>
    request<T>("POST", path, { ...opts, form }),

  /** Fetch binary/raw content with auth headers, returns a Blob. */
  async download(path: string): Promise<Blob> {
    const headers = buildAuthHeaders("GET");

    const res = await fetch(`${API_BASE}${path}`, { method: "GET", headers });
    applyTokenRenewal(res);
    trackCorrelationId(res);
    if (!res.ok) {
      let detail: unknown = res.statusText;
      try {
        const j = await res.clone().json();
        detail = (j && typeof j === "object" && "detail" in j ? j.detail : j) ?? res.statusText;
      } catch { /* non-JSON */ }
      throw new ApiError(res.status, detail, res.headers.get("X-Correlation-ID") || undefined);
    }
    return res.blob();
  },

  /** POST that returns a file (e.g. threat-model export) — auth + JSON body. */
  async postDownload(path: string, body?: unknown): Promise<Blob> {
    const headers = buildAuthHeaders("POST");
    headers["Content-Type"] = "application/json";

    const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
    applyTokenRenewal(res);
    trackCorrelationId(res);
    if (!res.ok) {
      let detail: unknown = res.statusText;
      try {
        const j = await res.clone().json();
        detail = (j && typeof j === "object" && "detail" in j ? (j as { detail?: unknown }).detail : j) ?? res.statusText;
      } catch { /* non-JSON */ }
      throw new ApiError(res.status, detail, res.headers.get("X-Correlation-ID") || undefined);
    }
    return res.blob();
  },

  /** Fetch text content with auth headers (e.g. markdown). */
  async fetchText(path: string): Promise<string> {
    const headers = buildAuthHeaders("GET");

    const res = await fetch(`${API_BASE}${path}`, { method: "GET", headers });
    applyTokenRenewal(res);
    trackCorrelationId(res);
    if (!res.ok) {
      let detail: unknown = res.statusText;
      try {
        const j = await res.clone().json();
        detail = (j && typeof j === "object" && "detail" in j ? j.detail : j) ?? res.statusText;
      } catch { /* non-JSON */ }
      throw new ApiError(res.status, detail, res.headers.get("X-Correlation-ID") || undefined);
    }
    return res.text();
  },

  /** Upload a file with FormData --- sends all auth headers. */
  async upload<T>(path: string, formData: FormData): Promise<T> {
    const headers = buildAuthHeaders("POST");

    const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });
    applyTokenRenewal(res);
    trackCorrelationId(res);
    if (!res.ok) {
      let detail: unknown = res.statusText;
      try { detail = (await res.json()).detail; } catch { /* non-JSON */ }
      throw new ApiError(res.status, detail, res.headers.get("X-Correlation-ID") || undefined);
    }
    return res.json() as T;
  },
};

/**
 * Media/download URLs stay same-origin so the Network tab never shows upstream.
 * Absolute backend URLs from the API are rewritten to path-only.
 */
export function mediaUrl(path?: string | null): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) {
    try {
      const u = new URL(path);
      if (u.pathname.startsWith("/api/")) return `${u.pathname}${u.search}`;
    } catch { /* keep original */ }
    return path;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

// Simulated latency for demo mode so loading states are visible
export const delay = (ms = 420) => new Promise((r) => setTimeout(r, ms));

/**
 * Server-sent events reader with the caller's auth headers.
 *
 * Used by the Autonomous Pentest Agent workspace so loop briefs, approvals,
 * findings and harness events paint the moment they happen instead of on the
 * next 5s poll. Callers keep their polling loop as a fallback; this only makes
 * the live surface smoother.
 */
export async function streamSse(
  path: string,
  onEvent: (event: string, data: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { ...buildAuthHeaders("GET"), Accept: "text/event-stream" },
    signal,
  });
  if (!res.ok) {
    let detail: unknown = `Stream failed: ${res.status}`;
    try {
      const j = await res.clone().json();
      detail = (j && typeof j === "object" && "detail" in j ? (j as { detail?: unknown }).detail : j) ?? detail;
    } catch { /* non-JSON */ }
    throw new ApiError(res.status, detail);
  }
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const block of parts) {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length) onEvent(event, dataLines.join("\n"));
    }
  }
}
