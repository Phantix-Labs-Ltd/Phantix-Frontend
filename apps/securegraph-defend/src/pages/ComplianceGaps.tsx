import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Building2, CheckCircle2, ClipboardList, FileWarning, Flag, RefreshCw,
  ScanLine, ShieldAlert, ShieldCheck, Target,
} from "lucide-react";
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, PageBodySkeleton } from "@sg/ui";
import { api, ApiError } from "@sg/api";
import {
  EMPTY_GAPS, loadFrameworkRecommendations, loadGapAnalysis, loadProfile,
  type BusinessProfile, type GapAnalysis,
} from "@sg/complianceGrc";
import { useStore } from "@sg/store";
import { cx, titleCase } from "@sg/utils";
import DocLink from "@sg/components/DocLink";
import { CrossAppLink } from "@sg/components/CrossAppLink";
import { Pagination, usePaged } from "@sg/components/Pagination";

// ── Compliance gaps, told as a story ─────────────────────────────────────────
// The page answers four questions in order, all from backend data:
//   1. Where do we stand?            GET /compliance/gaps (gaps, controls touched)
//   2. Why does this apply to us?    GET /compliance/profile + /compliance/recommendations
//   3. Why are we not compliant?     gap mappings: findings that prove a control
//                                    fails, and controls with no evidence at all
//   4. What do we do about it?       gap recommendations, ordered by priority
// The full control list stays at the bottom as the reference.

const RISK_ORDER = ["critical", "high", "medium", "low"] as const;

const RISK_TONE: Record<string, string> = {
  critical: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
  high: "border-severity-high/30 bg-severity-high/10 text-severity-high",
  medium: "border-severity-medium/30 bg-severity-medium/10 text-severity-medium",
  low: "border-severity-low/30 bg-severity-low/10 text-severity-low",
};

// What a gap can cost, per framework. The backend explains why a framework
// applies; this names the consequence in the same plain terms. Unknown
// frameworks fall back to the generic line.
const STAKES: Record<string, string> = {
  ndpr: "The NDPC can investigate and fine. Under the NDPA 2023 a major data controller can be fined the higher of ₦10 million or 2% of annual gross revenue.",
  ndpa_2023: "The NDPC can investigate and fine. A major data controller can be fined the higher of ₦10 million or 2% of annual gross revenue.",
  pci_dss: "Your acquirer can fine you, raise your processing fees or stop card acceptance until you show compliance.",
  gdpr: "Regulators can fine up to 4% of global annual turnover, and EU or UK customers can refuse to share data with you.",
  iso27001: "Without certification you fail vendor reviews. Large customers and partners often make it a condition of the contract.",
  soc2: "Business customers ask for a SOC 2 report in procurement. A gap delays or loses the deal.",
  cbn_cybersecurity_2022: "The CBN supervises this framework. A gap can lead to sanctions and to findings in your next examination.",
};
const DEFAULT_STAKES = "A gap here weakens your position in audits, customer reviews and incident response.";

// Profile facts that pull frameworks in. Each one is a reason the org cannot opt out.
const PROFILE_TRIGGERS: { key: keyof BusinessProfile; label: string }[] = [
  { key: "handles_personal_data", label: "Processes personal data" },
  { key: "handles_payment_cards", label: "Handles payment cards" },
  { key: "handles_financial_transactions", label: "Moves money" },
  { key: "handles_health_records", label: "Holds health records" },
  { key: "handles_government_contracts", label: "Works with government" },
  { key: "has_public_apis", label: "Runs public APIs" },
  { key: "uses_ai", label: "Uses AI" },
];

interface FrameworkRec {
  framework_id: string;
  name?: string;
  score?: number;
  reason?: string;
}

interface Mapping {
  finding_id?: number | string;
  severity?: string;
  framework_id?: string;
  control_id?: string;
  relationship?: string;
  title?: string;
}

interface Recommendation {
  title?: string;
  recommendation?: string;
  action?: string;
  summary?: string;
  detail?: string;
  description?: string;
  priority?: string;
  control_ids?: string[];
}

