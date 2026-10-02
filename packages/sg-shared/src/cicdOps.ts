// CI/CD monitoring — provider connections, watch rules and trigger history.
//
// Contracts mirror app/engines/asset_engine/api/cicd.py (the org router mounted
// under /cicd, get_current_active_organization). Provider webhooks (push /
// deployment) are signature-verified ungated under /cicd/webhooks/{provider};
// a matching enabled watch rule enqueues a branch-review scan, bounded by the
// org's daily scan cap. This module is the single FE source of truth for the
// CI/CD settings surface, shared by the Code application's CI/CD page.
import { api, delay, isDemoMode, API_BASE } from "./api";
import { sameOriginApiUrl } from "./apiOrigin";

const BASE = "/cicd";

/** Providers the backend can verify + normalize (cicd_service.PROVIDERS). */
export const CICD_PROVIDERS = [
  "github",
  "gitlab",
  "gitea",
  "bitbucket",
  "azure_devops",
  "jenkins",
  "circleci",
  "generic",
] as const;
export type CiCdProviderId = (typeof CICD_PROVIDERS)[number];

/** Event types a watch rule can act on. */
export const CICD_EVENT_TYPES = ["push", "deployment", "pipeline", "workflow_run"] as const;
export type CiCdEventType = (typeof CICD_EVENT_TYPES)[number];

export interface CiCdProvider {
  provider: string;
  secret_configured: boolean;
  events: string[];
}

export interface CiCdConnection {
  id: number;
  provider: string;
  display_name: string;
  status: string;
  secret_configured: boolean;
  last_event_at: string | null;
  created_at: string | null;
}

export interface CiCdConnectionCreate {
  provider: string;
  display_name?: string;
  /** Optional per-connection shared secret; the platform env secret is used when unset. */
  secret?: string;
}

export interface CiCdWatchRule {
  id: number;
  connection_id: number;
  provider: string;
  repo_full_name: string;
  branch_pattern: string;
  is_glob: boolean;
  event_types: string[];
  scan_profile: string | null;
  environment_filter: string | null;
  enabled: boolean;
  auto_scan: boolean;
  created_at: string | null;
}

export interface CiCdWatchRuleCreate {
  connection_id: number;
  repo_full_name: string;
  branch_pattern?: string;
  event_types?: string[];
  scan_profile?: string | null;
  environment_filter?: string | null;
}

export interface CiCdWatchRuleUpdate {
  branch_pattern?: string;
  event_types?: string[];
  scan_profile?: string | null;
  environment_filter?: string | null;
  enabled?: boolean;
  auto_scan?: boolean;
}

export interface CiCdEvent {
  id: number;
  provider: string;
  repo_full_name: string;
  branch: string;
  commit_sha: string;
  event_type: string;
  actor: string | null;
  environment: string | null;
  scan_profile: string | null;
  status: string;
  scan_job_id: string | null;
  detail: string | null;
  received_at: string | null;
}

interface ListEnvelope<T> {
  total?: number;
  items: T[];
}

// ── Providers ───────────────────────────────────────────────────────────────

export async function listProviders() {
  if (isDemoMode()) {
    await delay();
    return { providers: demoProviders };
  }
  return api.get<{ providers: CiCdProvider[] }>(`${BASE}/providers`);
}

// ── Connections ─────────────────────────────────────────────────────────────

export async function listConnections() {
  if (isDemoMode()) {
    await delay();
    return { items: demoConnections, total: demoConnections.length } as ListEnvelope<CiCdConnection>;
  }
  return api.get<ListEnvelope<CiCdConnection>>(`${BASE}/connections`);
}

