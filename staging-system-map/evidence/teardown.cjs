#!/usr/bin/env node
/**
 * teardown.cjs — release everything Org 4 currently has running, before the
 * clean-slate capture: stop live AGI sessions (they hold sandbox leases) and
 * cancel active VAPT campaigns.
 */
const https = require('https');
const path = require('path');
const fs = require('fs');

const BASE = 'https://staging.phantix.site';
const API = BASE + '/api/v1';
const EMAIL = 'agi-test@phantixvulnserver.online';
const DEVICE = 'agi-test-device-0001';
const UA = 'staging-topology-probe/1.0';   // must match the registered device fingerprint

function req(method, p, { token, session, body } = {}) {
  const url = p.startsWith('http') ? p : API + p;
  return new Promise((resolve) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const headers = { Accept: 'application/json', 'User-Agent': UA };
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
    if (token) headers.Authorization = 'Bearer ' + token;
    if (session) headers['X-Dual-Control-Session'] = session;
    const started = Date.now();
    const r = https.request({ method, hostname: u.hostname, port: 443, path: u.pathname + u.search, headers, timeout: 30000 }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, ms: Date.now() - started, raw: d }));
    });
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, ms: Date.now() - started, raw: '' }); });
    r.on('error', (e) => resolve({ status: 0, ms: Date.now() - started, raw: e.message }));
    if (payload) r.write(payload);
    r.end();
  });
}
const j = (r) => { try { return JSON.parse(r.raw); } catch { return null; } };
const log = (...a) => console.log(...a);

(async () => {
  let r = await req('POST', '/org-users/auth/login', { body: { email: EMAIL, device_id: DEVICE, purpose: 'dual_control' } });
  const a = j(r) || {};
  const token = a.access_token, dual = a.session_token;
  log(`login ${r.status} mfa=${a.mfa_required} token=${token ? 'yes' : 'NO'}`);
  if (!token) { log('aborting: no token'); process.exit(1); }

  // ---- AGI sessions
  r = await req('GET', '/agi/sessions', { token, session: dual });
  const sess = (j(r) || {}).items || j(r) || [];
  log(`\nAGI sessions: ${sess.length}`);
  for (const s of sess) log(`  #${s.id} status=${s.status} engagement=${s.engagement_id} runner=${s.runner_session_id || '-'}`);
  const live = sess.filter((s) => ['running', 'ready', 'paused', 'provisioning'].includes(s.status));
  for (const s of live) {
    const st = await req('POST', `/agi/sessions/${s.id}/stop`, { token, session: dual, body: {} });
    log(`  stop #${s.id} → ${st.status} ${String(st.raw).slice(0, 140)}`);
  }
  // also try the runner directly for anything still leased
  for (const s of sess) {
    if (!s.runner_session_id) continue;
    const st = await req('POST', `/agi/sessions/${s.id}/stop`, { token, session: dual, body: {} });
    if (st.status >= 400) log(`  (stop #${s.id} again → ${st.status})`);
  }

  // ---- VAPT campaigns
  r = await req('GET', '/vapt/campaigns', { token, session: dual });
  const camps = (j(r) || {}).items || j(r) || [];
  log(`\nVAPT campaigns: ${camps.length}`);
  for (const c of camps) log(`  #${c.id} status=${c.status} name=${String(c.name || '').slice(0, 40)}`);
  const active = camps.filter((c) => ['active', 'running', 'pending', 'pending_approval', 'paused', 'queued', 'draft'].includes(c.status));
  for (const c of active) {
    const cn = await req('POST', `/vapt/campaigns/${c.id}/cancel`, { token, session: dual, body: {} });
    log(`  cancel #${c.id} → ${cn.status} ${String(cn.raw).slice(0, 140)}`);
  }

  // ---- re-read
  r = await req('GET', '/agi/sessions', { token, session: dual });
  const sess2 = (j(r) || {}).items || j(r) || [];
  log(`\nAGI sessions now: ${sess2.map((s) => `#${s.id}:${s.status}`).join(', ') || '(none)'}`);
  r = await req('GET', '/vapt/campaigns', { token, session: dual });
  const camps2 = (j(r) || {}).items || j(r) || [];
  log(`VAPT campaigns now: ${camps2.map((c) => `#${c.id}:${c.status}`).join(', ') || '(none)'}`);

  fs.writeFileSync(path.join(__dirname, 'teardown-report.json'),
    JSON.stringify({ at: new Date().toISOString(), sessions: sess2, campaigns: camps2 }, null, 2));
})();
