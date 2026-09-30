# Platform: Connect a config inspection database

**Where:** **Security Database** → `/connections`
**What:** Registers an optional database for configuration and posture inspection: roles, privileges, and policies. This connection is not the findings store. A config inspection connection reads security metadata only, never business rows.
**Who:** The primary user of the organization.
**Before you start:** The security data storage connection is ready, and a read-only database account is available.

![Connections](../../screenshots/platform/connections.png)

---

## Before you start

- The primary security data storage connection exists. See the previous task.
- A read-only account or a read replica is available for the target database.
- The network path from the Platform backend to the host and port is open.
- The purpose value is `config_inspection`.
- Dual control is assigned. Platform refuses connection changes without it.
- The connection stays optional. It does not replace the security store.

---

## Process flow

![Platform: Connect a config inspection database process flow](../../diagrams/how-to-platform-07-connect-config-database.svg)

---

## Steps

1. Identify the database to inspect. Prefer a read replica or a dedicated account.
2. Grant the account read access only, where the database supports it.
3. Sign in to Platform and select **Security Database**.
4. Click **Add connection**.
5. Enter the name of the connection.
6. Select the purpose **Config inspection**. The value is `config_inspection`.
7. Select the engine: `postgresql`, `mysql`, `mssql`, or `mongodb`.
8. Enter the host, the port, the database name, and the target schema.
9. Enter the read-only username and the password.
10. Select the Secure Sockets Layer (SSL) mode that the host requires.
11. Click **Save connection**.
12. Click **Test**. Wait for the message "Connectivity OK".
13. Confirm the security data storage connection still holds the **primary** label.
14. Open the inspection feature or the evidence connector that uses this connection.

**Result:** An inspection connection is available for posture evidence. The findings store stays unchanged.

Do not mark this connection as primary. Keep the security data storage connection primary for Command Centre data. The connection does not need a bootstrap.

---

## Reference

### How this differs from security storage

| Aspect | Security data storage | Config inspection |
| --- | --- | --- |
| Holds | Assets, findings, risks, SOC, and tracker data | Read-oriented configuration and privilege views |
| Bootstrap | The full Phantix security schema | Lighter, with an inspection focus |
| Required | Yes, for the product modules | Optional |
| Writes | The organization security data lives here | Prefer a least-privilege read |
| Purpose value | `security_data_storage` | `config_inspection` |

### Connection fields

The form uses the same fields as the security connection.

| Field | Allowed values or default | Notes |
| --- | --- | --- |
| Name | Text | A clear label, for example `Production inspection`. |
| Purpose | `config_inspection` | The only value for this task. |
| Engine | `postgresql`, `mysql`, `mssql`, `mongodb` | The live drivers cover PostgreSQL, Supabase, SQLite, MySQL, and MariaDB. |
| Host | Hostname or IP address | Platform resolves a hostname to IPv4 first. |
| Port | Number | The PostgreSQL default is `5432`. |
| Database | Text | The database that holds the configuration views. |
| Target schema | Text | Default: `phantix`. |
| Username | Text | Use a read-only account where one exists. |
| Password | Text | Stored in encrypted form. |
| SSL mode | `prefer`, `require`, `disable` | Default: `prefer`. |
| Environment | `production`, `staging`, `development` | Default: `production`. |

### Safety rules

- Do not use a high-privilege production administrator account when a read-only role exists.
- Do not move the findings store into a production application database.
- Findings stay in the security data storage connection.
- A config inspection connection needs no schema bootstrap.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| The test times out | A firewall or a security group blocks the port, or the host is wrong | Open the path to the host and port, then test again. |
| Authentication fails | The username or the password is wrong | Check the read-only credentials. |
| The inspection feature shows no data | The account lacks read access to the configuration views | Grant read access to the named views, or use a different account. |
| The security connection loses the **primary** label | The new connection arrived as primary | Open the security connection and restore the primary flag. |
| "Audit control required" | Dual control is not assigned | Assign the slots on **People and Control**. |
| A 409 arrives in Command Centre | The security data storage connection lost the bootstrap or the primary state | Confirm the security connection is primary and **ready**. |
| Platform refuses to save the connection | A field value is outside the allowed list | Check the engine, the SSL mode, and the purpose values. |

---

## Related

- Previous: [06-connect-security-database.md](./06-connect-security-database.md)
- [04-assign-dual-control.md](./04-assign-dual-control.md)
- [Command Centre: Posture](../command-centre/22-posture.md)
- [Platform how-tos](./README.md)
