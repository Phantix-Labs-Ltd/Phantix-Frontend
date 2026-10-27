import React, { useMemo } from "react";
import { BadgeCheck, Eye } from "lucide-react";
import { useStore } from "@sg/store";
import { cx } from "@sg/utils";
import { ROLE_LABEL, type AssuranceMe, type TeamMember, type TeamRole } from "@sg/assurance";

/*
 * Who may do what on one audit.
 *
 * Two things decide it, and every tab reads the same answer so a page never
 * says one thing and shows another:
 *  - the caller's role on this audit's team, assigned during audit setup
 *    (lead auditor, auditor, reviewer, auditee, observer);
 *  - their organisation permission from `_meta/me`: recording audit work needs
 *    `compliance.audit`, which an org admin holds once operate mode is
 *    unlocked. Without the unlock everyone is read-only.
 * An audit with no team yet falls back to the organisation permission alone.
 * The server still enforces its own rules (an auditee can never record tests).
 */

export type TeamStanding = TeamRole | "not_on_team" | "no_team";

export interface AuditAccess {
  standing: TeamStanding;
  /** The org permission (from `_meta/me`) and why audit work is blocked, if it is. */
  org: AssuranceMe;
  orgBlock: string | null;
  team: TeamMember[];
  lead: TeamMember | null;
  /** True when the caller can record results on this audit: the plain "can you audit" answer. */
  audit: boolean;
  record: boolean;
  signOff: boolean;
  requestEvidence: boolean;
  reviewEvidence: boolean;
  submitEvidence: boolean;
  raiseFinding: boolean;
  respond: boolean;
  workpapers: boolean;
  report: boolean;
  manageSetup: boolean;
  reloadTeam: () => void;
}

const AUDITING: TeamRole[] = ["lead", "auditor"];

export const TEAM_ROLES: TeamRole[] = ["lead", "auditor", "reviewer", "auditee", "observer"];
/** One line per audit role, shown under the team list. */
export const ROLE_DUTY: Record<TeamRole, string> = {
  lead: "Runs the audit: everything an auditor does, plus the report.",
  auditor: "Requests and reviews evidence, records results, raises findings.",
  reviewer: "Signs off tests other people recorded. Doesn't record results.",
  auditee: "Provides evidence and responds to findings. Can't record results.",
  observer: "Can view the audit. Can't change it.",
};
const ORG_ROLE_LABEL: Record<string, string> = {
  org_admin: "Org admin", security_admin: "Security admin", operator: "Operator", viewer: "Viewer",
  org_owner: "Company account", initiator: "Initiator", authorizer: "Authorizer",
};

/** Why the organisation permission stops audit work, in words a user can act on. */
function orgBlockReason(org: AssuranceMe): string | null {
  if (org.can_audit) return null;
  if (org.role === "no_session") return "operate mode is locked. Unlock it with the emailed code to make changes.";
  const label = ORG_ROLE_LABEL[org.role] ?? org.role;
  return `your organisation role (${label}) can't record audit work. An org admin can.`;
}

export function useAuditAccess(org: AssuranceMe, team: TeamMember[], reloadTeam: () => void): AuditAccess {
  const { session } = useStore();
  const email = (session?.userEmail || org.email || "").trim().toLowerCase();
  return useMemo(() => {
    const mine = team.find((m) => !!m.principal_email && m.principal_email.toLowerCase() === email);
    const standing: TeamStanding = team.length === 0 ? "no_team" : mine ? mine.role : "not_on_team";
    const has = (roles: TeamRole[]) => standing === "no_team" || (standing !== "not_on_team" && roles.includes(standing));
    const audits = org.can_audit;
    const record = audits && has(AUDITING);
    return {
      standing,
      org,
      orgBlock: orgBlockReason(org),
      team,
      lead: team.find((m) => m.role === "lead") ?? null,
      audit: record,
      record,
      signOff: audits && has([...AUDITING, "reviewer"]),
      requestEvidence: record,
      reviewEvidence: record,
      submitEvidence: standing === "no_team" || has(["auditee", ...AUDITING]),
      raiseFinding: record,
      respond: standing === "no_team" || has(["auditee"]),
      workpapers: record,
      report: audits && has(["lead"]),
      manageSetup: org.can_manage,
      reloadTeam,
    };
  }, [org, team, email, reloadTeam]);
}

export const AccessContext = React.createContext<AuditAccess | null>(null);
export function useAccess(): AuditAccess {
  const a = React.useContext(AccessContext);
  if (!a) throw new Error("useAccess outside an audit workspace");
  return a;
}

export type AuditPage = "overview" | "scope" | "controls" | "evidence" | "findings" | "readiness" | "workpapers" | "reports";

type Kind = "auditing" | "reviewer" | "auditee" | "observer" | "not_on_team" | "no_team";
const kindOf = (s: TeamStanding): Kind =>
  s === "lead" || s === "auditor" ? "auditing" : s === "reviewer" || s === "auditee" || s === "observer" ? s : s;

