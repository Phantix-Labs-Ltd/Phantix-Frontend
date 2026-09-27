// Open/toggle requests for the SecureGraph Agent panel.
//
// Kept apart from AgentAssistant so the shell can wire its header button
// without importing the panel: the panel (its Markdown renderer, animations and
// chat logic) is loaded lazily, off the first-paint bundle. A request made
// before the panel has mounted is held and replayed when it does, so an early
// click is not lost while the panel's chunk is still loading.

export type AssistantMode = "agent" | "support";

/** Event any surface can fire to open the assistant panel. */
export const ASSISTANT_OPEN_EVENT = "sg:assistant:open";

export const ASSISTANT_TOGGLE_EVENT = "sg:assistant:toggle";

type PendingRequest = { kind: "open"; mode?: AssistantMode } | { kind: "toggle" } | null;

let panelMounted = false;
let pending: PendingRequest = null;

/** Open the assistant panel, optionally straight into support. */
export function openAssistant(mode?: AssistantMode): void {
  if (!panelMounted) pending = { kind: "open", mode };
  window.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT, { detail: { mode } }));
}

export function toggleAssistant(): void {
  // Two toggles before the panel mounts cancel out, as they would have live.
  if (!panelMounted) pending = pending?.kind === "toggle" ? null : { kind: "toggle" };
  window.dispatchEvent(new CustomEvent(ASSISTANT_TOGGLE_EVENT));
}

/** Called by the panel once it listens: returns (and clears) any early request. */
export function claimPendingAssistantRequest(): PendingRequest {
  panelMounted = true;
  const request = pending;
  pending = null;
  return request;
}

/** Called by the panel when it unmounts, so requests are held again. */
export function releaseAssistantPanel(): void {
  panelMounted = false;
}
