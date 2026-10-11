// Build-time prerender shared by every SecureGraph application.
//
// Each app's prerender.mjs names its public routes; this module renders them
// with the app's server bundle (src/entry-server.tsx, built by
// `vite build --ssr`) and writes <route>/index.html into dist.
//
// Vercel serves a file that exists before applying the SPA rewrite, so
// /docs/<id>/index.html answers /docs/<id> with real content and its own
// title, description and canonical URL. Every other path falls back to the
// SPA entry. The browser mounts with createRoot and replaces the markup either
// way, so a prerendered page can never cause a hydration mismatch.
//
// Only public pages are rendered. Signed-in screens load their data from the
// API in the browser after sign-in, as before.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function setTag(html, pattern, tag) {
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `    ${tag}\n  </head>`);
}

function page(template, origin, route, body, { title, description }) {
  const href = `${origin}${route === "/" ? "/" : route}`;
  let html = template.replace(/<div id="root"><\/div>/, `<div id="root">${body}</div>`);
  html = setTag(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = setTag(html, /<meta\s+name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`);
  html = setTag(html, /<meta\s+name="robots"[^>]*>/, `<meta name="robots" content="index, follow" />`);
  html = setTag(html, /<link\s+rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(href)}" />`);
  html = setTag(html, /<meta\s+property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(href)}" />`);
  html = setTag(html, /<meta\s+property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}" />`);
  html = setTag(html, /<meta\s+property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(description)}" />`);
  return html;
}

/** Browser globals for modules that touch window at import time. */
function installDom(origin) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: `${origin}/`,
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const noopObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  w.matchMedia = () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  w.IntersectionObserver = w.IntersectionObserver || noopObserver;
  w.ResizeObserver = w.ResizeObserver || noopObserver;
  w.scrollTo = () => {};
  for (const key of [
    "window", "document", "navigator", "location", "history", "localStorage", "sessionStorage",
    "HTMLElement", "Element", "Node", "Text", "DocumentFragment", "SVGElement", "getComputedStyle",
    "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "IntersectionObserver",
    "ResizeObserver", "MutationObserver", "DOMParser", "CustomEvent", "Event", "scrollTo",
  ]) {
    const value = key === "window" ? w : w[key];
    try {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    } catch {
      /* a read-only Node global (e.g. navigator) stays as is */
    }
  }
}

/**
 * Prerender an app's public routes into its dist folder.
 *
 * @param {object} opts
 * @param {string} opts.dist     The app's `vite build` output.
 * @param {string} opts.ssrEntry The `vite build --ssr` bundle of src/entry-server.tsx.
 * @param {string} opts.origin   Canonical origin, e.g. https://attack.phantixlabs.com.
 * @param {(entry: any) => [string, {title: string, description: string}][]} opts.routes
 *        The routes to render, given the loaded server module.
 * @returns {Promise<number>} The process exit code: 0 unless nothing rendered.
 */
export async function prerenderApp({ dist, ssrEntry, origin, routes }) {
  // React's production server build: no dev-only warnings (nothing hydrates).
  process.env.NODE_ENV = "production";
  installDom(origin);
  const entry = await import(pathToFileURL(ssrEntry).href);

  // The untouched SPA entry, kept beside the prerendered pages. Written once
  // from the fresh build; a rerun starts from it, never from an index.html
  // that is already prerendered.
  const shell = path.join(dist, "app-shell.html");
  if (!fs.existsSync(shell)) fs.copyFileSync(path.join(dist, "index.html"), shell);
  const template = fs.readFileSync(shell, "utf8");
  if (!template.includes('<div id="root"></div>')) {
    console.error("prerender: app-shell.html has no empty #root; rebuild with vite build first");
    return 1;
  }

  const list = routes(entry);
  const failures = [];
  let rendered = 0;
  for (const [route, meta] of list) {
    try {
      const body = await entry.render(route);
      if (!body || body.length < 200) throw new Error(`rendered only ${body?.length ?? 0} bytes`);
      const out = route === "/" ? path.join(dist, "index.html") : path.join(dist, route, "index.html");
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, page(template, origin, route, body, meta));
      rendered += 1;
    } catch (error) {
      failures.push(`${route}: ${error?.message ?? error}`);
    }
  }

  console.log(`prerender: ${rendered}/${list.length} public routes rendered`);
  if (failures.length) console.warn(`prerender: failed\n  ${failures.slice(0, 20).join("\n  ")}`);
  // A route that fails falls back to the SPA, which still works; only a
  // wholesale failure (nothing rendered) means the setup itself broke.
  return rendered === 0 ? 1 : 0;
}
