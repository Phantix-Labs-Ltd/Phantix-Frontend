// Assurance: the GRC firm-audit platform on Core. Contract:
// Phantix Backend docs/08-frontend/05-grc-assurance-frontend-handoff.md and
// app/engines/compliance_engine/schemas/audit.py. Everything goes through the
// Core-allowed `/compliance/audits/*` mount — never the Defend-only
// `/compliance/*` routes (the app-boundary audit fails otherwise).
import { api, ApiError, delay, isDemoMode } from "./api";

// ── Types ────────────────────────────────────────────────────────────────────

export type AuditType = "readiness" | "internal" | "external" | "certification" | "regulatory" | "continuous" | "vendor";
export type EngagementStatus = "planned" | "scoping" | "fieldwork" | "testing" | "reporting" | "completed" | "archived";
export type Opinion = "ready" | "ready_with_exceptions" | "not_ready" | "inconclusive";
export type TestResult = "effective" | "partially_effective" | "ineffective" | "not_tested" | "na";
export type ScopeItemType = "system" | "process" | "vendor" | "location" | "data_flow" | "control_area";
export type TeamRole = "lead" | "auditor" | "reviewer" | "auditee" | "observer";
export type EvidenceRequestStatus = "open" | "submitted" | "accepted" | "rejected" | "waived";
export type FindingSeverity = "critical" | "high" | "medium" | "low";
export type FindingSignificance = "deficiency" | "significant_deficiency" | "material_weakness";
export type FindingStatus = "open" | "in_remediation" | "retest" | "closed" | "accepted_risk";
export type SignOff = "draft" | "prepared" | "reviewed" | "signed_off";
export type ReportType = "readiness" | "internal" | "opinion" | "attestation" | "regulator";
export type MonitoringStatus = "effective" | "drift" | "unknown";

export interface AuditProgram {
  program_key: string;
  name: string;
  audit_type: AuditType;
  description: string | null;
  framework_ids: string[];
  sector: string | null;
  /** From `?applicable=true`: how well the programme fits this organization. */
  match?: "country" | "region" | "global" | string;
  score?: number;
  reasons?: string[];
}

