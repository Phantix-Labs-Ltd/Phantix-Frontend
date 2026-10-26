import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock, Plus, Search, Sparkles } from "lucide-react";
import { api, isDemoMode } from "@sg/api";
import { loadAssetsBundle } from "@sg/data";
import { useStore } from "@sg/store";
import {
  PlatformSetupLink,
  domainsToVerify,
  isIpLike,
  isWebAssetType,
  useAupStatus,
  useOnReturn,
  useVerifiedDomains,
} from "@sg/platformSetup";
import { cx, humanize } from "@sg/utils";
import type { Asset } from "@sg/types";

/**
 * Asset types each procedure tests, for procedures whose steps don't declare
 * `target_types` (the web scans) or when the procedure can't be loaded. Kept in
 * step with app/engines/vapt_engine/procedures/builtin.py.
 */
const WEB = ["domain", "subdomain", "web_app", "web_path"];
const FALLBACK_TYPES: Record<string, string[]> = {
  web_scan: WEB,
  web_app_scan_only: WEB,
  caido: WEB,
  webhook_graphql_scan: [...WEB, "api"],
  api_scan: ["api"],
  infra_scan: ["ip_address", "domain", "subdomain", "port_service"],
  mobile_dynamic: ["mobile_apk"],
  full_vapt: ["ip_address", "domain", "subdomain", "api", "mobile_apk", "web_app", "ldap_server", "dns_server"],
};

const TYPE_LABEL: Record<string, string> = {
  ip_address: "IP address",
  api: "API",
  mobile_apk: "Mobile app (APK)",
  web_app: "Web app",
  dns_server: "DNS server",
  ldap_server: "LDAP server",
};
const typeLabel = (t: string) => TYPE_LABEL[t] ?? humanize(t);

