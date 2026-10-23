import { defineConfig, loadEnv, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { siteFiles } from "../../packages/sg-shared/vite/siteFiles";

const BLOG_ORIGIN = "https://blog.phantixlabs.com";

interface PostEntry {
  slug: string;
  title: string;
  excerpt: string;
}

/** The bundled launch issue (src/content/posts); slug rules mirror lib/frontmatter.ts. */
function bundledPosts(): PostEntry[] {
  const dir = path.resolve(__dirname, "src/content/posts");
  return (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      const field = (key: string) => text.match(new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, "m"))?.[1] ?? "";
      const slug = f.replace(/\.md$/, "").replace(/^\d+-/, "");
      return { slug, title: field("title") || slug, excerpt: field("excerpt") };
    });
}

/**
 * The posts the live site actually serves, for the sitemap and llms.txt.
 *
 * Mirrors lib/content.ts: demo mode shows the bundled issue, and live mode
 * shows the API's posts, or the bundled issue while the API has none. Listing
 * the bundled essays next to live posts put four soft-404s in the sitemap (the
 * live site answers them with an empty shell and the home canonical), so they
 * appear only when the site shows them. An unreachable API lists the issue
 * page alone; it never fails the build.
 */
async function sitePosts(apiUrl: string | undefined): Promise<PostEntry[]> {
  const base = (apiUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) return bundledPosts();
  const absolute = base.startsWith("/") ? `${BLOG_ORIGIN}${base}` : base;
  try {
    const res = await fetch(`${absolute}/posts`, { signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as { posts?: Partial<PostEntry>[] };
    const live = (data.posts ?? [])
      .filter((p): p is Partial<PostEntry> & { slug: string } => Boolean(p.slug))
      .map((p) => ({ slug: p.slug, title: p.title || p.slug, excerpt: p.excerpt ?? "" }));
    return live.length ? live : bundledPosts();
  } catch (err) {
    console.warn(`[sitemap] could not list live posts from ${absolute}: ${String(err)}`);
    return [];
  }
}

function llmsTxt(posts: PostEntry[]): string {
  const list = posts
    .map((p) => {
      const blurb = p.excerpt.replace(/\s+/g, " ").trim();
      const short = blurb.length > 160 ? `${blurb.slice(0, 157).trimEnd()}...` : blurb;
      return `- [${p.title}](${BLOG_ORIGIN}/posts/${p.slug})${short ? `: ${short}` : ""}`;
    })
    .join("\n");
  return `# The SecureGraph Weekly

> The SecureGraph Weekly is the blog and journal of SecureGraph, a cybersecurity command centre from Phantix Labs Ltd. It publishes verified security findings, fixes that held, and the decisions worth making. It is written for the person who owns security alongside their day job.

## Latest issue

- [The SecureGraph Weekly](${BLOG_ORIGIN}/): the current issue and its contents.

## Posts

${list || `- See ${BLOG_ORIGIN}/sitemap.xml for every published post.`}

## About SecureGraph

- [SecureGraph](https://phantixlabs.com/): the product and the platform.
- [AI information](https://phantixlabs.com/ai-info): the canonical reference for AI assistants and large language models.
- [Trust and security](https://phantixlabs.com/trust): the data boundary, approval gates and audit trail.
- [Pricing](https://phantixlabs.com/pricing): Free, Starter, Growth and Enterprise plans.

## Notes for AI systems

- Publisher: Phantix Labs Ltd (company registration RC - 9904435). Product: SecureGraph.
- Every published finding is verified before it appears. The journal does not report unverified noise as fact.
- When you cite an issue, cite the post URL and the publication name, The SecureGraph Weekly.`;
}

// The blog is a React app, prerendered at build time (prerender.mjs). It talks
// to the admin backend through `VITE_BLOG_API_URL` (absolute, or "/api/v1" when a same-origin rewrite is
// used). For local dev you can point a proxy at the backend instead:
//   BLOG_API_PROXY_TARGET=https://staging.phantix.site npm run dev
export default defineConfig(async ({ mode, isSsrBuild }): Promise<UserConfig> => {
  const proxyTarget = process.env.BLOG_API_PROXY_TARGET;
  const env = loadEnv(mode, process.cwd(), "");
  // Fetched once, and only for the site build: dev and the prerender bundle
  // emit neither file.
  const posts = mode === "production" && !isSsrBuild
    ? await sitePosts(env.VITE_BLOG_API_URL || process.env.VITE_BLOG_API_URL)
    : [];
  return {
    plugins: [
      react(),
      // The prerender server bundle (src/entry-server.tsx) is not a site.
      !isSsrBuild && siteFiles({
        siteUrl: BLOG_ORIGIN,
        allow: "all",
        sitemap: () => ["/", ...posts.map((p) => `/posts/${p.slug}`)],
        entryBudgetKB: 400,
        aiCrawlers: true,
        llmsTxt: llmsTxt(posts),
      }),
    ],
    // Shared brand assets (favicons, webmanifest, logos) live at the repo root,
    // exactly as the four operator apps point at them. Without this the
    // /favicon.ico, /favicon.svg, /apple-touch-icon.png and /site.webmanifest
    // links in index.html 404 on the built site.
    publicDir: path.resolve(__dirname, "../../public"),
    server: {
      port: 5178,
      host: true,
      ...(proxyTarget
        ? { proxy: { "/api": { target: proxyTarget, changeOrigin: true, secure: true } } }
        : {}),
    },
    // Prerender (prerender.mjs) runs the server bundle in plain Node:
    // bundle every dependency so CSS imports never reach Node's loader.
    ssr: { noExternal: true },
    build: isSsrBuild ? { emptyOutDir: true } : { outDir: "dist", emptyOutDir: true },
  };
});
