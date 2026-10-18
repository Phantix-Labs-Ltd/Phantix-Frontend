import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  GitBranch, GitPullRequest, Wrench, ShieldCheck, RefreshCw, ExternalLink, Loader2, Send, Github, AlertTriangle,
  Gitlab, Plug, PlugZap, Key, Trash2, TestTube, Webhook, CheckCircle2, ChevronDown, ChevronUp, Settings2, Copy,
} from "lucide-react";
import { PageHeader, Card, CardHeader, StatusBadge, EmptyState, Tabs, Modal, CardListSkeleton } from "@sg/ui";
import { API_BASE, api, isPendingApproval, publicErrorMessage, publicDetailCopy } from "@sg/api";
import { sameOriginApiUrl } from "@sg/apiOrigin";
import CodeReview from "@sg/components/CodeReview";
import {
  loadGithubInstallation,
  loadBranchReviewWallet,
  loadBranchReviewSettings,
  loadBranchReviewEvents,
  loadAutofixStatus,
  loadGithubRepositories,
  syncRepositories,
} from "@sg/codeOps";
import {
  loadHubCatalog,
  loadHubInstallations,
  installHubIntegration,
  startHubOAuth,
  uninstallHubIntegration,
  testHubInstallation,
} from "@sg/data";
import type { IntegrationConnector, IntegrationInstallation } from "@sg/types";
import { useStore } from "@sg/store";
import { cx, timeAgo, humanize } from "@sg/utils";
import DocLink from "@sg/components/DocLink";
import { PlatformSetupLink } from "@sg/platformSetup";
import { UpsellBanner } from "@sg/components/UpgradeGate";
import {
  SCM_HUB_PROVIDERS,
  SCM_PROVIDER_SETUP,
  SCM_WEBHOOK_PATH,
  providerTone,
  scmIcon,
  scmInstallable,
  scmTokenUrl,
} from "../scmProviders";

// ── Code — AutoFix, Continuous PR, GitHub repositories & review runs ─────────
// One place for everything code: connected repos, branch-review runs (the PR
// push feed), AutoFix generation and Continuous PR (ephemeral clone → app-signed
// commit → draft PR that a developer merges).

interface Repo {
  id: number;
  name?: string;
  full_name?: string;
  private?: boolean;
  default_branch?: string;
  html_url?: string;
  /** github | gitlab | gitea — the shared repository table is provider-tagged. */
  provider?: string;
  /** Hub installation that imported this row (Gitea/GitLab connections). */
  installation_id?: number;
  repo_id?: number;
  can_analyze?: boolean;
  analyze_blocked_reason?: string | null;
  requires_premium?: boolean;
}

interface ReviewSetting {
  github_repository_id: number;
  enabled?: boolean;
  watched_branch?: string;
  post_github_comment?: boolean;
}

interface ReviewEvent {
  id: number;
  repo?: string;
  repo_url?: string;
  sha: string;
  ref: string;
  size_tier: string;
  status: string;
  amount_ngn?: number;
  created_at?: string | null;
}

function statusTone(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "charged" || s === "reviewed") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (s === "failed") return "border-severity-critical/30 bg-severity-critical/10 text-severity-critical";
  if (s === "reserved") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return "border-phantix-600/40 bg-phantix-800/50 text-slate-400";
}

// Source-control provider metadata, icons and webhook paths are shared with
// the dedicated connection pages in ../scmProviders.

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const v = value as { items?: T[]; connectors?: T[]; installations?: T[] } | null;
  return v?.items ?? v?.connectors ?? v?.installations ?? [];
}

/** Each section of Code is its own page; the tab strip is the router. */
const SECTIONS = [
  { id: "review", label: "Security review", path: "/code-review" },
  { id: "repositories", label: "Repositories", path: "/code-review/repositories" },
  { id: "pull-requests", label: "Pull requests", path: "/code-review/pull-requests" },
  { id: "providers", label: "Providers", path: "/code-review/providers" },
  { id: "autofix", label: "AutoFix", path: "/code-review/autofix" },
  { id: "continuous-pr", label: "Continuous PR", path: "/code-review/continuous-pr" },
] as const;

