# Platform: Connect GitHub

**Where:** **GitHub** → `/github`
**What:** Connects the SecureGraph GitHub App, imports repositories as assets, and runs repository analysis. The GitHub App is the primary integration, and a personal access token (PAT) is the legacy method.
**Who:** The primary user of the organization.
**Before you start:** A GitHub account or organization with permission to install an app, and a plan that covers the repository type.

![GitHub](../../screenshots/platform/github.png)

---

## Before you start

- You can install an app on the target GitHub account or organization.
- A GitHub organization owner is available. A new install may wait for that person to approve it.
- Private repository analysis needs the Premium tier. Free covers public repositories only.
- An operate session may be requested for the **Analyze** action.
- The wallet holds credit when you use the Branch Reviewer tab.

---

## Process flow

![Platform: Connect GitHub process flow](../../diagrams/how-to-platform-10-connect-github.svg)

---

## Steps

1. Sign in to Platform and open **GitHub**.
2. Click **Connect GitHub**.
3. Complete the GitHub authorization in the redirect. Platform returns to `/integrations/github/callback`.
4. Wait for the page to read the connection again.
5. Click **Link** on an unlinked installation when the page finds one.
6. Open the **Repositories** tab after the connection reads **connected**.
7. Click **Sync** to refresh the repository list.
8. Read the **Visibility** and **Review status** columns.
9. Click **Analyze** on a repository. Complete the operate prompt when Platform asks.
10. Confirm the message "Analysis queued".
11. Open Command Centre **Assets** and confirm the repository appears.

**Result:** The connection reads **connected**, and the repository list shows the imported repositories.

- The page polls every 20 seconds while the state is `awaiting_approval`.
- The page refreshes when the browser tab returns to the front.
- Click **Disconnect** to remove the installation from SecureGraph. This action is exempt from dual control.
- Open the **Branch Reviewer** tab to watch a branch and to top up the wallet.

### Watch a branch

1. Open the **Branch Reviewer** tab.
2. Click **Watch** on a repository.
3. Click the branch control to switch the watched branch between `main` and `develop`.
4. Click **Pause** to stop the review on a repository.
5. Click **Top up wallet** to add credit.
6. Select an amount, or type an amount of NGN 1,000 or more.
7. Click **Pay with Paystack**.
8. Complete the payment to credit the wallet.

**Result:** The review runs on each push to the watched branch, and the wallet balance covers the cost.

---

## Reference

### Connection states

| State | Meaning | Next action |
| --- | --- | --- |
| `not_connected` | No GitHub App installation is linked | Click **Connect GitHub**. |
| `awaiting_approval` | A GitHub organization owner must approve the app | Wait, or ask the owner to approve it. The page polls. |
| `connected` | The installation is linked | Sync and analyze repositories. |
| `rejected` | The install request was denied or cancelled | Ask an owner to install the app, then connect again. |
| `suspended` | The installation is suspended on GitHub | Resume it in the GitHub App settings. |
| `pat_fallback` | A legacy personal access token is connected | Click **Migrate to GitHub App**. |

### Repository table

| Column | Meaning |
| --- | --- |
| Repository | The full name, for example `acme-dev/api-gateway`. |
| Branch | The default branch. |
| Visibility | **Private** or **Public**. |
| Review status | **Premium** when the repository needs an upgrade, or **Included**. |
| **Analyze** | Queues a full analysis of the repository. |

### Endpoints

| Action | Endpoint |
| --- | --- |
| Read the install URL | `GET /github/install-url` |
| Finish the install | `POST /github/callback` |
| Read the installation | `GET /github/installation?refresh=true` |
| List repositories | `GET /github/repositories?refresh=false` |
| Sync repositories | `POST /github/repositories/sync` |
| Analyze a repository | `POST /github/repositories/analyze` with `analysis_profile` set to `full` |
| Disconnect | `DELETE /github/installation` |
| Read branch settings | `GET /github/branch-reviews/settings` |
| Save branch settings | `PUT /github/repositories/{repo_id}/review-settings` |
| Read the wallet | `GET /github/branch-reviews/wallet` |
| Top up the wallet | `POST /github/branch-reviews/wallet/top-up` with `amount_ngn` |

The callback carries `installation_id`, `state`, `setup_action`, `account_login`, `account_type`, `request_id`, and `requested_by_login`.

### Branch review settings

| Setting | Values | Default |
| --- | --- | --- |
| `watched_branch` | A branch name | The default branch of the repository |
| `enabled` | `true` or `false` | `true` on a new watch |
| `post_github_comment` | `true` or `false` | `false` |

### Wallet

| Item | Detail |
| --- | --- |
| Currency | Nigerian naira (NGN) |
| Minimum top-up | NGN 1,000 |
| Preset amounts | NGN 50,000, NGN 100,000, NGN 250,000 |
| Charge | Each reviewed push deducts credit for the size tier of the repository |
| Payment gateway | Paystack |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "GitHub App not configured" | The GitHub App is not set up on the server | Ask staff to configure the GitHub App. |
| "Could not load GitHub integration" | The status call failed | Click **Retry**, or refresh the page. |
| The state stays `awaiting_approval` | A GitHub organization owner must approve the app | Ask the owner to approve the install. The page polls every 20 seconds. |
| "GitHub install request denied or cancelled" | An owner declined the request | Ask an owner to install the app, then connect again. |
| "Installation suspended on GitHub" | The installation is suspended | Resume it in the GitHub App settings. |
| The repository list is empty | The sync did not run, or the install covers no repositories | Click **Sync**. Re-run the discovery after you add the app to a new organization. |
| "Private repo requires Premium" | The repository is private, and the plan is Free | Upgrade the plan, then analyze the repository again. |
| "Analyze failed" | The operate session ended, or the repository is not analyzable | Unlock operate, then click **Analyze** again. |
| "Link failed" | The installation belongs to a different GitHub account | Sign in to GitHub with the right account, then link it again. |
| "Sync failed" | The GitHub call failed, or the token lacks scope | Confirm the connection state, then click **Sync** again. |
| "Top-up failed" | The amount is zero or negative, or Paystack refused the payment | Enter an amount of NGN 1,000 or more, then pay again. |
| Branch review runs nowhere | No repository is on **Watch** | Click **Watch**, and confirm the repository is synced. |

---

## Related

- Previous: [09-unlock-operate.md](./09-unlock-operate.md)
- [11-billing-and-subscribe.md](./11-billing-and-subscribe.md)
- [Command Centre: Code security](../command-centre/21-code-security.md)
- [Command Centre: Add and verify assets](../command-centre/03-add-and-verify-assets.md)
- [Platform how-tos](./README.md)
