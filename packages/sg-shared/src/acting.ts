/**
 * Delegated acting session (an MSSP analyst working in a client's account).
 *
 * The client grants the MSSP access; an analyst enters one client in one
 * application, and the backend mints a short-lived acting token
 * (`POST /mssp/delegations/{id}/enter`). Every API call then carries it as
 * `X-Act-For`, alongside the analyst's own sign-in, and the backend runs the
 * request against the client's organization — re-checking the grant and the
 * analyst's assignment on every call, so a revocation takes effect at once.
 *
 * Storage is per tab and per application (sessionStorage), because the token is
 * bound to one application and one client. This module holds the token only;
 * entering and leaving live in `actingSession.ts`.
 */

export interface ActingSession {
  token: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  clientOrganizationId: number;
  clientName: string;
  delegationId: number;
  application: string;
  approvalMode: "client" | "mssp";
}

const KEY = "sg_acting_session";
export const ACTING_EVENT = "phantix:acting-changed";
export const ACTING_HEADER = "X-Act-For";

function read(): ActingSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ActingSession;
    return s && typeof s.token === "string" && typeof s.expiresAt === "number" ? s : null;
  } catch {
    return null;
  }
}

/** The live acting session, or null (expired sessions are dropped here). */
export function getActingSession(): ActingSession | null {
  const s = read();
  if (!s) return null;
  if (s.expiresAt <= Date.now()) {
    clearActingSession("expired");
    return null;
  }
  return s;
}

export function setActingSession(s: ActingSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: the session lasts for this page only */
  }
  window.dispatchEvent(new CustomEvent(ACTING_EVENT, { detail: { session: s } }));
}

export type ActingEndReason = "exit" | "expired" | "revoked";

export function clearActingSession(reason: ActingEndReason = "exit"): void {
  const had = read();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  if (had) {
    window.dispatchEvent(
      new CustomEvent(ACTING_EVENT, { detail: { session: null, reason, clientName: had.clientName } }),
    );
  }
}

/**
 * The `X-Act-For` value for a request, or null.
 *
 * Never sent on `/mssp/*`: those calls (the launcher list, entering a client)
 * are the analyst acting as the MSSP itself.
 */
export function actingHeaderFor(path: string): string | null {
  if (path.startsWith("/mssp/")) return null;
  return getActingSession()?.token ?? null;
}

/** Backend codes that mean the acting session (not the analyst's sign-in) is over. */
export function isActingFailure(status: number, detail: unknown): boolean {
  if (status !== 401 && status !== 403) return false;
  const code = detail && typeof detail === "object" ? String((detail as Record<string, unknown>).code ?? "") : "";
  return code.startsWith("acting_session") || code.startsWith("delegation") || code.startsWith("assignment");
}
