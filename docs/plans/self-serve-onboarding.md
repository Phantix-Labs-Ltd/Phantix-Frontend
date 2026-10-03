# Self-serve onboarding — plan

Status: draft · 2026-10-02 · Owner: phantom-fort
Frontend: `FE-DOCS` (Windows) · Backend: `~/Phantix Backend` (WSL, FastAPI)

## Goal

A new user signs up and sees a real result about their own domain or repo
**within 10 minutes, with no demo and no sales call**, the way Cloudflare
(add domain → DNS already scanned) and GitHub (sign up → empty repo shows the
exact next commands) work.

## Decisions (settled)

| Topic | Decision |
|---|---|
| SSO | **GitHub only.** A GitHub verified primary email counts as a verified email (no OTP). |
| Security database | **Stays required** for persisted findings. Add Neon and Supabase sign-up links and accept a pasted connection URL. |
| First value | A **Quick Scan**: passive, single-person, no dual control. Reuses the funnel scan pipeline. |
| Dual control | **Opt-in per org.** Off by default ("solo mode"). Solo mode keeps step-up re-auth, typed confirmation, target-ownership checks for active testing, and full audit. |

## Resolved: Quick Scan storage

Quick Scan results are held as a **preview** in the platform DB (as the funnel
already does) for at most 7 days, then moved into the security DB on import
and the preview purged.

## Target flow

```
Sign up (email+password+company, or Continue with GitHub)
  → Verify email (skipped for GitHub)
  → "What do you want to protect?"  domain  |  GitHub repo
  → Quick Scan runs (live progress, ~2–5 min)
  → Results preview: assets found + top findings
  → "Save to your security database"  → Neon / Supabase / paste URL → import
  → Checklist: invite teammate · (optional) enable dual control · first VAPT
```

Removed from the critical path: secondary email, primary contact, industry,
country, confirm-password, plan choice (Free is default), company
verification (asked only when it unlocks something), dual-control setup.

---

## API contract (shared — backend implements, frontend codes against it)

All under `/api/v1`. Old request fields stay accepted (optional) so the current
frontend keeps working until it ships.

### C1. Slim registration — returns a session
`POST /organizations/register`
```json
{ "company_name": "Acme", "email": "a@acme.io", "password": "…", "accept_terms": true }
```
- Slug generated server-side. `country`, `industry`, `secondary_email`,
  `primary_contact` optional.
- `accept_terms: true` records privacy/terms/AUP acceptance (same effect as
  `/organizations/me/setup/privacy/accept`).
- Response adds `access_token` (org JWT, normal expiry) and sends the setup OTP.
  `201 { organization, access_token, next: "verify_email" }`

### C2. GitHub sign-in / sign-up (through the GitHub App's user authorization; see [github-app-setup.md](github-app-setup.md))
- `GET /organizations/auth/github/start?intent=login|signup` → `{ authorize_url }` (state stored server-side, 10 min).
- `POST /organizations/auth/github/callback { code, state }` →
  - existing org primary with that verified email → `{ access_token, next }`
  - no org → `{ signup_token, email, name, suggested_company }`
- `POST /organizations/register/github { signup_token, company_name, accept_terms }` → same as C1 response, `email_verified: true`, `next: "first_asset"`.
- Unverified GitHub primary email → `409 github_email_unverified`.
- Redirect URI setting `GITHUB_OAUTH_REDIRECT_URI` → platform route `/auth/github/callback`; scopes `read:user user:email` only.
- C1 and C2 register responses include `email_verified: bool` alongside `next`.
- Exempt from the operate gate (add prefix in `org_operate_middleware._EXEMPT_PREFIXES`).

### C3. Setup completeness
`GET /organizations/me/setup` keeps its shape; `setup_complete` becomes
`privacy_accepted && email_verified`. Plan defaults to `free`. Company
verification and plan remain available but are not required.

