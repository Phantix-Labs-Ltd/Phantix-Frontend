# SOC telemetry & detection — frontend handoff

**For:** the frontend implementation agent (Claude)
**Scope:** the SecureGraph SOC upgrade (phases 0–6): privacy-preserving event
storage, detection packs, continuous monitoring & alerting (CMA), cloud
configuration changes, and the CI/CD monitoring surface.
**Status of the backend:** shipped. The CI/CD page is already built — use it as
the reference pattern and match it exactly.

> **Rule #1 — uniformity.** Do not invent layout, spacing, tokens or components.
> Every new page must use the existing primitives (`PageHeader`, `Card`,
> `StatCard`, `Modal`, `Tabs`, `Pagination`/`usePaged`, `useResource`,
> `EmptyState`, `ErrorState`, `PageSkeleton`, `SecurityDbBanner`, `DocLink`,
> `SeverityBadge`, `StatusBadge`, `toast`). If a page looks different from the
> others, it is wrong.

---

## 0. Reference implementation (copy this pattern)

| Concern | Reference file |
|---|---|
| A settings/list page | `apps/securegraph-code/src/pages/CiCd.tsx` |
| The data/contract module | `packages/sg-shared/src/cicdOps.ts` |
| Popup from a realtime event | `packages/sg-shared/src/components/AgiNotifications.tsx` (handles `cicd_scan_triggered`) |
| Nav + route wiring | `apps/securegraph-code/src/{nav.tsx,App.tsx}` |
| List + pagination + filters | `packages/sg-shared/src/pages/Tracker.tsx` |

Every domain gets **one `*Ops.ts` module** in `packages/sg-shared/src/` that is the
single source of truth for its paths and types. Pages import from it; pages never
call `api.*` directly for these domains.

---

## 1. Shared conventions

- **Data loading:** `const { data, loading, error, reload, setData } = useResource(loader, initial, "cache-key")`.
  Cached resources auto-revalidate on the org live stream (already implemented in
  `useResource`), so most pages need no manual SSE wiring.
- **Lists:** paginate with `Pagination {...pagination} itemLabel="…"` and
  `usePaged(items, "storage-key")`.
- **Actions:** optimistic `setData` then `reload()`; on failure restore and
  `toast("error", …)`.
- **States:** always render `PageSkeleton` while first-loading, `ErrorState` on
  failure, `EmptyState` when the list is empty.
- **Security-DB gating:** wrap pages that read the org security DB in
  `SecurityDbBanner` and handle `isSecurityDbBlocked(err)` → a banner, not an error.
- **Severity/status:** use `SeverityBadge` and `StatusBadge` with the shared
  severity tokens; do not hardcode colours.

---

## 2. Surfaces to build

### 2.1 Continuous Monitoring & Alerting — **Defend**, route `/security-alerts`

The primary new surface. Nav label **“Security alerts”**, icon `ShieldAlert`.

- **Summary tiles:** open by severity, total open, **MTTA**, **MTTR**, SLA breaches.
- **Table columns:** severity, rule title, entity (type + pseudonym/id), source
  (rule_source), state, occurrences, first seen, last seen, SLA (ack/resolve by).
- **Filters:** `state` (open | acknowledged | escalated | resolved | false_positive),
  `severity`, free-text on rule title.
- **Row actions:** Acknowledge, Escalate, Resolve, Mark false-positive (all
  optimistic + toast).

```
GET  /api/v1/soc/alerts?state=&severity=&limit=100
     -> { items: CiAlert[], total }
GET  /api/v1/soc/alerts/summary
     -> { byState: {open: n, …}, openBySeverity: {critical: n, …}, mttaSeconds, mttrSeconds }
GET  /api/v1/soc/alerts/sla-breaches
     -> { items: CiAlert[], total }
POST /api/v1/soc/alerts/{alert_id}/{action}   # acknowledge | escalate | resolve | false-positive
     -> CiAlert
```

`CiAlert` (mirror exactly): `id, signal_id, rule_title, rule_source, rule_version,
severity, entity_type, entity_id, mitre_technique, state, dedup_key,
occurrence_count, evidence, first_seen_at, last_seen_at, acknowledged_at,
acknowledged_by, time_to_acknowledge_seconds, escalated_at, resolved_at,
time_to_resolve_seconds, sla_ack_by, sla_resolve_by, soc_detection_id, created_at,
updated_at`.

Realtime: reload on `securityAlertRaised` and `securityAlertUpdated`.

### 2.2 Detection packs — **Defend**, under SOC/Detection, route `/detection-packs`

- Show the **platform pack** (read-only: id, version, rule count, owner
  `securegraph`) and the org's **vendor packs** (upload/delete).
- Upload: a `Modal` with name, version, and a textarea (or `.yml` file) for Sigma
  YAML. On `422`, show the validation errors returned in `detail`.
- Show a small note when `pysigma` is false (“reference validation unavailable”).

