import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe2, Loader2, Scale } from "lucide-react";
import { Card, CardHeader, ErrorState, PageHeader, PageSkeleton } from "@sg/ui";
import { useResource } from "@sg/useResource";
import { useStore } from "@sg/store";
import { GLOBAL_COUNTRY, REGIME_COUNTRIES, loadRegimes, saveProfile, type Regimes } from "@sg/assurance";
import { InlineError, errMsg } from "./parts";

const SOURCE_COPY: Record<Regimes["source"], string> = {
  override: "the country you picked",
  profile: "your saved profile",
  registration: "the country your organization registered with",
  browser_locale: "your browser's language settings",
  global: "no country yet",
  none: "no country yet",
};

/** Core → Assurance → Regulatory profile (Core-safe `/compliance/audits/regimes` + `/profile`). */
export default function AssuranceRegimes() {
  // undefined = what the backend resolves (saved profile, then registration
  // country, then browser); a value = the country picked here, not yet saved.
  const [country, setCountry] = useState<string | undefined>(undefined);
  const loader = useCallback(() => loadRegimes(country), [country]);
  const { data, loading, error, reload } = useResource<Regimes | null>(loader, null, `assurance-regimes-${country ?? ""}`);
  const { toast, requireDualControl } = useStore();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState onRetry={reload} body="We couldn't work out which regimes apply. Try again." />;
  if (!data) return null;

  const frameworks = data.frameworks ?? [];
  const local = frameworks.filter((f) => f.match === "country" || f.match === "region");
  const global = frameworks.filter((f) => f.match !== "country" && f.match !== "region");
  const current = country ?? data.detected_country ?? GLOBAL_COUNTRY;
  const isGlobal = current === GLOBAL_COUNTRY;
  const known = REGIME_COUNTRIES.some((g) => g.countries.includes(current));

  const persist = async () => {
    setErr(null);
    if (!(await requireDualControl("Saving your regulatory profile is a recorded change."))) return;
    setBusy(true);
    try {
      await saveProfile({ country: current });
      toast("success", "Country saved", "Audit suggestions now follow it.");
      setCountry(undefined);
      reload();
    } catch (ex) { setErr(errMsg(ex, "Couldn't save the country")); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Regulatory profile" description="The laws and standards that apply to you, from where you operate." />

      <Card className="mb-5">
        <div className="flex flex-wrap items-start gap-4">
          <Globe2 size={20} className="mt-0.5 text-gold-400" />
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="rg-country" className="text-sm font-medium text-slate-200">Where you operate</label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                id="rg-country"
                className="input !w-64"
                value={current}
                onChange={(ev) => { setErr(null); setCountry(ev.target.value); }}
              >
                <option value={GLOBAL_COUNTRY}>Global (global standards only)</option>
                {!known && !isGlobal && <option value={current}>{current}</option>}
                {REGIME_COUNTRIES.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.countries.map((c) => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                ))}
              </select>
              {loading && <Loader2 size={15} className="animate-spin text-slate-400" aria-label="Updating frameworks" />}
              {(data.source !== "profile" || country !== undefined) && (
                <button type="button" className="btn-primary !py-2 text-xs" disabled={busy || loading} onClick={() => void persist()}>
                  {busy ? "Saving..." : `Save ${current} to my profile`}
                </button>
              )}
            </div>
            <p className="mt-2 text-[13px] text-slate-400">
              {country !== undefined
                ? <>Previewing <strong className="text-slate-200">{current}</strong>. Save it to make audit suggestions follow it.</>
                : isGlobal
                  ? "Showing global standards only. Pick your country to add the laws that apply there."
                  : <>Showing regimes for <strong className="text-slate-200">{current}</strong>, from {SOURCE_COPY[data.source]}.</>}
            </p>
            <p className="mt-1 text-[12px] text-slate-500">Operating in several countries, or behind a VPN? Pick the one your regulator is in.</p>
            <div className="mt-2"><InlineError message={err} /></div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FrameworkList
          title="Country and region"
          items={local}
          empty={isGlobal ? "Pick a country to see its laws." : "No country or regional regimes in the catalog for this country yet."}
        />
        <FrameworkList title="Global standards" items={global} empty="None." />
      </div>

      {frameworks.length > 0 && (
        <button className="btn-primary mt-5" onClick={() => navigate(`/assurance/new${local[0] ? `?framework=${encodeURIComponent(local[0].framework_id)}` : ""}`)}>
          Run an audit for these
        </button>
      )}

      <p className="mt-6 flex items-start gap-2 text-[12px] text-slate-500">
        <Scale size={13} className="mt-0.5 shrink-0" /> Control catalogs cite their legal sources, but they are not legal advice. Check obligations that affect you with counsel.
      </p>
    </div>
  );
}

function FrameworkList({ title, items, empty }: { title: string; items: Regimes["frameworks"]; empty: string }) {
  return (
    <Card>
      <CardHeader title={title} />
      {items.length === 0 ? <p className="mt-2 text-sm text-slate-500">{empty}</p> : (
        <ul className="mt-2 divide-y divide-phantix-700/40">
          {items.map((f) => (
            <li key={f.framework_id} className="py-2.5">
              <p className="text-sm text-white">{f.name} <span className="ml-1 font-mono text-[11px] text-slate-500">{f.framework_id}</span></p>
              {f.description && <p className="text-xs text-slate-400">{f.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
