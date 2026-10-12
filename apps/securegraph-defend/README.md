# SecureGraph Defend

The defensive monitoring application. Operators watch exposure and cloud
posture, keep the risk register, run compliance work, and operate the SOC:
alerts, playbooks, detection packs, log pipeline and endpoint agents.

| | |
| --- | --- |
| **Live** | https://defend.phantixlabs.com |
| **Users** | Security and IT operators, SOC analysts, compliance owners |
| **Part of** | Phantix-Frontend monorepo, `apps/securegraph-defend` |
| **Stack** | React 18, TypeScript, Vite 5, Tailwind CSS, shared code from `packages/sg-shared` |
| **Local** | http://localhost:5176 |
| **Deploys to** | Vercel, on push to `main` |

## What it does

| Area | Routes |
| --- | --- |
| Overview | `/` |
| Assets and exposure | `/assets`, `/assets/intelligence`, `/assets/intelligence/graph`, `/posture` |
| Cloud | `/cloud` (cloud posture), `/cloud-config` (config changes) |
| Risk and monitoring | `/risks` (risk register), `/endpoint-monitoring` |
| Compliance | `/compliance`, `/compliance/questionnaire`, `/compliance/gaps`, `/compliance/profile`, `/compliance/connectors` |
| SOC | `/soc`, `/security-alerts`, `/soc/war-room`, `/soc/playbooks`, `/soc/advisor` |
| Detection and logs | `/detection-packs`, `/soc/logs`, `/log-retention`, `/soc/agents`, `/soc/cloud` |
| Threat response | `/alerts` (incidents), `/threat-intel` |
| Help | `/assistant`, `/docs` |

- **Plan-gated sections.** Cloud, every compliance page, every SOC page and threat
  intel are wrapped in `SectionGate` (`defend.cloud`, `defend.compliance*`,
  `defend.soc*`, `defend.threat_intel`).
- **Endpoint agents.** `/soc/agents` offers the heartbeat agent downloads for
  Linux, macOS and Windows; the agent itself lives in the backend repository
  (`agents/phantix-heartbeat`).

## How it fits

- **Sign-in through Core.** A signed-out visitor goes to Core's
  `/login?next=defend` and comes back with a handoff code.
- **API.** Calls `/api/v1` on its own origin; Vercel rewrites it to the backend.
  SOC data comes from the backend's SOC engine and the heartbeat agents.
- **Shared graph.** The asset inventory and risks are the same records Core and
  Attack use.

## Run it locally

Prerequisites: Node 20; `npm install` at the repository root.

```bash
npm run dev:defend        # from the repository root → http://localhost:5176
```

Sign-in happens on Core, so run Core too (`npm run dev:core`). The dev server
proxies `/api` to `https://staging.phantix.site`; set `API_PROXY_TARGET` for a
local backend.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PROXY_TARGET` | `https://staging.phantix.site` | Dev proxy target for `/api`. Server-side only. |
| `DEV_PORT` | `5176` | Port when `vite` runs without the npm script. |
| `VITE_CORE_URL` | `http://localhost:5173` in dev | Where sign-in and the picker live. |

## Project layout

```
src/
  App.tsx           Routes inside the shell and the docs, with section gates
  nav.tsx           Sidebar groups and items
  hosts.ts          Sibling application hosts
  pages/            Posture, Cloud, Risks, Compliance*, Soc*, DetectionPacks, ThreatIntel …
  lib/useSeo.ts     /docs is public; everything else is noindex
prerender.mjs       Static HTML for the docs pages
vercel.json         Build, /api/v1 rewrite, security headers
```

## Checks

```bash
npm run typecheck         # in apps/securegraph-defend
npm run build
```

CI runs both on every push and pull request.

## Deploy

The Vercel project has its Root Directory set to `apps/securegraph-defend`. A
push to `main` deploys production.

## Related

- [Repository README](../../README.md) and [DEPLOYMENT.md](../../DEPLOYMENT.md)
- [docs/SOC-TELEMETRY-FE-HANDOFF.md](../../docs/SOC-TELEMETRY-FE-HANDOFF.md): SOC telemetry contract
- Siblings: [Core](../securegraph-core/README.md), [Attack](../securegraph-attack/README.md), [Code](../securegraph-code/README.md)