export interface Engagement {
  id: number;
  program_key: string | null;
  program_name: string | null;
  title: string;
  audit_type: AuditType;
  status: EngagementStatus;
  criteria: string[];
  period_start: string | null;
  period_end: string | null;
  lead_auditor_name: string | null;
  auditor_org: "internal" | "third_party" | "staff" | string | null;
  scope_summary: string | null;
  opinion: Opinion | null;
  readiness_score: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface EngagementSummary extends Engagement {
  controls_total: number;
  scope_items: number;
  scope_items_in: number;
  team_size: number;
  next_statuses: EngagementStatus[];
}

export interface ScopeItem {
  id: number;
  item_type: ScopeItemType;
  ref: string | null;
  description: string | null;
  in_scope: boolean;
  rationale: string | null;
}
export type ScopeItemInput = Omit<ScopeItem, "id">;

export interface TeamMember {
  id: number;
  principal_type: "org_user" | "staff";
  principal_id: number;
  principal_name: string | null;
  principal_email: string | null;
  role: TeamRole;
}
export type TeamMemberInput = Omit<TeamMember, "id">;

export interface EvidenceRequest {
  id: number;
  framework_id: string;
  control_id: string;
  request: string;
  instructions: string | null;
  owner_name: string | null;
  due_at: string | null;
  status: EvidenceRequestStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  evidence_ids: (number | string)[];
}

export interface ControlTest {
  id: number;
  framework_id: string;
  control_id: string;
  test_type: "design" | "operating";
  procedure: string | null;
  sample_size: number | null;
  sample_ref: string | null;
  result: TestResult;
  exception_notes: string | null;
  evidence_ids: number[];
  tested_by: string | null;
  tested_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}
export type ControlTestInput = Pick<ControlTest, "framework_id" | "control_id" | "test_type" | "procedure" | "sample_size" | "sample_ref" | "result" | "exception_notes"> & { evidence_ids: number[] };

export interface AuditFinding {
  id: number;
  title: string;
  framework_id: string | null;
  control_id: string | null;
  test_id: number | null;
  condition: string | null;
  criteria: string | null;
  cause: string | null;
  effect: string | null;
  severity: FindingSeverity;
  significance: FindingSignificance | null;
  recommendation: string | null;
  management_response: string | null;
  owner_name: string | null;
  due_at: string | null;
  status: FindingStatus;
  retest_test_id: number | null;
  closed_at: string | null;
  created_at: string | null;
}
export type FindingInput = Pick<AuditFinding, "title" | "framework_id" | "control_id" | "condition" | "criteria" | "cause" | "effect" | "severity" | "significance" | "recommendation"> & { test_id?: number | null };

export interface Readiness {
  engagement_id: number;
  plan: string;
  controls_total: number;
  tested: number;
  effective: number;
  partially_effective: number;
  ineffective: number;
  not_tested: number;
  readiness_score: number | null;
  opinion: Opinion | null;
  by_framework: Record<string, { controls?: number; score?: number | null }>;
}

export interface Workpaper {
  id: number;
  section: string;
  title: string;
  body: string | null;
  prepared_by: string | null;
  prepared_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  sign_off_status: SignOff;
  updated_at: string | null;
}

export interface AuditReport {
  id: number;
  engagement_id: number;
  engagement_title?: string;
  report_type: ReportType | string;
  version: number;
  readiness_score: number | null;
  opinion: Opinion | null;
  executive_summary: string | null;
  artifact_refs?: { cross_audit?: Record<string, unknown> | null; [k: string]: unknown } | null;
  published_by: string | null;
  published_at: string | null;
  created_at: string | null;
}

export interface ControlMonitoring {
  id: number;
  framework_id: string;
  control_id: string;
  source: string;
  status: MonitoringStatus;
  last_checked_at: string | null;
  detail: Record<string, unknown> | null;
}

export interface MonitoringSummary { total: number; effective: number; drift: number; unknown: number }

export interface ControlAtRisk {
  framework_id: string;
  control_id: string;
  sources: string[];
  source_count: number;
  audit_findings: number;
  peer_findings: number;
  correlated: boolean;
}

export interface Intelligence {
  engagement_count: number;
  engagements: {
    id: number; title: string; audit_type: AuditType; status: EngagementStatus; program_key: string | null;
    opinion: Opinion | null; readiness_score: number | null; framework_ids: string[];
    findings_total: number; findings_open: number;
  }[];
  overall_opinion: Opinion | null;
  findings: { total: number; by_severity: Partial<Record<FindingSeverity, number>>; by_status: Record<string, number>; by_framework: Record<string, unknown> };
  peer_findings: { total: number; mapped_controls: number };
  correlated_controls: number;
  controls_at_risk: ControlAtRisk[];
  framework_coverage: Record<string, { controls: number; tested_engagements: number; avg_readiness: number | null }>;
  note?: string | null;
}

export interface Regimes {
  detected_country: string | null;
  detected_region: string | null;
  source: "override" | "profile" | "browser_locale" | "none";
  frameworks: { framework_id: string; name: string; description: string | null; match: "country" | "region" | "global" | string }[];
}

// ── Labels and rules ─────────────────────────────────────────────────────────

export const AUDIT_TYPE_LABEL: Record<AuditType, string> = {
  readiness: "Readiness",
  internal: "Internal audit",
  external: "Independent audit",
  certification: "Certification",
  regulatory: "Regulatory audit",
  continuous: "Continuous audit",
  vendor: "Vendor audit",
};
export const AUDIT_TYPE_ORDER: AuditType[] = ["regulatory", "certification", "external", "internal", "readiness", "vendor", "continuous"];

export const ENGAGEMENT_STAGES: EngagementStatus[] = ["planned", "scoping", "fieldwork", "testing", "reporting", "completed", "archived"];
export const STATUS_LABEL: Record<EngagementStatus, string> = {
  planned: "Planned", scoping: "Scoping", fieldwork: "Fieldwork", testing: "Testing",
  reporting: "Reporting", completed: "Completed", archived: "Archived",
};

export const OPINION_LABEL: Record<Opinion, string> = {
  ready: "Ready", ready_with_exceptions: "Ready with exceptions", not_ready: "Not ready", inconclusive: "Inconclusive",
};
export const OPINION_RULE: Record<Opinion, string> = {
  ready: "90% or more, with no ineffective critical or high controls.",
  ready_with_exceptions: "70% or more, with significant deficiencies documented.",
  not_ready: "Below 70%, or a critical control is ineffective.",
  inconclusive: "Not enough tested, or the scope was limited.",
};

export const RESULT_LABEL: Record<TestResult, string> = {
  effective: "Effective", partially_effective: "Partly effective", ineffective: "Ineffective", not_tested: "Not tested", na: "Not applicable",
};
export const SCOPE_TYPE_LABEL: Record<ScopeItemType, string> = {
  system: "System", process: "Process", vendor: "Vendor", location: "Location", data_flow: "Data flow", control_area: "Control area",
};
export const ROLE_LABEL: Record<TeamRole, string> = { lead: "Lead auditor", auditor: "Auditor", reviewer: "Reviewer", auditee: "Auditee", observer: "Observer" };
export const SIGNIFICANCE_LABEL: Record<FindingSignificance, string> = {
  deficiency: "Deficiency", significant_deficiency: "Significant deficiency", material_weakness: "Material weakness",
};
export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Open", in_remediation: "In remediation", retest: "Awaiting retest", closed: "Closed", accepted_risk: "Risk accepted",
};
export const REQUEST_STATUS_LABEL: Record<EvidenceRequestStatus, string> = {
  open: "Open", submitted: "Submitted", accepted: "Accepted", rejected: "Sent back", waived: "Waived",
};
export const SIGN_OFF_LABEL: Record<SignOff, string> = { draft: "Draft", prepared: "Prepared", reviewed: "Reviewed", signed_off: "Signed off" };
export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  readiness: "Readiness report", internal: "Internal audit report", opinion: "Audit opinion", attestation: "Attestation", regulator: "Regulator report",
};
export const SOURCE_LABEL: Record<string, string> = {
  compliance_audit: "Audit", risk_engine: "Risk", vapt_engine: "VAPT", scanner_engine: "Scan", connector: "Connector", soc_engine: "SOC",
};

