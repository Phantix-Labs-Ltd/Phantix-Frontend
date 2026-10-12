import { useEffect, useRef } from "react";

/**
 * Close a dropdown when the user presses anywhere outside it, or presses Escape.
 *
 * Attach the returned ref to the element that holds both the toggle button and
 * the panel, so pressing the toggle still toggles. The listener runs in the
 * capture phase and does not stop the event, so the outside press also lands
 * on whatever was pressed: one click both closes the menu and does its job.
 */
export function useDismiss<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return ref;
}
