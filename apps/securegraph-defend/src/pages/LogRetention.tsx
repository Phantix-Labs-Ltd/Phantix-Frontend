import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { Save, Search, ShieldOff, Database, ScrollText, AlertTriangle } from "lucide-react";
import {
  PageHeader,
  Card,
  StatCard,
  SeverityBadge,
  Modal,
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
import { timeAgo } from "@sg/utils";
import type { Severity } from "@sg/types";
import {
  getLogRetention,
  setLogRetention,
  listSocEvents,
  eraseSubject,
  SEVERITIES,
  type LogRetention as LogRetentionPolicy,
  type SocEvent,
} from "@sg/socOps";

interface Bundle {
  policy: LogRetentionPolicy | null;
  events: SocEvent[];
  securityDbBlocked: boolean;
  error: string | null;
}

const EMPTY: Bundle = { policy: null, events: [], securityDbBlocked: false, error: null };

async function loadRetention(): Promise<Bundle> {
  try {
    const [policy, events] = await Promise.all([getLogRetention(), listSocEvents({ limit: 500 })]);
    return { policy, events: events.items, securityDbBlocked: false, error: null };
  } catch (err) {
    if (isSecurityDbBlocked(err)) return { ...EMPTY, securityDbBlocked: true };
    return { ...EMPTY, error: err instanceof Error ? err.message : "Failed to load log retention" };
  }
}

export default function LogRetention() {
  const { toast, requireDualControl } = useStore();
  const { data, loading, error, reload, setData } = useResource(loadRetention, EMPTY, "soc-log-retention");
  const [params, setParams] = useSearchParams();
  const [eraseOpen, setEraseOpen] = useState(false);

  const policy = data.policy;
  const events = data.events;

  const q = params.get("q") ?? "";
  const severity = params.get("severity") ?? "all";
  const logType = params.get("log_type") ?? "all";
  const [searchDraft, setSearchDraft] = useState(q);
  React.useEffect(() => setSearchDraft(q), [q]);
  React.useEffect(() => {
    const t = window.setTimeout(() => { if (searchDraft !== q) update({ q: searchDraft.trim() || null }); }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const update = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      return next;
    }, { replace: true });

  const logTypes = useMemo(() => Array.from(new Set(events.map((e) => e.log_type).filter(Boolean))) as string[], [events]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((e) => {
      if (severity !== "all" && e.severity !== severity) return false;
      if (logType !== "all" && e.log_type !== logType) return false;
      if (needle && !(`${e.message ?? ""} ${e.host_pseudonym ?? ""}`.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [events, q, severity, logType]);

  const { pageItems, pagination } = usePaged(filtered, "soc-events", { q, severity, logType });

  if (loading) return <PageSkeleton variant="list" rows={6} actions />;

  if (error && !policy && !data.securityDbBlocked) {
    return <ErrorState onRetry={reload} body="We could not load log retention. Check your connection and try again. Your session stays signed in." />;
  }

  return (
    <div>
      <PageHeader
        title="Log retention"
        description="Retention windows, data residency, and the minimised event store — privacy by default."
        actions={
          <div className="flex items-center gap-2">
            <DocLink docId="howto-app-08" label="Privacy how-to" />
            <button className="btn-secondary hover:!text-severity-critical" onClick={() => setEraseOpen(true)}><ShieldOff size={15} /> Erase subject</button>
          </div>
        }
      />

      {data.securityDbBlocked && <SecurityDbBanner message={data.error} />}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Raw capture" value={policy?.raw_enabled ? "On" : "Off"} hint={policy?.raw_enabled ? `${policy.raw_ttl_days}d TTL` : "opt-in, off by default"} />
        <StatCard label="Event TTL" value={policy ? `${policy.event_ttl_days}d` : "—"} />
        <StatCard label="Residency" value={(policy?.residency_region ?? "ng").toUpperCase()} />
        <StatCard label="Events" value={events.length} hint="minimised" />
      </div>

      {policy && <PolicyForm policy={policy} onSaved={(p) => setData((d) => ({ ...d, policy: p }))} />}

      {/* Minimised event viewer */}
      <div className="mb-3 mt-6 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto flex items-center gap-2 text-sm font-semibold text-slate-200"><ScrollText size={16} /> Minimised events</h2>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input !w-60 !py-1.5 !pl-8 text-[13px]" placeholder="Search message, host…" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} aria-label="Search events" />
        </div>
        <select className="input !w-auto !py-1.5 !pr-8 text-[13px]" aria-label="Severity" value={severity} onChange={(e) => update({ severity: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">Any severity</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input !w-auto !py-1.5 !pr-8 text-[13px]" aria-label="Log type" value={logType} onChange={(e) => update({ log_type: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">Any type</option>
          {logTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {filtered.length === 0 ? (
          <Card>
            <EmptyState icon={<Database size={22} />} title={events.length === 0 ? "No events stored" : "No events match these filters"} body="Minimised events are pseudonymised — no raw log content is shown here." />
          </Card>
        ) : (
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Time</th>
                    <th className="th">Type</th>
                    <th className="th">Severity</th>
                    <th className="th">Host</th>
                    <th className="th">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((e) => (
                    <tr key={e.id} className="border-b border-phantix-800/40 hover:bg-phantix-800/35">
                      <td className="td whitespace-nowrap text-xs text-slate-500">{e.timestamp ? timeAgo(e.timestamp) : "—"}</td>
                      <td className="td">
                        <span className="rounded-md bg-phantix-800/80 px-1.5 py-0.5 text-[12px] font-medium text-slate-400">{e.log_type ?? "—"}</span>
                        {e.event_type && <span className="ml-1.5 text-[12px] text-slate-500">{e.event_type}</span>}
                      </td>
                      <td className="td">{e.severity ? <SeverityBadge severity={e.severity as Severity} /> : <span className="text-slate-600">—</span>}</td>
                      <td className="td font-mono text-xs text-slate-400">{e.host_pseudonym ?? "—"}</td>
                      <td className="td max-w-[420px] truncate text-xs text-slate-300" title={e.message ?? ""}>{e.message ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} itemLabel="events" keyboard />
          </Card>
        )}
      </motion.div>

      <EraseModal open={eraseOpen} onClose={() => setEraseOpen(false)} onDone={() => { setEraseOpen(false); reload(); }} />
    </div>
  );
}

function PolicyForm({ policy, onSaved }: { policy: LogRetentionPolicy; onSaved: (p: LogRetentionPolicy) => void }) {
  const { toast, requireDualControl } = useStore();
  const [rawEnabled, setRawEnabled] = useState(policy.raw_enabled);
  const [rawTtl, setRawTtl] = useState(String(policy.raw_ttl_days));
  const [eventTtl, setEventTtl] = useState(String(policy.event_ttl_days));
  const [region, setRegion] = useState(policy.residency_region || "ng");
  const [saving, setSaving] = useState(false);

  const dirty =
    rawEnabled !== policy.raw_enabled ||
    rawTtl !== String(policy.raw_ttl_days) ||
    eventTtl !== String(policy.event_ttl_days) ||
    region !== policy.residency_region;

  const save = async () => {
    if (!(await requireDualControl("Changing the retention policy requires a dual-control operate session."))) return;
    setSaving(true);
    try {
      const updated = await setLogRetention({
        raw_enabled: rawEnabled,
        raw_ttl_days: Number(rawTtl) || policy.raw_ttl_days,
        event_ttl_days: Number(eventTtl) || policy.event_ttl_days,
        residency_region: region.trim() || "ng",
      });
      onSaved(updated);
      toast("success", "Policy saved", "Retention and residency updated.");
    } catch (err) {
      toast("error", "Save failed", err instanceof Error ? err.message : "Could not save the policy.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Retention policy</h2>
        {policy.updated_at && <span className="text-[12px] text-slate-500">Updated {timeAgo(policy.updated_at)}{policy.updated_by ? ` by ${policy.updated_by}` : ""}</span>}
      </div>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-phantix-700/50 bg-phantix-950/50 p-3.5">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-gold-400" checked={rawEnabled} onChange={(e) => setRawEnabled(e.target.checked)} />
          <span>
            <span className="block text-sm font-medium text-slate-200">Store raw log lines</span>
            <span className="block text-[12px] text-slate-500">Off by default. When on, original lines are written to the region's object store and kept for the raw TTL. Minimised events are always stored regardless.</span>
          </span>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Raw TTL (days)</label>
            <input className="input" inputMode="numeric" value={rawTtl} onChange={(e) => setRawTtl(e.target.value.replace(/\D/g, ""))} disabled={!rawEnabled} />
          </div>
          <div>
            <label className="label">Event TTL (days)</label>
            <input className="input" inputMode="numeric" value={eventTtl} onChange={(e) => setEventTtl(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <label className="label">Data residency</label>
            <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
              {["ng", "eu", "us", "gb", "za", "ke"].map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
            </select>
          </div>
        </div>

        {region !== "ng" && (
          <p className="flex items-center gap-1.5 text-[12px] text-amber-300"><AlertTriangle size={13} /> Default residency is Nigeria (NG). Changing it moves where events and raw blobs are stored.</p>
        )}

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving || !dirty}>{saving ? <Spinner className="h-4 w-4" /> : <Save size={14} />} Save policy</button>
        </div>
      </form>
    </Card>
  );
}

function EraseModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast, requireDualControl } = useStore();
  const [mode, setMode] = useState<"pseudonym" | "subject">("pseudonym");
  const [pseudonym, setPseudonym] = useState("");
  const [subject, setSubject] = useState("");
  const [pseudonymKey, setPseudonymKey] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    setMode("pseudonym"); setPseudonym(""); setSubject(""); setPseudonymKey(""); setConfirm(false);
  }, [open]);

  const run = async () => {
    if (mode === "pseudonym" && !pseudonym.trim()) { toast("warning", "Missing pseudonym", "Enter the subject pseudonym to erase."); return; }
    if (mode === "subject" && (!subject.trim() || !pseudonymKey.trim())) { toast("warning", "Missing details", "Enter the subject and the pseudonym key."); return; }
    if (!confirm) { toast("warning", "Confirmation required", "Tick the box — erasure is irreversible."); return; }
    if (!(await requireDualControl("Erasing a data subject requires a dual-control operate session."))) return;
    setRunning(true);
    try {
      const res = await eraseSubject(
        mode === "pseudonym"
          ? { pseudonym: pseudonym.trim(), confirm: true }
          : { subject: subject.trim(), pseudonym_key: pseudonymKey.trim(), confirm: true },
      );
      toast("success", "Subject erased", `${res.events_erased} event(s) and ${res.objects_erased} raw object(s) deleted.`);
      onDone();
    } catch (err) {
      toast("error", "Erase failed", err instanceof Error ? err.message : "Could not erase the subject.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Erase a data subject">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <div className="flex items-start gap-2 rounded-xl border border-severity-critical/30 bg-severity-critical/8 p-3 text-sm text-slate-200">
          <AlertTriangle size={16} className="mt-0.5 text-severity-critical" />
          <span>This permanently deletes the subject's minimised events <strong>and</strong> any raw blobs. It cannot be undone — it is the GDPR Art. 17 / NDPA erasure control.</span>
        </div>

        <div className="flex gap-2">
          <button type="button" className={mode === "pseudonym" ? "btn-primary !py-1.5" : "btn-secondary !py-1.5"} onClick={() => setMode("pseudonym")}>By pseudonym</button>
          <button type="button" className={mode === "subject" ? "btn-primary !py-1.5" : "btn-secondary !py-1.5"} onClick={() => setMode("subject")}>By subject + key</button>
        </div>

        {mode === "pseudonym" ? (
          <div>
            <label className="label">Subject pseudonym</label>
            <input className="input font-mono" placeholder="usr_7f3a…" value={pseudonym} onChange={(e) => setPseudonym(e.target.value)} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Subject</label>
              <input className="input" placeholder="user@customer.example" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="label">Pseudonym key</label>
              <input className="input" type="password" value={pseudonymKey} onChange={(e) => setPseudonymKey(e.target.value)} />
            </div>
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" className="h-4 w-4 accent-severity-critical" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          I understand this is irreversible.
        </label>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary !bg-severity-critical/90 hover:!bg-severity-critical" disabled={running || !confirm}>{running ? <Spinner className="h-4 w-4" /> : <ShieldOff size={14} />} Erase subject</button>
        </div>
      </form>
    </Modal>
  );
}
