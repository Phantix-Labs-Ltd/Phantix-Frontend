import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, Circle, X } from "lucide-react";
import { api, isDemoMode } from "../api";
import { PLATFORM_URL } from "../config";
import { useStore } from "../store";
import { cx } from "../utils";

type MilestoneKey =
  | "email_verified" | "first_asset" | "quick_scan_done" | "security_db_connected"
  | "first_finding_viewed" | "teammate_invited" | "dual_control_enabled" | "first_vapt";
type Onboarding = { milestones: { key: MilestoneKey; done_at: string | null; optional?: boolean }[]; dismissed: boolean };

/** Same labels as the platform checklist; every step is done on the platform. */
const META: Record<MilestoneKey, { label: string; path: string }> = {
  email_verified: { label: "Verify your email", path: "/setup" },
  first_asset: { label: "Add a domain or repo", path: "/get-started" },
  quick_scan_done: { label: "Run a Quick Scan", path: "/get-started" },
  security_db_connected: { label: "Connect your security database", path: "/connections" },
  first_finding_viewed: { label: "Review your first findings", path: "/get-started" },
  teammate_invited: { label: "Invite a teammate", path: "/users" },
  dual_control_enabled: { label: "Turn on dual control", path: "/identity#dual-control" },
  first_vapt: { label: "Run your first VAPT", path: "/applications" },
};

/**
 * The onboarding checklist inside the applications. Hidden in the demo, on a
 * backend without milestones, once dismissed, and once every required step is
 * done. Dual control only shows once the org has a second person.
 */
export default function OnboardingChecklist() {
  const { dualControl } = useStore();
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
  const items = data.milestones.filter((m) => META[m.key] && (m.key !== "dual_control_enabled" || hasTeam || m.done_at));
  if (items.every((m) => m.done_at || m.optional)) return null;
  const done = items.filter((m) => m.done_at).length;

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
            {m.done_at ? (
              <span className="flex items-center gap-2 px-2 py-1.5 text-[13px] text-slate-500 line-through">
                <CheckCircle2 size={14} className="shrink-0 text-emerald-400" /> {META[m.key].label}
              </span>
            ) : (
              <a
                href={`${PLATFORM_URL}${META[m.key].path}`}
                target="_blank" rel="noopener noreferrer"
                className={cx("flex items-center gap-2 rounded px-2 py-1.5 text-[13px] text-slate-200 hover:bg-phantix-800")}
              >
                <Circle size={14} className="shrink-0 text-slate-600" />
                <span className="min-w-0 flex-1">{META[m.key].label}</span>
                {m.optional && <span className="text-[11px] text-slate-600">optional</span>}
                <ArrowUpRight size={12} className="shrink-0 text-gold-400" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
