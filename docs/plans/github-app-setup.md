# GitHub App: one app for sign-in and repository access

Status: App updated on GitHub 2026-10-03 (slug now `securegraph-by-phantix-labs`); backend changes done on `feature/self-serve-onboarding` ·  Replaces the separate GitHub OAuth app in the
self-serve onboarding plan, and the settings in the backend's
`deploy/GITHUB_APP_COOLIFY_SETUP.md` and `docs/06-integrations/03-github-app.md`.

## Why one app

Today the backend expects two GitHub registrations:

- the **GitHub App** (`phantix-security-solutions`) for repository access, and
- a separate **OAuth app** (`GITHUB_OAUTH_CLIENT_ID`) for "Continue with GitHub".

A GitHub App can also sign users in (GitHub calls this *user authorization*), so
one registration covers both. Customers see one name and one consent, and ops
manage one set of keys. `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET`
already exist in `app/core/config.py` and are unused, so the backend change is
small (see [Backend changes](#backend-changes)).

## What staging has today

Read from GitHub's public app endpoint and `GET https://staging.phantix.site/api/v1/status` on 2026-10-03.

| Setting | Live on GitHub | What the code needs |
|---|---|---|
| Owner | `Phantom-Fort` (a personal account) | The Phantix Labs organization (recommended) |
| Contents | Read | **Read and write** |
| Metadata | Read | Read |
| Pull requests | Write | Read and write (unchanged) |
| Checks | none | **Read and write** |
| Email addresses (account) | none | **Read** |
| Webhook events | `push`, `commit_comment` | **`push`, `pull_request`** |
| Homepage | `https://platform.phantix.site` | `https://platform.phantixlabs.com` |
| Description | "Only read access is required." | Already untrue; replace (below) |

What breaks today because of the gaps:

- **No `pull_request` event**: pull request reviews, the rescan when a PR merges
  and AutoFix learning from closed PRs never run (`api/github_app.py` handles the
  event, but GitHub never sends it).
- **No Checks permission**: posting the review result as a check
  (`pr_review_service.py`, `POST /repos/{owner}/{repo}/check-runs`) gets a 403.
- **Contents is read-only**: AutoFix can't push its branch
  (`autofix/ephemeral_repo.py`), and commit comments
  (`branch_review_comment_service.py`) get a 403.
- `commit_comment` is subscribed but nothing handles it.

Other staging notes:

- `platform.phantix.site` answers with a 308 redirect to
  `platform.phantixlabs.com`, so the App's current URLs still work, but they
  should point at the new domain directly.
- The staging env file in the repo (`deploy/coolify.env.staging.paste`) says
  `GITHUB_APP_SLUG=phantix`; the running server reports
  `phantix-security-solutions`. The running value is right; fix the file.
- The API stays on `staging.phantix.site` (`api.phantixlabs.com` doesn't
  resolve), so the webhook URL doesn't change.

## Walkthrough

Open the App: GitHub → Settings → Developer settings → GitHub Apps →
**Phantix Security Solutions** → Edit. (Once it is transferred to the
organization: the organization's Settings → Developer settings → GitHub Apps.)

### 1. Move the App to the organization (recommended, do first)

Advanced → **Transfer ownership** → the Phantix Labs GitHub organization. The
App ID, keys and existing installations carry over. This stops the product
depending on one person's account.

### 2. General

| Field | Value |
|---|---|
| GitHub App name | `SecureGraph by Phantix Labs` (optional rename, see the note below) |
| Description | The text in [Description](#description) |
| Homepage URL | `https://platform.phantixlabs.com` |

Renaming changes the slug and therefore the install URL. If you rename, set
`GITHUB_APP_SLUG` to the new slug on every environment at the same time. Keeping
the current name avoids that.

### 3. Identifying and authorizing users (sign-in)

| Field | Value |
|---|---|
| Callback URL 1 | `https://platform.phantixlabs.com/auth/github/callback` |
| Callback URL 2 | `http://localhost:5174/auth/github/callback` (platform dev server port) |
| Keep the existing callback URLs | Yes (`…/integrations/github/callback`), harmless |
| Expire user authorization tokens | On (we use the token once and discard it) |
| Request user authorization (OAuth) during installation | **Off** |
| Enable Device Flow | Off |

"Request user authorization during installation" must stay **off**. When it is
on, GitHub sends people to the callback URL after installing instead of the
Setup URL, and the install flow (`setup_action`, `installation_id`) breaks.

### 4. Post installation

| Field | Value |
|---|---|
| Setup URL | `https://platform.phantixlabs.com/integrations/github/callback` |
| Redirect on update | **On** (so permission updates come back with `setup_action=update`) |

### 5. Webhook

| Field | Value |
|---|---|
| Active | On |
| Webhook URL | `https://staging.phantix.site/api/v1/github/webhook` (production: the production API host) |
| Webhook secret | Same value as `GITHUB_APP_WEBHOOK_SECRET` |

### 6. Permissions

**Repository permissions**

| Permission | Access | What uses it |
|---|---|---|
| Metadata | Read-only (required by GitHub) | Repository lookup and the installation's repository list (`github_app_service.py`, `/installation/repositories`) |
| Contents | Read and write | **Read:** clone at the reviewed commit for branch reviews, repository analysis and agent workspaces (`branch_review_job_service.py`, `github_analysis_service.py`, `repo_job_service.py`); show the flagged lines of a file (`code_finding_service.py`, contents API); read branch refs (`github_proposal_client.py`). **Write:** AutoFix pushes its fix to a new branch (`ephemeral_repo.py`); comment on a commit (`branch_review_comment_service.py`). |
| Pull requests | Read and write | **Read:** find the pull request for a commit. **Write:** open the AutoFix pull request and label it (`github_proposal_client.py`); comment the review on a pull request (`branch_review_comment_service.py`). |
| Checks | Read and write | Report the review result as a check on the pull request (`pr_review_service.py`) |
| Everything else | No access | |

Leave **Workflows** at *No access* on purpose: if a proposed fix ever touched a
file in `.github/workflows/`, GitHub refuses the push. That is a useful stop.
Administration, Secrets, Actions, Issues, Deployments and the rest are not used.

**Account permissions**

| Permission | Access | What uses it |
|---|---|---|
| Email addresses | Read-only | Sign-in reads the verified primary email (`github_oauth_service.py`, `GET /user/emails`) |

**Organization permissions:** none.

### 7. Subscribe to events

Tick **Push** and **Pull request**. Untick **Commit comment**.

`installation` and `installation_repositories` events are always delivered to a
GitHub App and need no box ticked. The backend handles `installation`; it
ignores `installation_repositories`, so a repository added to an existing
installation appears only after the next sync (see Backend changes).

### 8. Where can this app be installed

**Any account.**

### 9. Save, then roll out

Saving new permissions sends every existing installation's owner a request to
approve them. Until an owner approves, that installation keeps the old
permissions:

- AutoFix on that installation returns `permission_required` with a link
  (already handled).
- Checks and commit comments fail quietly until approval.

Tell existing customers before saving. New installations get the full set at
install time; GitHub has no per-installation opt-in, so "write access only for
customers who use AutoFix" isn't possible with one app. Product controls cover
that instead: Continuous PR is off by default (`continuous_pr_enabled = False`),
and a fix pull request otherwise opens only when someone asks for one.

### 10. Environment

Set on staging (and production with its own values):

```env
GITHUB_APP_ID=<unchanged>
GITHUB_APP_CLIENT_ID=<App → General → Client ID>
GITHUB_APP_CLIENT_SECRET=<App → General → Generate a new client secret>
GITHUB_APP_PRIVATE_KEY=<unchanged>
GITHUB_APP_SLUG=phantix-security-solutions   # or the new slug if renamed
GITHUB_APP_WEBHOOK_SECRET=<unchanged>
PLATFORM_BASE_URL=https://platform.phantixlabs.com
# Remove once the backend uses the App for sign-in:
# GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET
```

`PLATFORM_BASE_URL` on staging is still `https://platform.phantix.site`; the
sign-in redirect is derived from it, so update it with the callback URLs.

### 11. Check it

1. `curl -s https://staging.phantix.site/api/v1/status | jq .checks.github_app` → `configured: true`.
2. `curl -s https://api.github.com/apps/<slug> | jq '.permissions, .events'` shows
   the permissions and events above.
3. App → Advanced → Recent deliveries: a push and a pull request show `200`.
4. Platform → Sign up → Continue with GitHub → consent screen names the App,
   and you land on "One last thing" or straight in.
5. Open a pull request on an installed repository: a SecureGraph check appears.

## Description

For the App's **Description** field (shown on the public App page and the
install screen):

> SecureGraph by Phantix Labs finds security problems in your code and helps
> you fix them.
>
> - Sign in to SecureGraph with your GitHub account.
> - Reviews pushes and pull requests on the repositories you choose, and reports
>   what it finds as a check and a pull request comment.
> - Checks your dependencies against public vulnerability databases.
> - AutoFix proposes a fix as a pull request from a new branch, only when you ask
>   or turn on Continuous PR. It never pushes to an existing branch and never
>   merges.
>
> Each review works on a temporary copy of the code that is deleted when the
> review ends. Findings are stored in your organization's own security
> database. You choose which repositories SecureGraph can see and can change
> that at any time in your GitHub settings.

Every sentence is backed by the code: new-branch-only push without force
(`ephemeral_repo.py`), no merge call anywhere, ephemeral clone with teardown
(`github_analysis_service.py`, `repo_job_service.py`), findings in the tenant
security DB (`models/code_finding.py`), Continuous PR off by default.

When someone signs in with GitHub, GitHub's consent screen also says the App
can act on their behalf on repositories it is installed on. That wording comes
from GitHub because the same App holds repository permissions; sign-in itself
only reads the profile and verified email, then discards the token.

## Backend changes

Done in the backend worktree (`~/phantix-backend-onboarding`, branch
`feature/self-serve-onboarding`), with tests in `tests/test_github_app_unified.py`:

1. **Sign-in uses the App's credentials.** In `github_oauth_service.py`, use
   `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET`, falling back to the
   `GITHUB_OAUTH_*` values while both exist. The `scope` parameter is ignored
   for GitHub Apps; the Email addresses permission replaces `user:email`.
2. **Fix the re-consent link.** `permission_request_url()` in
   `github_proposal_client.py` points at `installations/new`. An existing
   installation approves new permissions on its installation settings page
   (`https://github.com/settings/installations/{installation_id}`, or under the
   organization's settings), so build the link from the installation id.
3. **Handle `installation_repositories`** in `api/github_app.py` by calling the
   existing `sync_repositories`, so added or removed repositories show up
   without a manual refresh.
4. **Update the docs**: `deploy/GITHUB_APP_COOLIFY_SETUP.md`,
   `deploy/github-app-manifest.json` (permissions, events, phantixlabs.com URLs)
   and `docs/06-integrations/03-github-app.md` still say Contents and Metadata
   read-only.
5. **Fix the local default** in the `GITHUB_OAUTH_REDIRECT_URI` comment: the
   platform dev server runs on port 5174, not 5173.
6. **New slug** `securegraph-by-phantix-labs` as the config default and in the
   env examples; `new_permissions_accepted` installation events now refresh the
   stored permissions.

## Still to do by hand

- **Staging env (Coolify):** set `GITHUB_APP_SLUG=securegraph-by-phantix-labs`
  (staging still reports the old slug, so its install link is broken), set
  `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET`, and
  `PLATFORM_BASE_URL=https://platform.phantixlabs.com`. Your local
  `deploy/coolify.env.staging.paste` (untracked) still has the old values.
- **App description on GitHub:** it was pasted with the `> ` quote markers;
  remove them so it doesn't render as a quote.
- **Homepage URL:** still `https://platform.phantix.site` (redirects; update when convenient).
- **Owner:** still the personal account `Phantom-Fort`; transfer to the organization when ready.
- **Staff portal:** `staff-portal/src/lib/overwatchTopology.ts` labels the App with the old slug (separate repo, left untouched).
