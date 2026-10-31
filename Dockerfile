# Phantix frontend — one image, five apps, served by nginx (replaces Vercel).
#
#   docker build -t phantix-frontend .
#   docker run -p 8080:80 \
#     -e API_PROXY_TARGET=https://api.phantixlabs.com \
#     -e FE_HOST_APP=app.phantixlabs.com ... phantix-frontend
#
# The build is per-repo (npm workspaces + path aliases into packages/, public/ and
# docs/), so the whole checkout is the build context. Static output only: the
# runtime image is nginx + plain files — no Node, no SSR process.
#
# VITE_* build args are PUBLIC by definition: they end up in the JS bundle.

# ---------- build ----------
FROM node:24-bookworm-slim AS build

WORKDIR /src
ENV npm_config_fund=false \
    npm_config_audit=false \
    CI=1

# Workspace manifests first, so dependency layers cache across content changes.
COPY package.json package-lock.json ./
COPY apps/securegraph-core/package.json         apps/securegraph-core/
COPY apps/securegraph-attack/package.json       apps/securegraph-attack/
COPY apps/securegraph-defend/package.json       apps/securegraph-defend/
COPY apps/securegraph-code/package.json         apps/securegraph-code/
COPY apps/securegraph-blog/package.json         apps/securegraph-blog/
COPY packages/sg-shared/package.json            packages/sg-shared/

RUN npm ci --no-audit --no-fund

# Everything the build reads: app sources, the shared package, the repo-root
# public/ + docs/ trees the path aliases resolve into.
COPY apps      ./apps
COPY packages  ./packages
COPY public    ./public
COPY docs      ./docs

# Public build-time config (baked into the bundle; rotate by rebuilding).
ARG VITE_BLOG_API_URL=""
ARG VITE_FIREBASE_API_KEY=""
ARG VITE_FIREBASE_AUTH_DOMAIN=""
ARG VITE_FIREBASE_PROJECT_ID=""
ENV VITE_BLOG_API_URL=${VITE_BLOG_API_URL} \
    VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY} \
    VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN} \
    VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}

# Which apps to build (space separated: core attack defend code blog).
# Default: all five. `--build-arg BUILD_APPS=core` is the fast iteration loop.
ARG BUILD_APPS="core attack defend code blog"
RUN mkdir -p /out
RUN set -eu; \
    for app in ${BUILD_APPS}; do \
      echo "==> building ${app}"; \
      npm run "build:${app}"; \
    done; \
    for app in ${BUILD_APPS}; do \
      case "${app}" in \
        core)   dir=apps/securegraph-core ;; \
        attack) dir=apps/securegraph-attack ;; \
        defend) dir=apps/securegraph-defend ;; \
        code)   dir=apps/securegraph-code ;; \
        blog)   dir=apps/securegraph-blog ;; \
        *) echo "unknown app ${app}" >&2; exit 1 ;; \
      esac; \
      test -f "${dir}/dist/app-shell.html" -o -f "${dir}/dist/index.html" \
        || { echo "ERROR: ${app} produced no entry HTML in ${dir}/dist" >&2; exit 1; }; \
      mkdir -p "/out/${app}"; \
      cp -a "${dir}/dist" "/out/${app}/dist"; \
      echo "==> ${app}: $(du -sh "${dir}/dist" | cut -f1)"; \
    done

# ---------- standalone packages (own lockfiles; not npm workspaces) ----------
# staff-portal, platform-app and landing live at the repo root rather than under
# apps/. They are not workspace members, so each gets its own `npm ci`, but they
# still read the repo-root public/ tree and packages/sg-shared, which are already
# in this context.
COPY staff-portal/package.json staff-portal/package-lock.json staff-portal/
COPY platform-app/package.json platform-app/package-lock.json platform-app/
COPY landing/package.json      landing/package-lock.json      landing/
RUN set -eu; \
    for d in staff-portal platform-app landing; do \
      echo "==> npm ci ${d}"; \
      ( cd "${d}" && npm ci --no-audit --no-fund ); \
    done

COPY staff-portal ./staff-portal
COPY platform-app ./platform-app
COPY landing      ./landing

# space separated: staff platform landing
ARG BUILD_STANDALONE="staff platform landing"
RUN set -eu; \
    for app in ${BUILD_STANDALONE}; do \
      case "${app}" in \
        staff)    dir=staff-portal ;; \
        platform) dir=platform-app ;; \
        landing)  dir=landing ;; \
        *) echo "unknown standalone app ${app}" >&2; exit 1 ;; \
      esac; \
      echo "==> building ${app} (${dir})"; \
      ( cd "${dir}" && npm run build ); \
      test -f "${dir}/dist/index.html" || { echo "ERROR: ${app} produced no index.html" >&2; exit 1; }; \
      mkdir -p "/out/${app}"; \
      cp -a "${dir}/dist" "/out/${app}/dist"; \
      echo "==> ${app}: $(du -sh "${dir}/dist" | cut -f1)"; \
    done

# ---------- serve ----------
FROM nginx:1.27-alpine AS serve

# The official image envsubst's /etc/nginx/templates/*.template into conf.d/ on
# start, using only variables that actually exist in the environment — so a
# missing API_PROXY_TARGET fails loudly instead of proxying nowhere.
COPY deploy/nginx/templates/ /etc/nginx/templates/
COPY deploy/nginx/snippets/  /etc/nginx/snippets/

# Copied as one tree: /out only holds the apps this build produced, so a partial
# build (BUILD_APPS=core) is a valid image instead of a failing COPY per app.
COPY --from=build /out/ /usr/share/nginx/html/

# Only the apps that were built exist; drop the server blocks for the rest so a
# partial image (BUILD_APPS=core) still serves a valid, complete config. The
# template is envsubst'd at container start, so config validation happens there —
# nginx refuses to start on a bad file, which is what we want.
RUN set -eu; \
    for app in core attack defend code blog staff platform landing; do \
      if [ ! -d "/usr/share/nginx/html/${app}/dist" ]; then \
        sed -i "/#@APP:${app}@#/,/#@END:${app}@#/d" /etc/nginx/templates/default.conf.template; \
      fi; \
    done

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1
