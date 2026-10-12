# SecureGraph Core

The entry point to SecureGraph. Operators sign in here, pick an application, and
work the security graph every application shares: assets, findings, reports,
assurance and the audit trail. Core also serves the public home page and the
product documentation.

| | |
| --- | --- |
| **Live** | https://app.phantixlabs.com |
| **Users** | Every operator (sign-in and the shared graph); the public (home, docs, legal pages) |
| **Part of** | Phantix-Frontend monorepo, `apps/securegraph-core` |
| **Stack** | React 18, TypeScript, Vite 5, Tailwind CSS, shared code from `packages/sg-shared` |
| **Local** | http://localhost:5173 |
| **Deploys to** | Vercel, on push to `main` |

## What it does

| Area | Routes |
| --- | --- |
| Sign-in | `/login`, `/password-reset`, `/reset-password`, `/device-confirm` |
| Application picker | `/choose-app`: forwards to Attack, Defend or Code with a handoff code |
| Overview | `/dashboard`, `/analytics` |
| Findings | `/tracker` (findings tracker), `/findings` (findings intake), `/reports`, `/reports/:id/view` |
| Security graph | `/assets`, `/integrations` (Integrations hub, with OAuth and GitHub callbacks) |
| Assurance | `/assurance` (engagements), `/assurance/regimes`, `/assurance/profile`, `/assurance/reports`, `/assurance/monitoring` |
| Governance | `/audit`, `/agent-activity`, `/authorizations` (the authorizer's inbox for dual control) |
| Help | `/assistant`, `/docs`, `/support`, `/sandbox` |
| Danger zone | `/danger-zone`: asset removal |
| Public | `/` (home), `/docs`, `/privacy`, `/cookies`, `/sandbox-apply` |

The public pages are prerendered to static HTML at build time and are the only
routes listed in the sitemap.

## How it fits

- **Sign-in for every app.** Attack, Defend and Code send a signed-out visitor to
  `/login?next=<app>`. After sign-in, the picker mints a handoff code
  (`POST /api/v1/app/auth/handoff`) and opens the app with it in the URL fragment.
- **Arrives from the Platform.** Organization admins finish setup on
  platform.phantixlabs.com, then come here to operate.
- **API.** Calls `/api/v1` on its own origin; Vercel rewrites it to the backend.
  The session is an HttpOnly cookie on this origin.
- **Shared code.** The shell, sign-in, picker, tracker and docs pages come from
  `packages/sg-shared`. Core adds the pages above and the public chrome.

## Run it locally

Prerequisites: Node 20; `npm install` at the repository root.

```bash
npm run dev:core          # from the repository root → http://localhost:5173
```

The dev server proxies `/api` to `https://staging.phantix.site`. For a local
backend: `API_PROXY_TARGET=http://localhost:8000 npm run dev:core`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PROXY_TARGET` | `https://staging.phantix.site` | Dev proxy target for `/api`. Server-side only. |
| `DEV_PORT` | `5173` | Port when `vite` runs without the npm script. |
| `VITE_ATTACK_URL`, `VITE_DEFEND_URL`, `VITE_CODE_URL`, `VITE_PLATFORM_URL` | local ports in dev, production hosts in a build | Open a deployed sibling from a local Core. |

## Project layout

```
src/
  App.tsx             Routes: public, sign-in, then the shell
  nav.tsx             Sidebar groups and items
  hosts.ts            Sibling application hosts for the switcher
  pages/              Core pages (Dashboard, Reports, Audit, assurance/, auth/ …)
  components/         PublicChrome: header and footer for the public pages
  lib/useSeo.ts       Public paths, titles and robots tags
  entry-server.tsx    Server entry for prerendering
prerender.mjs         Writes static HTML for the public pages after the build
vercel.json           Build, /api/v1 rewrite, security headers
vite.config.ts        Dev proxy, aliases, sitemap and robots.txt
```

## Checks

```bash
npm run typecheck         # in apps/securegraph-core
npm run build             # tsc, vite build, server build, prerender
```

CI runs both on every push and pull request.

## Deploy

The Vercel project has its Root Directory set to `apps/securegraph-core`. A push
to `main` deploys production. Vercel serves a prerendered file when one exists
and rewrites every other path to `app-shell.html`.

## Related

- [Repository README](../../README.md) and [DEPLOYMENT.md](../../DEPLOYMENT.md)
- [packages/sg-shared](../../packages/sg-shared/README.md): shell, sign-in and handoff
- Siblings: [Attack](../securegraph-attack/README.md), [Defend](../securegraph-defend/README.md), [Code](../securegraph-code/README.md)
