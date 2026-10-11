// Prerender the Weekly's issue page and every essay into static HTML after
// `vite build`.
//
// Vercel serves a file that exists before applying the SPA rewrite, so
// /posts/<slug>/index.html answers /posts/<slug> with the essay itself and its
// own title, description and canonical URL. Every other path (a post published
// after this build, a mistyped URL) falls back to app-shell.html, the untouched
// SPA entry, which loads from the API as before.
//
// Each page embeds the content it was rendered from (#weekly-content), so the
// browser paints the same essay at once and then refreshes it from the API.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

process.env.NODE_ENV = "production";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "dist");
const ssrEntry = path.resolve(here, "../../node_modules/.prerender/blog/entry-server.js");
const ORIGIN = "https://blog.phantixlabs.com";
const PUBLICATION = "The SecureGraph Weekly";

// ── Browser globals for modules that touch window at import or render time ──
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: `${ORIGIN}/`,
  pretendToBeVisual: true,
});
const w = dom.window;
w.matchMedia = () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
for (const key of [
  "window", "document", "navigator", "location", "history", "localStorage", "sessionStorage",
  "HTMLElement", "Element", "Node", "getComputedStyle", "requestAnimationFrame",
  "cancelAnimationFrame", "matchMedia",
]) {
  const value = key === "window" ? w : w[key];
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  } catch {
    /* a read-only Node global (e.g. navigator) stays as is */
  }
}

const { render, snapshot, setContentOrigin, API_MODE } = await import(pathToFileURL(ssrEntry).href);

// ── Head helpers ─────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function setTag(html, pattern, tag) {
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `    ${tag}\n  </head>`);
}

function page(template, route, body, data, meta) {
  const href = `${ORIGIN}${route}`;
  // JSON in a non-executing script: allowed by the CSP, and "<" is escaped so
  // an essay can never close the tag early.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  let html = template.replace(
    /<div id="root"><\/div>/,
    `<div id="root">${body}</div>\n    <script type="application/json" id="weekly-content">${json}</script>`,
  );
  if (!meta) return html;
  html = setTag(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`);
  html = setTag(html, /<meta\s+name="description"[\s\S]*?\/>/, `<meta name="description" content="${esc(meta.description)}" />`);
  html = setTag(html, /<link\s+rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(href)}" />`);
  html = setTag(html, /<meta\s+property="og:type"[^>]*>/, `<meta property="og:type" content="article" />`);
  html = setTag(html, /<meta\s+property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(href)}" />`);
  html = setTag(html, /<meta\s+property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(meta.title)}" />`);
  html = setTag(html, /<meta\s+property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(meta.description)}" />`);
  html = setTag(html, /<meta\s+name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(meta.title)}" />`);
  html = setTag(html, /<meta\s+name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(meta.description)}" />`);
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

// Same-origin API bases ("/api/v1/blog") resolve against the site, exactly as
// in the browser (vercel.json rewrites /api/v1 to the backend).
setContentOrigin(ORIGIN);

let issue;
try {
  issue = await snapshot([]);
} catch (error) {
  // An unreachable API must not fail the deploy: every page stays the SPA,
  // which loads from the API in the browser as before.
  console.warn(`prerender: content API unreachable (${error?.message ?? error}); serving the SPA shell only`);
  process.exit(0);
}

const featured = issue.posts.find((p) => p.featured)?.slug ?? issue.posts[0]?.slug;
const routes = [
  ["/", featured ? [featured] : [], null],
  ...issue.posts.map((p) => [
    `/posts/${p.slug}`,
    [p.slug],
    {
      title: `${p.title} · ${PUBLICATION}`,
      description: p.excerpt || `${p.title}, from ${PUBLICATION} by SecureGraph.`,
    },
  ]),
];

const failures = [];
let rendered = 0;
for (const [route, slugs, meta] of routes) {
  try {
    const data = await snapshot(slugs);
    const body = await render(route);
    if (!body || body.length < 200) throw new Error(`rendered only ${body.length} bytes`);
    if (/This essay is not in the Weekly|did not arrive/.test(body)) throw new Error("rendered an error state");
    const out = route === "/" ? path.join(dist, "index.html") : path.join(dist, route, "index.html");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, page(template, route, body, data, meta));
    rendered += 1;
  } catch (error) {
    failures.push(`${route}: ${error?.message ?? error}`);
  }
}

console.log(`prerender: ${rendered}/${routes.length} pages rendered (${API_MODE} mode, ${issue.source} issue)`);
if (failures.length) console.warn(`prerender: failed\n  ${failures.join("\n  ")}`);
// A page that fails falls back to the SPA, which still works; only a wholesale
// failure (nothing rendered) means the setup itself broke and fails the build.
if (rendered === 0) process.exit(1);
process.exit(0);
