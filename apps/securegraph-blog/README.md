# The SecureGraph Weekly

A Markdown-driven magazine. The issue landing is a full-screen two-page spread in
the SecureGraph gold-on-dark palette, and every post opens as its own full-page,
single-column article. Readers only ever see published posts; writing happens in
the staff portal.

| | |
| --- | --- |
| **Live** | https://blog.phantixlabs.com |
| **Users** | Public readers |
| **Part of** | Phantix-Frontend monorepo, `apps/securegraph-blog` |
| **Stack** | React 18, TypeScript, Vite 5; uses only the `siteFiles` Vite plugin from `packages/sg-shared` |
| **Local** | http://localhost:5178 |
| **Deploys to** | Vercel, on push to `main` |

## What it does

| Area | Routes |
| --- | --- |
| Issue landing: lead essay on the left page, the other posts summarised on the right | `/` |
| Full article | `/posts/:slug` |

- Posts are ordered by `order`, then `no`. The `featured` post (or the first)
  is the lead essay.
- `npm run build` prerenders the issue page and every essay to static HTML,
  embedding the content each page was built from. The browser shows it at once
  and refreshes it from the API.
- The bundled launch issue (`src/content/posts/*.md`) is shown when no backend is
  configured or the backend has no published posts, so the issue is never empty.

## How it fits

- **The SecureGraph API** serves the read-only public endpoints below and
  receives the analytics beacons.
- **The staff portal** is the only place posts are written, imported (`.md`),
  edited, published and unpublished (`/weekly`, admin staff only). It calls
  `/api/v1/admin/blog/*`.

Public read contract (`/api/v1/blog`):

```
GET {base}/posts
→ {
    "issue": {                    // optional overrides, merged over defaults
      "name": "The SecureGraph Weekly", "number": "Issue 01",
      "date": "September 2026", "folio": "01–02", "kicker": "...", "deck": "...",
      "byline": "...", "pullQuote": "...", "pullCite": "...",
      "newsletterLabel": "...", "newsletterBlurb": "...", "newsletterUrl": "..."
    },
    "posts": [
      {
        "slug": "proof-before-panic",
        "title": "Proof Before Panic",
        "no": "01", "order": 1, "date": "September 2026",
        "kicker": "Lead essay",
        "excerpt": "One-line summary for the contents list.",
        "featured": true
      }
    ]
  }

GET {base}/posts/{slug}
→ { ...same fields as above..., "body": "# raw markdown…" }
```

Analytics are first-party, cookieless, consent-gated and respect Do Not Track.
Nothing is sent until the reader accepts the banner; consent is shared with the
landing page through the same cookie key.

```
POST {VITE_ANALYTICS_URL | /api/v1/analytics/collect}
{
  app: "blog",
  sid, path, ref, screen, lang, tz, utm, ts,
  event: "page_view" | "post_view" | "post_read" | "subscribe_click" | "external_click",
  slug?, url?
}
```

`post_read` fires when the reader has scrolled through about 90% of an article.

## Run it locally

Prerequisites: Node 20; `npm install` at the repository root.

```bash
npm run dev:blog          # from the repository root → http://localhost:5178, bundled posts
```

To read live posts locally, set `VITE_BLOG_API_URL` (below).

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_BLOG_API_URL` | unset: demo mode with the bundled posts | `/api/v1/blog` for same-origin (the committed `vercel.json` rewrites `/api/v1` to the backend), or an absolute `https://…/api/v1/blog` (the backend must allow CORS for the blog origin). |
| `VITE_ANALYTICS_URL` | `/api/v1/analytics/collect` | Where analytics beacons go. |
| `VITE_ANALYTICS_DISABLED` | unset | `true` turns analytics off. |
| `VITE_NEWSLETTER_URL` | unset | Newsletter link when the issue does not set `newsletterUrl`. |

Post format, for a bundled file such as `src/content/posts/05-some-title.md` or a
file imported in the staff portal (The Weekly → Import .md). The numeric prefix
becomes the default `no` and the filename becomes the slug.

```md
---
title: "A New Essay"
no: "05"
order: 5
date: "October 2026"
kicker: "Attack surface"
excerpt: "One-line summary."
featured: false
---

First paragraph (gets the gold drop cap if it starts the article)…

## A subheading

Body text with **bold**, *italic*, `inline code`, > quotes, - lists, and links.
```

## Project layout

```
src/
  App.tsx           Routes: the issue and the article
  pages/            Landing (the spread), Post (the article)
  components/       Header, Markdown, ConsentBanner, loading and error states
  content/posts/    The bundled launch issue
  lib/              Content loading, frontmatter, analytics, consent, SEO
  entry-server.tsx  Server entry for prerendering
prerender.mjs       Static HTML for the issue and every post
vercel.json         Build, /api/v1 rewrite, CSP
```

## Checks

```bash
npm run typecheck         # in apps/securegraph-blog
npm run build
```

CI runs both on every push and pull request.

## Deploy

The Vercel project has its Root Directory set to `apps/securegraph-blog`. A push
to `main` deploys production. The committed CSP allows `connect-src 'self' https:`
and `img-src 'self' data: blob: https:`, so both same-origin proxying and absolute
backend or image URLs work.

## Related

- [Repository README](../../README.md) and [DEPLOYMENT.md](../../DEPLOYMENT.md)
- Staff portal (`Phantix-Labs-Ltd/phantix-staff`): `/weekly`, where posts are written
