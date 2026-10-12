# SecureGraph Code

The application security application. Operators connect source control, review
repositories and pull requests for security issues, let AutoFix propose fixes,
monitor CI/CD, and build threat models from product context.

| | |
| --- | --- |
| **Live** | https://code.phantixlabs.com |
| **Users** | Developers and AppSec engineers |
| **Part of** | Phantix-Frontend monorepo, `apps/securegraph-code` |
| **Stack** | React 18, TypeScript, Vite 5, Tailwind CSS, shared code from `packages/sg-shared` |
| **Local** | http://localhost:5177 |
| **Deploys to** | Vercel, on push to `main` |

## What it does

| Area | Routes |
| --- | --- |
| Overview | `/` |
| Code review | `/code-review`, `/code-review/scans`, `/code-review/scans/:jobId`, `/code-review/repositories`, `/code-review/pull-requests` |
| Automation | `/code-review/autofix`, `/code-review/continuous-pr`, `/cicd` |
| Source control | `/code-review/providers`, `/code-review/providers/github`, `/gitlab`, `/gitea` |
| Design | `/threat-models`, `/context` (product context) |
| Help | `/assistant`, `/docs` |

- **Source-control providers.** GitHub connects through the GitHub App; GitLab and
  Gitea connect as Integrations hub connectors. All three feed the same branch
  review pipeline and the verified-only merge gate. `src/scmProviders.tsx` holds
  their metadata, icons and webhook paths (`/github/webhook`, `/gitlab/webhook`,
  `/gitea/webhook`).
- **Threat models.** Built from the product context projects under `/context`.

## How it fits

- **Sign-in through Core.** A signed-out visitor goes to Core's
  `/login?next=code` and comes back with a handoff code.
- **API.** Calls `/api/v1` on its own origin; Vercel rewrites it to the backend.
  On the backend, source-control connections and their webhooks belong to the
  asset engine, scans to the scanner engine, and threat models to the
  threat-model engine. Provider webhooks go to the backend directly.
- **Integrations.** Connectors are installed in Core's Integrations hub and used here.

## Run it locally

Prerequisites: Node 20; `npm install` at the repository root.

```bash
npm run dev:code          # from the repository root → http://localhost:5177
```

Sign-in happens on Core, so run Core too (`npm run dev:core`). The dev server
proxies `/api` to `https://staging.phantix.site`; set `API_PROXY_TARGET` for a
local backend.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PROXY_TARGET` | `https://staging.phantix.site` | Dev proxy target for `/api`. Server-side only. |
| `DEV_PORT` | `5177` | Port when `vite` runs without the npm script. |
| `VITE_CORE_URL` | `http://localhost:5173` in dev | Where sign-in and the picker live. |

## Project layout

```
src/
  App.tsx            Routes inside the shell and the docs
  nav.tsx            Sidebar groups and items
  hosts.ts           Sibling application hosts
  scmProviders.tsx   GitHub, GitLab and Gitea metadata and webhook paths
  pages/             Code, ScanHistory, ScanDetail, ProviderConnect, CiCd, ThreatModels, ContextProjects
  lib/useSeo.ts      /docs is public; everything else is noindex
prerender.mjs        Static HTML for the docs pages
vercel.json          Build, /api/v1 rewrite, security headers
```

## Checks

```bash
npm run typecheck         # in apps/securegraph-code
npm run build
```

CI runs both on every push and pull request.

## Deploy

The Vercel project has its Root Directory set to `apps/securegraph-code`. A push
to `main` deploys production.

## Related

- [Repository README](../../README.md) and [DEPLOYMENT.md](../../DEPLOYMENT.md)
- [packages/sg-shared](../../packages/sg-shared/README.md): shell and the `CodeReview` component
- Siblings: [Core](../securegraph-core/README.md), [Attack](../securegraph-attack/README.md), [Defend](../securegraph-defend/README.md)
