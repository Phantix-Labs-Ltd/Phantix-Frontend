# Platform: Add a new user

**Where:** **People and Control** → `/users`
**What:** Creates a named organization user with a role. New users sign in with an email code from a work domain, and the role sets the privileges.
**Who:** The primary user of the organization. A dual-control operate session may be requested.
**Before you start:** Dual control is assigned, a service key exists for app access, and the user count is below the plan cap.

![People and audit control](../../screenshots/platform/users.png)

---

## Before you start

- Dual control is assigned. Before the assignment, the page shows the bootstrap wizard instead of the user table.
- A service key exists. Login links do not work without one.
- The work email uses an organization domain, or a registration contact address.
- The Free plan includes 2 organization users by default. Platform warns when the cap is reached.
- An operate session may be requested when Platform rejects a write.

---

## Process flow

![Platform: Add a new user process flow](../../diagrams/how-to-platform-03-add-a-user.svg)

---

## Steps

1. Sign in to Platform and open **People and Control**.
2. Confirm the page shows the user table. Assign dual control first when it shows the bootstrap wizard.
3. Click **Add user**. Complete the operate prompt when Platform asks.
4. Enter the full name of the user.
5. Enter the work email. Use an organization-domain address.
6. Enter the title. The title appears on the audit trail.
7. Select the role: `viewer`, `operator`, `org_admin`, or `security_admin`.
8. Click **Create user**.
9. Confirm the new row shows **OTP only** in the **Auth** column.
10. Click **Apps** to set a role for one application when the user needs a different scope.
11. Click **Login link** to issue Command Centre access. See the next tasks.

**Result:** The new user appears in the list with the state **active**.

- The **Add initiator** control adds a person to the initiator group. Its default role is `operator`.
- The **key** control sets a Platform password for a user who needs one.
- The **phone** control clears the device bind, so the user can bind a new browser.
- Platform sends an email OTP for day-to-day access. A password is optional.

---

## Reference

### User table columns

| Column | Meaning |
| --- | --- |
| User | The full name, the work email, and the title. |
| Role | The organization role, for example `viewer` or `operator`. |
| App access | The per-application role overrides. An empty value falls back to the organization role. |
| Slot | `Initiator` or `Authorizer` when the user holds a dual-control slot. |
| Auth | `OTP only`, `password`, or `Change required`. |
| Last login | The time of the last sign in, or `never`. |

### Application filter

The buttons above the table filter the list by application. The values come from `GET /org-users/applications`, for example Core, Attack, Defend, and Code. A user can hold a different role in each application. Use **Apps** on the row to set those roles.

### Organization roles

The role list comes from `GET /org-users/roles`. Each role carries a set of privileges, and the platform loads the same list into the role editor.

| Role key | Where the platform uses it |
| --- | --- |
| `viewer` | The default role for a new user. |
| `operator` | The default role for a new initiator. |
| `org_admin` | The role for the first initiator in the bootstrap wizard. Also allows a Platform password. |
| `security_admin` | The role for the authorizer in the bootstrap wizard. |
| `org_owner` | Allows a Platform password, in addition to `org_admin`. |

### Roles and permissions

A user with the `users.manage` privilege can manage the per-organization roles.

| Rule | Detail |
| --- | --- |
| Role key | 2 to 50 characters: lowercase letters, numbers, or underscores. |
| Role name | Required text. |
| Description | Optional text. |
| System roles | Platform marks them **system**. You can tune the privileges, but you cannot rename or delete them. |
| Default role | Platform marks one role **default**. The API supplies the key. |
| Delete | Move every user to another role before you delete a role. |
| Privileges | The editor groups the privileges by application, then by shared platform scope. |

### Platform password

| Item | Detail |
| --- | --- |
| Allowed roles | `org_admin` and `org_owner` only. |
| Length | 8 characters or more. |
| First sign in | The user must change the password at the first sign in. |
| Endpoint | `PATCH /org-users/{id}` with a `password` field. |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| The **Add user** button is absent | Dual control is not assigned | Complete the bootstrap wizard on the same page. |
| "User limit reached" | The Free plan user cap is reached | Upgrade the plan, or remove a user. |
| "This email is already registered, but it is not in the current user list." | A duplicate address exists outside the list | Refresh the page, then reuse the existing user. |
| "Check the email address and try again" | The address is a free-mail address, or it is not valid | Use an organization-domain address, or a registration contact address. |
| The new user cannot sign in to Command Centre | No active service key exists | Create a service key on **Identity and Keys**, then issue a login link. |
| The **Login link** button is disabled | No active service key exists | Create the key, then open the user row again. |
| The role select does not list a role | The role list failed to load | Refresh the page. Platform reads the roles from the API. |
| "System roles cannot be deleted" | The role holds the `is_system` flag | Keep the role. Tune its privileges instead. |
| "Could not delete the role." | A user still holds the role | Move every user to another role, then delete it. |
| The user did not receive the sign-in code | The address is wrong, or the message went to spam | Correct the address, or read the spam folder. |

---

## Related

- Previous: [02-complete-setup-wizard.md](./02-complete-setup-wizard.md)
- Next step: [04-assign-dual-control.md](./04-assign-dual-control.md)
- [05-issue-app-login-link.md](./05-issue-app-login-link.md)
- [08-identity-keys-branding.md](./08-identity-keys-branding.md)
- [Platform how-tos](./README.md)
