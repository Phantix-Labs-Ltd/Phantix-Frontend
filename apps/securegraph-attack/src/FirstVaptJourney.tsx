import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, Play, Plus, Sparkles } from "lucide-react";
import { Card } from "@sg/ui";
import { loadAssetsBundle } from "@sg/data";
import { PlatformSetupLink, isWebAssetType, suggestDomain, useOnReturn, useVerifiedDomains } from "@sg/platformSetup";
import { cx } from "@sg/utils";
import type { Asset, VaptCampaign } from "@sg/types";

type StepKey = "asset" | "verify" | "plan" | "start";

const STEPS: { key: StepKey; title: string; detail: string }[] = [
  { key: "asset", title: "Add your first asset", detail: "The domain, IP or app you want tested." },
  { key: "verify", title: "Verify you own it", detail: "Active tests send real attack traffic, so a domain needs proof of ownership first." },
  { key: "plan", title: "Review the plan", detail: "SecureGraph proposes what to test on your assets. Switch off anything you don't want." },
  { key: "start", title: "Start the campaign", detail: "Launch the draft the plan created." },
];

/**
 * Run your first VAPT as one journey: add an asset, verify ownership, review
 * the plan, start the campaign. Shown on /vapt until a campaign has been
 * started; each step is ticked from the data (assets, verified domains, a
 * draft campaign), so leaving and coming back resumes where the user was.
 */
export default function FirstVaptJourney({ campaigns, planning, onPlan, onStart }: {
  campaigns: VaptCampaign[];
  planning: boolean;
  onPlan: () => void;
  onStart: (campaign: VaptCampaign) => void;
}) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const load = useCallback(() => {
    loadAssetsBundle()
      .then((b) => setAssets(b.assets))
      .catch(() => setAssets([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useOnReturn(load);
  const { loaded: domainsLoaded, coveredBy } = useVerifiedDomains();

  if (!assets || !domainsLoaded) {
    return (
      <Card className="mb-5">
        <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={15} className="animate-spin text-gold-400" /> Loading your first VAPT steps...</p>
      </Card>
    );
  }

  // Web assets need a verified domain over them; IPs are covered by the AUP instead.
  const uncovered = assets.filter((a) => isWebAssetType(a.asset_type) && !coveredBy(a.value));
  const draft = campaigns.find((c) => c.status === "draft") ?? null;
  const done: Record<StepKey, boolean> = {
    asset: assets.length > 0,
    verify: assets.length > 0 && uncovered.length === 0,
    plan: Boolean(draft),
    start: false,
  };
  const current = STEPS.findIndex((s) => !done[s.key]);
  const toVerify = uncovered.length ? suggestDomain(uncovered[0].value) : "";

  const action = (key: StepKey): React.ReactNode => {
    switch (key) {
      case "asset":
        return (
          <Link to="/targets?add=1&return=/vapt" className="btn-primary !py-1.5 text-xs">
            <Plus size={13} /> Add an asset
          </Link>
        );
      case "verify":
        return (
          <div className="flex flex-wrap items-center gap-2">
            <PlatformSetupLink task={{ kind: "verify_domain", domain: toVerify || undefined }} variant="primary" className="!py-1.5 text-xs">
              Verify {toVerify || "your domain"}
            </PlatformSetupLink>
            <span className="text-[12px] text-slate-500">Opens the Platform in a new tab. This updates when you come back.</span>
          </div>
        );
      case "plan":
        return (
          <button type="button" className="btn-primary !py-1.5 text-xs" disabled={planning} onClick={onPlan}>
            {planning ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {planning ? "Planning..." : "Review the plan"}
          </button>
        );
      case "start":
        return draft ? (
          <button type="button" className="btn-primary !py-1.5 text-xs" onClick={() => onStart(draft)}>
            <Play size={13} /> Start {draft.name}
          </button>
        ) : null;
    }
  };

  return (
    <Card className="mb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white">Run your first VAPT</h2>
        <span className="text-xs text-slate-500">{STEPS.filter((s) => done[s.key]).length} of {STEPS.length} done</span>
      </div>
      <ol className="mt-4 space-y-3">
        {STEPS.map((s, i) => {
          const isDone = done[s.key];
          const isCurrent = i === current;
          return (
            <li key={s.key} className={cx("flex items-start gap-3 rounded-md border p-3", isCurrent ? "border-gold-400/40 bg-gold-400/[0.04]" : "border-transparent")}>
              <span
                className={cx(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                  isDone ? "border-emerald-400 bg-emerald-400/15 text-emerald-400"
                    : isCurrent ? "border-gold-400 text-gold-300"
                      : "border-phantix-700 text-slate-500",
                )}
              >
                {isDone ? <CheckCircle2 size={13} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx("text-sm font-medium", isDone ? "text-slate-400 line-through" : isCurrent ? "text-white" : "text-slate-500")}>{s.title}</p>
                {isCurrent && (
                  <>
                    <p className="mt-0.5 text-[13px] text-slate-400">{s.detail}</p>
                    <div className="mt-2.5">{action(s.key)}</div>
                  </>
                )}
                {isDone && s.key === "asset" && (
                  <Link to="/targets" className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-300">
                    {assets.length} asset{assets.length === 1 ? "" : "s"} <ArrowRight size={11} />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