### C4. Onboarding milestones (drives the checklist in every app)
`GET /organizations/me/onboarding`
```json
{ "milestones": [
  { "key": "email_verified",        "done_at": "…" },
  { "key": "first_asset",           "done_at": null },
  { "key": "quick_scan_done",       "done_at": null },
  { "key": "security_db_connected", "done_at": null },
  { "key": "first_finding_viewed",  "done_at": null },
  { "key": "teammate_invited",      "done_at": null },
  { "key": "dual_control_enabled",  "done_at": null, "optional": true },
  { "key": "first_vapt",            "done_at": null }
], "dismissed": false }
```
`POST /organizations/me/onboarding/events { key }` for client-only milestones
(`first_finding_viewed`). `POST /organizations/me/onboarding/dismiss`.
The apps read the same data from `GET /org-users/onboarding` and dismiss with
`POST /org-users/onboarding/dismiss` (org JWT or application session).

### C5. Quick Scan (passive)
- `POST /quick-scans { target_type: "domain"|"github_repo", target }` → `202 { id, status: "queued" }`
- `GET /quick-scans/{id}` → `{ status, progress: [{ step, state }], assets: [...], findings: [...] }`
- `GET /quick-scans?latest=1`
- `POST /quick-scans/{id}/import` → moves assets + findings into the security DB (requires it connected; `409 security_db_missing` otherwise), then purges the preview.
- Checks: DNS, TLS/cert, HTTP security headers, CT-log subdomains, SPF/DKIM/DMARC; for repos, public metadata + dependency manifest scan. **No active probing.**
- Reuse the funnel pipeline (`reporting_engine/services/funnel_service`, `workers/tasks.py`) but owned by the org, not `phantix-funnel`.
- Not dual-control gated; org JWT is enough. Rate limit: 3 per org per day on Free.
- Storage before DB connect: per the open decision above.

### C6. Security DB connection by URL (reduced)
The frontend parses the Neon / Supabase / Postgres URL itself and uses the
existing `POST /db-connections` + `POST /db-connections/{id}/test?auto_bootstrap=true`.
The host is kept as a name, not resolved to an IP (Neon and Supabase route by
hostname). Backend needs only: set `security_db_connected` when a
security_data_storage connection becomes ready, and allow `POST /db-connections`
for the org primary on the platform surface when the policy is `off`.

### C7. Dual-control policy (opt-in)
- `GET /organizations/me/dual-control-policy` → `{ mode: "off"|"on"|"enforced", can_disable: bool, pending_change: null|{…} }`
- `PUT /organizations/me/dual-control-policy { mode }`
  - `off → on`: immediate; requires ≥2 org users with initiator and authorizer slots assigned (`422 dual_control_slots_missing` otherwise).
  - `on → off`: creates an authorizer-inbox request; takes effect when the authorizer approves.
  - `enforced`: staff/plan-set only; cannot be changed by the org.
- New orgs default to `off`. **Existing orgs migrate to `on`** (no silent loosening).
- `GET /org-users/dual-control` (read by the platform and by the four apps with
  the application session) includes `"policy_mode": "off"|"on"|"enforced"`. This
  is how the apps learn the policy.

### C8. Step-up re-auth (solo mode)
- `POST /org-users/auth/step-up/send` → OTP to the user's email.
- `POST /org-users/auth/step-up/verify { code }` → `{ step_up_token, expires_in: 900 }`
- Client sends `X-Step-Up-Token` on mutations (both realms); add it to CORS allowed headers.
- Step-up endpoints accept the org JWT and the application session bearer.
- Middleware (`org_operate_middleware.py`): when policy is `off`, mutating
  routes need an org-user JWT; routes on the **sensitive list** (VAPT launch,
  active scans, deletes, credential/service-key changes, DB connection changes,
  user/role changes, dual-control policy) also need a valid step-up token
  (`403 step_up_required`). When `on`/`enforced`, current behaviour unchanged.
- Active testing in solo mode also requires the target to be ownership-verified
  (`403 target_unverified`, detail includes `target` and `verified_domain`).
  **Per-target verification applies only to assets not covered by the verified
  company domain.** Covered = the target host is the verified domain or a
  subdomain of it (label-suffix match, so `acme.com.evil.io` and `notacme.com`
  are not covered). Bare IPs and hosts under other domains need their own
  check; GitHub repos are covered by the org's GitHub App installation.
- Audit rows record `approval_mode: "solo"|"dual"`.

