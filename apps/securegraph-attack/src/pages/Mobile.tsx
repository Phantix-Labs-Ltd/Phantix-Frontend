import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Smartphone, Upload, Loader2, ShieldCheck, FileWarning, ScanSearch } from "lucide-react";
import { PageHeader, Card, CardHeader, SeverityBadge } from "@sg/ui";
import { api, publicErrorMessage } from "@sg/api";
import { sanitizeSingleLine, validateUploadFile } from "@sg/uploadValidation";
import { useStore } from "@sg/store";
import DocLink from "@sg/components/DocLink";
import MobileHandoffCard from "@sg/components/MobileHandoffCard";
import { UpsellBanner } from "@sg/components/UpgradeGate";

// ── Mobile — static package analysis + governed endpoint handoff ─────────────
// W6: static APK/AAB/IPA analysis (secrets, manifest, permissions, endpoints)
// and NS-08 handoff of discovered mobile API endpoints to authorized
// reassessment. Runtime/dynamic (AVD) testing is a project engagement.

interface UploadResult {
  package_name?: string | null;
  sha256?: string;
  /** Org-scoped object-storage key for the stored binary (from the upload). */
  storage_key?: string;
  size_bytes?: number;
  findings_count?: number;
  findings_preview?: Array<Record<string, unknown>>;
  analysis_method?: string;
  message?: string;
  scan_hint?: string;
}

export default function Mobile() {
  const { toast, requireDualControl } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState("");
  const [criticality, setCriticality] = useState("medium");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [storageKey, setStorageKey] = useState("");
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<UploadResult | null>(null);

  const upload = async () => {
    if (!file) {
      toast("error", "Choose a package", "Select an .apk file to analyze.");
      return;
    }
    const invalid = validateUploadFile(file, "apk");
    if (invalid) {
      toast("error", "Upload failed", invalid);
      return;
    }
    if (!(await requireDualControl("Uploading a mobile package requires a dual-control operate session."))) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const cleanName = sanitizeSingleLine(name).slice(0, 255);
      const cleanEnvironment = sanitizeSingleLine(environment).slice(0, 50);
      if (cleanName) form.append("name", cleanName);
      if (cleanEnvironment) form.append("environment", cleanEnvironment);
      form.append("criticality", criticality);
      form.append("confirm_ownership", "true");
      const res = await api.upload<UploadResult>("/assets/upload/apk", form);
      setResult(res);
      // Pre-fill the "analyze stored" field with the key the upload returned, so
      // re-analysis uses a valid org-scoped key instead of a hand-typed path.
      if (res.storage_key) setStorageKey(res.storage_key);
      toast("success", "Package analyzed", "A mobile_apk asset was created or updated.");
    } catch (e: unknown) {
      const err = e as { message?: string; detail?: { message?: string } };
      toast("error", "Upload failed", err?.message || "Could not analyze the package.");
    } finally {
      setBusy(false);
    }
  };

  const analyzeStored = async () => {
    if (!storageKey.trim()) {
      toast("error", "Storage key required", "Paste the storage key returned by an upload.");
      return;
    }
    setAnalyzeBusy(true);
    setAnalyzeResult(null);
    try {
      const res = await api.post<UploadResult>("/mobile/analyze", {
        storage_key: storageKey.trim(),
        filename: file?.name || name || "package.apk",
      });
      setAnalyzeResult(res);
      toast("success", "Analysis complete", "Static mobile analysis finished.");
    } catch (e: unknown) {
      const err = e as { message?: string; detail?: { message?: string } };
      toast("error", "Analysis failed", err?.message || "Could not analyze the stored package.");
    } finally {
      setAnalyzeBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Mobile"
        description="Static analysis of Android APK files, Android App Bundles and iOS app packages"
        actions={<DocLink docId="howto-app-32" label="Mobile testing how-to" />}
      />

      {/* Dynamic runtime (AVD) testing is an engagement, not a self-serve scan. */}
      <UpsellBanner feature="dynamic_mobile" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="min-w-0">
          <Card>
            <CardHeader
              title="Analyze a package"
              subtitle="Upload an APK for inventory analysis. SecureGraph analyzes it statically and never runs the binary."
              action={<Upload size={16} className="text-gold-300" />}
            />
            <div className="space-y-3">
              <div>
                <label className="label">Package file (.apk)</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".apk,application/vnd.android.package-archive"
                  aria-label="Package file (.apk)"
                  className="input !py-2"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    if (f && !name) setName(f.name.replace(/\.apk$/i, ""));
                  }}
                />
                <p className="mt-1 text-[13px] text-slate-500">
                  For an Android App Bundle or an iOS app package, upload the file to storage first, then analyze it by storage key below.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="label">Display name</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer app" />
                </div>
                <div>
                  <label className="label">Environment</label>
                  <input className="input" value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="production" />
                </div>
                <div>
                  <label className="label">Criticality</label>
                  <select className="input" value={criticality} onChange={(e) => setCriticality(e.target.value)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <button className="btn-primary w-full" disabled={busy || !file} onClick={() => void upload()}>
                {busy ? <Loader2 size={14} className="mr-1.5 inline animate-spin" /> : <Smartphone size={14} className="mr-1.5 inline" />}
                Upload &amp; analyze
              </button>
              {result && <AnalysisSummary result={result} />}
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="min-w-0">
          <Card>
            <CardHeader
              title="Analyze a stored package"
              subtitle="An Android App Bundle or an iOS app package, or an object that is already in storage. Analyze it by storage key."
              action={<ScanSearch size={16} className="text-gold-300" />}
            />
            <div className="space-y-3">
              <div>
                <label className="label">Storage key</label>
                <input
                  className="input font-mono !text-xs"
                  value={storageKey}
                  onChange={(e) => setStorageKey(e.target.value)}
                  placeholder="uploads/org-24/app.aab"
                />
              </div>
              <button className="btn-secondary w-full" disabled={analyzeBusy} onClick={() => void analyzeStored()}>
                {analyzeBusy ? <Loader2 size={14} className="mr-1.5 inline animate-spin" /> : null}
                Analyze stored package
              </button>
              {analyzeResult && <AnalysisSummary result={analyzeResult} />}
              <p className="flex items-start gap-2 text-[13px] leading-5 text-slate-500">
                <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                Static only. Any discovered endpoint must be inside an authorized scope before reassessment.
              </p>
            </div>
          </Card>
        </motion.div>
      </div>

      <div className="mt-4">
        <MobileHandoffCard />
      </div>
    </div>
  );
}

