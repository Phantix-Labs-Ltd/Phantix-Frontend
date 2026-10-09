# Platform: Register and sign in

**Where:** `https://platform.phantixlabs.com` → **Register your organization** (`/register`) and **Sign in** (`/login`)
**What:** Creates the organization tenant, then signs in the primary user. Registration returns no session. A one-time password (OTP) from email signs you in.
**Who:** The primary user of the organization. Platform access is reserved for this person.
**Before you start:** A work email you control, a company name of 2 characters or more, and a password of 12 characters or more.

![Sign in](../../screenshots/platform/login.png)

---

## Before you start

- You control the primary sign-in email. Platform sends every email OTP to this address.
- The company name holds 2 characters or more.
- The password holds 12 characters or more. The second entry matches the first.
- A secondary email and a primary contact name are ready. Both fields are required.
- A country and an industry are ready. The default country is Nigeria.
- Everyone else signs in to Command Centre with a login link, not with this page.

---

## Process flow

![Platform: Register and sign in process flow](../../diagrams/how-to-platform-01-register-and-sign-in.svg)

---

## Steps

### Register a new organization

1. Open **Register your organization** at `/register`.
2. Enter the company name. The name needs 2 characters or more.
3. Enter the primary sign-in email. Platform sends the sign-in codes to this address.
4. Select the industry. The list holds 21 options, and the default is **Other**.
5. Enter the secondary email and the primary contact name. Both are required.
6. Select a country. The default is Nigeria.
7. Enter the password and confirm it. The password needs 12 characters or more.
8. Click **Create organization**. Platform builds the tenant slug from the company name.
9. Open **Sign in**. Registration does not keep you signed in.

### Sign in as a returning user

1. Open `https://platform.phantixlabs.com/login`.
2. Enter the **Primary (company) email**.
3. Enter the password.
4. Click **Continue**.
5. Read the masked address on the **Email verification** card.
6. Enter the 6-digit code from the email. The field accepts digits only.
7. Click **Verify and sign in**.
8. Set a new password when Platform opens `/change-password`.
9. Continue to `/setup` when setup is incomplete, or to `/dashboard` when setup is complete.

**Result:** An authenticated Platform session with the tenant state.

- Click **Resend code** when the message does not arrive.
- Click **Use a different account** to return to the password stage.
- Click **Forgot password?** to open `/password-reset`.

The page uses email codes only. Phone verification is not available.

---

## Reference

### Registration fields

| Field | Allowed values | Notes |
| --- | --- | --- |
| Company name | Text, 2 characters or more | Platform builds the tenant slug from this name. |
| Primary sign-in email | A valid email address | Every email OTP goes to this address. |
| Industry | 21 options, for example technology, financial services, healthcare, government, education, other | Default: Other. |
| Secondary email | A valid email address | Required. |
| Primary contact | A title and a full name | Titles: Mr, Mrs, Ms, Dr, Prof, Eng, Chief, Other. |
| Password | 12 characters or more | The two entries must match. |
| Country | Nigeria, Ghana, Kenya, South Africa, United Kingdom, United States | Default: Nigeria. |

### Sign-in stages

| Stage | Control | Value |
| --- | --- | --- |
| 1 | **Primary (company) email** | The registered address. |
| 1 | **Password** | The account password. |
| 1 | **Continue** | Opens the email code stage. |
| 2 | Code field | 6 digits from the email. |
| 2 | **Verify and sign in** | Completes the sign in. |
| 2 | **Resend code** | Sends a new code to the same address. |
| 2 | **Use a different account** | Returns to the password stage. |

### Routes

| Route | Purpose |
| --- | --- |
| `/register` | Create the organization tenant. |
| `/login` | Sign in as the primary user. |
| `/change-password` | Set a new password when Platform asks. |
| `/password-reset` | Request a password reset. |
| `/setup` | Complete the setup wizard. |
| `/dashboard` | Open the tenant overview. |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Incorrect email or password" | The address or the password is wrong | Click **Forgot password?** and set a new password. |
| "Too many failed attempts. Try again shortly." | 5 failed attempts arrived inside 5 minutes | Wait for the countdown on the button, then try again. |
| The button shows a countdown instead of **Continue** | Platform throttles the sign-in attempts for this address | Wait for the countdown to reach zero. |
| No code arrives | The message went to spam, or the primary email is wrong | Click **Resend code**, wait 30 seconds, then read the spam folder. |
| The code is rejected | The code is old, or the field holds a non-digit character | Enter the newest 6-digit code, with digits only. |
| The sign in stops at a password form | The account holds the `must_change_password` state | Set the new password at `/change-password`. |
| The sign in lands on `/setup` | Setup is incomplete for the tenant | Complete the setup wizard. |
| "Enter secondary email" or "Enter primary contact name" | A required registration field is empty | Fill the named field, then submit again. |
| "Passwords do not match" | The two password entries differ | Type the same password in both fields. |
| "Enter your company name" | The company name holds fewer than 2 characters | Enter a longer company name. |

---

## Related

- Next step: [02-complete-setup-wizard.md](./02-complete-setup-wizard.md)
- [03-add-a-user.md](./03-add-a-user.md)
- [05-issue-app-login-link.md](./05-issue-app-login-link.md)
- [09-unlock-operate.md](./09-unlock-operate.md)
- [Platform how-tos](./README.md)
