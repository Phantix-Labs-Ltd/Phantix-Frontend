# Platform: Complete the setup

**Where:** `/setup`, then **Get started** (`/get-started`), which open after the first sign in
**What:** Takes a new organization from its first sign in to people using the applications: verify the email, run a Quick Scan, connect the security database, then choose a plan and the applications and send login links.
**Who:** The primary user of the organization.
**Before you start:** A signed-in Platform session, and the work email open for the verification code.

![Choose your applications](../../screenshots/platform/setup-applications.png)

---

## Before you start

- Email verification is the one gate that setup enforces. The rest of setup can wait, and **Skip to dashboard** is on every step.
- The Quick Scan runs passive checks on a domain or a GitHub repository. Nothing is attacked.
- Saving the Quick Scan results needs the security database. See [06-connect-security-database.md](./06-connect-security-database.md).
- Active testing needs a verified domain, so setup asks for it after the Quick Scan.
- The plan step shows only where billing is enforced. Free needs no card.
- Nobody uses the applications until a login link is sent. The applications accept only users who arrive through their link.

---

## Process flow

![Platform: Complete the setup process flow](../../diagrams/how-to-platform-02-complete-setup-wizard.svg)

---

## Steps

1. Sign in to Platform. Setup opens at `/setup` while the email is not verified.
2. Click **Send verification code**, then enter the code from the email. Click **Verify email**.
3. On **What do you want to protect?**, enter a domain or a GitHub repository. Click **Run Quick Scan**.
4. Read the results when the scan completes. You can leave the page while it runs.
5. Click the next step on the results card. Setup asks, in order and only when missing, for audit control, the service key, and the security database.
6. Connect the security database. At the end of the journey, click **Back to your Quick Scan**.
7. Click **Save results**. The results move into your security database.
8. On **Verify your domain**, prove ownership of the domain with a DNS record or an HTTP file. Click **Continue**.
9. On **Choose your plan**, select **Free**, **Starter** or **Growth**. Starter and Growth open Paystack checkout, then return here to confirm the payment.
10. On **Choose your applications**, keep **Core** and **Attack** on. Your first VAPT runs in Attack. Switch on **Defend** and **Code** if you want them.
11. On **Give your team access**, add the people who use the applications. Click **Email login link** for each person, starting with yourself.
12. Open your own email and follow the link to sign in to the Command Centre.

**Result:** The organization has a security database, a plan and its applications, and its people can sign in. During the beta, connecting the security database also takes the place of the organization in the sandbox.

---

## Reference

### Setup steps

| Step | Route | Blocks progress | Notes |
| --- | --- | --- | --- |
| Verify email | `/setup` | Yes | The code goes to the work email. |
| Quick Scan | `/get-started` | No | Results stay as a 7-day preview until they are saved. |
| Audit control | `/users` | When dual control is on | Assign the initiator and the authorizer. |
| Service key | `/get-started/service-key` | When missing | The applications need the service key of the organization. |
| Security database | `/connections/new` | To save results | The guided journey. |
| Verify your domain | `/get-started/verify-domain` | No | Active testing needs it. |
| Choose your plan | `/get-started/plan` | No | Shown only where billing is enforced. |
| Choose your applications | `/get-started/applications` | No | Core and Attack start on. |
| Give your team access | `/get-started/app-access` | No | Send at least one login link. |

### Plans

| Plan | Payment |
| --- | --- |
| Free | No card |
| Starter | Paystack checkout, monthly or yearly |
| Growth | Paystack checkout, monthly or yearly |

Yearly billing charges ten months for twelve. Platform reads the plan prices from `GET /billing/plans`.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| No code arrives | The message went to spam | Click **Resend code** after the countdown, then read the spam folder. |
| "You've used today's Quick Scans" | The daily Quick Scan limit is reached | Try again tomorrow, or connect the security database to run full scans. |
| **Save results** is missing | The security database is not ready | Connect it, then click **Back to your Quick Scan**. |
| "This preview expired" | The results are older than 7 days | Run the Quick Scan again. |
| The plan step does not show | Billing is not enforced in this environment | Continue. Every application is open. |
| "Payment not confirmed" | The checkout did not complete | Try again, or pay later from **Billing**. |
| "Attack is off. You need it to run your first VAPT." | Attack is switched off | Switch on Attack on **Choose your applications**. |
| A person cannot sign in to the applications | No login link was sent to them | Click **Email login link** for that person. |

---

## Related

- Previous: [01-register-and-sign-in.md](./01-register-and-sign-in.md)
- Next step: [06-connect-security-database.md](./06-connect-security-database.md)
- [05-issue-app-login-link.md](./05-issue-app-login-link.md)
- [11-billing-and-subscribe.md](./11-billing-and-subscribe.md)
- [Platform how-tos](./README.md)
