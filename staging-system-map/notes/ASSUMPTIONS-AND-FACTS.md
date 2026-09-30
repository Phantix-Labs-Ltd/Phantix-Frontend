# Staging deployment — confirmed facts vs assumptions

Discovered 2026-09-30 against **https://staging.phantix.site** (Cloudflare → Contabo `vmi3493148` /
`169.58.140.217` → Traefik `coolify-proxy` v3.6 → `api:8000`).

Everything below is split into what was **observed** and what is **inferred, modelled, or unknown**.
Nothing in the map is drawn from a stock Multi-Agent RAG template.

---

## 1. Confirmed by direct observation

### Ingress and edge
| Fact | Evidence |
|---|---|
| Public HTTPS terminates at Cloudflare, origin is the Contabo IP directly (no tunnel) | `Server: cloudflare`, `CF-RAY: …-LHR` / `-CDG`; `curl --resolve staging.phantix.site:443:169.58.140.217` returns `Server: uvicorn` |
| Traefik v3.6 fronts the host on 80/443/8080 and routes `Host(staging.phantix.site)` → `api:8000` | container `coolify-proxy`, router labels on the app containers |
| `cloudflared` is **not** running; `~/.cloudflared` and the old tunnel log are stale | `ps` empty; no systemd unit; last tunnel log entry 2026-07-29 |
| `ENABLE_API_DOCS=false` — there is no OpenAPI document | `/openapi.json`, `/docs`, `/redoc` all 404 |

### The core stack (Coolify project `vtm5vs1bjkltpx3atda799cv`, one image tag `a3c8e25c…`)
`api`, `worker-scans`, `worker-vapt`, `worker-alerts`, `worker-reports`, `worker-bus`, `worker-ai`,
`worker-programme`, `beat`, `alert-daemon`, `db`, `redis` — 12 containers, **no `deploy.replicas`
anywhere**, so all multiplicity comes from child-process concurrency.

| Fact | Value | Evidence |
|---|---|---|
| api workers | 2 uvicorn | `UVICORN_WORKERS=2` |
| worker-scans | `-Q scans -c 3` | container command |
| worker-vapt | `-Q vapt -c 2` | container command |
| worker-ai | `-Q ai -c 1` | container command — **single LLM slot for the whole platform** |
| worker-alerts | `-Q alerts -c 2` | container command |
| worker-reports | `-Q reports -c 1 --max-memory-per-child=500000` | container command |
| worker-bus | `-Q bus,celery -c 2` | container command; also drains the default queue |
| worker-programme | `-Q autofix,continuous,integrations -c 2` | container command |
| beat | 1 leader, RedBeat, lock TTL 47 s | `/status` → `beat: Scheduler lock held` |
| alert-daemon | non-Celery loop, `--interval 5`, batch 50 | container command; `/status` heartbeat age 2.2 s |
| celery workers online | **7** | `/status` → `celery_workers.worker_count = 7`, `inspect ping` = 7 OK |
| queues | **10**: `ai alerts autofix bus celery continuous integrations reports scans vapt` | `/status` → `queues`, `queues_by_worker` |
| platform DB | Postgres 16, `db:5432/phantix`, max_connections 150 | `/status` `platform_database` 36 ms |
| Redis | `redis:7-alpine`, one container, ≥9 distinct roles | `/status` `redis` 33 ms; env names |
| migrations | `current=head=7f1a2b3c4d5e`, security schema 2.13.0 | `/status` `migrations` |
| background loops | leader-elected; only 2 boot loops (`sandbox_reaper`, `celery_status_loop`) | `BACKGROUND_LOOP_LEADER_ELECTION=true`, code path |
| superadmin terminal | **enabled in-container**, `MODE=local`, `/bin/bash` | `SUPERADMIN_TERMINAL_ENABLED=true` |

### Engines
13 engines, manifest-registered, all inside the single `api` process (`modular_monolith_13_engines`),
12 `implemented` + `threat_model_engine` `beta`. Route counts are the live tag counts from `/status`:
`control-plane 411 · soc-engine 121 · asset-engine 70 · compliance-engine 52 · reporting-engine 45 ·
vapt-engine 40 · operations-engine 34 · scanner-engine 30 · ai-agent 25 · threat-model-engine 18 ·
audit-engine 14 · risk-engine 14 · alert-engine 13`. 974 routes, 54 modules, 0 missing.

