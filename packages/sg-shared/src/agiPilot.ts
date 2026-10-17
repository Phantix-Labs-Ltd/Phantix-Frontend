/**
 * Semi-unsupervised pilot posture — mirrors
 * ``app/engines/ai_engine/agi/pilot_posture.py``.
 *
 * Default product posture for AGI sessions:
 * - autonomy capped at medium (recon/read/active_scan auto; exploit/brute gated)
 * - no staging auto-blanket
 * - dangerous ROE caps stripped
 * - hard stop default 120 minutes
 * - customer-visible findings only after confirmed verification
 */

import type { AgiSession } from "./types";

export type AgiAutonomy = "low" | "medium" | "high";

export const AGI_PILOT = {
  defaultAutonomy: "medium" as AgiAutonomy,
  maxAutonomy: "medium" as AgiAutonomy,
  defaultHardStopMinutes: 120,
  dangerousRoeCaps: ["exploit", "brute", "destructive"] as const,
} as const;

export type AgiPilotPostureSummary = {
  enabled: boolean;
  autonomy: AgiAutonomy | string;
  autonomyClampedFrom: string | null;
  blanketApproval: boolean;
  hardStopMinutes: number | null;
  hardStopAt: string | null;
  roeStripped: string[];
};

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Cap autonomy at medium unless the caller explicitly allows high (lab opt-out). */
export function clampAgiAutonomy(
  level?: AgiAutonomy | string | null,
  opts?: { allowHigh?: boolean },
): AgiAutonomy {
  const lvl = String(level || AGI_PILOT.defaultAutonomy).trim().toLowerCase();
  if (lvl === "low") return "low";
  if (lvl === "high" && opts?.allowHigh) return "high";
  return "medium";
}

/** Read the pilot posture blob the backend stamps on ``session.meta``. */
export function readAgiPilotPosture(session: AgiSession | null | undefined): AgiPilotPostureSummary {
  const meta = asObj(session?.meta);
  const pilot = asObj(meta.pilot_posture);
  const enabled =
    typeof pilot.enabled === "boolean"
      ? pilot.enabled
      : meta.pilot_posture === true || Object.keys(pilot).length > 0
        ? Boolean(pilot.enabled !== false)
        : true; // product default: assume pilot until told otherwise
  const autonomyRaw = String(
    pilot.autonomy ?? meta.autonomy ?? AGI_PILOT.defaultAutonomy,
  ).toLowerCase();
  const hardStopMinutes =
    typeof pilot.hard_stop_minutes === "number"
      ? pilot.hard_stop_minutes
      : typeof meta.hard_stop_minutes === "number"
        ? (meta.hard_stop_minutes as number)
        : null;
  const hardStopAt = String(pilot.hard_stop_at ?? meta.hard_stop_at ?? "").trim() || null;
  const roeStripped = Array.isArray(pilot.roe_stripped)
    ? (pilot.roe_stripped as unknown[]).map(String)
    : [];
  return {
    enabled,
    autonomy: autonomyRaw || AGI_PILOT.defaultAutonomy,
    autonomyClampedFrom:
      pilot.autonomy_clamped_from == null ? null : String(pilot.autonomy_clamped_from),
    blanketApproval: Boolean(meta.blanket_approval ?? pilot.blanket_approval ?? false),
    hardStopMinutes,
    hardStopAt,
    roeStripped,
  };
}

/**
 * Wall-clock hard-stop remaining for the session, or null when unbounded /
 * unknown. Prefer absolute ``hard_stop_at`` when present.
 */
export function agiHardStopRemaining(
  session: AgiSession | null | undefined,
  nowMs: number = Date.now(),
): { label: string; minutes: number; urgent: boolean } | null {
  const posture = readAgiPilotPosture(session);
  let deadlineMs = 0;
  if (posture.hardStopAt) {
    const t = Date.parse(posture.hardStopAt);
    if (Number.isFinite(t)) deadlineMs = t;
  }
  if (!deadlineMs && posture.hardStopMinutes && session?.started_at) {
    const start = Date.parse(session.started_at);
    if (Number.isFinite(start)) {
      deadlineMs = start + posture.hardStopMinutes * 60_000;
    }
  }
  if (!deadlineMs) return null;
  const remaining = Math.max(0, Math.round((deadlineMs - nowMs) / 60_000));
  const label =
    remaining <= 0 ? "hard stop" : remaining < 60 ? `${remaining}m left` : `${Math.floor(remaining / 60)}h ${remaining % 60}m left`;
  return { label, minutes: remaining, urgent: remaining > 0 && remaining <= 15 };
}

/** Customer-console visibility — confirmed / verified / promoted only. */
export function isCustomerAgiFindingVisible(finding: Record<string, unknown> | null | undefined): boolean {
  if (!finding) return false;
  const status = String(finding.status ?? "").trim().toLowerCase();
  if (status === "verified" || status === "promoted" || status === "validated") return true;
  if (status === "dismissed" || status === "rejected") return false;
  const verification = asObj(finding.verification);
  const verdict = String(verification.verdict ?? verification.status ?? "").trim().toLowerCase();
  if (["confirmed", "verified", "true_positive", "true-positive"].includes(verdict)) return true;
  if (["rejected", "false_positive", "false-positive", "dismissed"].includes(verdict)) return false;
  return false;
}

/** Short operator-facing copy for the metrics / status strip. */
export function agiPilotStatusCopy(session: AgiSession | null | undefined): string {
  const p = readAgiPilotPosture(session);
  if (!p.enabled) return "Lab mode — offensive auto-caps may be enabled";
  const bits = [
    `Pilot · autonomy ${p.autonomy}`,
    "exploit/brute gated",
    p.blanketApproval ? "blanket on" : "per-action approvals",
  ];
  if (p.hardStopMinutes) bits.push(`hard stop ${p.hardStopMinutes}m`);
  return bits.join(" · ");
}