/** What this person does on each page. */
const PAGE_COPY: Record<AuditPage, Record<Kind, string>> = {
  overview: {
    auditing: "You run the testing: request and review evidence, record a result for each control, and raise findings.",
    reviewer: "You sign off tests that other people recorded. You don't record results yourself.",
    auditee: "You provide evidence and respond to findings. The auditors record the results.",
    observer: "You can follow this audit but not change it.",
    not_on_team: "You're not on this audit's team, so you can only view it. Ask the lead auditor to add you below.",
    no_team: "No one is assigned to this audit yet, so your organisation role decides what you can do. Assign roles under Audit team.",
  },
  scope: {
    auditing: "Scope is set during audit setup. Org admins can change it here.",
    reviewer: "Scope is set during audit setup. Org admins can change it here.",
    auditee: "This is what's being audited. Org admins can change it.",
    observer: "This is what's being audited. Org admins can change it.",
    not_on_team: "This is what's being audited. Org admins can change it.",
    no_team: "Scope is set during audit setup. Org admins can change it here.",
  },
  controls: {
    auditing: "Record a result for each control. Automated controls come with a suggested result; manual controls need you to inspect the evidence first.",
    reviewer: "Auditors record results here. You sign off their recorded tests at the bottom of this page.",
    auditee: "Auditors record results here. Your part is on the Evidence tab: provide what each request asks for.",
    observer: "Only the lead auditor and auditors record results.",
    not_on_team: "Only the lead auditor and auditors on this audit record results.",
    no_team: "Record a result for each control. Automated controls come with a suggested result; manual controls need you to inspect the evidence first.",
  },
  evidence: {
    auditing: "Review what's been submitted: accept it, send it back with a note, or waive requests that don't apply.",
    reviewer: "Auditors review evidence here. You can follow its progress.",
    auditee: "Submit evidence for each open request. The auditors review it and may send it back with a note.",
    observer: "You can follow the evidence requests but not change them.",
    not_on_team: "Auditees submit evidence here and auditors review it.",
    no_team: "Submit evidence for each request, then review and accept it.",
  },
  findings: {
    auditing: "Raise findings when a control fails, and retest them once they're fixed.",
    reviewer: "Auditors raise and retest findings. You can read them here.",
    auditee: "Respond to each finding with your plan and a target date.",
    observer: "You can read the findings but not change them.",
    not_on_team: "Auditors raise findings and auditees respond to them.",
    no_team: "Raise findings when a control fails, respond with a plan, and retest once fixed.",
  },
  readiness: {
    auditing: "Readiness is calculated from the recorded results. There's nothing to do here.",
    reviewer: "Readiness is calculated from the recorded results. There's nothing to do here.",
    auditee: "Readiness is calculated from the recorded results. There's nothing to do here.",
    observer: "Readiness is calculated from the recorded results.",
    not_on_team: "Readiness is calculated from the recorded results.",
    no_team: "Readiness is calculated from the recorded results. There's nothing to do here.",
  },
  workpapers: {
    auditing: "Keep your working notes for each audit step.",
    reviewer: "Auditors keep their working notes here. You can read them.",
    auditee: "Auditors keep their working notes here.",
    observer: "Auditors keep their working notes here.",
    not_on_team: "Auditors keep their working notes here.",
    no_team: "Keep your working notes for each audit step.",
  },
  reports: {
    auditing: "The lead auditor generates and publishes the audit report.",
    reviewer: "The lead auditor generates and publishes the audit report.",
    auditee: "The lead auditor generates and publishes the audit report. You can read it here once it's out.",
    observer: "The lead auditor publishes the report here.",
    not_on_team: "The lead auditor publishes the report here.",
    no_team: "Generate and publish the audit report.",
  },
};

/** The action this page is for, so the notice can say whether the caller is blocked from it. */
const PAGE_ACTION: Record<AuditPage, keyof Pick<AuditAccess, "record" | "reviewEvidence" | "submitEvidence" | "raiseFinding" | "respond" | "workpapers" | "report" | "manageSetup"> | null> = {
  overview: "record", scope: "manageSetup", controls: "record", evidence: "reviewEvidence", findings: "raiseFinding",
  readiness: null, workpapers: "workpapers", reports: "report",
};

/**
 * The first thing on every audit page: your role on this audit, whether you
 * can audit, and what you do on this page. When the role allows the page's
 * action but the organisation permission doesn't, it says what to fix.
 */
export function RoleNotice({ page }: { page: AuditPage }) {
  const a = useAccess();
  const kind = kindOf(a.standing);
  const roleText =
    a.standing === "not_on_team" ? "Not on this audit's team"
      : a.standing === "no_team" ? "No team assigned"
        : ROLE_LABEL[a.standing];
  const action = PAGE_ACTION[page];
  // The role would allow this page's action, but the organisation permission doesn't.
  const roleAllows = kind === "auditing" || kind === "no_team";
  const blocked = action && action !== "manageSetup" && roleAllows && !a[action] && a.orgBlock
    ? `Your audit role allows this, but ${a.orgBlock}`
    : null;

  return (
    <div role="note" className="mb-4 flex flex-wrap items-start gap-x-4 gap-y-2 rounded-md border border-phantix-700 bg-phantix-900 px-3.5 py-2.5">
      <div className="flex min-w-[12rem] items-center gap-2">
        <span className="text-[12px] text-slate-500">Your role</span>
        <span className="text-sm font-medium text-white">{roleText}</span>
        <span className={cx(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
          a.audit ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-phantix-600 text-slate-400",
        )}>
          {a.audit ? <BadgeCheck size={12} /> : <Eye size={12} />}
          {a.audit ? "Can audit" : "Can't audit"}
        </span>
      </div>
      <div className="min-w-[16rem] flex-1 text-[13px] leading-5 text-slate-400">
        <p>{PAGE_COPY[page][kind]}</p>
        {blocked && <p className="mt-1 text-gold-300">{blocked}</p>}
      </div>
    </div>
  );
}