```
GET    /api/v1/soc/packs
       -> { platform: {pack_id, version, rule_count, owned_by}, vendor: CiPack[], pysigma: bool }
POST   /api/v1/soc/packs    body { pack_id?, name, version, rules_yaml }  -> CiPack
DELETE /api/v1/soc/packs/{pack_row_id}   -> 204
```

`CiPack`: `id, pack_id, name, version, rule_count, enabled, created_at`.

### 2.3 Cloud configuration changes — **Defend**, under Cloud, route `/cloud-config`

- **Changes** table: control id, change type (added | changed | removed),
  previous → new value, severity, detected at.
- **Snapshots** (secondary tab): provider, captured at, control count, posture hash.
- A **“Run sweep now”** action per connection.

```
GET  /api/v1/soc/cloud-config/changes?limit=100   -> { items: CloudChange[], total }
GET  /api/v1/soc/cloud-config/snapshots?limit=50  -> { items: CloudSnapshot[], total }
POST /api/v1/soc/cloud-config/connections/{connection_id}/sweep -> { snapshot_id, changes, alerts_opened, unchanged }
```

### 2.4 Log retention & privacy — **Defend**, under SOC, route `/log-retention`

- **Policy form:** `raw_enabled` (toggle, default off), `raw_ttl_days`,
  `event_ttl_days`, `residency_region` (default `ng`, display as a fixed label +
  a warning if not `ng`).
- **Events** viewer (read-only, minimised): time, type, severity, host pseudonym,
  message; filters q/severity/log_type; **no raw** is ever shown here.
- **Erase subject:** a guarded `Modal` requiring an explicit confirm checkbox
  (`confirm: true`); explain it is irreversible and deletes events + raw blobs.

```
GET /api/v1/soc/log-retention            -> LogRetention
PUT /api/v1/soc/log-retention            body { raw_enabled?, raw_ttl_days?, event_ttl_days?, residency_region? } -> LogRetention
GET /api/v1/soc/events?q=&severity=&log_type=&limit=100 -> { items: SocEvent[], total }
POST /api/v1/soc/logs/erase              body { pseudonym? | subject?+pseudonym_key?, confirm: true }
                                         -> { events_erased, objects_erased }
```

### 2.5 CI/CD monitoring — **Code**, route `/cicd` (already built)

Verify it still matches `cicdOps.ts` and that the popup fires on
`ciScanTriggered`. Align any status labels with the page's `STATUS_STYLE` map
(`scan_queued`, `duplicate`, `no_rule`, `disabled`, `throttled`, `failed`).

---

## 3. New shared module to create

Create **`packages/sg-shared/src/socOps.ts`** with:

- Types: `CiAlert`, `CiPack`, `CloudChange`, `CloudSnapshot`, `LogRetention`, `SocEvent`.
- Loaders/actions mirroring §2 (each with a demo-mode branch, like `cicdOps.ts`).
- Small helpers: `ALERT_STATES`, `severity` labels, `stateBadgeTone(state)`.

Add demo fixtures (like `cicdOps.ts` does) so the UI renders in demo mode.

---

## 4. Nav & routes

| App | Route | Nav group | Label |
|---|---|---|---|
| Defend | `/security-alerts` | SOC | Security alerts |
| Defend | `/detection-packs` | SOC | Detection packs |
| Defend | `/cloud-config` | Cloud | Config changes |
| Defend | `/log-retention` | SOC | Log retention |
| Code | `/cicd` | Build | CI/CD monitoring *(exists)* |

Wire each with `React.lazy` + a `<Route>` in the app's `App.tsx`, exactly as
`CiCd` is wired.

---

## 5. Realtime events

Subscribe via `useSseStream("/org/command-center/stream", { onEvent })` (or rely
on `useResource`'s automatic revalidation for cached resources).

| Event | Meaning | FE action |
|---|---|---|
| `securityAlertRaised` | a new alert opened | reload alerts; optional toast |
| `securityAlertUpdated` | an alert saw another occurrence | reload alerts |
| `ciScanTriggered` | CI/CD push/deploy started a scan | popup + reload trigger history |
| `notificationCreated` | durable inbox item | bell (already) |

---

## 6. Definition of done

- [ ] Each page uses the shared primitives and looks indistinguishable in style
      from `CiCd.tsx` / `Tracker.tsx`.
- [ ] `*Ops.ts` is the only place that knows the API paths/types for the domain.
- [ ] Loading / empty / error / security-DB-blocked states handled.
- [ ] Pagination on every list; filters drive the URL (like Tracker).
- [ ] Actions are optimistic, toast, and revert on failure.
- [ ] Erase requires explicit confirm; raw is never displayed.
- [ ] Realtime reload works for alerts and CI/CD.
- [ ] `npm run typecheck` clean for **core, attack, defend, code**.
- [ ] No new design-system primitives, no hardcoded colours.

## 7. Backend references

- Deployment/runbook: `Phantix Backend/deploy/08-soc-privacy-telemetry-deploy.md`.
- Route sources: `app/engines/soc_engine/api/{detection,events}.py`,
  `app/engines/asset_engine/api/cicd.py`.
- Research/plan: `docs/03-engines/17-…` (CMA), `docs/03-engines/18-…` (plan).
