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
 *
 * In live mode, while the API has no published posts at all, the bundled
 * launch issue is shown instead of an empty contents page (its essays are the
 * ones the sitemap and llms.txt already list). The first post published in the
 * Staff Portal replaces it, so editors stay in control of what is live.
 */
const configured = (import.meta.env.VITE_BLOG_API_URL as string | undefined)?.trim();
export const API_MODE: "demo" | "live" = configured ? "live" : "demo";
let BASE = (configured ?? "").replace(/\/+$/, "");

/**
 * Prerender only (Node has no page origin): resolve a same-origin base such as
 * "/api/v1/blog" against `origin`.
 */
export function setContentOrigin(origin: string): void {
  if (BASE.startsWith("/")) BASE = `${origin.replace(/\/+$/, "")}${BASE}`;
}

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

export interface IssueContent {
  issue: IssueMeta;
  posts: PostSummary[];
  /** "bundled": the launch issue shipped with the site (see the note above). */
  source: "api" | "bundled";
}

/** Content embedded in a prerendered page, so it paints without a loading state. */
export interface ContentSnapshot extends IssueContent {
  bodies: Post[];
}

let postsCache: IssueContent | null = null;
const postCache = new Map<string, Post>();
// Primed from a prerendered page: shown at once, then refreshed from the API.
let postsStale = false;
const stalePosts = new Set<string>();

let postsRequest: Promise<IssueContent> | null = null;

export function fetchPosts(): Promise<IssueContent> {
  if (postsCache && !postsStale) return Promise.resolve(postsCache);
  // The issue page and an essay both ask for the list; share one request.
  postsRequest ??= loadPosts().finally(() => {
    postsRequest = null;
  });
  return postsRequest;
}

async function loadPosts(): Promise<IssueContent> {
  if (API_MODE === "demo") {
    postsCache = { issue: ISSUE, posts: DEMO_SUMMARIES, source: "bundled" };
  } else {
    const data = await json<PostsResponse>(await fetch(`${BASE}/posts`));
    const posts = data.posts ?? [];
    postsCache = {
      issue: { ...ISSUE, ...(data.issue ?? {}) },
      posts: posts.length ? posts : DEMO_SUMMARIES,
      source: posts.length ? "api" : "bundled",
    };
  }
  postsStale = false;
  return postsCache;
}

export async function fetchPost(slug: string): Promise<Post> {
  const cached = postCache.get(slug);
  if (cached && !stalePosts.has(slug)) return cached;

  let post: Post;
  if ((await fetchPosts()).source === "bundled") {
    const found = DEMO_POSTS.find((p) => p.slug === slug);
    if (!found) throw new Error("Post not found");
    post = found;
  } else {
    post = await json<Post>(await fetch(`${BASE}/posts/${encodeURIComponent(slug)}`));
  }
  postCache.set(slug, post);
  stalePosts.delete(slug);
  return post;
}

/** What is already loaded, for a first render without a loading state. */
export function peekPosts(): IssueContent | null {
  return postsCache;
}

export function peekPost(slug: string | undefined): Post | null {
  return (slug && postCache.get(slug)) || null;
}

/** The content a prerendered page needs: the issue plus the given essays. */
export async function snapshot(slugs: string[]): Promise<ContentSnapshot> {
  const content = await fetchPosts();
  const bodies = await Promise.all(slugs.map((slug) => fetchPost(slug)));
  return { ...content, bodies };
}

/** Seed the caches from a prerendered page; the next fetch refreshes them. */
export function primeContent(data: ContentSnapshot): void {
  postsCache = { issue: data.issue, posts: data.posts, source: data.source };
  postsStale = true;
  for (const post of data.bodies) {
    postCache.set(post.slug, post);
    stalePosts.add(post.slug);
  }
}
