/**
 * The "firsts" each application walks a new user through, in order.
 *
 * Every step is ticked from data the application already reads (assets,
 * campaigns, reports, questionnaire progress, code scans…), so there is no
 * separate progress store: doing the thing is what ticks it. A check that
 * fails (older backend, a section not on the plan) counts as not done; the
 * list can always be hidden.
 */
import { api } from "./api";
import type { ApplicationKey } from "./applications";
import { loadAgentFleet, loadCloudConnections, loadTrackerBundle } from "./data";
import { listSchedules } from "./vaptOps";
import { loadEngagements } from "./assurance";
import { loadConnectors, loadProfile, loadProgress } from "./complianceGrc";
import { loadCodeFindings, loadCodeScans, loadGithubInstallation } from "./codeOps";
import { listThreatModels } from "./productContext";
import { listConnections as listCiCdConnections } from "./cicdOps";

export interface AppFirst {
  key: string;
  label: string;
  /** A page in this application, or on the Platform when `platform` is set. */
  path: string;
  platform?: boolean;
  optional?: boolean;
  done: boolean;
}

type StepDef = Omit<AppFirst, "done"> & { check: (ctx: Ctx) => Promise<boolean> };

/** Reads several steps share, fetched at most once per load. */
interface Ctx { tracker: () => Promise<{ verification_status?: string; status?: string; retest_status?: string | null }[]> }

function items<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  const list = (raw as { items?: unknown } | null)?.items;
  return Array.isArray(list) ? (list as T[]) : [];
}

const anyAt = async (path: string) => items(await api.get<unknown>(path)).length > 0;

const FIRSTS: Record<ApplicationKey, StepDef[]> = {
  core: [
    { key: "first_asset", label: "Add your first asset", path: "/assets", check: () => anyAt("/assets?limit=1") },
    {
      key: "first_finding_verified",
      label: "Review and verify your first finding",
      path: "/tracker",
      check: async (ctx) => (await ctx.tracker()).some((t) => t.verification_status === "manually_verified" || (t.status && t.status !== "open")),
    },
    { key: "first_report", label: "Generate your first report", path: "/reports", check: () => anyAt("/reports?limit=1") },
    {
      key: "teammate_invited",
      label: "Invite a teammate",
      path: "/users",
      platform: true,
      check: async () => {
        const res = await api.get<{ milestones?: { key: string; done_at: string | null }[] }>("/org-users/onboarding");
        return Boolean(res?.milestones?.find((m) => m.key === "teammate_invited")?.done_at);
      },
    },
    { key: "first_engagement", label: "Start an assurance engagement", path: "/assurance", optional: true, check: async () => (await loadEngagements()).length > 0 },
  ],
  attack: [
    {
      key: "first_vapt",
      label: "Run your first VAPT",
      path: "/vapt",
      check: async () => items<{ status?: string }>(await api.get<unknown>("/vapt/campaigns?limit=50")).some((c) => c.status && c.status !== "draft"),
    },
    {
      key: "first_finding_verified",
      label: "Verify your first finding",
      path: "/tracker",
      check: async (ctx) => (await ctx.tracker()).some((t) => t.verification_status === "manually_verified"),
    },
    {
      key: "first_retest",
      label: "Retest a fixed finding",
      path: "/tracker",
      check: async (ctx) => (await ctx.tracker()).some((t) => Boolean(t.retest_status)),
    },
    { key: "first_schedule", label: "Schedule a recurring VAPT", path: "/vapt/schedules", optional: true, check: async () => items(await listSchedules()).length > 0 },
  ],
  defend: [
    { key: "compliance_profile", label: "Set your compliance profile", path: "/compliance/profile", check: async () => (await loadProfile()) != null },
    {
      key: "questionnaire_complete",
      label: "Complete the questionnaire",
      path: "/compliance/questionnaire",
      check: async () => {
        const p = await loadProgress();
        return Boolean(p && p.total_questions > 0 && p.unanswered === 0);
      },
    },
    { key: "first_compliance", label: "Run your first compliance assessment", path: "/compliance", check: () => anyAt("/compliance/assessments?limit=1") },
    {
      key: "evidence_connected",
      label: "Connect a cloud account or evidence connector",
      path: "/compliance/connectors",
      check: async () => {
        const [connectors, cloud] = await Promise.all([
          loadConnectors().catch(() => null),
          loadCloudConnections().catch(() => []),
        ]);
        return Boolean(connectors?.connectors?.some((c) => c.configured)) || cloud.length > 0;
      },
    },
    { key: "soc_agent", label: "Install a SOC agent", path: "/soc/agents", optional: true, check: async () => ((await loadAgentFleet())?.agents?.length ?? 0) > 0 },
  ],
  code: [
    {
      key: "provider_connected",
      label: "Connect a repository provider",
      path: "/code-review",
      check: async () => {
        const [install, scans] = await Promise.all([
          loadGithubInstallation().catch(() => null),
          loadCodeScans(1).catch(() => null),
        ]);
        // Any scan means a provider was connected, whichever one it was.
        return Boolean(install?.connected) || (scans?.scans?.length ?? 0) > 0;
      },
    },
    { key: "first_code_review", label: "Run your first code review", path: "/code-review/scans", check: async () => ((await loadCodeScans(1))?.scans?.length ?? 0) > 0 },
    {
      key: "first_autofix_pr",
      label: "Fix your first finding with a pull request",
      path: "/code-review",
      check: async () => ((await loadCodeFindings())?.items ?? []).some((f) => Boolean(f.autofix?.pr_url)),
    },
    { key: "first_threat_model", label: "Build your first threat model", path: "/threat-models", check: async () => ((await listThreatModels())?.models?.length ?? 0) > 0 },
    { key: "cicd_connected", label: "Add a CI/CD gate", path: "/cicd", optional: true, check: async () => ((await listCiCdConnections())?.items?.length ?? 0) > 0 },
  ],
};

/** This application's firsts, each ticked from live data. */
export async function loadAppFirsts(app: ApplicationKey): Promise<AppFirst[]> {
  let trackerOnce: ReturnType<Ctx["tracker"]> | null = null;
  const ctx: Ctx = {
    tracker: () => (trackerOnce ??= loadTrackerBundle().then((b) => b.trackerFindings as never).catch(() => [])),
  };
  return Promise.all(
    FIRSTS[app].map(async ({ check, ...step }) => ({
      ...step,
      done: await check(ctx).catch(() => false),
    })),
  );
}