// ── API ─────────────────────────────────────────────────────────────────────

const B = "/compliance/audits";
const E = (id: number) => `${B}/engagements/${id}`;
const list = <T,>(res: unknown): T[] =>
  Array.isArray(res) ? (res as T[]) : Array.isArray((res as { items?: T[] })?.items) ? (res as { items: T[] }).items : [];

export async function loadIntelligence(engagementId?: number): Promise<Intelligence> {
  if (isDemoMode()) { await delay(260); return demoIntelligence; }
  return api.get<Intelligence>(`${B}/intelligence${engagementId ? `?engagement_id=${engagementId}` : ""}`);
}

export async function loadPrograms(applicable = false): Promise<AuditProgram[]> {
  if (isDemoMode()) { await delay(240); return applicable ? demoPrograms.filter((p) => (p.score ?? 0) > 0) : demoPrograms; }
  return list<AuditProgram>(await api.get(`${B}/programs${applicable ? "?applicable=true" : ""}`));
}

export async function loadEngagements(): Promise<Engagement[]> {
  if (isDemoMode()) { await delay(220); return demoEngagements; }
  return list<Engagement>(await api.get(`${B}/engagements?limit=200`));
}

export async function loadEngagement(id: number): Promise<EngagementSummary> {
  if (isDemoMode()) { await delay(220); return { ...demoSummary, ...(demoEngagements.find((e) => e.id === id) ?? {}) }; }
  return api.get<EngagementSummary>(E(id));
}

export async function createEngagement(body: {
  program_key: string; title: string; audit_type: AuditType; criteria: string[];
  period_start: string | null; period_end: string | null; lead_auditor_name: string | null;
  auditor_org: string | null; scope_summary: string | null; scope_items: ScopeItemInput[]; team: TeamMemberInput[];
}): Promise<EngagementSummary> {
  if (isDemoMode()) {
    await delay(400);
    const { scope_items, team, ...fields } = body;
    return {
      ...demoSummary, ...fields, id: 77, status: "planned", opinion: null, readiness_score: null,
      program_name: demoPrograms.find((p) => p.program_key === body.program_key)?.name ?? null,
      scope_items: scope_items.length, scope_items_in: scope_items.filter((x) => x.in_scope).length, team_size: team.length,
      next_statuses: ["scoping"],
    };
  }
  return api.post<EngagementSummary>(`${B}/engagements`, body);
}

export async function updateEngagement(id: number, patch: Partial<Pick<Engagement, "title" | "status" | "period_start" | "period_end" | "lead_auditor_name" | "auditor_org" | "scope_summary">>) {
  if (isDemoMode()) { await delay(300); return { ...demoSummary, ...patch } as EngagementSummary; }
  return api.patch<EngagementSummary>(E(id), patch);
}

export const loadScope = async (id: number) => (isDemoMode() ? (await delay(150), demoScope) : list<ScopeItem>(await api.get(`${E(id)}/scope`)));
export const addScopeItem = async (id: number, item: ScopeItemInput) => (isDemoMode() ? (await delay(200), { ...item, id: Date.now() }) : api.post<ScopeItem>(`${E(id)}/scope`, item));
export const updateScopeItem = async (id: number, itemId: number, patch: Partial<ScopeItemInput>) => (isDemoMode() ? (await delay(200), { ...demoScope[0], ...patch, id: itemId }) : api.patch<ScopeItem>(`${E(id)}/scope/${itemId}`, patch));
export const removeScopeItem = async (id: number, itemId: number) => { if (isDemoMode()) { await delay(150); return; } await api.delete(`${E(id)}/scope/${itemId}`); };

