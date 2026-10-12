# Phantix Frontend

The monorepo for the four SecureGraph operator applications (Core, Attack,
Defend, Code), the shared package they are built from, and The SecureGraph
Weekly blog. It also holds the product documentation they render.

| | |
| --- | --- |
| **Live** | https://app.phantixlabs.com, https://attack.phantixlabs.com, https://defend.phantixlabs.com, https://code.phantixlabs.com, https://blog.phantixlabs.com |
| **Users** | Customer operators (the four apps) and public readers (the blog) |
| **Part of** | `Phantix-Labs-Ltd/Phantix-Frontend`, npm workspaces `apps/*` and `packages/*` |
| **Stack** | React 18, TypeScript 5, Vite 5, Tailwind CSS 3, React Router 6, Node 20 |
| **Local** | Ports 5173 (Core), 5175 (Attack), 5176 (Defend), 5177 (Code), 5178 (blog) |
| **Deploys to** | Vercel, one project per app, on push to `main` |

## What it does

| App | Folder | What operators do there | README |
| --- | --- | --- | --- |
| Core | `apps/securegraph-core` | Sign in, choose an app, and work the shared graph: assets, findings, reports, assurance, audit, authorizations | [README](apps/securegraph-core/README.md) |
| Attack | `apps/securegraph-attack` | Scope targets, run web, API and mobile scans, VAPT campaigns, and the autonomous pentest agent | [README](apps/securegraph-attack/README.md) |
| Defend | `apps/securegraph-defend` | Exposure, cloud posture, risk register, compliance, SOC, detection and threat response | [README](apps/securegraph-defend/README.md) |
| Code | `apps/securegraph-code` | Code security review, AutoFix, continuous PR review, CI/CD monitoring, threat models | [README](apps/securegraph-code/README.md) |
| The Weekly | `apps/securegraph-blog` | Public magazine; posts are written in the staff portal | [README](apps/securegraph-blog/README.md) |
| Shared | `packages/sg-shared` | The shell, sign-in, API client, store and pages the four apps share | [README](packages/sg-shared/README.md) |

The rest of the repository:

- `docs/`: product guides, how-tos and screenshots. The apps render them at `/docs`.
- `public/`: brand assets, fonts and icons. Every app serves it as its `publicDir`.
- `scripts/`: screenshot capture and the social profile validator.

## How it fits

```
                 platform.phantixlabs.com (organization setup, separate repo)
                                  │ hands the operator to Core
                                  ▼
 app.phantixlabs.com ── Core ── sign-in, app picker ──handoff──► Attack · Defend · Code
        │                                                                │
        └──────────── /api/v1 on each app's own origin ──────────────────┘
                                  │ Vercel rewrite (vite proxy in dev)
                                  ▼
                       Phantix Backend (FastAPI)
```

- Core owns sign-in. The other apps send a signed-out visitor to Core's `/login`
  and receive the session through a single-use handoff code in the URL fragment
  (`#sg=`), redeemed at `POST /api/v1/app/auth/handoff/redeem`.
- Each app calls the API on its own origin (`/api/v1`), so each keeps its own
  HttpOnly session cookie. Nothing in the browser holds an API host.
- The Platform (`platform-app/`) and the staff portal (`staff-portal/`) sit in this
  folder locally but are separate repositories, ignored by this one.

## Run it locally

Prerequisites: Node 20 and npm.

```bash
npm install                 # once, at the repository root (installs every workspace)
npm run dev:core            # http://localhost:5173
npm run dev:attack          # http://localhost:5175
npm run dev:defend          # http://localhost:5176
npm run dev:code            # http://localhost:5177
npm run dev:blog            # http://localhost:5178
```

The dev servers proxy `/api` to `https://staging.phantix.site`. To use a local
backend, start the dev server with `API_PROXY_TARGET=http://localhost:8000`. In
dev, the app hosts resolve to the local ports above, so switching apps stays local.

## Configuration

The browser bundle has no API configuration; hosts are resolved in
`packages/sg-shared/src/config.ts`. These variables are read at dev or build time:

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PROXY_TARGET` | `https://staging.phantix.site` | Where the dev server proxies `/api`. Server-side only. |
| `DEV_PORT` | the app's port | Port for `vite` when started without the npm script. |
| `VITE_CORE_URL`, `VITE_ATTACK_URL`, `VITE_DEFEND_URL`, `VITE_CODE_URL` | local port in dev, production host in a build | Point one app at a deployed sibling. |
| `VITE_PLATFORM_URL` | `http://localhost:5174` in dev, `https://platform.phantixlabs.com` in a build | Where Platform links go. |

The blog has its own variables; see its README.

## Project layout

```
apps/
  securegraph-core/     Core: sign-in, picker, shared graph, public home and docs
  securegraph-attack/   Attack
  securegraph-defend/   Defend
  securegraph-code/     Code
  securegraph-blog/     The SecureGraph Weekly
packages/
  sg-shared/            Shell, API client, store, shared pages, Vite site plugin
docs/                   Product documentation and how-tos (rendered at /docs)
public/                 Brand assets shared by every app
scripts/                Screenshot capture, social profile validation
DEPLOYMENT.md           Vercel project settings for each app
```

## Checks

CI (`.github/workflows/ci.yml`) runs for each of `core`, `attack`, `defend`,
`code` and `blog`:

```bash
npm ci                                  # at the repository root
npm run typecheck                       # in apps/securegraph-<app>
npm run build                           # in apps/securegraph-<app>
```

Run every typecheck at once with `npm run typecheck:all`. There is no unit test
suite; behaviour is checked in the browser.

## Deploy

Vercel's Git integration builds each app from its own project, with the Root
Directory set to the app folder. A push to `main` deploys production; other
branches get preview deployments. Each app's `vercel.json` sets the build, the
`/api/v1` rewrite to the backend, and the security headers, and skips a build
when nothing it uses changed. Details: [DEPLOYMENT.md](DEPLOYMENT.md).

## Related

- [docs/README.md](docs/README.md): documentation index
- [docs/README-STANDARD.md](docs/README-STANDARD.md): the structure every README follows
- [docs/DOCUMENTATION-STANDARD.md](docs/DOCUMENTATION-STANDARD.md): how-to and guide standard
- Platform: `Phantix-Labs-Ltd/phantix-platform`. Staff portal: `Phantix-Labs-Ltd/phantix-staff`. Backend: `Phantix-Labs-Ltd/Phantix_Backend`.

**PROTECT. PREVENT. PERFORM.**