function text(v: unknown, fallback = "Not set"): string {
  return v == null || v === "" ? fallback : String(v);
}

// The live API and the demo fixture do not name fields the same way, and rows
// can nest the control as an object. Read every row through these helpers so
// a missing `framework_id` never silently counts a framework as clean.
type Row = Record<string, unknown>;

function pick(row: Row, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v == null || v === "") continue;
    if (typeof v === "object") {
      const o = v as Row;
      const inner = o.id ?? o.key ?? o.framework_id ?? o.code ?? o.slug;
      if (inner != null && inner !== "") return String(inner);
      continue;
    }
    return String(v);
  }
  return "";
}

function flatten(raw: unknown): Row {
  if (raw == null) return {};
  if (typeof raw === "string") {
    // "iso27001:A.8.5" or "iso27001/A.8.5"
    const [fw, ...rest] = raw.split(/[:/]/);
    return rest.length ? { framework_id: fw, control_id: rest.join(":") } : { control_id: raw };
  }
  const row = raw as Row;
  const control = row.control && typeof row.control === "object" ? (row.control as Row) : {};
  return { ...control, ...row };
}

const FW_KEYS = ["framework_id", "framework", "framework_key", "frameworkId", "framework_code", "framework_slug", "standard", "source_framework"];
const CONTROL_KEYS = ["control_id", "control_ref", "reference", "control_code", "controlId", "ref", "clause", "control"];

interface GapFinding {
  ref: string;
  title: string;
  severity: string;
}

interface Gap {
  key: string;
  framework: string;
  frameworkName: string;
  control: string;
  title: string;
  category: string;
  risk: string;
  findings: GapFinding[];
  actions: string[];
}

// The backend files findings that match no rule under this pseudo-framework.
const UNMAPPED = "unmapped";

function normGap(raw: unknown, i: number): Gap {
  const r = flatten(raw);
  const framework = pick(r, FW_KEYS).toLowerCase();
  const control = pick(r, CONTROL_KEYS);
  // A gap row from /compliance/gaps carries worst_status (gap | partial), not a
  // risk: gap means a critical or high finding matched, partial a lower one.
  const status = pick(r, ["worst_status", "status"]).toLowerCase();
  const risk =
    pick(r, ["risk", "severity", "risk_level", "priority", "criticality"]).toLowerCase() ||
    (status === "gap" ? "high" : status === "partial" ? "medium" : "");
  const findings = (Array.isArray(r.findings) ? (r.findings as Row[]) : []).map((f) => ({
    ref: pick(f, ["ref", "finding_ref", "id"]),
    title: pick(f, ["title", "finding_title", "name"]) || "Untitled finding",
    severity: pick(f, ["severity", "risk"]).toLowerCase(),
  }));
  return {
    key: `${framework}-${control}-${i}`,
    framework,
    frameworkName: pick(r, ["framework_name"]),
    control,
    title: pick(r, ["title", "control_title", "name", "requirement", "control_name", "description"]) || control,
    category: pick(r, ["category", "control_category", "domain", "family", "section", "theme", "group"]),
    risk,
    findings,
    actions: (Array.isArray(r.recommendations) ? r.recommendations : [])
      .map((x) => (typeof x === "string" ? x : pick(x as Row, ["title", "recommendation", "action"])))
      .filter((x): x is string => Boolean(x)),
  };
}

function normFramework(raw: unknown): string {
  if (raw && typeof raw === "object") return pick(raw as Row, ["framework_id", "id", "key", "code", "slug"]).toLowerCase();
  return String(raw ?? "").toLowerCase();
}

// A mapping row is evidence of failure when its status says so. The backend
// emits gap (critical or high finding) or partial (lower severity).
const FAILING = /fail|violat|non.?compl|not.?met|breach|gap|partial/i;

function riskRank(r: unknown): number {
  const i = RISK_ORDER.indexOf(String(r ?? "").toLowerCase() as (typeof RISK_ORDER)[number]);
  return i < 0 ? RISK_ORDER.length : i;
}

