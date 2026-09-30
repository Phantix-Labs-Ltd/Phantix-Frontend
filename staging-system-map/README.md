# Staging system map — Phantix / SecureGraph multi-agent backend

An animated, **data-driven** map of the multi-agent backend that is actually deployed on staging,
plus a static connection graph, a legend of what was found, and a facts-vs-assumptions note.

Nothing here is a textbook RAG flowchart. The topology was discovered, and where it is messy the
map shows the mess: a second Postgres outside both compose projects, a host-level Burp desktop,
a host-level `opencode serve` reached through a socat container, a 9-day-old unmanaged container,
and **no MCP server at all**.

---

## Open it

```
start index.html          # Windows
```

`index.html` is self-contained apart from `map-core.js` and the generated `data.js`. It runs from
`file://` — no server, no build step needed to view.

Deep-linkable views:

```
index.html?layout=vertical&source=agi
index.html?layout=wide&source=sim
```

### Controls

| Control | What it does |
|---|---|
| `wide` / `vertical` | both required layouts. The graph is laid out by **deployment boundary**, not by slide order. |
| `real · AGI session + assistant` | replays the captured AGI session and the scope-gated assistant run |
| `real · org 4 API sweep` | replays 54 measured calls across 13 engines |
| `simulated · walk the inventory` | an arrival-driven walk over the discovered edges (competing consumers, queueing, fan-out, retry) |
| scrubber | drag to any instant of a captured run; the picture at `t` is a pure function of the recording |
| `pause` / `4×` | time control (0.5× to 16×; 1× = the captured wall-clock) |
| `faults` | raises the error rate so retry/death paths appear (simulated mode) |
| `fit` | refit the canvas; drag to pan, wheel to zoom |
| `SVG` / `PNG` | export the current view |
| click a node | inspect: kind, replicas, concurrency, live counts, inbound/outbound edges, members |

## How the movement is drawn

