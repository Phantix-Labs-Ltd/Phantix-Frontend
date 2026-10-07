# What CloudComply does, and how it folds into SecureGraph

**Source:** 7 screenshots in `C:\Users\USER\Downloads\Cloudcomply` (a deployed app at
`d3emo8mpk2h6st.cloudfront.net`, titled *"CloudComply: NDPA Assessor"*).
**Compared against:** SecureGraph backend (`/home/phantom/Phantix Backend`, WSL) and
frontend (`apps/securegraph-defend`, `apps/securegraph-code`).

This document is (1) a deduction of CloudComply from the images, (2) an honest
match/exceed/gap scorecard against SecureGraph as it stands today, and (3) the
integration plan, mapped to real files.

---

## 1. What CloudComply does — deduced from the images

CloudComply is a single-purpose **Nigeria Data Protection Act 2023 (NDPA) cloud
compliance assessor**. It bolts a fixed NDPA questionnaire onto a Checkov IaC
scan and reports both as one "assessment".

### 1.1 Product shape (image 1, 4)

Three nav groups, one product:

| Group | Pages |
|---|---|
| Workspace | Console, New assessment, Report lookup, My assessments |
| Infrastructure | IaC scans, GitHub connect |
| — | API health badge + signed-in org/user/role in the header |

- `Console` (image 1) — "Run a new assessment" (choose services, answer
  questions, receive scored report) + "Retrieve a previous report" by
  **assessment UUID**.
- `My assessments` (image 4) — history: `ASSESSMENT` (UUID), `SUBMITTED`,
  `STATUS`, `SCORE`, `VERSION`, `Open →`. One row per run. A status filter.
- `IaC scans` (image 5) — history: `SCAN`, `REPOSITORY`, `BRANCH/PATH`, `TOOL`,
  `STATUS`, `FINDINGS` (severity chip strip), `CREATED`, `Open →`, plus status
  tabs (All / Queued / In progress / Completed / Failed).
- `GitHub connect` — repo onboarding for the scanner.

### 1.2 The assessment instrument (image 1)

> *"Question bank compiled for the NDPA 2023 self-assessment — **97 questions
> across 8 control categories · 5 services**"*

Per-service coverage card:

| Service | Name | Questions | Critical | Weighting |
|---|---|---|---|---|
| **EC2** | Elastic Compute | 28 | 8 | critical-weighted |
| **S3** | Simple Storage | 21 | 6 | critical-weighted |
| **RDS** | Relational Database | 22 | 8 | critical-weighted |
| **SQS** | Simple Queue | 13 | 3 | critical-weighted |
| **SNS** | Simple Notification | 11 | 3 | critical-weighted |

Key mechanic: **you only answer for the services you actually operate.** "Choose
the AWS services you operate; only their control questions are evaluated."

### 1.3 The question sheet (image 2)

Every question is a row with:

- **Severity tag** — `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` (colour-coded).
- **Control category + NDPA section citation** — e.g.
  `Access Control & Network Perimeter Boundary · Section 39(1)(b)`.
- **Status dropdown per question** — `Open` / `In progress` / `Resolved`.
- **The question** — concrete and checkable, not abstract. Examples:
  - *"Are EC2 Security Groups configured to block unrestricted administrative
    SSH (Port 22) and RDP (Port 3389) from 0.0.0.0/0?"* — CRITICAL
  - *"Do backend EC2 application instances restrict inbound traffic strictly by
    referencing upstream Load Balancer Security Groups?"* — HIGH
  - *"Is Instance Metadata Service Version 2 (IMDSv2) enforced on all running
    EC2 instances to prevent SSRF credential theft?"* — HIGH
  - *"Is the CloudWatch Unified Agent installed on EC2 nodes to stream OS system
    logs continuously?"* — HIGH
  - *"Do Data Lifecycle Manager (DLM) policies explicitly define a maximum
    count/age limit for historical EBS backups?"* — LOW
  - *"Are public endpoints (ALB/CloudFront) protected by AWS Shield for
    automatic network layer DDoS mitigation?"* — LOW
- **`REMEDIATION:` line** — a one-line prescriptive fix, sometimes with the exact
  CLI (`aws ec2 modify-instance-metadata-options`) or console path
  (`DLM Policy Schedule → Set retain count/period`).

So each question carries: **severity, NDPA section, service, category, status,
and remediation** — a self-contained finding, not a survey item.

### 1.4 The report (image 3)

- **Score + band**: `MEDIUM risk` — `72` overall compliance score.
  Explicit thresholds: **low ≥ 85 · medium 60–84 · high < 60**.
- **NDPC capping** — *"no NDPC cap applied"*; the regime can cap a score.
- **Record metadata**: assessment UUID, organisation UUID, submitted time,
  `RECORD: COMPLETED · v1`.
