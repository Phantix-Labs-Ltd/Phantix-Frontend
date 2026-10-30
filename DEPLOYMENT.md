# Deployment

Five deployable applications live in `apps/`. The four operator apps share
`packages/sg-shared`. They are **built once into a single image** and served by
nginx on our own server, managed by Coolify. Vercel is retired.

| App | Directory | Host (defaults) | API proxy | Container root |
|---|---|---|---|---|
| Core | `apps/securegraph-core` | `app.phantixlabs.com` | `/api/v1/` | `…/core/dist` |
| Attack | `apps/securegraph-attack` | `attack.phantixlabs.com` | `/api/v1/` | `…/attack/dist` |
| Defend | `apps/securegraph-defend` | `defend.phantixlabs.com` | `/api/v1/` | `…/defend/dist` |
| Code | `apps/securegraph-code` | `code.phantixlabs.com` | `/api/v1/` | `…/code/dist` |
| Blog | `apps/securegraph-blog` | `blog.phantixlabs.com` | `/api/v1/` | `…/blog/dist` |
| **Staff** | `staff-portal` | `staff.phantixlabs.com` | `/api/` + `/sandbox-apply/` | `…/staff/dist` |
| **Platform** | `platform-app` | `platform.phantixlabs.com` | `/api/` | `…/platform/dist` |
| **Landing** | `landing` | `phantixlabs.com` + `www.phantixlabs.com` | `/api/` | `…/landing/dist` |

Two build families, one image:

- **Workspace apps** (`apps/*`) — npm workspaces under the root `package-lock.json`;
  built with `npm run build:<app>`, controlled by `BUILD_APPS`.
- **Standalone apps** (`staff-portal`, `platform-app`, `landing`) — each has its own
  `package.json` + `package-lock.json`, so each gets its own `npm ci`; controlled by
  `BUILD_STANDALONE`. They still read the repo-root `public/` tree and
  `packages/sg-shared` (path aliases), which is why the build context is the whole
  repository.

> **CSP follows Vercel exactly**: only Core/Attack/Defend/Code/Blog get a
> `Content-Security-Policy`. Staff, Platform and Landing shipped without one —
> they load xterm/redoc/Firebase/lottie and their third-party origins are not yet
> inventoried. Adding a CSP for those three is a follow-up, not a regression.

---

## How it is served

```
browser ── HTTPS ──▶ Traefik (Coolify, per server)
                      │  routes each hostname to the frontend container :80
                      ▼
                    nginx (this image)
                      ├─ /            → the app's dist/  (try_files, SPA shell fallback)
                      └─ /api/v1/*    → API_PROXY_TARGET (the backend)
```

- **The browser only talks to the app's hostname.** `/api/v1/*` is reverse-proxied
  to the backend, replacing the old Vercel rewrite. That keeps the API's session
  cookie **first-party** on this host — which is what makes
  `__Host-sg_session` + `SameSite=Strict` work even though the API lives on a
  different registrable domain.
- **Prerendered pages win.** Core and the blog write real HTML at build time
  (`prerender.mjs`); `try_files $uri $uri/index.html $uri/ …` serves those files
  and only falls back to `app-shell.html` for SPA routes. `/docs` is served
  directly, with no `/docs/` redirect.
- **CSP, HSTS, Referrer-Policy, Permissions-Policy and immutable asset caching**
  are in `deploy/nginx/` — ported 1:1 from the old `vercel.json` files.
- Static assets (`/static/`, `/assets/`) get
  `Cache-Control: public, max-age=31536000, immutable`; HTML revalidates.

Files:

| Path | Purpose |
|---|---|
| `Dockerfile` | Build all apps (node:24) → nginx:alpine runtime. `BUILD_APPS` to build a subset |
| `deploy/nginx/templates/default.conf.template` | One `server` block per app — 8 blocks, envsubst'd at start |
| `deploy/nginx/snippets/api-proxy.conf` | `/api/v1` proxy rules (no buffering, 300s timeouts, SNI) |
| `deploy/nginx/snippets/security-headers.conf`, `gzip.conf` | Headers + compression |
| `docker-compose.yml` | Local run / non-Coolify run |
| `.github/workflows/frontend-image.yml` | Build + typecheck + smoke test 5 hosts → push GHCR |

---

## Environment

**Runtime (read by nginx at container start — no rebuild needed):**

| Variable | Example | Meaning |
|---|---|---|
| `API_PROXY_TARGET` | `https://api.phantixlabs.com` | Backend the browser's `/api/v1` calls are proxied to. **Required** — the container refuses to start without it |
| `FE_HOST_APP` | `app.phantixlabs.com` | Hostnames per app (comma-separated for several) |
| `FE_HOST_ATTACK` | `attack.phantixlabs.com` | |
| `FE_HOST_DEFEND` | `defend.phantixlabs.com` | |
| `FE_HOST_CODE` | `code.phantixlabs.com` | |
| `FE_HOST_BLOG` | `blog.phantixlabs.com` | |
| `FE_HOST_STAFF` | `staff.phantixlabs.com` | |
| `FE_HOST_PLATFORM` | `platform.phantixlabs.com` | |
| `FE_HOST_LANDING` | `phantixlabs.com www.phantixlabs.com` | Both names in one `server_name` |

**Build time (baked into the bundle — rebuilt to change):**

| Variable | Used by | Notes |
|---|---|---|
| `VITE_BLOG_API_URL` | blog prerender | Content API read at build time. Unreachable ⇒ blog ships as a plain SPA (never fails the build) |
| `VITE_FIREBASE_API_KEY` / `_AUTH_DOMAIN` / `_PROJECT_ID` | Core login | **Public** values. Empty hides the social buttons |

