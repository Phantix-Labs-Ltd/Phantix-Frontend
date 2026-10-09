# Security database setup

SecureGraph uses a **hybrid privacy model**:

- **Platform** holds your sign-in, billing and settings.
- **Your security database** holds assets, scans, findings, risks and evidence.

SecureGraph writes only to its own schema in that database. It never reads your business rows, such as customers or orders.

---

## Coming later: SecureGraph-hosted databases

A managed security database that SecureGraph provisions for you is on the roadmap. Until then, connect your own PostgreSQL.

---

## Choose how SecureGraph reaches your database

| Where the database is | How SecureGraph connects | What you do |
|------|------|------|
| Hosted, with a public endpoint (Neon, Supabase, a cloud database) | Directly, over the internet, with TLS | Allowlist the SecureGraph addresses in the provider. |
| On a private network (data centre, office, private cloud subnet) | Through a SecureGraph Connector | Install the connector next to the database. Open no inbound port. |

Platform asks this first: **Security database** → **Where is your database?**

---

## What you need to create

| Item | Recommendation |
|------|----------------|
| Database | A dedicated database, for example `phantix_security`, separate from your application database |
| Schema | `phantix` (used when you leave the field empty) |
| User | A dedicated role with rights only on that database and schema |
| Network | Hosted: allowlist the SecureGraph addresses. Private: a SecureGraph Connector. |
| TLS | `require` for a hosted database |

---

## Hosted databases

### Neon

1. Create a project at [neon.tech](https://neon.tech).
2. On the project dashboard, select **Connect** and copy the connection string.
3. In Platform, open **Security database**, select **Hosted**, then the **Neon** tab.
4. Under **Recommended: only let SecureGraph in**, copy the addresses.
5. In Neon, open **Settings** → **Network security** → **IP Allow**, and add each address. IP Allow is part of the paid plans.
6. Paste the connection string into **Connection URL** and click **Connect**.
7. In the setup window, click **Test connection**, then **Prepare security database**.

### Supabase

1. Create a project at [supabase.com](https://supabase.com) and set a database password.
2. Select **Connect** and copy the **Session pooler** connection string. Put your password in it.
3. In Platform, open **Security database**, select **Hosted**, then the **Supabase** tab.
4. Copy the addresses under **Recommended: only let SecureGraph in**.
5. In Supabase, open **Project Settings** → **Database** → **Network Restrictions**. Add each address as a `/32` range.
6. Paste the connection string and click **Connect**, then complete the setup window.

Use the Session pooler: the direct `db.<project>.supabase.co` host needs IPv6 unless you buy the IPv4 add-on.

### Amazon RDS, DigitalOcean and other managed PostgreSQL

1. Create a PostgreSQL instance, a database and a dedicated user (see the SQL below).
2. If the instance has a public endpoint, allow port `5432` from the SecureGraph addresses in its security group or trusted sources.
3. If the instance is in a private subnet, install a SecureGraph Connector in that network instead.
4. In Platform, click **Enter details manually**, select **Security database**, and enter the details.

### About the SecureGraph addresses

- Platform shows them only to signed-in organizations, on the provider tab.
- They are outbound addresses. They accept no inbound traffic.
- Add all of them. SecureGraph connects from any one of them.

---

## Databases on a private network: the SecureGraph Connector

The connector is a small agent (about 8 MB) that runs next to your database. It connects **out** to SecureGraph over TLS 1.3 on port 443, so you open no inbound port, firewall rule or public IP address.

1. Open **Security database**, select **On a private network**, and click **Add connector**.
2. Enter your database `host:port`. Copy the Docker, Docker Compose or Kubernetes command.
3. Run it on a host or cluster that can reach the database. Wait for **Online**.
4. Click **Add the database**, enter the credentials, then test and prepare it.

| Control | Detail |
|------|------|
| Direction | The connector connects out. Nothing connects in. |
| Allow list | It reaches only the `host:port` pairs in `SG_ALLOWED_TARGETS`, set on your host. SecureGraph cannot change them. |
| Identity | Its private key stays on your host. Its certificate is renewed every 24 hours. |
| Revocation | **Revoke** in Platform ends its session within one minute. |
| Audit | Platform records every connector event. |

Connectors support PostgreSQL today. The full procedure, with troubleshooting, is in [Install the SecureGraph Connector](../how-to/platform/14-install-connector.md).

---

## SQL template (dedicated role)

```sql
CREATE DATABASE phantix_security;

CREATE ROLE phantix_writer LOGIN PASSWORD 'use-a-long-random-password';
GRANT CONNECT ON DATABASE phantix_security TO phantix_writer;

\c phantix_security
CREATE SCHEMA IF NOT EXISTS phantix AUTHORIZATION phantix_writer;
```

SecureGraph creates its tables in the `phantix` schema when it prepares the database.

---

## In Platform

1. Open **Security database** and answer **Where is your database?**
2. Connect with a URL (hosted), or add a connector and then the database (private).
3. To enter every field yourself, click **Enter details manually**. No field is filled in for you.
4. In the setup window, click **Test connection**, then **Prepare security database**.
5. Click **Continue setup** during first-run setup, or **Done**.

The page reads **Bootstrap gate: ready** when the database is prepared.

API equivalents (for advanced users):

| Action | Endpoint |
|--------|----------|
| List connections | `GET /api/v1/db-connections` |
| Create a connection | `POST /api/v1/db-connections` (`network_mode`: `direct` or `connector`, with `connector_id`) |
| Test | `POST /api/v1/db-connections/{id}/test` |
| Prepare (bootstrap) | `POST /api/v1/db-connections/{id}/bootstrap` |
| Primary | `GET /api/v1/db-connections/primary-security-storage` |
| Addresses to allowlist | `GET /api/v1/db-connections/network-access` |
| List connectors | `GET /api/v1/connectors` |
| Create a connector | `POST /api/v1/connectors` (returns a single-use enrollment token) |
| Revoke a connector | `DELETE /api/v1/connectors/{id}` |

---

## Optional: config inspection connection

A separate connection type reads **security metadata** (roles, grants and policies) on a production database, without access to business rows. Use a least-privilege inspector role. It is not required for inventory and scans.

---

## Other engines

PostgreSQL is the security database. Other engines are for config inspection:

| Engine | Notes |
|--------|--------|
| PostgreSQL (including Supabase, Neon and RDS) | Security database and inspection. Direct or through a connector. |
| Microsoft SQL Server | Inspection, direct only |
| MySQL, MariaDB and MongoDB | Inspection with optional drivers, direct only |

---

## Checklist

- [ ] Dedicated database, or a dedicated schema
- [ ] Strong, unique password
- [ ] Hosted: SecureGraph addresses allowlisted. Private: connector **Online**.
- [ ] TLS `require` for a hosted database
- [ ] Test passed
- [ ] Prepared (gate reads **ready**)
- [ ] Backup policy on your side

**Next:** [Email and SMTP →](./03-email-and-smtp.md)
