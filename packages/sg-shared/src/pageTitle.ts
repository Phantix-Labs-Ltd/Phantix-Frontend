import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getActiveApplication } from "./api";

/**
 * Keep `<link rel="canonical">` and `og:url` on the page actually shown.
 *
 * index.html can only carry one static canonical — the home page — so every
 * client-side route (each doc, the legal pages) told search engines it was a
 * duplicate of "/". Query strings and hashes are dropped on purpose.
 */
export function useCanonicalUrl(origin: string): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";
    const href = `${origin.replace(/\/+$/, "")}${path}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = href;
    document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.setAttribute("content", href);
  }, [origin, pathname]);
}

const APP_LABEL: Record<string, string> = {
  core: "Core",
  attack: "Attack",
  defend: "Defend",
  code: "Code",
};

/**
 * Name the browser tab after the page, e.g. "Findings tracker · SecureGraph Core".
 *
 * Without this every page kept index.html's one title, so a row of tabs (or a
 * history list, or a bookmark) all read the same.
 */
export function usePageTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) return;
    const app = APP_LABEL[getActiveApplication()] ?? "";
    document.title = `${title} · SecureGraph${app ? ` ${app}` : ""}`;
  }, [title]);
}

/**
 * Keep a page out of search results. For screens a crawler must never index
 * (signed-in application pages, the not-found page) — the static index.html
 * cannot tell one client-side route from another.
 */
export function useNoIndex(): void {
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = meta?.content ?? null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = "noindex, nofollow";
    return () => {
      if (!meta) return;
      if (previous === null) meta.remove();
      else meta.content = previous;
    };
  }, []);
}
