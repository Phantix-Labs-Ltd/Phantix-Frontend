import { ShieldAlert, ShieldCheck } from "lucide-react";
import {
  PlatformSetupLink, hostOf, isIpLike, isWebAssetType, suggestDomain, useAupStatus, useVerifiedDomains,
} from "../platformSetup";
import { useStore } from "../store";

/**
 * Who has proven they own this asset, and the one step to fix it when nobody
 * has. Verification happens on the Platform in a new tab; this panel refreshes
 * when the user comes back.
 */
export default function AssetOwnership({
  asset,
}: {
  asset: { asset_type: string; value: string; is_verified?: boolean; verification_method?: string | null };
}) {
  const { coveredBy, loaded } = useVerifiedDomains();
  const aup = useAupStatus();
  const { requestAupAcceptance } = useStore();
  const web = isWebAssetType(asset.asset_type) && !isIpLike(asset.value);
  const via = web ? coveredBy(asset.value) : null;

  if (asset.is_verified || via) {
    return (
      <p className="flex items-start gap-2 rounded-md border border-emerald-400/25 bg-emerald-400/5 px-3.5 py-2.5 text-sm text-emerald-300">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" />
        <span>
          Ownership verified{via ? <> through <span className="font-mono">{via}</span></> : null}. Active tests can run on it.
        </span>
      </p>
    );
  }

  if (isIpLike(asset.value)) {
    if (aup.status?.covers_ip_targets) {
      return (
        <p className="flex items-start gap-2 rounded-md border border-emerald-400/25 bg-emerald-400/5 px-3.5 py-2.5 text-sm text-emerald-300">
          <ShieldCheck size={15} className="mt-0.5 shrink-0" />
          <span>Covered by your organization's confirmation under the Acceptable Use Policy. Active tests can run on it.</span>
        </p>
      );
    }
    if (!aup.status) return null;
    return (
      <div className="rounded-md border border-severity-medium/30 bg-severity-medium/5 px-3.5 py-3 text-sm">
        <p className="flex items-start gap-2 text-slate-300">
          <ShieldAlert size={15} className="mt-0.5 shrink-0 text-severity-medium" />
          <span>
            IP addresses can't be checked with a DNS record. Confirm once that you own or are authorized to test the IPs
            you add, and active tests can run on them.
          </span>
        </p>
        <button type="button" onClick={() => void requestAupAcceptance(asset.value)} className="btn-primary mt-2.5 !py-1.5 text-xs">
          Confirm authorization
        </button>
      </div>
    );
  }

  if (!web || !loaded) return null;
  const domain = suggestDomain(asset.value);
  return (
    <div className="rounded-md border border-severity-medium/30 bg-severity-medium/5 px-3.5 py-3 text-sm">
      <p className="flex items-start gap-2 text-slate-300">
        <ShieldAlert size={15} className="mt-0.5 shrink-0 text-severity-medium" />
        <span>
          Verify <span className="font-mono text-white">{domain}</span> to prove you own{" "}
          <span className="break-all font-mono text-white">{hostOf(asset.value)}</span>. One check covers the domain and
          all its subdomains, and is needed before active tests.
        </span>
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <PlatformSetupLink task={{ kind: "verify_domain", domain }} variant="primary" className="!py-1.5 text-xs">
          Verify {domain}
        </PlatformSetupLink>
        <span className="text-[12px] text-slate-500">Opens the Platform in a new tab. This page updates when you come back.</span>
      </div>
    </div>
  );
}
