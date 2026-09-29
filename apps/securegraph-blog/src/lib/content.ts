import { ISSUE } from "./config";
import { DEMO_POSTS, DEMO_SUMMARIES } from "./demo";
import type { IssueMeta, Post, PostSummary, PostsResponse } from "./types";

/**
 * Content source. Two modes:
 *
 *  - demo (default): `VITE_BLOG_API_URL` is unset, so the bundled Markdown
 *    fixtures under src/content/posts/ are used. Lets the site run with no
 *    backend.
 *  - live: `VITE_BLOG_API_URL` points at the admin backend (absolute URL, or
 *    "/api/v1" when a same-origin rewrite proxies it). The blog then calls
 *    GET {base}/posts and GET {base}/posts/{slug}.
 */
const configured = (import.meta.env.VITE_BLOG_API_URL as string | undefined)?.trim();
export const API_MODE: "demo" | "live" = configured ? "live" : "demo";
const BASE = (configured ?? "").replace(/\/+$/, "");

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = (await res.json())?.detail; } catch { /* non-JSON */ }
    // Show the API's own sentence when it is prose the reader can act on,
    // keeping the status token so "404" still reads as not-found upstream.
    const copy = safeDetail(detail);
    throw new Error(copy ? `${copy} (HTTP ${res.status})` : `Request failed (${res.status} ${res.statusText})`);
  }
  return (await res.json()) as T;
}

/**
 * Error copy for the content API.
 *
 * The API answers failures as `{ "detail": ... }`. This mirrors the apps'
 * normalizer (packages/sg-shared/src/api.ts, `publicErrorCopy`): keep the
 * backend's sentence when it is prose the reader can act on, and fall back to a
 * plain status line when it looks like an internal diagnostic. Kept local
 * because the blog does not depend on the shared package.
 */
const INTERNAL_MARKERS: RegExp[] = [
  /\btraceback\b/i,
  /\bfile\s+"[^"]+"/i,
  /\bline\s+\d+\b/i,
  /\b\w+(?:Error|Exception)\b/,
  /\bexception\b/i,
  /\bstack\s?trace\b/i,
  /(?:\/api\/v\d|\/(?:internal|admin|_debug)\/)/i,
  /\b(?:GET|POST|PUT|PATCH|DELETE)\s+[\/\"]/,
  /\bX(?:-[A-Z][A-Za-z0-9]+){2,}\b/,
  /\bWWW-Authenticate\b/i,
  /\b[A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+)+\b/,
  /\bselect\b[\s\S]{0,80}\bfrom\b/i,
  /\binsert\s+into\b/i,
  /\b(?:psycopg|sqlalchemy|asyncpg|prisma|sqlite|alembic)\w*\b/i,
  /\b(?:relation|column|table|schema)\b[^.]{0,60}\bdoes not exist\b/i,
  /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i,
  /\b(?:docs?|design|architecture|specs?)\/\S+/i,
  /§\s*\d/,
  /\.(?:py|ts|tsx|js|jsx|mjs|json|ya?ml|toml|ini|sql|sh|md)\b/i,
  /\bcorrelation[- _]?id\b/i,
  /\bservice[- _]?key\b/i,
];

/** The human sentence inside a `detail`, or null when there is none. */
function detailText(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) =>
        d && typeof d === "object" && typeof (d as { msg?: unknown }).msg === "string"
          ? (d as { msg: string }).msg
          : null,
      )
      .filter((m): m is string => !!m);
    return parts.length ? parts.join("; ") : null;
  }
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    for (const key of ["message", "detail", "reason", "hint"]) {
      if (typeof d[key] === "string" && (d[key] as string).trim()) return d[key] as string;
    }
  }
  return null;
}

/** The sentence to show for a failure, or null when only the status is safe. */
function safeDetail(detail: unknown): string | null {
  const raw = detailText(detail);
  if (!raw) return null;
  const text = raw.replace(/\s+/g, " ").trim();
  // No prose (single token) or a diagnostic marker → leave the status copy.
  if (!text || !/\s/.test(text) || /^[a-z0-9_.:-]+$/i.test(text)) return null;
  if (INTERNAL_MARKERS.some((re) => re.test(text))) return null;
  const cut = text.length > 240 ? `${text.slice(0, 240).replace(/\s+\S*$/, "")}…` : text;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

let postsCache: { issue: IssueMeta; posts: PostSummary[] } | null = null;
const postCache = new Map<string, Post>();

export async function fetchPosts(): Promise<{ issue: IssueMeta; posts: PostSummary[] }> {
  if (postsCache) return postsCache;

  if (API_MODE === "demo") {
    postsCache = { issue: ISSUE, posts: DEMO_SUMMARIES };
    return postsCache;
  }

  const data = await json<PostsResponse>(await fetch(`${BASE}/posts`));
  postsCache = {
    issue: { ...ISSUE, ...(data.issue ?? {}) },
    posts: data.posts ?? [],
  };
  return postsCache;
}

export async function fetchPost(slug: string): Promise<Post> {
  const cached = postCache.get(slug);
  if (cached) return cached;

  if (API_MODE === "demo") {
    const found = DEMO_POSTS.find((p) => p.slug === slug);
    if (!found) throw new Error("Post not found");
    postCache.set(slug, found);
    return found;
  }

  const post = await json<Post>(await fetch(`${BASE}/posts/${encodeURIComponent(slug)}`));
  postCache.set(slug, post);
  return post;
}
