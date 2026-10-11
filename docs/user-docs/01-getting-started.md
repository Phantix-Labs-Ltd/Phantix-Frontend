# Getting started with Phantix

Welcome. This guide walks a new organization from registration to first value.

---

## Before you begin

| Have ready | Why |
|------------|-----|
| Work email you control | Login + email OTP |
| Secondary email (different from primary) | Recovery and comms |
| Company name, industry, country | Registration |
| A place to host **PostgreSQL** (or wait for Phantix-hosted DB) | Store assets, findings, risks |
| Optional: domain you control | Company verification (DNS or file) |

---

## Step 1. Create your organization

1. Open the Platform **Get started free** or Register page.
2. Enter the company name, your work email and a password of 12 characters or more, or click **Continue with GitHub**.
3. During the beta, tick **Join the beta sandbox**. Registering means joining the sandbox. The first 25 organizations to connect their security database take the beta places.
4. Click **Create account**. Platform signs you in and asks for the code from your email.

When the beta is full, registration closes and the page opens the waitlist instead. Leave your work email there. A Quick Scan of your domain puts you on the prioritized launch list, and SecureGraph invites prioritized organizations first.

If login requires multi-factor, complete the email MFA step.

---

## Step 2. Organization setup wizard

In order:

1. **Accept privacy notice**
2. Optional identity fields (legal name, website, phone)
3. **Verify email via OTP** (required to finish setup)
4. Optional company verification:
   - DNS TXT record
   - HTTP well-known file
   - CAC and RC details
   - Request manual review by Phantix staff
5. **Complete setup**

Until setup is complete, some product areas stay locked.

---

## Step 3. First-run platform checklist

After setup:

1. **Invite users** and assign roles (operator vs authorizer for dual-control)
2. **Connect security database** → [02-security-database.md](./02-security-database.md)
3. **Bootstrap schema** (one click and API after a successful connection test)
4. **Add assets** (domain, public GitHub repo, etc.)
5. **Configure alerts** (SMTP and channels) → [03](./03-email-and-smtp.md), [04](./04-alert-channels.md)
6. Run a **light scan** or inventory check (within Free entitlements)
7. Review findings; export JSON/Markdown on Free

---

## Step 4. Grow when ready

| Need | Action |
|------|--------|
| Board PDF reports, VAPT campaigns, private GitHub | Upgrade to **Premium** |
| Programmatic AI agents for integrators | **AI Agent plan** (public API) |
| Full pentest with humans | Request an **engagement** |

---

## Time to first value

Most teams can register, verify email, connect a small Postgres database, add a domain, and export a first inventory within one guided session.

**Next:** [Connect your security database →](./02-security-database.md)
