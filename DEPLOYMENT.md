# Deployment

Five deployable applications live in `apps/`. The four operator apps share `packages/sg-shared`.

| App | App directory | Host |
|---|---|---|
| Core | `apps/securegraph-core` | `app.phantixlabs.com` |
| Attack | `apps/securegraph-attack` | `attack.phantixlabs.com` |
| Defend | `apps/securegraph-defend` | `defend.phantixlabs.com` |
| Code | `apps/securegraph-code` | `code.phantixlabs.com` |
| The Weekly (blog) | `apps/securegraph-blog` | `blog.phantixlabs.com` |

Platform (`platform.phantixlabs.com`), landing and staff are separate repositories and are not built here.

## Vercel projects

One Vercel project per app, each with **Root Directory** set to its app folder:

```
Root Directory:  apps/securegraph-<app>
Framework:       Vite
Build Command:   npm run build        # tsc -p tsconfig.json && vite build
Output Directory: dist
Install Command: npm install
```

Each app ships a `vercel.json` (SPA rewrite, `/api/v1/*` proxy to the backend,
cache/security headers). The commands in each `vercel.json` override the project settings.

Vercel's Git integration deploys every project: pushes to `main` go to production and
other branches get preview deployments. There are no deploy workflows in GitHub Actions
and no Vercel token is stored in the repository.

### Prerendered pages (Core and the blog)

Core and the blog render their public pages to static HTML at build time
(`prerender.mjs` in each app, run by its `npm run build`). Vercel serves a file that
exists before applying the rewrite, so those URLs answer with real content; every other
path is rewritten to `app-shell.html`, the plain SPA entry.

The blog renders the issue page and each essay from its content API (`VITE_BLOG_API_URL`)
at build time and embeds that content in the page; the browser shows it at once and then
refreshes it from the API. An essay published after the last build is served by the SPA
until the next deploy prerenders it. While the API has no published posts, the blog shows
the bundled launch issue (`src/content/posts`). An unreachable API never fails the build:
the blog then ships as a plain SPA. `packages/sg-shared` and the repo-root `public/` +
`docs/` are consumed via path aliases, so the Vercel checkout must include the whole
repository (do **not** set a Root Directory above `apps/...` while keeping this layout).

## GitHub Actions

- `.github/workflows/ci.yml`. Typecheck + build every app on push/PR.

## Shared package

`packages/sg-shared` is consumed by relative path (`@sg` alias → `../../packages/sg-shared/src`).
This works because every app is built from a checkout that contains `packages/`. If an app
is ever moved to its own repository, publish `@phantix/sg-shared` to a registry (or vendor
it as a submodule) and add it to that app's dependencies.