export const loadTeam = async (id: number) => (isDemoMode() ? (await delay(150), demoTeam) : list<TeamMember>(await api.get(`${E(id)}/team`)));
export const addTeamMember = async (id: number, m: TeamMemberInput) => (isDemoMode() ? (await delay(200), { ...m, id: Date.now() }) : api.post<TeamMember>(`${E(id)}/team`, m));
export const removeTeamMember = async (id: number, memberId: number) => { if (isDemoMode()) { await delay(150); return; } await api.delete(`${E(id)}/team/${memberId}`); };

export const loadEvidenceRequests = async (id: number) => (isDemoMode() ? (await delay(180), demoRequests) : list<EvidenceRequest>(await api.get(`${E(id)}/evidence-requests`)));
export const generateEvidenceRequests = async (id: number) => (isDemoMode() ? (await delay(500), { created: 0, skipped: demoRequests.length }) : api.post<{ created: number; skipped: number }>(`${E(id)}/evidence-requests/generate`, {}));
export const updateEvidenceRequest = async (id: number, rid: number, patch: { status?: EvidenceRequestStatus; evidence_ids?: number[]; review_notes?: string | null; owner_name?: string | null; due_at?: string | null }) =>
  (isDemoMode() ? (await delay(300), { ...demoRequests.find((r) => r.id === rid)!, ...patch } as EvidenceRequest) : api.patch<EvidenceRequest>(`${E(id)}/evidence-requests/${rid}`, patch));

export const loadTests = async (id: number) => (isDemoMode() ? (await delay(180), demoTests) : list<ControlTest>(await api.get(`${E(id)}/tests`)));
export const recordTest = async (id: number, t: ControlTestInput) => (isDemoMode() ? (await delay(300), { ...demoTests[0], ...t, id: Date.now() }) : api.post<ControlTest>(`${E(id)}/tests`, t));
export const updateTest = async (id: number, tid: number, patch: Partial<ControlTestInput> & { reviewed_by?: string }) =>
  (isDemoMode() ? (await delay(300), { ...demoTests[0], ...patch, id: tid }) : api.patch<ControlTest>(`${E(id)}/tests/${tid}`, patch));

export const loadFindings = async (id: number) => (isDemoMode() ? (await delay(180), demoFindings) : list<AuditFinding>(await api.get(`${E(id)}/findings`)));
export const raiseFinding = async (id: number, f: FindingInput) => (isDemoMode() ? (await delay(300), { ...demoFindings[0], ...f, id: Date.now(), status: "open" as const }) : api.post<AuditFinding>(`${E(id)}/findings`, f));
export const updateFinding = async (id: number, fid: number, patch: Partial<Pick<AuditFinding, "management_response" | "owner_name" | "due_at" | "status">>) =>
  (isDemoMode() ? (await delay(300), { ...demoFindings.find((f) => f.id === fid)!, ...patch }) : api.patch<AuditFinding>(`${E(id)}/findings/${fid}`, patch));
export const retestFinding = async (id: number, fid: number, body: { test_type: "design" | "operating"; procedure: string | null; sample_size: number | null; result: TestResult; exception_notes: string | null; close: boolean }) =>
  (isDemoMode() ? (await delay(400), { ...demoFindings.find((f) => f.id === fid)!, status: body.result === "effective" && body.close ? "closed" as const : "retest" as const }) : api.post<AuditFinding>(`${E(id)}/findings/${fid}/retest`, { ...body, evidence_ids: [] }));

export const loadReadiness = async (id: number) => (isDemoMode() ? (await delay(200), demoReadiness) : api.get<Readiness>(`${E(id)}/readiness`));

export const loadWorkpapers = async (id: number) => (isDemoMode() ? (await delay(180), demoWorkpapers) : list<Workpaper>(await api.get(`${E(id)}/workpapers`)));
export const createWorkpaper = async (id: number, w: { section: string; title: string; body: string | null }) =>
  (isDemoMode() ? (await delay(300), { ...demoWorkpapers[0], ...w, id: Date.now(), sign_off_status: "draft" as const }) : api.post<Workpaper>(`${E(id)}/workpapers`, w));
export const updateWorkpaper = async (id: number, wid: number, patch: { section?: string; title?: string; body?: string | null; sign_off_status?: SignOff }) =>
  (isDemoMode() ? (await delay(300), { ...demoWorkpapers.find((w) => w.id === wid)!, ...patch }) : api.patch<Workpaper>(`${E(id)}/workpapers/${wid}`, patch));