export default function Code() {
  const { toast, requireDualControl } = useStore();
  const navigate = useNavigate();
  const params = useParams<{ section?: string }>();
  // The section lives in the URL, so each one is linkable, bookmarkable and its
  // own entry in the sidebar — the review is the default because it is the
  // point of the page; connecting repositories is setup.
  const tab = SECTIONS.some((s) => s.id === params.section)
    ? (params.section as string)
    : "review";
  const setTab = (id: string) =>
    navigate(SECTIONS.find((s) => s.id === id)?.path ?? "/code-review");
  const [loading, setLoading] = useState(true);
  const [reposError, setReposError] = useState<string | null>(null);
  const [installation, setInstallation] = useState<any>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [settings, setSettings] = useState<Record<number, ReviewSetting>>({});
  const [wallet, setWallet] = useState<any>(null);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [autofix, setAutofix] = useState<any>(null);
  const [scmCatalog, setScmCatalog] = useState<IntegrationConnector[]>([]);
  const [scmInstalls, setScmInstalls] = useState<IntegrationInstallation[]>([]);
  const [connectId, setConnectId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const autoSynced = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setReposError(null);
    const [inst, walletRes, settingsRes, eventsRes, autofixRes, catalogRes, installsRes] = await Promise.all([
      loadGithubInstallation().catch(() => null),
      loadBranchReviewWallet().catch(() => null),
      loadBranchReviewSettings().catch(() => null),
      loadBranchReviewEvents().catch(() => null),
      loadAutofixStatus().catch(() => null),
      loadHubCatalog().catch(() => null),
      loadHubInstallations().catch(() => null),
    ]);
    setInstallation(inst);
    const catalog = asArray<IntegrationConnector & { display_name?: string }>(catalogRes)
      .filter((c) => SCM_HUB_PROVIDERS.has(c.connector_id))
      .map((c) => ({ ...c, name: c.name || c.display_name || c.connector_id }));
    setScmCatalog(catalog);
    setScmInstalls(
      asArray<IntegrationInstallation>(installsRes).filter((i) =>
        ["gitlab", "gitea", "github"].includes(i.connector_id),
      ),
    );
    setWallet(walletRes);
    setEvents(Array.isArray(eventsRes?.items) ? eventsRes.items : []);
    setAutofix(autofixRes);
    const map: Record<number, ReviewSetting> = {};
    for (const s of settingsRes?.items ?? []) map[s.github_repository_id] = s;
    setSettings(map);
    try {
      const r = await loadGithubRepositories();
      setRepos(Array.isArray(r?.items) ? r.items : []);
    } catch (e: any) {
      setRepos([]);
      setReposError(publicErrorMessage(e, "Repositories unavailable."));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const syncRepos = useCallback(
    async (opts?: { silent?: boolean }) => {
      setSyncing(true);
      try {
        await syncRepositories();
        await load();
        if (!opts?.silent) {
          toast("success", "Repositories synced", "GitHub, GitLab and Gitea repositories are up to date.");
        }
      } catch (e: unknown) {
        if (!opts?.silent) toast("error", "Sync failed", publicErrorMessage(e, "Could not sync repositories."));
      } finally {
        setSyncing(false);
      }
    },
    [load, toast],
  );

  // Once per page visit: an active SCM connection with nothing cached yet means
  // the connect succeeded but the repository import has not run. Pull it now so
  // the user does not have to discover a separate sync action.
  useEffect(() => {
    if (loading || autoSynced.current) return;
    const hasScm = scmInstalls.some(
      (i) => ["gitlab", "gitea"].includes(i.connector_id) && i.status === "active",
    );
    if (hasScm && repos.length === 0 && !reposError) {
      autoSynced.current = true;
      void syncRepos({ silent: true });
    }
  }, [loading, scmInstalls, repos.length, reposError, syncRepos]);

  const connected = Boolean(installation?.connected || installation?.status === "active" || installation?.installation_id);

  const connectGithub = useCallback(async () => {
    try {
      const r = await api.get<{ install_url?: string }>("/github/install-url");
      if (r?.install_url) window.location.href = r.install_url;
      else toast("error", "GitHub install URL unavailable");
    } catch {
      toast("error", "Could not start GitHub install");
    }
  }, [toast]);

  const resumeScmOAuth = useCallback(async (installationId: number) => {
    try {
      const r = await startHubOAuth(installationId);
      if (r?.authorize_url) window.location.href = r.authorize_url;
      // A parked start opens the approval overlay; anything else is a failure.
      else if (!isPendingApproval(r)) toast("error", "Could not start OAuth", "No authorization address came back. Try again.");
    } catch {
      toast("error", "Could not start OAuth");
    }
  }, [toast]);

  const disconnectScm = useCallback(async (install: IntegrationInstallation) => {
    if (!(await requireDualControl("Disconnecting a source-control provider requires dual-control."))) return;
    const res = await uninstallHubIntegration(install.installation_id);
    await load();
    // A parked call opens the approval overlay (it names the authorizer).
    if (!isPendingApproval(res)) toast("success", "Disconnected", `${install.label} disconnected.`);
  }, [requireDualControl, toast, load]);

  return (
    <div>
      <PageHeader
        title="Code"
        description="Source control, AutoFix, Continuous PR, and branch/merge-request reviews."
        actions={<>
            <DocLink docId="howto-app-21" label="Code security how-to" />
          <button onClick={() => void load()} className="btn-ghost text-xs !py-2" title="Refresh">
            <RefreshCw size={13} className={cx("inline", loading && "animate-spin")} />
          </button>
        </>}
      />

      <UpsellBanner feature="continuous_pr" />

      {/* Source control and account state in one strip: one icon per provider
          with its state, then the wallet and Continuous PR. The full cards
          live on the Providers page — this strip exists so the section you
          actually came for is not pushed below the fold. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-phantix-700/40 bg-phantix-900/40 px-3 py-1.5">
        <span className="mr-1 font-mono text-[12px] uppercase tracking-[0.18em] text-slate-500">
          Source control
        </span>
        <button
          type="button"
          onClick={() => navigate("/code-review/providers/github")}
          title={connected ? "GitHub: connected" : "GitHub: not connected"}
          aria-label={connected ? "GitHub connected" : "GitHub not connected"}
          className={cx(
            "relative flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
            connected
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-phantix-600/40 bg-phantix-800/50 text-slate-400 hover:text-slate-200",
          )}
        >
          <Github size={15} />
          {connected && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400" />
          )}
        </button>
        {scmCatalog.map((c) => {
          const install = scmInstalls.find((i) => i.connector_id === c.connector_id);
          const active = install?.status === "active";
          return (
            <button
              key={c.connector_id}
              type="button"
              onClick={() => {
                if (SCM_PROVIDER_SETUP[c.connector_id]) navigate(`/code-review/providers/${c.connector_id}`);
                else if (scmInstallable(c)) setConnectId(c.connector_id);
                else toast("info", "Coming soon", `${c.name || c.connector_id} is in the catalogue and not installable yet.`);
              }}
              title={`${c.name || c.connector_id}: ${active ? "connected" : install ? install.status : "not connected"}`}
              aria-label={c.name || c.connector_id}
              className={cx(
                "relative flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
                active
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                  : "border-phantix-600/40 bg-phantix-800/50 text-slate-400 hover:text-slate-200",
              )}
            >
              {scmIcon(c.connector_id)}
              {active && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400" />
              )}
            </button>
          );
        })}
        {wallet?.balance_ngn != null && (
          <span className="chip ml-1 text-xs border-phantix-600/40 bg-phantix-800/50 text-slate-300">
            Branch-review wallet · ₦{Number(wallet.balance_ngn).toLocaleString()}
          </span>
        )}
        {autofix?.continuous_pr && (
          <span className="chip text-xs border-gold-400/30 bg-gold-400/10 text-gold-200">
            Continuous PR {autofix.continuous_pr.opens_pr ? "enabled" : "off"}
          </span>
        )}
        <button
          type="button"
          onClick={() => setTab("providers")}
          className="ml-auto rounded-md px-2.5 py-1.5 text-[13px] text-slate-400 transition-colors hover:bg-phantix-800/70 hover:text-slate-200"
        >
          Manage providers
        </button>
      </div>

      <Tabs
        tabs={SECTIONS.map((s) => ({
          id: s.id,
          label: s.label,
          count:
            s.id === "repositories"
              ? repos.length || undefined
              : s.id === "pull-requests"
                ? events.length || undefined
                : s.id === "providers"
                  ? scmCatalog.length || undefined
                  : undefined,
        }))}
        active={tab}
        onChange={setTab}
      />

      {tab === "review" && (
        // The GitHub-style review: the block that is wrong, why, how to fix it,
        // and the AutoFix draft PR that closes it.
        <CodeReview repos={repos} />
      )}

      {tab === "repositories" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader
            title="Connected repositories"
            subtitle="Repositories from GitHub, GitLab and Gitea connections"
            action={
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary !px-2 !py-1 !text-xs"
                  disabled={syncing || loading}
                  onClick={() => void syncRepos()}
                >
                  {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync repositories
                </button>
                <GitBranch size={16} className="text-gold-300" />
              </div>
            }
          />
          {loading ? (
            <CardListSkeleton rows={4} className="p-4" />
          ) : reposError ? (
            <EmptyState icon={<AlertTriangle size={22} />} title="Repositories unavailable" body={reposError} action={<button className="btn-secondary" onClick={() => void load()}>Retry</button>} />
          ) : repos.length === 0 ? (
            <EmptyState
              icon={<Github size={22} />}
              title="No repositories yet"
              body="Install the GitHub App, or connect GitLab/Gitea from Providers, to import repositories SecureGraph can review."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button className="btn-secondary" disabled={syncing} onClick={() => void syncRepos()}>
                    {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync repositories
                  </button>
                  <PlatformSetupLink task={{ kind: "install_github" }} variant="primary"><Github size={15} /> Install the GitHub App</PlatformSetupLink>
                </div>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Repository</th>
                    <th className="th">Branch</th>
                    <th className="th">Review</th>
                    <th className="th">Visibility</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {repos.map((r) => {
                    const s = settings[r.id];
                    return (
                      <tr key={r.id} className="border-b border-phantix-700/20 hover:bg-phantix-800/40">
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">{scmIcon(r.provider || "github", 13)}</span>
                            <span className="text-sm text-slate-200">{r.full_name || r.name}</span>
                            <span className="chip text-[11px] border-phantix-600/40 bg-phantix-800/50 text-slate-400">
                              {r.provider || "github"}
                            </span>
                          </div>
                        </td>
                        <td className="td text-xs font-mono text-slate-400">{r.default_branch || s?.watched_branch || "Not set"}</td>
                        <td className="td">
                          {s?.enabled ? (
                            <span className="chip text-[12px] border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                              {s.watched_branch || "watching"}
                            </span>
                          ) : (
                            <span className="chip text-[12px] border-phantix-600/40 text-slate-500">off</span>
                          )}
                        </td>
                        <td className="td text-xs text-slate-400">{r.private ? "Private" : "Public"}</td>
                        <td className="td text-right">
                          {r.html_url && (
                            <a href={r.html_url} target="_blank" rel="noreferrer" className="btn-ghost !px-2 !py-1 !text-xs">
                              <ExternalLink size={12} /> Open
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        </motion.div>
      )}

      {tab === "pull-requests" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader title="Recent branch-review runs" subtitle="Every push the reviewer processed, with pull request safety before merge" action={<GitPullRequest size={16} className="text-gold-300" />} />
          {loading ? (
            <CardListSkeleton rows={4} className="p-4" />
          ) : events.length === 0 ? (
            <EmptyState icon={<GitPullRequest size={22} />} title="No runs yet" body="Runs appear here as pushes land on watched branches. PRs are reviewed before merge." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Repository</th>
                    <th className="th">Ref</th>
                    <th className="th">SHA</th>
                    <th className="th">Tier</th>
                    <th className="th">Status</th>
                    <th className="th">When</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b border-phantix-700/20 hover:bg-phantix-800/40">
                      <td className="td text-sm text-slate-200">{e.repo || "Not set"}</td>
                      <td className="td text-xs font-mono text-slate-400">{e.ref}</td>
                      <td className="td text-xs font-mono text-slate-500">{e.sha?.slice(0, 10)}</td>
                      <td className="td text-xs text-slate-300">{e.size_tier}</td>
                      <td className="td"><span className={cx("chip text-[12px]", statusTone(e.status))}>{humanize(e.status)}</span></td>
                      <td className="td text-xs text-slate-500">{e.created_at ? timeAgo(e.created_at) : "Not set"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        </motion.div>
      )}

      {tab === "autofix" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader title="AutoFix" subtitle="Block-scoped verified fixes, proposed for human review" action={<Wrench size={16} className="text-gold-300" />} />
          <div className="space-y-3 text-sm leading-6 text-slate-300">
            <p>
              AutoFix runs only on <strong className="text-slate-100">verified</strong> findings. It generates the
              smallest diff that fixes the class, re-validates against the original evidence, and runs blast-radius
              tests before anything is proposed.
            </p>
            <p className="text-slate-400">
              Generate a fix from a finding's detail, then open it as a <strong className="text-slate-200">Continuous PR</strong>{" "}
              . SecureGraph clones the repository into an ephemeral directory, commits the fix <strong>signed by the app</strong>,
              and opens a draft pull request that your developers merge.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="chip text-xs border-phantix-600/40 bg-phantix-800/50 text-slate-300">gates: scope · no-op · re-validation · credits</span>
              {autofix?.queue && <span className="chip text-xs border-phantix-600/40 bg-phantix-800/50 text-slate-300">queue: {autofix.queue}</span>}
            </div>
          </div>
        </Card>
        </motion.div>
      )}

      {tab === "continuous-pr" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <ContinuousPrForm repos={repos} onDone={() => void load()} />
        </motion.div>
      )}

      {tab === "providers" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader
              title="Source-control providers"
              subtitle="GitHub App plus Integrations Hub SCM connectors. All feed the same verified-only review flow"
              action={<Webhook size={16} className="text-gold-300" />}
            />
            {loading ? (
              <CardListSkeleton rows={3} className="p-4" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-phantix-700/40">
                        <th className="th">Provider</th>
                        <th className="th">Auth</th>
                        <th className="th">Status</th>
                        <th className="th">Webhook</th>
                        <th className="th text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-phantix-700/20 hover:bg-phantix-800/40">
                        <td className="td">
                          <span className="flex items-center gap-2 text-sm text-slate-200"><Github size={13} className="text-slate-500" /> GitHub</span>
                        </td>
                        <td className="td text-xs text-slate-400">app_install</td>
                        <td className="td">
                          <span className={cx("chip text-[12px]", connected ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-phantix-600/40 text-slate-400")}>
                            {connected ? "connected" : "not connected"}
                          </span>
                        </td>
                        <td className="td text-xs font-mono text-slate-500">{SCM_WEBHOOK_PATH.github}</td>
                        <td className="td text-right">
                          <div className="flex justify-end gap-1">
                            <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => navigate("/code-review/providers/github")}>Manage</button>
                            {!connected && <button className="btn-primary !px-2 !py-1 !text-xs" onClick={() => void connectGithub()}>Connect</button>}
                          </div>
                        </td>
                      </tr>
                      {scmCatalog.map((c) => {
                        const install = scmInstalls.find((i) => i.connector_id === c.connector_id);
                        return (
                          <tr key={c.connector_id} className="border-b border-phantix-700/20 hover:bg-phantix-800/40">
                            <td className="td">
                              <span className="flex items-center gap-2 text-sm text-slate-200">
                                {scmIcon(c.connector_id)} {c.name || c.connector_id}
                              </span>
                            </td>
                            <td className="td text-xs text-slate-400">{(c.auth_modes || []).join(" · ")}</td>
                            <td className="td">
                              <span className={cx("chip text-[12px]", providerTone(install?.status))}>
                                {install?.status === "active"
                                  ? "connected"
                                  : install?.status || (scmInstallable(c) ? "not connected" : "coming soon")}
                              </span>
                            </td>
                            <td className="td text-xs font-mono text-slate-500">{SCM_WEBHOOK_PATH[c.connector_id] || "Not set"}</td>
                            <td className="td text-right">
                              <div className="flex justify-end gap-1">
                                {SCM_PROVIDER_SETUP[c.connector_id] && (
                                  <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => navigate(`/code-review/providers/${c.connector_id}`)}>Manage</button>
                                )}
                                {install?.status === "active" ? (
                                  <>
                                    <button
                                      className="btn-ghost !px-2 !py-1 !text-xs"
                                      onClick={async () => { await testHubInstallation(install.installation_id); toast("info", "Test sent", "Integration health check completed."); }}
                                    >
                                      <TestTube size={12} /> Test
                                    </button>
                                    <button className="btn-ghost !px-2 !py-1 !text-xs text-severity-critical" onClick={() => void disconnectScm(install)}>
                                      <Trash2 size={12} />
                                    </button>
                                  </>
                                ) : install?.status === "pending_auth" ? (
                                  <button className="btn-secondary !px-2 !py-1 !text-xs" onClick={() => void resumeScmOAuth(install.installation_id)}>Finish auth</button>
                                ) : !scmInstallable(c) ? (
                                  <span className="chip text-[12px] border-phantix-600/40 text-slate-500">Coming soon</span>
                                ) : (
                                  <button className="btn-primary !px-2 !py-1 !text-xs" onClick={() => setConnectId(c.connector_id)}>Connect</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="p-3 text-[13px] leading-4 text-slate-500">
                  Point the provider webhook at{" "}
                  <code className="mx-1">{sameOriginApiUrl(`${API_BASE}${SCM_WEBHOOK_PATH.gitlab}`)}</code> for GitLab or{" "}
                  <code className="mx-1">{sameOriginApiUrl(`${API_BASE}${SCM_WEBHOOK_PATH.gitea}`)}</code> for Gitea. Signatures are
                  verified with the connector secret: <code>X-Gitlab-Token</code> or <code>X-Gitea-Signature</code>. GitHub uses the App's{" "}
                  <code>X-Hub-Signature-256</code>.
                </p>
              </>
            )}
          </Card>
        </motion.div>
      )}

      {connectId && (
        <ScmConnectModal
          connector={scmCatalog.find((c) => c.connector_id === connectId) || null}
          onClose={() => setConnectId(null)}
          onDone={() => { setConnectId(null); void load(); }}
        />
      )}
    </div>
  );
}

// ── Connect an SCM connector (api_key or OAuth) ──────────────────────────

function ScmConnectModal({ connector, onClose, onDone }: { connector: IntegrationConnector | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useStore();
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState(connector?.auth_modes?.[0] || "oauth2");
  const [token, setToken] = useState("");
  // Per-connection settings: self-managed instance, own OAuth app, webhook secret.
  const [baseUrl, setBaseUrl] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [resolvedCallback, setResolvedCallback] = useState("");
  const [pendingAuthorizeUrl, setPendingAuthorizeUrl] = useState("");
  const [busy, setBusy] = useState(false);
  if (!connector) return null;
  const needsToken = mode === "api_key";
  const ownOAuthApp = mode === "oauth2" && Boolean(clientId.trim() || clientSecret.trim());
  const setup = SCM_PROVIDER_SETUP[connector.connector_id];
  const tokenPage = setup ? scmTokenUrl(setup, baseUrl) : null;

  const submit = async () => {
    if (!label.trim()) { toast("error", "Label is required"); return; }
    if (needsToken && !token.trim()) { toast("error", "A personal access token is required"); return; }
    if (ownOAuthApp && !(clientId.trim() && clientSecret.trim())) {
      toast("error", "OAuth app needs both values", "Provide both the client ID and the client secret, or leave both blank.");
      return;
    }
    setBusy(true);
    try {
      const config: Record<string, unknown> = {};
      const secrets: Record<string, unknown> = {};
      const base = baseUrl.trim().replace(/\/+$/, "");
      if (base) config.base_url = base;
      if (webhookSecret.trim()) config.webhook_secret = webhookSecret.trim();
      if (mode === "oauth2") {
        if (callbackUrl.trim()) config.callback_url = callbackUrl.trim();
        if (clientId.trim()) config.client_id = clientId.trim();
        if (clientSecret.trim()) secrets.client_secret = clientSecret.trim();
      } else if (token.trim()) {
        secrets.api_key = token.trim();
      }

      const body: Record<string, unknown> = {
        connector_id: connector.connector_id,
        label: label.trim(),
        auth_mode: mode,
      };
      if (Object.keys(config).length) body.config = config;
      if (Object.keys(secrets).length) body.secrets = secrets;

      const res = await installHubIntegration(body);
      if (isPendingApproval(res)) {
        // A parked call opens the approval overlay (it names the authorizer).
        onDone();
        return;
      }
      const id = (res as { installation_id?: number; id?: number })?.installation_id ?? (res as { id?: number })?.id;
      if (mode === "oauth2" && id) {
        const start = await startHubOAuth(id);
        if (start?.redirect_uri) setResolvedCallback(start.redirect_uri);
        if (start?.authorize_url) {
          // Own OAuth app: hold the redirect so the operator can register the
          // exact callback URL first.
          if (ownOAuthApp && !callbackUrl.trim()) {
            setPendingAuthorizeUrl(start.authorize_url);
            toast("info", "Register the callback URL", "Copy the callback shown, add it to your OAuth app, then continue.");
            return;
          }
          window.location.href = start.authorize_url;
          return;
        }
      }
      // PAT connect completes in this request: import its repos immediately.
      await syncRepositories().catch(() => null);
      toast("success", "Connected", `${connector.name} connected.`);
      onDone();
    } catch (e: unknown) {
      const err = e as { message?: string; detail?: { message?: string } };
      toast("error", "Connect failed", err?.message || "Could not connect provider.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Connect ${connector.name}`}>
      <div className="space-y-4">
        <p className="text-xs text-slate-400">{connector.description}</p>
        <div>
          <label className="label">Label</label>
          <input className="input" placeholder={`e.g. ${connector.name} (production)`} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        {connector.auth_modes.length > 1 && (
          <div>
            <label className="label">Authentication</label>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              {connector.auth_modes.map((m) => (
                <option key={m} value={m}>{humanize(m)}</option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          className="btn-ghost w-full !justify-between !py-2 !text-xs"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <span className="flex items-center gap-1.5">
            <Settings2 size={13} /> Advanced: self-hosted instance, own OAuth app, webhook secret
          </span>
          {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {showAdvanced && (
          <div className="space-y-3 rounded-lg border border-phantix-700/40 bg-phantix-950/50 p-3">
            <div>
              <label className="label">{connector.name} base URL</label>
              <input
                className="input font-mono !text-xs"
                placeholder={connector.connector_id === "gitea" ? "https://git.yourcompany.com" : "https://gitlab.com"}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
              <p className="mt-1 text-[13px] leading-4 text-slate-500">
                Blank uses the server default. Each organization may point at its own instance.
              </p>
            </div>
            {mode === "oauth2" && (
              <>
                <div>
                  <label className="label">OAuth client ID <span className="text-slate-500">(optional)</span></label>
                  <input
                    className="input font-mono !text-xs"
                    placeholder="Leave blank to use the platform's OAuth app"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">OAuth client secret <span className="text-slate-500">(optional)</span></label>
                  <input
                    type="password"
                    className="input font-mono !text-xs"
                    placeholder="Stored encrypted, never shown again"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">OAuth callback URL <span className="text-slate-500">(optional)</span></label>
                  <input
                    className="input font-mono !text-xs"
                    placeholder={`https://platform.example/integrations/oauth/${connector.connector_id}/callback`}
                    value={callbackUrl}
                    onChange={(e) => setCallbackUrl(e.target.value)}
                  />
                  <p className="mt-1 text-[13px] leading-4 text-slate-500">
                    Use <code>{"{connector_id}"}</code> where the provider id belongs. Blank uses the platform default.
                  </p>
                </div>
              </>
            )}
            <div>
              <label className="label">Webhook secret <span className="text-slate-500">(optional)</span></label>
              <input
                type="password"
                className="input font-mono !text-xs"
                placeholder="Secret your provider sends with webhooks"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
              />
              <p className="mt-1 text-[13px] leading-4 text-slate-500">
                Blank uses the server default ({setup?.webhookSecretEnv ?? "provider env"}).
              </p>
            </div>
          </div>
        )}

        {pendingAuthorizeUrl && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            <p className="font-semibold">Register this callback URL on your OAuth app</p>
            <p className="mt-1 text-[13px] text-amber-100/80">Copy it, add it to the app, then continue to {connector.name}.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all font-mono text-[12px]">{resolvedCallback || callbackUrl}</code>
              <button
                className="btn-ghost p-1"
                title="Copy callback URL"
                onClick={() => {
                  void navigator.clipboard?.writeText(resolvedCallback || callbackUrl);
                  toast("success", "Callback URL copied");
                }}
              >
                <Copy size={12} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn-primary !py-2 !text-xs" onClick={() => { window.location.href = pendingAuthorizeUrl; }}>
                Continue to {connector.name}
              </button>
              <button className="btn-secondary !py-2 !text-xs" onClick={() => setPendingAuthorizeUrl("")}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {needsToken ? (
          <div>
            <label className="label">Personal access token</label>
            <textarea
              className="input !min-h-[80px] font-mono !text-xs"
              placeholder="Paste a token with repository read + pull-request write scope"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p className="mt-1 text-[13px] text-slate-500">
              Stored encrypted and never shown again.
            </p>
            {tokenPage && (
              <a href={tokenPage} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] text-phantix-300 hover:underline">
                <ExternalLink size={12} /> Where to create a token
              </a>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-slate-500">You will be redirected to {connector.name} to authorise repository access.</p>
        )}
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 size={13} className="mr-1.5 inline animate-spin" /> : null}
            {needsToken ? "Connect" : `Continue to ${connector.name}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ContinuousPrForm({ repos, onDone }: { repos: Repo[]; onDone: () => void }) {
  const { toast } = useStore();
  const [repoFull, setRepoFull] = useState("");
  const [findingText, setFindingText] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: string; message: string; requestUrl?: string } | null>(null);

  const selected = useMemo(() => repos.find((r) => (r.full_name || r.name) === repoFull), [repos, repoFull]);

  const submit = async () => {
    if (!repoFull) {
      toast("error", "Pick a repository");
      return;
    }
    let finding: Record<string, unknown> = {};
    try {
      finding = findingText.trim() ? JSON.parse(findingText) : {};
    } catch {
      toast("error", "Finding must be valid JSON");
      return;
    }
    const [owner, repo] = repoFull.split("/");
    if (!owner || !repo) {
      toast("error", "Repository must be owner/name");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await api.post<any>("/ai/autofix/continuous-pr", {
        finding,
        owner,
        repo,
        base_branch: baseBranch || selected?.default_branch || undefined,
      });
      setResult({ kind: "queued", message: `Queued as task ${res?.task_id ?? "Not set"}. A draft pull request will open. The system never merges it automatically.` });
      onDone();
    } catch (e: any) {
      const detail = e?.detail ?? {};
      if (detail?.error === "free_model_agreement_required") {
        setResult({ kind: "error", message: publicDetailCopy(detail.message) || "Agreement required.", requestUrl: detail.agreement_endpoint });
      } else if (detail?.error === "permission_required") {
        setResult({ kind: "permission", message: publicDetailCopy(detail.message) || "GitHub write permissions required.", requestUrl: detail.request_url });
      } else {
        // e.message is normalized already; the sanitized detail covers statuses
        // (e.g. 403) whose detail is useful but not on the status-copy path.
        setResult({ kind: "error", message: publicDetailCopy(detail) || e?.message || "Could not open Continuous PR." });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Open a Continuous PR"
        subtitle="Ephemeral clone → app-signed commit → draft PR (a developer merges)"
        action={<ShieldCheck size={16} className="text-emerald-300" />}
      />
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Repository</label>
            <select className="input" value={repoFull} onChange={(e) => setRepoFull(e.target.value)}>
              <option value="">Select a repository…</option>
              {repos.map((r) => (
                <option key={r.id} value={r.full_name || r.name}>
                  {r.full_name || r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Base branch (optional)</label>
            <input className="input" placeholder={selected?.default_branch || "default branch"} value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Finding (JSON)</label>
          <textarea
            className="input !min-h-[130px] font-mono !text-xs"
            placeholder='{ "title": "…", "severity": "high", "vuln_class": "sql_injection", "evidence": { … } }'
            value={findingText}
            onChange={(e) => setFindingText(e.target.value)}
          />
          <p className="mt-1 text-[13px] text-slate-500">
            Only verified findings reach AutoFix; the patch will follow your product-context code style and be signed by the app.
          </p>
        </div>

        {result && (
          <div className={cx("rounded-md border p-3 text-xs leading-5", result.kind === "queued" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200")}>
            <p>{result.message}</p>
            {result.requestUrl && (
              <a href={result.requestUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 underline">
                <ExternalLink size={11} /> Grant access or open link
              </a>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button className="btn-primary text-xs" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 size={13} className="mr-1.5 inline animate-spin" /> : <Send size={13} className="mr-1.5 inline" />}
            Open Continuous PR
          </button>
        </div>
        <p className="text-[13px] leading-4 text-slate-500">
          Dual-controlled: the request is parked for an authorizer before it runs. It never forks and never
          merges. The pull request opens as a draft.
        </p>
      </div>
    </Card>
  );
}
