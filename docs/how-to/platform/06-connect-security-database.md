# Platform: Connect a security database

**Where:** **Security database** → `/connections`
**What:** Connects the dedicated database that holds assets, findings, risks, and security operations center (SOC) data. SecureGraph then tests the connection and prepares its schema.
**Who:** The admin of the organization. A write action needs operate mode when dual control is on.
**Before you start:** A PostgreSQL database you control, and a database user that owns only the SecureGraph schema.

![Connections](../../screenshots/platform/connections.png)

---

## Before you start

- Scans and vulnerability assessment and penetration testing (VAPT) stay blocked until the security database reads **ready**.
- The security database is PostgreSQL. Neon, Supabase, Amazon RDS and self-hosted PostgreSQL all work.
- Use an empty database, or a dedicated schema. SecureGraph never needs your application tables.
- Know where the database is. A hosted database with a public endpoint connects directly. A database on a private network needs a SecureGraph Connector.
- For a private database, install the connector first. See [14-install-connector.md](./14-install-connector.md).
- Dual control is on: assign the audit controller first. Platform refuses connection changes without it.
- One security data storage connection is primary. A new primary clears the flag on the old one.

---

## Process flow

![Platform: Connect a security database process flow](../../diagrams/how-to-platform-06-connect-security-database.svg)

---

## Steps

### Hosted database (Neon, Supabase, or a public endpoint)

1. Open **Security database**.
2. Under **Where is your database?**, select **Hosted, with a public endpoint**.
3. Select the provider tab: **Neon**, **Supabase**, or **Other PostgreSQL**.
4. Follow the provider steps on the card. For Supabase, copy the **Session pooler** connection string.
5. Allowlist the SecureGraph addresses in the provider, when the card shows them. Add every address.
6. Paste the `postgresql://` connection string into **Connection URL**.
7. Click **Connect**. Platform saves the connection and opens the setup window.
8. Click **Test connection**. Wait for the step to show a check mark.
9. Click **Prepare security database**. SecureGraph creates its schema and tables.
10. Click **Continue setup** during first-run setup, or **Done** after it.

### Database on a private network

1. Install a SecureGraph Connector next to the database, and wait for **Online**. See [14-install-connector.md](./14-install-connector.md).
2. In the connector setup window, click **Add the database**. Or click **Add connection** at the top of the page.
3. Select **Security database**. The engine is PostgreSQL.
4. Under **How does SecureGraph reach this database?**, select **Through a connector**.
5. Select the connector.
6. Enter the host and port as the connector reaches them, for example `10.0.3.12` and `5432`.
7. Enter the other fields. See the reference below.
8. Click **Save connection**. The setup window opens.
9. Click **Test connection**, then **Prepare security database**, then **Continue setup** or **Done**.

### Enter the details manually

1. Click **Enter details manually**, or **Add connection** at the top of the page.
2. Select **Security database**. The engine is PostgreSQL.
3. Select **Directly**, or **Through a connector** for a private database.
4. Enter the fields. No field is filled in for you.
5. Click **Save connection**, then complete the setup window.

**Result:** The page reads **Bootstrap gate: ready**, and scans, VAPT and saved findings are unblocked.

---

## Reference

### Connection fields

| Field | Values | Notes |
| --- | --- | --- |
| Name | Text | Required. The hint shows `SecureGraph Store`. |
| Reach | **Directly**, **Through a connector** | PostgreSQL only. A connector is for a private network. |
| Connector | A connector of your organization | Shown for **Through a connector**. A revoked connector is not listed. |
| Host | Hostname or IP address | Through a connector: the address as the connector reaches it. |
| Port | Number | Required. The hint shows `5432`. |
| Database | Text | Required. The hint shows `phantix_security`. |
| Target schema | Text | Empty means `phantix`. |
| Username and password | Text | Platform stores the password encrypted and never shows it again. |
| SSL mode | `prefer`, `require`, `disable` | Use `require` for a hosted database. |
| Environment | `production`, `staging`, `development` | Default: `production`. |

### Setup window steps

| Step | What happens |
| --- | --- |
| Test the connection | SecureGraph connects with the details you entered. |
| Prepare the security database | SecureGraph creates its own schema. It never touches your other tables. |
| Continue setup | First-run setup: you go back to save your Quick Scan results. After setup, the button reads **Done**. |

A test often prepares the schema in the same call. The second step then completes by itself.

### Allowlist addresses

| Provider | Where to add the addresses |
| --- | --- |
| Neon | Project **Settings** → **Network security** → **IP Allow**. IP Allow is part of the paid plans. |
| Supabase | **Project Settings** → **Database** → **Network Restrictions**. Add each address as a `/32` range. |

Platform shows the addresses only to signed-in organizations. The addresses accept no inbound traffic.

### Connection states

| State | Meaning |
| --- | --- |
| `not_bootstrapped` | The connection is saved. The schema is missing. |
| `ready` | The schema is prepared. The gate is open. |
| `pending` | The action waits for an authorizer. Approve it in **Authorizations**. |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| The test times out | A firewall blocks the port, or the host is wrong | Check the host and port. For a hosted database, allowlist every SecureGraph address. |
| Authentication fails | The username or the password is wrong | Check the credentials, then update the connection. |
| "The connector is offline" | The connector is not running, or cannot reach SecureGraph on port 443 | Start the connector. Allow outbound HTTPS from its host. |
| "The connector refused this database" | The host and port are not in `SG_ALLOWED_TARGETS` | Add `host:port` to `SG_ALLOWED_TARGETS` exactly, then restart the connector. |
| "Cannot reach the target from the connector" | The connector cannot open a connection to the database | Check the address, the database listen address and the network between them. |
| "Connectors support PostgreSQL databases today" | The engine is not PostgreSQL | Connect the database directly. |
| Preparing fails | The user cannot create the schema | Grant create on the database, or create the `phantix` schema for the user. |
| "Sent for approval" | Platform parked the action for an authorizer | Approve it in **Authorizations**. |
| "Audit control required" | Dual control is on and not assigned | Assign the audit controller on the **People** page. |

---

## Related

- Previous: [02-complete-setup-wizard.md](./02-complete-setup-wizard.md)
- Next step: [07-connect-config-database.md](./07-connect-config-database.md)
- [14-install-connector.md](./14-install-connector.md)
- [Command Centre: Launch a scan](../command-centre/05-launch-a-scan.md)
- [Platform how-tos](./README.md)
