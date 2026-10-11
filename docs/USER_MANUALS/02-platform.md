# How to use the Phantix Platform

**URL:** https://platform.phantixlabs.com  
**Audience:** Organization administrators  
**Purpose:** Manage the company tenant (identity, people, security DB, billing). Day-to-day security work happens in the **Command Centre** (`app.phantixlabs.com`).

---

## 1. Sign in

1. Open https://platform.phantixlabs.com/login  
2. Enter **company email** and **password** → **Continue**  

![Platform login](../screenshots/platform/login.png)

3. Enter the **email OTP** → **Verify and sign in**  
4. You land on the tenant **Dashboard**

![Platform dashboard](../screenshots/platform/dashboard.png)

### First-time registration

1. https://platform.phantixlabs.com/register  
2. Create company + verify email  
3. Complete **Setup** (privacy, identity, dual-control people, security DB)

---

## 2. Dashboard checklist

Confirm:

- Organization profile complete  
- At least two people for dual control  
- Initiator + authorizer assigned  
- Security database connected and bootstrapped  
- Then open **Command Centre** for operations  

---

## 3. Identity and service keys

**Nav → Identity and Keys**

![Identity](../screenshots/platform/identity.png)

1. Update legal name, industry, website, contacts  
2. Create and rotate **service keys** (`pk_live_*`) used by machine agents and some integrations  
3. Upload **report branding** logo if needed  

---

## 4. People and dual control

**Nav → People and Control**

![Users](../screenshots/platform/users.png)

1. **Create users** (name, email, role)  
2. Assign **Initiator** and **Authorizer** (required for operate sessions)  
3. Issue **Command Centre login links** (invite and magic link) for operators  
4. Unlock **Operate** when you need to approve mutations (OTP dual-control flow)  

---

## 5. Security database (Connections)

**Nav → Security Database**

![Connections](../screenshots/platform/connections.png)

1. Click **Connect database** and answer **Where is your database?**  
2. Publicly hosted: choose the provider, add every SecureGraph address to its allowlist, tick each one, then connect. Private network: install a SecureGraph Connector, then add the database  
3. **Test** the connection and **prepare** the Phantix schema  
4. Until the schema is prepared, product modules (scans, VAPT, SOC data) stay blocked  

See [Connect a security database](../how-to/platform/06-connect-security-database.md).

---

## 6. Companies (groups)

**Nav → Companies**

![Companies](../screenshots/platform/companies.png)

For multi-company groups: each child company keeps its own keys, users, DB, and billing isolation.

---

## 7. GitHub

**Nav → GitHub**

![GitHub](../screenshots/platform/github.png)

1. Connect GitHub App or PAT  
2. Discover and import repositories as assets (used later in Command Centre)  

---

## 8. Tool catalog and billing

**Nav → Tool Catalog** · **Billing**

![Tools](../screenshots/platform/tools.png)

![Billing](../screenshots/platform/billing.png)

1. Review available tools and provisions  
2. Subscribe (monthly/yearly) or redeem a coupon  
3. Pay invoices via the configured gateway  

---

## 9. AI and Autonomous Agent settings

**Nav → AI settings** · **Autonomous Agent**

![AI](../screenshots/platform/ai-settings.png)

![AGI](../screenshots/platform/agi.png)

- Configure org AI preferences and AGI access agreement and scopes (product-side).  
- Live AGI **sessions** for staff-run engagements are managed in the **Staff portal**.  

---

## 10. Alerts, support, audit

| Page | Use |
|------|-----|
| **Alerts** | SMTP and channel settings for org notifications |
| **Support** | Open tickets to Phantix |
| **Audit** | Tenant audit trail |

![Alerts](../screenshots/platform/alerts.png)

![Support](../screenshots/platform/support.png)

![Audit](../screenshots/platform/audit.png)

---

## 11. Open Command Centre

From the dashboard **Ready for operations** (or bookmark https://app.phantixlabs.com):

1. Use an **invite and login link** from People, or  
2. Sign in with app credentials (see [Command Centre manual](04-command-centre.md))  

Platform = tenant admin. Command Centre = scans, SOC, risks, reports.

---

## 12. BETA sandbox (enrolled orgs)

If your org is enrolled in the design-partner cohort:

1. Open **BETA sandbox** in the Platform sidebar (only visible when enrolled)  
2. Read staff update notes, acknowledge them, and submit ratings  
3. Also available on Command Centre `/sandbox`  

Applications from the public site are reviewed by staff, not on Platform.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No OTP email | Check spam; use **Resend**; confirm mailbox for lab tenant |
| 402 upgrade required | Subscribe or redeem coupon under Billing |
| 409 security DB | Bootstrap Connections before product modules |
| Dual-control blocked | Unlock Operate as initiator/authorizer |