export const loadReports = async (id: number) => (isDemoMode() ? (await delay(180), demoReports.filter((r) => r.engagement_id === id)) : list<AuditReport>(await api.get(`${E(id)}/reports`)));
export const generateReport = async (id: number, report_type: ReportType, publish = true) =>
  (isDemoMode() ? (await delay(700), { ...demoReports[0], id: Date.now(), engagement_id: id, report_type, version: 1 }) : api.post<AuditReport>(`${E(id)}/reports`, { report_type, publish }));

/** Published reports across every engagement: one aggregate call, or one per engagement on an older backend. */
export async function loadAllReports(): Promise<AuditReport[]> {
  if (isDemoMode()) { await delay(260); return demoReports; }
  try {
    return list<AuditReport>(await api.get(`${B}/reports?limit=200`));
  } catch (err) {
    if (!(err instanceof ApiError && (err.status === 404 || err.status === 405))) throw err;
  }
  const engagements = await loadEngagements();
  const per = await Promise.all(
    engagements.map((e) => loadReports(e.id).then((rs) => rs.map((r) => ({ ...r, engagement_title: e.title }))).catch(() => [] as AuditReport[])),
  );
  return per.flat().sort((a, b) => String(b.published_at ?? b.created_at).localeCompare(String(a.published_at ?? a.created_at)));
}

export const loadMonitoring = async () => (isDemoMode() ? (await delay(200), demoMonitoring) : list<ControlMonitoring>(await api.get(`${B}/monitoring`)));
export const loadMonitoringSummary = async () => (isDemoMode() ? (await delay(150), { total: 3, effective: 1, drift: 1, unknown: 1 }) : api.get<MonitoringSummary>(`${B}/monitoring/summary`));
export const upsertMonitoring = async (row: { framework_id: string; control_id: string; source: string; status: MonitoringStatus; detail?: Record<string, unknown> | null }) =>
  (isDemoMode() ? (await delay(300), { ...row, id: Date.now(), last_checked_at: new Date().toISOString(), detail: row.detail ?? null }) : api.post<ControlMonitoring>(`${B}/monitoring`, row));
export const openDriftFindings = async (engagementId?: number) =>
  (isDemoMode() ? (await delay(500), { created: 1, skipped: 0 }) : api.post<{ created: number; skipped: number }>(`${B}/monitoring/drift-findings${engagementId ? `?engagement_id=${engagementId}` : ""}`, {}));

export async function loadRegimes(country?: string): Promise<Regimes> {
  if (isDemoMode()) { await delay(220); return { ...demoRegimes, ...(country ? { detected_country: country, source: "override" as const } : {}) }; }
  return api.get<Regimes>(`${B}/regimes${country ? `?country=${encodeURIComponent(country)}` : ""}`);
}

export interface AssuranceProfile { country: string | null; industry?: string | null; [k: string]: unknown }
export const loadProfile = async () => (isDemoMode() ? (await delay(150), { country: "Nigeria", industry: "fintech" }) : api.get<AssuranceProfile | null>(`${B}/profile`));
export const saveProfile = async (patch: Partial<AssuranceProfile>) => (isDemoMode() ? (await delay(250), { country: null, ...patch }) : api.put<AssuranceProfile>(`${B}/profile`, patch));

// ── Demo tenant ──────────────────────────────────────────────────────────────

const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString();
const dateOnly = (n: number) => day(n).slice(0, 10);

const demoPrograms: AuditProgram[] = [
  { program_key: "ndpa_gaid_audit", name: "NDPA 2023 + GAID 2025 audit", audit_type: "regulatory", description: "Lawful basis, RoPA, DPIA, DPO, consent, data subject requests, 72-hour breach notice and the annual Compliance Audit Return.", framework_ids: ["ndpa_2023", "ndpc_gaid_2025", "ndpc_dpco"], sector: null, match: "country", score: 90, reasons: ["You operate in Nigeria", "You process personal data"] },
  { program_key: "cbn_cyber_ofi", name: "CBN cybersecurity audit (OFIs)", audit_type: "regulatory", description: "Governance, protection, detection, response, recovery, third parties and reporting.", framework_ids: ["cbn_cybersecurity_2022"], sector: "financial_services", match: "country", score: 75, reasons: ["Nigerian financial institution"] },
  { program_key: "iso27001_isms", name: "ISO/IEC 27001:2022 ISMS audit", audit_type: "certification", description: "Clauses 4–10 and Annex A, internal audit and management review.", framework_ids: ["iso27001"], sector: null, match: "global", score: 40, reasons: ["Global standard"] },
  { program_key: "sme_30_day", name: "SME / startup 30-day readiness", audit_type: "readiness", description: "A fast baseline across data protection, governance and configuration.", framework_ids: ["ndpa_2023", "nist_csf_2", "cis_benchmarks"], sector: null, match: "country", score: 60, reasons: ["Small team"] },
];

