# Platform: Issue a Command Centre login link

**Where:** **People and Control** → a user row → **Login link** (`/users`)
**What:** Generates a one-time sign-in uniform resource locator (URL) for one organization user on `app.phantixlabs.com`. The user signs in with an email code and a device confirmation. No platform password changes hands.
**Who:** The primary user of the organization.
**Before you start:** Dual control is assigned, and one active service key exists.

![People and audit control](../../screenshots/platform/users.png)

---

## Before you start

- Dual control is assigned, so the user table is visible.
- One active service key exists on **Identity and Keys**. Without it, the **Login link** control is disabled.
- The user holds an organization role with the app permissions the person needs.
- The user can read the work email for the one-time password (OTP).
- The login link grants Command Centre access only. It is not a Platform session.

---

## Process flow

![Platform: Issue a Command Centre login link process flow](../../diagrams/how-to-platform-05-issue-app-login-link.svg)

---

## Steps

1. Sign in to Platform and open **People and Control**.
2. Confirm the page does not show the yellow service key banner.
3. Find the user row in the table.
4. Click **Login link**.
5. Complete the operate prompt when Platform asks.
6. Wait for the **Application login link** dialog.
7. Click **Copy link**. The dialog closes after the copy.
8. Send the URL to the user through a channel you trust.
9. Ask the user to open the URL in a browser.
10. Ask the user to set a password on the first visit.
11. Ask the user to enter the email code, then confirm the new device.
12. Confirm the user reaches the Command Centre at `/dashboard`.

**Result:** The user holds a browser session on `app.phantixlabs.com`.

- The **Issued login links** card lists the person, the issue time, and the status.
- The card stores no secret. It shows the delivery status only.
- Click **Clear device bind** on a row to allow a new browser at the next sign in.
- Issue a fresh link when the old link fails. Links can expire.

---

## Reference

### The login link

| Item | Detail |
| --- | --- |
| Endpoint | `POST /organizations/me/users/{userId}/login-link` |
| Destination | `app.phantixlabs.com`, the Command Centre |
| Requirement | One active organization service key |
| Visibility | The full URL shows once. Platform stores no secret. |
| Rotation | Rotating the service key does not invalidate an issued link. |
| Sign in | An email one-time password, a password on the first visit, and a device confirmation |
| Landing page | `/dashboard` in Command Centre |

### User row controls

| Control | Action |
| --- | --- |
| **Apps** | Sets the role of the user in one application, for example Core, Attack, Defend, or Code. |
| **Login link** | Generates the one-time Command Centre sign-in URL. |
| Key control | Sets a Platform password for a user who needs one. |
| Phone control | Clears the device bind, so the user can bind a new browser. |

### Endpoint responses

| Field | Meaning |
| --- | --- |
| `login_url` | The one-time sign-in URL. Platform also accepts `url` and `login_link`. |
| `message` | The failure text when the endpoint returns no URL. |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| The **Login link** control is disabled | No active service key exists | Create a service key on **Identity and Keys**. |
| "App access requires an active service key." | The call ran without a key | Create the key, then issue the link again. |
| "Login link was not returned." | The endpoint returned no URL, or the operate session ended | Unlock operate, then issue the link again. |
| The dialog closed before the copy | The dialog shows the URL one time | Generate a new link and copy the URL at once. |
| The link does not open a session | The link expired, or another browser opened it | Issue a fresh link for the same user. |
| The user cannot pass the device step | The browser is new and the device bind is stale | Click **Clear device bind**, then issue a new link. |
| The user sees no email code | The address is wrong, or the message went to spam | Correct the address, or read the spam folder. |
| The user reaches Command Centre but sees no data | The user role grants no application permissions | Set the role under **Apps** for that application. |

---

## Related

- Previous: [03-add-a-user.md](./03-add-a-user.md)
- [04-assign-dual-control.md](./04-assign-dual-control.md)
- [08-identity-keys-branding.md](./08-identity-keys-branding.md)
- [Command Centre: Sign in](../command-centre/01-sign-in.md)
- [Platform how-tos](./README.md)
