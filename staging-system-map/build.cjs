#!/usr/bin/env node
/**
 * build.cjs — turns the discovered facts into the files the renderer consumes.
 *
 *   inventory.json            (hand-maintained source of truth for topology)
 *   evidence/staging-status.json  (live /status snapshot: 974 routes, 13 engines, 7 workers)
 *   evidence/org4-trace.json      (REAL authenticated trace, org 4, no-MFA account)
 *   evidence/live-occupancy.json  (workers, queues, sandbox containers, host load)
 *
 *   -> data.js        window.MAP_DATA   (topology + real trace + occupancy + facts)
 *   -> still.svg      the full connection graph, static, wide layout
 *   -> still-vertical.svg
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
// map-core.js is loaded by the browser as a classic script and by this build
// step through vm, because this workspace's package.json sets "type": "module".
function loadCore() {
  const src = fs.readFileSync(path.join(__dirname, 'map-core.js'), 'utf8');
  const sandbox = { module: { exports: {} }, console, self: undefined };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'map-core.js' });
  return sandbox.module.exports;
}
const Core = loadCore();

const HERE = __dirname;
const EV = path.join(HERE, 'evidence');

const inventory = JSON.parse(fs.readFileSync(path.join(HERE, 'inventory.json'), 'utf8'));
const status = JSON.parse(fs.readFileSync(path.join(EV, 'staging-status.json'), 'utf8'));
const trace = JSON.parse(fs.readFileSync(path.join(EV, 'org4-trace.json'), 'utf8'));
let occupancy = {};
try { occupancy = JSON.parse(fs.readFileSync(path.join(EV, 'live-occupancy.json'), 'utf8')); } catch {}
let agiSession = {};
try { agiSession = JSON.parse(fs.readFileSync(path.join(EV, 'agi-session-trace.json'), 'utf8')); } catch {}
let aiAssistant = {};
try { aiAssistant = JSON.parse(fs.readFileSync(path.join(EV, 'ai-assistant-trace.json'), 'utf8')); } catch {}
let liveStateAfter = '';
try { liveStateAfter = fs.readFileSync(path.join(EV, 'live-state-after.txt'), 'utf8'); } catch {}
let hostTopo = '';
try { hostTopo = fs.readFileSync(path.join(EV, 'staging-host-topology.txt'), 'utf8'); } catch {}

// ---- derived facts straight from the live payloads, not from prose
const derived = {
  api_version: status.version,
  environment: status.environment,
  architecture: status.architecture,
  endpoints_total: status.summary.endpoints_total,
  modules_registered: status.summary.modules_registered,
  modules_missing: status.summary.modules_missing,
  engines_total: status.summary.engines_total,
  security_schema_version: status.summary.security_schema_version,
  migration_revision: status.checks.migrations.current_revision,
  checks: status.checks,
  services: status.services,
  celery_worker_count: status.checks.celery_workers.worker_count,
  celery_workers: status.checks.celery_workers.workers,
  queues_by_worker: status.checks.celery_workers.queues_by_worker,
  live_queues: status.checks.celery_workers.queues,
  agi_runner: status.checks.agi_runner,
  security_db_pool: status.checks.security_db_pool,
  engine_list: status.engines.engines.map((e) => ({
    id: e.id, version: e.version, status: e.status,
    publishes: e.publishes.length, subscribes: e.subscribes.length,
  })),
  route_engine_counts: (() => {
    const c = {};
    for (const e of status.endpoints || []) {
      const t = (e.tags || [])[0] || 'untagged';
      c[t] = (c[t] || 0) + 1;
    }
    return c;
  })(),
  // real, measured
  real_trace: {
    account: trace.account, org: trace.org, mfa_required: trace.mfa_required,
    total_steps: trace.total_steps, ok_steps: trace.ok_steps,
    captured_at: trace.captured_at, engine_latency: trace.engine_latency,
  },
  real_trace_steps: trace.steps,
  live_occupancy: occupancy,
  // real multi-node runs, captured on org 4
  agi_session: agiSession.hops ? {
    engagement_id: agiSession.engagement_id, session_id: agiSession.session_id,
    final_status: agiSession.final_status, findings: agiSession.findings_returned,
    transcript_rows: agiSession.transcript_rows, frame_count: agiSession.sse_frames.length,
    hop_count: agiSession.hops.length,
    frames: agiSession.sse_frames, hops: agiSession.hops,
  } : null,
  ai_assistant: aiAssistant.hops ? {
    scoped_asset_ids: aiAssistant.scoped_asset_ids,
    scope_card_status: aiAssistant.scope_card_status,
    scope_grant_issued: aiAssistant.scope_grant_issued,
    frames: aiAssistant.frames, hops: aiAssistant.hops,
    analysis_id: aiAssistant.analysis_id,
  } : null,
  live_state_after: liveStateAfter,
};

// ---- sanity: every route in a workload must be reachable over a real edge
const g = Core.buildGraph(inventory);
const edgeSet = new Set(inventory.edges.map((e) => `${e.from}->${e.to}`));
const routeProblems = [];
for (const w of inventory.workloads || []) {
  const r = w.route || [];
  for (let i = 0; i < r.length - 1; i++) {
    const key = `${r[i]}->${r[i + 1]}`;
    const rev = `${r[i + 1]}->${r[i]}`;
    if (!edgeSet.has(key) && !edgeSet.has(rev)) routeProblems.push({ workload: w.id, hop: key });
  }
  for (const id of r) if (!g.byId.has(id)) routeProblems.push({ workload: w.id, missing_node: id });
}
if (routeProblems.length) {
  console.log('\n!! workload routes with no matching real edge (they will animate as dashed unverified hops):');
  for (const p of routeProblems) console.log('   ', JSON.stringify(p));
} else {
  console.log('workload routes: every hop maps to a declared edge');
}

// ---- data.js
const payload = { inventory, derived, meta: { built: new Date().toISOString(), routeProblems } };
fs.writeFileSync(path.join(HERE, 'data.js'),
  '/* generated by build.cjs — do not edit; edit inventory.json and rebuild */\n' +
  'window.MAP_DATA = ' + JSON.stringify(payload, null, 1) + ';\n');
