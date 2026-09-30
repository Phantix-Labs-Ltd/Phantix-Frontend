# Platform: Unlock operate (dual-control session)

**Where:** The dual-control overlay, which a protected call opens, or the header control in Command Centre
**What:** Opens a short-lived operate session and attaches it to protected calls as the `X-Dual-Control-Session` header. The overlay holds three stages: email, one-time password (OTP), and an optional device confirmation.
**Who:** The assigned initiator or the assigned authorizer.
**Before you start:** Dual control is assigned, and the controller can read the work email.

![People and audit control](../../screenshots/platform/users.png)

---

## Before you start

- Dual control is assigned. See the previous task.
- The email address belongs to the initiator or the authorizer. Other users cannot open an operate session.
- The controller can read the work email for the 6-digit code.
- A new browser may need a device confirmation from a second email link.
- Platform records the action to the audit trail. Command Centre keeps full dual control for scans and approvals.

---

## Process flow

![Platform: Unlock operate (dual-control session) process flow](../../diagrams/how-to-platform-09-unlock-operate.svg)

---

## Steps

1. Start a protected action, or click **Unlock operate**.
2. Read the reason text at the top of the **Dual-control required** overlay.
3. Confirm the **Assigned controllers** block shows the expected initiator and authorizer.
4. Enter the initiator or the authorizer email.
5. Click **Email me a one-time code**.
6. Open the email and read the 6-digit code.
7. Enter the code in the overlay.
8. Click **Unlock operate session**.
9. Open the confirmation link from the email when the overlay asks for a device confirmation.
10. Confirm the overlay closes and the action continues.
11. Run the protected action.
12. Click **Lock session** in the Command Centre header when the work is done.

**Result:** The operate session is live, and protected calls carry the `X-Dual-Control-Session` header.

- Click **Resend code** when the message does not arrive.
- Click **Use a different email** to return to the email stage.
- Click **Start over** after a failed device confirmation.
- Click **Cancel action** to close the overlay and stop the action.

---

## Reference

### Overlay stages

| Stage | Field or control | Value |
| --- | --- | --- |
| Email | Initiator or authorizer email | An address from the assigned slots. |
| Email | **Email me a one-time code** | Sends the code to that address. |
| OTP | Code field | 6 digits from the email. |
| OTP | **Unlock operate session** | Opens the session. |
| OTP | **Resend code** | Sends a new code. |
| Device | Confirmation link | A single-use link from the email. |
| Device | **Start over** | Returns to the email stage. |

### Session behavior

| Item | Detail |
| --- | --- |
| Default lifetime | About 30 minutes from the unlock. |
| Activity | Real activity slides the expiry forward, so the session stays live while you work. |
| Idle timeout | The session locks itself after the backend inactivity window. |
| Header value | `X-Dual-Control-Session`. |
| Header display | Command Centre shows **Operating as** with a countdown and a **Lock session** control. |
| Expiry | The overlay reopens when the backend reports an expired session. The Platform sign in remains active. |
| Missing header | A 403 response opens the same overlay, so you can unlock and retry. |

### Error messages

| Message | Meaning |
| --- | --- |
| "No organization user with that email" | The address holds no organization user. |
| "Only the assigned initiator or authorizer can open operate sessions" | The user holds neither slot. |
| "Enter the 6-digit code" | The code field holds fewer than 6 digits. |
| "Device verification required" | A new browser needs the email confirmation link. |
| "The confirmation link may have expired. Start over to receive a fresh one." | The device link is older than 15 minutes. |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "No organization user with that email" | The address is not an organization user | Enter the address of a user from the **Audit control** card. |
| "Only the assigned initiator or authorizer can open operate sessions" | The user holds neither slot | Use an assigned address, or reassign the slots. |
| The code is rejected | The code is old or mistyped | Enter the newest code with digits only. |
| The overlay asks for a device confirmation | The browser is new for this user | Open the confirmation link from the email. |
| The confirmation link fails | The link is older than 15 minutes, or a browser already used it | Click **Start over** and request a fresh code. |
| The action stops after a short time | The operate session reached the idle timeout | Unlock operate again. The Platform sign in stays active. |
| The protected action still fails after the unlock | The role of the user grants no permission for the action | Check the role on **People and Control**. |
| The overlay reopens in a loop | The backend rejects the session | Lock the session, then unlock it again. |
| **Lock session** is not visible | The page is not the Command Centre shell | Use the header control in Command Centre, or let the session expire. |

---

## Related

- Previous: [04-assign-dual-control.md](./04-assign-dual-control.md)
- [03-add-a-user.md](./03-add-a-user.md)
- [06-connect-security-database.md](./06-connect-security-database.md)
- [Command Centre: Unlock operate](../command-centre/02-unlock-operate.md)
- [Platform how-tos](./README.md)
