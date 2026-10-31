import { api, delay, isDemoMode } from "./api";

/*
 * API endpoint inventory (`/api/v1/api-specs`).
 *
 * An API is added from its OpenAPI / Swagger spec. The backend keeps an index
 * of its endpoints and diffs it on every re-index (the button, an optional
 * interval, a CI hook after a deploy, and a weekly check across every
 * organization), so the endpoints a deploy added or changed are flagged until
 * they are tested. Testing runs Schemathesis on just the chosen endpoints as a
 * normal scan job.
 */

/** `new` and `changed` stay flagged until the endpoint is tested after the change. */
export type EndpointState = "new" | "changed" | "untested" | "tested" | "removed";

export interface EndpointTest {
  status: "queued" | "running" | "passed" | "failed" | "error";
  at: string;
  job_id?: number | null;
  cases?: number;
  failures?: number;
  codes?: string[];
  error?: string;
  writes_allowed?: boolean;
}

export interface ApiEndpoint {
  key: string;
  method: string;
  path: string;
  operation_id: string | null;
  summary: string | null;
  tags: string[];
  deprecated: boolean;
  /** The spec declares authentication for this operation. */
  auth: boolean;
  /** POST / PUT / PATCH / DELETE: testing sends generated data. */
  writes: boolean;
  first_seen_at: string | null;
  changed_at: string | null;
  removed_at: string | null;
  state: EndpointState;
  last_test: EndpointTest | null;
}

export interface ReindexEntry {
  at: string;
  trigger: "added" | "manual" | "upload" | "schedule" | "ci" | "weekly";
  ok: boolean;
  added?: number;
  changed?: number;
  removed?: number;
  error?: string;
}

export interface ApiSpec {
  id: number;
  name: string;
  base_url: string;
  environment: string | null;
  is_verified: boolean;
  spec_url: string | null;
  spec_source: "url" | "upload";
  title: string | null;
  version: string | null;
  format: string | null;
  indexed_at: string | null;
  auto_reindex: boolean;
  interval_minutes: number | null;
  hook_enabled: boolean;
  auth_header: { name: string; set: true } | null;
  spec_uses_auth: boolean;
  last_error: ReindexEntry | null;
  counts: { total: number; new: number; changed: number; removed: number; untested: number; failing: number };
  endpoints?: ApiEndpoint[];
  history?: ReindexEntry[];
}

export interface ReindexResult {
  result: ReindexEntry & { new_endpoints: string[]; changed_endpoints: string[]; removed_endpoints: string[] };
  api: ApiSpec;
}

export interface AddApiInput {
  base_url: string;
  name?: string;
  spec_url?: string;
  spec_file?: File | null;
  environment?: string;
  auto_reindex?: boolean;
  interval_minutes?: number;
  auth_header_name?: string;
  auth_header_value?: string;
  spec_uses_auth?: boolean;
}

export interface ApiSpecSettings {
  name?: string;
  spec_url?: string;
  auto_reindex?: boolean;
  interval_minutes?: number;
  spec_uses_auth?: boolean;
  auth_header_name?: string;
  auth_header_value?: string;
  clear_auth_header?: boolean;
}

const P = "/api-specs";

// ── Demo tenant: one staging API with every endpoint state ──────────────────

function demoAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function demoEndpoint(
  method: string,
  path: string,
  summary: string,
  state: EndpointState,
  extra: Partial<ApiEndpoint> = {},
): ApiEndpoint {
  return {
    key: `${method} ${path}`,
    method,
    path,
    operation_id: null,
    summary,
    tags: [path.split("/")[2] ?? "api"],
    deprecated: false,
    auth: true,
    writes: ["POST", "PUT", "PATCH", "DELETE"].includes(method),
    first_seen_at: state === "new" ? demoAgo(20) : demoAgo(24 * 30),
    changed_at: state === "changed" ? demoAgo(20) : null,
    removed_at: state === "removed" ? demoAgo(20) : null,
    state,
    last_test: null,
    ...extra,
  };
}