export async function createConnection(body: CiCdConnectionCreate) {
  if (isDemoMode()) {
    await delay();
    const created: CiCdConnection = {
      id: Math.max(0, ...demoConnections.map((c) => c.id)) + 1,
      provider: body.provider,
      display_name: body.display_name || body.provider,
      status: "active",
      secret_configured: Boolean(body.secret),
      last_event_at: null,
      created_at: new Date().toISOString(),
    };
    return created;
  }
  return api.post<CiCdConnection>(`${BASE}/connections`, body);
}

export async function deleteConnection(id: number) {
  if (isDemoMode()) {
    await delay();
    return;
  }
  return api.delete<void>(`${BASE}/connections/${id}`);
}

// ── Watch rules ─────────────────────────────────────────────────────────────

export async function listRules() {
  if (isDemoMode()) {
    await delay();
    return { items: demoRules, total: demoRules.length } as ListEnvelope<CiCdWatchRule>;
  }
  return api.get<ListEnvelope<CiCdWatchRule>>(`${BASE}/rules`);
}

export async function createRule(body: CiCdWatchRuleCreate) {
  if (isDemoMode()) {
    await delay();
    const conn = demoConnections.find((c) => c.id === body.connection_id) ?? demoConnections[0];
    const created: CiCdWatchRule = {
      id: Math.max(0, ...demoRules.map((r) => r.id)) + 1,
      connection_id: body.connection_id,
      provider: conn?.provider ?? "github",
      repo_full_name: body.repo_full_name,
      branch_pattern: body.branch_pattern || "main",
      is_glob: (body.branch_pattern || "").includes("*"),
      event_types: body.event_types?.length ? body.event_types : ["push", "deployment"],
      scan_profile: body.scan_profile ?? null,
      environment_filter: body.environment_filter ?? null,
      enabled: true,
      auto_scan: true,
      created_at: new Date().toISOString(),
    };
    return created;
  }
  return api.post<CiCdWatchRule>(`${BASE}/rules`, body);
}

export async function updateRule(id: number, body: CiCdWatchRuleUpdate) {
  if (isDemoMode()) {
    await delay();
    const current = demoRules.find((r) => r.id === id) ?? demoRules[0];
    return { ...current, ...body } as CiCdWatchRule;
  }
  return api.patch<CiCdWatchRule>(`${BASE}/rules/${id}`, body);
}

export async function deleteRule(id: number) {
  if (isDemoMode()) {
    await delay();
    return;
  }
  return api.delete<void>(`${BASE}/rules/${id}`);
}

// ── Trigger history ─────────────────────────────────────────────────────────

export async function listEvents(limit = 50) {
  if (isDemoMode()) {
    await delay();
    return { items: demoEvents.slice(0, limit), total: demoEvents.length } as ListEnvelope<CiCdEvent>;
  }
  return api.get<ListEnvelope<CiCdEvent>>(`${BASE}/events?limit=${limit}`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Human label for a provider id. */
export const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
  bitbucket: "Bitbucket",
  azure_devops: "Azure DevOps",
  jenkins: "Jenkins",
  circleci: "CircleCI",
  generic: "Generic / custom",
};

export function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id;
}

/**
 * Absolute webhook URL a provider posts to. Scoped to a connection when an id
 * is given, so a signature can be verified against that connection's secret.
 * Same-origin (the proxy forwards to the backend) — never the upstream host.
 */
export function cicdWebhookUrl(provider: string, connectionId?: number | null): string {
  const path = connectionId
    ? `${API_BASE}${BASE}/webhooks/${provider}/${connectionId}`
    : `${API_BASE}${BASE}/webhooks/${provider}`;
  return sameOriginApiUrl(path);
}

/** Signature header each provider sends (shown in setup copy). */
export const PROVIDER_SIGNATURE_HEADER: Record<string, string> = {
  github: "X-Hub-Signature-256",
  gitlab: "X-Gitlab-Token",
  gitea: "X-Gitea-Signature",
  bitbucket: "X-Hub-Signature",
  azure_devops: "Authorization (basic)",
  jenkins: "X-Jenkins-Signature",
  circleci: "Circleci-Signature",
  generic: "X-SecureGraph-Signature",
};