const demoEngagements: Engagement[] = [
  { id: 41, program_key: "ndpa_gaid_audit", program_name: "NDPA 2023 + GAID 2025 audit", title: "NDPA readiness 2026", audit_type: "readiness", status: "testing", criteria: ["ndpa_2023", "ndpc_gaid_2025"], period_start: dateOnly(-60), period_end: dateOnly(30), lead_auditor_name: "Ifeoma Ade", auditor_org: "staff", scope_summary: "Customer onboarding, payments platform, data warehouse and two processors.", opinion: "ready_with_exceptions", readiness_score: 74, started_at: day(-58), completed_at: null, created_at: day(-62) },
  { id: 37, program_key: "iso27001_isms", program_name: "ISO/IEC 27001:2022 ISMS audit", title: "ISO 27001 internal audit H1", audit_type: "internal", status: "completed", criteria: ["iso27001"], period_start: dateOnly(-200), period_end: dateOnly(-110), lead_auditor_name: "Chidi Eze", auditor_org: "internal", scope_summary: null, opinion: "ready_with_exceptions", readiness_score: 82, started_at: day(-200), completed_at: day(-108), created_at: day(-205) },
];

const demoSummary: EngagementSummary = { ...demoEngagements[0], controls_total: 40, scope_items: 4, scope_items_in: 3, team_size: 3, next_statuses: ["reporting", "fieldwork"] };

const demoScope: ScopeItem[] = [
  { id: 1, item_type: "system", ref: "api.acme.ng", description: "Customer API and onboarding", in_scope: true, rationale: "Holds customer personal data" },
  { id: 2, item_type: "process", ref: null, description: "Data subject request handling", in_scope: true, rationale: "NDPA s.30" },
  { id: 3, item_type: "vendor", ref: "Paystack", description: "Payment processor", in_scope: true, rationale: "Processes card data on our behalf" },
  { id: 4, item_type: "system", ref: "legacy-crm", description: "Legacy CRM (retired)", in_scope: false, rationale: "Decommissioned in Q2" },
];

const demoTeam: TeamMember[] = [
  { id: 1, principal_type: "staff", principal_id: 9, principal_name: "Ifeoma Ade", principal_email: "ifeoma@phantixlabs.com", role: "lead" },
  { id: 2, principal_type: "staff", principal_id: 11, principal_name: "Tunde Bello", principal_email: "tunde@phantixlabs.com", role: "reviewer" },
  { id: 3, principal_type: "org_user", principal_id: 1, principal_name: "Ada Okonkwo", principal_email: "ada@acme.ng", role: "auditee" },
];

const demoRequests: EvidenceRequest[] = [
  { id: 101, framework_id: "ndpa_2023", control_id: "NDPA-42", request: "Record of processing activities (RoPA)", instructions: "Export the current RoPA, including processors and retention periods.", owner_name: "Ada Okonkwo", due_at: day(4), status: "open", submitted_at: null, reviewed_by: null, review_notes: null, evidence_ids: [] },
  { id: 102, framework_id: "ndpa_2023", control_id: "NDPA-39", request: "Breach response plan and the last tabletop exercise", instructions: "Show how a breach reaches the NDPC within 72 hours.", owner_name: "Ada Okonkwo", due_at: day(-2), status: "rejected", submitted_at: day(-5), reviewed_by: "Ifeoma Ade", review_notes: "The plan doesn't name who notifies the NDPC. Add the owner and resubmit.", evidence_ids: [12] },
  { id: 103, framework_id: "ndpc_gaid_2025", control_id: "GAID-DPO", request: "DPO appointment letter", instructions: null, owner_name: null, due_at: day(-10), status: "accepted", submitted_at: day(-12), reviewed_by: "Ifeoma Ade", review_notes: null, evidence_ids: [8] },
  { id: 104, framework_id: "ndpa_2023", control_id: "NDPA-26", request: "Consent records for marketing", instructions: null, owner_name: "Marketing", due_at: day(7), status: "submitted", submitted_at: day(-1), reviewed_by: null, review_notes: null, evidence_ids: [15, 16] },
];

