import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, Braces, CheckCircle2, Copy, FlaskConical, KeyRound, Loader2, Plus, RefreshCw,
  Search, Settings2, ShieldAlert, Upload, XCircle,
} from "lucide-react";
import { Card, EmptyState, ErrorState, Modal, PageHeader, PageSkeleton } from "@sg/ui";
import { ApiError, isPendingApproval, publicErrorMessage } from "@sg/api";
import { scanConsentRequired, type ScanConsentDocument } from "@sg/data";
import ScanConsentModal from "@sg/components/ScanConsentModal";
import { Toggle } from "@sg/components/NotificationPreferences";
import { useResource } from "@sg/useResource";
import { useStore } from "@sg/store";
import { cx, timeAgo } from "@sg/utils";
import {
  addApiSpec, createHookToken, getApiSpec, listApiSpecs, reindexApiSpec, revokeHookToken, testEndpoints,
  updateApiSpec, type ApiEndpoint, type ApiSpec, type EndpointState, type ReindexEntry,
} from "@sg/apiSpecs";

/*
 * API endpoints: an inventory of each API's endpoints from its OpenAPI spec.
 *
 * Every API is re-indexed weekly (and on its own interval, or by CI after a
 * deploy, when set up). Endpoints a re-index finds new or changed stay flagged
 * until they are tested, and a test covers only the endpoints chosen, so a
 * deploy to staging can be checked without re-testing the whole API.
 */

const METHOD_TONE: Record<string, string> = {
  GET: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  POST: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  PUT: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  PATCH: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  DELETE: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
};

const STATE_LABEL: Record<EndpointState, string> = {
  new: "New",
  changed: "Changed",
  untested: "Not tested",
  tested: "Tested",
  removed: "Removed",
};

const STATE_TONE: Record<EndpointState, string> = {
  new: "border-gold-400/40 bg-gold-400/10 text-gold-300",
  changed: "border-violet-400/40 bg-violet-400/10 text-violet-300",
  untested: "border-phantix-600 bg-phantix-800 text-slate-400",
  tested: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  removed: "border-phantix-700 bg-transparent text-slate-500 line-through",
};

const TRIGGER_LABEL: Record<ReindexEntry["trigger"], string> = {
  added: "Added",
  manual: "Re-indexed",
  upload: "New spec uploaded",
  schedule: "Interval re-index",
  ci: "CI after deploy",
  weekly: "Weekly check",
};

const INTERVALS = [
  { value: 15, label: "Every 15 minutes" },
  { value: 60, label: "Every hour" },
  { value: 360, label: "Every 6 hours" },
  { value: 1440, label: "Every day" },
];

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={cx("inline-flex w-[64px] shrink-0 justify-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold", METHOD_TONE[method] ?? "border-phantix-600 text-slate-300")}>
      {method}
    </span>
  );
}

function StateChip({ state }: { state: EndpointState }) {
  return <span className={cx("chip whitespace-nowrap", STATE_TONE[state])}>{STATE_LABEL[state]}</span>;
}

function TestResult({ ep }: { ep: ApiEndpoint }) {
  const t = ep.last_test;
  if (!t) return <span className="text-slate-500">Not tested</span>;
  if (t.status === "queued" || t.status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-300">
        <Loader2 size={13} className="animate-spin" /> {t.status === "queued" ? "Queued" : "Testing"}
      </span>
    );
  }
  if (t.status === "error") {
    return <span className="inline-flex items-center gap-1.5 text-amber-300" title={t.error}><AlertTriangle size={13} /> Could not run</span>;
  }
  if (t.status === "failed") {
    return (
      <Link to="/tracker" className="inline-flex items-center gap-1.5 text-severity-high hover:underline">
        <XCircle size={13} /> {t.failures} issue{t.failures === 1 ? "" : "s"}
      </Link>
    );
  }
  return <span className="inline-flex items-center gap-1.5 text-emerald-400"><CheckCircle2 size={13} /> Passed</span>;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// ── Add an API ───────────────────────────────────────────────────────────────

function AddApiModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (api: ApiSpec) => void }) {
  const { toast } = useStore();
  const [source, setSource] = useState<"url" | "upload">("url");
  const [baseUrl, setBaseUrl] = useState("");
  const [specUrl, setSpecUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState("staging");
  const [authName, setAuthName] = useState("");
  const [authValue, setAuthValue] = useState("");
  const [specUsesAuth, setSpecUsesAuth] = useState(false);
  const [faster, setFaster] = useState(false);
  const [interval, setInterval] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const api = await addApiSpec({
        base_url: baseUrl,
        name,
        spec_url: source === "url" ? specUrl : undefined,
        spec_file: source === "upload" ? file : null,
        environment,
        auto_reindex: source === "url" && faster,
        interval_minutes: interval,
        auth_header_name: authName,
        auth_header_value: authValue,
        spec_uses_auth: specUsesAuth,
      });
      toast("success", "API added", `${api.counts.total} endpoints indexed.`);
      onAdded(api);
    } catch (err) {
      setError(publicErrorMessage(err, "Could not add this API."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add an API" wide>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div>
          <label className="label" htmlFor="api-base">Base URL to test</label>
          <input id="api-base" className="input font-mono" required value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://staging-api.example.com" />
          <p className="mt-1 text-[12px] text-slate-500">Tests are sent here. The host must be one your organization has verified.</p>
        </div>

        <div>
          <p className="label">OpenAPI or Swagger spec</p>
          <div className="mb-2 inline-flex rounded-lg border border-phantix-700 p-0.5" role="tablist">
            {(["url", "upload"] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={source === s} onClick={() => setSource(s)}
                className={cx("rounded-md px-3 py-1.5 text-xs font-semibold", source === s ? "bg-gold-400/15 text-gold-300" : "text-slate-400 hover:text-slate-200")}>
                {s === "url" ? "From a URL" : "Upload a file"}
              </button>
            ))}
          </div>
          {source === "url" ? (
            <input className="input font-mono" required value={specUrl} onChange={(e) => setSpecUrl(e.target.value)} placeholder="https://staging-api.example.com/openapi.json" aria-label="Spec URL" />
          ) : (
            <input type="file" className="input !py-2" required accept=".json,.yaml,.yml,application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Spec file" />
          )}
          <p className="mt-1 text-[12px] text-slate-500">JSON or YAML, up to 5 MB. A URL can be re-indexed automatically; an uploaded file is updated by uploading the next version.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="api-name">Name (optional)</label>
            <input id="api-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Taken from the spec" />
          </div>
          <div>
            <label className="label" htmlFor="api-env">Environment</label>
            <select id="api-env" className="input" value={environment} onChange={(e) => setEnvironment(e.target.value)}>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
              <option value="production">Production</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <details className="rounded-lg border border-phantix-700/60 px-3 py-2">
          <summary className="cursor-pointer text-sm text-slate-300">Authentication for tests (optional)</summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
            <input className="input" value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Authorization" aria-label="Header name" />
            <input className="input font-mono" type="password" autoComplete="off" value={authValue} onChange={(e) => setAuthValue(e.target.value)} placeholder="Bearer eyJ…" aria-label="Header value" />
          </div>
          <p className="mt-1.5 text-[12px] text-slate-500">Sent with every test request so authenticated endpoints can be reached. Stored encrypted and never shown again. Use a test account, not a real user.</p>
          {source === "url" && (
            <label className="mt-2 flex items-center gap-2 text-[13px] text-slate-300">
              <input type="checkbox" checked={specUsesAuth} onChange={(e) => setSpecUsesAuth(e.target.checked)} /> Also send it when fetching the spec
            </label>
          )}
        </details>

        {source === "url" && (
          <div className="flex items-start justify-between gap-4 rounded-lg border border-phantix-700/60 px-3 py-3">
            <div>
              <p className="text-sm text-slate-200">Re-index more often than weekly</p>
              <p className="text-[12px] text-slate-500">Every API is checked for new endpoints every Monday. Turn this on to check more often.</p>
              {faster && (
                <select className="input mt-2 !w-auto" value={interval} onChange={(e) => setInterval(Number(e.target.value))} aria-label="Re-index interval">
                  {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              )}
            </div>
            <Toggle checked={faster} onChange={setFaster} label="Re-index more often than weekly" />
          </div>
        )}

        {error && <p className="rounded-lg border border-severity-critical/30 bg-severity-critical/10 px-3 py-2 text-[13px] text-severity-critical">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary inline-flex items-center gap-1.5" disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add and index
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── List ─────────────────────────────────────────────────────────────────────

function ApiList() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useResource(listApiSpecs, [] as ApiSpec[], "api-specs");
  const [adding, setAdding] = useState(false);

  if (loading && !data.length) return <PageSkeleton />;
  if (error && !data.length) return <ErrorState onRetry={reload} body="We couldn't load your APIs. Try again." />;

  return (
    <div>
      <PageHeader
        title="API endpoints"
        description="Add an API from its OpenAPI spec. Every Monday each API is re-indexed and new or changed endpoints are flagged, so you can test only what changed."
        actions={<button className="btn-primary inline-flex items-center gap-1.5" onClick={() => setAdding(true)}><Plus size={14} /> Add API</button>}
      />
      {data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Braces size={22} />}
            title="No APIs yet"
            body="Add an API with its OpenAPI or Swagger spec URL, or upload the spec. The weekly check also adds specs it finds on your verified hosts."
            action={<button className="btn-primary" onClick={() => setAdding(true)}>Add API</button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.map((a) => (
            <button key={a.id} type="button" onClick={() => navigate(`/api-endpoints/${a.id}`)} className="card min-w-0 p-4 text-left transition-colors hover:border-phantix-600">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{a.name}</p>
                  <p className="mt-0.5 font-mono text-[12px] text-slate-400 [overflow-wrap:anywhere]">{a.base_url}</p>
                </div>
                {a.environment && <span className="chip shrink-0 capitalize">{a.environment}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
                <span className="chip">{a.counts.total} endpoints</span>
                {a.counts.new > 0 && <span className={cx("chip", STATE_TONE.new)}>{a.counts.new} new</span>}
                {a.counts.changed > 0 && <span className={cx("chip", STATE_TONE.changed)}>{a.counts.changed} changed</span>}
                {a.counts.failing > 0 && <span className="chip border-severity-high/30 bg-severity-high/10 text-severity-high">{a.counts.failing} with issues</span>}
              </div>
              <p className="mt-3 text-[12px] text-slate-500">
                {a.last_error ? <span className="text-amber-300">Last re-index failed {timeAgo(a.last_error.at)}</span> : <>Indexed {a.indexed_at ? timeAgo(a.indexed_at) : "never"}</>}
                {" · "}{a.spec_source === "url" ? (a.auto_reindex ? `re-indexed every ${a.interval_minutes} min and weekly` : "re-indexed weekly") : "uploaded spec"}
                {a.hook_enabled && " · CI connected"}
              </p>
            </button>
          ))}
        </div>
      )}
      <AddApiModal open={adding} onClose={() => setAdding(false)} onAdded={(api) => { setAdding(false); void reload(); navigate(`/api-endpoints/${api.id}`); }} />
    </div>
  );
}

// ── Detail ───────────────────────────────────────────────────────────────────

type Filter = "attention" | "new" | "changed" | "failing" | "untested" | "removed" | "all";

function matches(ep: ApiEndpoint, f: Filter): boolean {
  switch (f) {
    case "attention": return ep.state === "new" || ep.state === "changed";
    case "failing": return ep.last_test?.status === "failed" && ep.state !== "removed";
    case "all": return ep.state !== "removed";
    default: return ep.state === f;
  }
}

function TestModal({ api, endpoints, onClose, onStarted }: { api: ApiSpec; endpoints: ApiEndpoint[]; onClose: () => void; onStarted: () => void }) {
  const { toast } = useStore();
  const writes = endpoints.filter((e) => e.writes);
  const [allowWrites, setAllowWrites] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState<{ documents: ScanConsentDocument[]; missing: string[] } | null>(null);
  const production = (api.environment || "").toLowerCase() === "production";

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await testEndpoints(api.id, endpoints.map((e) => ({ method: e.method, path: e.path })), allowWrites);
      if (isPendingApproval(res)) {
        toast("info", "Sent for approval", "The test runs once an authorizer approves it.");
      } else {
        toast("success", `Testing ${endpoints.length} endpoint${endpoints.length === 1 ? "" : "s"}`, "Results appear here, and any issues go to the Tracker.");
      }
      onStarted();
    } catch (err) {
      const gate = scanConsentRequired(err);
      if (gate) { setConsent(gate); return; }
      const detail = err instanceof ApiError ? (err.detail as { code?: string; message?: string; verify_path?: string } | null) : null;
      setError(
        detail && typeof detail === "object" && detail.code === "target_unowned"
          ? `${hostOf(api.base_url)} is not verified for your organization. Verify it in Targets, then test again.`
          : publicErrorMessage(err, "Could not start the test."),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal open onClose={onClose} title={`Test ${endpoints.length} endpoint${endpoints.length === 1 ? "" : "s"}`} wide>
        <div className="space-y-4">
          <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-phantix-700/60 p-3">
            {endpoints.map((e) => (
              <li key={e.key} className="flex min-w-0 items-start gap-2 text-[13px]">
                <MethodBadge method={e.method} />
                <span className="min-w-0 font-mono text-slate-200 [overflow-wrap:anywhere]">{e.path}</span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] leading-6 text-slate-400">
            Each endpoint gets about 30 generated requests, valid and deliberately invalid, sent to{" "}
            <span className="font-mono text-slate-300 [overflow-wrap:anywhere]">{api.base_url}</span> at no more than 10 a second.
            They check for server errors, responses that break the spec, input that should be refused, and authentication that is not enforced.
            Only these endpoints are sent requests, and only with their documented methods.
          </p>
          {writes.length > 0 && (
            <div className={cx("rounded-lg border px-3 py-3 text-[13px]", production ? "border-severity-critical/40 bg-severity-critical/10" : "border-amber-400/30 bg-amber-400/5")}>
              <p className="flex items-center gap-2 font-medium text-amber-200">
                <ShieldAlert size={15} /> {writes.length} of these endpoint{writes.length === 1 ? "" : "s"} change data
              </p>
              <p className="mt-1 text-slate-300">
                Testing {writes.map((w) => w.method).filter((m, i, a) => a.indexOf(m) === i).join(", ")} sends generated data, which can create, change or delete records{production ? " in production" : ""}.
                It also checks that undocumented methods are refused.
              </p>
              <label className="mt-2 flex items-start gap-2 text-slate-200">
                <input type="checkbox" className="mt-1" checked={allowWrites} onChange={(e) => setAllowWrites(e.target.checked)} />
                <span>Test requests may create, change or delete data on {hostOf(api.base_url)}.</span>
              </label>
            </div>
          )}
          {error && <p className="rounded-lg border border-severity-critical/30 bg-severity-critical/10 px-3 py-2 text-[13px] text-severity-critical">{error}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn-primary inline-flex items-center gap-1.5" disabled={busy || (writes.length > 0 && !allowWrites)} onClick={() => void run()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />} Start test
            </button>
          </div>
        </div>
      </Modal>
      <ScanConsentModal
        open={!!consent}
        documents={consent?.documents ?? []}
        missing={consent?.missing ?? []}
        onClose={() => setConsent(null)}
        onAccepted={() => { setConsent(null); toast("info", "Consents accepted", "Start the test again to run it."); }}
      />
    </>
  );
}

function SettingsModal({ api, onClose, onSaved }: { api: ApiSpec; onClose: () => void; onSaved: (api: ApiSpec) => void }) {
  const { toast } = useStore();
  const [specUrl, setSpecUrl] = useState(api.spec_url ?? "");
  const [faster, setFaster] = useState(api.auto_reindex);
  const [interval, setInterval] = useState(api.interval_minutes ?? 60);
  const [authName, setAuthName] = useState(api.auth_header?.name ?? "");
  const [authValue, setAuthValue] = useState("");
  const [specUsesAuth, setSpecUsesAuth] = useState(api.spec_uses_auth);
  const [hook, setHook] = useState<{ token: string; header: string; path: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateApiSpec(api.id, {
        spec_url: specUrl,
        auto_reindex: faster,
        interval_minutes: interval,
        spec_uses_auth: specUsesAuth,
        ...(authValue ? { auth_header_name: authName || "Authorization", auth_header_value: authValue } : {}),
      });
      toast("success", "Settings saved");
      onSaved(updated);
    } catch (err) {
      setError(publicErrorMessage(err, "Could not save the settings."));
    } finally {
      setBusy(false);
    }
  };

  const removeAuth = async () => {
    setBusy(true);
    try {
      onSaved(await updateApiSpec(api.id, { clear_auth_header: true }));
      toast("success", "Auth header removed");
    } catch (err) {
      setError(publicErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const newToken = async () => {
    setBusy(true);
    try {
      setHook(await createHookToken(api.id));
    } catch (err) {
      setError(publicErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await revokeHookToken(api.id);
      setHook(null);
      onSaved({ ...api, hook_enabled: false });
      toast("success", "CI token revoked");
    } catch (err) {
      setError(publicErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const curl = hook ? `curl -fsS -X POST "${window.location.origin}${hook.path}" -H "${hook.header}: ${hook.token}"` : "";

  return (
    <Modal open onClose={onClose} title={`${api.name} settings`} wide>
      <div className="space-y-5">
        <div>
          <label className="label" htmlFor="set-spec">Spec URL</label>
          <input id="set-spec" className="input font-mono" value={specUrl} onChange={(e) => setSpecUrl(e.target.value)} placeholder="Leave empty if you upload the spec" />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-200">Re-index more often than weekly</p>
            <p className="text-[12px] text-slate-500">Needs a spec URL. The weekly check runs either way.</p>
            {faster && (
              <select className="input mt-2 !w-auto" value={interval} onChange={(e) => setInterval(Number(e.target.value))} aria-label="Re-index interval">
                {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            )}
          </div>
          <Toggle checked={faster} onChange={setFaster} label="Re-index more often than weekly" disabled={!specUrl} />
        </div>

        <div className="border-t border-phantix-700/60 pt-4">
          <p className="flex items-center gap-2 text-sm font-medium text-white"><KeyRound size={14} /> Authentication for tests</p>
          <p className="mt-1 text-[12px] text-slate-500">
            {api.auth_header ? <>A <span className="font-mono">{api.auth_header.name}</span> header is set. Enter a new value to replace it.</> : "No header is set, so authenticated endpoints are tested without credentials."}
          </p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
            <input className="input" value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Authorization" aria-label="Header name" />
            <input className="input font-mono" type="password" autoComplete="off" value={authValue} onChange={(e) => setAuthValue(e.target.value)} placeholder={api.auth_header ? "New value (kept if empty)" : "Bearer eyJ…"} aria-label="Header value" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-[13px] text-slate-300">
              <input type="checkbox" checked={specUsesAuth} onChange={(e) => setSpecUsesAuth(e.target.checked)} /> Also send it when fetching the spec
            </label>
            {api.auth_header && <button type="button" className="text-[13px] text-severity-critical hover:underline" onClick={() => void removeAuth()} disabled={busy}>Remove header</button>}
          </div>
        </div>

        <div className="border-t border-phantix-700/60 pt-4">
          <p className="text-sm font-medium text-white">Re-index from CI after a deploy</p>
          <p className="mt-1 text-[12px] text-slate-500">Add this step to your staging deploy so new endpoints are flagged as soon as they ship. The token only re-indexes this API.</p>
          {hook ? (
            <div className="mt-2 space-y-2">
              <pre className="whitespace-pre-wrap break-all rounded-lg border border-phantix-700 bg-phantix-950 p-3 font-mono text-[12px] text-slate-200">{curl}</pre>
              <div className="flex items-center gap-3">
                <button type="button" className="btn-secondary inline-flex items-center gap-1.5 !py-1.5 text-xs" onClick={() => { void navigator.clipboard.writeText(curl); toast("success", "Copied"); }}><Copy size={13} /> Copy</button>
                <p className="text-[12px] text-amber-300">Copy it now. The token is not shown again.</p>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-3">
              <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => void newToken()} disabled={busy}>{api.hook_enabled ? "Replace token" : "Create token"}</button>
              {api.hook_enabled && <button type="button" className="text-[13px] text-severity-critical hover:underline" onClick={() => void revoke()} disabled={busy}>Revoke</button>}
            </div>
          )}
        </div>

        {error && <p className="rounded-lg border border-severity-critical/30 bg-severity-critical/10 px-3 py-2 text-[13px] text-severity-critical">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Close</button>
          <button className="btn-primary" onClick={() => void save()} disabled={busy}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

function ApiDetail({ id }: { id: number }) {
  const { toast } = useStore();
  const load = useCallback(() => getApiSpec(id), [id]);
  const { data, loading, error, reload, setData } = useResource<ApiSpec | null>(load, null, `api-spec-${id}`);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [testing, setTesting] = useState<ApiEndpoint[] | null>(null);
  const [settings, setSettings] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const uploadRef = React.useRef<HTMLInputElement>(null);

  const endpoints = data?.endpoints ?? [];
  const active = filter ?? (endpoints.some((e) => e.state === "new" || e.state === "changed") ? "attention" : "all");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return endpoints.filter((e) => matches(e, active) && (!q || `${e.method} ${e.path} ${e.summary ?? ""} ${e.tags.join(" ")}`.toLowerCase().includes(q)));
  }, [endpoints, active, query]);
  const running = endpoints.some((e) => e.last_test?.status === "queued" || e.last_test?.status === "running");

  // Poll while a test is queued or running, so results land without a refresh.
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => void reload(), 8000);
    return () => window.clearInterval(t);
  }, [running, reload]);

  const reindex = async (file?: File | null) => {
    setReindexing(true);
    try {
      const res = await reindexApiSpec(id, file);
      setData(res.api);
      const r = res.result;
      const parts = [r.added && `${r.added} new`, r.changed && `${r.changed} changed`, r.removed && `${r.removed} removed`].filter(Boolean);
      toast("success", parts.length ? `Re-indexed: ${parts.join(", ")}` : "Re-indexed: no changes");
      if (r.added || r.changed) setFilter("attention");
    } catch (err) {
      toast("error", "Re-index failed", publicErrorMessage(err));
      void reload();
    } finally {
      setReindexing(false);
    }
  };

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState onRetry={reload} body="We couldn't load this API. Try again." />;
  if (!data) return null;

  const counts = data.counts;
  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: "attention", label: "Needs testing", n: counts.new + counts.changed },
    { key: "new", label: "New", n: counts.new },
    { key: "changed", label: "Changed", n: counts.changed },
    { key: "failing", label: "With issues", n: counts.failing },
    { key: "untested", label: "Not tested", n: counts.untested },
    { key: "all", label: "All", n: counts.total },
    { key: "removed", label: "Removed", n: counts.removed },
  ];
  const selectable = shown.filter((e) => e.state !== "removed");
  const allSelected = selectable.length > 0 && selectable.every((e) => selected.has(e.key));
  const toggle = (key: string) => setSelected((cur) => { const next = new Set(cur); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  return (
    <div>
      <Link to="/api-endpoints" className="mb-3 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"><ArrowLeft size={13} /> All APIs</Link>
      <PageHeader
        title={data.name}
        description={[
          data.base_url,
          data.environment,
          data.format,
          data.version ? `v${data.version}` : null,
          `indexed ${data.indexed_at ? timeAgo(data.indexed_at) : "never"}`,
        ].filter(Boolean).join(" · ")}
        actions={
          <span className="flex flex-wrap gap-2">
            {data.spec_url ? (
              <button className="btn-secondary inline-flex items-center gap-1.5" onClick={() => void reindex()} disabled={reindexing}>
                <RefreshCw size={14} className={cx(reindexing && "animate-spin")} /> Re-index
              </button>
            ) : null}
            <button className="btn-secondary inline-flex items-center gap-1.5" onClick={() => uploadRef.current?.click()} disabled={reindexing}>
              <Upload size={14} /> Upload new spec
            </button>
            <input ref={uploadRef} type="file" hidden accept=".json,.yaml,.yml,application/json" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void reindex(f); }} />
            <button className="btn-ghost inline-flex items-center gap-1.5" onClick={() => setSettings(true)}><Settings2 size={14} /> Settings</button>
          </span>
        }
      />

      {data.last_error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-[13px] text-amber-200">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span className="[overflow-wrap:anywhere]">The last re-index ({timeAgo(data.last_error.at)}) failed: {data.last_error.error}. The endpoints below are from the last spec that could be read.</span>
        </div>
      )}
      {!data.is_verified && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-phantix-700 bg-phantix-900 px-4 py-3 text-[13px] text-slate-300">
          <ShieldAlert size={15} className="mt-0.5 shrink-0 text-gold-400" />
          <span>Tests only run against hosts your organization has verified. If {hostOf(data.base_url)} is not verified yet, <Link to="/targets" className="text-gold-300 hover:underline">verify it in Targets</Link> first.</span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto border-b border-phantix-700/60" role="tablist">
          {tabs.filter((t) => t.n > 0 || t.key === "all" || t.key === active).map((t) => (
            <button key={t.key} role="tab" aria-selected={active === t.key} onClick={() => { setFilter(t.key); setSelected(new Set()); }}
              className={cx("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium", active === t.key ? "border-gold-400 text-gold-300" : "border-transparent text-slate-400 hover:text-slate-200")}>
              {t.label} <span className="ml-1 font-mono text-[12px] text-slate-500">{t.n}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input !w-64 !pl-8" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Path, summary or tag" aria-label="Search endpoints" />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-gold-400/30 bg-gold-400/5 px-4 py-2.5 text-sm">
          <span className="text-slate-200">{selected.size} selected</span>
          <span className="flex gap-2">
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => setSelected(new Set())}>Clear</button>
            <button className="btn-primary inline-flex items-center gap-1.5 !py-1.5 text-xs"
              onClick={() => setTesting(endpoints.filter((e) => selected.has(e.key)).slice(0, 20))}>
              <FlaskConical size={13} /> Test selected
            </button>
          </span>
        </div>
      )}

      <Card pad="none">
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            {active === "attention" ? "Nothing new or changed since the last tests." : "No endpoints match."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-phantix-700/60 text-[12px] text-slate-500">
                  <th scope="col" className="w-10 px-4 py-2.5">
                    <input type="checkbox" aria-label="Select all shown" checked={allSelected} disabled={selectable.length === 0}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.slice(0, 20).map((e) => e.key)))} />
                  </th>
                  <th scope="col" className="px-2 py-2.5 font-medium">Endpoint</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Last test</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">First seen</th>
                  <th scope="col" className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-phantix-800/70">
                {shown.map((e) => (
                  <tr key={e.key} className={cx("align-top", selected.has(e.key) && "bg-gold-400/[0.04]")}>
                    <td className="px-4 py-3">
                      <input type="checkbox" aria-label={`Select ${e.key}`} checked={selected.has(e.key)} disabled={e.state === "removed"} onChange={() => toggle(e.key)} />
                    </td>
                    <td className="max-w-0 px-2 py-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <MethodBadge method={e.method} />
                        <div className="min-w-0">
                          <p className="font-mono text-slate-100 [overflow-wrap:anywhere]">{e.path}</p>
                          {e.summary && <p className="mt-0.5 text-[12px] text-slate-500 [overflow-wrap:anywhere]">{e.summary}</p>}
                          <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                            {e.auth && <span>Auth required</span>}
                            {e.deprecated && <span className="text-amber-300">Deprecated</span>}
                            {e.tags.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><StateChip state={e.state} /></td>
                    <td className="whitespace-nowrap px-3 py-3"><TestResult ep={e} />{e.last_test?.at && e.last_test.status !== "queued" && e.last_test.status !== "running" && <p className="text-[11px] text-slate-500">{timeAgo(e.last_test.at)}</p>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-400">{e.first_seen_at ? timeAgo(e.first_seen_at) : ""}</td>
                    <td className="px-4 py-3 text-right">
                      {e.state !== "removed" && (
                        <button className="btn-secondary inline-flex items-center gap-1 !py-1 text-xs" onClick={() => setTesting([e])}
                          disabled={e.last_test?.status === "queued" || e.last_test?.status === "running"}>
                          <FlaskConical size={12} /> Test
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(data.history?.length ?? 0) > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm text-slate-400 hover:text-slate-200">Re-index history</summary>
          <ul className="mt-2 divide-y divide-phantix-800/70 rounded-xl border border-phantix-700/60">
            {data.history!.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[13px]">
                <span className="text-slate-300">{TRIGGER_LABEL[h.trigger] ?? h.trigger} <span className="text-slate-500">· {timeAgo(h.at)}</span></span>
                {h.ok ? (
                  <span className="font-mono text-[12px] text-slate-400">+{h.added ?? 0} new · {h.changed ?? 0} changed · −{h.removed ?? 0} removed</span>
                ) : (
                  <span className="text-[12px] text-amber-300 [overflow-wrap:anywhere]">{h.error}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {testing && (
        <TestModal api={data} endpoints={testing} onClose={() => setTesting(null)}
          onStarted={() => { setTesting(null); setSelected(new Set()); void reload(); }} />
      )}
      {settings && <SettingsModal api={data} onClose={() => setSettings(false)} onSaved={(a) => { setData({ ...data, ...a }); setSettings(false); }} />}
    </div>
  );
}

export default function ApiEndpoints() {
  const { id } = useParams();
  const n = Number(id);
  return id && Number.isFinite(n) ? <ApiDetail id={n} /> : <ApiList />;
}
