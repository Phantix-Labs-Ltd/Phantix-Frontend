#!/usr/bin/env node
/**
 * smoke.cjs — runs the real rendering/simulation code paths headlessly.
 * Catches the mistakes a browser would otherwise show as a blank canvas:
 * missing nodes, dangling edges, unroutable hops, NaN geometry.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadCore() {
  const src = fs.readFileSync(path.join(__dirname, 'map-core.js'), 'utf8');
  const sandbox = { module: { exports: {} }, console, self: undefined };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'map-core.js' });
  return sandbox.module.exports;
}

const Core = loadCore();
const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8'), sandbox, { filename: 'data.js' });
const D = sandbox.window.MAP_DATA;
const INV = D.inventory, DER = D.derived;

let fail = 0; const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fail++; };

const g = Core.buildGraph(INV);
console.log(`\n[graph] units=${g.units.length} edges=${g.edges.length} workloads=${INV.workloads.length}`);
ok(g.units.length === INV.units.length, 'every inventory unit became a graph unit');
ok(g.edges.length === INV.edges.length, 'every inventory edge survived');

// no duplicate ids, no edge pointing at a missing unit
const ids = new Set(g.units.map((u) => u.id));
ok(ids.size === g.units.length, 'unit ids unique');
const dangling = g.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
ok(dangling.length === 0, `no dangling edges (${dangling.length} found)`);
const selfEdges = g.edges.filter((e) => e.from === e.to);
ok(selfEdges.length === 0, `no self edges (${selfEdges.length})`);

// children resolution
const children = g.units.filter((u) => u.colocated_in && ids.has(u.colocated_in));
ok(children.length > 0, `${children.length} units render inside their host process (engines inside api, etc)`);

for (const mode of ['wide', 'vertical']) {
  const L = Core.computeLayout(g, mode);
  console.log(`\n[layout:${mode}] boxes=${L.boxes.length} nodes=${L.nodes.size} edges=${L.edges.length} canvas=${Math.round(L.width)}x${Math.round(L.height)}`);
  ok(L.nodes.size === g.units.length, 'every unit got a position, including nested children');
  ok(L.edges.length === g.edges.length, 'every edge got geometry');
  const nan = [...L.nodes.values()].filter((n) => ![n.x, n.y, n.w, n.h].every(Number.isFinite));
  ok(nan.length === 0, `no NaN node geometry (${nan.length})`);
  const outside = [...L.nodes.values()].filter((n) => n.x < 0 || n.y < 0 || n.x + n.w > L.width || n.y + n.h > L.height);
  ok(outside.length === 0, `every node inside the canvas (${outside.length} outside)`);
  const badEdge = L.edges.filter((e) => !Number.isFinite(e.s.x) || !Number.isFinite(e.t.y));
  ok(badEdge.length === 0, `no NaN edge endpoints (${badEdge.length})`);
  // overlap check among top-level nodes
  const top = [...L.nodes.values()].filter((n) => !n.nested);
  let overlaps = 0;
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
    const a = top[i], b = top[j];
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) overlaps++;
  }
  ok(overlaps === 0, `no overlapping top-level nodes (${overlaps} overlaps)`);
}

// workload routes must resolve to real nodes
console.log('\n[routes]');
let routeBad = 0;
for (const w of INV.workloads) {
  for (const id of (w.route || [])) if (!ids.has(id)) { console.log(`   missing node ${id} in ${w.id}`); routeBad++; }
}
ok(routeBad === 0, `all workload route nodes exist (${routeBad} bad)`);
ok(D.meta.routeProblems !== undefined, `build reported ${D.meta.routeProblems.length} hops without a declared edge (rendered as unverified)`);

// simulated walk
console.log('\n[simulation]');
const Lw = Core.computeLayout(g, 'wide');
const sim = Core.createSim(g, Lw, { seed: 7 });
for (let i = 0; i < 900; i++) sim.step(16);
const snap = sim.snapshot();
const moving = Object.values(snap.occ).filter((o) => o.running > 0).length;
const completed = Object.values(snap.occ).reduce((a, b) => a + b.done, 0);
const errored = Object.values(snap.occ).reduce((a, b) => a + b.error, 0);
console.log(`  t=${(snap.t / 1000).toFixed(1)}s tokens=${snap.tokens} occupied=${moving} completed=${completed} errors=${errored}`);
ok(snap.t > 14000, 'clock advanced');
ok(snap.tokens > 0, 'tokens are alive in the system');
ok(completed > 0, 'work completes (fan-in reaches a terminal node)');
ok(errored >= 0, 'error counter present');
const overCap = Object.entries(snap.occ).filter(([id, o]) => {
  const u = g.byId.get(id); return u && o.running > Core.nodeCapacity(u);
});
ok(overCap.length === 0, `no node exceeded its concurrency (${overCap.length} violations)`);

// real trace event streams
console.log('\n[real traces]');
for (const kind of ['agi', 'assistant', 'sweep']) {
  const ev = Core.traceEvents(kind, DER);
  const bad = ev.filter((e) => !ids.has(e.from) || !ids.has(e.to));
  const span = ev.length ? Math.max(...ev.map((e) => e.at)) : 0;
  console.log(`  ${kind.padEnd(10)} events=${String(ev.length).padStart(5)} span=${(span / 1000).toFixed(1)}s nodes-touched=${new Set(ev.map((e) => e.node || e.to)).size}`);
  ok(ev.length > 0, `${kind}: produced events`);
  ok(bad.length === 0, `${kind}: every hop resolves to a real unit (${bad.length} bad)`);
  ok(ev.every((e) => Number.isFinite(e.at)), `${kind}: every event has a numeric timestamp`);
  const ordered = ev.every((e, i) => i === 0 || e.at >= ev[i - 1].at);
  ok(ordered, `${kind}: frames are in captured order`);
}

// engine tag coverage: every live route tag maps to a node
console.log('\n[engine attribution]');
const tagsInTrace = new Set((DER.real_trace_steps || []).map((s) => s.engine));
const unmapped = [...tagsInTrace].filter((t) => !ids.has(Core.engineNode(t)));
ok(unmapped.length === 0, `every engine tag in the live trace maps to a deployed engine node (unmapped: ${unmapped.join(', ') || 'none'})`);

// every moving hop must resolve to a connector the viewer can see.
// declared = a real inventory edge; synthesised = a captured hop the inventory
// does not declare, which the renderer draws as its own dashed connector.
console.log('\n[connector coverage]');
const L2 = Core.computeLayout(g, 'wide');
for (const kind of ['agi', 'assistant', 'sweep']) {
  const t = Core.createTracePlayer(g, L2, DER, kind);
  let declared = 0, syn = 0, none = 0;
  for (const tr of t.traversals) {
    const a = tr.from, b = tr.to;
    if (L2.pairIndex.has(a + '>' + b)) declared++;
    else if (L2.pairIndex.has(b + '>' + a)) declared++;
    else if (L2.nodes.has(a) && L2.nodes.has(b)) syn++;
    else none++;
  }
  console.log(`  ${kind.padEnd(10)} hops=${String(t.traversals.length).padStart(4)} on declared edge=${String(declared).padStart(4)} synthesised line=${String(syn).padStart(4)} unresolvable=${none}`);
  ok(none === 0, `${kind}: every hop has a drawable connector (${none} unresolvable)`);
  const onCurve = t.traversals.filter((tr) => L2.pairIndex.has(tr.from + '>' + tr.to)).length;
  ok(onCurve > 0, `${kind}: hops ride declared edges (${onCurve})`);
}

// a point sampled on an edge must lie on that edge's own path
console.log('\n[geometry]');
let maxDev = 0;
for (const e of L2.edges) {
  for (const u of [0, 0.25, 0.5, 0.75, 1]) {
    const p = Core.pointOnEdge(e, u, false);
    // compare against the same cubic evaluated directly from the path controls
    const q = Core.bez(e.s, e.c1, e.c2, e.t, u);
    maxDev = Math.max(maxDev, Math.hypot(p.x - q.x, p.y - q.y));
  }
}
ok(maxDev < 1e-6, `packet positions lie on the drawn bezier (max deviation ${maxDev.toExponential(2)})`);
const rev = L2.edges[0];
const pf = Core.pointOnEdge(rev, 0.3, false), pr = Core.pointOnEdge(rev, 0.3, true);
ok(Math.hypot(pf.x - pr.x, pf.y - pr.y) > 1, 'reverse traversal maps to a different point on the same curve');

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : fail + ' CHECK(S) FAILED'}\n`);
process.exit(fail ? 1 : 0);
