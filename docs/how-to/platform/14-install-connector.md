# Platform: Install the SecureGraph Connector

**Where:** **Security database** → `/connections` → **On a private network** → **Connectors**
**What:** Installs a small agent next to a database on a private network. The agent connects out to SecureGraph, so you open no inbound port.
**Who:** The admin of the organization, and a person who can run containers next to the database.
**Before you start:** A host or cluster that reaches the database, outbound HTTPS on port 443, and Docker, Docker Compose or Kubernetes.

![Install the SecureGraph Connector](../../screenshots/platform/connector-install.png)

---

## Before you start

- The connector is for a database that has no public endpoint. A hosted database such as Neon or Supabase does not need one.
- The connector needs outbound HTTPS (port 443) to SecureGraph. It needs no inbound port, firewall rule or public IP address.
- The connector connects only to the addresses in `SG_ALLOWED_TARGETS`. SecureGraph cannot change this list.
- An enrollment token works once and expires after 15 minutes.
- The connector keeps its key and certificate in a volume. The private key never leaves the host.
- Connectors support PostgreSQL databases today.
- One admin creates and revokes connectors. Platform audits every connector event.

---

## Process flow

![Platform: Install the SecureGraph Connector process flow](../../diagrams/how-to-platform-14-install-connector.svg)

---

## Steps

1. Open **Security database**.
2. Under **Where is your database?**, select **On a private network**.
3. In **Connectors**, click **Add connector**.
4. Enter a name for the place it runs, for example `Lagos data centre`. Click **Create connector**.
5. In **Enter your database address**, type the host and port, for example `10.0.3.12:5432`.
6. Select the installation method: **Docker**, **Docker Compose**, or **Kubernetes**.
7. Click **Copy**. The command holds your enrollment token and the database address.
8. Run the command on the host, or apply the manifest to the cluster.
9. Wait for **Connected**. The window updates by itself. The list then shows **Online**.
10. Click **Add the database**. Platform opens the connection form with this connector selected.
11. Enter the same host and port, and the database credentials. Click **Save connection**.
12. Click **Test connection**, then **Prepare security database**.

**Result:** The connector reads **Online**, and the security database reads **ready** through it.

---

## Reference

### Installation commands

Docker:

```
docker run -d --name securegraph-connector --restart unless-stopped \
  -v securegraph-connector:/var/lib/sg-connector \
  -e SG_API_URL=https://api.phantixlabs.com \
  -e SG_ENROLLMENT_TOKEN=<enrollment-token> \
  -e SG_ALLOWED_TARGETS=<database-host>:5432 \
  ghcr.io/phantix-labs-ltd/sg-connector:1
```

Docker Compose:

```
services:
  securegraph-connector:
    image: ghcr.io/phantix-labs-ltd/sg-connector:1
    restart: unless-stopped
    environment:
      SG_API_URL: https://api.phantixlabs.com
      SG_ENROLLMENT_TOKEN: <enrollment-token>
      SG_ALLOWED_TARGETS: <database-host>:5432
    volumes:
      - securegraph-connector:/var/lib/sg-connector

volumes:
  securegraph-connector:
```

Kubernetes: Platform shows a Secret, a persistent volume claim and a Deployment with one replica. Save it as `securegraph-connector.yaml`, then run `kubectl apply -n <namespace> -f securegraph-connector.yaml`.

### Settings

| Setting | Required | Meaning |
| --- | --- | --- |
| `SG_ENROLLMENT_TOKEN` | First start only | The single-use token from Platform. |
| `SG_ALLOWED_TARGETS` | Yes | Comma-separated `host:port` pairs the connector may reach. |
| `SG_API_URL` | No | Default: `https://api.phantixlabs.com`. |
| `SG_STATE_DIR` | No | Default: `/var/lib/sg-connector`. Keep it on a volume. |
| `HTTPS_PROXY` | No | An outbound proxy, for example `http://proxy:3128`. |

### Connector states

| State | Meaning |
| --- | --- |
| **Waiting to start** | The connector is created and has not enrolled yet. |
| **Online** | The connector holds a session with SecureGraph. |
| **Offline** | The connector enrolled, and its session is closed. |
| **Revoked** | SecureGraph refuses the connector. Create a new one to reconnect. |

### Security

| Control | Detail |
| --- | --- |
| Direction | The connector connects out on port 443. Nothing connects in. |
| Encryption | Transport Layer Security (TLS) 1.3, with a certificate on each side. |
| Identity | A certificate for this connector only, renewed every 24 hours. |
| Allow list | Only the addresses in `SG_ALLOWED_TARGETS`, set on your host. |
| Revocation | **Revoke** ends the session within one minute. |
| Audit | Platform records create, enrollment, online, offline, renewal and revocation. |

### A database on the same host as Docker

Inside a container, `127.0.0.1` is the container itself. Use `host.docker.internal:5432` in `SG_ALLOWED_TARGETS`, or run the container with `--network host`.

### Least privilege

Run this as an administrator on the database, then use the credentials in Platform:

```
CREATE ROLE phantix_writer LOGIN PASSWORD '<strong-password>';
CREATE SCHEMA IF NOT EXISTS phantix AUTHORIZATION phantix_writer;
```

### Update, revoke and uninstall

| Task | Action |
| --- | --- |
| Update | Pull the new image and create the container again. Keep the volume. |
| Revoke | Click the bin icon on the connector in **Connectors**. |
| New token | Click **Setup token** on a connector that is not online. The old unused token stops working. |
| Uninstall | Revoke it, then run `docker rm -f securegraph-connector` and `docker volume rm securegraph-connector`. |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| The connector stays **Waiting to start** | The token was used before, or is older than 15 minutes | Click **Setup token**, then start the connector with the new token. |
| "not enrolled yet: set SG_ENROLLMENT_TOKEN" in the log | The first start has no token | Add `SG_ENROLLMENT_TOKEN` to the command. |
| The connector shows **Offline** | It cannot reach SecureGraph on port 443 | Allow outbound HTTPS from the host, or set `HTTPS_PROXY`. |
| "The connector refused this database" | The host and port are not in `SG_ALLOWED_TARGETS` | Add them exactly, then restart the connector. |
| "Cannot reach the target from the connector" | No TCP path from the connector to the database | Check the address, the database listen address and the firewall between them. |
| "connector was revoked" in the log | Platform revoked this connector | Create a new connector and install it. |

---

## Related

- Next step: [06-connect-security-database.md](./06-connect-security-database.md)
- [07-connect-config-database.md](./07-connect-config-database.md)
- [Platform how-tos](./README.md)
