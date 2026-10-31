// Finding detail for the Autonomous Pentest Agent console.
//
// Opens from a finding row in the console's findings pane and renders the full
// detail: severity/verdict, facts, the raw evidence, and the matching autofix
// (stack, tailored, vulnerable / fixed / patch preview) via the shared
// AutofixFixView — the same fix payload the runner's autofix_subagent streams
// ({ title, vuln_class, steps, summary, stack, tailored, example, preview }).
import React, { useMemo } from "react";
import { ShieldAlert } from "lucide-react";
import { Modal, SeverityBadge } from "../ui";
import type { Severity } from "../types";
import { AutofixFixView, autofixMatchesFinding, type AgiAutofixFix } from "./AgiAutofix";

type FindingRecord = Record<string, unknown>;

/** First non-empty string (or number) among the given keys. */
function pick(f: FindingRecord, keys: string[]): string {
  for (const k of keys) {
    const v = f[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return "";
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] text-slate-200">{value}</dd>
    </div>
  );
}

export default function AgiFindingDrawer({
  finding,
  fixes,
  onClose,
}: {
  finding: FindingRecord | null;
  fixes: AgiAutofixFix[];
  onClose: () => void;
}) {
  const title = finding ? pick(finding, ["title"]) || "Finding" : "";
  const fix = useMemo(
    () => (finding ? fixes.find((fx) => autofixMatchesFinding(fx, title)) ?? null : null),
    [finding, fixes, title],
  );
  if (!finding) return null;

  const severity = (pick(finding, ["severity"]) || "info") as Severity;
  const verdict =
    pick(finding, ["verification_status", "status"]) ||
    String((finding.verification as Record<string, unknown> | undefined)?.verdict ?? "") ||
    "verifying";
  const findingKey = pick(finding, ["finding_key", "key", "finding_id", "id"]);
  const target = pick(finding, ["target", "asset", "url", "endpoint", "location"]);
  const cvss = pick(finding, ["cvss", "cvss_vector", "cvss_score"]);
  const description = pick(finding, ["description", "summary", "detail"]);
  const evidence = pick(finding, ["evidence", "poc", "proof", "request", "raw_evidence"]);

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <SeverityBadge severity={severity} />
          <span className="min-w-0 truncate text-[15px] font-semibold text-white">{title}</span>
        </span>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {findingKey && <span className="chip font-mono text-[12px] text-gold-300">{findingKey}</span>}
          <span className="chip text-[12px]">{verdict}</span>
        </div>

        {description && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Description</h3>
            <p className="text-[13px] leading-6 text-slate-300">{description}</p>
          </section>
        )}

        {(target || cvss) && (
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Target" value={target} />
            <Fact label="CVSS" value={cvss} />
          </dl>
        )}

        {evidence && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Evidence</h3>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-phantix-700/40 bg-phantix-950 p-3 font-mono text-[12px] leading-relaxed text-slate-300">
              {evidence}
            </pre>
          </section>
        )}

        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <ShieldAlert size={12} className="text-gold-400" /> Autofix
          </h3>
          {fix ? (
            <AutofixFixView fix={fix} />
          ) : (
            <p className="rounded-lg border border-phantix-700/40 bg-phantix-900/50 px-3 py-2.5 text-[12.5px] text-slate-500">
              No autofix generated for this finding yet. Fixes appear here once the autofix subagent runs for this class.
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}