// ── Demo fixtures ─────────────────────────────────────────────────────────────

const demoProviders: CiCdProvider[] = CICD_PROVIDERS.map((p) => ({
  provider: p,
  secret_configured: ["github", "gitlab"].includes(p),
  events: ["push", "deployment", "pipeline", "workflow_run"],
}));

const demoConnections: CiCdConnection[] = [
  {
    id: 1,
    provider: "github",
    display_name: "acme-org (GitHub)",
    status: "active",
    secret_configured: true,
    last_event_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    created_at: new Date(Date.now() - 20 * 864e5).toISOString(),
  },
  {
    id: 2,
    provider: "gitlab",
    display_name: "platform group (GitLab)",
    status: "active",
    secret_configured: true,
    last_event_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
    created_at: new Date(Date.now() - 9 * 864e5).toISOString(),
  },
];

const demoRules: CiCdWatchRule[] = [
  {
    id: 1,
    connection_id: 1,
    provider: "github",
    repo_full_name: "acme-org/payments-api",
    branch_pattern: "main",
    is_glob: false,
    event_types: ["push", "deployment"],
    scan_profile: "deep",
    environment_filter: null,
    enabled: true,
    auto_scan: true,
    created_at: new Date(Date.now() - 18 * 864e5).toISOString(),
  },
  {
    id: 2,
    connection_id: 1,
    provider: "github",
    repo_full_name: "acme-org/web-frontend",
    branch_pattern: "release/*",
    is_glob: true,
    event_types: ["push"],
    scan_profile: null,
    environment_filter: "production",
    enabled: true,
    auto_scan: true,
    created_at: new Date(Date.now() - 12 * 864e5).toISOString(),
  },
  {
    id: 3,
    connection_id: 2,
    provider: "gitlab",
    repo_full_name: "platform/billing",
    branch_pattern: "main",
    is_glob: false,
    event_types: ["push", "deployment", "pipeline"],
    scan_profile: "standard",
    environment_filter: null,
    enabled: false,
    auto_scan: true,
    created_at: new Date(Date.now() - 4 * 864e5).toISOString(),
  },
];

const demoEvents: CiCdEvent[] = [
  {
    id: 104,
    provider: "github",
    repo_full_name: "acme-org/payments-api",
    branch: "main",
    commit_sha: "a1b2c3d4e5f6a7b8",
    event_type: "push",
    actor: "dev-amaka",
    environment: null,
    scan_profile: "deep",
    status: "scan_queued",
    scan_job_id: "scan_8841",
    detail: "Branch review queued",
    received_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    id: 103,
    provider: "gitlab",
    repo_full_name: "platform/billing",
    branch: "main",
    commit_sha: "f0e9d8c7b6a5f4e3",
    event_type: "deployment",
    actor: "ci-bot",
    environment: "production",
    scan_profile: "standard",
    status: "disabled",
    scan_job_id: null,
    detail: "Rule disabled",
    received_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
  },
  {
    id: 102,
    provider: "github",
    repo_full_name: "acme-org/web-frontend",
    branch: "release/2026.09",
    commit_sha: "11aa22bb33cc44dd",
    event_type: "push",
    actor: "dev-tunde",
    environment: "production",
    scan_profile: null,
    status: "throttled",
    scan_job_id: null,
    detail: "Daily scan cap reached (40/40)",
    received_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
  },
  {
    id: 101,
    provider: "github",
    repo_full_name: "acme-org/payments-api",
    branch: "feature/wallet",
    commit_sha: "99887766aabbccdd",
    event_type: "push",
    actor: "dev-amaka",
    environment: null,
    scan_profile: null,
    status: "no_rule",
    scan_job_id: null,
    detail: "No matching watch rule",
    received_at: new Date(Date.now() - 3 * 864e5).toISOString(),
  },
];
