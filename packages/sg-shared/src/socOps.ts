// SOC telemetry & detection — continuous monitoring & alerting (CMA), detection
// packs, cloud configuration changes, and log retention / privacy.
//
// Contracts mirror the org routers under /soc:
//   app/engines/soc_engine/api/detection.py  (packs, alerts, cloud-config)
//   app/engines/soc_engine/api/events.py      (log-retention, events, erase)
// Both mounted at /api/v1/soc, get_current_active_organization. This module is
// the single FE source of truth for those paths and types; pages import from it
// and never call api.* directly for these domains.
import { api, delay, isDemoMode } from "./api";

const BASE = "/soc";

// ── Shared vocab ──────────────────────────────────────────────────────────────

export const ALERT_STATES = ["open", "acknowledged", "escalated", "resolved", "false_positive"] as const;
export type AlertState = (typeof ALERT_STATES)[number];

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

export const CHANGE_TYPES = ["added", "changed", "removed"] as const;

export const ALERT_STATE_LABELS: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  escalated: "Escalated",
  resolved: "Resolved",
  false_positive: "False positive",
};

/** State → the same tone vocabulary the other pages use (no hardcoded hex). */
export function stateBadgeTone(state: string): string {
  switch (state) {
    case "open":
      return "border-severity-high/30 bg-severity-high/10 text-severity-high";
    case "acknowledged":
      return "border-amber-400/30 bg-amber-400/10 text-amber-300";
    case "escalated":
      return "border-severity-critical/30 bg-severity-critical/10 text-severity-critical";
    case "resolved":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
    case "false_positive":
      return "border-phantix-600/40 bg-phantix-800/50 text-slate-400";
    default:
      return "border-phantix-600/40 bg-phantix-800/50 text-slate-400";
  }
}

export const CHANGE_TYPE_TONE: Record<string, string> = {
  added: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  changed: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  removed: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
};

interface ListEnvelope<T> {
  total?: number;
  items: T[];
}

// ── Continuous Monitoring & Alerting (CMA) ──────────────────────────────────────

