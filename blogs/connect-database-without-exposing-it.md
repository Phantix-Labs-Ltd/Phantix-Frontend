---
title: "How to Connect a Security Platform to Your Database Without Exposing It"
no: "05"
order: 5
date: "2026-10-09"
kicker: "Architecture"
excerpt: "Keep your database off the public internet. How outbound-only, private connections let a security platform reach it, and controls that protect your data."
featured: false
---

<!--
SEO brief (remove before publishing)
Primary keyword: connect to a database without exposing it to the internet
Secondary: private database connectivity, outbound-only connector, secure database access for SaaS, zero trust database access, database security best practices
Meta title (58 chars): How to Connect a Security Platform to Your Database Safely
Meta description: the excerpt above (153 chars)
Slug: connect-database-without-exposing-it
Internal links: /docs (Security database guide), /pricing, the Proof Before Panic essay
-->

Every security platform eventually asks for the same thing: access to a database. Sometimes it is a place to keep findings and evidence. Sometimes it is a system to inspect for weak roles and missing encryption. Either way, the request makes a careful team pause. Opening your database to the internet so a vendor can reach it is exactly the kind of exposure a security program exists to prevent.

The good news is that you do not have to choose. You can **connect a security platform to your database without exposing it to the internet**. This article explains how, what each option costs you, and the controls you should demand from any vendor that touches your data.

## Why a public database endpoint is a risk

A database with a public IP address and an open port is found within hours. Automated scanners sweep the whole IPv4 range continuously, and database ports such as 5432 (PostgreSQL), 3306 (MySQL) and 1433 (SQL Server) are among the first they try. Once found, the endpoint faces password spraying, attacks on known flaws in the database engine, and denial-of-service attempts.

A strong password and an IP allowlist help, but they are not the same as having no door at all. Allowlists drift, cloud IP ranges are shared with other tenants, and one misconfigured rule can reopen the port to everyone. The safest database is one that accepts no inbound connections from the internet at all.

![Left, a database with port 5432 open to the internet, reached by scanners and a vendor alike. Right, a database with no inbound ports, reached through a connector inside the network that dials out to SecureGraph over TLS](/blog/figures/05-exposed-vs-outbound.svg)

*Figure 1. An exposed endpoint invites anyone who finds it. An outbound-only connector leaves nothing listening on the internet.*

## Five ways to connect without a public endpoint

### 1. An outbound-only connector

A small connector runs inside your network, next to the database. It opens an **outbound** connection to the security platform over mutually authenticated TLS and carries only the queries the platform is allowed to send. Your firewall needs no inbound rule, because the connection starts on your side.

This is the model we recommend for most organizations. It works in a data centre, an office network or a private cloud subnet, and it needs nothing more than outbound HTTPS. You can stop the connector at any time and access ends immediately.

### 2. Cloud private connectivity

If your database runs in AWS, Azure or Google Cloud, private connectivity services such as AWS PrivateLink, Azure Private Link and Google Private Service Connect let two parties connect across the provider's private network. Traffic never crosses the public internet. This suits larger organizations already standardized on one cloud, at the cost of more setup and cloud fees.

### 3. A site-to-site VPN or private mesh

An IPsec tunnel or a WireGuard-based mesh puts the platform's workers on your private network. It is well understood and widely supported, but it usually grants network-level access, so you must restrict it to the database host and port with strict firewall rules.

### 4. An SSH bastion host

A hardened jump host in your network accepts SSH from the platform and forwards traffic to the database. It is simple and familiar. It also adds a server you have to patch and monitor, and the bastion itself becomes an internet-facing endpoint.

### 5. An IP allowlist, as a last resort

If the database must stay publicly routable, allow only the platform's published, fixed outbound IP addresses, require TLS, and close the port to everything else. Treat this as a stopgap until one of the options above is in place.

## How to choose

- **Small team, one database, no cloud networking expertise:** an outbound-only connector.
- **Enterprise on a single cloud provider:** private connectivity, with a connector as the fallback.
- **Existing VPN estate and a network team to manage it:** a site-to-site VPN locked to one host and port.
- **No other option today:** an IP allowlist with TLS required, and a dated plan to replace it.

![The five options ranked from lowest to highest exposure: outbound-only connector, cloud private connectivity, site-to-site VPN, SSH bastion and IP allowlist](/blog/figures/05-connection-options.svg)

*Figure 2. The five options, ranked by what each one opens on your side.*

## The controls that protect your data, whichever path you choose

Private connectivity removes the open door. These controls decide what happens once someone is inside, and they are what you should check in any vendor.

![Six controls: private connection, encryption, least privilege, dedicated schema, admin-only changes, and audit with revocation](/blog/figures/05-data-controls.svg)

*Figure 3. The six controls to ask for before any platform connects to your database.*

### A dedicated database and schema, not your production data

SecureGraph stores findings, assets and evidence in **a database you own and choose**, in its own dedicated schema. It never needs access to your application tables. You can host that database wherever your policies require, and you keep the right to delete it.

### Least privilege by design

Create a database user that owns only the security schema. For configuration inspection, SecureGraph reads security settings such as roles, privileges and policies, and never reads business rows. If an account does not need to write, it should not be able to.

### Encryption in transit and at rest

Require TLS on every connection by setting the SSL mode to `require`, or to `verify-full` where your setup supports it, so credentials and query results are never readable on the wire. SecureGraph stores the credentials you give it encrypted, and never shows them again after you save them.

### Only your admin can change a connection

Adding, changing or removing a database connection is reserved for your organization's admin, and each change is tied to that admin's account. No other user can point SecureGraph at a new database or quietly remove one.

### An audit trail you can export

Every connection change is written to an audit log with who did it and when. That record supports your own reviews and the accountability that the Nigeria Data Protection Act, GDPR and similar laws expect.

### Fast revocation

You stay in control. Revoke the database user, rotate its password or stop the connector, and access ends. A good platform treats this as normal, not as an incident.

## A checklist before you connect any vendor

1. Does the vendor support a connection that needs no inbound port on your side?
2. Can it work with a dedicated database or schema instead of production data?
3. Does it ask for the least privilege it needs, and explain each permission?
4. Is TLS required, and are credentials encrypted at rest?
5. Are connection changes limited to your admins, and logged?
6. Can you revoke access in one step, without the vendor's help?

If any answer is no, ask why before you connect.

## Frequently asked questions

**Can a SaaS platform reach a database on a private network?**
Yes. An outbound-only connector or cloud private connectivity lets it reach the database without any inbound firewall rule or public IP address.

**Is an IP allowlist enough to secure a public database?**
It reduces exposure but does not remove it. Use it with TLS and strong credentials, and only until a private option is in place.

**Does SecureGraph need access to my production data?**
No. It writes to its own schema in a security database you choose. Configuration inspection reads security settings only, not business rows.

**What happens if I want to stop access?**
Disable the database user, rotate its password or stop the connector. Access ends immediately.

## The bottom line

Your database should not be on the public internet, and no security platform should ask you to put it there. Keep the database private, connect from the inside out, grant the least privilege needed, and insist on encryption, approvals and an audit trail. That is how you get the visibility a security platform provides without creating the exposure it is meant to find.

*Ready to connect your security database? Read the [Security database guide](/docs) to get started.*