function frameworkLabel(id: string, recs: FrameworkRec[]): string {
  if (!id) return "Unassigned";
  return recs.find((r) => r.framework_id.toLowerCase() === id)?.name || id.replace(/_/g, " ").toUpperCase();
}

function RiskChip({ risk }: { risk: unknown }) {
  const r = String(risk ?? "").toLowerCase();
  if (!r) return <span className="text-xs text-slate-600">Not rated</span>;
  return <span className={cx("chip !py-0.5 capitalize", RISK_TONE[r] ?? "border-phantix-700 text-slate-400")}>{r}</span>;
}

/** Numbered section heading: the page reads top to bottom as one argument. */
function Chapter({ n, title, lead, children }: { n: number; title: string; lead: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold-400/40 font-mono text-xs font-semibold text-gold-300">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold text-slate-100">{title}</h2>
          <p className="mt-0.5 max-w-3xl text-sm leading-6 text-slate-400">{lead}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function ComplianceGaps() {
  const [data, setData] = useState<GapAnalysis>(EMPTY_GAPS);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [recs, setRecs] = useState<FrameworkRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [framework, setFramework] = useState("all");
  const { toast } = useStore();
  const [mappingBusy, setMappingBusy] = useState(false);

  const load = useCallback(async (campaign?: string) => {
    setLoading(true);
    setError(null);
    const id = Number(campaign);
    // The gap analysis is the page. Profile and recommendations add the "why";
    // they can be missing (no profile yet returns 400) without blocking it.
    const [gaps, prof, rec] = await Promise.allSettled([
      loadGapAnalysis(Number.isFinite(id) && id > 0 ? { campaignId: id } : {}),
      loadProfile(),
      loadFrameworkRecommendations(),
    ]);
    if (gaps.status === "fulfilled") {
      setData(gaps.value);
    } else {
      const e = gaps.reason;
      setError(
        e instanceof ApiError && e.status === 409
          ? "Security storage is not activated, so SecureGraph cannot read findings to build the mapping."
          : e instanceof Error ? e.message : "Failed to run gap analysis.",
      );
    }
    setProfile(prof.status === "fulfilled" ? prof.value : null);
    setRecs(
      rec.status === "fulfilled"
        ? ((rec.value?.recommendations ?? []) as FrameworkRec[]).filter((r) => r && r.framework_id)
        : [],
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Derived story data ─────────────────────────────────────────────────────
  const allGaps = useMemo(() => data.gaps.map(normGap), [data.gaps]);
  const gaps = useMemo(() => allGaps.filter((g) => g.framework !== UNMAPPED), [allGaps]);
  // Findings no rule could place: real work, but not a framework gap.
  const unmappedFindings = useMemo(
    () => allGaps.filter((g) => g.framework === UNMAPPED).reduce((n, g) => n + Math.max(1, g.findings.length), 0),
    [allGaps],
  );
  // controls_touched includes the gap rows; only rows that are not gaps add coverage.
  const touched = useMemo(
    () =>
      (data.controls_touched ?? [])
        .map(normGap)
        .filter((t) => t.framework !== UNMAPPED && !gaps.some((g) => g.framework === t.framework && g.control === t.control)),
    [data.controls_touched, gaps],
  );
  const mappings = useMemo(
    () => (data.mappings ?? []).map(flatten).filter((m) => pick(m, FW_KEYS).toLowerCase() !== UNMAPPED),
    [data.mappings],
  );
  // Per-framework gap counts from the summary, used when rows carry no framework.
  const summaryByFw = useMemo(() => {
    const raw = (data.summary as Row | undefined)?.by_framework;
    const out: Record<string, number> = {};
    if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw as Row)) out[k.toLowerCase()] = Number(v) || 0;
    return out;
  }, [data.summary]);
  const unattributed = gaps.filter((g) => !g.framework).length;
  const labels = useMemo<FrameworkRec[]>(() => {
    const out = [...recs];
    for (const g of allGaps) {
      if (g.frameworkName && g.framework && !out.some((r) => r.framework_id.toLowerCase() === g.framework)) {
        out.push({ framework_id: g.framework, name: g.frameworkName });
      }
    }
    return out;
  }, [recs, allGaps]);

  const perFramework = useMemo(() => {
    const ids = new Set<string>(data.frameworks.map(normFramework).filter(Boolean));
    for (const g of gaps) if (g.framework) ids.add(g.framework);
    for (const t of touched) if (t.framework) ids.add(t.framework);
    for (const k of Object.keys(summaryByFw)) ids.add(k);
    return [...ids]
      .map((id) => {
        const rows = gaps.filter((g) => g.framework === id);
        // Rows are the truth; the summary fills in only when rows cannot say.
        const gapCount = rows.length || (unattributed ? summaryByFw[id] ?? 0 : 0);
        const covered = touched.filter((t) => t.framework === id).length;
        const total = gapCount + covered;
        const severe = rows.filter((g) => riskRank(g.risk) <= 1).length;
        const rec = recs.find((r) => r.framework_id.toLowerCase() === id);
        return { id, gaps: gapCount, covered, total, severe, coverage: total ? Math.round((covered / total) * 100) : null, rec };
      })
      // Frameworks the backend says apply most strongly come first, then by exposure.
      .sort((a, b) => (b.rec?.score ?? -1) - (a.rec?.score ?? -1) || b.gaps - a.gaps || b.total - a.total);
  }, [data.frameworks, gaps, touched, summaryByFw, unattributed, recs]);

  // A framework with no evaluated controls is unknown, not compliant.
  const evaluated = perFramework.filter((f) => f.total > 0);
  const notEvaluated = perFramework.length - evaluated.length;
  const shown = perFramework.filter((f) => f.total > 0 || f.rec);

  const failing = useMemo(() => {
    const byFinding = new Map<string, { title: string; severity: string; controls: string[] }>();
    for (const m of mappings) {
      const rel = pick(m, ["relationship", "relation", "mapping_type", "status", "result", "outcome", "effect"]);
      if (!FAILING.test(rel)) continue;
      const title = pick(m, ["finding_title", "title", "finding_name", "name"]);
      const key = pick(m, ["finding_id", "finding_key", "finding"]) || title;
      const row = byFinding.get(key) ?? { title: title || "Untitled finding", severity: pick(m, ["severity", "finding_severity", "risk"]).toLowerCase(), controls: [] };
      row.controls.push(`${frameworkLabel(pick(m, FW_KEYS).toLowerCase(), labels)} ${pick(m, CONTROL_KEYS)}`.trim());
      byFinding.set(key, row);
    }
    return [...byFinding.values()].sort((a, b) => riskRank(a.severity) - riskRank(b.severity));
  }, [mappings, labels]);

  const noEvidence = useMemo(() => [...gaps].sort((a, b) => riskRank(a.risk) - riskRank(b.risk)), [gaps]);

  // The plan is built from the gap rows, not the raw recommendation list: the
  // backend emits one recommendation per rule match, so the same action repeats
  // per framework and carries no link to the work. Grouping by action and
  // attaching the findings behind each control gives steps a team can finish.
  const plan = useMemo(() => {
    const byAction = new Map<string, { title: string; detail?: unknown; priority: string; closes: Gap[]; findings: Map<string, GapFinding> }>();
    const add = (title: string, gap: Gap | null, priority: string, detail?: unknown) => {
      const key = title.trim().toLowerCase();
      const item = byAction.get(key) ?? { title: title.trim(), detail, priority, closes: [] as Gap[], findings: new Map<string, GapFinding>() };
      if (riskRank(priority) < riskRank(item.priority)) item.priority = priority;
      if (gap && !item.closes.includes(gap)) {
        item.closes.push(gap);
        for (const f of gap.findings) item.findings.set(f.ref || f.title, f);
      }
      byAction.set(key, item);
    };
    for (const g of gaps) for (const a of g.actions) add(a, g, g.risk);
    // Older payloads (and the demo) send recommendations with control_ids instead.
    if (byAction.size === 0) {
      for (const r of data.recommendations as Recommendation[]) {
        const ids = (r.control_ids ?? []).map((c) => String(c).toLowerCase());
        const title = text(r.title ?? r.recommendation ?? r.action ?? r.summary, "Recommendation");
        const closes = gaps.filter((g) => g.control && ids.includes(g.control.toLowerCase()));
        if (!closes.length) add(title, null, String(r.priority ?? "").toLowerCase(), r.detail ?? r.description);
        for (const g of closes) add(title, g, String(r.priority ?? g.risk).toLowerCase(), r.detail ?? r.description);
      }
    }
    return [...byAction.values()]
      .map((p) => ({
        ...p,
        findings: [...p.findings.values()].sort((a, b) => riskRank(a.severity) - riskRank(b.severity)),
        frameworks: [...new Set(p.closes.map((g) => g.framework).filter(Boolean))],
      }))
      .sort((a, b) => riskRank(a.priority) - riskRank(b.priority) || b.closes.length - a.closes.length);
  }, [data.recommendations, gaps]);

  const totalControls = gaps.length + touched.length;
  const frameworksWithGaps = evaluated.filter((f) => f.gaps > 0).length;
  const criticalGaps = gaps.filter((g) => g.risk === "critical").length;
  const triggers = profile ? PROFILE_TRIGGERS.filter((t) => Boolean(profile[t.key])) : [];

  // ── Reference list ─────────────────────────────────────────────────────────
  const visible = useMemo(
    () => (framework === "all" ? noEvidence : noEvidence.filter((g) => g.framework === framework)),
    [noEvidence, framework],
  );
  const { pageItems: gapPageItems, pagination: gapPagination } = usePaged(visible, "defend-compliance-gaps", framework);

  // Explicit findings to controls mapping (POST /compliance/map). The gaps view
  // already maps implicitly; this records the mapping, then reloads the story.
  const runMapping = async () => {
    setMappingBusy(true);
    try {
      const id = Number(campaignId);
      const res = await api.post<any>("/compliance/map", {
        use_org_findings: true,
        campaign_id: Number.isFinite(id) && id > 0 ? id : undefined,
        frameworks: framework !== "all" ? [framework] : undefined,
      });
      toast(
        "success",
        "Findings mapped",
        `${res?.findings_in ?? 0} finding(s) mapped across ${(res?.frameworks || []).length || 0} framework(s).`,
      );
      void load(campaignId);
    } catch (e: any) {
      toast("error", "Mapping failed", e?.message || "");
    } finally {
      setMappingBusy(false);
    }
  };

  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  // Say only what the data supports: frameworks that were never evaluated are
  // not counted, and an unmapped result is not reported as "0 failures".
  const verdict =
    totalControls === 0
      ? "SecureGraph has not evaluated any controls yet."
      : gaps.length === 0
        ? "Your evidence covers every control SecureGraph evaluated."
        : frameworksWithGaps > 0
          ? `You are not yet compliant with ${frameworksWithGaps} of the ${plural(evaluated.length, "framework")} SecureGraph evaluated.`
          : `You are not yet compliant: ${plural(gaps.length, "control has", "controls have")} no evidence.`;
  const findingsSentence =
    mappings.length === 0
      ? data.findings_in > 0
        ? `${plural(data.findings_in, "finding")} went into the analysis, but none is linked to a control yet. Run Map findings to link them.`
        : "No findings are linked to controls yet. Run Map findings to link your findings to controls."
      : failing.length > 0
        ? `${plural(failing.length, "of your own findings shows", "of your own findings show")} a control that fails today.`
        : "None of your mapped findings shows a failing control.";
  const who = profile
    ? [profile.industry, profile.country ? `registered in ${profile.country}` : null].filter(Boolean).join(", ")
    : null;

  return (
    <div>
      <PageHeader
        title="Compliance gaps"
        description="Why your organization is not compliant yet, what it must do, and why it matters."
        actions={<>
          <DocLink docId="howto-app-24" label="Compliance review how-to" />
          <div className="flex items-center gap-2">
            <input
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value.replace(/\D/g, ""))}
              placeholder="Campaign id (optional)"
              className="input w-44 !py-1.5 !text-xs"
              aria-label="Scope to a VAPT campaign"
            />
            <button onClick={() => void load(campaignId)} className="btn-secondary text-xs">
              <ScanLine size={13} className="mr-1.5 inline" /> Run
            </button>
            <button onClick={() => void runMapping()} disabled={mappingBusy} className="btn-ghost text-xs" title="Map findings to controls">
              {mappingBusy ? <RefreshCw size={13} className="mr-1.5 inline animate-spin" /> : <Target size={13} className="mr-1.5 inline" />} Map findings
            </button>
            <button onClick={() => void load(campaignId)} className="btn-ghost text-xs" title="Refresh">
              <RefreshCw size={13} className={cx("inline", loading && "animate-spin")} />
            </button>
          </div>
        </>}
      />

      {loading && !data.gaps.length ? (
        <PageBodySkeleton stats={4} variant="section" rows={4} />
      ) : error ? (
        <ErrorState title="Gap analysis unavailable" body={error} onRetry={() => void load(campaignId)} />
      ) : (
        <div className="space-y-8">
          {/* Verdict: the answer before the explanation. */}
          <Card className={cx(gaps.length ? "border-severity-high/30" : totalControls ? "border-emerald-400/30" : "")}>
            <div className="flex flex-wrap items-start gap-4">
              <span
                className={cx(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  gaps.length ? "bg-severity-high/10 text-severity-high" : "bg-emerald-400/10 text-emerald-400",
                )}
              >
                {gaps.length ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}
              </span>
              <div className="min-w-0 flex-1 basis-72">
                <p className="font-display text-lg font-semibold leading-snug text-slate-100">{verdict}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  {gaps.length
                    ? `${plural(gaps.length, "control fails", "controls fail")} because of open findings${criticalGaps ? `, ${criticalGaps} of them critical` : ""}. `
                    : ""}
                  {totalControls ? findingsSentence : "Run the analysis after SecureGraph has collected findings or evidence."}
                </p>
              </div>
              <dl className="grid w-full grid-cols-3 divide-x divide-phantix-700/40 rounded-md border border-phantix-700/40 bg-phantix-950/40 text-center sm:w-72">
                {([
                  ["Failing controls", gaps.length],
                  ["Findings analysed", data.findings_in],
                  ["Need mapping", unmappedFindings],
                ] as const).map(([label, n]) => (
                  <div key={label} className="px-2 py-1.5">
                    <dd className="font-mono text-base font-semibold text-white">{n}</dd>
                    <dt className="truncate text-[11px] text-slate-500">{label}</dt>
                  </div>
                ))}
              </dl>
            </div>
          </Card>

          {/* 1 · Why these frameworks apply, and what a gap costs. */}
          <Chapter
            n={1}
            title="Why this matters to you"
            lead={
              who
                ? `These obligations come from what your organization is and does: ${who}. You cannot opt out of most of them.`
                : "These obligations come from what your organization is and does. Complete the business profile so SecureGraph can explain each one."
            }
          >
            {triggers.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Building2 size={14} className="text-slate-500" />
                {triggers.map((t) => (
                  <span key={t.key} className="chip !py-0.5 border-gold-400/30 bg-gold-400/[0.07] text-gold-200">{t.label}</span>
                ))}
                {(profile?.customer_countries?.length ?? 0) > 0 && (
                  <span className="chip !py-0.5 border-phantix-700 text-slate-400">Customers in {profile!.customer_countries.join(", ")}</span>
                )}
              </div>
            )}
            {!profile && (
              <Link to="/compliance/profile" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-400 hover:text-gold-300">
                Complete the business profile <ArrowRight size={12} />
              </Link>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((f) => (
                <Card key={f.id} pad="sm" className={cx(f.gaps > 0 && f.severe > 0 && "border-severity-high/25")}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-[15px] font-semibold text-slate-100">{frameworkLabel(f.id, labels)}</p>
                    {f.gaps > 0 ? (
                      <span className="chip !py-0.5 shrink-0 border-severity-high/30 bg-severity-high/10 text-severity-high">
                        {f.gaps} failing
                      </span>
                    ) : (
                      <span className="chip !py-0.5 shrink-0 border-phantix-700 text-slate-400" title="No finding maps to a control in this framework. That is not proof of compliance.">No failing control found</span>
                    )}
                  </div>
                  {f.rec?.reason && <p className="mt-1.5 text-[13px] leading-5 text-slate-300">{f.rec.reason}</p>}
                  {f.gaps > 0 && (
                    <p className="mt-1.5 flex gap-1.5 text-[13px] leading-5 text-slate-400">
                      <AlertTriangle size={13} className="mt-1 shrink-0 text-severity-medium" />
                      <span>{STAKES[f.id] ?? DEFAULT_STAKES}</span>
                    </p>
                  )}
                  {f.severe > 0 && (
                    <p className="mt-2 text-xs text-slate-500">{plural(f.severe, "control fails", "controls fail")} on a critical or high finding</p>
                  )}
                </Card>
              ))}
            </div>
            {notEvaluated > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {plural(notEvaluated, "more framework has", "more frameworks have")} no finding mapped to them. That is not proof of compliance, so they are not counted.
              </p>
            )}
          </Chapter>

          {/* 2 · The causes: proof of failure first, then missing evidence. */}
          {gaps.length + failing.length > 0 && (
            <Chapter
              n={2}
              title="Why you are not compliant"
              lead="Your own findings show these controls failing. Each control stays open until the findings behind it are fixed."
            >
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Card>
                  <CardHeader
                    title="Findings that prove a control fails"
                    subtitle="Fix these and the control can pass"
                    action={<FileWarning size={15} className="text-severity-high" />}
                  />
                  {failing.length === 0 ? (
                    <p className="text-sm text-slate-500">No open finding maps to a failing control.</p>
                  ) : (
                    <ul className="divide-y divide-phantix-700/40 rounded-md border border-phantix-700/40">
                      {failing.slice(0, 8).map((f, i) => (
                        <li key={i} className="px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 text-sm font-medium text-slate-200">{f.title}</span>
                            <RiskChip risk={f.severity} />
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">Fails {f.controls.join(", ")}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {failing.length > 0 && (
                    <CrossAppLink app="core" to="/tracker" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-400 hover:text-gold-300">
                      Fix them in the findings tracker <ArrowRight size={12} />
                    </CrossAppLink>
                  )}
                </Card>

                <Card>
                  <CardHeader
                    title="Controls your findings put at risk"
                    subtitle="Most severe first, with the findings behind each one"
                    action={<ClipboardList size={15} className="text-severity-medium" />}
                  />
                  {noEvidence.length === 0 ? (
                    <p className="text-sm text-slate-500">No control fails on a current finding.</p>
                  ) : (
                    <ul className="divide-y divide-phantix-700/40 rounded-md border border-phantix-700/40">
                      {noEvidence.slice(0, 8).map((g, i) => (
                        <li key={g.key} className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-200">{g.title || "Untitled control"}</span>
                            <span className="block text-xs text-slate-500">
                              {frameworkLabel(g.framework, labels)} {g.control}
                              {g.category ? ` · ${g.category}` : ""}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {g.findings.length > 0 && <span className="text-xs text-slate-500">{plural(g.findings.length, "finding")}</span>}
                            <RiskChip risk={g.risk} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {unmappedFindings > 0 && (
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      {plural(unmappedFindings, "finding matches", "findings match")} no control rule yet. An analyst must review {unmappedFindings === 1 ? "it" : "them"} before {unmappedFindings === 1 ? "it counts" : "they count"} against a framework.
                    </p>
                  )}
                </Card>
              </div>
            </Chapter>
          )}

          {/* 3 · The plan: ordered steps, each tied to the gaps it closes. */}
          {plan.length > 0 && (
            <Chapter
              n={3}
              title="What to do to get compliant"
              lead="Do these in order. The most urgent come first. Each step names the findings behind it, so the work goes to the findings tracker."
            >
              <Card pad="none" className="overflow-hidden">
                <ol className="divide-y divide-phantix-700/40">
                  {plan.map((p, i) => (
                    <li key={i} className="flex gap-3 px-4 py-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-phantix-800 font-mono text-xs font-semibold text-slate-300">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-100">{p.title}</p>
                          {p.priority && <RiskChip risk={p.priority} />}
                        </div>
                        {p.detail != null && <p className="mt-0.5 text-[13px] leading-5 text-slate-400">{text(p.detail)}</p>}
                        {p.closes.length > 0 && (
                          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <Flag size={11} className="text-gold-300" />
                            {plural(p.closes.length, "control")} in {p.frameworks.map((id) => frameworkLabel(id, labels)).join(", ")}
                          </p>
                        )}
                        {p.findings.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {p.findings.slice(0, 3).map((f) => (
                              <span key={f.ref || f.title} className="chip !py-0.5 max-w-[18rem] border-phantix-700 text-slate-300" title={f.title}>
                                <span className="truncate">{f.ref ? `${f.ref} · ` : ""}{f.title}</span>
                              </span>
                            ))}
                            {p.findings.length > 3 && <span className="text-xs text-slate-500">and {p.findings.length - 3} more</span>}
                            <CrossAppLink app="core" to="/tracker" className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-gold-400 hover:text-gold-300">
                              Open in tracker <ArrowRight size={11} />
                            </CrossAppLink>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </Chapter>
          )}

          {/* Reference: every open control, filterable by framework. */}
          <Card pad="none" className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
              <div>
                <h3 className="font-display text-[15px] font-semibold text-slate-100">All open controls</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {visible.length} shown{gaps.length !== visible.length ? ` of ${gaps.length}` : ""}, most severe first
                </p>
              </div>
              {evaluated.length > 1 && (
                <select
                  className="input w-52 !py-1.5 !text-xs"
                  value={framework}
                  onChange={(e) => setFramework(e.target.value)}
                  aria-label="Filter by framework"
                >
                  <option value="all">All frameworks</option>
                  {evaluated.map((f) => (
                    <option key={f.id} value={f.id}>{frameworkLabel(f.id, labels)}</option>
                  ))}
                </select>
              )}
            </div>
            {!visible.length ? (
              <EmptyState
                icon={<CheckCircle2 size={22} />}
                title={gaps.length ? "No gaps in this framework" : "No gaps found"}
                body={
                  gaps.length
                    ? "Every control in this framework has at least one piece of evidence."
                    : "Either your findings cover every mapped control, or SecureGraph has not collected findings yet."
                }
              />
            ) : (
              <div className="mt-3 border-t border-phantix-700/40">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-phantix-700/40">
                        <th className="th">Control</th>
                        <th className="th">Framework</th>
                        <th className="th">Reference</th>
                        <th className="th hidden md:table-cell">Category</th>
                        <th className="th">Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gapPageItems.map((g, i) => (
                        <GapRow key={g.key} gap={g} label={frameworkLabel(g.framework, labels)} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination {...gapPagination} itemLabel="controls" />
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function GapRow({ gap, label }: { gap: Gap; label: string }) {
  return (
    <tr className="h-10 border-b border-phantix-800/40 hover:bg-phantix-800/35">
      <td className="td max-w-[26rem]">
        <span className="block truncate font-medium text-slate-100" title={gap.title || "Untitled control"}>
          {gap.title || "Untitled control"}
        </span>
      </td>
      <td className="td whitespace-nowrap text-[13px] text-phantix-300">{gap.framework ? label : "Not set"}</td>
      <td className="td whitespace-nowrap font-mono text-[13px] text-slate-400">{gap.control || "Not set"}</td>
      <td className="td hidden whitespace-nowrap text-[13px] text-slate-400 md:table-cell">{gap.category ? titleCase(gap.category) : "Not set"}</td>
      <td className="td whitespace-nowrap"><RiskChip risk={gap.risk} /></td>
    </tr>
  );
}
