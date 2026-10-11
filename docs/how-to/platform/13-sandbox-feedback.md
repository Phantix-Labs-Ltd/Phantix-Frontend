# Platform: BETA sandbox feedback

**Where:** **BETA sandbox** → `/sandbox`, which appears only for an enrolled organization
**What:** Shows the live updates that staff publish after each deploy, and collects a rating of each build. The program holds up to 20 organizations.
**Who:** A member of an enrolled design-partner organization.
**Before you start:** Staff enrolled the organization on the staff portal.

---

## Before you start

- SecureGraph staff enroll the organization from the staff portal. Self-enrollment is not available.
- The program holds a maximum of 20 seats.
- The beta cohort is separate. Organizations join it by opting in when they register during the beta, and it closes registration once 25 of them finish setup. See [01-register-and-sign-in.md](./01-register-and-sign-in.md).
- The navigation item stays hidden until the enrollment exists. The API returns HTTP 404 before that point.
- The member status reads `active`.
- A rating needs a score from 1 to 5. The other rating fields are optional.
- The Command Centre holds its own sandbox page at `app.phantixlabs.com/sandbox`.

---

## Process flow

![Platform: BETA sandbox feedback process flow](../../diagrams/how-to-platform-13-sandbox-feedback.svg)

---

## Steps

1. Confirm staff enrolled the organization. The **BETA sandbox** item appears in the navigation.
2. Sign in to Platform and open **BETA sandbox**.
3. Read the member status, the unread update count, and the seat limit.
4. Open the **Live updates** card.
5. Read the severity chip, the version label, and the published time on each update.
6. Click **Mark read** after you refresh the clients. The card then shows the **acked** state.
7. Click **Rate this build**.
8. Select a score from 1 to 5.
9. Enter a Net Promoter Score (NPS) from 0 to 10.
10. Select an area from the list.
11. Enter a comment about what worked.
12. Enter the failures in the **What broke?** field.
13. Click **Submit rating**.
14. Open **Your ratings** to confirm the new row.
15. Click **Open Command Centre** to open the Command Centre sandbox page.

**Result:** The update shows the **acked** state, and the rating appears in **Your ratings**.

- Click **Refresh** to read the updates and the ratings again.
- Click **Command Centre sandbox** to open `app.phantixlabs.com/sandbox` in a new tab.
- Staff read the ratings on the staff portal Sandbox board.

---

## Reference

### Sandbox summary

| Card | Value | Source |
| --- | --- | --- |
| Member status | `active` or another member state | `GET /sandbox/me` |
| Unread updates | A count | `GET /sandbox/me` |
| Seats | The program limit, up to 20 | `program.maxMembers` |

### Live updates

| Field | Values |
| --- | --- |
| Severity | `info`, `fix`, or `breaking` |
| Version label | Text, for example a date label |
| Published time | A relative time |
| Ack state | `acked` after **Mark read** |

A `breaking` update carries a critical border, so the change stands out.

### Rating fields

| Field | Allowed values | Required |
| --- | --- | --- |
| Score | 1 to 5 | Yes |
| NPS | 0 to 10 | No |
| Area | `overall`, `platform`, `assets`, `soc`, `reports`, `agi`, `auth`, `billing`, `other` | No |
| Comment | Text | No |
| What broke | Text | No |

### Endpoints

| Action | Endpoint |
| --- | --- |
| Read the enrollment | `GET /sandbox/me` |
| Read the updates | `GET /sandbox/updates` |
| Acknowledge an update | `POST /sandbox/updates/{id}/ack` |
| Submit a rating | `POST /sandbox/ratings` |
| Read your ratings | `GET /sandbox/ratings/mine` |

### Where to test

| Surface | Content |
| --- | --- |
| Platform | Identity, people, security database, billing, and tools |
| Command Centre | Dashboard, assets, security operations center (SOC), scans, reports, and the Autonomous Agent |

### Without an enrollment

1. Apply at `https://phantixlabs.com`. The application form sits at `#sandbox-apply`.
2. Ask staff to approve the application.
3. Wait for staff to enroll the tenant.
4. Read the page again after the enrollment. The navigation item then appears.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| The **BETA sandbox** item is absent | The organization is not enrolled | Apply at `https://phantixlabs.com` with `#sandbox-apply`. |
| The page reads **Not enrolled** | The enrollment does not exist for the organization | Ask staff to enroll the tenant. |
| "Sandbox load failed" | The enrollment call failed | Click **Refresh**, or sign in again. |
| "Ack failed" | The acknowledgement call failed | Click **Mark read** again. |
| "Score must be 1 to 5" | The score is outside the range | Select a score from 1 to 5. |
| "Rating failed" | The rating call failed | Submit the rating again. |
| No updates appear | Staff published no update since the enrollment | Open the page again after the next deploy. |
| The rating list is empty | No rating exists for this member | Submit a rating. |
| **Open Command Centre** opens no session | The Command Centre session ended | Sign in with a Command Centre login link. |
| The seat count reads 20 | The program is full | Ask staff about the next cohort. |

---

## Related

- Previous: [12-configure-alerts.md](./12-configure-alerts.md)
- [01-register-and-sign-in.md](./01-register-and-sign-in.md)
- [Platform how-tos](./README.md)
- [Command Centre: Support ticket](../command-centre/15-support-ticket.md)
