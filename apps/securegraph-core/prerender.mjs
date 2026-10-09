// Prerender Core's public routes into static HTML after `vite build`.
//
// Vercel serves a file that exists before applying the SPA rewrite, so
// /docs/<id>/index.html answers /docs/<id> with real content and its own
// title, description and canonical URL. Every other path falls back to
// app-shell.html, the untouched SPA entry, so a signed-in deep link never
// flashes the home page. The rendering itself is shared by every app: see
// packages/sg-shared/vite/prerender.mjs.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prerenderApp } from "../../packages/sg-shared/vite/prerender.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
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

process.exit(
  await prerenderApp({
    dist: path.resolve(here, "dist"),
    ssrEntry: path.resolve(here, "../../node_modules/.prerender/core/entry-server.js"),
    origin: "https://app.phantixlabs.com",
    routes: ({ docs }) => [
      ...Object.keys(STATIC_PAGES).map((route) => [route, STATIC_PAGES[route]]),
      ...docs.map((d) => [
        `/docs/${d.id}`,
        { title: `${d.title} · SecureGraph Core`, description: d.description || BASE_DESCRIPTION },
      ]),
    ],
  }),
);