function demoApi(): ApiSpec {
  const endpoints: ApiEndpoint[] = [
    demoEndpoint("GET", "/v1/orders", "List orders", "tested", {
      last_test: { status: "passed", at: demoAgo(48), cases: 31, failures: 0, codes: [] },
    }),
    demoEndpoint("POST", "/v1/orders", "Create an order", "tested", {
      last_test: { status: "failed", at: demoAgo(48), cases: 30, failures: 2, codes: ["ST101", "ST201"] },
    }),
    demoEndpoint("GET", "/v1/orders/{orderId}/refunds", "List refunds for an order", "new"),
    demoEndpoint("POST", "/v1/orders/{orderId}/refunds", "Refund part or all of an order", "new"),
    demoEndpoint("PATCH", "/v1/customers/{customerId}", "Update a customer", "changed", {
      last_test: { status: "passed", at: demoAgo(24 * 9), cases: 28, failures: 0, codes: [] },
    }),
    demoEndpoint("GET", "/v1/admin/reports/settlements", "Settlement report (admin)", "untested"),
    demoEndpoint("DELETE", "/v1/sessions/{sessionId}", "Revoke a session", "removed"),
  ];
  return {
    id: 1,
    name: "Payments API",
    base_url: "https://staging-api.demo-org.example",
    environment: "staging",
    is_verified: true,
    spec_url: "https://staging-api.demo-org.example/openapi.json",
    spec_source: "url",
    title: "Payments API",
    version: "2.14.0",
    format: "OpenAPI 3.1.0",
    indexed_at: demoAgo(2),
    auto_reindex: false,
    interval_minutes: 60,
    hook_enabled: true,
    auth_header: { name: "Authorization", set: true },
    spec_uses_auth: false,
    last_error: null,
    counts: { total: 6, new: 2, changed: 1, removed: 1, untested: 1, failing: 1 },
    endpoints,
    history: [
      { at: demoAgo(20), trigger: "ci", ok: true, added: 2, changed: 1, removed: 1 },
      { at: demoAgo(24 * 7), trigger: "weekly", ok: true, added: 0, changed: 0, removed: 0 },
      { at: demoAgo(24 * 30), trigger: "added", ok: true, added: 4, changed: 0, removed: 0 },
    ],
  };
}

export async function listApiSpecs(): Promise<ApiSpec[]> {
  if (isDemoMode()) {
    await delay(200);
    const { endpoints: _e, history: _h, ...summary } = demoApi();
    return [summary];
  }
  return (await api.get<{ items: ApiSpec[] }>(P)).items ?? [];
}

export async function getApiSpec(id: number): Promise<ApiSpec> {
  if (isDemoMode()) {
    await delay(200);
    return demoApi();
  }
  return api.get<ApiSpec>(`${P}/${id}`);
}

export function addApiSpec(input: AddApiInput): Promise<ApiSpec> {
  const form = new FormData();
  form.set("base_url", input.base_url.trim());
  if (input.name?.trim()) form.set("name", input.name.trim());
  if (input.spec_file) form.set("spec_file", input.spec_file);
  else if (input.spec_url?.trim()) form.set("spec_url", input.spec_url.trim());
  if (input.environment?.trim()) form.set("environment", input.environment.trim());
  form.set("auto_reindex", String(Boolean(input.auto_reindex)));
  if (input.interval_minutes) form.set("interval_minutes", String(input.interval_minutes));
  if (input.auth_header_name?.trim() && input.auth_header_value) {
    form.set("auth_header_name", input.auth_header_name.trim());
    form.set("auth_header_value", input.auth_header_value);
    form.set("spec_uses_auth", String(Boolean(input.spec_uses_auth)));
  }
  return api.upload<ApiSpec>(P, form);
}

export function reindexApiSpec(id: number, file?: File | null): Promise<ReindexResult> {
  if (file) {
    const form = new FormData();
    form.set("spec_file", file);
    return api.upload<ReindexResult>(`${P}/${id}/reindex`, form);
  }
  return api.post<ReindexResult>(`${P}/${id}/reindex`);
}

export function updateApiSpec(id: number, settings: ApiSpecSettings): Promise<ApiSpec> {
  return api.patch<ApiSpec>(`${P}/${id}`, settings);
}

export function createHookToken(id: number): Promise<{ token: string; header: string; path: string }> {
  return api.post(`${P}/${id}/hook-token`);
}

export function revokeHookToken(id: number): Promise<{ revoked: boolean }> {
  return api.delete(`${P}/${id}/hook-token`);
}

export interface TestEndpointsResponse {
  job?: { id?: number; status?: string };
  operations?: { method: string; path: string }[];
  /** Set when the request was parked for an authorizer instead of running. */
  pending?: boolean;
}

export function testEndpoints(
  id: number,
  operations: { method: string; path: string }[],
  allowWrites: boolean,
): Promise<TestEndpointsResponse> {
  return api.post<TestEndpointsResponse>(`${P}/${id}/test`, { operations, allow_writes: allowWrites });
}
