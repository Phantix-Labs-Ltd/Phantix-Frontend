# Platform: Connect a security database

**Where:** **Security database** → **Connect database** (`/connections` → `/connections/new`)
**What:** Connects the dedicated database that holds assets, findings, risks, and security operations center (SOC) data. A guided journey asks one question for each page, then SecureGraph tests the connection and prepares its schema.
**Who:** The admin of the organization. A write action needs operate mode when dual control is on.
**Before you start:** A PostgreSQL database you control, and a database user that owns only the SecureGraph schema.

![Security database](../../screenshots/platform/connections.png)

---

## Before you start

- Scans and vulnerability assessment and penetration testing (VAPT) stay blocked until the security database reads **ready**.
- The security database is PostgreSQL. Neon, Supabase, Amazon RDS and self-hosted PostgreSQL all work.
- Use an empty database, or a dedicated schema. SecureGraph never needs your application tables.
- Know where the database is. A publicly hosted database connects directly. A database on a private network needs a SecureGraph Connector.
- A publicly hosted database must allow the SecureGraph addresses. You tick each address before you can add the database.
- Dual control is on: assign the audit controller first. Platform refuses connection changes without it.
- One security data storage connection is primary. A new primary clears the flag on the old one.

---

## Process flow

![Platform: Connect a security database process flow](../../diagrams/how-to-platform-06-connect-security-database.svg)

---

## Steps

Until the security database is ready, the page shows one action: **Connect database**. Each step of the journey is its own page, so **Back** and a page refresh keep your place.

### Publicly hosted database (Neon, Supabase, or a public endpoint)

1. Open **Security database**, then click **Connect database**.
2. On **Where is your database?**, select **Publicly hosted**.
3. On **Choose the provider**, select **Neon**, **Supabase**, or **Other PostgreSQL**.
4. On **Allowlist SecureGraph's IPs**, follow the provider steps on the card.
5. Add each listed address to the allowlist of the database. Click **Copy all** to copy every address.
6. Tick each address after you add it. **Continue to add the database** stays locked until every address is ticked.
7. Click **Continue to add the database**. Platform records the confirmation in the audit trail.
8. On **Connect**, paste the `postgresql://` connection string into **Connection URL**. For Supabase, use the **Session pooler** string.
9. Click **Connect**. Or click **Enter details manually** and fill in the fields. See the reference below.
10. On **Test and prepare**, click **Test connection**. Wait for the check mark.
11. Click **Prepare security database**. SecureGraph creates its schema and tables.
12. Click **Done**. During first-run setup, the button reads **Back to your Quick Scan**.

![Allowlist SecureGraph's IPs](../../screenshots/platform/db-allowlist.png)

### Database on a private network

1. Open **Security database**, then click **Connect database**.
2. On **Where is your database?**, select **On a private network**.
3. On **Create a connector**, enter a name for the place it runs, for example `Lagos data centre`. Click **Create connector**.
4. Or select a connector you already have.
5. On **Install**, copy the Docker, Docker Compose or Kubernetes command, and run it next to the database. See [14-install-connector.md](./14-install-connector.md).
6. Wait for **Online**. The page updates by itself.
7. Click **Add the database**.
8. Enter the host and port as the connector reaches them, for example `10.0.3.12` and `5432`, and the other fields.
9. Click **Save connection**.
10. On **Test and prepare**, click **Test connection**, then **Prepare security database**, then **Done**.

### Finish a database you saved earlier

A saved database that is not prepared changes the page action to **Finish setup**. Click it to open **Test and prepare** for that database. Click **Connect a different database instead** to start again.

**Result:** The page reads **Bootstrap gate: ready**, and scans, VAPT and saved findings are unblocked. The page then lists the connections, the connectors and the drivers, and **Add another connection** adds a config inspection database.

### When the allowlist is out of date

SecureGraph can add an outbound address after you confirmed the allowlist. The database then refuses connections from the new address. Platform shows **Your database allowlist is out of date** on the **Security database** page and on the **Dashboard**.

1. Open **Security database**.
2. Click **Update the allowlist**. The addresses you confirmed before are already ticked.
3. Add each new address to the allowlist of the database, then tick it.
4. Click **Confirm the allowlist**. The warning goes away.

---

## Reference

### Journey steps

| Path | Steps |
| --- | --- |
| Publicly hosted | Where is it? → Choose the provider → Allowlist our IPs → Connect → Test and prepare |
| Private network | Where is it? → Create a connector → Install it → Wait for Online → Add the database → Test and prepare |

### Connection fields

| Field | Values | Notes |
| --- | --- | --- |
| Name | Text | Required. The hint shows `SecureGraph Store`. |
| Host | Hostname or IP address | Through a connector: the address as the connector reaches it. |
| Port | Number | Required. The hint shows `5432`. |
| Database | Text | Required. The hint shows `phantix_security`. |
| Target schema | Text | Empty means `phantix`. |
| Username and password | Text | Platform stores the password encrypted and never shows it again. |
| SSL mode | `prefer`, `require`, `disable` | Use `require` for a hosted database. |
| Environment | `production`, `staging`, `development` | Default: `production`. |

### Test and prepare

| Step | What happens |
| --- | --- |
| Test the connection | SecureGraph connects with the details you entered. |
| Prepare the security database | SecureGraph creates its own schema. It never touches your other tables. |
| Ready | Scans, VAPT and findings can use the database now. |

A test often prepares the schema in the same call. The second step then completes by itself.

### Allowlist addresses

| Provider | Where to add the addresses |
| --- | --- |
| Neon | Project **Settings** → **Network security** → **IP Allow**. IP Allow is part of the paid plans. |
| Supabase | **Project Settings** → **Database** → **Network Restrictions**. Add each address as a `/32` range. |
| Other PostgreSQL | The firewall, security group or network rules in front of the database. If PostgreSQL filters clients in `pg_hba.conf`, allow the same addresses there. |

Platform shows the addresses only to signed-in organizations. The addresses accept no inbound traffic. SecureGraph connects from these addresses, so its own test cannot prove that other addresses are refused. The ticks are your confirmation.

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
| **Continue to add the database** stays locked | An address is not ticked | Add every address to the allowlist, then tick each one. |
| "We couldn't load the addresses to allowlist" | Platform could not read the address list | Click **Try again**. The step does not continue without the list. |
| "Our addresses changed" | The address list changed while the page was open | Check the updated list and tick each address again. |
| The test times out | A firewall blocks the port, or the host is wrong | Check the host and port. For a hosted database, allowlist every SecureGraph address. |
| Authentication fails | The username or the password is wrong | Check the credentials, then update the connection. |
| "Your database allowlist is out of date" | SecureGraph added an address after your last confirmation | Click **Update the allowlist**, add the new address, and confirm. |
| The connector stays on **Waiting for the connector to come online** | The connector is not running, or cannot reach SecureGraph on port 443 | Start the connector. Allow outbound HTTPS from its host. |
| "The connector refused this database" | The host and port are not in `SG_ALLOWED_TARGETS` | Add `host:port` to `SG_ALLOWED_TARGETS` exactly, then restart the connector. |
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
