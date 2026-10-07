// On phones a data table becomes a list of rows, each cell shown as
// "LABEL ......... value" (see `table.sg-cards` in index.css). This labels every
// cell with its column header so the CSS can print it, for every table inside
// `root`, including ones that render later (data loading, pagination).

import { useEffect } from "react";

const MIN_COLUMNS = 3;

function labelTable(table: HTMLTableElement): void {
  const headRow = table.tHead?.rows[0];
  if (!headRow) return;
  const headers: string[] = [];
  for (const th of Array.from(headRow.cells)) {
    const text = (th.textContent || "").trim();
    for (let i = 0; i < (th.colSpan || 1); i++) headers.push(text);
  }
  if (headers.length < MIN_COLUMNS) return;
  table.classList.add("sg-cards");
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      let col = 0;
      for (const cell of Array.from(row.cells)) {
        const label = cell.colSpan >= headers.length ? "" : headers[col] ?? "";
        if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
        col += cell.colSpan || 1;
      }
    }
  }
}

/** Pass the container element (from a callback ref) so labelling starts when it mounts. */
export function useTableCards(el: HTMLElement | null): void {
  useEffect(() => {
    if (!el) return;
    let frame = 0;
    const run = () => {
      frame = 0;
      el.querySelectorAll("table").forEach((t) => labelTable(t as HTMLTableElement));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };
    run();
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [el]);
}
