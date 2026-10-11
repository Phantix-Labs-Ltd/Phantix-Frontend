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
    const href = `${stripTrailingSlash(origin)}${normalisePath(pathname)}`;
    setCanonical(href).href = href;
    setMeta("property", "og:url").content = href;
  }, [origin, pathname]);
}

const APP_LABEL: Record<string, string> = {
  core: "Core",
  attack: "Attack",
  defend: "Defend",
  code: "Code",
};

/**
 * True while a page component has named its own tab (see `usePageTitle`). The
 * SEO layer below only writes the application's default `<title>` when the
 * page did not claim one, so a route-specific title such as "Privacy and data
 * requests" is never overwritten on the way out.
 */
let pageTitleClaimed = false;

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
    pageTitleClaimed = true;
    return () => {
      pageTitleClaimed = false;
    };
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
    const created = meta === null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    const previous = meta.content;
    meta.content = "noindex, nofollow";
    return () => {
      if (!meta) return;
      if (created) meta.remove();
      else meta.content = previous;
    };
  }, []);
}

export interface SeoOptions {
  /** Production origin, e.g. "https://app.phantixlabs.com". */
  origin: string;
  /** The application's default `<title>` on public routes. */
  title: string;
  /** The application's default `meta[name=description]` on public routes. */
  description: string;
  /**
   * Public, indexable paths. An entry ending in "$" matches that path exactly
   * ("/$" is the root); every other entry is a prefix, so "/docs" also covers
   * "/docs/:docId". Any route not listed is treated as private: `noindex,
   * nofollow`, with the page's own title left alone.
   */
  publicPaths: string[];
}

/**
 * Per-route SEO for a client-rendered application.
 *
 * index.html ships one static title, description, canonical and robots tag, and
 * the same document answers every route. This keeps all four honest as the
 * operator moves between a public page (a guide, a policy) and a signed-in
 * screen, so search engines and AI answer engines index the public pages and
 * only the public pages. Call it once, inside the router.
 */
export function useSeo({ origin, title, description, publicPaths }: SeoOptions): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = normalisePath(pathname);
    const indexable = publicPaths.some((entry) =>
      entry.endsWith("$") ? path === entry.slice(0, -1) : path === entry || path.startsWith(`${entry}/`),
    );
    const href = `${stripTrailingSlash(origin)}${path}`;

    // The canonical URL and og:url always describe the page actually shown.
    setCanonical(href).href = href;
    setMeta("property", "og:url").content = href;

    // Private routes are pulled from the index; the catch-all robots.txt rule
    // already keeps them out of a crawl, and this covers a direct hit.
    setMeta("name", "robots").content = indexable ? "index, follow" : "noindex, nofollow";
    if (!indexable) return;

    const publicTitle = pageTitleClaimed ? document.title : title;
    if (!pageTitleClaimed) document.title = title;
    setMeta("name", "description").content = description;
    setMeta("property", "og:title").content = publicTitle;
    setMeta("property", "og:description").content = description;
    setMeta("name", "twitter:title").content = publicTitle;
    setMeta("name", "twitter:description").content = description;
  }, [origin, title, description, publicPaths, pathname]);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

/** "/dashboard/" and "/dashboard" are one page; query strings and hashes drop. */
function normalisePath(pathname: string): string {
  return pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";
}

function stripTrailingSlash(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function setCanonical(href: string): HTMLLinkElement {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    link.href = href;
    document.head.appendChild(link);
  }
  return link;
}

/** Find or create one head tag, so repeated writes never stack duplicates. */
function setMeta(attr: "name" | "property", key: string): HTMLMetaElement {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attr, key);
    document.head.appendChild(meta);
  }
  return meta;
}
