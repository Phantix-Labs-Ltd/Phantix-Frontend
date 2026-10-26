import React, { useEffect, useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { Modal } from "../ui";
import { cx } from "../utils";

export interface OverviewCardDef { id: string; label: string; description: string }

/**
 * Customize overview: the visible cards on the left in their order (drag a row,
 * or focus its handle and use the arrow keys), every other card on the right to
 * add. Nothing changes on the page until Apply.
 */
export function CustomizeOverview({ open, onClose, cards, visible, defaults, onApply }: {
  open: boolean;
  onClose: () => void;
  cards: OverviewCardDef[];
  visible: string[];
  defaults: string[];
  onApply: (visible: string[]) => void;
}) {
  const [order, setOrder] = useState<string[]>(visible);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  useEffect(() => { if (open) setOrder(visible.filter((id) => cards.some((c) => c.id === id))); }, [open, visible, cards]);

  const byId = (id: string) => cards.find((c) => c.id === id);
  const available = cards.filter((c) => !order.includes(c.id));

  const move = (id: string, to: number) => {
    setOrder((cur) => {
      const from = cur.indexOf(id);
      if (from < 0 || to < 0 || to >= cur.length || from === to) return cur;
      const next = [...cur];
      next.splice(from, 1);
      next.splice(to, 0, id);
      setAnnounce(`${byId(id)?.label} moved to position ${to + 1} of ${next.length}`);
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Customize overview" wide>
      <p className="-mt-1 mb-4 text-sm text-slate-400">Reorder active cards on the left and pick more cards from the right.</p>
      <span className="sr-only" aria-live="polite">{announce}</span>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-phantix-700" aria-label="Visible cards">
          <h3 className="border-b border-phantix-700/60 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
            Visible cards ({order.length})
          </h3>
          <ul className="max-h-[22rem] divide-y divide-phantix-700/40 overflow-y-auto">
            {order.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-slate-500">Add at least one card from the right.</li>}
            {order.map((id, i) => {
              const c = byId(id);
              if (!c) return null;
              return (
                <li
                  key={id}
                  draggable
                  onDragStart={(e) => { setDragging(id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { e.preventDefault(); setOver(id); }}
                  onDragLeave={() => setOver((o) => (o === id ? null : o))}
                  onDrop={(e) => { e.preventDefault(); if (dragging) move(dragging, i); setDragging(null); setOver(null); }}
                  onDragEnd={() => { setDragging(null); setOver(null); }}
                  className={cx(
                    "flex items-center gap-2 px-2 py-2.5 transition-colors",
                    dragging === id && "opacity-50",
                    over === id && dragging !== id && "bg-gold-400/10",
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Move ${c.label}. Use the up and down arrow keys.`}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp") { e.preventDefault(); move(id, i - 1); }
                      if (e.key === "ArrowDown") { e.preventDefault(); move(id, i + 1); }
                    }}
                    className="cursor-grab rounded p-1 text-slate-500 hover:text-slate-300 focus-visible:text-gold-300 active:cursor-grabbing"
                  >
                    <GripVertical size={15} />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{c.label}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${c.label}`}
                    onClick={() => setOrder((cur) => cur.filter((x) => x !== id))}
                    className="rounded p-1.5 text-slate-500 hover:bg-phantix-800 hover:text-slate-200"
                  >
                    <X size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="overflow-hidden rounded-xl border border-phantix-700" aria-label="Available cards">
          <h3 className="border-b border-phantix-700/60 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
            Available cards ({available.length})
          </h3>
          <ul className="max-h-[22rem] divide-y divide-phantix-700/40 overflow-y-auto">
            {available.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-slate-500">Every card is on your overview.</li>}
            {available.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOrder((cur) => [...cur, c.id])}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-phantix-800/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-200">{c.label}</span>
                    <span className="block truncate text-[12px] text-slate-500">{c.description}</span>
                  </span>
                  <Plus size={15} className="shrink-0 text-slate-400" aria-label={`Add ${c.label}`} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="text-sm text-slate-400 hover:text-slate-200" onClick={() => setOrder(defaults)}>Reset to default</button>
        <span className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={order.length === 0} onClick={() => { onApply(order); onClose(); }}>
            Apply ({order.length})
          </button>
        </span>
      </div>
    </Modal>
  );
}

export default CustomizeOverview;
