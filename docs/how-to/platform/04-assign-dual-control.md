# Platform: Assign dual control (initiator and authorizer)

**Where:** **People and Control** → **Audit control** card (`/users`)
**What:** Records the initiator and the authorizer who govern protected actions. Platform records the audit controller on every platform action, and Command Centre keeps full dual control.
**Who:** The primary user of the organization.
**Before you start:** 2 active organization users exist, with organization-domain email addresses.

![People and audit control](../../screenshots/platform/users.png)

---

## Before you start

- At least 2 active organization users exist. Create them first when the list holds fewer.
- The initiator and the authorizer are 2 different people.
- Both addresses use an organization domain, or a registration contact address.
- Gmail, Yahoo, and Outlook users cannot complete a dual-control sign in.
- The authorizer is a single slot. The initiator group holds one or more people.
- A reassignment revokes live operate sessions. The affected people sign in again with `purpose=dual_control`.

---

## Process flow

![Platform: Assign dual control (initiator and authorizer) process flow](../../diagrams/how-to-platform-04-assign-dual-control.svg)

---

## Steps

1. Sign in to Platform and open **People and Control**.
2. Confirm the page shows the user table and the **Audit control** card.
3. Click **Create the first initiator** on the bootstrap wizard.
4. Enter the full name of the initiator.
5. Enter the title of the initiator. The title appears on the audit trail.
6. Enter the work email of the initiator.
7. Click **Create initiator**. The wizard creates the person with the `org_admin` role.
8. Enter the details of a different person for the authorizer.
9. Click **Create authorizer**. The wizard creates the person with the `security_admin` role.
10. Review the two slots on the **Review the assignment** page.
11. Click **Assign dual control**.
12. Confirm the dashboard checklist marks the assignment done.
13. Click **Change** on the authorizer card to reassign the slots later.
14. Select the primary initiator and the authorizer in the dialog.
15. Click **Save changes**.
16. Click **Add initiator** to add further initiators after the assignment.

**Result:** The **Audit control** card shows the authorizer and the initiator group.

- The dialog refuses a save when one person holds both slots.
- The dialog lists the allowed domains and the exempt registration addresses.
- A duplicate email reuses the existing user, with an informational message.
- A new authorizer revokes the live operate sessions of the previous assignment.

---

## Reference

### The two slots

| Slot | Count | Duty | Bootstrap role |
| --- | --- | --- | --- |
| Initiator | One or more | Proposes and starts protected actions. Any active user with an operate session can also initiate with the grants of the role. | `org_admin` |
| Authorizer | Exactly one | The sole approver of pending actions and risk treatments. | `security_admin` |
| Primary initiator | One | The stored bootstrap initiator. The card marks this person **primary**. | Set by the assignment or the reassign dialog. |

### Email policy

| Rule | Detail |
| --- | --- |
| Allowed domains | Organization-domain addresses only. The reassign dialog lists the allowed domains. |
| Exempt addresses | The registration contact addresses are exempt. |
| Rejected providers | Gmail, Yahoo, and Outlook addresses cannot complete a dual-control sign in. |
| Same person twice | The save control stays disabled when one person holds both slots. |
| Reassignment | A new authorizer revokes the live operate sessions. The affected people sign in again with `purpose=dual_control`. |

### Endpoints

| Action | Endpoint |
| --- | --- |
| Assign the slots | `POST` on the organization dual-control route |
| Reassign the slots | `POST` on the same route with an operate session |
| Read the slots | The organization session payload |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Initiator and authorizer must be two different people" | One person holds both slots | Select a different person for the second slot. |
| "This email is already registered, but it is not in the current user list." | A duplicate address exists outside the list | Refresh the page, then reuse the existing user. |
| The **Save changes** control is disabled | A slot is empty, or both selects hold one person | Choose 2 different active users. |
| The platform rejects a work email | The address is a free-mail address and is not a registration contact | Use an organization-domain address. |
| An initiator cannot operate after a reassignment | The new authorizer revoked the live operate sessions | Sign in again and unlock operate. |
| The **Audit control** card shows **Not set** | No user holds the slot yet | Assign the slots, or refresh the page. |
| An old initiator still appears in the group | The group lists every active user who is not the authorizer | This is expected. The group is not a stored list. |
| Staff must approve an address | The domain is not in the allowed list | Ask staff to add the domain, or use an exempt address. |

---

## Related

- Previous: [03-add-a-user.md](./03-add-a-user.md)
- Next step: [09-unlock-operate.md](./09-unlock-operate.md)
- [05-issue-app-login-link.md](./05-issue-app-login-link.md)
- [Command Centre: Unlock operate](../command-centre/02-unlock-operate.md)
- [Platform how-tos](./README.md)