### The AGI runner (separate compose project `phantix-agi`)
| Fact | Value | Evidence |
|---|---|---|
| process | 1 container `phantix-agi-runner`, port 8095, v0.4.0 | `docker ps`, `/health` |
| session state | **in process memory only** — a restart loses every live session | `session_state.py`; no rehydrate path |
| session cap | 4, enforced by the **API**, not the runner | `PHANTIX_AGI_MAX_CONCURRENT_SESSIONS=4`; 429 `agi_global_concurrency` |
| sandbox pool | warm 2 / max 8, acquire timeout 900 s → HTTP 503 | `PHANTIX_AGI_SANDBOX_POOL_*`; 2 live containers observed |
| sandbox isolation | `cap_drop ALL` + `NET_RAW`, pids 512, `network_mode=isolated`, network `phantix-sandbox`, nsjail **off** | `/health` → `sandbox_policy` |
| model path | DeepSeek `deepseek-v4-flash` primary, GLM `glm-5.3-flash` fallback, TypeSafe `jev-latest` gates | `/health`, container env, `_deepseek_*` / `glm_client` |
| subagents | `recon_subagent`, `autofix_subagent`, `pi_subagent` (max 2, provider `zai`), `candidate_verifier`, `exploit_subagent`, 15 named sweepers | code + live transcript roles (`recon-enum`, `disc-http`, `exp-probe`) |
| oversight | wired, but **observe-only**: nothing sets `oversight_enforced` | code grep; 53 `mission_control` frames arrived with no block |
| retrieval | **no vector store, no embedding call, no reranker** | `grep` = 0; `AI_EMBEDDING_ENABLED` unset; no Qdrant |
| knowledge memory | prior-session summaries (`agi_knowledge_summaries`) + a static 12-category gap playbook | `knowledge_keeper.py`, `GET /agi/knowledge` |

### Tooling, MCP and host services
| Fact | Evidence |
|---|---|
| **No MCP server is deployed** | no `mcp` service in any compose file, no systemd unit, no `.mcp.json`, `grep -l mcp` over `services/phantix-agi` = 0 files |
| MCP that does exist is a **client** pointing outbound at tenant endpoints | `agent_platform/mcp_surface.py`, SSRF-guarded, ≤50 tools |
| `BurpMCPAdapter` is inert (`BURP_MCP_ENDPOINT` and `BURP_API_URL` EMPTY) | container env |
| `CaidoMCPAdapter` is disabled (`CAIDO_MCP_ENABLED=false`, `CAIDO_SUSPENDED=true`, `CAIDO_GRAPHQL_URL` EMPTY) | container env |
| Burp Suite Professional **is** running on the host, with Xvfb `:99`, x11vnc `:5901`, noVNC `:6080` | systemd units, listeners |
| `opencode serve` runs on the host at `:4096`; `phantix-opencode-proxy` (socat) bridges containers → `host.docker.internal:4096` | `LISTEN`, systemd, socat command |
| adb on `:5037`; **nothing listening on 4723** although `MOBILE_UI_ENABLED=true` | listeners |
| `whtbin` on `127.0.0.1:18082` — unidentified | listener only |

### Datastores
| Fact | Evidence |
|---|---|
| Second Postgres: container `bench-security-db`, DB **`phantix_security`**, schemas `public` + `phantix` | `docker inspect`, `psql` |
| Reached per-org via a security pool: 1 live pool (org 4), min 1 / max 5 / expire 90 s, credentials encrypted in `customer_db_connections` | `/status` → `security_db_pool` |
| Object storage is a **local volume** (`phantix_storage` → `/app/data`), not S3 | `OBJECT_STORAGE_BACKEND=local`, endpoint/keys EMPTY |
| AGI artifacts are filesystem (`/data/agi-artifacts`), 168 h retention | env, code |
| Elasticsearch is **disabled** | `ELASTICSEARCH_ENABLED=false`, `/status` |
| pgvector exists in the threat-model schema but is **inactive** | `AI_EMBEDDING_ENABLED` unset; no Qdrant |
| Organisation rows | 1 NexaPay · 3 QA Test Company · 4 Phantix Vulnerable Organization · 11 Phantix Funnel · 12 Bifoluwa |

### Model endpoints — keys verified SET on staging
`DeepSeek` (401 = reachable) · `Z.AI GLM` (301) · `AgentRouter` (200) · `Moonshot/Kimi` (200) ·
`NVIDIA NIM` · `TypeSafe JEV`. **Empty/absent:** OpenAI, Anthropic, XAI, Qwen/DashScope, OpenRouter,
Gemini, Mistral, Groq, Together, Fireworks, Cerebras, Perplexity, local/ollama.

