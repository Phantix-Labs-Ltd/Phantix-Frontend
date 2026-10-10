/**
 * The guided tour for each application.
 *
 * Steps point at `data-tour` anchors in the shared shell: `nav-<section>` (the
 * sidebar group, slugged from its label), `search`, `app-switcher`,
 * `assistant`, `notifications`, `account`, and Attack's `agent-tab`. An anchor
 * that is not on screen shows its step as a centred card, so phones get the
 * same tour without a sidebar.
 *
 * Bump TOUR_VERSION when a tour changes enough that people should see it again.
 */
import type { TourStep } from "./components/GuidedTour";
import type { ApplicationKey } from "./shell/types";

export const TOUR_VERSION = 1;

/** `data-tour` anchor for a sidebar group, from its label. */
export const navAnchor = (label: string) =>
  `nav-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;

const SHARED_END: TourStep[] = [
  {
    anchor: "search",
    title: "Search everything",
    body: "Press Ctrl K (or ⌘ K) to jump to any page, asset or finding without using the menu.",
  },
  {
    anchor: "app-switcher",
    title: "Switch applications",
    body: "SecureGraph has four applications: Core, Attack, Defend and Code. Switch here, and you stay signed in.",
  },
  {
    anchor: "assistant",
    title: "Ask the AI Assistant",
    body: "Ask what a finding means, how to fix it, or where something is. It answers from your own data.",
  },
  {
    anchor: "account",
    title: "Your account and help",
    body: "Platform settings, documentation and support are here. Choose “Take the tour” to see this tour again.",
  },
];

export const TOURS: Record<ApplicationKey, TourStep[]> = {
  core: [
    {
      title: "Welcome to Core",
      body: "Core is the centre of SecureGraph. Your assets, findings, reports and approvals are in one place. This tour takes about a minute.",
    },
    {
      anchor: navAnchor("Overview"),
      title: "Your security at a glance",
      body: "The dashboard shows open findings, risk and recent activity. Analytics shows how they change over time.",
    },
    {
      anchor: navAnchor("Security graph"),
      title: "Start with your assets",
      body: "Add the domains, IP addresses, APIs and repositories that you own. Every test starts from an asset, and integrations bring in more.",
    },
    {
      anchor: navAnchor("Findings"),
      title: "Work your findings",
      body: "The findings tracker is your fix list. Verify candidates, assign owners, open fix guidance, then build a report from the result.",
    },
    {
      anchor: navAnchor("Governance"),
      title: "Approvals and the audit trail",
      body: "Steps that need a second approval wait in Authorizations for your authorizer. The audit trail records every action.",
    },
    {
      anchor: navAnchor("Assurance"),
      title: "Prove it to others",
      body: "Run assurance engagements, set your regulatory profile and issue attestations for customers and auditors.",
    },
    ...SHARED_END,
  ],
  attack: [
    {
      title: "Welcome to Attack",
      body: "Attack finds weaknesses before an attacker does: scans, VAPT campaigns and the Pentest Agent. This tour takes about a minute.",
    },
    {
      anchor: navAnchor("Scope"),
      title: "Set your scope first",
      body: "Targets and the pentest scope decide what may be tested. Verify that you own a target before active testing starts.",
    },
    {
      anchor: navAnchor("Testing"),
      title: "Scan web, API and mobile",
      body: "Run scans against your targets. Results go to the findings tracker, where you verify them and track the fix.",
    },
    {
      anchor: navAnchor("VAPT"),
      title: "Run a VAPT campaign",
      body: "A campaign tests a scope end to end and produces a report. On Campaigns, “Run your first VAPT” guides you step by step.",
    },
    {
      anchor: "agent-tab",
      title: "The Pentest Agent",
      body: "Point at the right edge of the screen to open the autonomous Pentest Agent. Risky steps wait for approval before they run.",
    },
    ...SHARED_END,
  ],
  defend: [
    {
      title: "Welcome to Defend",
      body: "Defend watches what you own and helps you respond: exposure, risk, compliance and the SOC. This tour takes about a minute.",
    },
    {
      anchor: navAnchor("Assets and exposure"),
      title: "Know your exposure",
      body: "See your assets, what each one exposes to the internet, and how they connect in the asset graph.",
    },
    {
      anchor: navAnchor("Risk and monitoring"),
      title: "Manage risk",
      body: "The risk register ranks what matters most. Propose a treatment, and your authorizer approves it.",
    },
    {
      anchor: navAnchor("Compliance"),
      title: "Track compliance",
      body: "Choose your frameworks, answer the questionnaire and see the gaps. Evidence connectors collect proof for you.",
    },
    {
      anchor: navAnchor("SOC"),
      title: "Your security operations centre",
      body: "Security alerts, the war room, playbooks mapped to MITRE ATT&CK, and an advisor for the next step.",
    },
    {
      anchor: navAnchor("Detection and logs"),
      title: "Detection and logs",
      body: "Turn on detection packs, connect log sources and agents, and set how long logs are kept.",
    },
    {
      anchor: navAnchor("Threat response"),
      title: "Respond to incidents",
      body: "Incidents collect related alerts in one place. Threat intel adds context about who is behind them.",
    },
    ...SHARED_END,
  ],
  code: [
    {
      title: "Welcome to Code",
      body: "Code reviews your source for security issues and helps you fix them in pull requests. This tour takes about a minute.",
    },
    {
      anchor: navAnchor("Source control"),
      title: "Connect your source control",
      body: "Start here: connect GitHub, GitLab or Gitea so that Code can read your repositories.",
    },
    {
      anchor: navAnchor("Code review"),
      title: "Review your code",
      body: "Run security reviews and scans on your repositories and pull requests. Each finding shows the file and line.",
    },
    {
      anchor: navAnchor("Automation"),
      title: "Fix it automatically",
      body: "AutoFix opens a pull request with the fix. Continuous PR and CI/CD monitoring check every new change.",
    },
    {
      anchor: navAnchor("Design"),
      title: "Threat models",
      body: "Describe your product and get a threat model of how it could be attacked, before the code exists.",
    },
    ...SHARED_END,
  ],
};

export function tourStorageKey(application: ApplicationKey): string {
  return `sg.tour.${application}.v${TOUR_VERSION}`;
}
