# Platform: Configure alert channels

**Where:** **Alerts** → `/alerts`
**What:** Configures the outbound alert channels: simple mail transfer protocol (SMTP) email, WhatsApp, and Telegram. The page also holds the delivery log.
**Who:** The primary user of the organization.
**Before you start:** Dual control is assigned, the SMTP relay details are ready, and a test recipient can receive mail.

![Alerts](../../screenshots/platform/alerts.png)

---

## Before you start

- Dual control is assigned. Each save requests an operate session.
- The SMTP relay host, port, username, and password are ready.
- A sender address exists on the relay, for example an address at your own domain.
- The email recipient list is ready. Separate the addresses with commas.
- A WhatsApp recipient uses the E.164 format, for example `+2348012345678`.
- A Telegram recipient is a chat ID, a group ID, or an `@username`.

---

## Process flow

![Platform: Configure alert channels process flow](../../diagrams/how-to-platform-12-configure-alerts.svg)

---

## Steps

1. Sign in to Platform and open **Alerts**.
2. Open the **Channels and SMTP** tab. The page opens on this tab.
3. Read the **Status** value. The badge shows **active** when delivery is enabled.
4. Click **Configure SMTP**.
5. Enter the SMTP host.
6. Enter the port. The default is `587`.
7. Enter the SMTP username.
8. Enter the SMTP password. Leave the field empty to keep the current password.
9. Enter the from name and the from email.
10. Enter the alert recipients, separated by commas.
11. Leave **Use TLS encryption** marked. Transport Layer Security (TLS) protects the mail in transit.
12. Click **Save SMTP Settings**.
13. Click **Configure Channels**.
14. Mark the WhatsApp control, then select a provider: `auto`, `meta`, or `log`.
15. Enter the WhatsApp recipients in E.164 format.
16. Mark the Telegram control, then select a provider: `auto`, `telegram_bot`, or `log`.
17. Enter the Telegram bot token, or leave it empty to use the platform default.
18. Enter the Telegram recipients.
19. Click **Save Channel Settings**.
20. Toggle the notification rules that should raise an alert.
21. Click **Send test alert**.
22. Confirm the test arrives in the inbox and on each enabled channel.
23. Open the **Delivery log** tab and confirm the test row.

**Result:** The delivery log holds a row for the test, and each enabled channel receives the message.

- Slack, Teams, single sign-on (SSO), System for Cross-domain Identity Management (SCIM), and webhook channels live in the **Integrations Hub**.
- The severity floors apply to every channel. A channel policy can narrow them only.
- WhatsApp and Telegram fire on critical events only.

---

## Reference

### SMTP fields

| Field | Allowed values or default | Notes |
| --- | --- | --- |
| SMTP host | A hostname | Example: `smtp-relay.brevo.com`. |
| Port | Number | Default: `587`. |
| SMTP username | Text | The relay account. |
| SMTP password | Text | Stored in encrypted form. Empty keeps the current password. |
| From name | Text | Example: `SecureGraph Application`. |
| From email | An email address | Must be allowed by the relay. |
| Alert recipients | Email addresses, comma separated | Example: `security@acme.com, ciso@acme.com`. |
| Use TLS encryption | Marked or clear | Marked by default. |

### Channel providers

| Channel | Providers | Recipient rule |
| --- | --- | --- |
| WhatsApp | `auto`, `meta`, `log` | E.164 format, for example `+2348012345678`. Meta needs an approved utility template. |
| Telegram | `auto`, `telegram_bot`, `log` | A chat ID, a group ID starting with `-100`, or an `@username`. Start the bot first. |

The `log` provider writes the message to the log. Use it for a test only.

### Notification rules

| Rule key | Event |
| --- | --- |
| `scan_completed` | A scan completed. |
| `scan_failed` | A scan failed. |
| `risk_created` | A risk was created. |
| `risk_critical` | A critical risk arrived. |
| `treatment_events` | A risk treatment event occurred. |

### Severity routing

| Severity | Email | WhatsApp and Telegram | Slack and Teams |
| --- | --- | --- | --- |
| `critical` | Yes | Yes | Yes |
| `high` | Yes | No | Yes |
| `medium`, `low`, `info` | Yes | No | No |

The platform enforces these floors on the server. A channel policy can narrow a floor, but it cannot widen one.

### Delivery log columns

| Column | Meaning |
| --- | --- |
| Event | The title and the event type. |
| Severity | `critical`, `high`, `medium`, `low`, or `info`. |
| Channels | The channels that carried the event. |
| Status | The delivery state. |
| When | The time of the event. |

### Endpoints

| Action | Endpoint or field |
| --- | --- |
| Save the channel settings | The organization alert settings |
| Send a test | The test alert action |
| Channel state | `alerts_enabled`, `smtp.enabled`, `whatsapp.enabled`, `telegram.enabled` |
| Delivery state | `delivery_live` on the WhatsApp and Telegram settings |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| The test alert does not arrive | SMTP is not configured, and the platform default failed | Configure SMTP, then send the test again. |
| "Send failed" on the test | The operate session ended, or the relay refused the message | Unlock operate, then click **Send test alert** again. |
| "Save failed" on the SMTP form | A required field is empty, or the relay rejected the settings | Fill the host, the port, the from name, and the from email. |
| Email delivery fails after a password change | The stored password is old | Enter the new password and save the form. |
| "WhatsApp recipients must be E.164." | A recipient lacks the country code or the plus sign | Enter the value as `+2348012345678`. |
| The WhatsApp state reads **Enabled, provider not live** | The Meta Cloud provider is not live | Confirm the Meta configuration, or use the `log` provider for a test. |
| Telegram messages do not arrive | The bot is not started, or the chat ID is wrong | Start the bot, then send `/start` and read the chat ID. |
| "Security database not ready" appears elsewhere | The security database gate is closed, and it is unrelated to alerts | Connect and bootstrap the security database. |
| A high-severity event reaches no WhatsApp channel | WhatsApp and Telegram fire on `critical` only | Add Slack or Teams for the `high` floor, or read email. |
| The **Status** badge reads **draft** | Delivery is not enabled for the organization | Open **Support** and ask staff to enable alert delivery. |
| The delivery log is empty | No alert event occurred yet | Send a test alert, then read the log. |
| Slack notifications never arrive | No Slack channel exists in the Integrations Hub | Add Slack from the **Integrations Hub**. |

---

## Related

- Previous: [11-billing-and-subscribe.md](./11-billing-and-subscribe.md)
- Next step: [13-sandbox-feedback.md](./13-sandbox-feedback.md)
- [Command Centre: SOC operations](../command-centre/25-soc-operations.md)
- [Platform how-tos](./README.md)