### Egress keys verified
SET: Brevo SMTP, GitHub App `phantix-security-solutions`, Paystack, NVD, VirusTotal, DuckDuckGo (AGI research).
EMPTY: Telegram, WhatsApp, Tavily, Mailinator, OTX, urlscan, Mnemonic, Qdrant.
**Consequence:** the alert policy claims critical → email + WhatsApp + Telegram, but on staging those
channels are dead, so critical alerts degrade to email only.

### Mess that is really there
* `amazing_cohen` — unmanaged container, up 9 days, running a shell loop probing `katana dalfox kr dirsearch nuclei` against `example.com`.
* `trusting_solomon`, `relaxed_banzai`, `phantix-api-src-sandbox-image-1` — exited leftovers.
* `phantix-agi-sandbox-keeper` — a deliberately stopped container pinning the sandbox image.
* Two Postgres servers, one of them named `bench-security-db` and living outside both compose projects.
* A host-level Burp/Xvfb/VNC desktop and a host-level `opencode serve`, neither of which is in any compose file.

---

## 2. Confirmed by a real run against Org 4 (no-MFA account)

Account `agi-test@phantixvulnserver.online` (user 14, org_admin), passwordless login, `mfa_required=false`.
A stable `device_id` is required: the device fingerprint includes the User-Agent, and a new fingerprint
triggers an emailed device-confirmation gate.

| Run | Result |
|---|---|
| **API sweep** — 54 authenticated calls | 51 succeeded; engine attribution taken from the live route tags. Slowest real hops: `/status` 4.0 s, `/compliance/frameworks` 1.1 s, `/agi/sessions` 1.4–2.6 s; median engine call ≈ 320 ms |
| **AGI session** — engagement 104 → session 134, autonomy `low`, lab allowlist `phantixvulnserver.online` | runner session `rs-134-4425c91f`; **1033 SSE frames** (535 `reasoning`, 357 `token`, 53 `mission_control`, 26 `action`, 22 `tool_error`, `engine_call`, `asset_plan`, `skills_selected`, `path_probe`, `campaign_done`, `ai_credit_spend`, `loop_stop`); **37 transcript rows** persisted; 0 findings |
| Real tool traffic inside that session | `http_get` probes of ~27 lab paths, `dns_lookup`, `compliance_engine.profile.get`, `asset_engine.assets.list`, `asset_engine.intelligence.summary`, and a sandbox `httpx -l /sandbox/work/hosts.txt` |
| Mid-run operator chat | accepted and **queued**: *"Your message was queued because a loop turn is already in flight"* → answers on the next turn. Real async, not a scripted sequence |
| Session outcome | the loop **stopped itself** with `blocked_info` (job status `blocked`) and asked for an instruction — low autonomy plus confirmed capabilities does not self-escalate |
| **AI-engine assistant** — `POST /ai/agent/chat/stream` | first attempt was **blocked by design**: `scope_card … needs_selection`, `done{blocked:true, reason:"scope_confirmation_required"}` — 37 assets listed, operator must select before any LLM call |
| after `scope/resolve` → `scope/confirm` (grant issued) | **188–256 real DeepSeek frames** streamed (105 `delta`, 147 `reasoning`) |
| async agent run — `POST /ai/agent/runs` | `analysis_id 7ce3d35f…`, specialist `chief`, `status: queued → success` in ≈22 s (the only path that leaves the API process: `ai` queue → `worker-ai`) |
| live occupancy during/after | runner `sessions: 1`; 2 pooled sandboxes + keeper; 7/7 celery nodes online and idle between bursts; host load 0.65 on 6 vCPU / 12 GB |

---

## 3. Assumptions and modelling (not measurements)

### 3a. Rendering and the connector model

