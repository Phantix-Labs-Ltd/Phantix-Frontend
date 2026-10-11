import React, { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Upload, Package, ShieldCheck, AlertTriangle, Spline } from "lucide-react";
import {
  PageHeader,
  Card,
  StatCard,
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
import { isSecurityDbBlocked, ApiError } from "@sg/api";
import { timeAgo } from "@sg/utils";
import {
  listPacks,
  createPack,
  deletePack,
  type PacksResponse,
  type CiPack,
} from "@sg/socOps";

const EMPTY: PacksResponse & { securityDbBlocked: boolean; error: string | null } = {
  platform: { pack_id: "", version: "", rule_count: 0, owned_by: "securegraph" },
  vendor: [],
  pysigma: true,
  securityDbBlocked: false,
  error: null,
};

async function loadPacks() {
  try {
    const data = await listPacks();
    return { ...data, securityDbBlocked: false, error: null };
  } catch (err) {
    if (isSecurityDbBlocked(err)) return { ...EMPTY, securityDbBlocked: true };
    return { ...EMPTY, error: err instanceof Error ? err.message : "Failed to load detection packs" };
  }
}

export default function DetectionPacks() {
  const { toast, requireDualControl } = useStore();
  const { data, loading, error, reload } = useResource(loadPacks, EMPTY, "soc-detection-packs");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const vendor = data.vendor;
  const { pageItems, pagination } = usePaged(vendor, "soc-packs");
  const vendorRules = vendor.reduce((n, p) => n + (p.rule_count ?? 0), 0);

  const remove = async (p: CiPack) => {
    if (!(await requireDualControl("Deleting a detection pack requires a dual-control operate session."))) return;
    setBusyId(p.id);
    try {
      await deletePack(p.id);
      toast("success", "Pack deleted", `${p.name} was removed.`);
      reload();
    } catch (err) {
      toast("error", "Delete failed", err instanceof Error ? err.message : "Could not delete the pack.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <PageSkeleton variant="list" rows={6} actions />;

  if (error && vendor.length === 0 && !data.securityDbBlocked) {
    return <ErrorState onRetry={reload} body="We could not load detection packs. Check your connection and try again. Your session stays signed in." />;
  }

  return (
    <div>
      <PageHeader
        title="Detection packs"
        description="The platform Sigma pack plus your organization's vendor packs."
        actions={
          <div className="flex items-center gap-2">
            <DocLink docId="howto-app-08" label="Detection how-to" />
            <button className="btn-primary" onClick={() => setUploadOpen(true)}><Plus size={15} /> Upload pack</button>
          </div>
        }
      />

      {data.securityDbBlocked && <SecurityDbBanner message={data.error} />}

      {!data.pysigma && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/8 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle size={16} /> Reference validation unavailable (<span className="font-mono">pysigma</span> not installed) — rules are stored but not schema-checked.
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Platform rules" value={data.platform.rule_count} hint={`v${data.platform.version || "—"}`} />
        <StatCard label="Vendor packs" value={vendor.length} />
        <StatCard label="Vendor rules" value={vendorRules} />
        <StatCard label="Validation" value={data.pysigma ? "pysigma" : "basic"} />
      </div>

      {/* Platform pack (read-only) */}
      <Card className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-400/10 text-gold-300"><ShieldCheck size={18} /></span>
            <div>
              <p className="font-medium text-slate-200">{data.platform.pack_id || "Platform pack"}</p>
              <p className="text-[12px] text-slate-500">Owned by {data.platform.owned_by} · {data.platform.rule_count} rules · v{data.platform.version || "—"}</p>
            </div>
          </div>
          <span className="rounded-md border border-phantix-600/40 bg-phantix-800/50 px-2 py-0.5 text-[12px] text-slate-400">Read-only</span>
        </div>
      </Card>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {vendor.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Package size={22} />}
              title="No vendor packs yet"
              body="Upload a Sigma YAML pack to extend detection with your own or a vendor's rules."
              action={<button className="btn-primary" onClick={() => setUploadOpen(true)}><Plus size={15} /> Upload pack</button>}
            />
          </Card>
        ) : (
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Pack</th>
                    <th className="th">ID</th>
                    <th className="th">Version</th>
                    <th className="th text-right">Rules</th>
                    <th className="th">Added</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((p) => (
                    <tr key={p.id} className="border-b border-phantix-800/40 hover:bg-phantix-800/35">
                      <td className="td font-medium text-slate-200">{p.name}</td>
                      <td className="td font-mono text-xs text-slate-400">{p.pack_id}</td>
                      <td className="td text-xs text-slate-400">v{p.version}</td>
                      <td className="td text-right font-mono text-xs text-slate-300">{p.rule_count}</td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">{p.created_at ? timeAgo(p.created_at) : "—"}</td>
                      <td className="td">
                        <div className="flex items-center justify-end">
                          <button className="btn-secondary !px-2 !py-1 hover:!text-severity-critical" title="Delete" disabled={busyId === p.id} onClick={() => remove(p)}>{busyId === p.id ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 size={13} />}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} itemLabel="packs" />
          </Card>
        )}
      </motion.div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onDone={() => { setUploadOpen(false); reload(); }} />
    </div>
  );
}

function UploadModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast, requireDualControl } = useStore();
  const [name, setName] = useState("");
  const [packId, setPackId] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [rulesYaml, setRulesYaml] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setName(""); setPackId(""); setVersion("1.0.0"); setRulesYaml(""); setErrors([]);
  }, [open]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setRulesYaml(await file.text());
      if (!name) setName(file.name.replace(/\.(ya?ml)$/i, ""));
    } catch {
      toast("error", "Could not read file", "Paste the YAML instead.");
    }
  };

  const submit = async () => {
    if (!name.trim() || !rulesYaml.trim()) {
      toast("warning", "Missing details", "A name and Sigma YAML are required.");
      return;
    }
    if (!(await requireDualControl("Uploading a detection pack requires a dual-control operate session."))) return;
    setSaving(true);
    setErrors([]);
    try {
      const res = await createPack({ pack_id: packId.trim() || undefined, name: name.trim(), version: version.trim() || "1.0.0", rules_yaml: rulesYaml });
      const warn = res.errors?.length ? ` (${res.errors.length} rule warning(s))` : "";
      toast("success", "Pack uploaded", `${res.rule_count} rule(s) loaded${warn}.`);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const detail = err.detail;
        setErrors(Array.isArray(detail) ? detail.map(String) : [String(detail)]);
        toast("error", "Validation failed", "The Sigma pack did not pass validation.");
      } else {
        toast("error", "Upload failed", err instanceof Error ? err.message : "Could not upload the pack.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Upload a Sigma pack" wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label">Name</label>
            <input className="input" placeholder="ACME detection rules" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Version</label>
            <input className="input" placeholder="1.0.0" value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <label className="label">Pack ID (optional)</label>
            <input className="input" placeholder="acme-rules" value={packId} onChange={(e) => setPackId(e.target.value)} />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label !mb-0">Sigma YAML</label>
            <label className="btn-ghost cursor-pointer text-xs"><Upload size={13} /> Load .yml
              <input type="file" accept=".yml,.yaml,text/yaml" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
          <textarea className="input min-h-[220px] font-mono text-[12px]" placeholder={"title: Example rule\nlogsource: …\ndetection: …"} value={rulesYaml} onChange={(e) => setRulesYaml(e.target.value)} />
        </div>

        {errors.length > 0 && (
          <div className="rounded-xl border border-severity-critical/30 bg-severity-critical/8 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-severity-critical"><Spline size={13} /> Validation errors</p>
            <ul className="list-inside list-disc space-y-0.5 text-xs text-slate-300">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? <Spinner className="h-4 w-4" /> : <Upload size={14} />} Upload</button>
        </div>
      </form>
    </Modal>
  );
}