const demoTests: ControlTest[] = [
  { id: 201, framework_id: "ndpa_2023", control_id: "NDPA-34", test_type: "operating", procedure: "Sampled 25 access reviews from the period.", sample_size: 25, sample_ref: "AR-2026-Q2", result: "effective", exception_notes: null, evidence_ids: [8], tested_by: "Ifeoma Ade", tested_at: day(-9), reviewed_by: "Tunde Bello", reviewed_at: day(-8) },
  { id: 202, framework_id: "ndpa_2023", control_id: "NDPA-41", test_type: "design", procedure: "Inspected DPIA register against high-risk processing list.", sample_size: null, sample_ref: null, result: "ineffective", exception_notes: "No DPIA for the credit-scoring model.", evidence_ids: [], tested_by: "Ifeoma Ade", tested_at: day(-6), reviewed_by: null, reviewed_at: null },
];

const demoFindings: AuditFinding[] = [
  { id: 501, title: "No DPIA for the credit-scoring model", framework_id: "ndpa_2023", control_id: "NDPA-41", test_id: 202, condition: "The credit-scoring model processes financial and behavioural data without a documented DPIA.", criteria: "NDPA 2023 s.41 requires a DPIA for high-risk processing.", cause: "The model launched before the DPIA procedure was adopted.", effect: "High-risk processing without assessed safeguards.", severity: "high", significance: "significant_deficiency", recommendation: "Complete and approve a DPIA; add DPIA to the model release checklist.", management_response: null, owner_name: null, due_at: null, status: "open", retest_test_id: null, closed_at: null, created_at: day(-6) },
  { id: 502, title: "Compliance Audit Return not yet filed", framework_id: "ndpc_gaid_2025", control_id: "GAID-CAR", test_id: null, condition: "No CAR for the current year has been filed through a licensed DPCO.", criteria: "GAID 2025 requires an annual Compliance Audit Return.", cause: null, effect: "Late filing exposes the organization to sanctions.", severity: "medium", significance: "deficiency", recommendation: "Engage a DPCO and file before the deadline.", management_response: "DPCO engaged; filing scheduled.", owner_name: "Ada Okonkwo", due_at: day(21), status: "in_remediation", retest_test_id: null, closed_at: null, created_at: day(-5) },
];

const demoReadiness: Readiness = {
  engagement_id: 41, plan: "readiness", controls_total: 40, tested: 30, effective: 21, partially_effective: 6, ineffective: 3, not_tested: 8,
  readiness_score: 74, opinion: "ready_with_exceptions",
  by_framework: { ndpa_2023: { controls: 28, score: 78 }, ndpc_gaid_2025: { controls: 12, score: 66 } },
};

const demoWorkpapers: Workpaper[] = [
  { id: 301, section: "planning", title: "Audit plan and risk assessment", body: "## Objective\nAssess NDPA 2023 and GAID 2025 readiness.\n\n## Approach\nInquiry, inspection and sampling of operating evidence.", prepared_by: "Ifeoma Ade", prepared_at: day(-55), reviewed_by: "Tunde Bello", reviewed_at: day(-54), sign_off_status: "signed_off", updated_at: day(-54) },
  { id: 302, section: "testing", title: "Access control testing", body: "Sampled 25 quarterly access reviews. No exceptions.", prepared_by: "Ifeoma Ade", prepared_at: day(-9), reviewed_by: null, reviewed_at: null, sign_off_status: "prepared", updated_at: day(-9) },
];

const demoReports: AuditReport[] = [
  { id: 801, engagement_id: 37, engagement_title: "ISO 27001 internal audit H1", report_type: "internal", version: 2, readiness_score: 82, opinion: "ready_with_exceptions", executive_summary: "Controls are largely effective. Access reviews and supplier assessments need work before certification.", artifact_refs: { cross_audit: { correlated_controls: 2, other_engagements: 1 } }, published_by: "Chidi Eze", published_at: day(-108), created_at: day(-108) },
];

const demoMonitoring: ControlMonitoring[] = [
  { id: 1, framework_id: "iso27001", control_id: "A.8.8", source: "wazuh", status: "drift", last_checked_at: day(-0.1), detail: { note: "Critical patches older than 30 days on 3 hosts" } },
  { id: 2, framework_id: "ndpa_2023", control_id: "NDPA-34", source: "aws", status: "effective", last_checked_at: day(-0.2), detail: null },
  { id: 3, framework_id: "cbn_cybersecurity_2022", control_id: "CBN-DET-2", source: "manual", status: "unknown", last_checked_at: null, detail: null },
];

