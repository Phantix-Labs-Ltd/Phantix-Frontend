# SecureGraph Attack

The offensive testing application. Operators scope targets, run web, API and
mobile scans, plan and run VAPT campaigns, and drive the autonomous pentest
agent against assets they have verified.

| | |
| --- | --- |
| **Live** | https://attack.phantixlabs.com |
| **Users** | Operators running penetration tests and VAPT |
| **Part of** | Phantix-Frontend monorepo, `apps/securegraph-attack` |
| **Stack** | React 18, TypeScript, Vite 5, Tailwind CSS, shared code from `packages/sg-shared` |
| **Local** | http://localhost:5175 |
| **Deploys to** | Vercel, on push to `main` |

## What it does

| Area | Routes |
| --- | --- |
| Overview | `/` |
| Scope | `/targets`, `/pentest-scope` |
| Pentest agent | `/pentest-agent`, `/prior-reports`, and the agent drawer on every page |
| Testing | `/scans` (web and API), `/mobile`, `/tracker` (findings tracker) |
| VAPT | `/vapt` (campaigns), `/vapt/schedules`, `/vapt/procedures`, `/vapt/settings` |
| Help | `/assistant`, `/docs` |

- **First VAPT journey.** While every campaign is still a draft, `/vapt` shows
  `FirstVaptJourney`: add an asset, verify it, review the plan, start.
- **Pentest agent drawer.** `AgiDrawer` is mounted outside the shell so an agent
  session keeps running while the operator moves between pages. Its workspace
  loads once the shell has verified the session.
- **Plan-gated sections.** The pentest agent (`attack.pentest_agent`) and mobile
  testing (`attack.mobile`) are wrapped in `SectionGate` and show an upgrade
  prompt when the plan does not include them.

## How it fits

- **Sign-in through Core.** A signed-out visitor is sent to Core's
  `/login?next=attack`. Core returns them with a handoff code in the fragment,
  which the shell redeems before any other call.
- **API.** Calls `/api/v1` on its own origin; Vercel rewrites it to the backend.
  The agent's sessions run on the backend's AGI runner (`services/phantix-agi`).
- **Shared graph.** Assets and findings are the same records Core and Defend
  show; the findings tracker is the shared `Tracker` page.

## Run it locally

Prerequisites: Node 20; `npm install` at the repository root.

```bash
npm run dev:attack        # from the repository root → http://localhost:5175
```

Sign-in happens on Core, so run Core too (`npm run dev:core`). The dev server
proxies `/api` to `https://staging.phantix.site`; set `API_PROXY_TARGET` for a
local backend. The staff portal's dev script also uses 5175, so don't run both
on their default ports.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PROXY_TARGET` | `https://staging.phantix.site` | Dev proxy target for `/api`. Server-side only. |
| `DEV_PORT` | `5175` | Port when `vite` runs without the npm script. |
| `VITE_CORE_URL` | `http://localhost:5173` in dev | Where sign-in and the picker live. |

## Project layout

```
src/
  App.tsx               Routes inside the shell, the docs, and the agent drawer
  nav.tsx               Sidebar groups and items
  hosts.ts              Sibling application hosts
  FirstVaptJourney.tsx  The first-VAPT card on /vapt
  pages/                Overview, Targets, Scans, Mobile, Vapt*, PriorReports, PentestScope
  lib/useSeo.ts         /docs is public; everything else is noindex
prerender.mjs           Static HTML for the docs pages
vercel.json             Build, /api/v1 rewrite, security headers
```

## Checks

```bash
npm run typecheck         # in apps/securegraph-attack
npm run build
```

CI runs both on every push and pull request.

## Deploy

The Vercel project has its Root Directory set to `apps/securegraph-attack`. A
push to `main` deploys production. The build is skipped when nothing under this
folder, `packages/`, `docs/`, `public/` or the root package files changed.

## Related

- [Repository README](../../README.md) and [DEPLOYMENT.md](../../DEPLOYMENT.md)
- [packages/sg-shared](../../packages/sg-shared/README.md): shell, handoff, agent workspace
- Siblings: [Core](../securegraph-core/README.md), [Defend](../securegraph-defend/README.md), [Code](../securegraph-code/README.md)