- **Questionnaire stats**: `Questions evaluated`, `Compliant`, `Findings: 8`.
- **Executive summary** (AI-generated prose) that reads the score out and then
  walks **domain by domain**:
  - Data Resilience, Backups & Business Continuity — **100%**
  - Compliance Governance, Drift Detection & Auditing Frameworks — **100%**
  - Vulnerability Assessment, Threat Management & Edge Security — **91%**
  - Data Minimization, Retention & Lifecycle Management — **75%**
  - Secrets Management, Identity Vaulting & Cryptographic Governance — **71%**
  - Data Encryption at Rest & In Transit — **67%**
  - Access Control & Network Perimeter Boundary — **46%**
  - Audit Logging, Traceability & Non-Repudiation — **33%**
- It then **maps every failure to a statutory obligation** ("obligations under
  Sections 39(1)(a), 39(1)(b), 39(1)(c), and 34(1)(d) of the NDPA") and names
  the evidence ("the absence of KMS encryption on custom AMIs and EBS
  snapshots contravenes Section 39(1)(a)").
- It explicitly acknowledges compensating controls / risk acceptance
  ("operational trade-offs around legacy image pipelines are acknowledged") and
  states the legal standard still applies.

### 1.5 The IaC scan (images 5, 6, 7)

- **Tool: Checkov**, scanning connected GitHub repositories on a branch.
- **Scan history** rows: repository (`DSTIXX05/cloudComply_testRepo`), branch
  (`main`), tool (`checkov`), status (`Completed` / `Failed`), findings chips
  (CRITICAL / HIGH / MEDIUM / LOW counts), created timestamp.
- **Scan detail** (image 6): repo + branch header, status block
  (`id`, `created`, `started`, `finished`), then a four/five-card severity roll-up
  (`22 FINDINGS · 0 CRITICAL · 0 HIGH · 22 MEDIUM · 0 LOW`), then an
  **AI executive summary** that interprets the distribution ("the uniform
  concentration of findings at the MEDIUM tier reflects systemic gaps in
  defence-in-depth controls rather than isolated defects… would not yet satisfy
  the technical and organisational measures expected under NDPA 2023 without
  remediation"), then notes the findings replicate across both the root template
  and the `Depth` duplicate, and clusters them into NDPA-relevant themes.
- **Findings table** (image 7): `RULE` (`CKV_AWS_18`, `CKV_AWS_53`, `CKV_AWS_54`,
  `CKV_AWS_55`, `CKV_AWS_56`, `CKV_AWS_21`, `CKV_AWS_16`), `RESOURCE`
  (`AWS::S3::Bucket.MarketingBucket…`, `AWS::RDS::DBInstance.LegacyDB…`),
  `FILE:LINE` (`cloudcomply-test-stack.yaml:8`), `SEVERITY`, `MESSAGE`,
  `REMEDIATION` (editable dropdown: `Open` / `In progress` / `Resolved`).
  Note the note: *"scans themselves are immutable audit records."*

### 1.6 One-paragraph summary

CloudComply = **a fixed, service-scoped NDPA 2023 questionnaire (97 questions,
8 categories, 5 AWS services, per-question severity + statutory section +
remediation status), scored to a 3-band risk model with NDPC capping, plus a
Checkov IaC scan of connected repos, both narrated by an AI executive summary
that ties every weakness back to a numbered NDPA section.** It is deliberately
narrow: NDPA only, AWS only, two evidence sources, no multi-framework GRC, no
audit workflow, no drift monitoring.

---

## 2. Scorecard — does SecureGraph already match and exceed this?

Short answer: **on the GRC and platform layer, SecureGraph already exceeds
CloudComply significantly. On the three things CloudComply is actually good at —
NDPA instrument depth, AWS config-check depth, and a real IaC engine — SecureGraph
currently falls short.**

### 2.1 Where SecureGraph already exceeds

| Capability | CloudComply | SecureGraph | Verdict |
|---|---|---|---|
| Risk bands | 3 (low/medium/high: ≥85 / 60–84 / <60) | 5 (`attestation_score.py:79-85`: mature ≥85, strong ≥70, moderate ≥50, developing ≥25, critical) | **Exceeds** |
| Scoring weights | "critical-weighted" per service | `_RISK_WEIGHT` critical 4.0 / high 3.0 / medium 2.0 / low 1.0, `na` excluded from denominator, **worst-answer-wins across users** (`attestation_score.py:62-111`) | **Exceeds** |
| Framework library | NDPA only | 35 seeded frameworks / 265 controls (`seed/frameworks/`), incl. NDPA 2023, NDPC GAID 2025, NDPC DPCO, NDPR, ISO 27001, SOC 2, PCI DSS, GDPR, POPIA, Kenya DPA, CBN/NITDA/NIBSS | **Exceeds** |
| Jurisdiction inference | manual | `jurisdiction.py derive_jurisdictions()` from business profile | **Exceeds** |
| Attestation integrity | single answerer | `ComplianceAnswererSession` requires declared role/title; multi-user answers with per-answer attribution | **Exceeds** |
| Cross-check self-attestation vs reality | none — questionnaire and scan are separate reports | `assessment_merge.py:48-87` downgrades a self-attested "yes" to a **gap** when posture evidence contradicts it | **Exceeds** |
| Audit / assurance workflow | none | Full GRC platform: engagements, scope, team, evidence requests (PBC), control tests (design/operating), findings, retest, workpapers, versioned reports with opinion, continuous monitoring | **Exceeds** |
| Report provenance | v1, UUID | Versioned reports with `readiness_score`, `opinion`, `artifact_refs`, regulator report type | **Exceeds** |
| Cloud config drift | none | `cloud_config_monitoring.py` — posture snapshots, hash, diff, `cloud_config_changes`, CMA alerts | **Exceeds** |
| Multi-cloud | AWS only | AWS + Azure + GCP + Kubernetes check catalogs (`cloud_security/readonly/checks.py`) | **Exceeds** |
| Read-only credential safety | not evidenced | STS AssumeRole + mandatory ExternalId + per-check `allowed_api_calls` allowlist + read-only verb assertion (`readonly/aws.py`, `checks.py:265-279`) | **Exceeds** |
| AI narration | executive summary per report/scan | AI explain per finding, AI autofix PRs, AGI console, hallucination flagging | **Exceeds** |
| Change control | not evidenced | Dual-control on destructive actions | **Exceeds** |

### 2.2 Where SecureGraph only matches

| Capability | Notes |
|---|---|
| NDPA 2023 framework present | `seed/frameworks/ndpa_2023.json` — but only **10 controls, 3 rules**. |
| Questionnaire engine | `compliance_questionnaire_questions` supports `category`, `risk`, `help_text`, `answer_type`, `source_controls`, `is_expert_managed`, `sort_order` — structurally equivalent, and better governed. |
| Question-level severity | `risk` field, same four levels. |
| AI executive summary | `reporting_engine` / `audit_report_service.py`. |
| Assessment history with score | `/compliance` assessments table. |
| Cloud connector registry | `cloud_connectors` + `/cloud-security/connectors`. |

### 2.3 Where SecureGraph falls short

**Gap A — NDPA instrument depth.**
SecureGraph's NDPA framework is 10 controls and 3 keyword rules. NDPA-tagged
questions exist but are scattered (~46 in `fintech_ng_audit_questions.json`, 5 in
`sector_audit_questions.json`). There is **no 97-question, 8-category,
5-service instrument**, no per-service decomposition, no per-service critical
counts, no service-selection gate, and no NDPC score capping. CloudComply's
questions are also far more *concrete* ("block unrestricted SSH/RDP from
0.0.0.0/0", "IMDSv2 enforced") than a generic GRC prompt.

**Gap B — AWS config-check depth.**
`cloud_security/readonly/checks.py SERVICE_CHECKS` has **8 checks**:
`s3-public-access-block`, `s3-default-encryption`, `iam-root-mfa`,
`iam-stale-access-keys`, `ec2-public-instances`, `rds-public-accessible`,
`rds-unencrypted`, `kms-rotation-disabled`.
CloudComply's question set implies roughly **25+ AWS checks** the inventory could
already satisfy — the gap is coverage, not plumbing:
security groups open on 22/3389 · SG-to-SG ALB referencing · IMDSv2 · CloudWatch
Unified Agent · S3 public ACL · S3 public policy · S3 ignore-public-acls · S3
restrict-public-buckets · S3 versioning · S3 access logging · S3 lifecycle · RDS
storage encryption · EBS snapshot encryption · custom AMI encryption · DLM
lifecycle policy · SQS encryption · SNS encryption · CloudTrail multi-region ·
GuardDuty · AWS Config · WAF attachment · Shield.
`readonly/aws.py inventory()` already enumerates `…kms, sns, sqs, secretsmanager,
ssm`, so **SQS and SNS are already reachable — they simply have no checks.**

**Gap C — No real IaC engine.**
IaC in SecureGraph is **pure Python regex**: `code_layers.py::_IAC_RULES`
(11 patterns) and a second set in `code_static_analysis.py`. There is **no
Checkov, tfsec, Terrascan or KICS** anywhere; **no `CKV_*` rule IDs exist in the
repo**; there is no `resource` concept (only `path`/`start_line`). IaC is
explicitly *not* a shipped layer: `code_layers.py:49`
`SHIPPED_LAYERS = {SAST, SCA, SECRETS}` — IAC and PIPELINE are declared in the
`CodeLayer` enum but unshipped. `DOCKER_IMAGE_ALLOWLIST`
(`yaml_scan_executor.py:403-414`) contains only trivy, gitleaks, semgrep,
kube-bench, dockle. There is no `scans/iac/` directory. One finding is emitted
per rule per file (`break` at `code_layers.py:276`).

**Gap D — GitHub Actions / deployment config is regex-only, and CI/CD has no findings UI.**
`_PIPELINE_RULES` (`code_layers.py:170-201`) covers `pull_request_target`, script
injection, `write-all`, unpinned actions, `curl | sh` — good signal, but no
structured workflow parsing, no permission-scope diffing, no OIDC/trust-policy
analysis, no environment-protection analysis, and again not a shipped layer.
The `/cicd` page (`apps/securegraph-code`) is connections + watch rules + trigger
history only — `CiCdEvent` has **no severity/rule/finding fields**; it merely
enqueues a branch review.

**Gap E — Cloud/IaC evidence does not prove NDPA controls.**
`CheckSpec.frameworks` exists but only carries `SOC2`/`NDPR`/`ISO27001` — **never
`NDPA`**. `code_review_findings` findings carry no NDPA control mapping. So the
merge engine in `assessment_merge.py` has nothing cloud-shaped to merge for NDPA:
a self-attested "yes, my S3 buckets are private" can't be contradicted by a CSPM
result because the CSPM result isn't mapped to an NDPA control. This is the single
highest-leverage gap, because the machinery to consume it **already exists**.

**Gap F — No per-question remediation status.**
CloudComply tracks `Open / In progress / Resolved` on every question and every
IaC finding. SecureGraph's questionnaire answers are
`yes | partial | no | na | <free text>` only; `ComplianceAuditFinding` has a
status but that's a different object. So the "8 findings" workflow in
CloudComply image 3 has no direct equivalent on the questionnaire side.

**Gap G — No "scan detail" view with severity roll-up + AI exec summary.**
`code_review_findings` are grouped by file in the Code app's Security-review tab.
There is no per-scan page showing repo/branch, the four-card severity roll-up,
timestamps, an AI executive summary, and a flat rule/resource/file:line table —
i.e. CloudComply image 6 has no SecureGraph counterpart.

### 2.4 Verdict

> SecureGraph is a **superset platform** that is currently **missing the
> CloudComply content and the IaC engine**. Everything CloudComply does, SecureGraph
> has a place to put — and in most cases a better one. The work is depth and
> wiring, not architecture.

---

## 3. How to utilise this in SecureGraph

Three workstreams, ordered by leverage. Each maps onto existing modules.

### Workstream 1 — NDPA cloud self-assessment instrument (closes A, F, and the report half of G)

**Backend**

1. **Deepen the NDPA framework.**
   `app/engines/compliance_engine/seed/frameworks/ndpa_2023.json` — grow from 10
   controls to cover NDPA ss.24–46 at the granularity CloudComply uses
   (access control, logging/traceability, minimisation/retention, vulnerability
   & edge security, encryption at rest/in transit, secrets & crypto governance,
   resilience/backup/BCP, governance & drift auditing). Keep the existing
   section IDs; add sub-controls (`NDPA-39-1-a` style) so the instrument can cite
   `Section 39(1)(a)` exactly as CloudComply does.
   Add a `cloud_service` tag to each control (`ec2|s3|rds|sqs|sns|null`).

2. **Add a dedicated instrument.**
   New `seed/questionnaires/ndpa_cloud_self_assessment.json`, same shape as
   `fintech_ng_audit_questions.json` (which `seed_loader.load_questionnaire_seeds`
   already ingests). Reuse the proven fields; add two:
   - `service`: `ec2|s3|rds|sqs|sns`
   - `remediation`: the one-line prescriptive fix
   Target ~97 questions, 8 categories, 5 services, with the per-service critical
   counts from image 1 (EC2 28/8, S3 21/6, RDS 22/8, SQS 13/3, SNS 11/3).
   Keep questions **checkable** — port CloudComply's level of specificity, not
   generic GRC wording.

3. **Schema.** Add nullable `service` and `remediation` columns to
   `compliance_questionnaire_questions` (`u1b2c3d4e5f6_compliance_questionnaire.py`
   is the precedent; new alembic revision). Add a per-answer
   `answer_status` (`open|in_progress|resolved`) to
   `compliance_questionnaire_answers` for Gap F. Both are additive and
   backwards-compatible; `is_expert_managed` protects curated rows from rebuild.

4. **Service selection gate.** Reuse `ComplianceAnswererSession` (or add a
   lightweight `scope_services JSON` to it) so a run declares which of the 5
   services the org operates, and `GET /compliance/questionnaire/questions`
   filters to those services. The business profile already has `cloud_providers`
   to pre-fill this.

5. **Scoring + NDPC cap.** `attestation_score.py` already produces the weighted
   0–100 score and 5 bands — strictly better than CloudComply's 3. Add:
   `ndpc_cap` support (a configured maximum) and a per-service / per-category
   breakdown so the report can render the domain table from image 3. Do **not**
   regress to 3 bands.

6. **Report.** Reuse `reporting_engine` + `audit_report_service.py`. Add an
   NDPA report template that reproduces image 3: score + band + thresholds,
   cap note, questionnaire stats, domain breakdown, and an AI executive summary
   prompted to cite NDPA sections per failure. This is content on top of
   machinery that already ships versioning and opinions.

**Frontend** (`apps/securegraph-defend`)

7. Add an **"NDPA assessment"** surface under the existing `Compliance` nav
   group in `apps/securegraph-defend/src/nav.tsx:55-64`, plus routes in
   `App.tsx` alongside the existing `/compliance/*` blocks.
   Reuse `ComplianceQuestionnaire.tsx` (853 lines, already production-grade:
   role-declaration gate, keyboard shortcuts, section navigator, optimistic
   saves) rather than rebuilding. Extend `QuestionnaireQuestion`
   (`packages/sg-shared/src/complianceGrc.ts:37-52`) with `service`,
   `remediation`, `answer_status`, and render:
   - a coverage card ("what this instrument evaluates": services × questions ×
     criticals) mirroring image 1,
   - per-question severity tag + `Section 39(1)(b)` citation + status dropdown +
     `REMEDIATION:` line, mirroring image 2,
   - an assessment-history table with score + risk band + version, mirroring
     image 4.
   The existing `/compliance` Frameworks page already renders assessments and
   control results — add the band and version columns there.

### Workstream 2 — AWS cloud configuration depth + NDPA evidence wiring (closes B and E)

**Highest leverage: E.** Do this even if nothing else.

1. **Tag every check with NDPA.**
   In `cloud_security/readonly/checks.py`, add `NDPA` (and the specific control,
   e.g. `NDPA-34`) to each `CheckSpec.frameworks` tuple. The field already
   exists; it is simply never populated with NDPA. Example mapping:
   - `s3-public-access-block`, `s3-public-acl`, `s3-public-policy` → NDPA-34 / s.39(1)(b)
   - `rds-unencrypted`, `ebs-snapshot-encrypted`, `ami-encrypted` → NDPA-34 / s.39(1)(a)
   - `iam-root-mfa`, `iam-stale-access-keys` → NDPA-34 / s.39(1)(c)
   - `ec2-security-group-open-admin` → NDPA-34 / s.39(1)(b)
   - `cloudtrail-multi-region`, `config-enabled` → NDPA-34 / s.39(1)(c) and NDPA-42

2. **Broaden `SERVICE_CHECKS`.** Add the ~17 checks listed in Gap B. `inventory()`
   in `readonly/aws.py:111-139` already reaches the services, so most are a spec
   plus an evaluator branch. Add the matching YAML packs beside
   `scans/cloud/aws/aws_s3_public_buckets.yaml` (`aws_sg_open.yaml` and
   `aws_iam_mfa.yaml` already exist — extend that pattern to
   `aws_ec2_imdsv2.yaml`, `aws_s3_account_public_access.yaml`,
   `aws_rds_encryption.yaml`, `aws_sqs_sns_encryption.yaml`,
   `aws_logging_baseline.yaml`, `aws_backup_lifecycle.yaml`).

3. **Wire CSPM → compliance evidence.**
   `compliance_engine/adapters/aws/connector.py` is currently an IAM+S3 scaffold
   that explicitly does not enable live collection. Replace its sample checks with
   a call into the cloud-security readonly evaluator, emit `NormalizedEvidence`
   per control, and let `evidence_collector.py` + `rule_evaluator.py` persist to
   `compliance_evidence`. Then `assessment_merge.py` does the rest: a self-attested
   NDPA-34 "yes" gets downgraded to `gap` when the CSPM proves a public bucket.
   **This is the capability CloudComply does not have.**

4. **Severity alignment.** `cloud_config_monitoring._BAD_VALUES` already drives
   drift severity; make sure the new checks feed it so drift on an NDPA-tagged
   check opens a correctly-severitied alert.

### Workstream 3 — Real IaC + GitHub Actions scanning (closes C, D, and the scan half of G)

1. **Add Checkov as a containerised tool.**
   Add `bridgecrew/checkov:latest` to `DOCKER_IMAGE_ALLOWLIST`
   (`yaml_scan_executor.py:403-414`). Follow the existing execution contract:
   read-only, non-root, no network egress except where required, scanned code
   never executed.

2. **Ship the IAC and PIPELINE layers.**
   Add `CodeLayer.IAC` and `CodeLayer.PIPELINE` to `SHIPPED_LAYERS`
   (`code_layers.py:49`) and implement `_run_iac_layer()` on top of
   `tool_executor.run_docker_tool`, replacing the regex-only `_IAC_RULES` path
   (keep the regexes as a fast offline fallback, not the primary engine).
   Normalise Checkov output to the existing `code_review_findings` contract:
   `rule_id` = `CKV_AWS_*`, `path`, `start_line`, `severity`, `title`,
   `why`/`fix_guidance` via `code_guidance.guidance_for`.
   Fix the `break` at `code_layers.py:276` so multiple findings per file survive.

3. **Add a `resource` field.**
   CloudComply shows `AWS::S3::Bucket.MarketingBucket…`. `code_review_findings`
   has `detail JSONB` but no first-class `resource`. Promote it to a column
   (alembic) so the findings table can render and filter by resource, and so the
   NDPA control mapping can key off it.

4. **Structured GitHub Actions scanning.**
   With Checkov's `--framework github_actions` (and `--framework kubernetes`,
   `--framework cloudformation`, `--framework terraform`, `--framework
   dockerfile`, `--framework secrets`) a single container call covers IaC *and*
   the deployment-config / workflow cases you named. Keep the existing regex
   pipeline rules as the diff-aware fast path for PR comments.

5. **Map IaC rules → NDPA.**
   Add a Checkov-ID→control mapping beside `compliance_mappings`, or extend the
   existing `ndpa_security` keyword rule (which already matches `leak|expos|breach|
   plaintext|unencrypted|misconfigur` — Checkov messages match this well). Then an
   IaC finding proves an NDPA control the same way a CSPM result does, and the
   gap analysis (`ComplianceGaps.tsx`, already the most complete GRC page and
   already carrying NDPA/NDPR stakes language) renders it without new UI.

6. **Scan-history + scan-detail UI** (Gap G), in `apps/securegraph-code`:
   - Add findings roll-up to `/cicd` by giving `CiCdEvent`
     (`packages/sg-shared/src/cicdOps.ts:72-86`) `severity_counts` + `scan_job_id`
     linkage — the `scan_job_id` field already exists.
   - Add a `/code-review/scans` history page mirroring image 5 (repo, branch,
     tool, status, severity chips, created) and a `/code-review/scans/:id` detail
     page mirroring image 6 (header + timestamps + severity cards + AI exec
     summary + flat rule/resource/file:line table with a per-finding remediation
     dropdown mirroring image 7).
   - The backend data already exists in `scan_jobs` / `scan_results` /
     `code_review_findings`; this is mostly a read API + two pages.

---

## 4. What to build first

If only one thing gets built, build **Workstream 2, step 1–3** (tag the cloud
checks with NDPA and wire CSPM into compliance evidence). It is small, it makes
the merge engine in `assessment_merge.py` finally do something for cloud, and it
produces a capability CloudComply does not have: *self-attestation that is
automatically contradicted by machine evidence.*

Then **Workstream 1** (the 97-question NDPA instrument + report), because that is
the visible product CloudComply sells.

Then **Workstream 3** (Checkov), which is the largest and most infrastructure-heavy.

---

## 5. Deliberate non-goals

- **Do not** copy CloudComply's 3-band risk model. SecureGraph's 5-band
  `attestation_score` is finer-grained; keep it.
- **Do not** copy the "97 questions are the product" framing. In SecureGraph the
  questionnaire is one evidence source feeding a multi-framework gap engine.
- **Do not** build a separate NDPA-only app. It belongs in `securegraph-defend`
  under the existing Compliance group, and the IaC side in `securegraph-code`.
- **Do not** enable live cloud credential collection without the existing
  read-only guarantees (STS AssumeRole + mandatory ExternalId + per-check
  `allowed_api_calls` allowlist).

---

## 6. Implementation status

Built and tested. Backend verified with `pytest` (**173 passing** across the
compliance, questionnaire, cloud-posture, IaC and scan-history suites);
frontend verified with `tsc --noEmit` on `securegraph-defend`,
`securegraph-code` and `securegraph-attack`, plus a full `vite build` of
`securegraph-code`.

### WS2 — cloud configuration evidence for NDPA ✅

| Change | Where |
|---|---|
| `CheckSpec.control_refs` — every check binds to concrete `(framework, control_id)` pairs, emitted as `evidence.control_refs` | `scanner_engine/cloud_security/readonly/checks.py` |
| AWS catalogue grown **8 → 43 checks** across 15 services (S3 exposure/encryption/logging/retention, IAM identity, EC2 network/IMDSv2/monitoring/EBS/AMI, RDS, SQS, SNS, KMS, Secrets Manager, CloudTrail, GuardDuty, Config, Backup, DLM, WAF, Shield) | same |
| `evaluate_checks(snapshot)` — deterministic, evidence-gated evaluator (never invents an absence finding from a partial inventory) | `readonly/aws.py` |
| `collect_snapshot(session)` — live read-only collector (all List/Get/Describe) | `readonly/aws.py` |
| AWS compliance connector rewritten: rolls findings up to **one row per control**, prefers an explicit severity so a medium gap stays `partial` | `compliance_engine/adapters/aws/connector.py` |
| **`map_findings` honours an explicit `(framework, control_id)` binding** — machine evidence now proves or contradicts a named control without keyword guessing; `mapping_basis: "explicit_control_binding"` | `compliance_engine/services/mapping_service.py` |
| `evidence_as_finding_signals` prefers a connector-declared severity | `compliance_engine/services/evidence_service.py` |
| 16 AWS cloud packs under `scans/cloud/aws/`, dispatched to the snapshot evaluator with **per-service filtering** | `scanner_engine/scans/cloud/aws/`, `yaml_scan_executor._cloud_check_stub` |
| Tests | `tests/test_aws_compliance_connector.py` (13), `tests/test_compliance_engine.py` (+3) |

The payoff: a self-attested *"yes, my S3 buckets are private"* is now
automatically downgraded to a **gap** when the CSPM proves otherwise —
`assessment_merge.py` finally has cloud evidence to merge.

### WS1 — NDPA assessment mechanics ✅

The questionnaire already existed, so this is the mechanism, not new questions.

| Change | Where |
|---|---|
| `service` + `remediation` on questions; `answer_status` (`open\|in_progress\|resolved`) on answers | models + alembic `a3f1c7d9e2b4` (idempotent, tested) |
| **Three score views**: 5-band `compliance_level`, regulator-facing 3-band `risk_band` (low ≥85 / medium 60–84 / high <60), and **NDPC capping** with `uncapped_score` preserved | `services/attestation_score.py` |
| Per-**category** and per-**service** score breakdown, worst-first | same |
| Service scoping: `?services=ec2,s3` on questions + progress; unscoped controls always apply | `questionnaire_service`, `api/compliance.py` |
| Expert admin can author `service`/`remediation` | `admin_compliance.py`, `questionnaire_service` |
| Frontend: service-scope picker, per-question service chip + `REMEDIATION` line + remediation-status control, risk-band header with NDPC-cap badge, and by-service / by-domain breakdown bars | `apps/securegraph-defend/src/pages/ComplianceQuestionnaire.tsx` |
| Typed contracts | `packages/sg-shared/src/complianceGrc.ts` |
| Tests | `tests/test_attestation_score.py` (17), `tests/test_questionnaire_service_scope_migration.py` (2) |

### WS3 — real IaC + GitHub Actions scanning ✅ (backend)

| Change | Where |
|---|---|
| IaC and pipeline layers now run **Checkov** (`bridgecrew/checkov:latest`, added to the scanner image allow-list); the regex rules remain the offline fallback | `services/code_layers.py`, `yaml_scan_executor.py` |
| `parse_checkov_output` — multi-framework JSON parsing to `CKV_*` rule ids, repo-relative paths, `file_line_range`, and **resource address** | `services/code_layers.py` |
| Rule → control bindings: `CKV_AWS_*` / `CKV_GHA_*` resolve to NDPA / ISO 27001 / SOC 2 / NDPR controls, by exact id then keyword | `services/iac_controls.py` |
| `rule_id` + `resource` promoted out of free-form evidence; both persist through the existing `detail` JSONB (no security-schema migration needed) | `code_layers.normalize_layer_finding`, `asset_engine/services/code_finding_service.py` |
| Frontend: rule-id chip and cloud-resource line on each finding | `packages/sg-shared/src/components/CodeReview.tsx`, `codeOps.ts` |
| Tests | `tests/test_iac_checkov.py` (18) |

The fallback is deliberately conservative: an empty or non-JSON Checkov run
returns "could not scan" and falls through to the regex rules, so a missing
image can never be reported as a clean repository.

### 6.1 Questionnaire wiring (confirmed — not redesigned)

The existing questionnaire was **extended in place**. No route, page, endpoint or
contract was renamed, moved or rebuilt.

| Frontend | Backend |
|---|---|
| `apps/securegraph-defend/src/App.tsx` `/compliance/questionnaire`, gated `defend.compliance_questionnaire` | — |
| `nav.tsx` "Compliance → Questionnaire" | — |
| `packages/sg-shared/src/complianceGrc.ts` → `${API_BASE}/compliance/...`, `API_BASE = "/api/v1"` (`config.ts`) | mounted at `settings.API_V1_STR + "/compliance"` in `compliance_engine/api/routes.py` |
| `POST /compliance/questionnaire/session` | `@router.post("/questionnaire/session")` → `questionnaire_service.start_answerer_session` |
| `GET /compliance/questionnaire/questions` | `@router.get("/questionnaire/questions")` → `list_questions_for_org` |
| `GET /compliance/questionnaire/progress` | `@router.get("/questionnaire/progress")` → `progress_for_org` |
| `PUT /compliance/questionnaire/answers` | `@router.put("/questionnaire/answers")` → `submit_answer` |
| `GET /compliance/questionnaire/answers` | `@router.get("/questionnaire/answers")` → `list_answers_audit` |
| `POST /compliance/questionnaire/rebuild?force=true` | `@router.post("/questionnaire/rebuild")` |

Full path example: `/api/v1/compliance/questionnaire/questions`. Every pair
matches. Changes were **additive only**: optional `?frameworks=` / `?services=`
params, three new optional columns, new response fields, and in-page UI (scope
picker, service chip, `REMEDIATION` line, status control, breakdown card).

### WS3 frontend — scan history and scan detail ✅

| Change | Where |
|---|---|
| `GET /github/code/scans` (severity roll-up per run) and `GET /github/code/scans/{job_id}` (run + its findings) | `asset_engine/api/code_review.py`, `asset_engine/services/code_finding_service.py` |
| Routes declared before `/code-review/:section` so the tab router does not swallow them | `apps/securegraph-code/src/App.tsx` |
| **Scan history**: status filter chips, stat cards, repository / branch / tool / status / severity-chip table | `apps/securegraph-code/src/pages/ScanHistory.tsx` |
| **Scan detail**: run metadata (id / created / started / finished), five severity cards, flat rule · resource · file:line · severity · message table | `apps/securegraph-code/src/pages/ScanDetail.tsx` |
| Contracts, demo fixtures and the sidebar "Scans" entry | `codeOps.ts`, `demo-data.ts`, `nav.tsx` |
| Tests | `tests/test_code_scan_history.py` (7) |

Remediation status is **not** editable on the scan pages: it belongs to the
finding and is owned by the review workflow. A scan run is an immutable audit
record.

### NDPA report template ✅

| Change | Where |
|---|---|
| `build_ndpa_scorecard` — score, uncapped score, risk band + thresholds, NDPC cap note, compliance level, questionnaire stats, domain table, service table, statutory findings cited as `s.34`, and a derived narrative | `compliance_engine/services/ndpa_report.py` |
| Control → statute citation map, tolerating sub-controls (`NDPA-34-1` → `s.34`) | same |
| `GET /compliance/ndpa/scorecard` — assembled from questionnaire progress **plus** cloud/IaC evidence, so CSPM findings that contradict self-attestation surface as statutory findings | `compliance_engine/api/compliance.py` |
| Compliance report sections now carry `ndpa_scorecard` when NDPA is in scope | `compliance_engine/services/report_sections.py` |
| Tests | `tests/test_ndpa_report.py` (10) |

The narrative is **derived from the numbers, not generated by an LLM**. The AI
layer enriches a report; it does not invent one.

### Still not built

- **The 97-question NDPA cloud instrument content.** The mechanism is complete
  end to end (`service`, `remediation`, `answer_status`, service scoping, scoring,
  scorecard). The questions are intentionally not authored here: the questionnaire
  is already owned by GRC, and the expert-managed admin path
  (`POST /admin/compliance/questionnaire/questions`, now accepting `service` and
  `remediation`) exists to load them.
- **A per-finding remediation dropdown on the scan detail page** (CloudComply
  image 7). The finding status model currently supports
  `open`/`fixed`/`dismissed`; broadening it to a three-state remediation workflow
  is a separate change to the finding lifecycle.

---

## 7. Overwatch and reuse pass

Two things were done after the feature work: Overwatch was taught about the new
capability, and every duplicated component the new code introduced was folded back
onto the existing one.

### 7.1 Overwatch

Overwatch is the staff portal's tenant-free watch over the whole deployment. It has
three contractual properties (holds nothing, carries no tenant data, read-only) and
its dark-component ids must match the topology node ids so the map colours the exact
node. Both were respected.

| Change | Where |
|---|---|
| `dynamic_dark()` now reports the scanner toolchain as dark when the host has no container runtime — "Checkov, Semgrep, Trivy, Gitleaks and Dockle cannot run; IaC/pipeline fall back to in-process regex detectors and cloud packs are held". A **live probe**, not a static claim: it appears only when `tool_executor.docker_available()` is false. | `operations_engine/services/overwatch_service.py` |
| New inventory unit `scanner-tools` (core boundary, runner) covering the allow-listed scanner images, with edges from `worker-scans` (scan packs) and `worker-ai` (repo-analysis code layers). Marked **`verified: false`** — it is code-derived, not staging-probed, matching how the inventory already flags unverified edges. | `staging-system-map/inventory.json` |
| `overwatchTopology.ts` regenerated via the existing generator (never hand-edited): `boundaries=13 units=113 edges=167`. | `staging-system-map/tools/gen-overwatch-topology.cjs` → `staff-portal/src/lib/overwatchTopology.ts` |
| Tests: dark-without-docker, not-dark-with-docker, and a failing probe degrades instead of raising. | `tests/test_overwatch.py` (+2) |

Deliberately **not** changed: the verified endpoint counts on `eng-scanner` /
`eng-compliance` / `eng-asset`. Those numbers come from a live staging
`/status` probe at discovery time; my code is not deployed there, so rewriting
them would turn a measured fact into an assertion.

### 7.2 Reuse — duplicates removed, not added

| Was duplicated | Now |
|---|---|
| `resourceOf()` written twice (review card + scan detail) | one export in `codeOps.ts`, imported by both |
| Severity chip strip written twice (review header + scan-history table) | one `components/SeverityCounts.tsx`, used by both; the review header's inline block was replaced by it |
| `SEVERITY_ORDER` redeclared in two new pages | imported from the existing `charts/palette.ts` |
| Severity cell styling hand-rolled in scan detail | existing `SeverityBadge` from `@sg/ui` |
| Severity tones hand-rolled as ternaries | existing `severityMeta` from `@sg/utils` |
| `_finding()` builder copied into **five** cloud providers (`checks`, `aws`, `azure`, `gcp`, `k8s`) | one `checks.finding_payload(...)`; all five delegate to it — verified byte-for-byte equivalent output |
| `_SEVERITIES` tuple re-listed in the scan-history service | derived from the existing `SEVERITY_ORDER` |

The provider consolidation is a pre-existing duplication that the AWS work would
have extended to a fifth copy; collapsing it means a new evidence field (such as
`control_refs`) now reaches every provider at once.

### 7.3 Verification after this pass

- **184 backend tests pass**, including `test_overwatch.py` (15) and
  `test_engines_architecture.py` (10).
- `tsc --noEmit` clean on **code, defend, attack and staff-portal**.
- `vite build` of `securegraph-code` succeeds.

