import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { docPageIds, siteFiles } from "../../packages/sg-shared/vite/siteFiles";

// SecureGraph application shell. Browser config is same-origin; the dev server
// proxies /api upstream. Shared code lives in ../../packages/sg-shared.
export default defineConfig(({ mode, isSsrBuild }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget =
    env.API_PROXY_TARGET || process.env.API_PROXY_TARGET || "https://staging.phantix.site";
  const port = Number(env.DEV_PORT || process.env.DEV_PORT || 5176);
  return {
    plugins: [
      react(),
      // The prerender server bundle (src/entry-server.tsx) is not a site.
      !isSsrBuild && siteFiles({
        siteUrl: "https://defend.phantixlabs.com",
        // Only the documentation is public: every other route renders inside
        // the operator shell, which bounces a signed-out visitor to Core's
        // sign-in page (`/` included).
        allow: ["/docs"],
        sitemap: () => [
          "/docs",
          ...docPageIds(path.resolve(__dirname, "../../packages/sg-shared/src")).map((id) => `/docs/${id}`),
        ],
        // Every authenticated surface (see src/App.tsx). `/assets` is absent on
        // purpose: a prefix `Disallow: /assets` would also block Vite's hashed
        // /assets/*.js bundle and break rendering-based indexing. The catch-all
        // below still blocks the Defend Assets page.
        disallow: [
          "/api/",
          "/posture",
          "/cloud",
          "/risks",
          "/endpoint-monitoring",
          "/threat-intel",
          "/alerts",
          "/compliance",
          "/soc",
          "/assistant",
        ],
        aiCrawlers: true,
        entryBudgetKB: 600,
      }),
    ],
    publicDir: path.resolve(__dirname, "../../public"),
    resolve: {
      // One React/router instance across app + packages/sg-shared.
      dedupe: ["react", "react-dom", "react-router-dom", "lucide-react", "framer-motion"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@app": path.resolve(__dirname, "./src"),
        "@sg": path.resolve(__dirname, "../../packages/sg-shared/src"),
        // Shared modules read the product docs as raw markdown; the alias is
        // the repo root, exactly as the Command Centre defines it.
        "@docs": path.resolve(__dirname, "../.."),
      },
    },
    server: {
      port,
      host: true,
      proxy: { "/api": { target: apiTarget, changeOrigin: true, secure: true, ws: true } },
    },
    // Prerender (prerender.mjs) runs the server bundle in plain Node:
    // bundle every dependency so CSS / font imports never reach Node's loader.
    ssr: { noExternal: true },
    build: isSsrBuild ? { emptyOutDir: true } : {
      // Lazy chunks for heavy libraries (Mermaid and its parser, Cytoscape) are
      // ~700 KB and load only on the pages that draw diagrams. The first-paint
      // bundle has its own, stricter budget (siteFiles, in plugins above).
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            motion: ["framer-motion"],
          },
        },
      },
    },
  };
});
