# Platform: Billing and subscribe

**Where:** **Billing** → `/billing`
**What:** Manages the subscription, the payment history, and the artificial intelligence (AI) credit wallet. The page holds the plans Free, Starter, Growth, and Enterprise.
**Who:** The primary user of the organization.
**Before you start:** Dual control is assigned, and a payment method is ready for Paystack.

![Billing](../../screenshots/platform/billing.png)

---

## Before you start

- Dual control is assigned. A subscription change requests an operate session.
- The plan is known: Free, Starter, Growth, or Enterprise.
- A Paystack payment method is ready for a paid plan.
- A beta code is ready when staff issued one. The code grants full plan access for up to 31 days.
- The page reads the prices from `GET /billing/plans`. Platform shows the current list price.
- The yearly cycle equals 10 monthly payments, which is 2 months free.

---

## Process flow

![Platform: Billing and subscribe process flow](../../diagrams/how-to-platform-11-billing-and-subscribe.svg)

---

## Steps

### Subscribe to a plan

1. Sign in to Platform and open **Billing**.
2. Read the **Current plan** card. It shows the plan name, the state, and the renewal date.
3. Select the **Monthly** or the **Yearly** cycle.
4. Read the price and the note under the price for each paid tier.
5. Click **Subscribe** on Starter or Growth.
6. Complete the operate prompt when Platform asks.
7. Complete the payment on the Paystack page.
8. Return to `/billing`. Platform verifies the payment and updates the plan badge.
9. Confirm the plan badge and the renewal date.

**Result:** The subscription reads **Active**, and the paid features unlock.

- Click **Verify** when the page holds a payment reference that needs confirmation.
- Click **Switch** to move between Starter and Growth.
- Click **Contact sales** on Enterprise to open a support ticket.

### Redeem a beta code

1. Click **Redeem code**.
2. Enter the code in the format `BETA-XXXX-XXXX`. The field converts the entry to capitals.
3. Click **Redeem**.
4. Confirm the state reads **Beta access**.

### Pay an open invoice

1. Open **Payment history**.
2. Find the row with the status `pending`.
3. Click **Verify** to confirm the payment, or pay through the gateway.
4. Confirm the row status becomes `paid`.

### Cancel auto-renew

1. Click **Cancel auto-renew**.
2. Read the confirm dialog. Access continues to the end of the paid period.
3. Click **Confirm cancellation**.

### Buy AI credits

1. Read the **AI credits** strip. It shows the total, the cycle, and each bucket.
2. Click a bundle: 500, 2,000, or 5,000 credits.
3. Complete the operate prompt when Platform asks.
4. Complete the payment on the Paystack page.
5. Confirm the new balance.

**Result:** The credit wallet holds the new total for the cycle.

---

## Reference

### Plans

| Plan | Price source | Notes |
| --- | --- | --- |
| Free | No charge | No card. Asset and user caps apply. |
| Starter | `GET /billing/plans` | The page can show a first-month discount from `GET /billing/pricing`. |
| Growth | `GET /billing/plans` | The continuous assurance tier. |
| Enterprise | **Custom** | Click **Contact sales** to open a support ticket. |

### Cycles

| Cycle | Price rule |
| --- | --- |
| Monthly | The list price for one month. |
| Yearly | 10 monthly payments, which is 2 months free. |

### Free plan limits

| Limit | Source field |
| --- | --- |
| Free assets | `assets_remaining_free` |
| Free organization users | `org_users_remaining_free` |
| Free report formats | `free_report_formats` |
| Credits each month | `ai_credits_mo` |

### AI credits

| Item | Detail |
| --- | --- |
| Bundles | 500 credits, 2,000 credits, and 5,000 credits |
| Buckets | `allowance`, `allotment`, and `topup` |
| States | `exhausted` and `low` |
| Cycle | A month value, for example `2026-09` |
| Top-up endpoint | `POST /billing/credits/top-up/checkout` |

