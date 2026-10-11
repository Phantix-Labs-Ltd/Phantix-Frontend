import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, Check, Cloud, Database, Loader2, Lock, Sparkles } from "lucide-react";
import { Card, EmptyState, ErrorState, PageHeader, PageBodySkeleton } from "@sg/ui";
import { useStore } from "@sg/store";
import { ApiError } from "@sg/api";
import {
  loadFrameworkRecommendations,
  loadProfile,
  saveProfile,
  type BusinessProfile,
  type BusinessProfileUpdate,
} from "@sg/complianceGrc";
import { cx } from "@sg/utils";
import DocLink from "@sg/components/DocLink";

// ── Business profile, one stage at a time ────────────────────────────────────
// The profile drives GET /compliance/recommendations: which frameworks apply
// to this organization. Without it that endpoint answers 400, so this page owns
// both. The form runs as stages: each Continue saves to the backend, then opens
// the next stage, so a half-finished profile is never lost. A stage unlocks only
// when the one before it is complete; completed stages stay open for edits.

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"];
const CLOUD_PROVIDERS = ["aws", "azure", "gcp", "digitalocean", "on-prem", "other"];

const DATA_FLAGS: Array<{ key: keyof BusinessProfileUpdate; label: string; hint: string }> = [
  { key: "handles_personal_data", label: "Personal data", hint: "Brings in NDPR and GDPR" },
  { key: "handles_health_records", label: "Health records", hint: "Brings in health data controls" },
  { key: "handles_payment_cards", label: "Payment cards", hint: "Brings in PCI DSS" },
  { key: "handles_financial_transactions", label: "Financial transactions", hint: "Brings in financial sector controls" },
  { key: "handles_government_contracts", label: "Government contracts", hint: "Brings in public sector rules" },
  { key: "has_public_apis", label: "Public APIs", hint: "Adds API security controls" },
  { key: "uses_ai", label: "Uses AI", hint: "Brings in AI governance controls" },
];

const STAGES = [
  { id: "organization", label: "Organization", icon: Building2, lead: "Tell us where you are registered, what you do and how big you are." },
  { id: "data", label: "Data you handle", icon: Database, lead: "Each type of data brings in its own rules. Select every type you hold or process." },
  { id: "operations", label: "Where you operate", icon: Cloud, lead: "Where your workloads run and where your customers are. This sets the cross-border rules." },
  { id: "frameworks", label: "Your frameworks", icon: Sparkles, lead: "These are the frameworks that apply to you, and why." },
] as const;
type StageIndex = 0 | 1 | 2 | 3;

function organizationComplete(d: BusinessProfileUpdate): boolean {
  return Boolean(d.country?.trim() && d.industry?.trim() && d.company_size);
}

