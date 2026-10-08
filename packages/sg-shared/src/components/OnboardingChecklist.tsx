import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, Circle, X } from "lucide-react";
import { api, isDemoMode } from "../api";
import { PLATFORM_URL } from "../config";
import { applicationHandoffHref, type ApplicationKey } from "../applications";
import { useVerifiedDomains } from "../platformSetup";
import { useStore } from "../store";
import { cx } from "../utils";

type MilestoneKey =
  | "email_verified" | "first_asset" | "quick_scan_done" | "security_db_connected"
  | "first_finding_viewed" | "teammate_invited" | "dual_control_enabled" | "first_vapt";
type Onboarding = { milestones: { key: MilestoneKey; done_at: string | null; optional?: boolean }[]; dismissed: boolean };

/** Same labels as the platform checklist. Paths are on the Platform unless an
 *  application is named (VAPT runs in Attack). */
const META: Record<MilestoneKey, { label: string; path: string; app?: ApplicationKey }> = {
  email_verified: { label: "Verify your email", path: "/setup" },
  first_asset: { label: "Add a domain or repo", path: "/get-started" },
  quick_scan_done: { label: "Run a Quick Scan", path: "/get-started" },
  security_db_connected: { label: "Connect your security database", path: "/connections" },
  first_finding_viewed: { label: "Review your first findings", path: "/get-started" },
  teammate_invited: { label: "Invite a teammate", path: "/users" },
  dual_control_enabled: { label: "Turn on dual control", path: "/identity#dual-control" },
  first_vapt: { label: "Run your first VAPT", path: "/vapt", app: "attack" },
};

type Row = { key: string; label: string; path: string; app?: ApplicationKey; done: boolean; optional: boolean };

/** Platform steps open in a new tab; an application step opens here, carrying
 *  this session across with a handoff so nobody has to sign in again. */
async function openRow(row: Row) {
  if (!row.app) {
    window.open(`${PLATFORM_URL}${row.path}`, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(await applicationHandoffHref(row.app, row.path));
}

/**
 * The onboarding checklist inside the applications. Hidden in the demo, on a
 * backend without milestones, once dismissed, and once every required step is
 * done. Dual control only shows once the org has a second person.
 */
export default function OnboardingChecklist() {
  const { dualControl } = useStore();
  const { verified, loaded: domainsLoaded } = useVerifiedDomains();
  const [data, setData] = useState<Onboarding | null>(null);

  useEffect(() => {
    if (isDemoMode()) return;
    let alive = true;
    api.get<Onboarding>("/org-users/onboarding")
      .then((res) => { if (alive && Array.isArray(res?.milestones)) setData(res); })
      .catch(() => { /* older backend: no checklist */ });
    return () => { alive = false; };
  }, []);

  if (!data || data.dismissed) return null;
  // A second person exists once an approver is assigned or dual control is on.
  const hasTeam = Boolean(dualControl.authorizer) || dualControl.policy_mode === "on" || dualControl.policy_mode === "enforced";
  const items: Row[] = data.milestones
    .filter((m) => META[m.key] && (m.key !== "dual_control_enabled" || hasTeam || m.done_at))
    .flatMap((m) => {
      const row: Row = { key: m.key, ...META[m.key], done: Boolean(m.done_at), optional: Boolean(m.optional) };
      // VAPT needs a verified domain, so that step comes right before it.
      if (m.key !== "first_vapt" || !domainsLoaded) return [row];
      const domain: Row = { key: "domain_verified", label: "Verify your domain", path: "/identity#domains", done: verified.length > 0 || row.done, optional: false };
      return [domain, row];
    });
  if (items.every((m) => m.done || m.optional)) return null;
  const done = items.filter((m) => m.done).length;

  const dismiss = () => {
    setData({ ...data, dismissed: true });
    void api.post("/org-users/onboarding/dismiss", {}).catch(() => undefined);
  };

  return (
    <section aria-labelledby="onboarding-title" className="mb-5 rounded-md border border-phantix-700 bg-phantix-900 p-4">
      <div className="flex items-center gap-3">
        <h2 id="onboarding-title" className="text-sm font-semibold text-white">Getting started</h2>
        <span className="text-xs text-slate-500">{done} of {items.length} done</span>
        <button type="button" onClick={dismiss} className="ml-auto rounded p-1 text-slate-500 hover:text-slate-300" aria-label="Hide getting started">
          <X size={14} />
        </button>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-phantix-700/50">
        <div className="h-full rounded-full bg-gold-400 transition-[width] duration-700" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((m) => (
          <li key={m.key}>
            {m.done ? (
              <span className="flex items-center gap-2 px-2 py-1.5 text-[13px] text-slate-500 line-through">
                <CheckCircle2 size={14} className="shrink-0 text-emerald-400" /> {m.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void openRow(m)}
                className={cx("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-slate-200 hover:bg-phantix-800")}
              >
                <Circle size={14} className="shrink-0 text-slate-600" />
                <span className="min-w-0 flex-1">{m.label}</span>
                {m.optional && <span className="text-[11px] text-slate-600">optional</span>}
                <ArrowUpRight size={12} className="shrink-0 text-gold-400" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