### C9. Solo mode: approve your own VAPT campaign
Decision 2026-10-03: in solo mode the requester approves their own campaign,
confirmed by step-up.
- `POST /vapt/campaigns/{id}/start` (already step-up + target-gated in solo
  mode): when the policy is `off`, an approval requirement is satisfied by the
  caller. A `draft` campaign that needs approval starts directly; a
  `pending_approval` campaign is approved and started. Its approval rows are
  marked `approved` with `decided_by_user_id` = caller and
  `notes: "Solo mode self-approval"`; the campaign gets `approval_status:
  "approved"`, `approved_at`. Audit row `approval_mode: "solo"`.
- `POST /vapt/approvals/{id}/decide`: when the policy is `off`, accept the org
  JWT / org-user JWT + `X-Step-Up-Token` instead of a dual-control session; the
  slot/role checks don't apply. In `on`/`enforced` nothing changes.
- `GET /vapt/campaigns*` items add `self_approvable: bool` (true when the policy
  is `off` and the campaign is `pending_approval` or a `draft` needing approval).

### C10. Verified domains (many per org)
Decision 2026-10-03: an org verifies as many domains as it needs. A target is
covered when its host is any verified domain or a subdomain of one.
- New table `organization_domains`: `id, organization_id, domain` (lowercase,
  unique per org), `status: pending|verified`, `method: dns|http|null`, `token`,
  `verified_at`, `last_checked_at`, `created_at`, `is_primary` (the company
  domain). Migration backfills each org's verified `verification_domain` as a
  verified primary row. Limit 50 per org.
- `GET /organizations/me/domains` → `{ items: [Domain] }` where `Domain` =
  `{ id, domain, status, method, is_primary, verified_at, last_checked_at,
  instructions: { dns: { host, record_type: "TXT", value }, http: { url, body } } }`.
- `POST /organizations/me/domains { domain }` → 201 `Domain` (pending). Accepts a
  URL or host and normalizes it. Errors: 422 `invalid_domain` (IPs, single
  labels, public suffixes), 409 `domain_exists`, 422 `domain_limit_reached`.
- `POST /organizations/me/domains/{id}/check` → 200 `Domain` plus
  `check: { dns_ok, http_ok, message }`; verified when either passes. Reuses the
  DNS TXT / well-known lookups in `company_verification.py`.
- `DELETE /organizations/me/domains/{id}` → 204 (step-up in solo mode, as every DELETE).
- `GET /org-users/domains` → the same list, readable by the four apps (org JWT,
  org-user JWT or application session). The apps use it to show verification
  status on asset pages and open the platform in a new tab to verify.
- The first verified domain of an org that isn't company-verified also marks the
  company domain verified (existing fields), and the existing company domain
  flow keeps its row in sync.
- `target_verification`: covered by any verified row (legacy org fields still
  count). `target_unverified` detail adds `verified_domains: string[]`, keeps
  `verified_domain` (primary or first), and `verify_path` becomes
  `/api/v1/organizations/me/domains`.

### C11. IP addresses covered by AUP acceptance
Decision 2026-10-03: a domain can't prove ownership of an IP address, so for IP
addresses and ranges the customer's acceptance of the AUP is the proof. The
customer attests they own or are authorized to test every IP they submit and is
solely liable. Domains still need verification (C10).
- **Legal text** (factory defaults in `legal_defaults.py`; versions bumped to
  `2026-10-03`, effective October 3, 2026):
  - AUP new section **"Targets we can't verify technically"** (below).
  - Terms §5 Authorization: add the same attestation as an item; §16
    Indemnification (b) also covers testing of targets submitted on that basis.
  - Staff-published versions override the defaults, so staging/production must
    publish the new AUP and Terms through the staff portal too.
- **Recorded acceptance:** `organizations.aup_accepted_version`,
  `aup_accepted_at`, `aup_accepted_by` (user id or primary email). Register (C1)
  and GitHub register (C2) with `accept_terms: true` record the **active** AUP
  version. Existing orgs start null (they accepted the old text) and must accept
  once.
- `GET /org-users/aup` → `{ current_version, accepted_version, accepted_at,
  covers_ip_targets: bool, aup_path: "/aup" }` (org JWT, org-user JWT or app
  session).
