import { useEffect } from "react";
import type { Post } from "./types";

/*
 * usePostSeo — per-post SEO / GEO / AEO head management.
 *
 * The blog is a client-rendered SPA with one static <head>. The homepage graph
 * lives in index.html; each essay needs its own title, description, canonical,
 * social image, and Article + BreadcrumbList structured data. This hook writes
 * those on mount and removes them on unmount, so navigating back to the issue
 * does not leave the last post's metadata behind.
 *
 * GEO: the Article node names the publisher entity and the journal, and carries
 * dates and a section, so an AI answer engine can attribute the essay.
 * AEO: `speakable` points at the title and standfirst, the two elements that
 * answer "what is this about" in one sentence.
 */

const ORIGIN = "https://blog.phantixlabs.com";
const ORG_ID = "https://phantixlabs.com/#organization";
const BLOG_ID = "https://blog.phantixlabs.com/#blog";
const DEFAULT_IMAGE = `${ORIGIN}/og-weekly.png`;

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** "September 2026" to "2026-09-01". Returns undefined for anything else. */
function isoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const monthYear = value.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthYear) {
    const idx = MONTHS.indexOf(monthYear[1].toLowerCase());
    if (idx >= 0) return `${monthYear[2]}-${String(idx + 1).padStart(2, "0")}-01`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  return undefined;
}

function upsertMeta(attr: "name" | "property", key: string, content: string): () => void {
  const selector = `meta[${attr}="${key}"]`;
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  const created = !existing;
  const el = existing ?? document.createElement("meta");
  const previous = el.getAttribute("content");
  el.setAttribute(attr, key);
  el.setAttribute("content", content);
  if (created) document.head.appendChild(el);
  return () => {
    if (created) el.remove();
    else if (previous !== null) el.setAttribute("content", previous);
  };
}

function upsertCanonical(href: string): () => void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const created = !link;
  const previous = link?.getAttribute("href") ?? null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
  return () => {
    if (created) link?.remove();
    else if (previous !== null) link?.setAttribute("href", previous);
  };
}

export function usePostSeo(post: Post | undefined): void {
  useEffect(() => {
    if (!post) return;
    const url = `${ORIGIN}/posts/${post.slug}`;
    const title = `${post.title} · The SecureGraph Weekly`;
    const description =
      post.excerpt || `${post.title}, from The SecureGraph Weekly by SecureGraph.`;
    const published = isoDate(post.date);

    const restore: Array<() => void> = [
      upsertMeta("name", "description", description),
      upsertMeta("property", "og:title", title),
      upsertMeta("property", "og:description", description),
      upsertMeta("property", "og:url", url),
      upsertMeta("property", "og:image", DEFAULT_IMAGE),
      upsertMeta("property", "og:type", "article"),
      upsertMeta("name", "twitter:title", title),
      upsertMeta("name", "twitter:description", description),
      upsertMeta("name", "twitter:image", DEFAULT_IMAGE),
      upsertCanonical(url),
    ];
    if (post.kicker) restore.push(upsertMeta("property", "article:section", post.kicker));
    if (published) restore.push(upsertMeta("property", "article:published_time", published));

    const previousTitle = document.title;
    document.title = title;

    const article: Record<string, unknown> = {
      "@type": "Article",
      "@id": `${url}#article`,
      headline: post.title,
      description,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      author: { "@id": ORG_ID },
      publisher: { "@id": ORG_ID },
      isPartOf: { "@id": BLOG_ID },
      image: DEFAULT_IMAGE,
      inLanguage: "en",
      speakable: {
        "@type": "SpeakableSpecification",
        cssSelector: [".post-title", ".post-standfirst"],
      },
    };
    if (published) {
      article.datePublished = published;
      article.dateModified = published;
    }
    if (post.kicker) article.articleSection = post.kicker;

    const breadcrumb = {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "The SecureGraph Weekly", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: post.title, item: url },
      ],
    };

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.postSeo = "true";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [article, breadcrumb],
    });
    document.head.appendChild(script);

    return () => {
      document.title = previousTitle;
      restore.forEach((fn) => fn());
      script.remove();
    };
  }, [post]);
}
