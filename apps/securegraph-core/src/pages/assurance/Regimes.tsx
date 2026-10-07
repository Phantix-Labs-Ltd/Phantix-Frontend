import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe2, Scale } from "lucide-react";
import { Card, CardHeader, ErrorState, PageHeader, PageSkeleton } from "@sg/ui";
import { useResource } from "@sg/useResource";
import { useStore } from "@sg/store";
import { loadRegimes, saveProfile, type Regimes } from "@sg/assurance";
import { InlineError, errMsg } from "./parts";

const SOURCE_COPY: Record<Regimes["source"], string> = {
  override: "the country you picked",
  profile: "your saved profile",
  browser_locale: "your browser's language settings",
  none: "nothing yet",
};

/** Countries the catalog covers first; any other name can be typed. */
const COUNTRIES = ["Nigeria", "Kenya", "South Africa", "Ghana", "Egypt"];

/** Core → Assurance → Regulatory profile (Core-safe `/compliance/audits/regimes` + `/profile`). */
export default function AssuranceRegimes() {
  const [country, setCountry] = useState<string | undefined>(undefined);
  const loader = useCallback(() => loadRegimes(country), [country]);
  const { data, loading, error, reload } = useResource<Regimes | null>(loader, null, `assurance-regimes-${country ?? ""}`);
  const { toast, requireDualControl } = useStore();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorState onRetry={reload} body="We couldn't work out which regimes apply. Try again." />;
  if (!data) return null;

  const local = data.frameworks.filter((f) => f.match === "country" || f.match === "region");
  const global = data.frameworks.filter((f) => f.match !== "country" && f.match !== "region");

  const preview = (ev: React.FormEvent) => { ev.preventDefault(); if (draft.trim()) setCountry(draft.trim()); };
  const persist = async () => {
    const value = (country ?? data.detected_country ?? "").trim();
    if (!value) return;
    setErr(null);
    if (!(await requireDualControl("Saving your regulatory profile is a recorded change."))) return;
    setBusy(true);
    try {
      await saveProfile({ country: value });
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
            <p className="text-sm text-slate-300">
              {data.detected_country
                ? <>Showing regimes for <strong className="text-white">{data.detected_country}</strong>{data.detected_region ? ` (${data.detected_region})` : ""}, from {SOURCE_COPY[data.source]}.</>
                : "We don't know where you operate yet. Pick a country to see what applies."}
            </p>
            <form onSubmit={preview} className="mt-3 flex flex-wrap items-center gap-2">
              <label htmlFor="rg-country" className="sr-only">Country</label>
              <input id="rg-country" list="rg-countries" className="input !w-56" value={draft} onChange={(ev) => setDraft(ev.target.value)} placeholder="Another country" />
              <datalist id="rg-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
              <button className="btn-secondary !py-2 text-xs">Preview</button>
              {(data.source !== "profile" || country) && data.detected_country && (
                <button type="button" className="btn-primary !py-2 text-xs" disabled={busy} onClick={() => void persist()}>
                  {busy ? "Saving..." : `Save ${data.detected_country} to my profile`}
                </button>
              )}
            </form>
            <p className="mt-2 text-[12px] text-slate-500">Operating in several countries, or behind a VPN? Pick the one your regulator is in.</p>
            <div className="mt-2"><InlineError message={err} /></div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FrameworkList title="Country and region" items={local} empty="No country or regional regimes in the catalog for this country yet." />
        <FrameworkList title="Global standards" items={global} empty="None." />
      </div>

      {data.frameworks.length > 0 && (
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