- `POST /org-users/aup/accept { version }` → same shape. `version` must equal the
  active version (409 `aup_version_mismatch`). Allowed for the org primary and
  org users with the org_admin or security_admin role (403 otherwise). Audited.
- **Coverage:** an IP/CIDR target is covered when `covers_ip_targets` (accepted
  version ≥ `2026-10-03`). Otherwise the solo gate answers 403
  `{ code: "aup_acceptance_required", message, target, version, aup_path }`
  instead of `target_unverified`. Audit rows for such tests record
  `authorization_basis: "aup_attestation"`.

AUP section text (draft — have counsel review before publishing):

> **Targets we can't verify technically.** Some targets, such as IP addresses
> and IP ranges, can't be tied to an owner by a DNS or file check. When you add
> such a target or start a test against it, you confirm that you own it or hold
> current written authorization from its lawful owner to test it, and that the
> test is within the scope of that authorization. SecureGraph relies on this
> confirmation and does not independently verify it. You are solely responsible
> for every such target and for all consequences of testing it, including claims
> by its owner or hosting provider, and you indemnify SecureGraph under the Terms
> of Service. You must produce the authorization on request. SecureGraph may
> suspend testing or your account if you can't, and records every target, test
> and confirmation for audit and, where the law requires, for the authorities.

### Error shape
All new errors: `{ "detail": { "code": "<snake_case>", "message": "…" } }`.
Codes the frontend keys on: `step_up_required` (403), `target_unverified` (403,
with `target`), `dual_control_slots_missing` (422), `rate_limited` (429),
`security_db_missing` (409), `github_email_unverified` (409).

---

## Workstreams

### Backend agent (WSL, `~/Phantix Backend`)
Work in a **git worktree on a new branch `feature/self-serve-onboarding` from
`main`**. The main checkout has uncommitted work on `feature/securegraph-weekly`
— do not touch it.

| # | Task | Key files |
|---|---|---|
| B1 | C1 slim register + token + terms acceptance | `control_plane/api/organizations.py`, `services/organization_service.py`, schemas |
| B2 | C2 GitHub OAuth sign-in/up (new settings `GITHUB_OAUTH_CLIENT_ID/SECRET`) | new `control_plane/api/github_auth.py`, `core/config.py`, middleware exempt list |
| B3 | C3 setup completeness change | `organization_service.py`, setup service |
| B4 | C4 milestones table + endpoints + emitters | new model + alembic migration, subscribers |
| B5 | C5 Quick Scan (reuse funnel pipeline), rate limit, import | `reporting_engine` or `asset_engine`, `workers/tasks.py` |
| B6 | C6 connection URL + test endpoint | `customer_db_connections.py`, `customer_db_service.py` |
| B7 | C7 policy model, migration (existing → `on`), authorizer-inbox flow for disable | `dual_control_service.py`, `authorizer_inbox_service.py`, alembic |
| B8 | C8 step-up + middleware branch + sensitive list + `target_unverified` + audit field | `org_operate_middleware.py`, `org_user_auth_service.py`, `audit_engine` |
| B9 | Tests for every endpoint and both middleware modes; update Postman collection | `tests/`, `API Testing/` |

### Frontend (me, `FE-DOCS`, branch `feature/self-serve-onboarding`)
Built against the contract with `DEMO_MODE` fixtures first, then pointed at the
backend branch.

