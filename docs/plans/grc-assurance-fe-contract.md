# Core → Assurance: frontend status

Built 2026-10-03 against the backend handoff
`Phantix Backend/docs/08-frontend/05-grc-assurance-frontend-handoff.md`
(contract: `app/engines/compliance_engine/schemas/audit.py`). Assurance pages
call only `/compliance/audits/*` from Core (boundary rule, handoff §3.4).

Code: `packages/sg-shared/src/assurance.ts` (types, calls, demo data) and
`apps/securegraph-core/src/pages/assurance/*`.

## Built (handoff milestones)

| Handoff | Where |
|---|---|
| §3.1 `/assurance` | `Engagements.tsx`: overall opinion, KPIs, engagement table, controls at risk with source chips and "2+ sources", one `GET /intelligence` + list; no auto-poll (server cache ~30s), manual refresh; empty state → applicable programme cards + country prompt |
| §3.2 `/assurance/new` | `New.tsx`: programme (grouped by type, `applicable=true`, `?program=`, `?framework=`) → details (period validation) → scope → team |
| §3.3 workspace | `Workspace.tsx`: stage control from `next_statuses` (primary + menu); tabs Overview (team add/remove, cross-audit), Scope (add/toggle/remove), Evidence (PBC board, generate, submit evidence IDs, accept / send back / waive), Testing (record test, reviewer sign-off; auditee and self-review blocked with an explanation), Findings (by severity, management response / accept risk, retest → auto-close, raise), Readiness (gauge with "not enough tested", per framework), Workpapers (Markdown, prepared → reviewed → signed off; preparer can't review), Reports (generate + publish, versions, cross-audit summary) |
| §3.4 `/assurance/regimes` | `Regimes.tsx`: `/regimes` + `/profile` aliases, source shown, country override preview and save |
| §3.5 `/assurance/monitoring` | summary cards, table + detail, drift → findings, manual upsert |
| §3.6 `/assurance/reports` | aggregated per engagement, filters by type and opinion |
| §3.7 Report Solutions | featured row is catalog-driven; no change needed |
| §3.8 Findings tracker | "Audit" badge and source filter (`source_store = compliance_audit`) |
| §3.9 Defend `/compliance` | "Start an audit against this" on each framework; `?tab=` deep link |

Server 400s (separation of duties, invalid transitions) render inline next to
the action, not only as toasts. Every mutation passes `requireDualControl`.

## Not built

- **M5 staff consoles** (handoff §1.2 staff endpoints, §3.9 staff "Audit
  programmes" tab): staff work in the staff portal, a separate repo.
- **Evidence upload from Core**: the audit API takes `evidence_ids` only; files
  are uploaded in Defend's evidence library (`/compliance`, Defend-only). A
  Core-safe `/compliance/audits/evidence` alias would let auditees upload in place.
- **Risk register link back** (§3.8 second bullet): the risk register page isn't
  in the apps yet.
- **Aggregate reports endpoint** (§10): `/assurance/reports` makes one call per
  engagement until it exists.
- **Permission-aware hiding** (`compliance.audit` / `compliance.manage`): actions
  show for everyone and the server answers 403, shown inline.
