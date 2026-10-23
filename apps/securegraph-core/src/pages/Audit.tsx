import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bot, ChevronRight, Cog, Download, Filter, Loader2, X } from "lucide-react";
import { PageHeader, Card, PageSkeleton, ErrorState } from "@sg/ui";
import { loadAuditBundle } from "@sg/data";
import { loadApplications, type ApplicationsSnapshot } from "@sg/applications";
import { useResource } from "@sg/useResource";
import { describeEndpoint, describeKnownEndpoint } from "@sg/auditExplain";
import { timeAgo, titleCase, cx } from "@sg/utils";
import { parseTimestamp, userTimeZone } from "@sg/time";
import { useStore } from "@sg/store";
import { api } from "@sg/api";
import type { AuditEvent } from "@sg/types";
import DocLink from "@sg/components/DocLink";
import { Pagination, usePaged } from "@sg/components/Pagination";

// An audit row has to bind four things: who acted, what they did (and to which
// record), where in the product they were, and when — plus whether it worked.
// The backend records each of those per event; this page shows them as such
// rather than as a generic "Platform action".

const APPLICATION_META: Record<string, { label: string; color: string }> = {
  core: { label: "Core", color: "text-gold-300" },
  attack: { label: "Attack", color: "text-severity-critical" },
  defend: { label: "Defend", color: "text-severity-low" },
  code: { label: "Code", color: "text-severity-info" },
};

function applicationMeta(key?: string | null) {
  if (!key) return { label: "Platform", color: "text-slate-400" };
  return APPLICATION_META[key] ?? { label: titleCase(key), color: "text-slate-400" };
}

type Outcome = "viewed" | "succeeded" | "denied" | "failed" | "changed";

const OUTCOME_META: Record<Outcome, { label: string; className: string }> = {
  viewed: { label: "Viewed", className: "bg-blue-400/10 text-blue-300" },
  succeeded: { label: "Succeeded", className: "bg-emerald-400/10 text-emerald-300" },
  changed: { label: "Changed", className: "bg-emerald-400/10 text-emerald-300" },
  denied: { label: "Denied", className: "bg-amber-400/10 text-amber-300" },
  failed: { label: "Failed", className: "bg-red-400/10 text-red-300" },
};

/** Older rows carry no outcome; only "viewed" vs "changed" can be told then. */
function outcomeOf(e: AuditEvent): Outcome {
  if (e.outcome) return e.outcome;
  return e.details?.passive === true ? "viewed" : "changed";
}

function isRawRequestLabel(label: string): boolean {
  return /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//.test(label);
}

/** What happened, in words, and an optional longer explanation. */
function actionOf(e: AuditEvent): { label: string; detail: string | null } {
  const path = e.details?.path;
  const method = e.method ?? e.details?.method ?? "GET";
  if (!path) {
    // Activity rows (agent steps, approvals): written with a real label and a
    // summary by the code that recorded them. Never feed the label to the
    // endpoint lookup as if it were a path.
    const label = e.action_label || "Activity";
    const detail = e.summary && e.summary !== label ? e.summary : null;
    return { label, detail };
  }
  const known = describeKnownEndpoint(method, path);
  if (e.action_label && !isRawRequestLabel(e.action_label)) {
    // Newer rows: the route's own summary names the operation.
    return { label: e.action_label, detail: known?.detail ?? null };
  }
  const desc = known ?? describeEndpoint(method, path);
  return { label: desc?.label ?? "Activity", detail: desc?.detail ?? null };
}

function recordOf(e: AuditEvent): string | null {
  if (!e.resource_type || !e.resource_id) return null;
  return `${titleCase(e.resource_type.replace(/_/g, " "))} #${e.resource_id}`;
}

/** Page names per application, from the launcher snapshot (path → "Group › Label"). */
function usePageNames(): (app: string | null | undefined, route: string | null | undefined) => string | null {
  const { data } = useResource<ApplicationsSnapshot | null>(loadApplications, null, "applications");
  return useMemo(() => {
    const byApp = new Map<string, { path: string; name: string }[]>();
    for (const card of data?.applications ?? []) {
      const pages = (card.surfaces ?? [])
        .map((s) => ({ path: s.path, name: s.group && s.group !== s.label ? `${s.group} › ${s.label}` : s.label }))
        .sort((a, b) => b.path.length - a.path.length);
      byApp.set(card.key, pages);
    }
    return (app, route) => {
      if (!route) return null;
      const pages = byApp.get(app ?? "core") ?? [];
      const hit = pages.find((p) => (p.path === "/" ? route === "/" : route === p.path || route.startsWith(`${p.path}/`)));
      return hit?.name ?? null;
    };
  }, [data]);
}

