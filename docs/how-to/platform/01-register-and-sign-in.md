# Platform: Register and sign in

**Where:** `https://platform.phantixlabs.com` → **Create your account** (`/register`), **Join the waitlist** (`/waitlist`) and **Sign in** (`/login`)
**What:** Creates the organization tenant and signs in the primary user. During the beta, registering means joining the sandbox. When the beta is full, registration closes and the waitlist takes its place.
**Who:** The primary user of the organization. Platform access is reserved for this person.
**Before you start:** A work email you control, a company name of 2 characters or more, and a password of 12 characters or more.

![Create your account during the beta](../../screenshots/platform/register-beta.png)

---

## Before you start

- You control the work email. Platform sends every email code to this address.
- The company name holds 2 characters or more. The password holds 12 characters or more.
- During the beta, the first 25 organizations to finish setup join the sandbox. Setup is finished when the security database is connected.
- During the beta, you must opt in to the sandbox to register.
- When 25 organizations finish setup, registration closes until SecureGraph opens it again. You can join the waitlist meanwhile.
- Everyone else signs in to Command Centre with a login link, not with this page.

---

## Process flow

![Platform: Register and sign in process flow](../../diagrams/how-to-platform-01-register-and-sign-in.svg)

---

## Steps

### Register a new organization

1. Open **Create your account** at `/register`.
2. Read the beta banner when it shows. It counts the places left.
3. Click **Continue with GitHub**, or enter the company name, the work email and the password.
4. Accept the terms, the Acceptable Use Policy and the privacy notice.
5. During the beta, tick **Join the beta sandbox**. **Create account** stays disabled until it is ticked.
6. Click **Create account**. Platform signs you in and opens the setup at `/setup`.
7. Enter the 6-digit code from the email to verify the address. See [02-complete-setup-wizard.md](./02-complete-setup-wizard.md).

**Result:** The organization exists, you are signed in, and during the beta the organization is a member of the sandbox.

### Join the waitlist when registration is closed

1. Open `/register`. Platform opens the waitlist at `/waitlist`.
2. Enter your work email. Personal addresses such as Gmail are refused.
3. Click **Continue**. You are on the waitlist.
4. Click **Yes, scan** to run a Quick Scan of the domain of your email, or **No thanks**.
5. Wait for the scan. It runs passive checks only and takes a few minutes. You can leave the page.
6. Read **You are on the prioritized launch list** when the scan completes.

The page never shows the findings of the scan. SecureGraph invites prioritized organizations first when registration opens again.

![Join the waitlist](../../screenshots/platform/waitlist.png)

### Sign in as a returning user

1. Open `https://platform.phantixlabs.com/login`.
2. Enter the work email and the password, or click **Continue with GitHub**.
3. Click **Continue**.
4. Enter the 6-digit code from the email.
5. Click **Verify and sign in**.
6. Set a new password when Platform opens `/change-password`.
7. Continue to `/setup` when setup is incomplete, or to `/dashboard` when setup is complete.

**Result:** An authenticated Platform session with the tenant state.

---

## Reference

### Registration phases

| Phase | What `/register` shows | Who can register |
| --- | --- | --- |
| Beta | The form, a banner with the places left, and the required **Join the beta sandbox** box | Everyone who opts in. They join the sandbox when the account is created. |
| Closed | The waitlist at `/waitlist` | Nobody. Visitors join the waitlist. |
| Open | The form, with no banner and no opt-in | Everyone |

A place is taken when an opted-in organization connects its security database. An organization that stops before that point does not take a place. Staff end the beta from the staff portal: **Pause** closes registration, and **Conclude** opens it to everyone.

### Waitlist states

| State | Meaning |
| --- | --- |
| On the waitlist | The work email is saved. |
| Scanning | The Quick Scan of the domain runs. |
| Prioritized | The scan completed. The organization is invited first. |
| Scan did not finish | The domain could not be scanned. The email stays on the waitlist. |

### Routes

| Route | Purpose |
| --- | --- |
| `/register` | Create the organization tenant. |
| `/waitlist` | Join the launch waitlist when registration is closed. |
| `/login` | Sign in as the primary user. |
| `/change-password` | Set a new password when Platform asks. |
| `/password-reset` | Request a password reset. |
| `/setup` | Complete the setup. |
| `/dashboard` | Open the tenant overview. |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| **Create account** stays disabled | The beta opt-in is not ticked | Tick **Join the beta sandbox**. |
| "During the beta, registering means joining the sandbox" | The request had no opt-in | Tick **Join the beta sandbox**, then submit again. |
| `/register` opens the waitlist | Registration is closed | Join the waitlist. SecureGraph emails you when registration opens. |
| "Use your work email, not a personal address." | The waitlist accepts work emails only | Enter the email of your organization. |
| "We couldn't reach the domain" | The domain does not resolve, or it opted out of reviews | You stay on the waitlist. No scan runs. |
| "Incorrect email or password" | The address or the password is wrong | Click **Forgot password?** and set a new password. |
| "Too many failed attempts. Try again shortly." | 5 failed attempts arrived inside 5 minutes | Wait for the countdown on the button, then try again. |
| No code arrives | The message went to spam, or the email is wrong | Click **Resend code**, wait 30 seconds, then read the spam folder. |
| The sign in lands on `/setup` | Setup is incomplete for the tenant | Complete the setup. |

---

## Related

- Next step: [02-complete-setup-wizard.md](./02-complete-setup-wizard.md)
- [13-sandbox-feedback.md](./13-sandbox-feedback.md)
- [05-issue-app-login-link.md](./05-issue-app-login-link.md)
- [Platform how-tos](./README.md)