const demoIntelligence: Intelligence = {
  engagement_count: 2,
  engagements: demoEngagements.map((e) => ({ id: e.id, title: e.title, audit_type: e.audit_type, status: e.status, program_key: e.program_key, opinion: e.opinion, readiness_score: e.readiness_score, framework_ids: e.criteria, findings_total: e.id === 41 ? 2 : 3, findings_open: e.id === 41 ? 2 : 1 })),
  overall_opinion: "ready_with_exceptions",
  findings: { total: 5, by_severity: { critical: 0, high: 2, medium: 2, low: 1 }, by_status: { open: 2, in_remediation: 1, closed: 2 }, by_framework: {} },
  peer_findings: { total: 14, mapped_controls: 6 },
  correlated_controls: 2,
  controls_at_risk: [
    { framework_id: "ndpa_2023", control_id: "NDPA-41", sources: ["compliance_audit", "risk_engine"], source_count: 2, audit_findings: 1, peer_findings: 2, correlated: true },
    { framework_id: "iso27001", control_id: "A.8.8", sources: ["compliance_audit", "vapt_engine"], source_count: 2, audit_findings: 1, peer_findings: 4, correlated: true },
    { framework_id: "ndpc_gaid_2025", control_id: "GAID-CAR", sources: ["compliance_audit"], source_count: 1, audit_findings: 1, peer_findings: 0, correlated: false },
  ],
  framework_coverage: { ndpa_2023: { controls: 28, tested_engagements: 1, avg_readiness: 78 } },
  note: null,
};

const demoRegimes: Regimes = {
  detected_country: "Nigeria", detected_region: "West Africa", source: "profile",
  frameworks: [
    { framework_id: "ndpa_2023", name: "Nigeria Data Protection Act 2023", description: "Principal Nigerian data protection statute.", match: "country" },
    { framework_id: "cbn_cybersecurity_2022", name: "CBN Risk-Based Cybersecurity Framework", description: "For Nigerian financial institutions.", match: "country" },
    { framework_id: "au_malabo", name: "AU Malabo Convention", description: "Continental cybersecurity and data protection.", match: "region" },
    { framework_id: "iso27001", name: "ISO/IEC 27001:2022", description: "Information security management systems.", match: "global" },
    { framework_id: "nist_csf_2", name: "NIST CSF 2.0", description: "Cybersecurity Framework.", match: "global" },
  ],
};

// ── Permissions, evidence capture, finding lookup ───────────────────────────

export interface AssuranceMe { role: string; can_read: boolean; can_audit: boolean; can_manage: boolean; email?: string | null }

/** What the caller may do; everyone allowed on a backend without `_meta/me` (the server still enforces). */
export async function loadMe(): Promise<AssuranceMe> {
  if (isDemoMode()) return { role: "org_admin", can_read: true, can_audit: true, can_manage: true };
  try {
    return await api.get<AssuranceMe>(`${B}/_meta/me`);
  } catch {
    return { role: "unknown", can_read: true, can_audit: true, can_manage: true };
  }
}

export type EvidenceType = "document" | "policy" | "procedure" | "screenshot" | "log" | "config" | "ticket" | "other";
export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  document: "Document", policy: "Policy", procedure: "Procedure", screenshot: "Screenshot", log: "Log export",
  config: "Configuration", ticket: "Ticket or record", other: "Other",
};

/** Record evidence for a request (stored as a reference in the org's security DB) and submit it. */
export async function registerEvidence(id: number, rid: number, body: { title: string; evidence_type: EvidenceType; source_ref: string | null; description: string | null; submit?: boolean }) {
  if (isDemoMode()) {
    await delay(400);
    const r = demoRequests.find((x) => x.id === rid)!;
    return { ...r, status: "submitted" as const, evidence_ids: [...r.evidence_ids, 90 + r.evidence_ids.length] };
  }
  return api.post<EvidenceRequest>(`${E(id)}/evidence-requests/${rid}/evidence`, { submit: true, ...body });
}

export interface EvidenceRef { id: number; title: string | null; evidence_type: string | null; source_ref: string | null; status: string | null }

export async function loadEvidence(ids: (number | string)[]): Promise<EvidenceRef[]> {
  const clean = Array.from(new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)));
  if (!clean.length) return [];
  if (isDemoMode()) return clean.map((n) => ({ id: n, title: `Evidence #${n}`, evidence_type: "document", source_ref: null, status: "submitted" }));
  try {
    return list<EvidenceRef>(await api.get(`${B}/evidence?ids=${clean.join(",")}`));
  } catch {
    return [];
  }
}

/** Resolve an audit finding id (tracker rows carry `AUDIT-<id>`) to its engagement. */
export async function getFinding(findingId: number): Promise<AuditFinding & { engagement_id: number }> {
  if (isDemoMode()) return { ...demoFindings[0], engagement_id: 41 };
  return api.get<AuditFinding & { engagement_id: number }>(`${B}/findings/${findingId}`);
}
