import { api } from "./api";

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

export async function listApiSpecs(): Promise<ApiSpec[]> {
  return (await api.get<{ items: ApiSpec[] }>(P)).items ?? [];
}

export function getApiSpec(id: number): Promise<ApiSpec> {
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
