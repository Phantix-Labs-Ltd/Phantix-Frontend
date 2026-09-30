# Platform: Identity, service keys and report branding

**Where:** **Identity and Keys** → `/identity`
**What:** Maintains the company profile, the organization service key, and the report logo. The service key is a machine credential for agents and integrations.
**Who:** The primary user of the organization.
**Before you start:** Setup is complete, and a dual-control operate session may be requested.

![Identity](../../screenshots/platform/identity.png)

---

## Before you start

- The identity record holds the tenant ID, the slug, and the creator user ID. Quote these values on a support ticket.
- The service key is organization-scoped. Command Centre user sessions use app tokens instead.
- Exactly one active service key exists for the company.
- A logo file must be PNG, JPEG, WebP, or SVG, and 2 MB or smaller.
- Profile changes may request a dual-control operate session.
- The person who opens the privacy tab acts as the data subject for that request.

---

## Process flow

![Platform: Identity, service keys and report branding process flow](../../diagrams/how-to-platform-08-identity-keys-branding.svg)

---

## Steps

### Update the company profile

1. Sign in to Platform and open **Identity and Keys**.
2. Open the **Company profile** tab.
3. Edit the legal details: name, legal name, registration number, tax ID, and company type.
4. Edit the size details: year founded, employees, and annual revenue.
5. Edit the address details: website, phone, country, city, state or province, and postal code.
6. Edit the primary and secondary contacts: title, name, email, phone, WhatsApp, and Telegram.
7. Click **Save company profile**.
8. Complete the operate prompt when Platform asks.
9. Open the **Security posture** tab to record the security team and the compliance scope.
10. Click **Save security posture**.

### Create or rotate the service key

1. Open the **Keys and branding** tab.
2. Click **Create service key** when no key exists. Otherwise click **Rotate**.
3. Complete the operate prompt when Platform asks.
4. Copy the full key at once. It starts with `pk_live_`.
5. Store the key in a secret manager.
6. Click **Revoke** to disable a key, then confirm.

### Upload the report logo

1. Open the **Keys and branding** tab.
2. Click **Upload logo**.
3. Select a PNG, JPEG, WebP, or SVG file of 2 MB or smaller.
4. Complete the operate prompt when Platform asks.
5. Confirm the preview shows the new logo.
6. Click **Remove** to delete the logo. Then confirm with the type-to-confirm dialog.

### Raise a data subject request

1. Open the **Privacy and data** tab.
2. Select a request type: access, rectification, erasure, portability, restriction, or objection.
3. Add optional detail and an optional contact email.
4. Click **Submit request**.
5. Click **Download my data** to receive a copy as `phantix-my-data.json`.
6. Open **Your requests** to read the reference, the type, and the status.

**Result:** The profile, the key, the logo, and the privacy requests reflect the change.

---

## Reference

### Tabs

| Tab | Content |
| --- | --- |
| Overview | Tenant identity, the plan, the verification chips, and the primary contact. |
| Company profile | Legal details, size, address, description, notes, and contacts. |
| Security posture | Security team details, compliance frameworks, data types, infrastructure, and cloud providers. |
| Keys and branding | Service key, domain verification, report logo, preferred services, and a download of the data. |
| Privacy and data | Data subject requests and the self-service data export. |

### Company profile fields

| Group | Fields and allowed values |
| --- | --- |
| Identity | Name, legal name, registration number, tax ID, company type |
| Size | Year founded, employees: `1-10`, `11-50`, `51-200`, `201-500`, `501-1000`, `1000+`; annual revenue: `under-100k`, `100k-1m`, `1m-10m`, `10m-50m`, `50m+` |
| Classification | Industry, sub-industry |
| Contact | Website, phone, secondary email, timezone |
| Address | Country, city, state or province, postal code, address line 1, address line 2 |
| Free text | Description, internal notes |
| Contacts | Primary and secondary: title, name, email, phone, WhatsApp username, Telegram username |

Company types: `private_limited`, `public_limited`, `llc`, `partnership`, `sole_proprietorship`, `ngo`, `government`, `startup`, `other`. Contact titles: `mr`, `mrs`, `ms`, `miss`, `dr`, `prof`, `eng`.

