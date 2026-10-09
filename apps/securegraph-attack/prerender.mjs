// Prerender SecureGraph Attack's public routes (the documentation) into static HTML after
// `vite build`. The operator routes, `/` included, stay on the SPA entry: they
// need a signed-in session. See packages/sg-shared/vite/prerender.mjs.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prerenderApp } from "../../packages/sg-shared/vite/prerender.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const NAME = "SecureGraph Attack";
const DOCS_DESCRIPTION = "Guides for scoping VAPT campaigns, running scans and the autonomous pentest agent in SecureGraph Attack.";

process.exit(
  await prerenderApp({
    dist: path.resolve(here, "dist"),
    ssrEntry: path.resolve(here, "../../node_modules/.prerender/attack/entry-server.js"),
    origin: "https://attack.phantixlabs.com",
    routes: ({ docs }) => [
      ["/docs", { title: `Documentation · ${NAME}`, description: DOCS_DESCRIPTION }],
      ...docs.map((d) => [`/docs/${d.id}`, { title: `${d.title} · ${NAME}`, description: d.description || DOCS_DESCRIPTION }]),
    ],
  }),
);