| # | Task | Key files |
|---|---|---|
| F1 | Register: 3 fields + terms checkbox, auto-session → `/setup`; "Continue with GitHub" | `platform-app/src/pages/auth/Register.tsx`, `Login`, `lib/store.tsx`, new `pages/auth/GithubAuthCallback.tsx` |
| F2 | SetupWizard → Verify email · What to protect · Quick Scan · Done; plan + company verification moved to Billing / Identity | `pages/setup/SetupWizard.tsx` |
| F3 | Quick Scan screen: live progress, assets + findings preview, "Save to your security database" | new `pages/setup/QuickScan.tsx`, shared result components |
| F4 | Connections: Neon and Supabase cards (links + 3-step guide), paste URL, Test connection, import prompt | `pages/Connections.tsx` |
| F5 | Onboarding checklist from C4, shared in `sg-shared`, shown on Platform dashboard and all four apps | `Dashboard.tsx`, `packages/sg-shared/src/components/OnboardingChecklist.tsx`, app switcher |
| F6 | Dual-control policy toggle (Identity), pending-disable state, Solo badge | `pages/Identity.tsx`, `pages/Users.tsx` |
| F7 | Solo mode without touching call sites: `requireDualControl` passes when `policy_mode` is `off`; the API client answers `step_up_required` with a code prompt and retries once; status widgets say "Solo mode" | `sg-shared` `api.ts`, `store.tsx`, `StepUpPrompt.tsx`, `ApplicationShell.tsx`; platform `api.ts`, `store.tsx`, `StepUpPrompt.tsx` |
| F8 | Target ownership prompt when active testing hits `target_unverified` | Attack app VAPT/Scans pages |
| F9 | Empty states: one primary action + copy-paste snippets (GitHub App install, CI step) | Code, Attack, Core pages |
| F10 | Docs: update `docs/12-getting-started.md`, user manuals | `docs/` |

---

### Setup from inside the apps (F11)

Rule: when a page needs something that's only set up on the Platform, the page
says what's missing and links straight to it. The link opens the exact Platform
page in a new tab (Platform sign-in returns to it), and the page re-checks when
the user comes back. Shared pieces in `packages/sg-shared/src/platformSetup.tsx`:

- `PlatformSetupLink` / `platformTaskUrl`: verify a domain (`/identity?verify=<domain>#domains`),
  connect the database (`/connections`), install the GitHub App (`/github`),
  dual control (`/identity#dual-control`), invite a teammate (`/users`).
- `useVerifiedDomains` (`GET /org-users/domains`) and `useSetupStatus`
  (database from onboarding milestones), refreshed on tab return.
- `SetupRequired`: "Before you can …" card, on VAPT, Scans and Assets.
- Asset Ownership column and asset detail: covered by a verified domain counts
  as verified; otherwise a **Verify** link with the domain filled in.

Platform side: Identity has a **Verification and access** tab (verified
domains, company verification, dual control) that deep links open and scroll to.

## Milestones

| | Scope | Backend | Frontend | Done when |
|---|---|---|---|---|
| **M1 Sign-up** | Account in < 60 s | B1 B2 B3 | F1 F2 (minus scan) | Email or GitHub sign-up lands on "What to protect?" with a session |
| **M2 First value** | Quick Scan + DB | B4 B5 B6 | F3 F4 F5 | Domain → preview findings → Neon URL → imported, checklist ticks |
| **M3 Solo / dual** | Opt-in dual control | B7 B8 | F6 F7 F8 | Solo user launches VAPT with step-up on a verified target; dual org unchanged; disabling needs authorizer |
| **M4 Polish** | Teaching in-product | — | F9 F10 | Every empty state has a next action |

Backend and frontend run in parallel within each milestone; each milestone
ends with an integration pass on the backend branch (local `:8000`).

## Verification

- Backend: `pytest` for each new endpoint; middleware tests for `off`, `on`,
  `enforced`, missing/expired step-up, `target_unverified`; migration check that
  existing orgs become `on`.
- Frontend: `tsc --noEmit` + `vite build` for platform-app and all four apps;
  walk the flow in the browser against local backend.
- End-to-end: fresh email sign-up and fresh GitHub sign-up to imported findings,
  timed; target ≤ 10 min.

## Funnel metrics (from C4 timestamps)

Sign-up completion rate · time to `quick_scan_done` · % reaching
`security_db_connected` in 24 h · % running first VAPT in 7 days.

## Risks

- **Loosening security by accident:** existing orgs migrate to `on`; disable
  needs authorizer; step-up and target verification are server-enforced, never
  UI-only.
- **Quick Scan abuse:** passive only, per-org rate limit, audited.
- **85-file dual-control refactor:** done behind `useActionGate()` in one PR per
  app so each is reviewable.
- **GitHub OAuth app vs GitHub App:** separate credentials; sign-in never grants
  repo access — that stays with the GitHub App install.
