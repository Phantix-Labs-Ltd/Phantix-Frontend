/*  map-core.js — shared graph, layout and simulation core.
 *  Works in Node (module.exports) and in the browser (window.MapCore).
 *  Nothing here knows about DOM. index.html renders what this produces.
 *
 *  Everything is derived from inventory.json. Add a runner or an engine to the
 *  inventory and the picture changes: nodes, pools, legend counts and the
 *  packet routes all follow from the data.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MapCore = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  const BOUNDARY_ORDER = [
    'edge', 'coolify', 'core', 'queues', 'agi', 'sandbox',
    'mcp', 'hostsvc', 'strays', 'providers', 'egress', 'targets',
  ];

  const KIND_GROUP = {
    runner: 'runners', engine: 'engines', supervisor: 'supervisors',
    'specialist-agent': 'agents', 'mcp-server': 'mcp', 'mcp-client': 'mcp',
    'model-endpoint': 'models', queue: 'queues', bus: 'queues',
    gateway: 'gateways', 'memory-store': 'stores', 'vector-store': 'stores',
    'object-store': 'stores', cache: 'stores', observer: 'observers',
    sandbox: 'sandboxes', registry: 'supervisors', stray: 'strays', target: 'targets',
  };

  const KIND_GLYPH = {
    runner: '\u25A3', engine: '\u2699', supervisor: '\u25C8',
    'specialist-agent': '\u25B2', 'mcp-server': '\u2716', 'mcp-client': '\u2716',
    'model-endpoint': '\u2609', queue: '\u2261', bus: '\u21C4',
    gateway: '\u25C7', 'memory-store': '\u25A4', 'vector-store': '\u25A5',
    'object-store': '\u25A6', cache: '\u25A4', observer: '\u25CE',
    sandbox: '\u25A1', registry: '\u25A4', stray: '\u26A0', target: '\u2316',
  };

  const KIND_COLOR = {
    runner: '#4ade80', engine: '#60a5fa', supervisor: '#f0abfc',
    'specialist-agent': '#fbbf24', 'mcp-server': '#f87171', 'mcp-client': '#f87171',
    'model-endpoint': '#22d3ee', queue: '#c084fc', bus: '#c084fc',
    gateway: '#94a3b8', 'memory-store': '#34d399', 'vector-store': '#2dd4bf',
    'object-store': '#38bdf8', cache: '#34d399', observer: '#a3a3a3',
    sandbox: '#facc15', registry: '#f0abfc', stray: '#ef4444', target: '#fb923c',
  };

  const EDGE_STYLE = {
    http:     { color: '#64748b', width: 1.6 },
    https:    { color: '#22d3ee', width: 1.6 },
    celery:   { color: '#c084fc', width: 1.9 },
    redis:    { color: '#34d399', width: 1.7 },
    sql:      { color: '#34d399', width: 1.7 },
    inproc:   { color: '#4b5563', width: 1.2 },
    exec:     { color: '#facc15', width: 1.9 },
    subprocess:{ color: '#fbbf24', width: 1.7 },
    file:     { color: '#38bdf8', width: 1.6 },
    docker:   { color: '#94a3b8', width: 1.6 },
    smtp:     { color: '#f0abfc', width: 1.6 },
    tcp:      { color: '#fb923c', width: 1.6 },
    stdio:    { color: '#f87171', width: 1.4 },
  };

  // Occupancy visual states.
  const STATE_COLOR = {
    idle: '#1e293b', claimed: '#78350f', running: '#166534',
    blocked: '#7c2d12', streaming: '#164e63', done: '#14532d', error: '#7f1d1d',
  };

  const NAME_FONT = 11.5, NAME_LINE = 13, PAD = 9;

  // ------------------------------------------------------------- graph build
  function buildGraph(inv) {
    const units = inv.units.map((u) => ({ ...u }));
    const byId = new Map(units.map((u) => [u.id, u]));

    // Attach children to their container (a unit another unit is colocated in).
    for (const u of units) u.children = [];
    for (const u of units) {
      if (u.colocated_in && byId.has(u.colocated_in)) {
        byId.get(u.colocated_in).children.push(u);
      }
    }
    const isChild = (u) => !!u.colocated_in && byId.has(u.colocated_in);

    // Container children are packed in a grid. The column count follows the
    // number of children, so the api box grows to hold all 13 engines plus the
    // middleware chain without becoming a single tall ribbon.
    const CELL_W = 176, CELL_H = 21, CELL_GAP = 4;
    const colsFor = (n) => (n > 26 ? 3 : n > 12 ? 2 : 1);

    const measure = (u) => {
      const lines = wrapLabel(u.label, 30);
      let w = Math.max(112, Math.min(238, Math.max(...lines.map((l) => l.length)) * (NAME_FONT * 0.62) + PAD * 2));
      let h = 22 + (lines.length - 1) * 11;
      if (u.members && u.members.length) h += Math.min(2, Math.ceil(u.members.length / 4)) * 10 + 2;
      if (u.children.length) {
        const cols = colsFor(u.children.length);
        const rows = Math.ceil(u.children.length / cols);
        w = Math.max(w, cols * CELL_W + (cols - 1) * CELL_GAP + PAD * 2 + 6);
        h = Math.max(h, 24 + PAD + rows * (CELL_H + CELL_GAP) - CELL_GAP + PAD);
      }
      return { w, h: Math.max(38, h), header: u.children.length ? 24 : 0 };
    };

    for (const u of units) { const m = measure(u); u._w = m.w; u._h = m.h; u._header = m.header; }

    return { units, byId, isChild, colsFor, CELL_W, CELL_H, CELL_GAP, edges: inv.edges.map((e) => ({ ...e })), inv };
  }

  function wrapLabel(text, max) {
    const words = String(text).split(/\s+/);
    const out = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur); cur = w; }
      else cur = (cur + ' ' + w).trim();
    }
    if (cur) out.push(cur);
    return out.length ? out : [''];
  }

  // ---------------------------------------------------------------- layout
  // Boundaries are the top-level layout unit. Inside a boundary the units are
  // ordered by the barycentre of their neighbours, which pulls connected things
  // together and removes most of the long crossing edges.
  //
  // mode 'wide'     : lanes flow left to right, wrapping into rows
  // mode 'vertical' : lanes stack top to bottom, each lane flowing right
  function computeLayout(g, mode) {
    const items = g.units.filter((u) => !g.isChild(u));
    const groups = new Map();
    for (const u of items) {
      const b = u.boundary || 'core';
      if (!groups.has(b)) groups.set(b, []);
      groups.get(b).push(u);
    }
    const order = BOUNDARY_ORDER.filter((b) => groups.has(b))
      .concat([...groups.keys()].filter((b) => !BOUNDARY_ORDER.includes(b)));
    const bRank = new Map(order.map((b, i) => [b, i]));

    // one barycentre pass: sort each boundary's units by where their neighbours live
    const adj = new Map();
    for (const e of g.edges) {
      if (!adj.has(e.from)) adj.set(e.from, []);
      if (!adj.has(e.to)) adj.set(e.to, []);
      adj.get(e.from).push(e.to);
      adj.get(e.to).push(e.from);
    }
    const rankOf = (id) => {
      const u = g.byId.get(id);
      return u && bRank.has(u.boundary) ? bRank.get(u.boundary) : order.length;
    };
    for (const list of groups.values()) {
      const score = new Map();
      for (const u of list) {
        const ns = adj.get(u.id) || [];
        const rs = ns.map(rankOf);
        const own = bRank.has(u.boundary) ? bRank.get(u.boundary) : order.length;
        score.set(u.id, rs.length ? rs.reduce((a, c) => a + c, 0) / rs.length : own);
      }
      list.sort((a, c) => (score.get(a.id) - score.get(c.id)) || String(a.label).localeCompare(String(c.label)));
    }

    const GAP = 13, LANE_PAD = 18, LANE_TITLE = 30, LANE_GAP = 30;
    const boxes = [];
    const nodes = new Map();

    // plan a lane: pick the column count that best matches the target extent
    const planLane = (list, targetExtent) => {
      const maxW = Math.max(...list.map((i) => i._w));
      const totalH = list.reduce((a, i) => a + i._h + GAP, -GAP);
      const cols = Math.max(1, Math.round(totalH / Math.max(420, targetExtent)));
      const per = totalH / cols;
      const columns = [];
      let cur = [], curH = 0;
      for (const u of list) {
        if (curH + u._h + GAP > per && cur.length && columns.length < cols - 1) {
          columns.push(cur); cur = []; curH = 0;
        }
        cur.push(u); curH += u._h + GAP;
      }
      if (cur.length) columns.push(cur);
      const colHeights = columns.map((c) => c.reduce((a, i) => a + i._h + GAP, -GAP));
      const contentH = Math.max(...colHeights);
      const contentW = columns.length * maxW + (columns.length - 1) * GAP;
      return {
        columns, maxW, colHeights,
        boxW: contentW + LANE_PAD * 2,
        boxH: contentH + LANE_TITLE + LANE_PAD * 2,
      };
    };

    const place = (plan, ox, oy, b) => {
      const lane = g.inv.boundaries.find((z) => z.id === b) || {};
      boxes.push({ id: b, x: ox, y: oy, w: plan.boxW, h: plan.boxH, label: lane.label || b, meta: lane });
      plan.columns.forEach((col, ci) => {
        let y = oy + LANE_TITLE + LANE_PAD;
        const cx = ox + LANE_PAD + ci * (plan.maxW + GAP);
        for (const u of col) {
          nodes.set(u.id, { x: cx, y, w: u._w, h: u._h, unit: u, boundary: b });
          y += u._h + GAP;
        }
      });
    };

    // vertical mode packs each lane into rows instead of columns
    const planLaneRows = (list, maxWidth) => {
      const rows = [];
      let cur = [], curW = 0;
      for (const u of list) {
        if (curW + u._w + GAP > maxWidth && cur.length) { rows.push({ items: cur, w: curW }); cur = []; curW = 0; }
        cur.push(u); curW += u._w + GAP;
      }
      if (cur.length) rows.push({ items: cur, w: curW - GAP });
      const contentW = Math.max(...rows.map((r) => r.w));
      const contentH = rows.reduce((a, r) => a + Math.max(...r.items.map((i) => i._h)) + GAP, -GAP);
      return { rows, contentW, contentH, boxW: contentW + LANE_PAD * 2, boxH: contentH + LANE_TITLE + LANE_PAD * 2 };
    };

    const placeRows = (plan, ox, oy, b) => {
      const lane = g.inv.boundaries.find((z) => z.id === b) || {};
      boxes.push({ id: b, x: ox, y: oy, w: plan.boxW, h: plan.boxH, label: lane.label || b, meta: lane });
      let y = oy + LANE_TITLE + LANE_PAD;
      for (const row of plan.rows) {
        const rowH = Math.max(...row.items.map((i) => i._h));
        let x = ox + LANE_PAD;
        for (const u of row.items) {
          nodes.set(u.id, { x, y: y + (rowH - u._h) / 2, w: u._w, h: u._h, unit: u, boundary: b });
          x += u._w + GAP;
        }
        y += rowH + GAP;
      }
    };

    if (mode === 'wide') {
      const ROW_BUDGET = 2520, TARGET_EXTENT = 1120;
      let x = 40, y = 40, rowH = 0;
      for (const b of order) {
        const plan = planLane(groups.get(b), TARGET_EXTENT);
        if (x > 40 && x + plan.boxW > ROW_BUDGET + 40) { x = 40; y += rowH + LANE_GAP; rowH = 0; }
        place(plan, x, y, b);
        x += plan.boxW + LANE_GAP;
        rowH = Math.max(rowH, plan.boxH);
      }
    } else {
      const LANE_MAX_W = 2280;
      let y = 40;
      for (const b of order) {
        const plan = planLaneRows(groups.get(b), LANE_MAX_W);
        placeRows(plan, 40, y, b);
        y += plan.boxH + LANE_GAP;
      }
    }

    // children inside containers
    for (const u of g.units) {
      if (!u.children.length) continue;
      const host = nodes.get(u.id);
      if (!host) continue;
      const cols = g.colsFor(u.children.length);
      u.children.forEach((c, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        nodes.set(c.id, {
          x: host.x + PAD + col * (g.CELL_W + g.CELL_GAP),
          y: host.y + u._header + PAD - 4 + row * (g.CELL_H + g.CELL_GAP),
          w: g.CELL_W, h: g.CELL_H, unit: c, boundary: host.boundary, nested: true,
        });
      });
    }

    // edge geometry + a from>to index so packets can travel the real curve
    const edges = [];
    const pairIndex = new Map();
    const parallel = new Map();
    for (const e of g.edges) {
      const a = nodes.get(e.from), b = nodes.get(e.to);
      if (!a || !b) continue;
      const k = `${e.from}>${e.to}`;
      const seen = parallel.get(k) || 0;
      parallel.set(k, seen + 1);
      const geo = edgeGeometry(a, b, mode, seen);
      const full = { ...e, ...geo, style: EDGE_STYLE[e.kind] || EDGE_STYLE.http };
      edges.push(full);
      if (!pairIndex.has(k)) pairIndex.set(k, full);
    }

    const W = Math.max(...boxes.map((z) => z.x + z.w)) + 40;
    const H = Math.max(...boxes.map((z) => z.y + z.h)) + 40;
    return { boxes, nodes, edges, pairIndex, width: W, height: H, mode };
  }

  function edgeGeometry(a, b, mode, lane = 0) {
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const bow = lane ? (lane % 2 ? 1 : -1) * (14 + lane * 10) : 0;
    let s, t;
    const dx = bc.x - ac.x, dy = bc.y - ac.y;
    // choose the facing sides
    if (Math.abs(dx) >= Math.abs(dy) * 0.9) {
      s = { x: dx >= 0 ? a.x + a.w : a.x, y: ac.y };
      t = { x: dx >= 0 ? b.x : b.x + b.w, y: bc.y };
    } else {
      s = { x: ac.x, y: dy >= 0 ? a.y + a.h : a.y };
      t = { x: bc.x, y: dy >= 0 ? b.y : b.y + b.h };
    }
    const cx = Math.max(38, Math.abs(t.x - s.x) * 0.44);
    const cy = Math.max(38, Math.abs(t.y - s.y) * 0.44);
    const horiz = Math.abs(t.x - s.x) >= Math.abs(t.y - s.y);
    const c1 = horiz ? { x: s.x + (t.x > s.x ? cx : -cx), y: s.y + bow } : { x: s.x + bow, y: s.y + (t.y > s.y ? cy : -cy) };
    const c2 = horiz ? { x: t.x - (t.x > s.x ? cx : -cx), y: t.y + bow } : { x: t.x + bow, y: t.y - (t.y > s.y ? cy : -cy) };
    const d = `M ${s.x} ${s.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${t.x} ${t.y}`;
    return { s, t, c1, c2, d, mid: { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 } };
  }

  // cubic bezier point at u
  function bez(p0, p1, p2, p3, u) {
    const m = 1 - u;
    return {
      x: m * m * m * p0.x + 3 * m * m * u * p1.x + 3 * m * u * u * p2.x + u * u * u * p3.x,
      y: m * m * m * p0.y + 3 * m * m * u * p1.y + 3 * m * u * u * p2.y + u * u * u * p3.y,
    };
  }

  /**
   * A point on a drawn edge, so a packet travels the same curve the eye sees.
   * Pass reverse=true when traversing the edge against its declared direction.
   */
  function pointOnEdge(edge, u, reverse) {
    const t = reverse ? 1 - u : u;
    return bez(edge.s, edge.c1, edge.c2, edge.t, t);
  }

  // ---------------------------------------------------------------- geometry helpers
  function nodeCapacity(u) {
    if (typeof u.concurrency === 'number') return u.concurrency;
    if (typeof u.replicas === 'number') return Math.max(1, u.replicas);
    if (u.kind === 'sandbox') return 8;
    if (u.kind === 'queue') return 1;
    if (u.kind === 'model-endpoint') return 4;
    if (u.kind === 'memory-store') return 6;
    if (u.kind === 'cache') return 8;
    return 3;
  }

  // ---------------------------------------------------------------- simulation
  // An arrival-driven walk over the real edges. Packets spend time ON the edge
  // (so the movement is visible), then occupy a slot at the node, queue when the
  // node is full, retry on error, split on fan-out edges and die on timeout.
  function createSim(g, layout, opts = {}) {
    const rnd = mulberry(opts.seed || 20260930);
    // The deployment has bounded work in flight (queues, pool sizes, concurrency
    // caps). Without a ceiling the fan-out branches would grow without limit and
    // the picture would stop resembling the system.
    const MAX_TOKENS = opts.maxTokens || 300;
    const pair = layout.pairIndex || new Map();
    const outEdges = new Map();
    for (const e of layout.edges) {
      if (!outEdges.has(e.from)) outEdges.set(e.from, []);
      outEdges.get(e.from).push(e);
    }
    const edgeBetween = (a, b) => pair.get(a + '>' + b) || pair.get(b + '>' + a) || null;

    const lanes = (g.inv.workloads || []).map((w) => ({
      def: w, period: w.arrival_ms, next: 300 + w.arrival_ms * (0.2 + rnd() * 0.8),
    }));

    const tokens = [];
    const events = [];
    const stats = new Map();
    const edgeLoad = new Map();
    let t = 0, seq = 0;

    for (const u of g.units) stats.set(u.id, { running: 0, wait: 0, done: 0, error: 0, peak: 0 });
    const bump = (id, k, v = 1) => {
      const s = stats.get(id);
      if (!s) return s;
      s[k] += v;
      if (k === 'running') s.peak = Math.max(s.peak, s.running);
      return s;
    };

    const dwellFor = (id) => {
      const u = g.byId.get(id) || {};
      const base = u.kind === 'model-endpoint' ? 1900
        : u.kind === 'sandbox' ? 1100
        : u.kind === 'memory-store' ? 150
        : u.kind === 'queue' ? 90
        : 250;
      return base * (0.6 + rnd() * 0.9);
    };
    const travelFor = (a, b) => {
      const e = edgeBetween(a, b);
      const base = e ? e.p50_ms : 220;
      return Math.max(110, Math.min(base, 2200));
    };
    const errorRateFor = (u, o) => {
      if (!u) return 0.012;
      if (u.state === 'empty-keys' || u.state === 'disabled' || u.state === 'inert') return 0.85;
      if (o.errorBoost) return Math.min(0.32, unitWeight(u) * (o.errorBoost || 0));
      if (u.kind === 'model-endpoint') return 0.05;
      if (u.kind === 'sandbox') return 0.04;
      return 0.012;
    };
    const unitWeight = (u) => (u.kind === 'runner' ? 0.4 : u.kind === 'memory-store' ? 0.09 : 0.14);

    function spawn(w) {
      if (tokens.length >= MAX_TOKENS) return null;
      const route = w.route && w.route.length ? w.route : [w.entry];
      const tk = {
        id: ++seq, lane: w.id, w, route, i: 0, node: route[0], prev: null,
        state: 'run', prog: 0, hold: dwellFor(route[0]), retries: 0, born: t, ms: 0,
      };
      tokens.push(tk);
      events.push({ t, text: `[${w.id}] arrival → ${route[0]}`, kind: 'trace', node: route[0] });
      return tk;
    }

    function step(dt) {
      for (const l of lanes) {
        l.next -= dt;
        if (l.next <= 0) { l.next = l.period * (0.5 + rnd()); spawn(l.def); }
      }

      for (let k = tokens.length - 1; k >= 0; k--) {
        const tk = tokens[k];
        if (!layout.nodes.has(tk.node)) { tokens.splice(k, 1); continue; }
        const unit = g.byId.get(tk.node) || {};
        const cap = Math.max(1, nodeCapacity(unit));
        const st = stats.get(tk.node);

        if (tk.state === 'run') {
          tk.hold -= dt;
          if (tk.hold > 0) continue;
          bump(tk.node, 'done');
          const next = tk.route[tk.i + 1];
          if (!next) {
            tokens.splice(k, 1);
            events.push({ t, text: `[${tk.w.id}] complete at ${tk.node} after ${((t - tk.born) / 1000).toFixed(1)}s`, kind: 'done', node: tk.node });
            continue;
          }
          const er = errorRateFor(unit, opts);
          if (rnd() < er && tk.retries < 2) {
            tk.retries++;
            bump(tk.node, 'error');
            events.push({ t, text: `[${tk.w.id}] ${tk.node} error (${(er * 100) | 0}%) → retry ${tk.retries}`, kind: 'error', node: tk.node });
            tk.hold = 340;
            continue;
          }
          tk.prev = tk.node;
          tk.i++;
          tk.node = next;
          tk.ms = travelFor(tk.prev, next);
          tk.prog = 0;
          tk.state = 'travel';
          const e = edgeBetween(tk.prev, next);
          if (e) edgeLoad.set(e.id, (edgeLoad.get(e.id) || 0) + 1);
          else events.push({ t, text: `[${tk.w.id}] unverified hop ${tk.prev} → ${next}`, kind: 'unverified', node: next });
          continue;
        }

        if (tk.state === 'travel') {
          tk.prog += dt / tk.ms;
          if (tk.prog < 1) continue;
          const e = edgeBetween(tk.prev, tk.node);
          if (e) edgeLoad.set(e.id, Math.max(0, (edgeLoad.get(e.id) || 1) - 1));
          tk.prog = 1;
          tk.hold = dwellFor(tk.node);
          if (st.running < cap) { tk.state = 'run'; bump(tk.node, 'running'); }
          else { tk.state = 'blocked'; tk.since = t; bump(tk.node, 'wait', dt / 1000); }
          // fan-out along the real outgoing fan-out edges
          const fan = (outEdges.get(tk.node) || []).filter((x) => x.semantics === 'fanout' && x.to !== tk.route[tk.i + 1]);
          for (const f of fan.slice(0, 2)) {
            if (tokens.length >= MAX_TOKENS) break;
            tokens.push({
              id: ++seq, lane: tk.w.id, w: tk.w, route: [f.to, ...tk.route.slice(tk.i + 1)],
              i: 0, node: f.to, prev: null, state: 'run', prog: 0, hold: dwellFor(f.to),
              retries: 0, born: t, ms: 0, branch: true,
            });
            events.push({ t, text: `[${tk.w.id}] fan-out → ${f.to}`, kind: 'fanout', node: f.to });
          }
          continue;
        }

        if (tk.state === 'blocked') {
          if (st.running < cap) {
            tk.state = 'run';
            bump(tk.node, 'running');
            tk.hold = dwellFor(tk.node);
          } else {
            bump(tk.node, 'wait', dt / 1000);
          }
          continue;
        }
      }

      t += dt;
      if (events.length > 400) events.splice(0, events.length - 400);
      return t;
    }

    return {
      kind: 'sim',
      step, stats, tokens, events, edgeLoad,
      get time() { return t; },
      snapshot() {
        const occ = {};
        for (const [id, s] of stats) occ[id] = { running: s.running, peak: s.peak, done: s.done, error: s.error, wait: Math.round(s.wait) };
        return { t, tokens: tokens.length, occ, events: events.slice(-26) };
      },
    };
  }

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --------------------------------------------------------- real trace player
  // Turns a captured run into time-stamped traversals that can be evaluated at
  // ANY time t, which is what makes scrubbing possible: the picture at t is a
  // pure function of the recording, not of how long the page has been open.
  function createTracePlayer(g, layout, derived, kindName) {
    const pair = layout.pairIndex || new Map();
    const events = traceEvents(kindName, derived);
    const trav = [];
    for (const e of events) {
      const forward = pair.get(e.from + '>' + e.to) || null;
      const back = pair.get(e.to + '>' + e.from) || null;
      const dur = e.kind === 'stream' ? 900
        : e.ms ? Math.min(Math.max(260, e.ms), 2600)
        : e.kind === 'hop' ? 300
        : 400;
      trav.push({
        at: e.at, dur, from: e.from, to: e.to, kind: e.kind,
        label: e.label || '', node: e.node || e.to, ms: e.ms || null,
        edge: forward || back || null, reverse: !forward && !!back,
      });
    }
    trav.sort((a, b) => a.at - b.at);
    const span = trav.length ? trav[trav.length - 1].at + trav[trav.length - 1].dur : 1;

    function snapshotAt(t) {
      const occ = new Map();
      const live = [];
      let last = null;
      for (const tr of trav) {
        if (tr.at > t) break;
        if (t < tr.at + tr.dur) live.push({ ...tr, u: (t - tr.at) / tr.dur });
        else {
          const s = occ.get(tr.node) || { running: 0, done: 0, error: 0, wait: 0, peak: 0 };
          if (tr.kind === 'error') s.error++; else s.done++;
          occ.set(tr.node, s);
        }
        last = tr;
      }
      for (const l of live) {
        const s = occ.get(l.node) || { running: 0, done: 0, error: 0, wait: 0, peak: 0 };
        s.running++;
        s.peak = Math.max(s.peak || 0, s.running);
        occ.set(l.node, s);
      }
      return { t, occ, live, last, span };
    }

    return { kind: 'trace', kindName, traversals: trav, span, snapshotAt, total: events.length };
  }

  // ------------------------------------------------- real frames -> hop events
  // Each recorded frame is mapped onto the node that produced it. The mapping is
  // a rule table over the event vocabulary the deployment actually emits, so a
  // new event type shows up as an unmapped event instead of being hidden.
  const ENGINE_NODE = {
    'control-plane': 'eng-control', 'asset-engine': 'eng-asset', 'scanner-engine': 'eng-scanner',
    'vapt-engine': 'eng-vapt', 'risk-engine': 'eng-risk', 'reporting-engine': 'eng-reporting',
    'compliance-engine': 'eng-compliance', 'soc-engine': 'eng-soc', 'threat-model-engine': 'eng-threat',
    'audit-engine': 'eng-audit', 'alert-engine': 'eng-alert', 'operations-engine': 'eng-ops',
    'ai-engine': 'eng-ai', ai: 'eng-ai', agi: 'eng-ai', engines: 'engine-registry',
  };
  const engineNode = (tag) => ENGINE_NODE[tag] || 'eng-control';
  const S = (v) => String(v == null ? '' : v).slice(0, 96);

  function sweepEvents(derived) {
    const out = [];
    const steps = (derived && derived.real_trace_steps) || [];
    let t = 0;
    for (const st of steps) {
      const eng = engineNode(st.engine);
      out.push({ at: t, from: 'cloudflare', to: 'traefik', kind: 'hop', label: 'GET ' + st.path });
      out.push({ at: t + 8, from: 'traefik', to: 'api', kind: 'hop' });
      out.push({ at: t + 16, from: 'api', to: eng, kind: 'claim', node: eng, ms: st.ms,
        label: `${st.method} ${st.path} → ${st.engine} ${st.status} ${st.ms}ms` });
      out.push({ at: t + 16 + (st.ms || 60), from: eng, to: st.status >= 400 ? 'mw-audit' : 'db',
        kind: st.status >= 400 ? 'error' : 'done' });
      t += 240;
    }
    return out;
  }

  // Streaming arrives as hundreds of individual token frames. Drawing one packet
  // per token would saturate the canvas and hide the topology, so runs of the
  // same stream within a short window collapse into one sustained pulse.
  const STREAM_COALESCE_MS = 1500;
  // Streaming arrives as hundreds of token frames, often buffered and flushed in
  // one burst. Drawing one packet per token would saturate the canvas, and
  // drawing one packet per burst would hide the work. So each burst is spread
  // across a window proportional to the number of frames it contained.
  // This spread is presentational; the burst start time is the measured one.
  const STREAM_GAP_MS = 2500;
  function groupStreams(frames, isStream) {
    const groups = [];
    let cur = null;
    for (const f of frames) {
      if (!isStream(f)) continue;
      if (!cur || f.at_ms - cur.end > STREAM_GAP_MS) {
        cur = { start: f.at_ms, end: f.at_ms, n: 0, kinds: new Set() };
        groups.push(cur);
      }
      cur.end = f.at_ms; cur.n++; cur.kinds.add(f.event);
    }
    return groups;
  }
  function streamPulses(group, from, to, node, budget) {
    const out = [];
    const count = Math.max(2, Math.min(budget, Math.round(group.n / 12)));
    const spread = Math.min(7000, Math.max(600, group.n * 55));
    const kinds = [...group.kinds].join('+');
    for (let i = 0; i < count; i++) {
      const at = group.start + (spread * i) / count;
      out.push({ at, from, to, kind: 'stream', node,
        label: `${kinds} \u00d7${group.n} frames → ${to === 'm-deepseek' ? 'deepseek-v4-flash' : 'agent loop'} (burst ${group.start}ms)` });
      out.push({ at: at + 5, from: to, to: from, kind: 'stream', node: to });
    }
    return out;
  }

  function agiEvents(derived) {
    const a = derived && derived.agi_session;
    if (!a) return [];
    const out = [];
    const claim = (at, from, to, kind, node, label) => out.push({ at, from, to, kind, node: node || to, label });
    claim(0, 'api', 'agi-runner', 'claim', 'agi-runner', `POST /agi/engagements/${a.engagement_id}/sessions → session ${a.session_id}`);
    for (const h of (a.hops || [])) {
      if (h.kind !== 'http' && h.kind !== 'sse-open') continue;
      out.push({ at: h.at_ms, from: 'api', to: 'agi-runner', kind: 'hop', label: `${h.method || ''} ${h.path || ''} ${h.status || ''}`.trim() });
    }
    const streamGroups = groupStreams(a.frames || [], (f) => f.event === 'reasoning' || f.event === 'token');
    for (const grp of streamGroups) {
      for (const p of streamPulses(grp, 'agi-loop', 'm-deepseek', 'agi-loop', 14)) out.push(p);
    }
    const isStreamFrame = (f) => f.event === 'reasoning' || f.event === 'token';
    for (const f of (a.frames || [])) {
      const e = f.event, at = f.at_ms;
      if (isStreamFrame(f)) continue;
      if (e === 'action' || e === 'tool_result' || e === 'shell' || e === 'path_probe' || e === 'tool_error') {
        const bad = e === 'tool_error';
        // the lease is a real hop: loop -> pool -> a specific container
        claim(at, 'agi-loop', 'sandbox-pool', bad ? 'error' : 'claim', 'sandbox-pool', S(f.data));
        claim(at + 30, 'sandbox-pool', 'sandbox-a', 'claim', 'sandbox-a');
        claim(at + 40 + 700, 'sandbox-a', 'agi-loop', 'done');
      } else if (e === 'engine_call') {
        claim(at, 'agi-loop', 'api', 'claim', 'eng-asset', S(f.data));
        claim(at + 60, 'api', 'agi-loop', 'done');
      } else if (e === 'mission_control') {
        claim(at, 'agi-loop', 'agi-oversight', 'claim', 'agi-oversight', 'oversight verdict (advisory only)');
      } else if (e === 'skills_selected' || e === 'skill_execution_plan') {
        claim(at, 'agi-loop', 'agi-toolcatalog', 'claim', 'agi-toolcatalog', S(f.data));
      } else if (e === 'asset_plan' || e === 'info_request' || e === 'job_progress' || e === 'loop_progress' || e === 'loop_status') {
        claim(at, 'agi-runner', 'agi-loop', 'hop');
      } else if (e === 'final_decision' || e === 'campaign_done' || e === 'loop_stop') {
        claim(at, 'agi-loop', 'agi-finding-mgr', 'claim', 'agi-finding-mgr', S(f.data));
        claim(at + 120, 'agi-finding-mgr', 'api', 'done', 'api', 'findings + activity callback');
      } else if (e === 'ai_credit_spend' || e === 'turn_metrics') {
        claim(at, 'agi-loop', 'api', 'done');
      }
    }
    return out.sort((x, y) => x.at - y.at);
  }

  function assistantEvents(derived) {
    const a = derived && derived.ai_assistant;
    if (!a) return [];
    const out = [];
    out.push({ at: 0, from: 'api', to: 'eng-ai', kind: 'claim', node: 'eng-ai', label: 'POST /ai/agent/chat/stream' });
    out.push({ at: 200, from: 'eng-ai', to: 'eng-asset', kind: 'claim', node: 'eng-asset', label: 'scope/resolve — org data scope' });
    out.push({ at: 500, from: 'eng-asset', to: 'eng-ai', kind: 'done', label: 'scope_card: 37 assets, confirm required' });
    out.push({ at: 700, from: 'eng-ai', to: 'eng-asset', kind: 'claim', node: 'eng-asset', label: 'scope/confirm → grant issued' });
    out.push({ at: 900, from: 'eng-asset', to: 'eng-ai', kind: 'done' });
    const aStreams = groupStreams(a.frames || [], (f) => f.event === 'delta' || f.event === 'reasoning');
    for (const grp of aStreams) {
      for (const p of streamPulses(grp, 'eng-ai', 'm-deepseek', 'eng-ai', 12)) out.push(p);
    }
    for (const f of (a.frames || [])) {
      if (f.event === 'delta' || f.event === 'reasoning') continue;
      if (f.event === 'usage' || f.event === 'done') {
        out.push({ at: f.at_ms, from: 'eng-ai', to: 'api', kind: 'done', label: f.event });
      }
    }
    const runStart = 5100;
    out.push({ at: runStart, from: 'eng-ai', to: 'q-ai', kind: 'claim', node: 'q-ai', label: 'POST /ai/agent/runs (chief specialist)' });
    out.push({ at: runStart + 40, from: 'q-ai', to: 'worker-ai', kind: 'claim', node: 'worker-ai' });
    out.push({ at: runStart + 80, from: 'worker-ai', to: 'm-deepseek', kind: 'stream', node: 'worker-ai' });
    out.push({ at: runStart + 4000, from: 'm-deepseek', to: 'worker-ai', kind: 'stream', node: 'm-deepseek' });
    out.push({ at: runStart + 6000, from: 'worker-ai', to: 'db', kind: 'done', label: 'ai_agent_runs status=queued' });
    out.push({ at: 22144, from: 'db', to: 'eng-ai', kind: 'done', label: 'run success → response circled back' });
    return out.sort((x, y) => x.at - y.at);
  }

  function traceEvents(kind, derived) {
    const ev = kind === 'agi' ? agiEvents(derived)
      : kind === 'assistant' ? assistantEvents(derived)
      : sweepEvents(derived);
    // Sort by captured time. This deliberately keeps overlapping work visible:
    // a 4s call's return lands after several later requests have already been
    // dispatched, which is what the live deployment actually did.
    return ev.slice().sort((a, b) => a.at - b.at);
  }

  // -------------------------------------------------------------- legend
  function legend(g) {
    const out = {};
    for (const u of g.units) {
      const grp = KIND_GROUP[u.kind] || 'other';
      out[grp] = out[grp] || { count: 0, kinds: new Set(), ids: [] };
      out[grp].count++;
      out[grp].kinds.add(u.kind);
      out[grp].ids.push(u.label);
    }
    return out;
  }

  return {
    BOUNDARY_ORDER, KIND_GROUP, KIND_GLYPH, KIND_COLOR, EDGE_STYLE, STATE_COLOR,
    buildGraph, computeLayout, edgeGeometry, bez, pointOnEdge, nodeCapacity,
    createSim, createTracePlayer, legend, mulberry,
    traceEvents, engineNode,
  };
});