### Security posture fields

| Group | Allowed values |
| --- | --- |
| Team | Security mailbox, security maturity, security team size, critical assets summary |
| Flags | Dedicated security team, has a chief information security officer, previous breach, breach notes |
| Compliance frameworks | `iso_27001`, `soc_2`, `pci_dss`, `gdpr`, `ndpr`, `hipaa`, `nist_csf`, `cis_controls`, `cbn_risk_based`, `swift_csp`, `iso_27701`, `other` |
| Data types | `pii`, `phi`, `pci`, `financial`, `credentials`, `intellectual_property`, `government`, `biometric`, `other` |
| Infrastructure | `cloud`, `on_prem`, `hybrid`, `saas`, `ot_ics`, `mobile` |
| Cloud providers | `aws`, `gcp`, `azure`, `digitalocean`, `other` |
| Security maturity | `initial`, `developing`, `defined`, `managed`, `optimizing` |

### Service key

| Item | Detail |
| --- | --- |
| Count | Exactly one active key for each company. |
| Format | The key starts with `pk_live_`. It shows once, at creation. |
| Display | The card shows the prefix, the creation time, and the last use time. |
| Rotation | **Rotate** issues a new key and shows it once. |
| Revocation | **Revoke** stops the integrations at once. The login links keep working. |
| Storage | Keep the key in a secret manager. Never put a user token on a server. |
| Header | The SOC heartbeat agent sends the key as `X-Org-Api-Key`. |

### Report branding

| Item | Detail |
| --- | --- |
| Formats | PNG, JPEG, WebP, SVG |
| Size limit | 2 MB |
| Placement | Report cover pages and footers |
| Removal | Type-to-confirm. The removal cannot be undone. |
| Storage error | HTTP 502 or 503 returns "Storage unavailable. Try again." |

### Data subject requests

| Item | Detail |
| --- | --- |
| Basis | Nigeria Data Protection Act (NDPA) sections 34 to 37 |
| Types | `access`, `rectification`, `erasure`, `portability`, `restriction`, `objection` |
| Statuses | `received`, `in_progress`, `completed`, `rejected` |
| Export | `GET /organizations/me/data-export`, downloaded as `phantix-my-data.json` |
| Endpoint | `POST` and `GET /organizations/me/data-subject-request` |

### Preferred services

The **Preferred services** card writes `PUT /organizations/me/preferred-services`. The list includes penetration testing, vulnerability management, red team, blue team, and purple team. It also includes managed security service provider, SOC as a service, incident response, threat intelligence, and security awareness. Further entries cover compliance and audit, cloud security, application security, operational technology security, and other. Platform reads the catalog from `GET /organizations/services-catalog`. The selection shapes navigation and modules.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Save failed" on the profile | A field value is outside the backend list, or the operate session ended | Check the field values, unlock operate, then save again. |
| The save drops an infrastructure value | The value is outside the current list, for example a stale `container` value | Select a current value: `cloud`, `on_prem`, `hybrid`, `saas`, `ot_ics`, or `mobile`. |
| "Invalid file" on the logo | The file type is not PNG, JPEG, WebP, or SVG | Convert the file, then upload it again. |
| "File too large" on the logo | The file is larger than 2 MB | Compress the file below 2 MB. |
| "Storage unavailable. Try again." | The media store returned HTTP 502 or 503 | Wait, then upload the file again. |
| The full service key is lost | Platform shows the key once | Click **Rotate** and copy the new key at once. |
| Integrations stop working after a rotation | The old key was revoked | Update the secret in each integration with the new key. |
| The report cover shows a placeholder | No logo is set, or the logo was removed | Upload a logo. |
| A data subject request shows no reference | The request did not reach the API | Submit the request again, then open **Your requests**. |
| **Download my data** fails | The export call failed | Try again, or open a support ticket. |

---

## Related

- Previous: [05-issue-app-login-link.md](./05-issue-app-login-link.md)
- [02-complete-setup-wizard.md](./02-complete-setup-wizard.md)
- [11-billing-and-subscribe.md](./11-billing-and-subscribe.md)
- [Command Centre: Generate reports](../command-centre/11-generate-reports.md)
- [Platform how-tos](./README.md)