const METHOD_LABELS: Record<string, string> = {
  "zip+axml": "Manifest read",
  "zip+axml+aapt": "Manifest read, build tools",
  "zip+axml_strings": "Strings scan",
  "zip+axml_strings+aapt": "Strings scan, build tools",
};

function AnalysisSummary({ result }: { result: UploadResult }) {
  const findings = result.findings_count ?? result.findings_preview?.length ?? 0;
  const preview = (result.findings_preview ?? []) as Array<{ title?: string; name?: string; message?: string; severity?: string }>;
  // Package names, hashes and messages are long unbroken strings. Every line
  // wraps inside the box (min-w-0 + break-anywhere) instead of running past it.
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-phantix-700/40 bg-phantix-900/40 p-3 text-xs leading-5 [overflow-wrap:anywhere]">
      <p className="flex min-w-0 items-start gap-1.5 text-slate-200">
        {findings > 0 ? (
          <FileWarning size={13} className="mt-1 shrink-0 text-amber-300" />
        ) : (
          <ShieldCheck size={13} className="mt-1 shrink-0 text-emerald-400" />
        )}
        <span className="min-w-0">
          <span className="font-medium">{result.package_name || "Package"}</span>
          <span className="text-slate-400"> · {findings} finding{findings === 1 ? "" : "s"}</span>
        </span>
      </p>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[12px]">
        {result.sha256 && (
          <>
            <dt className="text-slate-500">SHA-256</dt>
            <dd className="min-w-0 font-mono text-slate-400">{result.sha256}</dd>
          </>
        )}
        {result.analysis_method && (
          <>
            <dt className="text-slate-500">Method</dt>
            <dd className="min-w-0 text-slate-400">{METHOD_LABELS[result.analysis_method] ?? result.analysis_method}</dd>
          </>
        )}
      </dl>
      {result.message && <p className="mt-2 text-slate-400">{result.message}</p>}
      {findings > 0 && preview.length ? (
        <ul className="mt-2 space-y-1">
          {preview.slice(0, 5).map((f, i) => (
            <li key={i} className="flex min-w-0 items-start gap-2 text-[12px] text-slate-300">
              {f.severity ? <SeverityBadge severity={f.severity as any} className="shrink-0" /> : <span aria-hidden>•</span>}
              <span className="min-w-0 pt-px">{String(f.title ?? f.name ?? f.message ?? "Finding")}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
