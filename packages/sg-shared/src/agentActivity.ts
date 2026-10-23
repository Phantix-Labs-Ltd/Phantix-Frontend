// Agent activity — every action the agent took for this organization.
// Mirrors GET /ai/agent/activity (agent.py). Rows are written by the executor for
// both allowed and denied actions, so this records what was *asked*, by whom,
// and what happened.
import { api, delay, isDemoMode } from "./api";

export interface AgentAction {
  id: number;
  organization_id: number;
  event_id?: string | null;
  run_id?: string | null;
  domain?: string | null;
  tool?: string | null;
  /** The action in words ("List assets"), from the backend's tool registry. */
  action_label?: string | null;
  /** read | change, when the registry knows the tool. */
  action_kind?: "read" | "change" | null;
  /** Activity rows (turns, session events) carry a type instead of a tool. */
  activity_type?: string | null;
  summary?: string | null;
  intent?: string | null;
  params?: string | null;
  authorized?: boolean | null;
  actor_user_id?: number | null;
  actor_role?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  context?: string[];
  status: string;
  error?: string | null;
  created_at?: string | null;
  evidence_hash?: string | null;
  response_hash?: string | null;
}

export interface AgentActivityResponse {
  items: AgentAction[];
  total: number;
  limit: number;
  offset: number;
  summary?: { returned?: number; denied_or_failed?: number };
}

export interface AgentActivityFilter {
  status?: string;
  domain?: string;
  tool?: string;
  run_id?: string;
  limit?: number;
  offset?: number;
}

export function buildAgentActivityQuery(filter: AgentActivityFilter): string {
  const q = new URLSearchParams();
  if (filter.status) q.set("status", filter.status);
  if (filter.domain) q.set("domain", filter.domain);
  if (filter.tool) q.set("tool", filter.tool);
  if (filter.run_id) q.set("run_id", filter.run_id);
  if (filter.limit != null) q.set("limit", String(filter.limit));
  if (filter.offset != null) q.set("offset", String(filter.offset));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function loadAgentActivity(filter: AgentActivityFilter = {}) {
  if (isDemoMode()) {
    await delay(240);
    return { items: [] as AgentAction[], total: 0, limit: filter.limit ?? 50, offset: filter.offset ?? 0 };
  }
  return api.get<AgentActivityResponse>(`/ai/agent/activity${buildAgentActivityQuery(filter)}`);
}

/** `asset.list` / `list_findings` / `session_started` → readable words. */
export function humanizeIdentifier(name?: string | null): string | null {
  const words = String(name ?? "").trim().split(/[._:\-\s]+/).filter(Boolean);
  if (!words.length) return null;
  const text = words.join(" ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What the agent did, in words. The backend names it; an older API sends
 *  only the tool id, which is made readable here rather than shown raw. */
export function actionLabelOf(row: AgentAction): string {
  return row.action_label || humanizeIdentifier(row.tool) || humanizeIdentifier(row.activity_type) || "Agent action";
}

/** Why: the operator's prompt or the run objective, never the "-" placeholder. */
export function intentOf(row: AgentAction): string | null {
  const intent = (row.intent ?? "").trim();
  if (intent && intent !== "-") return intent;
  const summary = (row.summary ?? "").trim();
  return summary || null;
}

/** A denial reason is a control working, not a bug. */
export function isDenied(row: AgentAction): boolean {
  return String(row.status || "").toLowerCase() === "failed";
}
