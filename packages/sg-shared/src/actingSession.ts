/**
 * Entering and leaving a client's account as an MSSP analyst.
 *
 * The launcher (Choose app) opens an application with `?act_for=<client org>`
 * (and the delegation id when it knows it). The application then asks the
 * backend for an acting token for *itself* — the token is bound to one
 * application — and every later call carries it (see acting.ts).
 */
import { api, getActiveApplication } from "./api";
import { clearActingSession, getActingSession, setActingSession, type ActingSession } from "./acting";
import { loadDelegatedClients, type ApplicationKey } from "./applications";

export { clearActingSession, getActingSession } from "./acting";
export type { ActingSession } from "./acting";

/** Default length of a delegated session, in minutes (the backend allows 5–120). */
export const ACTING_MINUTES = 45;

interface EnterResponse {
  token: string;
  expires_at: string;
  expires_in: number;
  client_organization_id: number;
  delegation_id: number;
  application: string;
  approval_mode?: "client" | "mssp";
}

/** Mint an acting token for this application and start using it. */
export async function enterClient(input: {
  delegationId: number;
  clientOrganizationId: number;
  clientName: string;
  application?: ApplicationKey;
  minutes?: number;
}): Promise<ActingSession> {
  const application = input.application ?? (getActiveApplication() as ApplicationKey);
  // Leave any other client first: one acting session per tab.
  clearActingSession("exit");
  const out = await api.post<EnterResponse>(`/mssp/delegations/${input.delegationId}/enter`, {
    application,
    minutes: input.minutes ?? ACTING_MINUTES,
  });
  const expiresAt = Date.parse(out.expires_at.endsWith("Z") || out.expires_at.includes("+") ? out.expires_at : `${out.expires_at}Z`);
  const session: ActingSession = {
    token: out.token,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + out.expires_in * 1000,
    clientOrganizationId: out.client_organization_id,
    clientName: input.clientName,
    delegationId: out.delegation_id,
    application: out.application,
    approvalMode: out.approval_mode ?? "client",
  };
  setActingSession(session);
  return session;
}

export function leaveClient(): void {
  clearActingSession("exit");
}

/**
 * Turn the launcher's `?act_for=` into a session, once, then drop the parameter
 * from the address bar. Returns the session, null when there was nothing to do,
 * or throws with a reason the caller can show.
 */
export async function consumeActForParam(): Promise<ActingSession | null> {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("act_for");
  if (!raw) return null;
  const clientId = Number(raw);
  const delegationParam = Number(url.searchParams.get("delegation") || "");
  url.searchParams.delete("act_for");
  url.searchParams.delete("delegation");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  if (!Number.isFinite(clientId) || clientId <= 0) return null;

  const current = getActingSession();
  if (current && current.clientOrganizationId === clientId) return current;

  const application = getActiveApplication() as ApplicationKey;
  const clients = await loadDelegatedClients(application);
  const match =
    clients.find((c) => c.delegation_id === delegationParam && c.client_organization_id === clientId) ??
    clients.find((c) => c.client_organization_id === clientId);
  if (!match) {
    throw new Error("You no longer have access to that client in this application.");
  }
  return enterClient({
    delegationId: match.delegation_id,
    clientOrganizationId: match.client_organization_id,
    clientName: match.client_name,
    application,
  });
}