console.log(`data.js written (${(JSON.stringify(payload).length / 1024).toFixed(0)} KB)`);
console.log(`  units=${inventory.units.length} edges=${inventory.edges.length} workloads=${inventory.workloads.length}`);
console.log(`  live: ${derived.endpoints_total} routes, ${derived.engines_total} engines, ${derived.celery_worker_count} workers, ${derived.live_queues.length} queues`);
console.log(`  AGI session ${derived.agi_session ? derived.agi_session.session_id : 'n/a'}: ${derived.agi_session ? derived.agi_session.frame_count : 0} real frames, ${derived.agi_session ? derived.agi_session.transcript_rows : 0} transcript rows`);
console.log(`  AI assistant: ${derived.ai_assistant ? derived.ai_assistant.frames.length : 0} real frames, grant=${derived.ai_assistant ? derived.ai_assistant.scope_grant_issued : 'n/a'}`);
console.log(`  real trace: ${derived.real_trace.ok_steps}/${derived.real_trace.total_steps} ok, mfa_required=${derived.real_trace.mfa_required}`);

// ---- still SVG, both layouts
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function wrap(text, max) {
  const words = String(text).split(/\s+/); const out = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) out.push(cur); return out;
}

function still(mode) {
  const lay = Core.computeLayout(g, mode);
  const P = 34, HEAD = 92, FOOT = 78;
  const W = lay.width + P * 2;
  const H = lay.height + P * 2 + HEAD + FOOT;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#07090c"/>`);

  // ---- title band
  const d = derived;
  parts.push(`<text x="${P}" y="34" fill="#e2e8f0" font-size="17" font-weight="600" letter-spacing="0.5">Phantix / SecureGraph — staging deployment, as discovered</text>`);
  parts.push(`<text x="${P}" y="54" fill="#64748b" font-size="11">live https://staging.phantix.site · environment ${esc(d.environment)} · v${esc(d.api_version)} · ${esc(d.architecture)} · image a3c8e25c</text>`);
  parts.push(`<text x="${P}" y="72" fill="#64748b" font-size="11">${inventory.units.length} deployed units · ${inventory.edges.length} edges · ${d.endpoints_total} live routes · ${d.engines_total} engines · ${d.celery_worker_count} celery workers · ${d.live_queues.length} queues · ${esc(d.checks.smtp.host)} · docker host 169.58.140.217</text>`);
  const unvU = inventory.units.filter((u) => u.verified === false).length;
  const unvE = inventory.edges.filter((e) => e.verified === false).length;
  parts.push(`<text x="${W - P}" y="34" fill="#fbbf24" font-size="11" text-anchor="end">${unvU} unverified units · ${unvE} unverified edges (dashed red)</text>`);
  parts.push(`<text x="${W - P}" y="54" fill="#f87171" font-size="11" text-anchor="end">no MCP server deployed — only outbound MCP client adapters</text>`);
  parts.push(`<text x="${W - P}" y="72" fill="#22d3ee" font-size="11" text-anchor="end">no vector retrieval in the agent loop (pgvector inactive, no Qdrant)</text>`);
  parts.push(`<line x1="${P}" y1="${HEAD - 10}" x2="${W - P}" y2="${HEAD - 10}" stroke="#1b2430"/>`);

  // shift the graph down under the band
  parts.push(`<g transform="translate(${P} ${HEAD})">`);

  for (const b of lay.boxes) {
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="#0b0f14" stroke="#1f2937" stroke-width="1"/>`);
    parts.push(`<text x="${b.x + 12}" y="${b.y + 19}" fill="#64748b" font-size="11" letter-spacing="1.4">${esc(String(b.label).toUpperCase())}</text>`);
  }
  for (const e of lay.edges) {
    const dash = e.verified === false ? ' stroke-dasharray="5 4"' : '';
    const op = e.verified === false ? 0.5 : 0.8;
    parts.push(`<path d="${e.d}" fill="none" stroke="${e.verified === false ? '#f87171' : e.style.color}" stroke-width="${e.style.width}" opacity="${op}"${dash}/>`);
  }
  for (const [id, n] of lay.nodes) {
    const u = n.unit;
    const col = Core.KIND_COLOR[u.kind] || '#64748b';
    const group = Core.KIND_GROUP[u.kind] || 'other';
    parts.push(`<g>`);
    parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" fill="#0e1319" stroke="${col}" stroke-opacity="${n.nested ? 0.4 : 0.75}" stroke-width="${n.nested ? 1 : 1.3}"/>`);
    parts.push(`<rect x="${n.x}" y="${n.y}" width="3" height="${n.h}" rx="1.5" fill="${col}"/>`);
    if (u.children && u.children.length) {
      parts.push(`<text x="${n.x + 10}" y="${n.y + 15}" fill="#e2e8f0" font-size="11.5" font-weight="600">${esc(u.label)}</text>`);
      parts.push(`<text x="${n.x + n.w - 10}" y="${n.y + 15}" fill="${col}" font-size="9.5" text-anchor="end">${group.toUpperCase()} · ${u.children.length} INSIDE</text>`);
    } else {
      const lines = wrap(u.label, n.nested ? 26 : 30);
      parts.push(`<text x="${n.x + 10}" y="${n.y + 15}" fill="${n.nested ? '#cbd5e1' : '#e2e8f0'}" font-size="${n.nested ? 10 : 11.5}" font-weight="${n.nested ? 400 : 600}">${esc(lines[0])}</text>`);
      if (lines[1] && !n.nested) parts.push(`<text x="${n.x + 10}" y="${n.y + 28}" fill="#94a3b8" font-size="10">${esc(lines[1])}</text>`);
      parts.push(`<text x="${n.x + n.w - 10}" y="${n.y + 15}" fill="${col}" font-size="9" text-anchor="end">${group.toUpperCase()}</text>`);
      if (u.state) parts.push(`<text x="${n.x + n.w - 10}" y="${n.y + (n.h - 6)}" fill="#f87171" font-size="8.6" text-anchor="end">${esc(String(u.state).toUpperCase())}</text>`);
      if (u.members && u.members.length) parts.push(`<text x="${n.x + 10}" y="${n.y + 33}" fill="#64748b" font-size="8.6">${esc(u.members.slice(0, 12).join(' · '))}${u.members.length > 12 ? ' …+' + (u.members.length - 12) : ''}</text>`);
    }
    parts.push(`</g>`);
  }
  parts.push('</g>');

  // ---- legend strip
  const ly = HEAD + lay.height + 26;
  parts.push(`<line x1="${P}" y1="${ly - 16}" x2="${W - P}" y2="${ly - 16}" stroke="#1b2430"/>`);
  const L = Core.legend(g);
  const order = ['runners', 'engines', 'supervisors', 'agents', 'queues', 'models', 'stores', 'sandboxes', 'mcp', 'gateways', 'observers', 'targets', 'strays'];
  const colors = { runners: '#4ade80', engines: '#60a5fa', supervisors: '#f0abfc', agents: '#fbbf24', queues: '#c084fc', models: '#22d3ee', stores: '#34d399', sandboxes: '#facc15', mcp: '#f87171', gateways: '#94a3b8', observers: '#a3a3a3', targets: '#fb923c', strays: '#ef4444' };
  let lx = P;
  parts.push(`<text x="${lx}" y="${ly}" fill="#64748b" font-size="10" letter-spacing="1.3">LEGEND</text>`);
  lx += 74;
  for (const k of order) {
    if (!L[k]) continue;
    parts.push(`<rect x="${lx}" y="${ly - 9}" width="9" height="9" rx="2" fill="${colors[k]}"/>`);
    parts.push(`<text x="${lx + 14}" y="${ly}" fill="#94a3b8" font-size="10.5">${k} <tspan fill="#e2e8f0" font-weight="600">${L[k].count}</tspan></text>`);
    lx += 26 + String(k).length * 6.6;
  }
  const names = { agents: L.agents ? L.agents.ids : [] };
  parts.push(`<text x="${P}" y="${ly + 20}" fill="#5b6675" font-size="9.6">agents found: ${esc(names.agents.join(', '))}</text>`);
  parts.push(`<text x="${P}" y="${ly + 34}" fill="#5b6675" font-size="9.6">queues found: ${esc((L.queues ? L.queues.ids : []).join(', '))}</text>`);
  parts.push(`<text x="${P}" y="${ly + 48}" fill="#5b6675" font-size="9.6">models found: ${esc((L.models ? L.models.ids : []).join(', '))}  ·  stores: ${esc((L.stores ? L.stores.ids : []).join(', '))}</text>`);
  parts.push('</svg>');
  return parts.join('\n');
}

for (const mode of ['wide', 'vertical']) {
  const svg = still(mode);
  const f = path.join(HERE, mode === 'wide' ? 'still.svg' : 'still-vertical.svg');
  fs.writeFileSync(f, svg);
  console.log(`${path.basename(f)} written (${(svg.length / 1024).toFixed(0)} KB)`);
}