### Subscription states

| State | Meaning |
| --- | --- |
| `active` | The subscription runs, and the paid features are available. |
| `past_due` | The renewal payment failed. The grace period may apply. |
| `in_grace_period` | Access continues until `grace_ends_at`. |
| `coupon` grant source | A beta code granted the access. |

### Report export formats

JSON, CSV, Markdown, PDF, DOCX, XLSX, HTML, and PPTX are available on every plan, Free included. Report formats are never the paid lever.

### What Free cannot do

| Feature | Plan that unlocks it |
| --- | --- |
| Continuous pull request review | Growth |
| Continuous and recurring pentest | Growth |
| Cloud posture packs | Growth |
| Container and Kubernetes posture | Growth |
| Secrets, software composition analysis (SCA), and static application security testing (SAST) | Growth |
| Compliance workbench | Growth |
| SOC alert console | Growth |
| Autonomous Pentest Agent | Growth |
| Dynamic mobile and Android virtual device (AVD) testing | Engagement |

### Payment history

| Column | Meaning |
| --- | --- |
| Reference | The gateway reference for the payment. |
| Purpose | The payment purpose, with the discount when one applied. |
| Date | The creation time. |
| Amount | The amount due in Nigerian naira (NGN). |
| Status | The payment state, for example `pending` or `paid`. |
| **Verify** | Confirms a pending payment. |

### Endpoints

| Action | Endpoint |
| --- | --- |
| Read entitlements | `GET /billing/entitlements` |
| Read plans | `GET /billing/plans` |
| Read prices | `GET /billing/pricing` |
| Read credits | `GET /billing/credits` |
| Read the gateway key | `GET /billing/gateway` |
| Read the subscription | `GET /billing/subscription` |
| Read payments | `GET /billing/payments` |
| Subscribe | `POST /billing/subscribe` with `billing_cycle` and `plan` |
| Start a payment | `POST /billing/payments/{id}/initialize` |
| Verify a payment | `POST /billing/payments/{id}/verify` |
| Redeem a code | `POST /billing/coupons/redeem` with `code` |
| Cancel auto-renew | `POST /billing/subscription/cancel` |

Platform verifies a payment again when the return URL carries `reference`, `trxref`, or `payment_id`.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "That needs an upgrade on your plan." | The action needs a paid entitlement. The API returned HTTP 402. | Return to **Billing**, upgrade the plan, then retry the action. |
| "Subscribe failed" | The operate session ended, or the gateway call failed | Unlock operate, then click **Subscribe** again. |
| "Verification failed" | The gateway declined the payment, or the reference is wrong | Read the payment row, then click **Verify** again. |
| The plan badge does not change | The payment is not verified yet | Click **Verify**, or refresh the page. |
| "Redeem failed" | The code is invalid, or a person already used it | Check the code with staff, then enter it again. |
| The page shows **Grace period** | The renewal payment failed | Pay the renewal invoice to stay on the plan. |
| The subscription shows `past_due` | The gateway declined the renewal | Pay the open invoice. |
| The credit wallet reads **Exhausted** | The cycle credits are used | Buy a bundle, or wait for the next cycle. |
| A report format is locked | The plan does not cover the format | All formats are free on every plan. Refresh the page. |
| "User limit reached" on **People and Control** | The Free plan user cap is reached | Upgrade the plan, or remove a user. |
| The **Verify** control is absent | No pending payment exists | Read the **Payment history** table. |
| The payment page did not open | A browser blocked the redirect | Allow the redirect, then click **Subscribe** again. |

---

## Related

- Previous: [10-connect-github.md](./10-connect-github.md)
- [02-complete-setup-wizard.md](./02-complete-setup-wizard.md)
- [03-add-a-user.md](./03-add-a-user.md)
- [Command Centre: Generate reports](../command-centre/11-generate-reports.md)
- [Platform how-tos](./README.md)
