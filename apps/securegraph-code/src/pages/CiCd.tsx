import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Trash2,
  Pencil,
  Copy,
  Plug,
  Workflow,
  GitBranch,
  History,
  Link2,
  KeyRound,
} from "lucide-react";
import {
  PageHeader,
  Card,
  StatCard,
  Modal,
  Tabs,
  PageSkeleton,
  ErrorState,
  EmptyState,
  Spinner,
} from "@sg/ui";
import { Pagination, usePaged } from "@sg/components/Pagination";
import SecurityDbBanner from "@sg/components/SecurityDbBanner";
import DocLink from "@sg/components/DocLink";
import { useResource } from "@sg/useResource";
import { useStore } from "@sg/store";
import { isSecurityDbBlocked } from "@sg/api";
import { timeAgo, cx } from "@sg/utils";
import {
  listProviders,
  listConnections,
  listRules,
  listEvents,
  createConnection,
  deleteConnection,
  createRule,
  updateRule,
  deleteRule,
  providerLabel,
  cicdWebhookUrl,
  PROVIDER_SIGNATURE_HEADER,
  CICD_PROVIDERS,
  CICD_EVENT_TYPES,
  type CiCdProvider,
  type CiCdConnection,
  type CiCdWatchRule,
  type CiCdEvent,
} from "@sg/cicdOps";

interface Bundle {
  providers: CiCdProvider[];
  connections: CiCdConnection[];
  rules: CiCdWatchRule[];
  events: CiCdEvent[];
  securityDbBlocked: boolean;
  error: string | null;
}

const EMPTY: Bundle = { providers: [], connections: [], rules: [], events: [], securityDbBlocked: false, error: null };

async function loadCiCdBundle(): Promise<Bundle> {
  try {
    const [providers, connections, rules, events] = await Promise.all([
      listProviders(),
      listConnections(),
      listRules(),
      listEvents(200),
    ]);
    return {
      providers: providers.providers,
      connections: connections.items,
      rules: rules.items,
      events: events.items,
      securityDbBlocked: false,
      error: null,
    };
  } catch (err) {
    if (isSecurityDbBlocked(err)) return { ...EMPTY, securityDbBlocked: true };
    return { ...EMPTY, error: err instanceof Error ? err.message : "Failed to load CI/CD monitoring" };
  }
}

// Trigger-history status → tone. Mirrors cicd_service record_and_trigger returns.
const STATUS_TONE: Record<string, string> = {
  scan_queued: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  received: "border-phantix-600/40 bg-phantix-800/50 text-slate-300",
  duplicate: "border-phantix-600/40 bg-phantix-800/50 text-slate-400",
  no_rule: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  disabled: "border-phantix-600/40 bg-phantix-800/50 text-slate-400",
  throttled: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  failed: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
  ignored: "border-phantix-600/40 bg-phantix-800/50 text-slate-500",
};

function statusTone(status: string): string {
  return STATUS_TONE[status] ?? "border-phantix-600/40 bg-phantix-800/50 text-slate-400";
}

function humanizeStatus(status: string): string {
  return status.replace(/_/g, " ");
}

