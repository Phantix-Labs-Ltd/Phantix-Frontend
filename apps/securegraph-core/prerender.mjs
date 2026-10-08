// Prerender Core's public routes into static HTML after `vite build`.
//
// Vercel serves a file that exists before applying the SPA rewrite, so
// /docs/<id>/index.html answers /docs/<id> with real content and its own
// title, description and canonical URL. Every other path falls back to
// app-shell.html, the untouched SPA entry, so a signed-in deep link never
// flashes the home page. The browser mounts with createRoot and replaces the
// markup either way (see src/entry-server.tsx).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

// React's production server build: no dev-only warnings (nothing hydrates).
process.env.NODE_ENV = "production";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "dist");
const ssrEntry = path.resolve(here, "../../node_modules/.prerender/core/entry-server.js");
const ORIGIN = "https://app.phantixlabs.com";
const BASE_TITLE = "SecureGraph Core: Security Graph, Findings and Reporting";
const BASE_DESCRIPTION =
  "One security graph for every finding, asset and risk. Track remediation, run board-ready reports and get real-time alerts from every SecureGraph application.";
const STATIC_PAGES = {
  "/": { title: BASE_TITLE, description: BASE_DESCRIPTION },
  "/docs": {
    title: "Documentation · SecureGraph Core",
    description: "Guides for setting up SecureGraph, connecting your systems and running security work across Core, Attack, Defend and Code.",
  },
  "/privacy": {
    title: "Privacy and data requests · SecureGraph Core",
    description: "How SecureGraph handles your data, and how to raise an access, correction or deletion request.",
  },
  "/cookies": {
    title: "Cookies and analytics · SecureGraph Core",
    description: "What SecureGraph measures, why, and how to change your choices.",
  },
  "/sandbox-apply": {
    title: "Apply to the launch sandbox · SecureGraph Core",
    description: "Apply to join the SecureGraph launch sandbox as a design partner.",
  },
};

// ── Browser globals for modules that touch window at import time ────────────
const dom = new JSDOM("<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>", {
  url: `${ORIGIN}/`,
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

const { render, docs } = await import(pathToFileURL(ssrEntry).href);

// ── Head helpers ─────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function setTag(html, pattern, tag) {
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `    ${tag}\n  </head>`);
}

function page(template, route, body, { title, description }) {
  const href = `${ORIGIN}${route === "/" ? "/" : route}`;
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

// ── Render ───────────────────────────────────────────────────────────────────
// The SPA fallback for every non-prerendered path (see vercel.json rewrites).
// Written once from the fresh build; a rerun starts from it, never from an
// index.html that is already prerendered.
const shell = path.join(dist, "app-shell.html");
if (!fs.existsSync(shell)) fs.copyFileSync(path.join(dist, "index.html"), shell);
const template = fs.readFileSync(shell, "utf8");
if (!template.includes('<div id="root"></div>')) {
  console.error("prerender: app-shell.html has no empty #root; rebuild with vite build first");
  process.exit(1);
}

const routes = [
  ...Object.keys(STATIC_PAGES).map((route) => [route, STATIC_PAGES[route]]),
  ...docs.map((d) => [
    `/docs/${d.id}`,
    { title: `${d.title} · SecureGraph Core`, description: d.description || BASE_DESCRIPTION },
  ]),
];

const failures = [];
let rendered = 0;
for (const [route, meta] of routes) {
  try {
    const body = await render(route);
    if (!body || body.length < 200) throw new Error(`rendered only ${body.length} bytes`);
    const out = route === "/" ? path.join(dist, "index.html") : path.join(dist, route, "index.html");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, page(template, route, body, meta));
    rendered += 1;
  } catch (error) {
    failures.push(`${route}: ${error?.message ?? error}`);
  }
}

console.log(`prerender: ${rendered}/${routes.length} public routes rendered`);
if (failures.length) console.warn(`prerender: failed\n  ${failures.slice(0, 20).join("\n  ")}`);
// A route that fails falls back to the SPA, which still works; only a wholesale
// failure (nothing rendered) means the setup itself broke and fails the build.
if (rendered === 0) process.exit(1);
process.exit(0);
