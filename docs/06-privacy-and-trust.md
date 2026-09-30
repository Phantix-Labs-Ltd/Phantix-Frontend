# Privacy, trust and security model

---

## Headline

**Your security data stays yours.**

Phantix runs the orchestration, identity, billing and tooling. The **record of your posture** is designed to live in a **dedicated security database under your control**. That record holds assets, scans, findings, risks and investigation detail. It is not a shared multi-tenant dump of everyone’s vulnerabilities.

---

## Two databases, one clear boundary

| Phantix platform | Your security database |
|------------------|------------------------|
| Organization, users, roles | Assets and inventory |
| Billing and entitlements | Scan results and findings |
| Dual-control and audit metadata | Risks and treatments |
| Tooling catalog | Compliance evidence store |
| Support tickets (ops) | Report source data |

**Never the default:** Phantix treating your production ERP/CRM as an open scanning playground without scope and authorization.

---

## Principles

1. **Least privilege**: integrations request only the access needed (e.g. GitHub App: repository contents read, not write).
2. **No long-lived secrets when avoidable**: GitHub App uses short-lived installation tokens; PATs are legacy.
3. **Ephemeral analysis**: repository analysis clones into temporary workspaces that are destroyed; AI sees findings, not full source.
4. **Verification before reputation**: unverified noise is not dressed up as confirmed executive risk.
5. **Dual-control**: high-impact actions can require more than one person.
6. **AI data care**: raw tenant security content is not freely shipped to external LLMs by default. Local or minimized paths are preferred. Logging and customer approval are required where escalation is needed (aligned with privacy laws such as Nigeria’s **NDPA**).
7. **Skills without leakage**: reusable AI playbooks are anonymized before any platform-level sharing of patterns.

---

## Trust for first-contact organizations

When you evaluate Phantix:

- Ask to see the **privacy model** diagram (this page).
- Ask how **reports** treat unverified findings.
- Ask who can run **sensitive** tests and whether approvals are enforced.
- Ask where **backups** of your security DB live (you or your infra provider).

We will answer plainly, including what is still maturing.

---

## Compliance posture

Phantix helps you **map and evidence** controls (frameworks such as ISO-oriented, PCI-oriented, SOC 2–oriented packs as available).

Phantix is a **platform** to run your program; it is not a substitute for your legal certification process. We help you prepare and track. Auditors still audit.

---

## Incident and access ethics

Authorized testing only. You define scope. You are responsible for the rights to test the targets you connect. Phantix provides the controls; you provide legitimate authorization.