export interface CiAlert {
  id: number;
  signal_id: number | null;
  rule_title: string;
  rule_source: string;
  rule_version: string | null;
  severity: string;
  entity_type: string | null;
  entity_id: string | null;
  mitre_technique: string | null;
  state: string;
  dedup_key: string | null;
  occurrence_count: number;
  evidence: Record<string, unknown>;
  first_seen_at: string | null;
  last_seen_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  time_to_acknowledge_seconds: number | null;
  escalated_at: string | null;
  resolved_at: string | null;
  time_to_resolve_seconds: number | null;
  sla_ack_by: string | null;
  sla_resolve_by: string | null;
  soc_detection_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AlertSummary {
  byState: Record<string, number>;
  openBySeverity: Record<string, number>;
  mttaSeconds: number | null;
  mttrSeconds: number | null;
}

export type AlertAction = "acknowledge" | "escalate" | "resolve" | "false-positive";

export async function listAlerts(params: { state?: string; severity?: string; limit?: number } = {}) {
  if (isDemoMode()) {
    await delay();
    let items = demoAlerts;
    if (params.state) items = items.filter((a) => a.state === params.state);
    if (params.severity) items = items.filter((a) => a.severity === params.severity);
    return { items, total: items.length } as ListEnvelope<CiAlert>;
  }
  const q = new URLSearchParams();
  if (params.state) q.set("state", params.state);
  if (params.severity) q.set("severity", params.severity);
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return api.get<ListEnvelope<CiAlert>>(`${BASE}/alerts${qs ? `?${qs}` : ""}`);
}

export async function alertsSummary() {
  if (isDemoMode()) {
    await delay();
    return demoAlertSummary;
  }
  return api.get<AlertSummary>(`${BASE}/alerts/summary`);
}

export async function slaBreaches() {
  if (isDemoMode()) {
    await delay();
    const items = demoAlerts.filter((a) => a.state === "open");
    return { items, total: items.length } as ListEnvelope<CiAlert>;
  }
  return api.get<ListEnvelope<CiAlert>>(`${BASE}/alerts/sla-breaches`);
}

export async function alertAction(alertId: number, action: AlertAction) {
  if (isDemoMode()) {
    await delay();
    const cur = demoAlerts.find((a) => a.id === alertId)!;
    const now = new Date().toISOString();
    const patch: Partial<CiAlert> =
      action === "acknowledge"
        ? { state: "acknowledged", acknowledged_at: now }
        : action === "escalate"
          ? { state: "escalated", escalated_at: now }
          : action === "resolve"
            ? { state: "resolved", resolved_at: now }
            : { state: "false_positive" };
    return { ...cur, ...patch } as CiAlert;
  }
  return api.post<CiAlert>(`${BASE}/alerts/${alertId}/${action}`);
}

// ── Detection packs ──────────────────────────────────────────────────────────

export interface CiPack {
  id: number;
  pack_id: string;
  name: string;
  version: string;
  rule_count: number;
  enabled: boolean;
  created_at: string | null;
}

export interface PlatformPack {
  pack_id: string;
  version: string;
  rule_count: number;
  owned_by: string;
}

export interface PacksResponse {
  platform: PlatformPack;
  vendor: CiPack[];
  pysigma: boolean;
}

export interface PackCreate {
  pack_id?: string;
  name: string;
  version: string;
  rules_yaml: string;
}

/** Create returns the stored row plus any non-fatal rule errors. */
export interface PackCreateResult {
  id: number;
  pack_id: string;
  rule_count: number;
  errors?: string[];
}

export async function listPacks() {
  if (isDemoMode()) {
    await delay();
    return demoPacks;
  }
  return api.get<PacksResponse>(`${BASE}/packs`);
}

export async function createPack(body: PackCreate) {
  if (isDemoMode()) {
    await delay();
    return { id: Math.max(0, ...demoPacks.vendor.map((p) => p.id)) + 1, pack_id: body.pack_id || "vendor-pack", rule_count: 3, errors: [] } as PackCreateResult;
  }
  return api.post<PackCreateResult>(`${BASE}/packs`, body);
}

export async function deletePack(packRowId: number) {
  if (isDemoMode()) {
    await delay();
    return;
  }
  return api.delete<void>(`${BASE}/packs/${packRowId}`);
}

// ── Cloud configuration changes ─────────────────────────────────────────────────

export interface CloudChange {
  id: number;
  connection_id: number | null;
  provider: string;
  control_id: string;
  change_type: string;
  previous_value: string | null;
  new_value: string | null;
  severity: string;
  detected_at: string | null;
}

export interface CloudSnapshot {
  id: number;
  connection_id: number | null;
  provider: string;
  captured_at: string | null;
  posture_hash: string | null;
  control_count: number;
}

export interface SweepResult {
  snapshot_id: number | null;
  posture_hash?: string | null;
  changes: Array<Record<string, unknown>>;
  alerts_opened: number;
  unchanged: boolean;
}

export async function listCloudChanges(limit = 100) {
  if (isDemoMode()) {
    await delay();
    return { items: demoCloudChanges.slice(0, limit), total: demoCloudChanges.length } as ListEnvelope<CloudChange>;
  }
  return api.get<ListEnvelope<CloudChange>>(`${BASE}/cloud-config/changes?limit=${limit}`);
}

export async function listCloudSnapshots(limit = 50) {
  if (isDemoMode()) {
    await delay();
    return { items: demoCloudSnapshots.slice(0, limit), total: demoCloudSnapshots.length } as ListEnvelope<CloudSnapshot>;
  }
  return api.get<ListEnvelope<CloudSnapshot>>(`${BASE}/cloud-config/snapshots?limit=${limit}`);
}

export async function sweepConnection(connectionId: number) {
  if (isDemoMode()) {
    await delay(700);
    return { snapshot_id: 9001, posture_hash: "demo", changes: [], alerts_opened: 0, unchanged: true } as SweepResult;
  }
  return api.post<SweepResult>(`${BASE}/cloud-config/connections/${connectionId}/sweep`);
}

// ── Log retention & privacy ─────────────────────────────────────────────────────

export interface LogRetention {
  raw_enabled: boolean;
  raw_ttl_days: number;
  event_ttl_days: number;
  residency_region: string;
  updated_by: string | null;
  updated_at: string | null;
}

export type LogRetentionUpdate = Partial<Pick<LogRetention, "raw_enabled" | "raw_ttl_days" | "event_ttl_days" | "residency_region">>;

export interface SocEvent {
  id: number;
  host_pseudonym: string | null;
  source: string | null;
  log_type: string | null;
  event_type: string | null;
  action: string | null;
  outcome: string | null;
  level: string | null;
  severity: string | null;
  timestamp: string | null;
  message: string | null;
  user_pseudonym: string | null;
  mitre_technique: string | null;
  asset_id: number | null;
}

export interface EraseRequest {
  pseudonym?: string;
  subject?: string;
  pseudonym_key?: string;
  confirm: true;
}

export interface EraseResult {
  events_erased: number;
  objects_erased: number;
}

export async function getLogRetention() {
  if (isDemoMode()) {
    await delay();
    return demoRetention;
  }
  return api.get<LogRetention>(`${BASE}/log-retention`);
}

export async function setLogRetention(body: LogRetentionUpdate) {
  if (isDemoMode()) {
    await delay();
    return { ...demoRetention, ...body, updated_at: new Date().toISOString() } as LogRetention;
  }
  return api.put<LogRetention>(`${BASE}/log-retention`, body);
}

export async function listSocEvents(params: { q?: string; severity?: string; log_type?: string; limit?: number } = {}) {
  if (isDemoMode()) {
    await delay();
    let items = demoSocEvents;
    if (params.q) items = items.filter((e) => (e.message ?? "").toLowerCase().includes(params.q!.toLowerCase()));
    if (params.severity) items = items.filter((e) => e.severity === params.severity);
    if (params.log_type) items = items.filter((e) => e.log_type === params.log_type);
    return { items, total: items.length } as ListEnvelope<SocEvent>;
  }
  const q = new URLSearchParams();
  if (params.q) q.set("q", params.q);
  if (params.severity) q.set("severity", params.severity);
  if (params.log_type) q.set("log_type", params.log_type);
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return api.get<ListEnvelope<SocEvent>>(`${BASE}/events${qs ? `?${qs}` : ""}`);
}

export async function eraseSubject(body: EraseRequest) {
  if (isDemoMode()) {
    await delay();
    return { events_erased: 12, objects_erased: 3 } as EraseResult;
  }
  return api.post<EraseResult>(`${BASE}/logs/erase`, body);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/** A deadline is breached when it is in the past and the alert is still open. */
export function isSlaBreached(deadline: string | null, state: string): boolean {
  if (!deadline || state === "resolved" || state === "false_positive") return false;
  return new Date(deadline).getTime() < Date.now();
}

// ── Demo fixtures ──────────────────────────────────────────────────────────────

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

const demoAlerts: CiAlert[] = [
  {
    id: 501,
    signal_id: 88021,
    rule_title: "Impossible travel for privileged account",
    rule_source: "platform",
    rule_version: "1.4.0",
    severity: "critical",
    entity_type: "user",
    entity_id: "usr_7f3a…",
    mitre_technique: "T1078",
    state: "open",
    dedup_key: "imposs-travel-usr7f3a",
    occurrence_count: 4,
    evidence: { geo: ["Lagos", "Toronto"], window_minutes: 7 },
    first_seen_at: iso(3 * 3600_000),
    last_seen_at: iso(12 * 60_000),
    acknowledged_at: null,
    acknowledged_by: null,
    time_to_acknowledge_seconds: null,
    escalated_at: null,
    resolved_at: null,
    time_to_resolve_seconds: null,
    sla_ack_by: iso(-30 * 60_000),
    sla_resolve_by: iso(-6 * 3600_000),
    soc_detection_id: 7120,
    created_at: iso(3 * 3600_000),
    updated_at: iso(12 * 60_000),
  },
  {
    id: 502,
    signal_id: 88044,
    rule_title: "Brute-force authentication burst",
    rule_source: "vendor:acme-rules",
    rule_version: "2.0.1",
    severity: "high",
    entity_type: "host",
    entity_id: "host_a19…",
    mitre_technique: "T1110",
    state: "acknowledged",
    dedup_key: "bruteforce-hosta19",
    occurrence_count: 37,
    evidence: { attempts: 412, source_ips: 9 },
    first_seen_at: iso(9 * 3600_000),
    last_seen_at: iso(40 * 60_000),
    acknowledged_at: iso(35 * 60_000),
    acknowledged_by: "soc-amaka",
    time_to_acknowledge_seconds: 1800,
    escalated_at: null,
    resolved_at: null,
    time_to_resolve_seconds: null,
    sla_ack_by: iso(8 * 3600_000),
    sla_resolve_by: iso(-2 * 3600_000),
    soc_detection_id: 7121,
    created_at: iso(9 * 3600_000),
    updated_at: iso(35 * 60_000),
  },
  {
    id: 503,
    signal_id: 87990,
    rule_title: "New admin role granted outside change window",
    rule_source: "platform",
    rule_version: "1.4.0",
    severity: "medium",
    entity_type: "cloud_account",
    entity_id: "aws:4451…",
    mitre_technique: "T1098",
    state: "resolved",
    dedup_key: "admin-grant-aws4451",
    occurrence_count: 1,
    evidence: { role: "AdministratorAccess" },
    first_seen_at: iso(2 * 864e5),
    last_seen_at: iso(2 * 864e5),
    acknowledged_at: iso(2 * 864e5 - 20 * 60_000),
    acknowledged_by: "soc-tunde",
    time_to_acknowledge_seconds: 1200,
    escalated_at: null,
    resolved_at: iso(864e5),
    time_to_resolve_seconds: 86400,
    sla_ack_by: iso(2 * 864e5 - 3600_000),
    sla_resolve_by: iso(864e5),
    soc_detection_id: 7090,
    created_at: iso(2 * 864e5),
    updated_at: iso(864e5),
  },
];

const demoAlertSummary: AlertSummary = {
  byState: { open: 1, acknowledged: 1, escalated: 0, resolved: 1, false_positive: 0 },
  openBySeverity: { critical: 1, high: 1, medium: 0, low: 0 },
  mttaSeconds: 1500,
  mttrSeconds: 86400,
};

const demoPacks: PacksResponse = {
  platform: { pack_id: "securegraph-core", version: "2026.09", rule_count: 214, owned_by: "securegraph" },
  vendor: [
    { id: 11, pack_id: "acme-rules", name: "ACME detection rules", version: "2.0.1", rule_count: 36, enabled: true, created_at: iso(14 * 864e5) },
    { id: 12, pack_id: "fintech-fraud", name: "Fintech fraud signals", version: "0.9.0", rule_count: 12, enabled: true, created_at: iso(3 * 864e5) },
  ],
  pysigma: true,
};

const demoCloudChanges: CloudChange[] = [
  { id: 71, connection_id: 3, provider: "aws", control_id: "s3.bucket.public-read", change_type: "changed", previous_value: "private", new_value: "public-read", severity: "critical", detected_at: iso(40 * 60_000) },
  { id: 70, connection_id: 3, provider: "aws", control_id: "iam.mfa.root", change_type: "removed", previous_value: "enabled", new_value: null, severity: "high", detected_at: iso(5 * 3600_000) },
  { id: 69, connection_id: 4, provider: "gcp", control_id: "firewall.ingress.0-0-0-0", change_type: "added", previous_value: null, new_value: "0.0.0.0/0:22", severity: "high", detected_at: iso(26 * 3600_000) },
];

const demoCloudSnapshots: CloudSnapshot[] = [
  { id: 410, connection_id: 3, provider: "aws", captured_at: iso(40 * 60_000), posture_hash: "9f2c…a1", control_count: 142 },
  { id: 409, connection_id: 4, provider: "gcp", captured_at: iso(60 * 60_000), posture_hash: "33be…7d", control_count: 88 },
  { id: 408, connection_id: 3, provider: "aws", captured_at: iso(864e5), posture_hash: "71aa…02", control_count: 142 },
];

const demoRetention: LogRetention = {
  raw_enabled: false,
  raw_ttl_days: 30,
  event_ttl_days: 365,
  residency_region: "ng",
  updated_by: "soc-amaka",
  updated_at: iso(7 * 864e5),
};

const demoSocEvents: SocEvent[] = [
  { id: 90012, host_pseudonym: "host_a19…", source: "agent", log_type: "auth", event_type: "login_failed", action: "login", outcome: "failure", level: "warning", severity: "high", timestamp: iso(40 * 60_000), message: "Failed password for pseudonymised user from pseudonymised IP", user_pseudonym: "usr_1a…", mitre_technique: "T1110", asset_id: 3310 },
  { id: 90008, host_pseudonym: "host_c02…", source: "filebeat", log_type: "process", event_type: "process_start", action: "exec", outcome: "success", level: "info", severity: "low", timestamp: iso(55 * 60_000), message: "Process started: scheduled task", user_pseudonym: "svc_9c…", mitre_technique: null, asset_id: 3302 },
  { id: 90001, host_pseudonym: "host_a19…", source: "agent", log_type: "auth", event_type: "login_success", action: "login", outcome: "success", level: "info", severity: "info", timestamp: iso(2 * 3600_000), message: "Successful login after lockout window", user_pseudonym: "usr_1a…", mitre_technique: null, asset_id: 3310 },
];