export default function CiCd() {
  const { toast, requireDualControl } = useStore();
  const { data, loading, error, reload } = useResource(loadCiCdBundle, EMPTY, "cicd-monitoring");
  const [tab, setTab] = useState("connections");
  const [connectOpen, setConnectOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CiCdWatchRule | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { providers, connections, rules, events } = data;
  const enabledRules = useMemo(() => rules.filter((r) => r.enabled).length, [rules]);
  const configuredProviders = useMemo(() => providers.filter((p) => p.secret_configured).length, [providers]);

  // Client-side paging for the trigger history — the list can grow long.
  const { pageItems: eventPage, pagination } = usePaged(events, "cicd-events");

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast("success", "Copied", `${label} copied to the clipboard.`);
    } catch {
      toast("error", "Copy failed", "Select the value and copy it manually.");
    }
  };

  const removeConnection = async (c: CiCdConnection) => {
    const linked = rules.filter((r) => r.connection_id === c.id).length;
    const warn = linked
      ? `Deleting this connection also removes ${linked} watch rule${linked === 1 ? "" : "s"}.`
      : "Deleting a CI/CD connection requires a dual-control operate session.";
    if (!(await requireDualControl(warn))) return;
    setBusyId(c.id);
    try {
      await deleteConnection(c.id);
      toast("success", "Connection deleted", `${c.display_name} is no longer connected.`);
      reload();
    } catch (err) {
      toast("error", "Delete failed", err instanceof Error ? err.message : "Could not delete the connection.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleRule = async (r: CiCdWatchRule) => {
    if (!(await requireDualControl(`${r.enabled ? "Pausing" : "Enabling"} a watch rule requires a dual-control operate session.`))) return;
    setBusyId(r.id);
    try {
      await updateRule(r.id, { enabled: !r.enabled });
      toast("success", r.enabled ? "Rule paused" : "Rule enabled", r.repo_full_name);
      reload();
    } catch (err) {
      toast("error", "Update failed", err instanceof Error ? err.message : "Could not update the rule.");
    } finally {
      setBusyId(null);
    }
  };

  const removeRule = async (r: CiCdWatchRule) => {
    if (!(await requireDualControl("Deleting a watch rule requires a dual-control operate session."))) return;
    setBusyId(r.id);
    try {
      await deleteRule(r.id);
      toast("success", "Rule deleted", r.repo_full_name);
      reload();
    } catch (err) {
      toast("error", "Delete failed", err instanceof Error ? err.message : "Could not delete the rule.");
    } finally {
      setBusyId(null);
    }
  };

  const openNewRule = () => {
    if (connections.length === 0) {
      toast("warning", "Connect a provider first", "Add a CI/CD connection before creating a watch rule.");
      setTab("connections");
      setConnectOpen(true);
      return;
    }
    setEditingRule(null);
    setRuleOpen(true);
  };

  if (loading) return <PageSkeleton variant="list" rows={6} actions />;

  if (error && connections.length === 0 && rules.length === 0 && !data.securityDbBlocked) {
    return <ErrorState onRetry={reload} body="We could not load CI/CD monitoring. Check your connection and try again. Your session stays signed in." />;
  }

  return (
    <div>
      <PageHeader
        title="CI/CD monitoring"
        description="Connect your pipelines so pushes and deployments are reviewed before they ship."
        actions={
          <div className="flex items-center gap-2">
            <DocLink docId="howto-app-21" label="Code security how-to" />
            <button className="btn-primary" onClick={() => setConnectOpen(true)}>
              <Plus size={15} /> Connect provider
            </button>
          </div>
        }
      />

      {data.securityDbBlocked && <SecurityDbBanner message={data.error} />}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Connections" value={connections.length} hint={`${configuredProviders} provider secret${configuredProviders === 1 ? "" : "s"} configured`} />
        <StatCard label="Watch rules" value={rules.length} hint={`${enabledRules} enabled`} />
        <StatCard label="Providers" value={CICD_PROVIDERS.length} hint="supported" />
        <StatCard label="Recent triggers" value={events.length} hint="last 200 events" />
      </div>

      <Tabs
        tabs={[
          { id: "connections", label: "Connections", count: connections.length },
          { id: "rules", label: "Watch rules", count: rules.length },
          { id: "history", label: "Trigger history", count: events.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "connections" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {connections.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Plug size={22} />}
                title="No CI/CD connections yet"
                body="Connect GitHub, GitLab, Gitea or any CI/CD provider to review pushes and deployments automatically."
                action={<button className="btn-primary" onClick={() => setConnectOpen(true)}><Plus size={15} /> Connect provider</button>}
              />
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-phantix-700/40">
                      <th className="th">Provider</th>
                      <th className="th">Name</th>
                      <th className="th">Secret</th>
                      <th className="th">Rules</th>
                      <th className="th">Last event</th>
                      <th className="th">Connected</th>
                      <th className="th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connections.map((c) => {
                      const ruleCount = rules.filter((r) => r.connection_id === c.id).length;
                      return (
                        <tr key={c.id} className="border-b border-phantix-800/40 hover:bg-phantix-800/35">
                          <td className="td font-medium text-slate-200">{providerLabel(c.provider)}</td>
                          <td className="td text-sm text-slate-300">{c.display_name}</td>
                          <td className="td">
                            {c.secret_configured ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[12px] font-medium text-emerald-300"><KeyRound size={11} /> Set</span>
                            ) : (
                              <span className="rounded-md border border-phantix-600/40 bg-phantix-800/50 px-2 py-0.5 text-[12px] text-slate-400">Env default</span>
                            )}
                          </td>
                          <td className="td text-sm text-slate-400">{ruleCount}</td>
                          <td className="td whitespace-nowrap text-xs text-slate-500">{c.last_event_at ? timeAgo(c.last_event_at) : "never"}</td>
                          <td className="td whitespace-nowrap text-xs text-slate-500">{c.created_at ? timeAgo(c.created_at) : "Not set"}</td>
                          <td className="td">
                            <div className="flex items-center justify-end gap-1.5">
                              <button className="btn-secondary !px-2 !py-1" title="Copy webhook URL" onClick={() => copy(cicdWebhookUrl(c.provider, c.id), "Webhook URL")}><Link2 size={13} /></button>
                              <button className="btn-secondary !px-2 !py-1 hover:!text-severity-critical" title="Delete" disabled={busyId === c.id} onClick={() => removeConnection(c)}>
                                {busyId === c.id ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 size={13} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </motion.div>
      )}

      {tab === "rules" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-3 flex justify-end">
            <button className="btn-secondary" onClick={openNewRule}><Plus size={14} /> New watch rule</button>
          </div>
          {rules.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Workflow size={22} />}
                title="No watch rules yet"
                body="Add a rule so a push or deployment to a watched branch queues a branch-review scan."
                action={<button className="btn-primary" onClick={openNewRule}><Plus size={15} /> New watch rule</button>}
              />
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-phantix-700/40">
                      <th className="th">Repository</th>
                      <th className="th">Branch</th>
                      <th className="th">Events</th>
                      <th className="th">Profile</th>
                      <th className="th">Environment</th>
                      <th className="th">Status</th>
                      <th className="th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id} className="border-b border-phantix-800/40 hover:bg-phantix-800/35">
                        <td className="td">
                          <div className="flex items-center gap-1.5 font-medium text-slate-200">
                            <GitBranch size={13} className="text-slate-500" />
                            <span className="max-w-[260px] truncate">{r.repo_full_name}</span>
                          </div>
                          <span className="text-[12px] text-slate-500">{providerLabel(r.provider)}</span>
                        </td>
                        <td className="td">
                          <span className="font-mono text-xs text-slate-300">{r.branch_pattern}</span>
                          {r.is_glob && <span className="ml-1.5 rounded bg-phantix-800/80 px-1.5 py-0.5 text-[11px] uppercase text-slate-500">glob</span>}
                        </td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1">
                            {r.event_types.map((e) => (
                              <span key={e} className="rounded-md bg-phantix-800/80 px-1.5 py-0.5 text-[12px] font-medium text-slate-400">{e}</span>
                            ))}
                          </div>
                        </td>
                        <td className="td text-xs text-slate-400">{r.scan_profile ?? <span className="text-slate-600">default</span>}</td>
                        <td className="td text-xs text-slate-400">{r.environment_filter ?? <span className="text-slate-600">any</span>}</td>
                        <td className="td">
                          <button
                            className={cx(
                              "rounded-md border px-2 py-0.5 text-[12px] font-medium transition-colors",
                              r.enabled
                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:border-emerald-400/50"
                                : "border-phantix-600/40 bg-phantix-800/50 text-slate-400 hover:border-phantix-500",
                            )}
                            disabled={busyId === r.id}
                            onClick={() => toggleRule(r)}
                            title={r.enabled ? "Pause rule" : "Enable rule"}
                          >
                            {busyId === r.id ? "…" : r.enabled ? "Enabled" : "Paused"}
                          </button>
                        </td>
                        <td className="td">
                          <div className="flex items-center justify-end gap-1.5">
                            <button className="btn-secondary !px-2 !py-1" title="Edit" onClick={() => { setEditingRule(r); setRuleOpen(true); }}><Pencil size={13} /></button>
                            <button className="btn-secondary !px-2 !py-1 hover:!text-severity-critical" title="Delete" disabled={busyId === r.id} onClick={() => removeRule(r)}><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </motion.div>
      )}

      {tab === "history" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {events.length === 0 ? (
            <Card>
              <EmptyState icon={<History size={22} />} title="No triggers yet" body="When a provider delivers a push or deployment webhook, it appears here with the scan it queued." />
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-phantix-700/40">
                      <th className="th">When</th>
                      <th className="th">Repository</th>
                      <th className="th">Branch</th>
                      <th className="th">Event</th>
                      <th className="th">Actor</th>
                      <th className="th">Status</th>
                      <th className="th">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventPage.map((e) => (
                      <tr key={e.id} className="border-b border-phantix-800/40 hover:bg-phantix-800/35">
                        <td className="td whitespace-nowrap text-xs text-slate-500">{e.received_at ? timeAgo(e.received_at) : "Not set"}</td>
                        <td className="td">
                          <span className="max-w-[240px] truncate text-sm text-slate-300" title={e.repo_full_name}>{e.repo_full_name}</span>
                          <span className="block text-[12px] text-slate-500">{providerLabel(e.provider)}</span>
                        </td>
                        <td className="td font-mono text-xs text-slate-400">{e.branch || <span className="text-slate-600">—</span>}</td>
                        <td className="td"><span className="rounded-md bg-phantix-800/80 px-1.5 py-0.5 text-[12px] font-medium text-slate-400">{e.event_type}</span></td>
                        <td className="td text-xs text-slate-400">{e.actor ?? <span className="text-slate-600">—</span>}</td>
                        <td className="td">
                          <span className={cx("inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-medium", statusTone(e.status))}>
                            {humanizeStatus(e.status)}
                          </span>
                        </td>
                        <td className="td max-w-[280px] truncate text-xs text-slate-400" title={e.detail ?? ""}>{e.detail ?? "Not set"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...pagination} itemLabel="triggers" keyboard />
            </Card>
          )}
        </motion.div>
      )}

      <ConnectModal
        open={connectOpen}
        providers={providers}
        onClose={() => setConnectOpen(false)}
        onDone={() => { setConnectOpen(false); reload(); }}
      />
      <RuleModal
        open={ruleOpen}
        rule={editingRule}
        connections={connections}
        onClose={() => { setRuleOpen(false); setEditingRule(null); }}
        onDone={() => { setRuleOpen(false); setEditingRule(null); reload(); }}
      />
    </div>
  );
}

// ── Connect provider ────────────────────────────────────────────────────────
function ConnectModal({
  open,
  providers,
  onClose,
  onDone,
}: {
  open: boolean;
  providers: CiCdProvider[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast, requireDualControl } = useStore();
  const [provider, setProvider] = useState<string>("github");
  const [displayName, setDisplayName] = useState("");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const secretConfigured = providers.find((p) => p.provider === provider)?.secret_configured ?? false;

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast("success", "Copied", `${label} copied to the clipboard.`);
    } catch {
      toast("error", "Copy failed", "Select the value and copy it manually.");
    }
  };

  const submit = async () => {
    if (!(await requireDualControl("Connecting a CI/CD provider requires a dual-control operate session."))) return;
    setSaving(true);
    try {
      await createConnection({ provider, display_name: displayName.trim() || undefined, secret: secret.trim() || undefined });
      toast("success", "Provider connected", `${providerLabel(provider)} is ready to receive webhooks.`);
      setDisplayName("");
      setSecret("");
      onDone();
    } catch (err) {
      toast("error", "Connect failed", err instanceof Error ? err.message : "Could not connect the provider.");
    } finally {
      setSaving(false);
    }
  };

  const webhookUrl = cicdWebhookUrl(provider);

  return (
    <Modal open={open} onClose={onClose} title="Connect a CI/CD provider" wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Provider</label>
            <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
              {CICD_PROVIDERS.map((p) => <option key={p} value={p}>{providerLabel(p)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Display name</label>
            <input className="input" placeholder={providerLabel(provider)} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Shared secret (optional)</label>
          <input className="input" type="password" placeholder={secretConfigured ? "Using the platform env secret" : "Paste the webhook secret"} value={secret} onChange={(e) => setSecret(e.target.value)} />
          <p className="mt-1 text-[12px] text-slate-500">
            Leave blank to verify with the platform environment secret.{" "}
            {secretConfigured ? "A platform secret is configured for this provider." : "No platform secret is set for this provider yet — set a per-connection secret here."}
          </p>
        </div>

        <fieldset className="rounded-xl border border-phantix-700/50 bg-phantix-950/50 p-3.5">
          <legend className="px-1 text-[12px] font-semibold uppercase tracking-wider text-slate-400">Webhook</legend>
          <p className="mb-2 text-[12px] text-slate-500">Point your provider's webhook at this URL. Signatures are verified with the {PROVIDER_SIGNATURE_HEADER[provider] ?? "provider"} header.</p>
          <div className="flex items-center gap-2 rounded-lg border border-phantix-700/50 bg-phantix-900 px-2.5 py-2">
            <code className="flex-1 truncate font-mono text-[12px] text-phantix-300">{webhookUrl}</code>
            <button type="button" className="btn-ghost p-1" title="Copy webhook URL" onClick={() => copy(webhookUrl, "Webhook URL")}><Copy size={13} /></button>
          </div>
          <p className="mt-1.5 text-[12px] text-slate-500">After connecting, copy the per-connection URL (it carries the connection id) from the connections table.</p>
        </fieldset>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : <Plug size={14} />} Connect
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Create / edit watch rule ──────────────────────────────────────────────────
function RuleModal({
  open,
  rule,
  connections,
  onClose,
  onDone,
}: {
  open: boolean;
  rule: CiCdWatchRule | null;
  connections: CiCdConnection[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast, requireDualControl } = useStore();
  const [connectionId, setConnectionId] = useState<number>(rule?.connection_id ?? connections[0]?.id ?? 0);
  const [repo, setRepo] = useState(rule?.repo_full_name ?? "");
  const [branch, setBranch] = useState(rule?.branch_pattern ?? "main");
  const [eventTypes, setEventTypes] = useState<string[]>(rule?.event_types ?? ["push", "deployment"]);
  const [scanProfile, setScanProfile] = useState(rule?.scan_profile ?? "");
  const [environment, setEnvironment] = useState(rule?.environment_filter ?? "");
  const [saving, setSaving] = useState(false);

  // Reset the form whenever the modal opens for a different rule.
  React.useEffect(() => {
    if (!open) return;
    setConnectionId(rule?.connection_id ?? connections[0]?.id ?? 0);
    setRepo(rule?.repo_full_name ?? "");
    setBranch(rule?.branch_pattern ?? "main");
    setEventTypes(rule?.event_types ?? ["push", "deployment"]);
    setScanProfile(rule?.scan_profile ?? "");
    setEnvironment(rule?.environment_filter ?? "");
  }, [open, rule, connections]);

  const toggleEvent = (e: string) =>
    setEventTypes((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));

  const submit = async () => {
    if (!repo.trim()) {
      toast("warning", "Missing details", "A repository (owner/name) is required.");
      return;
    }
    if (eventTypes.length === 0) {
      toast("warning", "Pick an event", "Select at least one event type to watch.");
      return;
    }
    if (!(await requireDualControl("Saving a watch rule requires a dual-control operate session."))) return;
    setSaving(true);
    try {
      if (rule) {
        await updateRule(rule.id, {
          branch_pattern: branch.trim() || "main",
          event_types: eventTypes,
          scan_profile: scanProfile.trim() || null,
          environment_filter: environment.trim() || null,
        });
        toast("success", "Rule updated", repo.trim());
      } else {
        await createRule({
          connection_id: connectionId,
          repo_full_name: repo.trim(),
          branch_pattern: branch.trim() || "main",
          event_types: eventTypes,
          scan_profile: scanProfile.trim() || null,
          environment_filter: environment.trim() || null,
        });
        toast("success", "Rule created", `${repo.trim()} is now watched.`);
      }
      onDone();
    } catch (err) {
      toast("error", "Save failed", err instanceof Error ? err.message : "Could not save the rule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={rule ? "Edit watch rule" : "New watch rule"} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div>
          <label className="label">Connection</label>
          <select
            className="input"
            value={connectionId}
            onChange={(e) => setConnectionId(Number(e.target.value))}
            disabled={Boolean(rule)}
          >
            {connections.map((c) => <option key={c.id} value={c.id}>{c.display_name} ({providerLabel(c.provider)})</option>)}
          </select>
          {rule && <p className="mt-1 text-[12px] text-slate-500">The connection cannot be changed on an existing rule.</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Repository (owner/name)</label>
            <input className="input" placeholder="acme-org/payments-api" value={repo} onChange={(e) => setRepo(e.target.value)} disabled={Boolean(rule)} />
          </div>
          <div>
            <label className="label">Branch pattern</label>
            <input className="input" placeholder="main or release/*" value={branch} onChange={(e) => setBranch(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Event types</label>
          <div className="flex flex-wrap gap-4 pt-1">
            {CICD_EVENT_TYPES.map((e) => (
              <label key={e} className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" className="h-3.5 w-3.5 accent-gold-400" checked={eventTypes.includes(e)} onChange={() => toggleEvent(e)} /> {e}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Scan profile (optional)</label>
            <input className="input" placeholder="deep · standard · quick" value={scanProfile} onChange={(e) => setScanProfile(e.target.value)} />
          </div>
          <div>
            <label className="label">Environment filter (optional)</label>
            <input className="input" placeholder="production" value={environment} onChange={(e) => setEnvironment(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : <Workflow size={14} />} {rule ? "Save changes" : "Create rule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