> Docker warns that `VITE_FIREBASE_API_KEY` in `ARG`/`ENV` looks like a secret. It
> is the Firebase **web** config: it ships in the JS bundle either way. Nothing
> secret belongs in `VITE_*`.

Staging and production use the **same image**, differing only in
`API_PROXY_TARGET`/`FE_HOST_*` — one image, two Coolify applications.

---

## Coolify setup (one application, five domains)

The five apps ship as one bundle, so deploy them as **one Coolify application** with
five domains. (Five separate applications from the same image also works, with
per-app rollback; it just multiplies deploy definitions.)

1. **Create the application**
   - Source: *Docker image* → `ghcr.io/phantix-labs-ltd/phantix-frontend:latest`
     (private package: add the GHCR read-only token in Coolify → *Private Registry*).
   - Port: `80`. Health check path: `/healthz`.
2. **Domains** — add all five, each with its own certificate:
   ```
   app.phantixlabs.com      attack.phantixlabs.com   defend.phantixlabs.com
   code.phantixlabs.com     blog.phantixlabs.com     staff.phantixlabs.com
   platform.phantixlabs.com phantixlabs.com          www.phantixlabs.com
   ```
   Coolify's Traefik routes all five to the same container; nginx picks the app by
   `Host` and returns 404 for anything else.
3. **Environment**
   ```dotenv
   API_PROXY_TARGET=https://api.phantixlabs.com
   FE_HOST_APP=app.phantixlabs.com
   FE_HOST_ATTACK=attack.phantixlabs.com
   FE_HOST_DEFEND=defend.phantixlabs.com
   FE_HOST_CODE=code.phantixlabs.com
   FE_HOST_BLOG=blog.phantixlabs.com
   FE_HOST_STAFF=staff.phantixlabs.com
   FE_HOST_PLATFORM=platform.phantixlabs.com
   FE_HOST_LANDING=phantixlabs.com www.phantixlabs.com
   ```
4. **DNS** — A/AAAA for each hostname → the frontend server's IP (or its Tailscale
   IP if the box is private). Do not add a wildcard that also matches the API host.
5. **Deploy**, then verify (below).

---

## CI → GHCR → Coolify

`.github/workflows/frontend-image.yml` runs on every push to `main`:

1. `npm ci` + `npm run typecheck:all` (fail before an image is built),
2. `docker build` with the public `VITE_*` build args,
3. **smoke test**: start the image, assert `/healthz` and all five hosts return 200
   and an unknown `Host` returns 404,
4. push `:latest` and `:sha-<short>` (pull requests build and smoke-test only).

Set the public build args as **repository variables** (`Settings → Variables`):
`VITE_BLOG_API_URL`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`.

Coolify should only **pull** — never build on the frontend box.

---

## Verify a deploy

```bash
for h in app attack defend code blog staff platform; do
  printf '%-8s %s\n' "$h" "$(curl -s -o /dev/null -w '%{http_code}' "https://$h.phantixlabs.com/")"
done

curl -sI https://app.phantixlabs.com/ | grep -Ei 'content-security|strict-transport|cache-control'
curl -s  https://app.phantixlabs.com/docs | head -c 80     # prerendered HTML, not a redirect
curl -sI https://app.phantixlabs.com/static/index-*.js | grep -i immutable   # 1y immutable
curl -s  https://app.phantixlabs.com/api/v1/health          # proxied to the backend
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: evil.test' https://app.phantixlabs.com/  # 404
curl -s -o /dev/null -w '%{http_code}\n' https://phantixlabs.com/            # landing (apex)
curl -s -o /dev/null -w '%{http_code}\n' https://www.phantixlabs.com/        # landing (www)
curl -s -o /dev/null -w '%{http_code}\n' https://staff.phantixlabs.com/api/v1/health   # staff proxies /api
curl -s -o /dev/null -w '%{http_code}\n' https://staff.phantixlabs.com/sandbox-apply   # and the public form
```

Then in a browser: sign in on `app.…` and confirm `Set-Cookie: __Host-sg_session`
is present and first-party on that host.

---

## Cutover checklist

1. Frontend server: `ufw` allow `22` (tailnet only), `80`, `443`; nothing else.
2. First deploy + the verification above on every hostname.
3. Login, an authenticated page reload, and one APK upload through `/api/v1` (the
   proxy allows 200 MB — `client_max_body_size`).
4. Delete the eight Vercel projects; remove the `vercel.json` files from the repo
   (they are now **not** authoritative — they still point `/api/v1` at staging).
5. Keep the previous `:sha-…` tag pinned in Coolify so rollback is a tag change.

## Local development

Unchanged: `npm run dev:core` (Vite dev server, proxies `/api` via
`API_PROXY_TARGET`). To exercise the production serving path locally:

```bash
API_PROXY_TARGET=https://staging.phantix.site docker compose up --build
curl -H 'Host: app.phantixlabs.com' http://localhost:8080/healthz
```

## Shared package

`packages/sg-shared` is consumed by relative path (`@sg` alias →
`../../packages/sg-shared/src`), and the repo-root `public/` + `docs/` are read via
path aliases — so **the Docker build context must be the whole repository** (it is:
the Dockerfile copies `apps/`, `packages/`, `public/`, `docs/`). If an app is ever
moved to its own repository, publish `@phantix/sg-shared` to a registry (or vendor
it) and add it to that app's dependencies.
