#!/usr/bin/env node
/**
 * Real test calls against staging, org 4, no-MFA account (v2, corrected paths).
 * Engine attribution is taken from the LIVE /status endpoint inventory, not from guesswork.
 * Output: org4-trace.json — a real trace through the deployed system.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = 'https://staging.phantix.site';
const API = BASE + '/api/v1';
const EMAIL = 'agi-test@phantixvulnserver.online';
const DEVICE = 'agi-test-device-0001';
const OUT = path.join(__dirname, 'org4-trace.json');

// --- live endpoint inventory (tags = the engine that declares the route)
const status = JSON.parse(fs.readFileSync(path.join(__dirname, 'staging-status.json'), 'utf8'));
const routeMap = new Map();
for (const e of status.endpoints || []) {
  routeMap.set(`${e.method} ${e.path}`, (e.tags || []).filter((t, i, a) => a.indexOf(t) === i));
}
const tagsFor = (m, p) => routeMap.get(m + ' /api/v1' + p) || routeMap.get(m + ' ' + p) || ['unmapped'];
const engineOf = (tags) => tags.find((t) => /engine|control-plane|agi|agent/.test(t)) || tags[0] || 'unmapped';

const steps = [];
const t0 = Date.now();

function req(method, p, { token, session, body } = {}) {
  const url = p.startsWith('http') ? p : API + p;
  return new Promise((resolve) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const headers = { Accept: 'application/json', 'User-Agent': 'staging-topology-probe/1.0' };
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
    if (token) headers.Authorization = 'Bearer ' + token;
    if (session) headers['X-Dual-Control-Session'] = session;
    const started = Date.now();
    const r = https.request({ method, hostname: u.hostname, port: 443, path: u.pathname + u.search, headers, timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, ms: Date.now() - started, bytes: Buffer.byteLength(data), correlation: res.headers['x-correlation-id'] || null, body: data, cf: res.headers['cf-ray'] || null }));
    });
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, ms: Date.now() - started, bytes: 0, error: 'timeout' }); });
    r.on('error', (e) => resolve({ status: 0, ms: Date.now() - started, bytes: 0, error: String(e.message) }));
    if (payload) r.write(payload);
    r.end();
  });
}

function summarize(raw) {
  try {
    const j = JSON.parse(raw || '{}');
    if (Array.isArray(j)) return `array(${j.length})`;
    if (j.items && Array.isArray(j.items)) return `items(${j.items.length})`;
    if (j.total !== undefined) return `total=${j.total}`;
    if (j.detail) return typeof j.detail === 'string' ? j.detail.slice(0, 80) : `error:${j.detail.code || 'object'}`;
    return Object.keys(j).slice(0, 5).join(',');
  } catch { return (raw || '').slice(0, 60); }
}

function record(step, method, p, res, extra = {}) {
  const tags = tagsFor(method, p);
  const engine = engineOf(tags);
  const entry = { step, method, path: p, status: res.status, ms: res.ms, bytes: res.bytes, engine, tags, correlation: res.correlation, summary: summarize(res.body), error: res.error || null, at_ms: Date.now() - t0, ...extra };
  steps.push(entry);
  const mark = res.status >= 200 && res.status < 300 ? 'OK  ' : res.status >= 300 && res.status < 400 ? 'REDR' : res.status ? 'ERR ' : 'DEAD';
  console.log(`${mark} ${String(res.status).padEnd(4)} ${String(res.ms + 'ms').padEnd(9)} ${method.padEnd(4)} ${p.padEnd(46)} [${engine}] ${entry.summary}`);
  return entry;
}

const CALLS = [
  ['GET', '/org-users/me/permissions', 'control_plane'],
  ['GET', '/org-users/dual-control', 'control_plane'],
  ['GET', '/notifications', 'control_plane'],
  ['GET', '/integrations/catalog', 'control_plane'],
  ['GET', '/integrations/installations', 'control_plane'],

  ['GET', '/assets', 'asset_engine'],
  ['GET', '/asset-tags', 'asset_engine'],
  ['GET', '/assets/intelligence/dashboard', 'asset_engine'],
  ['GET', '/assets/intelligence/graph', 'asset_engine'],
  ['GET', '/assets/intelligence/events/recent', 'asset_engine'],

  ['GET', '/scans/jobs', 'scanner_engine'],
  ['GET', '/scans/jobs/active', 'scanner_engine'],
  ['GET', '/scans/results', 'scanner_engine'],
  ['GET', '/scans/exposure', 'scanner_engine'],
  ['GET', '/scans/consent', 'scanner_engine'],
  ['GET', '/cloud-security/connectors', 'scanner_engine'],

  ['GET', '/vapt/procedures', 'vapt_engine'],
  ['GET', '/vapt/settings', 'vapt_engine'],
  ['GET', '/vapt/campaigns', 'vapt_engine'],
  ['GET', '/vapt/schedules', 'vapt_engine'],

  ['GET', '/risks', 'risk_engine'],
  ['GET', '/findings/intake', 'reporting_engine'],
  ['GET', '/assessments', 'reporting_engine'],
  ['GET', '/reports', 'reporting_engine'],
  ['GET', '/posture', 'reporting_engine'],
  ['GET', '/knowledge/entries', 'reporting_engine'],
  ['GET', '/compliance/frameworks', 'compliance_engine'],
  ['GET', '/compliance/assessments', 'compliance_engine'],

  ['GET', '/soc/dashboard', 'soc_engine'],
  ['GET', '/soc/detections', 'soc_engine'],
  ['GET', '/soc/cases', 'soc_engine'],
  ['GET', '/soc/dashboard/cases-summary', 'soc_engine'],
  ['GET', '/soc/dashboard/mitre-matrix', 'soc_engine'],

  ['GET', '/threat-models', 'threat_model_engine'],
  ['GET', '/context/projects', 'threat_model_engine'],

  ['GET', '/ai/settings', 'ai_engine'],
  ['GET', '/engines/ai/status', 'ai_engine'],

  ['GET', '/agi/access', 'ai_engine/agi'],
  ['GET', '/agi/agreement', 'ai_engine/agi'],
  ['GET', '/agi/engagements', 'ai_engine/agi'],
  ['GET', '/agi/sessions', 'ai_engine/agi'],
  ['GET', '/agi/knowledge', 'ai_engine/agi'],
  ['GET', '/agi/org/context-packs', 'ai_engine/agi'],

  ['GET', '/engines', 'engine registry'],
  ['GET', '/audit/events', 'audit_engine'],
  ['GET', '/alerts/events', 'alert_engine'],
  ['GET', '/alerts/settings', 'alert_engine'],
  ['GET', '/logs', 'operations_engine'],
  ['GET', '/ops/health', 'operations_engine'],
];

(async () => {
  console.log('=== live endpoint inventory loaded: ' + (status.endpoints || []).length + ' routes ===\n');
  // health through the real ingress
  let r = await req('GET', BASE + '/health');
  record('edge-health', 'GET', BASE + '/health', r, { ingress: 'cloudflare -> traefik -> api' });
  r = await req('GET', BASE + '/status');
  record('live-status', 'GET', BASE + '/status', r, { ingress: 'cloudflare -> traefik -> api' });

  // anonymous denial, for the record
  r = await req('GET', '/assets');
  record('anonymous-denied', 'GET', '/assets', r, { note: 'no token' });

  // login
  r = await req('POST', '/org-users/auth/login', { body: { email: EMAIL, device_id: DEVICE, purpose: 'dual_control' } });
  let token = null, session = null, mfa = null, uid = null;
  try { const j = JSON.parse(r.body); token = j.access_token; session = j.session_token; mfa = j.mfa_required; uid = j.user_id; } catch {}
  record('login', 'POST', '/org-users/auth/login', r, { auth: { type: 'passwordless', purpose: 'dual_control', mfa_required: mfa, user_id: uid } });
  console.log(`     -> mfa_required=${mfa} user_id=${uid}\n`);
  if (!token) { fs.writeFileSync(OUT, JSON.stringify({ ok: false, real: true, steps }, null, 2)); return; }

  for (const [m, p, hint] of CALLS) {
    const res = await req(m, p, { token, session });
    record('call', m, p, res, { hint });
  }

  // org token on a staff surface
  r = await req('GET', '/metrics', { token, session });
  record('staff-surface-with-org-token', 'GET', '/metrics', r, { note: 'expect 401 — org tokens are not staff tokens' });

  const okSteps = steps.filter((s) => s.status >= 200 && s.status < 300);
  const byEngine = {};
  for (const s of okSteps) {
    byEngine[s.engine] = byEngine[s.engine] || { calls: 0, total_ms: 0, max_ms: 0, routes: [] };
    byEngine[s.engine].calls++;
    byEngine[s.engine].total_ms += s.ms;
    byEngine[s.engine].max_ms = Math.max(byEngine[s.engine].max_ms, s.ms);
    byEngine[s.engine].routes.push(s.path);
  }
  for (const k of Object.keys(byEngine)) byEngine[k].avg_ms = Math.round(byEngine[k].total_ms / byEngine[k].calls);

  const out = {
    ok: true, real: true,
    source: 'live staging https://staging.phantix.site',
    org: 4, account: EMAIL, device_id: DEVICE,
    mfa_required: mfa, dual_control_session: !!session,
    captured_at: new Date().toISOString(),
    total_steps: steps.length, ok_steps: okSteps.length,
    engine_latency: byEngine,
    steps,
    note: 'Engine attribution is derived from the live /status endpoint inventory (the tag declared by each route), not from a hand-written story.',
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\n${okSteps.length}/${steps.length} succeeded.`);
  console.log('\nengine latency (real):');
  Object.entries(byEngine).sort((a, b) => b[1].calls - a[1].calls).forEach(([k, v]) => console.log(`  ${k.padEnd(22)} calls=${String(v.calls).padEnd(3)} avg=${String(v.avg_ms + 'ms').padEnd(8)} max=${v.max_ms}ms`));
  console.log('\nwrote ' + OUT);
})();
