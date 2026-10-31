# syntax=docker/dockerfile:1
# One image per frontend app, built from the monorepo — the Coolify "separate
# app, same repo" shape.
#
#   docker build -f deploy/Dockerfile.app --build-arg APP=core -t fe-core .
#
# The five Command-Centre apps share packages/sg-shared, the repo-root public/
# and docs/ (path aliases), so the build context must stay the repo root; APP
# selects what to build. Each app gets its own container, its own Coolify
# application, its own env and rollback.

FROM node:24-bookworm-slim AS build
ARG APP
WORKDIR /src
ENV npm_config_fund=false npm_config_audit=false CI=1

RUN test -n "$APP" || (echo "APP build-arg is required (core|attack|defend|code|blog)" >&2; exit 1)

COPY package.json package-lock.json ./
COPY apps/securegraph-core/package.json   apps/securegraph-core/
COPY apps/securegraph-attack/package.json apps/securegraph-attack/
COPY apps/securegraph-defend/package.json apps/securegraph-defend/
COPY apps/securegraph-code/package.json   apps/securegraph-code/
COPY apps/securegraph-blog/package.json   apps/securegraph-blog/
COPY packages/sg-shared/package.json      packages/sg-shared/
RUN npm ci --no-audit --no-fund

COPY apps ./apps
COPY packages ./packages
COPY public ./public
COPY docs ./docs

# Public build-time config (baked into the bundle; rotate by rebuilding).
ARG VITE_BLOG_API_URL=""
ARG VITE_FIREBASE_API_KEY=""
ARG VITE_FIREBASE_AUTH_DOMAIN=""
ARG VITE_FIREBASE_PROJECT_ID=""
ENV VITE_BLOG_API_URL=${VITE_BLOG_API_URL} \
    VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY} \
    VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN} \
    VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}

RUN set -eu; \
    case "$APP" in \
      core|attack|defend|code|blog) ;; \
      *) echo "unknown APP '$APP'" >&2; exit 1 ;; \
    esac; \
    npm run "build:${APP}"; \
    dir="apps"; \
    case "$APP" in \
      core) dir=apps/securegraph-core ;; \
      attack) dir=apps/securegraph-attack ;; \
      defend) dir=apps/securegraph-defend ;; \
      code) dir=apps/securegraph-code ;; \
      blog) dir=apps/securegraph-blog ;; \
    esac; \
    test -d "$dir/dist" || { echo "no dist for $APP" >&2; exit 1; }; \
    cp -a "$dir/dist" /out

FROM nginx:1.27-alpine AS serve
ARG APP
ENV APP=${APP}

# Per-app nginx config: SPA fallback file, CSP (or none), /api proxy.
COPY deploy/nginx/apps/ /etc/nginx/apps/
RUN set -eu; \
    test -f "/etc/nginx/apps/${APP}.conf" || { echo "no nginx conf for ${APP}" >&2; exit 1; }; \
    mkdir -p /etc/nginx/templates; \
    cp "/etc/nginx/apps/${APP}.conf" /etc/nginx/templates/default.conf.template

COPY deploy/nginx/snippets/ /etc/nginx/snippets/
COPY --from=build /out /usr/share/nginx/html/dist

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1