export default function ComplianceProfile() {
  const { toast } = useStore();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [draft, setDraft] = useState<BusinessProfileUpdate>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recs, setRecs] = useState<unknown[] | null>(null);
  const [recsNote, setRecsNote] = useState<string | null>(null);
  const [stage, setStage] = useState<StageIndex>(0);
  // Highest stage the user has completed in this visit or a saved profile implies.
  const [reached, setReached] = useState<number>(0);

  const refreshRecs = async () => {
    try {
      const res = await loadFrameworkRecommendations();
      setRecs(Array.isArray(res.recommendations) ? res.recommendations : []);
      setRecsNote(null);
    } catch (e) {
      setRecs(null);
      // A 400 here is the documented "create a profile first" answer, not a fault.
      setRecsNote(
        e instanceof ApiError && e.status === 400
          ? "Save your profile to get framework recommendations."
          : e instanceof Error ? e.message : "Recommendations unavailable.",
      );
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await loadProfile();
      setProfile(row);
      const d = row ? toDraft(row) : { country: "", customer_countries: [], cloud_providers: [] };
      setDraft(d);
      // A saved, complete profile opens on the result; anything else on the
      // first stage that still needs an answer.
      if (row && organizationComplete(d)) {
        setReached(3);
        setStage(3);
      } else {
        setReached(0);
        setStage(0);
      }
      await refreshRecs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the business profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof BusinessProfileUpdate>(key: K, value: BusinessProfileUpdate[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const toggleList = (key: "customer_countries" | "cloud_providers", value: string) => {
    const current = (draft[key] as string[] | undefined) ?? [];
    set(key, current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  };

  /** Save what is filled in so far, then open the next stage. */
  const advance = async () => {
    setSaving(true);
    try {
      const row = await saveProfile(draft);
      setProfile(row);
      setDraft(toDraft(row));
      const next = Math.min(stage + 1, 3) as StageIndex;
      setReached((r) => Math.max(r, next));
      setStage(next);
      if (next === 3) {
        await refreshRecs();
        toast("success", "Profile complete", "Framework recommendations refreshed.");
      }
    } catch (e) {
      toast("error", "Could not save the profile", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const canContinue = stage !== 0 || organizationComplete(draft);
  const cloud = (draft.cloud_providers as string[] | undefined) ?? [];
  const current = STAGES[stage];

  return (
    <div>
      <PageHeader
        title="Business profile"
        description="Answer four short stages. SecureGraph uses them to find the rules that apply to your organization."
        actions={<DocLink docId="howto-app-24" label="Compliance review how-to" />}
      />

      {loading ? (
        <PageBodySkeleton variant="form" rows={6} />
      ) : error ? (
        <ErrorState title="Profile unavailable" body={error} onRetry={() => void load()} />
      ) : (
        <div className="mx-auto max-w-3xl">
          {/* Stepper: done stages are a check and can be reopened; later stages stay locked. */}
          <ol className="mb-4 grid grid-cols-4 gap-2">
            {STAGES.map((s, i) => {
              const done = i < reached || (i === 3 && reached === 3);
              const open = i <= reached;
              const active = i === stage;
              const Icon = s.icon;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={!open}
                    onClick={() => setStage(i as StageIndex)}
                    aria-current={active ? "step" : undefined}
                    className={cx(
                      "flex w-full flex-col items-start gap-1.5 rounded-md border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-gold-400/50 bg-gold-400/[0.06]"
                        : open
                          ? "border-phantix-700 hover:border-phantix-600"
                          : "cursor-not-allowed border-phantix-800 opacity-50",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cx(
                          "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                          done && !active ? "bg-emerald-400/15 text-emerald-400" : active ? "bg-gold-400/20 text-gold-300" : "bg-phantix-800 text-slate-500",
                        )}
                      >
                        {done && !active ? <Check size={11} /> : open ? i + 1 : <Lock size={10} />}
                      </span>
                      <Icon size={13} className={active ? "text-gold-300" : "text-slate-500"} />
                    </span>
                    <span className={cx("hidden text-xs font-medium sm:block", active ? "text-slate-100" : "text-slate-400")}>{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <Card>
            <div className="mb-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Stage {stage + 1} of 4</p>
              <h2 className="mt-0.5 font-display text-lg font-semibold text-slate-100">{current.label}</h2>
              <p className="mt-0.5 text-sm text-slate-400">{current.lead}</p>
            </div>

            {stage === 0 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="cp-country">Primary country</label>
                    <input id="cp-country" value={draft.country ?? ""} onChange={(e) => set("country", e.target.value)} placeholder="NG" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="cp-industry">Industry</label>
                    <input id="cp-industry" value={draft.industry ?? ""} onChange={(e) => set("industry", e.target.value)} placeholder="Fintech" className="input" />
                  </div>
                </div>
                <div>
                  <p className="label">Company size</p>
                  <div className="flex flex-wrap gap-1.5">
                    {COMPANY_SIZES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => set("company_size", s)}
                        aria-pressed={draft.company_size === s}
                        className={cx(
                          "chip transition-colors",
                          draft.company_size === s ? "border-gold-400/40 bg-gold-400/10 text-gold-200" : "border-phantix-700 text-slate-400 hover:text-slate-200",
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                {!organizationComplete(draft) && (
                  <p className="text-xs text-slate-500">Enter the country and industry, and select a size, to continue.</p>
                )}
              </div>
            )}

            {stage === 1 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {DATA_FLAGS.map((f) => {
                    const on = Boolean(draft[f.key]);
                    return (
                      <button
                        key={String(f.key)}
                        type="button"
                        onClick={() => set(f.key, !on as never)}
                        aria-pressed={on}
                        className={cx(
                          "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                          on ? "border-gold-400/40 bg-gold-400/10" : "border-phantix-700 bg-phantix-900/60 hover:border-phantix-600",
                        )}
                      >
                        <span className="min-w-0">
                          <span className={cx("block text-sm", on ? "text-gold-200" : "text-slate-300")}>{f.label}</span>
                          <span className="block text-xs text-slate-500">{f.hint}</span>
                        </span>
                        <span className={cx("chip !py-0.5 shrink-0", on ? "border-gold-400/40 text-gold-200" : "border-phantix-700 text-slate-500")}>
                          {on ? "Yes" : "No"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="sm:w-1/2">
                  <label className="label" htmlFor="cp-retention">Data retention (days)</label>
                  <input
                    id="cp-retention"
                    type="number"
                    min={0}
                    value={draft.data_retention_period_days ?? ""}
                    onChange={(e) => set("data_retention_period_days", e.target.value === "" ? null : Number(e.target.value))}
                    className="input"
                  />
                </div>
              </div>
            )}

            {stage === 2 && (
              <div className="space-y-4">
                <div>
                  <p className="label">Cloud providers</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CLOUD_PROVIDERS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggleList("cloud_providers", p)}
                        aria-pressed={cloud.includes(p)}
                        className={cx(
                          "chip uppercase transition-colors",
                          cloud.includes(p) ? "border-gold-400/40 bg-gold-400/10 text-gold-200" : "border-phantix-700 text-slate-400 hover:text-slate-200",
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="cp-customer-countries">Customer countries</label>
                  <input
                    id="cp-customer-countries"
                    value={((draft.customer_countries as string[] | undefined) ?? []).join(", ")}
                    onChange={(e) => set("customer_countries", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                    placeholder="NG, GH, KE"
                    className="input"
                  />
                  <p className="mt-1 text-xs text-slate-500">Separate the countries with commas.</p>
                </div>
              </div>
            )}

            {stage === 3 && (
              <div>
                {recsNote ? (
                  <p className="text-sm text-slate-500">{recsNote}</p>
                ) : !recs?.length ? (
                  <EmptyState icon={<Sparkles size={20} />} title="No recommendations yet" body="Add more detail to the earlier stages to get framework suggestions." />
                ) : (
                  <ul className="divide-y divide-phantix-700/40 rounded-md border border-phantix-700/40">
                    {recs.map((r, i) => {
                      const rec = (r ?? {}) as Record<string, unknown>;
                      const name = rec.name ?? rec.framework_id ?? rec.id ?? `Framework ${i + 1}`;
                      return (
                        <li key={i} className="px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-slate-200">{String(name)}</span>
                            {rec.score != null && (
                              <span className="chip !py-0.5 border-gold-400/30 text-gold-200" title="How strongly this framework applies">
                                {String(rec.score)}% fit
                              </span>
                            )}
                          </div>
                          {(rec.reason ?? rec.rationale) != null && (
                            <p className="mt-0.5 text-[13px] leading-5 text-slate-400">{String(rec.reason ?? rec.rationale)}</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/compliance/gaps" className="btn-primary !py-2 text-sm">
                    See your compliance gaps <ArrowRight size={14} />
                  </Link>
                  <Link to="/compliance/questionnaire" className="btn-secondary !py-2 text-sm">Start the questionnaire</Link>
                </div>
              </div>
            )}

            {stage < 3 && (
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-phantix-700/40 pt-4">
                <button
                  type="button"
                  onClick={() => setStage((stage - 1) as StageIndex)}
                  disabled={stage === 0}
                  className="btn-ghost !py-2 text-sm disabled:invisible"
                >
                  <ArrowLeft size={14} /> Back
                </button>
                <button type="button" onClick={() => void advance()} disabled={saving || !canContinue} className="btn-primary !py-2 text-sm">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {stage === 2 ? "Save and see frameworks" : "Save and continue"}
                  {!saving && <ArrowRight size={14} />}
                </button>
              </div>
            )}
          </Card>

          {profile?.updated_at && (
            <p className="mt-2 text-center text-xs text-slate-500">Last saved {new Date(profile.updated_at).toLocaleString()}</p>
          )}
        </div>
      )}
    </div>
  );
}

function toDraft(row: BusinessProfile): BusinessProfileUpdate {
  return {
    country: row.country,
    customer_countries: (row.customer_countries ?? []).map(String),
    industry: row.industry,
    company_size: row.company_size,
    handles_personal_data: row.handles_personal_data,
    handles_health_records: row.handles_health_records,
    handles_payment_cards: row.handles_payment_cards,
    handles_government_contracts: row.handles_government_contracts,
    handles_financial_transactions: row.handles_financial_transactions,
    cloud_providers: (row.cloud_providers ?? []).map(String),
    has_public_apis: row.has_public_apis,
    uses_ai: row.uses_ai,
    data_retention_period_days: row.data_retention_period_days,
  };
}
