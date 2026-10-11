# Plans and billing

---

## Free

- No card required
- Baseline inventory and light tools
- Email alerts
- Data-friendly exports
- GitHub: **public** repos only
- Asset and user caps apply

---

## Starter and Growth

Active paid subscription unlocks continuous assurance, for example:

- Deeper scanners and VAPT campaigns
- Risk prioritization
- Board-ready report formats (PDF/DOCX class)
- Richer AI assist in-app
- Channel alerts
- GitHub: **private** repos

Pay via Paystack (NGN-first). Manage in **Billing**.

---

## Public API. AI Agent plan only

If you are an **integrator** or need **programmatic agents**:

> The **only public API payment plan** is **AI Agent access**.

You do **not** buy “full platform API” as a separate SKU. Day-to-day product use is Free or Starter or Growth **in the app**. See [10-ai-agent-api.md](./10-ai-agent-api.md).

---

## Add-ons and engagements

- Extra packs (compliance depth, cloud, secrets, …) on Starter or Growth
- Human-led VAPT and specialist engagements via sales

---

## Coupons and pilots

Design partners may receive time-limited full-access coupons from Phantix staff. Redeem in Billing when provided.

---

## Entitlements (for power users)

```http
GET /api/v1/billing/entitlements
```

Use `premium_active` and `packs[]` to drive UI locks. **402** means upgrade or request access.

**Next:** [Daily activities →](./07-daily-activities.md)