**Data movement rides the connector lines.** A hop is rendered as a travelling segment that follows
the same cubic bezier as the edge it is on (`Core.pointOnEdge` samples the edge's own control points),
so nothing floats in empty space. Edge thickness and brightness are the live traffic on that edge, and
the hottest edges are labelled with their kind and — for captured runs — the **measured** latency.

The state of a node is occupancy, not decoration:

| Visual | Meaning |
|---|---|
| filled pip | an occupied concurrency slot |
| bottom gauge bar | how full the node is against its declared capacity |
| green / cyan node | running / streaming |
| amber node | blocked — work queued behind a full node |
| red node | error or dead |
| travelling segment | a request in transit on that connector |

### Declared vs synthesised connectors

A captured hop sometimes has no edge in the inventory (for example the assistant streams to DeepSeek
from the API process, which the first pass had not recorded). Where that happens the renderer draws a
**dashed magenta connector for the duration of the hop** and the trace ticker says `unverified hop`.
It never draws a packet without a line. Current coverage:

| Replay | hops | on a declared edge | synthesised line | unresolvable |
|---|---|---|---|---|
| AGI session | 274 | 216 | 58 | 0 |
| AI-engine assistant | 37 | 32 | 5 | 0 |
| org-4 API sweep | 216 | 197 | 19 | 0 |

## Files

| File | Role |
|---|---|
| `inventory.json` | **the source of truth.** Every runner, engine, agent, supervisor, queue, model, store and egress path with kind, replicas/concurrency, talks-to, sync/async, semantics, failure modes, and a `verified` flag. Edit this to change the picture. |
| `map-core.js` | shared graph + layout + simulation + real-frame→hop mapping. Runs in Node and the browser. |
| `build.cjs` | reads `inventory.json` + the captured evidence and generates `data.js`, `still.svg`, `still-vertical.svg`. |
| `data.js` | generated. Topology + the live `/status` facts + the real traces. |
| `index.html` | the animated map. |
| `still.svg` / `still.png` | full connection graph, wide, with title band and legend. |
| `still-vertical.svg` / `still-vertical.png` | the same graph, vertical. |
| `app-wide.png` · `app-vertical.png` · `app-simulated.png` | the running application in each mode. |
| `smoke.cjs` | headless test of every runtime path (see below). |
| `rasterize.cjs` | SVG → PNG for the stills. |
| `notes/ASSUMPTIONS-AND-FACTS.md` | **confirmed deployment facts vs assumptions vs gaps.** |
| `evidence/` | the raw captures everything is derived from. |

## Data-driven by construction

The layout is computed, not hand-placed: units are ordered inside each boundary by the **barycentre of
their neighbours** (which removes most long crossing edges), packed into as many columns or rows as the
lane needs, and lanes flow left-to-right in `wide` or top-to-bottom in `vertical`.

Adding a runner or an engine changes the picture with one edit:

```jsonc
// inventory.json
{
  "id": "worker-forensics",
  "label": "worker-forensics",
  "kind": "runner",
  "boundary": "core",
  "replicas": 1,
  "concurrency": 4,
  "queues": ["forensics"],
  "note": "celery -Q forensics -c 4",
  "verified": true
}
```

then add its queue and the edges into it:

```jsonc
{ "id": "q-forensics", "label": "forensics", "kind": "queue", "boundary": "queues",
  "consumers": ["worker-forensics"], "verified": true },
{ "id": "e-new1", "from": "api", "to": "q-forensics", "kind": "celery",
  "sync": false, "semantics": "compete", "p50_ms": 20, "verified": true },
{ "id": "e-new2", "from": "q-forensics", "to": "worker-forensics", "kind": "celery",
  "sync": false, "semantics": "compete", "p50_ms": 30, "verified": true }
```

```bash
node build.cjs && node smoke.cjs
```

The node, its capacity pips, its legend count, its boundary grouping and the packet route all follow
from the data. Layout is computed, not hand-placed. Nothing in the renderer knows the word "scan".

## What the discovery found (short version)
* **One image, 12 containers.** `api` (2 uvicorn workers) hosts **all 13 engines in-process** plus the
  middleware chain and an in-process event bus. The engines therefore render *inside* the api box.
* **7 celery workers, 10 queues**, and multiplicity is child-process concurrency, not replicas —
  so the pools are drawn as pools. `ai -c 1` is the single LLM slot for the whole platform.
* **The AGI runner is a separate stack** (port 8095) whose session state is in-process memory only,
  with a warm-2 / max-8 Docker sandbox pool on an isolated network (`cap_drop ALL`, `NET_RAW`, pids 512).
* **The agent loop is not a RAG pipeline.** There is no vector store, no embedding call, no reranker.
  "Retrieval" is prior-session summaries plus a static gap playbook.
* **There is no MCP server.** The only MCP code that runs points *outbound* at tenant endpoints.
  Burp and Caido MCP adapters are inert/disabled even though Burp Suite Pro is running on the host.
* **The AI-engine assistant is scope-gated**: it refuses to call the model until an operator selects
  which of the org's 37 assets the run may touch. Observed live, not inferred.
* **Two Postgres servers**, the security one (`phantix_security`) living outside both compose projects
  and reached per-org through an encrypted-credential pool.
* Critical alerts are policy-routed to WhatsApp and Telegram, but **every token for those channels is
  empty on staging**, so they degrade to email — shown rather than dropped.

## Tests

```bash
node smoke.cjs
```

Checks the same code the browser runs: no dangling edges, no NaN geometry, no overlapping nodes, every
node inside the canvas, every workload route resolving to a real unit, no node exceeding its declared
concurrency during a 900-step simulation, and every hop in all three real traces resolving to a
deployed unit in captured order.

CI-shaped: exits non-zero on failure.

## Regenerating the evidence

The captures in `evidence/` were produced by these scripts (they need the live staging host and the
Org-4 no-MFA account; they are read-mostly and time-boxed):

```bash
cd evidence
node org4-sweep.cjs        # 54 authenticated calls, real engine attribution
node agi-session.cjs       # real AGI engagement + session + SSE frame log
node ai-assistant.cjs      # scope-gated assistant + async chief run
```

Then, from the project root:

```bash
node build.cjs && node smoke.cjs && node rasterize.cjs
```

Note: the login is passwordless but device-bound — the device fingerprint includes the User-Agent, so
reuse `staging-topology-probe/1.0` and the stable `device_id`, or complete the emailed device gate.

## If discovery is incomplete

The map renders **only** what was found. Edges the inventory declares without a confirmed live call
path are drawn dashed red and counted in the sidebar; units that could not be confirmed are hatched
and listed under *Assumptions vs confirmed*. Gaps are marked, never filled with a stock architecture.