function absoluteTime(iso: string): string {
  const d = parseTimestamp(iso);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleString(undefined, {
    timeZone: userTimeZone(),
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Fact({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className={cx("mt-0.5 break-words text-[13px] text-slate-200", mono && "font-mono text-[12px]")}>{children}</dd>
    </div>
  );
}

export default function Audit() {
  const { toast } = useStore();
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const pageName = usePageNames();

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await api.download("/audit/export?format=csv");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `phantix-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("success", "Export ready", "Audit CSV downloaded");
    } catch (err) {
      toast("error", "Export failed", err instanceof Error ? err.message : "Could not download the audit trail");
    } finally {
      setExporting(false);
    }
  };
  const { data, loading, error, reload } = useResource(loadAuditBundle, { events: [] }, "audit");
  const auditEvents = data.events as AuditEvent[];
  const [appFilter, setAppFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("all");

  const applications = useMemo(() => {
    const set = new Set<string>();
    auditEvents.forEach((e) => set.add(e.application ?? "platform"));
    return Array.from(set).sort();
  }, [auditEvents]);

  const filtered = useMemo(() => {
    return auditEvents.filter((e) => {
      if (appFilter !== "all" && (e.application ?? "platform") !== appFilter) return false;
      if (actorFilter !== "all" && (e.actor_type ?? "user") !== actorFilter) return false;
      if (outcomeFilter !== "all") {
        const o = outcomeOf(e);
        if (outcomeFilter === "viewed" && o !== "viewed") return false;
        if (outcomeFilter === "changed" && !["succeeded", "changed"].includes(o)) return false;
        if (outcomeFilter === "refused" && !["denied", "failed"].includes(o)) return false;
      }
      return true;
    });
  }, [auditEvents, appFilter, outcomeFilter, actorFilter]);
  const { pageItems, pagination } = usePaged(filtered, "core-audit", [appFilter, outcomeFilter, actorFilter]);
  const filtering = appFilter !== "all" || outcomeFilter !== "all" || actorFilter !== "all";

  if (loading) {
    return <PageSkeleton variant="table" rows={8} cols={6} actions />;
  }

  if (error && data.events.length === 0) {
    return (
      <ErrorState
        onRetry={reload}
        body="We could not load the audit trail. Check your connection and try again. Your session stays signed in."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="Who did what, to which record, where in the product, and when."
        actions={<>
            <DocLink docId="howto-app-27" label="Audit how-to" />
          <button className="btn-secondary" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Export CSV
          </button>
        </>}
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Filter size={14} className="text-slate-500" />
            <select className="input !w-auto !py-1.5 text-xs" value={appFilter} onChange={(e) => setAppFilter(e.target.value)} aria-label="Application">
              <option value="all">All applications ({auditEvents.length})</option>
              {applications.map((key) => (
                <option key={key} value={key}>{applicationMeta(key === "platform" ? null : key).label}</option>
              ))}
            </select>
            <select className="input !w-auto !py-1.5 text-xs" value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} aria-label="Actor">
              <option value="all">Everyone</option>
              <option value="user">People</option>
              <option value="agent">Agent</option>
              <option value="system">System</option>
            </select>
            <select className="input !w-auto !py-1.5 text-xs" value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)} aria-label="Outcome">
              <option value="all">All outcomes</option>
              <option value="viewed">Viewed</option>
              <option value="changed">Changed</option>
              <option value="refused">Denied or failed</option>
            </select>
            {filtering && (
              <button onClick={() => { setAppFilter("all"); setOutcomeFilter("all"); setActorFilter("all"); }} className="flex items-center gap-1 rounded-lg border border-phantix-700/50 bg-phantix-950/70 px-2 py-1 text-xs text-slate-400 hover:text-slate-200">
                <X size={12} /> Clear
              </button>
            )}
            <span className="ml-auto text-[13px] text-slate-600">{filtered.length} events</span>
          </div>

          <Card className="!p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th w-8" />
                  <th className="th">When</th>
                  <th className="th">Who</th>
                  <th className="th">Action</th>
                  <th className="th">Where</th>
                  <th className="th">Outcome</th>
                  <th className="th">IP</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((e, i) => {
                  const action = actionOf(e);
                  const record = recordOf(e);
                  const am = applicationMeta(e.application);
                  const page = pageName(e.application, e.app_route);
                  const outcome = OUTCOME_META[outcomeOf(e)];
                  const actorType = e.actor_type ?? (e.source === "agent" ? "agent" : "user");
                  const email = e.actor_email ?? (e.details?.actor_email as string | undefined) ?? null;
                  const expanded = open === e.id;
                  const method = e.method ?? e.details?.method;
                  return (
                    <React.Fragment key={e.id}>
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i, 12) * 0.02 }}
                        onClick={() => setOpen(expanded ? null : e.id)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            setOpen(expanded ? null : e.id);
                          }
                        }}
                        tabIndex={0}
                        aria-expanded={expanded}
                        className="cursor-pointer border-b border-phantix-800/40 align-top hover:bg-phantix-800/35"
                      >
                        <td className="td pt-3 text-slate-500">
                          <ChevronRight size={14} className={cx("transition-transform", expanded && "rotate-90")} />
                        </td>
                        <td className="td whitespace-nowrap">
                          <div className="text-[13px] text-slate-200">{absoluteTime(e.created_at)}</div>
                          <div className="text-[12px] text-slate-500">{timeAgo(e.created_at)}</div>
                        </td>
                        <td className="td">
                          <div className="flex items-start gap-2">
                            <span className={cx(
                              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] font-bold",
                              actorType === "agent" ? "bg-gold-400/15 text-gold-300" : "bg-phantix-700/60 text-phantix-200",
                            )}>
                              {actorType === "agent" ? <Bot size={13} /> : actorType === "system" ? <Cog size={13} /> : (e.initiator_name ?? "?").slice(0, 1)}
                            </span>
                            <div className="min-w-0">
                              <div className="whitespace-nowrap text-[13px] font-medium text-slate-100">{e.initiator_name ?? "Not recorded"}</div>
                              <div className="truncate text-[12px] text-slate-500">
                                {actorType === "agent"
                                  ? e.session_id ? `Agent · session #${e.session_id}` : "Agent"
                                  : [e.initiator_title, email].filter(Boolean).join(" · ") || "Role not recorded"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="td max-w-[28rem]">
                          <div className="text-[13px] font-medium text-slate-100">{action.label}</div>
                          {(record || e.authorizer_name) && (
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-slate-400">
                              {record && <span className="rounded bg-phantix-800/70 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">{record}</span>}
                              {e.authorizer_name && <span>Approved by {e.authorizer_name}{e.authorizer_title ? ` (${e.authorizer_title})` : ""}</span>}
                            </div>
                          )}
                        </td>
                        <td className="td">
                          <div className={cx("text-[13px] font-medium", am.color)}>{am.label}</div>
                          <div className="text-[12px] text-slate-500">
                            {page ?? (e.app_route ? <span className="font-mono">{e.app_route}</span> : actorType === "agent" ? "Agent session" : "Page not recorded")}
                          </div>
                        </td>
                        <td className="td">
                          <span className={cx("inline-flex rounded-md px-1.5 py-0.5 text-[12px] font-medium", outcome.className)}>{outcome.label}</span>
                        </td>
                        <td className="td font-mono text-[12px] text-slate-500">{e.ip_address ?? "Not recorded"}</td>
                      </motion.tr>
                      {expanded && (
                        <tr className="border-b border-phantix-800/40 bg-phantix-950/50">
                          <td />
                          <td colSpan={6} className="px-3 py-4">
                            {action.detail && <p className="mb-3 max-w-3xl text-[13px] text-slate-400">{action.detail}</p>}
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                              <Fact label="Event ID" mono>{e.event_uid ?? `#${e.id}`}</Fact>
                              <Fact label="Recorded at">{absoluteTime(e.created_at)}</Fact>
                              <Fact label="Page" mono>{e.app_route ?? "Not recorded"}</Fact>
                              <Fact label="Record">{record ?? "None"}</Fact>
                              <Fact label="Request" mono>
                                {method || e.route || e.details?.path ? `${method ?? ""} ${e.route ?? e.details?.path ?? ""}`.trim() : "Not an API request"}
                              </Fact>
                              <Fact label="Result">{e.status_code ? `${outcome.label} (${e.status_code})` : outcome.label}</Fact>
                              <Fact label="Approved by">{e.authorizer_name ? `${e.authorizer_name}${e.authorizer_title ? ` (${e.authorizer_title})` : ""}` : "No approval required"}</Fact>
                              <Fact label="Approval mode">{typeof e.details?.approval_mode === "string" ? titleCase(e.details.approval_mode) : "Not recorded"}</Fact>
                              <Fact label="Email">{email ?? "Not recorded"}</Fact>
                              <Fact label="Agent session">{e.session_id ? `#${e.session_id}` : "None"}</Fact>
                              <Fact label="Correlation ID" mono>{e.correlation_id ?? (e.details?.correlation_id as string | undefined) ?? "Not recorded"}</Fact>
                              <Fact label="Source">{titleCase((e.source || "api").replace(/_/g, " "))}</Fact>
                            </dl>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            <Pagination {...pagination} itemLabel="events" keyboard />
          </Card>
      </motion.div>
    </div>
  );
}
