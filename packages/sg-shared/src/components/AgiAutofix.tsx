// Autofix subagent results in the pentest agent console.
//
// The runner's `TOOL autofix_subagent` returns, per finding:
//   { vuln_class, steps[], summary, remediable, stack, tailored?,
//     example: { language, note, vulnerable, fixed } }
// (services/phantix-agi/autofix_subagent.py · suggest_fix / run_autofix).
// The stream used to show that as a raw JSON tool box capped at a few lines, so
// the steps and the before/after code were unreadable. This module renders a
// compact card in the stream and a full overlay with everything the fix carries.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Layers, ListChecks, Maximize2, Wrench } from "lucide-react";
import { Modal } from "../ui";
import { cx, humanize } from "../utils";

export interface AgiAutofixExample {
  language?: string;
  note?: string;
  vulnerable?: string;
  fixed?: string;
}

export interface AgiAutofixFix {
  /** Finding title, when the payload carries it (streamed `fix` events do). */
  title?: string;
  vuln_class?: string | null;
  steps: string[];
  summary?: string;
  remediable?: boolean;
  stack?: string | null;
  tailored?: boolean;
  example?: AgiAutofixExample | null;
  /** Legacy finding-level autofix: a file and a patch preview. */
  file?: string;
  preview?: string;
}

const str = (v: unknown): string | undefined => (v != null && v !== "" ? String(v) : undefined);

/** Normalize one fix object from any of the payload shapes the backend emits. */
export function normalizeAutofixFix(raw: unknown): AgiAutofixFix | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const steps = Array.isArray(r.steps) ? r.steps.map((s) => String(s ?? "")).filter((s) => s.trim()) : [];
  const ex = r.example && typeof r.example === "object" ? (r.example as Record<string, unknown>) : null;
  const example: AgiAutofixExample | null = ex
    ? { language: str(ex.language), note: str(ex.note), vulnerable: str(ex.vulnerable), fixed: str(ex.fixed) }
    : null;
  const fix: AgiAutofixFix = {
    title: str(r.title),
    vuln_class: str(r.vuln_class) ?? null,
    steps,
    summary: str(r.summary),
    remediable: typeof r.remediable === "boolean" ? r.remediable : undefined,
    stack: str(r.stack) ?? null,
    tailored: Boolean(r.tailored),
    example: example && (example.vulnerable || example.fixed) ? example : null,
    file: str(r.file),
    preview: str(r.preview),
  };
  const hasBody = fix.steps.length > 0 || fix.summary || fix.example || fix.preview;
  return hasBody ? fix : null;
}

/** Pull the fixes out of an `autofix_subagent` tool row (JSON, possibly after a command line). */
export function parseAutofixFixes(content: string): AgiAutofixFix[] {
  const text = content ?? "";
  const start = text.search(/[{[]/);
  if (start < 0) return [];
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start));
  } catch {
    return [];
  }
  const rec = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const result = rec.result && typeof rec.result === "object" ? (rec.result as Record<string, unknown>) : null;
  const list: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(rec.fixes)
      ? rec.fixes
      : Array.isArray(result?.fixes)
        ? (result!.fixes as unknown[])
        : [rec];
  return list.map(normalizeAutofixFix).filter((f): f is AgiAutofixFix => !!f);
}

/**
 * Fixes carried by a transcript row. Three sources, best first:
 *  - a live row the workspace painted from the runner's `autofix_subagent`
 *    SSE event (meta.kind "autofix", meta.fixes: the full, untruncated list);
 *  - an `autofix_subagent` tool row whose content holds the JSON result;
 *  - the same tool row's meta.rationale (the result JSON, cut at 1500 chars,
 *    so it parses only when the result was small).
 */
export function autofixFromChunk(t: { role: string; content: string; meta?: Record<string, unknown> | null }): AgiAutofixFix[] {
  const meta = (t.meta ?? {}) as Record<string, unknown>;
  if (meta.kind === "autofix" && Array.isArray(meta.fixes)) {
    return meta.fixes.map(normalizeAutofixFix).filter((f): f is AgiAutofixFix => !!f);
  }
  if (t.role !== "tool" || meta.tool !== "autofix_subagent") return [];
  const fromContent = parseAutofixFixes(t.content);
  if (fromContent.length) return fromContent;
  return typeof meta.rationale === "string" ? parseAutofixFixes(meta.rationale) : [];
}