async function procedureTargetTypes(procedureKey: string): Promise<string[]> {
  const fallback = FALLBACK_TYPES[procedureKey] ?? WEB;
  if (isDemoMode()) return fallback;
  try {
    const proc = await api.get<{ steps?: { config?: { target_types?: string[] }; target_types?: string[] }[] }>(
      `/vapt/procedures/${encodeURIComponent(procedureKey)}`,
    );
    const types = new Set<string>();
    for (const step of proc?.steps ?? []) {
      for (const t of step.config?.target_types ?? step.target_types ?? []) types.add(String(t));
    }
    return types.size ? [...types] : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Choose the assets a new campaign tests.
 *
 * The assets the chosen procedure can test, and that the organization has
 * proven it owns, are suggested and selected for the operator. Changing the
 * procedure re-suggests until the operator picks by hand. Web assets need a
 * verified domain over them and IP addresses need the AUP confirmation, the same
 * rule as the first-VAPT journey; anything else is selectable.
 */
export default function CampaignAssetPicker({ procedureKey, selected, onChange }: {
  procedureKey: string;
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [types, setTypes] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  // Once the operator ticks or clears by hand, a procedure change no longer
  // replaces their choice.
  const touched = useRef(false);

  const load = useCallback(() => {
    loadAssetsBundle()
      .then((b) => setAssets(Array.isArray(b.assets) ? b.assets : []))
      .catch(() => setAssets([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useOnReturn(load);

  useEffect(() => {
    let alive = true;
    setTypes(null);
    void procedureTargetTypes(procedureKey).then((t) => { if (alive) setTypes(t); });
    return () => { alive = false; };
  }, [procedureKey]);

  const { loaded: domainsLoaded, coveredBy, pendingNames } = useVerifiedDomains();
  const aup = useAupStatus();
  const { session } = useStore();

  /** Why an asset can't be tested yet, or null when it can. */
  const blockedReason = useCallback((a: Asset): string | null => {
    if (isWebAssetType(a.asset_type)) return coveredBy(a.value) ? null : "Domain not verified";
    if (isIpLike(a.value)) return aup.status && !aup.status.covers_ip_targets ? "AUP not confirmed for IP targets" : null;
    return null;
  }, [coveredBy, aup.status]);

  const suited = useCallback((a: Asset) => Boolean(types?.includes(String(a.asset_type || "").toLowerCase())), [types]);

  const suggested = useMemo(
    () => (assets ?? []).filter((a) => suited(a) && !blockedReason(a)).map((a) => a.id),
    [assets, suited, blockedReason],
  );

  // Pre-select the suggestion until the operator takes over.
  useEffect(() => {
    if (!touched.current && assets && types && domainsLoaded) onChange(suggested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested, assets, types, domainsLoaded]);

  const picked = useMemo(() => new Set(selected), [selected]);
  const toggle = (id: number) => {
    touched.current = true;
    onChange(picked.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  if (!assets || !types || !domainsLoaded) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-400">
        <Loader2 size={13} className="animate-spin text-gold-400" /> Loading your assets...
      </p>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="rounded-xl border border-phantix-700/50 bg-phantix-950/50 p-3.5 text-xs text-slate-400">
        <p>No assets yet. A campaign needs at least one asset to test.</p>
        <Link to="/targets?add=1&return=/vapt" className="btn-secondary mt-2 inline-flex !py-1.5 text-xs">
          <Plus size={13} /> Add an asset
        </Link>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = (a: Asset) =>
    !q || a.value.toLowerCase().includes(q) || (a.name || "").toLowerCase().includes(q) || a.asset_type.toLowerCase().includes(q);
  const ordered = [...assets].filter(matches).sort((a, b) => {
    const rank = (x: Asset) => (suited(x) ? 0 : 2) + (blockedReason(x) ? 1 : 0);
    return rank(a) - rank(b) || a.value.localeCompare(b.value);
  });
  // The domain to offer: one the user started verifying or signed in with, not
  // simply the first uncovered asset (which may belong to someone else).
  const toVerify = domainsToVerify(
    assets.filter((a) => isWebAssetType(a.asset_type) && !coveredBy(a.value)).map((a) => a.value),
    { pending: pendingNames, signedInEmail: session?.userEmail },
  )[0];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input !py-1.5 !pl-8 text-xs"
            placeholder="Search assets"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search assets"
          />
        </div>
        <button
          type="button"
          className="btn-ghost !py-1.5 text-xs"
          disabled={!suggested.length}
          onClick={() => { touched.current = true; onChange(suggested); }}
          title="Select every verified asset this procedure can test"
        >
          <Sparkles size={13} /> Select suggested ({suggested.length})
        </button>
        {selected.length > 0 && (
          <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => { touched.current = true; onChange([]); }}>
            Clear
          </button>
        )}
      </div>

      <ul className="max-h-56 overflow-y-auto rounded-xl border border-phantix-700/50 bg-phantix-950/50 p-1" aria-label="Assets">
        {ordered.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">No assets match "{query}".</li>}
        {ordered.map((a) => {
          const reason = blockedReason(a);
          const fit = suited(a);
          return (
            <li key={a.id}>
              <label
                className={cx(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs",
                  reason ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-phantix-800/60",
                )}
                title={reason ?? undefined}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-gold-400"
                  checked={picked.has(a.id)}
                  disabled={Boolean(reason)}
                  onChange={() => toggle(a.id)}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-slate-200">{a.value}</span>
                <span className="shrink-0 text-[12px] text-slate-500">{typeLabel(a.asset_type)}</span>
                {reason ? (
                  <span className="flex shrink-0 items-center gap-1 text-[12px] text-severity-medium"><Lock size={11} /> {reason}</span>
                ) : fit ? (
                  <span className="shrink-0 text-[12px] text-gold-300">Suggested</span>
                ) : (
                  <span className="shrink-0 text-[12px] text-slate-600">Not tested by this procedure</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className={selected.length ? "text-slate-400" : "text-severity-medium"}>
          {selected.length
            ? `${selected.length} asset${selected.length === 1 ? "" : "s"} selected`
            : "Select at least one asset."}
        </span>
        {toVerify && (
          <PlatformSetupLink task={{ kind: "verify_domain", domain: toVerify }} variant="secondary" className="!py-1 text-[12px]">
            Verify {toVerify}
          </PlatformSetupLink>
        )}
      </div>
    </div>
  );
}
