import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { siteFiles } from "../../packages/sg-shared/vite/siteFiles";

const BLOG_ORIGIN = "https://blog.phantixlabs.com";

/**
 * Post paths for the sitemap. Bundled posts come from src/content/posts (slug
 * rules mirror lib/frontmatter.ts); when the build is configured with a live
 * content API its published posts are added too. An unreachable API only
 * shrinks the sitemap to the bundled posts — it never fails the build.
 */
async function postPaths(apiUrl: string | undefined): Promise<string[]> {
  const dir = path.resolve(__dirname, "src/content/posts");
  const slugs = new Set(
    (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, "").replace(/^\d+-/, "")),
  );
  const base = (apiUrl ?? "").trim().replace(/\/+$/, "");
  if (base) {
    const absolute = base.startsWith("/") ? `${BLOG_ORIGIN}${base}` : base;
    try {
      const res = await fetch(`${absolute}/posts`, { signal: AbortSignal.timeout(8000) });
      const data = (await res.json()) as { posts?: { slug?: string }[] };
      for (const p of data.posts ?? []) if (p.slug) slugs.add(p.slug);
    } catch (err) {
      console.warn(`[sitemap] could not list live posts from ${absolute}: ${String(err)}`);
    }
  }
  return ["/", ...[...slugs].map((s) => `/posts/${s}`)];
}

// The blog is a client-only React app. It talks to the admin backend through
// `VITE_BLOG_API_URL` (absolute, or "/api/v1" when a same-origin rewrite is
// used). For local dev you can point a proxy at the backend instead:
//   BLOG_API_PROXY_TARGET=https://staging.phantix.site npm run dev
export default defineConfig(({ mode }) => {
  const proxyTarget = process.env.BLOG_API_PROXY_TARGET;
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      siteFiles({
        siteUrl: BLOG_ORIGIN,
        allow: "all",
        sitemap: () => postPaths(env.VITE_BLOG_API_URL || process.env.VITE_BLOG_API_URL),
        entryBudgetKB: 400,
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
    build: { outDir: "dist", emptyOutDir: true },
  };
});
