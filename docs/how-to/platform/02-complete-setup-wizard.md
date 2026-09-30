# Platform: Complete the setup wizard

**Where:** **Organization setup** → `/setup`, which opens after the first sign in
**What:** Marks the organization setup complete so the product modules can run. The wizard holds 6 steps, and Platform saves the progress as you go.
**Who:** The primary user of the organization.
**Before you start:** A signed-in Platform session, and the primary email open for the one-time password (OTP).

![Dashboard and setup context](../../screenshots/platform/dashboard.png)

---

## Before you start

- Privacy acceptance and email verification are the two gates that the API enforces.
- Company verification is a wizard gate. The wizard does not continue past step 4 without it.
- The primary email is open for the email OTP. The code field accepts 4 digits or more.
- Company verification needs one mode: a domain, registry details, or a manual review.
- A domain proof needs a DNS text record or an HTTP well-known file.
- Starter and Growth take you to Billing after setup. Free needs no card.

---

## Process flow

![Platform: Complete the setup wizard process flow](../../diagrams/how-to-platform-02-complete-setup-wizard.svg)

---

## Steps

1. Sign in to Platform. The wizard opens at `/setup` when setup is incomplete.
2. Read the privacy notice in the scroll box.
3. Scroll the notice to the end. The acceptance checkbox then becomes active.
4. Mark the acceptance checkbox.
5. Click **Accept and continue**. Platform records the notice version.
6. Fill the company profile: legal name, registration number, website, and company phone.
7. Click **Save and continue**, or click **Skip for now**. The profile step is optional.
8. Click **Send verification code** on the email step.
9. Confirm the masked address on the card is the correct address.
10. Enter the code from the email. The field accepts 4 digits or more.
11. Click **Verify email**.
12. Wait for the 45-second cooldown before you click **Resend code**.
13. Select one company verification mode: **Domain**, **CAC and RC**, or **Manual review**.
14. For **Domain**, enter the domain and click **Start**. The domain needs a dot.
15. Add the DNS text record or the HTTP well-known file from the instructions.
16. Click **Check auto**, **Check dns**, or **Check http**. Wait 5 seconds between checks.
17. For **CAC and RC**, enter the RC number and the company details, then click **Submit details**.
18. For **Manual review**, add notes for the staff reviewer and click **Request staff review**.
19. Click **Continue to complete** after Platform verifies the company.
20. Choose a plan on step 5: Free, Starter, or Growth. Platform stores the choice.
21. Click **Continue**, then click **Complete setup** on step 6.
22. Click **Continue to payment** for Starter or Growth, or **Set up dual control** for Free.

**Result:** The tenant reaches 100 percent setup, and the dashboard opens.

The sidebar shows the progress percentage and the `next_step` value from the API. The wizard reads the setup state again every 20 seconds. A staff approval for a manual review arrives without a page refresh.

---

## Reference

### The six wizard steps

| Step | Name | Blocks completion | Action |
| --- | --- | --- | --- |
| 1 | Privacy notice | Yes, at the API | Read the notice and accept it. |
| 2 | Company profile | No | Save the legal name, registration number, website, and phone, or skip. |
| 3 | Email verification | Yes, at the API | Enter the one-time code from the primary email. |
| 4 | Company verification | Yes, in the wizard | Prove company control in one mode. |
| 5 | Choose a plan | No | Select Free, Starter, or Growth. |
| 6 | Complete | Yes | Click **Complete setup**. |

Platform refuses the completion call without privacy acceptance and email verification. The API returns HTTP 400.

### Company verification modes

| Mode | Method | What you need |
| --- | --- | --- |
| Domain | DNS text record, or HTTP well-known file | The domain, and access to DNS or the web server. |
| CAC and RC | Corporate Affairs Commission (CAC) registry details | RC number, company type, registration date, status, registered address, and TIN. |
| Manual review | Staff approval | Notes for the reviewer. The notes are optional. |

A manual review holds one of three states: `pending`, `approved`, or `rejected`. Request the review again with clearer notes after a rejection.

### Plan choices

Platform grants artificial intelligence (AI) credits for the assistant features.

| Plan | AI credits | Main additions | Payment |
| --- | --- | --- | --- |
| Free | 500 one-time credits | Asset inventory with fair-use caps, and light DNS and network hygiene scans | No card |
| Starter | 5,000 credits per month | Scoped, approval-gated vulnerability assessment and penetration testing (VAPT) campaigns, and verified findings with remediation guidance | Pay after setup |
| Growth | 20,000 credits per month | Continuous pentest and pull request review, and multi-cloud and Kubernetes posture | Pay after setup |

Every plan carries dual control, multi-factor authentication (MFA), and an immutable audit trail. Platform reads the plan prices from `GET /billing/plans`. Growth carries the **Most popular** badge.

### Completion controls

| Control | Destination |
| --- | --- |
| **Continue to payment** | `/billing?plan=<plan>` for Starter and Growth |
| **Set up dual control** | `/users` for Free |
| **Connect security DB** | `/connections` |
| **Enter dashboard** | `/dashboard` |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| The acceptance checkbox is disabled | The notice box is not scrolled to the end | Scroll the notice to the end. The checkbox then enables. |
| "Email OTP is blocked until the privacy notice is accepted." | Step 1 is incomplete | Return to step 1 and accept the privacy notice. |
| The resend control is disabled | The 45-second cooldown is active | Wait for the countdown, then click **Resend code**. |
| "That code is not right" or a similar message | The code is old or mistyped | Enter the newest code from the email. |
| "Check failed" on the domain | The proof is missing, or a check ran inside 5 seconds | Wait 5 seconds, then click **Check auto**. Confirm the text value or the file body. |
| "Not verified yet" after a check | DNS or the file is not visible from the internet | Confirm the record host and value, then check again. |
| "Manual review was rejected." | Staff declined the request | Request the review again with clearer notes. |
| **Complete setup** is disabled | Privacy acceptance or email verification is incomplete | Finish steps 1 and 3. The API returns HTTP 400 without them. |
| The wizard opens on an unexpected step | The API reports a different `next_step` | Refresh the page. The API state sets the step. |
| A domain proof is refused at **Start** | The domain has no dot | Enter a full domain, for example `yourcompany.com`. |

---

## Related

- Previous: [01-register-and-sign-in.md](./01-register-and-sign-in.md)
- Next step: [04-assign-dual-control.md](./04-assign-dual-control.md)
- [06-connect-security-database.md](./06-connect-security-database.md)
- [11-billing-and-subscribe.md](./11-billing-and-subscribe.md)
- [Platform how-tos](./README.md)
