// Prerender SecureGraph Code's public routes (the documentation) into static HTML after
// `vite build`. The operator routes, `/` included, stay on the SPA entry: they
// need a signed-in session. See packages/sg-shared/vite/prerender.mjs.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prerenderApp } from "../../packages/sg-shared/vite/prerender.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const NAME = "SecureGraph Code";
const DOCS_DESCRIPTION = "Guides for code review, CI/CD checks and threat models in SecureGraph Code.";

process.exit(
  await prerenderApp({
    dist: path.resolve(here, "dist"),
    ssrEntry: path.resolve(here, "../../node_modules/.prerender/code/entry-server.js"),
    origin: "https://code.phantixlabs.com",
    routes: ({ docs }) => [
      ["/docs", { title: `Documentation · ${NAME}`, description: DOCS_DESCRIPTION }],
      ...docs.map((d) => [`/docs/${d.id}`, { title: `${d.title} · ${NAME}`, description: d.description || DOCS_DESCRIPTION }]),
    ],
  }),
);