Data movement is drawn **on the connector lines**: a hop is a travelling segment that samples the same
cubic bezier as the edge it rides (`Core.pointOnEdge` evaluates the edge's own control points). Nothing
is drawn as a free-floating marker off a line.

Where a captured hop has no edge in the inventory, the renderer synthesises a connector for the duration
of that hop, draws it dashed magenta, and the trace ticker prints `unverified hop`. Coverage is asserted
in `smoke.cjs` (`[connector coverage]`) and is currently:

| Replay | hops | on a declared edge | synthesised line | unresolvable |
|---|---|---|---|---|
| AGI session | 274 | 216 | 58 | 0 |
| AI-engine assistant | 37 | 32 | 5 | 0 |
| org-4 API sweep | 216 | 197 | 19 | 0 |

The synthesised lines are **inferred paths, not observed traffic**. The API sweep is the clearest case:
the capture measures which engine answered each call and how long it took, but not the intra-process
call chain, so the `api → engine → store` spine is a modelled route to the owning engine.

### 3b. Edges added after the first pass

The first pass under-declared the intra-process wiring. 29 edges were added to `inventory.json` because
the deployment does have them:

* `api → eng-*` × 13 — route dispatch is in-process; the request never leaves the api container.
* `eng-* → db` × 9 for the engines that own platform tables, and `eng-* → security-db` × 4 for the
  engines that work in the per-org security schema.
* `eng-ai → m-deepseek` / `m-zai` / `m-typesafe` — the AI-engine assistant streams from the model
  **inside the API process** (`POST /ai/agent/chat/stream`), which is why only the async agent run
  reaches `worker-ai`.
* `agi-loop → agi-toolcatalog` — tool dispatch in the runner process.

These raised declared-edge coverage for the assistant replay from 4/37 to 32/37, and for the sweep from
108/216 to 197/216. They are marked `verified: true` because they follow from the mounted routers, the
manifest table ownership, and the observed stream behaviour — but they were added by inference from code
and config, not by watching each call. Treat them as high-confidence, not instrumented.

### 3c. Everything else still assumed

| Assumption | Why it is an assumption |
|---|---|
| Per-edge latency in **simulated** mode | modelled from node kind and edge weight. Only captured-run replay uses measured values. |
| The 23 workload hops with no declared edge | drawn as dashed red "unverified". They are plausible sequences through the topology (e.g. `eng-risk → eng-alert`), not confirmed calls. |
| Fan-out from the engine bus to subscribers | derived from each engine's declared `publishes` / `subscribes` in `/status`, not from watched deliveries at runtime. |
| Queue depth | Redis was inspected for celery keys, but `active`/`reserved` were **empty at every sample** — the deployment was idle between my bursts, so no real backlog was observed. |
| `beat` produced work during observation | 26 RedBeat entries are configured and the lock is held; individual scheduled firings were not captured. |
| Retry / dead-letter behaviour | read from code and policy (`max_retries`, backoff, DLQ on the bus). Not observed triggering. |
| Alert delivery to WhatsApp/Telegram | impossible on staging — the tokens are empty. `alert-daemon` heartbeats, but delivery was not exercised. |
| The container-internal DB call path | the inspected sweep timings end at the API; time inside the DB is not separable from the engine hop. |
| `whtbin` on 18082 | unidentified; no config references it. |
| `ai_assistant` async run → `worker-ai` mapping | inferred from `status: queued` followed by `success` and the `ai` queue route; the worker's own log line was not captured. |

## 4. Known gaps

1. **No OpenAPI document** — route inventory reconstructed from the live `/status` payload.
2. **No tracing backend** — no OTel/Jaeger/Sentry. "Traces" are the SSE event log, `ai_audit_logs`, `agi_transcripts` and `platform_events`.
3. **Staging container stdout was not captured** — quoted runtime log lines elsewhere come from the local dev run and are labelled as such.
4. `169.58.162.46` (`phantix-vuln-lab`) is unreachable on 22 and 443.
5. No Appium listener despite `MOBILE_UI_ENABLED=true`.
6. A **drift** worth flagging: `services/phantix-agi/SECURITY_POLICY.md` still claims the runner reaches a restricted socket proxy, while the deployed compose mounts the raw `docker.sock` and the compose comments document that as deliberate.
7. **Secret hygiene on the host**: `service/container env` on the origin exposes live model keys, the AGI service token and the security DB password in plaintext. The two NVD/VirusTotal keys were printed during probing and should be rotated; so should the keys visible in any transcript of this work.

## 5. Security note on the test runs

All calls were reads plus one bounded engagement created for this mapping exercise (autonomy `low`,
`include_org_assets: false`, allowlist limited to the authorised lab host, recon-only rules of engagement).
No exploitation was attempted; no exploitation payload is present in the captured traffic. The engagement
and session rows remain on staging (engagement 104 / session 134) and can be torn down.