/** Best label for a fix: its finding title, else the class, else the summary. */
export function autofixLabel(fix: AgiAutofixFix): string {
  if (fix.title) return fix.title;
  const quoted = /'([^']{3,200})'/.exec(fix.summary ?? "");
  if (quoted) return quoted[1];
  if (fix.vuln_class) return humanize(fix.vuln_class);
  return "Remediation";
}

/** Does this fix belong to the finding? The deterministic summary quotes the title. */
export function autofixMatchesFinding(fix: AgiAutofixFix, title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return false;
  return (fix.title ?? "").trim().toLowerCase() === t || (fix.summary ?? "").toLowerCase().includes(`'${t}'`);
}

function CopyCode({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      title="Copy"
      aria-label="Copy code"
      onClick={() => {
        try { void navigator.clipboard?.writeText(text); } catch { /* clipboard unavailable */ }
        setOk(true);
        window.setTimeout(() => setOk(false), 1200);
      }}
      className={cx("rounded-md p-1 text-slate-500 hover:bg-phantix-800 hover:text-slate-200", ok && "text-emerald-400")}
    >
      {ok ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function CodePane({ label, code, tone }: { label: string; code: string; tone: "bad" | "good" | "neutral" }) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-phantix-700/40 bg-phantix-950/80">
      <div className="flex items-center justify-between border-b border-phantix-700/40 px-3 py-1.5">
        <span
          className={cx(
            "text-[11px] font-semibold uppercase tracking-wider",
            tone === "bad" ? "text-severity-critical" : tone === "good" ? "text-emerald-400" : "text-gold-300",
          )}
        >
          {label}
        </span>
        <CopyCode text={code} />
      </div>
      <pre className="wb-scroll max-h-[46vh] overflow-auto p-3 font-mono text-[12.5px] leading-relaxed text-slate-200">{code}</pre>
    </div>
  );
}

/** Everything one fix carries, laid out for reading (used inside overlays). */
export function AutofixFixView({ fix }: { fix: AgiAutofixFix }) {
  const ex = fix.example;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {fix.vuln_class && (
          <span className="chip !px-2 !py-0.5 text-[11px] text-gold-300">{humanize(fix.vuln_class)}</span>
        )}
        {fix.stack && (
          <span className="chip !px-2 !py-0.5 font-mono text-[11px] text-slate-300" title="Stack detected for this engagement">
            <Layers size={10} /> {fix.stack}
          </span>
        )}
        {fix.tailored && (
          <span className="chip !px-2 !py-0.5 text-[11px] text-emerald-400" title="Steps were tailored to this finding's evidence">
            tailored to the evidence
          </span>
        )}
        {fix.remediable === false && (
          <span className="chip !px-2 !py-0.5 text-[11px] text-slate-400" title="No class-specific guidance; a safe generic remediation is shown">
            generic guidance
          </span>
        )}
      </div>

      {fix.summary && <p className="text-sm leading-relaxed text-slate-200">{fix.summary}</p>}

      {fix.steps.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <ListChecks size={12} /> Steps
          </p>
          <ol className="space-y-2">
            {fix.steps.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gold-400/30 bg-gold-400/10 text-[11px] font-semibold text-gold-300">
                  {i + 1}
                </span>
                <span className="min-w-0 break-words">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {ex && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Common use case{ex.language ? ` · ${ex.language}` : ""}
          </p>
          {ex.note && <p className="mb-2 text-[13px] leading-relaxed text-slate-400">{ex.note}</p>}
          <div className="grid gap-3 lg:grid-cols-2">
            {ex.vulnerable && <CodePane label="Vulnerable" code={ex.vulnerable} tone="bad" />}
            {ex.fixed && <CodePane label="Fixed" code={ex.fixed} tone="good" />}
          </div>
        </div>
      )}

      {fix.preview && (
        <div>
          {fix.file && <p className="mb-1 font-mono text-xs text-gold-300">{fix.file}</p>}
          <CodePane label="Patch preview" code={fix.preview} tone="neutral" />
        </div>
      )}
    </div>
  );
}

/**
 * Overlay with the full autofix. Rendered into document.body so a transformed
 * ancestor in the console (motion cards, drawers) can never clip or offset it.
 */
export function AutofixModal({
  open,
  onClose,
  fixes,
  initial = 0,
  title,
}: {
  open: boolean;
  onClose: () => void;
  fixes: AgiAutofixFix[];
  initial?: number;
  title?: string;
}) {
  const [idx, setIdx] = useState(initial);
  useEffect(() => { if (open) setIdx(initial); }, [open, initial]);
  if (typeof document === "undefined") return null;
  const fix = fixes[Math.min(idx, fixes.length - 1)];
  return createPortal(
    <Modal open={open && !!fix} onClose={onClose} title={title ?? "Autofix"} wide>
      {fix && (
        <div className="space-y-4">
          {fixes.length > 1 && (
            <div className="wb-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {fixes.map((f, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={cx(
                    "max-w-[16rem] shrink-0 truncate rounded-lg border px-2.5 py-1 text-xs transition-colors",
                    i === idx
                      ? "border-gold-400/50 bg-gold-400/10 text-gold-200"
                      : "border-phantix-700/50 text-slate-400 hover:border-phantix-500/50 hover:text-slate-200",
                  )}
                  title={autofixLabel(f)}
                >
                  {i + 1}. {autofixLabel(f)}
                </button>
              ))}
            </div>
          )}
          <p className="text-base font-semibold text-white">{autofixLabel(fix)}</p>
          <AutofixFixView fix={fix} />
          <p className="border-t border-phantix-700/40 pt-3 text-[12px] leading-relaxed text-slate-500">
            Advisory only. The agent never changes your code; apply the corrected form, then re-run the
            finding's request to confirm the signal is gone.
          </p>
        </div>
      )}
    </Modal>,
    document.body,
  );
}

