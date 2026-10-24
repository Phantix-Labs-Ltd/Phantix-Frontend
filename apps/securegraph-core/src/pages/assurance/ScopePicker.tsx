import { Plus, Sparkles, Trash2 } from "lucide-react";
import { cx } from "@sg/utils";
import { SCOPE_TYPE_LABEL, type ScopeItemInput, type ScopeItemType, type ScopeSuggestions } from "@sg/assurance";

/** What to type for each kind of scope item, so a custom row never starts blank-minded. */
export const SCOPE_HINT: Record<ScopeItemType, { description: string; ref: string }> = {
  system: { description: "e.g. Customer API", ref: "e.g. api.example.com" },
  process: { description: "e.g. Quarterly access reviews", ref: "Link to the policy or runbook (optional)" },
  vendor: { description: "e.g. Payment processor", ref: "e.g. Paystack" },
  location: { description: "e.g. Lagos head office", ref: "Address or site (optional)" },
  data_flow: { description: "e.g. Card payments to the processor", ref: "e.g. checkout → Paystack" },
  control_area: { description: "e.g. Access control", ref: "Control family (optional)" },
};

const blankCustom = (): ScopeItemInput => ({ item_type: "system", ref: null, description: "", in_scope: true, rationale: null });

/**
 * Ready-to-tick scope from the asset inventory, connected evidence sources, the
 * business profile and the processes the programme audits. `selected` holds the
 * keys that are ticked; custom rows cover anything SecureGraph doesn't know about.
 */
export function ScopePicker({
  suggestions, loading, selected, onToggle, custom, onCustom,
}: {
  suggestions: ScopeSuggestions | null;
  loading?: boolean;
  selected: Set<string>;
  onToggle: (keys: string[], on: boolean) => void;
  custom: ScopeItemInput[];
  onCustom: (next: ScopeItemInput[]) => void;
}) {
  const groups = suggestions?.groups ?? [];

  return (
    <div className="space-y-5">
      {loading && <p className="text-sm text-slate-500">Looking at your inventory and this programme…</p>}
      {!loading && groups.length === 0 && (
        <p className="text-sm text-slate-400">Nothing to suggest yet. Add what's being audited below.</p>
      )}
      {!loading && suggestions && !suggestions.has_inventory && groups.length > 0 && (
        <p className="text-xs text-slate-500">Add domains, apps and repositories to your asset inventory and they'll be suggested here next time.</p>
      )}

      {groups.map((g) => {
        const keys = g.items.map((i) => i.key);
        const all = keys.every((k) => selected.has(k));
        return (
          <section key={g.title} aria-label={g.title}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                <Sparkles size={12} className="text-gold-400" /> {g.title}
              </h3>
              <button type="button" className="text-xs text-slate-400 hover:text-slate-200" onClick={() => onToggle(keys, !all)}>
                {all ? "Clear" : "Select all"}
              </button>
            </div>
            <ul className="divide-y divide-phantix-700/40 rounded-md border border-phantix-700">
              {g.items.map((s) => {
                const on = selected.has(s.key);
                return (
                  <li key={s.key}>
                    <label className={cx("flex cursor-pointer items-start gap-3 px-3 py-2.5", on ? "bg-gold-400/5" : "hover:bg-phantix-800/40")}>
                      <input type="checkbox" className="mt-1" checked={on} onChange={(e) => onToggle([s.key], e.target.checked)} />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm text-slate-200">{s.description}</span>
                        {s.ref && s.ref !== s.description && <span className="ml-2 font-mono text-xs text-slate-500">{s.ref}</span>}
                        {s.rationale && <span className="block text-xs text-slate-500">{s.rationale}</span>}
                      </span>
                      <span className="shrink-0 rounded bg-phantix-800 px-1.5 py-0.5 text-[11px] text-slate-400">{SCOPE_TYPE_LABEL[s.item_type] ?? s.item_type}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {custom.length > 0 && (
        <section aria-label="Your own items">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Your own items</h3>
          <ul className="space-y-2">
            {custom.map((s, i) => {
              const hint = SCOPE_HINT[s.item_type];
              const set = (patch: Partial<ScopeItemInput>) => onCustom(custom.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <li key={i} className="grid grid-cols-1 gap-2 rounded-md border border-phantix-700 p-3 sm:grid-cols-[150px_1fr_1fr_auto]">
                  <select aria-label="Type" className="input" value={s.item_type} onChange={(e) => set({ item_type: e.target.value as ScopeItemType })}>
                    {(Object.keys(SCOPE_TYPE_LABEL) as ScopeItemType[]).map((t) => <option key={t} value={t}>{SCOPE_TYPE_LABEL[t]}</option>)}
                  </select>
                  <input aria-label="What it is" className="input" placeholder={hint.description} value={s.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
                  <input aria-label="Reference" className="input" placeholder={hint.ref} value={s.ref ?? ""} onChange={(e) => set({ ref: e.target.value || null })} />
                  <button type="button" aria-label="Remove" className="rounded p-2 text-slate-500 hover:text-severity-critical" onClick={() => onCustom(custom.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={!s.in_scope} onChange={(e) => set({ in_scope: !e.target.checked })} /> Leave out
                  </label>
                  {!s.in_scope && (
                    <input aria-label="Why it's left out" className="input sm:col-span-3" placeholder="Why it's left out, e.g. retired in Q2" value={s.rationale ?? ""} onChange={(e) => set({ rationale: e.target.value || null })} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <button type="button" className="btn-secondary" onClick={() => onCustom([...custom, blankCustom()])}>
        <Plus size={14} /> Add something not listed
      </button>
    </div>
  );
}

/** Ticked suggestions plus filled-in custom rows, ready to save. */
export function chosenScope(suggestions: ScopeSuggestions | null, selected: Set<string>, custom: ScopeItemInput[]): ScopeItemInput[] {
  const picked = (suggestions?.groups ?? []).flatMap((g) => g.items).filter((s) => selected.has(s.key))
    .map(({ item_type, ref, description, in_scope, rationale }) => ({ item_type, ref, description, in_scope, rationale }));
  const own = custom.filter((s) => (s.description ?? "").trim() || (s.ref ?? "").trim())
    .map((s) => ({ ...s, description: (s.description ?? "").trim() || null, ref: (s.ref ?? "").trim() || null }));
  return [...picked, ...own];
}

export const defaultSelection = (s: ScopeSuggestions | null) =>
  new Set((s?.groups ?? []).flatMap((g) => g.items).filter((i) => i.selected).map((i) => i.key));
