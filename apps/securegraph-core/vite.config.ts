import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { docPageIds, siteFiles } from "../../packages/sg-shared/vite/siteFiles";

// SecureGraph application shell. Browser config is same-origin; the dev server
// proxies /api upstream. Shared code lives in ../../packages/sg-shared.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget =
    env.API_PROXY_TARGET || process.env.API_PROXY_TARGET || "https://staging.phantix.site";
  const port = Number(env.DEV_PORT || process.env.DEV_PORT || 5173);
  return {
    plugins: [
      react(),
      siteFiles({
        siteUrl: "https://app.phantixlabs.com",
        // Home, the docs and the legal pages are public; everything else is
        // behind sign-in. `/login` is crawlable so a crawler can read its
        // noindex tag, but it is not listed in the sitemap: the form has no
        // content of its own.
        allow: ["/$", "/login", "/docs", "/privacy", "/cookies", "/sandbox-apply"],
        sitemap: () => [
          "/",
          "/docs",
          "/privacy",
          "/cookies",
          "/sandbox-apply",
          ...docPageIds(path.resolve(__dirname, "../../packages/sg-shared/src")).map((id) => `/docs/${id}`),
        ],
        // Everything the Core shell owns, plus the entry and reset flows that
        // must never be indexed. `/assets` is deliberately absent: robots.txt
        // matches by prefix, so `Disallow: /assets` would also block Vite's
        // hashed /assets/*.js bundle and stop Google rendering /docs at all.
        // The catch-all below already blocks that page.
        disallow: [
          "/api/",
          "/choose-app",
          "/dashboard",
          "/analytics",
          "/tracker",
          "/findings",
          "/reports",
          "/integrations",
          "/audit",
          "/agent",
          "/authorizations",
          "/support",
          "/sandbox",
          "/danger-zone",
          "/assistant",
          "/password-reset",
          "/reset-password",
          "/device-confirm",
        ],
        // Query the AI crawlers the landing site welcomes; they get the public
        // routes only, exactly like `User-agent: *`.
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
    build: {
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
