# Command Centre: Remediation queue

**Where:** **Test** → **Remediation** (`/remediation`)
**What:** The fix queue for findings that are verified and ready to repair. Each row carries the fix guidance, the affected asset and where the finding came from.
**Who:** Any operator. A fix-guidance generate action writes to the security database.
**Before you start:** A finding is verified. Only verified findings reach this queue.

![Remediation](../../screenshots/app/remediation.png)

---

## Before you start

- A finding is verified. Only verified findings reach the queue.
- The security database is connected. The queue reads the feed from it.
- The finding is not retested and fixed yet. A confirmed fix leaves the queue.

---

## Process flow

![Command Centre: Remediation queue process flow](../../diagrams/how-to-command-centre-33-remediation.svg)

---

## Steps

1. Open **Remediation**.
2. Read the three chips: the open count, the count with AI guidance and the count that awaits generation.
3. Read the queue from the highest severity down.
4. Open a row to read the reason for verification, the reproducibility steps and the business impact.
5. Select **Generate AI fix guidance** on a row. Generation runs as a background job, and the page polls until the guidance lands.
6. Read the guidance: the summary, the ordered steps, the references and the validation.
7. Give the row an owner before you leave it.
8. Apply the fix on the asset.
9. Retest the finding. A fix that is not retested stays open.
10. If the queue is empty, every verified finding is either fixed or accepted.
11. If the queue says it is unavailable, check the security database connection.

---

## Reference

### Statuses (do not invent others)

| Status | Meaning |
| --- | --- |
| open | Not started |
| in_progress | Being fixed |
| fixed | Fix confirmed by a retest |
| accepted | Risk accepted on purpose |
| retest_failed | The fix did not hold |
| regressed | Was fixed; seen again |

### Queue columns

| Column | Shows |
| --- | --- |
| **Finding** | The title of the finding |
| **Severity** | The severity |
| **Verification** | The verification status |
| **Asset** | The asset value |
| **Tool** | The tool that produced the finding |
| **Priority** | `immediate`, `scheduled` or `planned` |
| **Effort** | The estimated effort |
| **Found** | The discovery time |
| **Fix guidance** | The generate action and the guidance drawer |

### Guidance fields

| Field | Shows |
| --- | --- |
| `status` | `generated` when the guidance landed |
| Summary | The short description of the fix |
| Steps | The ordered fix steps |
| References | Source references |
| Validation | How to confirm the fix |
| `effort` | The estimated effort |
| `priority` | The priority |
| `generated_by` | The generator |
| `model` | The model that produced the guidance |
| `confidence` | The confidence value |

### Generation behavior

Generation is asynchronous. The request queues a job, and a fresh generate flips the status to `generated`. A regenerate changes the artifact. A finding leaves the page only after a retest confirms the fix. AutoFix holds the same rule: only verified findings reach it, so an unverified heuristic can never open a pull request.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| The queue is empty | Every verified finding is fixed or accepted | No action. New verified findings appear here |
| **Remediation queue unavailable** appears | The feed failed | Check the security database connection, then select **Refresh** |
| A row says "awaiting generation" for a long time | The generation job did not complete | Open the row and generate the guidance again |
| The guidance never appears | The job failed | Read the error line above the table and retry |
| A row disappears from the queue | The finding is retested and confirmed fixed | No action |
| The page shows a demo queue | The demo mode flag is set | Sign in to the live organization |
| A status reads `retest_failed` | The fix did not hold | Fix the weakness again and retest |
| A status reads `regressed` | The fixed finding returned | Reopen the work and fix the root cause |
| The row shows no asset value | The finding has no asset link | Open the finding and check the asset |

---

## Related

- [30-findings-intake.md](./30-findings-intake.md)
- [12-findings-tracker.md](./12-findings-tracker.md)
- [09-manage-risks.md](./09-manage-risks.md)
- [21-code-security.md](./21-code-security.md)
