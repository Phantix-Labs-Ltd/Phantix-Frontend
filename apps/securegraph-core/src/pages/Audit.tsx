import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bot, ChevronRight, Download, Filter, Loader2, Search, X } from "lucide-react";
import { PageHeader, Card, PageSkeleton, ErrorState } from "@sg/ui";
import { loadAuditBundle } from "@sg/data";
import { loadApplications, type ApplicationsSnapshot } from "@sg/applications";
import { useResource } from "@sg/useResource";
import { describeEndpoint, describeKnownEndpoint } from "@sg/auditExplain";
import { timeAgo, titleCase, cx } from "@sg/utils";
import { parseTimestamp, userTimeZone } from "@sg/time";
import { useStore } from "@sg/store";
import { api } from "@sg/api";
import type { AuditChange, AuditDescriptionPart, AuditEvent } from "@sg/types";
import DocLink from "@sg/components/DocLink";
import { Pagination, usePaged } from "@sg/components/Pagination";

// Each row reads like a sentence: a category, what happened to which record
// (the names in bold), who did it, when, and from where. The API words the
// sentence; older backends without it fall back to the route's description.
// Expanding a row shows the rest: application, page, request, approval.

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

/** The bar at the start of each row: what kind of change it was. */
const CHANGE_META: Record<AuditChange, { label: string; bar: string }> = {
  added: { label: "Added", bar: "bg-emerald-500" },
  changed: { label: "Changed", bar: "bg-amber-400" },
  removed: { label: "Removed", bar: "bg-rose-500" },
  access: { label: "Sign-in", bar: "bg-sky-500" },
  viewed: { label: "Viewed", bar: "bg-slate-500" },
  refused: { label: "Denied or failed", bar: "bg-red-600" },
};

/** Older rows carry no outcome; only "viewed" vs "changed" can be told then. */
function outcomeOf(e: AuditEvent): Outcome {
  if (e.outcome) return e.outcome;
  return e.details?.passive === true ? "viewed" : "changed";
}