/** Compact stream card for an `autofix_subagent` result; opens the full overlay. */
export function AutofixToolCard({ fixes, dense = false }: { fixes: AgiAutofixFix[]; dense?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = fixes.slice(0, dense ? 3 : 5);
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-gold-400/25 bg-phantix-950/70">
      <div className={cx("flex items-center gap-2 border-b border-phantix-700/40", dense ? "px-2 py-1.5" : "px-3 py-2")}>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gold-400/15 text-gold-300">
          <Wrench size={11} />
        </span>
        <span className={cx("min-w-0 flex-1 truncate font-semibold text-slate-200", dense ? "text-[13px]" : "text-xs")}>
          Autofix · {fixes.length} fix{fixes.length === 1 ? "" : "es"}
        </span>
        <button type="button" onClick={() => setOpen(0)} className="btn-ghost shrink-0 !px-2 !py-0.5 text-[12px]">
          <Maximize2 size={11} className="mr-1 inline" /> Open full autofix
        </button>
      </div>
      <ul className="divide-y divide-phantix-700/30">
        {shown.map((f, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className={cx("flex w-full items-start gap-2 text-left transition-colors hover:bg-phantix-900/60", dense ? "px-2 py-1.5" : "px-3 py-2")}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-slate-200">{autofixLabel(f)}</span>
                {f.summary && <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-slate-500">{f.summary}</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {f.stack && <span className="font-mono text-[11px] text-slate-500">{f.stack}</span>}
                {f.example && <span className="text-[11px] text-emerald-400/80">before/after</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {fixes.length > shown.length && (
        <button type="button" onClick={() => setOpen(shown.length)} className="w-full border-t border-phantix-700/30 py-1.5 text-center text-[12px] text-slate-500 hover:text-slate-300">
          +{fixes.length - shown.length} more
        </button>
      )}
      <AutofixModal open={open !== null} onClose={() => setOpen(null)} fixes={fixes} initial={open ?? 0} />
    </div>
  );
}
