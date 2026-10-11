import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Keep `<link rel="canonical">` and `og:url` on the page actually shown.
 *
 * index.html can only carry one static canonical (the home page), so every
 * client-side route told search engines it was a duplicate of "/". Query
 * strings and hashes are dropped on purpose.
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