function changeOf(e: AuditEvent): AuditChange {
  if (e.change) return e.change;
  const outcome = outcomeOf(e);
  if (outcome === "denied" || outcome === "failed") return "refused";
  if (outcome === "viewed") return "viewed";
  const method = (e.method ?? e.details?.method ?? "").toUpperCase();
  if (method === "POST") return "added";
  if (method === "DELETE") return "removed";
  return "changed";
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

/** The sentence the API wrote, or one built from the route for older backends. */
function descriptionOf(e: AuditEvent): AuditDescriptionPart[] {
  if (e.description && e.description.length > 0) return e.description;
  const record = recordOf(e);
  const label = actionOf(e).label.replace(/\.$/, "");
  return record
    ? [{ text: `${label} (` }, { text: record, bold: true }, { text: ")." }]
    : [{ text: `${label}.` }];
}

function categoryOf(e: AuditEvent): string {
  return e.event_category || titleCase((e.category || "platform").replace(/[_-]/g, " "));
}

function performedBy(e: AuditEvent): string {
  return (
    e.performed_by ??
    e.actor_email ??
    (e.details?.actor_email as string | undefined) ??
    e.initiator_name ??
    "System"
  );
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

/** "12/10/2026 23:10" in the reader's locale and time zone. */
function eventTime(iso: string): string {
  const d = parseTimestamp(iso);
  if (Number.isNaN(d.getTime())) return "Not set";
  const timeZone = userTimeZone();
  const date = d.toLocaleDateString(undefined, { timeZone, day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${date} ${time}`;
}

function Sentence({ parts }: { parts: AuditDescriptionPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.bold ? (
          <strong key={i} className="font-semibold text-slate-50">{p.text}</strong>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ),
      )}
    </>
  );
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
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [appFilter, setAppFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const categories = useMemo(() => {
    const set = new Set<string>();
    auditEvents.forEach((e) => set.add(categoryOf(e)));
    return Array.from(set).sort();
  }, [auditEvents]);

  const applications = useMemo(() => {
    const set = new Set<string>();
    auditEvents.forEach((e) => set.add(e.application ?? "platform"));
    return Array.from(set).sort();
  }, [auditEvents]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return auditEvents.filter((e) => {
      if (categoryFilter !== "all" && categoryOf(e) !== categoryFilter) return false;
      if (appFilter !== "all" && (e.application ?? "platform") !== appFilter) return false;
      if (actorFilter !== "all" && (e.actor_type ?? "user") !== actorFilter) return false;
      if (outcomeFilter !== "all") {
        const o = outcomeOf(e);
        if (outcomeFilter === "viewed" && o !== "viewed") return false;
        if (outcomeFilter === "changed" && !["succeeded", "changed"].includes(o)) return false;
        if (outcomeFilter === "refused" && !["denied", "failed"].includes(o)) return false;
      }
      if (needle) {
        const text = descriptionOf(e).map((p) => p.text).join("");
        const haystack = [text, performedBy(e), e.ip_address ?? "", categoryOf(e)].join(" ").toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [auditEvents, categoryFilter, appFilter, outcomeFilter, actorFilter, search]);
  const { pageItems, pagination } = usePaged(filtered, "core-audit", [categoryFilter, appFilter, outcomeFilter, actorFilter, search]);
  const filtering =
    categoryFilter !== "all" || appFilter !== "all" || outcomeFilter !== "all" || actorFilter !== "all" || search.trim() !== "";

  if (loading) {
    return <PageSkeleton variant="table" rows={8} cols={5} actions />;
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
        description="Who did what, to which record, when, and from where."
        actions={<>
            <DocLink docId="howto-app-27" label="Audit how-to" />
          <button className="btn-secondary" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Export CSV
          </button>
        </>}
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events, people, IPs"
                aria-label="Search the audit trail"
                className="input !w-60 !py-1.5 !pl-8 text-xs"
              />
            </div>
            <Filter size={14} className="text-slate-500" />
            <select className="input !w-auto !py-1.5 text-xs" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Event category">
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select className="input !w-auto !py-1.5 text-xs" value={appFilter} onChange={(e) => setAppFilter(e.target.value)} aria-label="Application">
              <option value="all">All applications</option>
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
              <button onClick={() => { setCategoryFilter("all"); setAppFilter("all"); setOutcomeFilter("all"); setActorFilter("all"); setSearch(""); }} className="flex items-center gap-1 rounded-lg border border-phantix-700/50 bg-phantix-950/70 px-2 py-1 text-xs text-slate-400 hover:text-slate-200">
                <X size={12} /> Clear
              </button>
            )}
            <span className="ml-auto text-[13px] text-slate-500">{filtered.length} of {auditEvents.length} events</span>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500" aria-label="Bar colours">
            {(Object.keys(CHANGE_META) as AuditChange[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={cx("h-3 w-[3px] rounded-full", CHANGE_META[k].bar)} aria-hidden />
                {CHANGE_META[k].label}
              </span>
            ))}
          </div>

          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem]">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th w-44">Event category</th>
                  <th className="th">Event description</th>
                  <th className="th">Performed by</th>
                  <th className="th">Event time</th>
                  <th className="th">Client IP address</th>
                  <th className="th w-8"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                      {filtering ? "No events match these filters." : "No activity recorded yet."}
                    </td>
                  </tr>
                )}
                {pageItems.map((e, i) => {
                  const action = actionOf(e);
                  const record = recordOf(e);
                  const am = applicationMeta(e.application);
                  const page = pageName(e.application, e.app_route);
                  const outcomeKey = outcomeOf(e);
                  const outcome = OUTCOME_META[outcomeKey];
                  const change = CHANGE_META[changeOf(e)];
                  const actorType = e.actor_type ?? (e.source === "agent" ? "agent" : "user");
                  const email = e.actor_email ?? (e.details?.actor_email as string | undefined) ?? null;
                  const expanded = open === e.id;
                  const method = e.method ?? e.details?.method;
                  // Only worth a second line when it names the page, not just the app.
                  const where = page ? `${am.label} · ${page}` : null;
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
                        <td className="td whitespace-nowrap text-[13px] text-slate-200">
                          <span className={cx("mr-2.5 inline-block h-5 w-[3px] rounded-full align-middle", change.bar)} title={change.label} aria-hidden />
                          <span className="sr-only">{change.label}: </span>
                          <span className="align-middle">{categoryOf(e)}</span>
                        </td>
                        <td className="td max-w-[34rem]">
                          <div className="text-[13px] text-slate-300">
                            <Sentence parts={descriptionOf(e)} />
                            {(outcomeKey === "denied" || outcomeKey === "failed") && (
                              <span className={cx("ml-2 inline-flex rounded-md px-1.5 py-0.5 align-middle text-[11px] font-medium", outcome.className)}>
                                {e.status_code ? `${outcome.label} (${e.status_code})` : outcome.label}
                              </span>
                            )}
                          </div>
                          {where && <div className="mt-0.5 text-[12px] text-slate-500">{where}</div>}
                        </td>
                        <td className="td whitespace-nowrap text-[13px] text-slate-300">
                          {actorType === "agent" ? (
                            <span className="inline-flex items-center gap-1.5"><Bot size={13} className="text-gold-300" />{performedBy(e)}</span>
                          ) : (
                            performedBy(e)
                          )}
                        </td>
                        <td className="td whitespace-nowrap text-[13px] text-slate-300" title={`${absoluteTime(e.created_at)} · ${timeAgo(e.created_at)}`}>
                          {eventTime(e.created_at)}
                        </td>
                        <td className="td whitespace-nowrap font-mono text-[12px] text-slate-400">{e.ip_address ?? "–"}</td>
                        <td className="td pt-3 text-slate-500">
                          <ChevronRight size={14} className={cx("transition-transform", expanded && "rotate-90")} />
                        </td>
                      </motion.tr>
                      {expanded && (
                        <tr className="border-b border-phantix-800/40 bg-phantix-950/50">
                          <td colSpan={6} className="px-5 py-4">
                            {action.detail && <p className="mb-3 max-w-3xl text-[13px] text-slate-400">{action.detail}</p>}
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                              <Fact label="Event ID" mono>{e.event_uid ?? `#${e.id}`}</Fact>
                              <Fact label="Recorded at">{absoluteTime(e.created_at)}</Fact>
                              <Fact label="Application"><span className={am.color}>{am.label}</span></Fact>
                              <Fact label="Page">{page ?? e.app_route ?? "Not recorded"}</Fact>
                              <Fact label="Record">{record ?? "None"}</Fact>
                              <Fact label="Request" mono>
                                {method || e.route || e.details?.path ? `${method ?? ""} ${e.route ?? e.details?.path ?? ""}`.trim() : "Not an API request"}
                              </Fact>
                              <Fact label="Result">{e.status_code ? `${outcome.label} (${e.status_code})` : outcome.label}</Fact>
                              <Fact label="Name">{[e.initiator_name, e.initiator_title].filter(Boolean).join(" · ") || "Not recorded"}</Fact>
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
            </div>
            <Pagination {...pagination} itemLabel="events" keyboard />
          </Card>
      </motion.div>
    </div>
  );
}
