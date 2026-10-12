# sg-shared

The code Core, Attack, Defend and Code are built from: the application shell,
sign-in and the cross-app handoff, the API client, the store, and the pages and
components more than one app shows. It is source only; each app compiles it.

| | |
| --- | --- |
| **Live** | None on its own; it ships inside the four operator apps |
| **Users** | Frontend engineers working on any operator app |
| **Part of** | Phantix-Frontend monorepo, `packages/sg-shared` (`@phantix/sg-shared`) |
| **Stack** | React 18, TypeScript; imported as source through the `@sg` alias |
| **Local** | None; run an app (for example `npm run dev:core`) |
| **Deploys to** | With each app that imports it |

## What it does

| Area | Where |
| --- | --- |
| Application shell: sidebar, topbar, switcher, sign-in gate, session-expired card | `src/shell/ApplicationShell.tsx` |
| Cross-app handoff: mint, redeem, sign out everywhere | `src/shell/session.ts`, `src/applications.ts` |
| API client: cookie session transport, renewal, 401 handling, dual-control headers | `src/api.ts`, `src/apiOrigin.ts` |
| Store: session, organization, operate mode, toasts | `src/store.tsx` |
| Hosts and constants: app URLs per environment | `src/config.ts` |
| Shared pages: sign-in, app picker, findings tracker, asset inventory, agent, docs | `src/pages/` |
| Pentest agent workspace and drawer (Attack) | `src/components/AgiWorkspace.tsx`, `AgiDrawer.tsx` |
| Notifications, dual-control overlay, upgrade and section gates | `src/components/` |
| Domain helpers for VAPT, SOC, compliance, code, assurance | `src/vaptOps.ts`, `socOps.ts`, `complianceGrc.ts`, `codeOps.ts`, `assurance.ts` |
| Demo data for the demo mode | `src/demo-data.ts`, `src/data.ts` |
| Vite plugin: sitemap, robots.txt, first-paint budget, prerender | `vite/siteFiles.ts`, `vite/prerender.mjs` |

## How it fits

- Each app aliases `@sg` to `packages/sg-shared/src` in its `vite.config.ts` and
  `tsconfig.json`, and dedupes React, React Router, Framer Motion and Lucide so
  one copy of each runs.
- `@docs` is aliased to the repository root, so the docs pages render the
  Markdown in `docs/` as raw text at build time.
- A change here affects all four apps. Each app's Vercel `ignoreCommand` watches
  `packages/`, so a change here rebuilds all four.

## Run it locally

There is nothing to run on its own. Start any app from the repository root, for
example `npm run dev:core`; Vite reloads it when a file here changes.

## Configuration

None. Hosts come from `src/config.ts`, which reads the `VITE_*_URL` overrides
described in the [repository README](../../README.md#configuration).

## Project layout

```
src/
  shell/        ApplicationShell, handoff and sign-out, shell API helpers, types
  pages/        Pages more than one app routes to (Login, ChooseApp, Tracker, Docs …)
  components/   Shared components (agent, notifications, overlays, gates, charts)
  ui/, ui.tsx   Radix-based primitives and the design-system wrappers
  api.ts        The API client
  store.tsx     The store provider
  config.ts     Application hosts and constants
  index.ts      Public exports
vite/           siteFiles.ts plugin and the prerender.mjs helper
```

## Checks

The package has no build or test script of its own. Its code is typechecked by
every app that imports it:

```bash
npm run typecheck:all     # from the repository root
```

## Deploy

Deployed as part of each app. Merging to `main` redeploys all four operator apps.

## Related

- [Repository README](../../README.md)
- Apps: [Core](../../apps/securegraph-core/README.md), [Attack](../../apps/securegraph-attack/README.md), [Defend](../../apps/securegraph-defend/README.md), [Code](../../apps/securegraph-code/README.md)
