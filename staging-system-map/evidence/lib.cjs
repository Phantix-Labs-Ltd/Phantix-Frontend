/**
 * lib.cjs — shared capture plumbing for the org-4 lifecycle run.
 *
 * One continuous, phase-tagged recording:
 *   phase 1  asset onboarding (6 assets: 3 for VAPT, 3 for the AGI session)
 *   phase 2  VAPT campaign against the 3 VAPT assets
 *   phase 3  AGI pentest session against the 3 AGI assets
 *
 * Every HTTP hop and every streamed frame is stamped with ms since capture
 * start, so the whole lifecycle animates as one run.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = 'https://staging.phantix.site';
const API = BASE + '/api/v1';
// The device fingerprint includes the User-Agent, so it must stay identical to
// the one the accounts were first registered with.
const UA = 'staging-topology-probe/1.0';

const ACCOUNTS = {
  initiator: { email: 'agi-test@phantixvulnserver.online', device: 'agi-test-device-0001', user: 14 },
  authorizer: { email: 'agi-authorizer@phantixvulnserver.online', device: 'agi-authorizer-device-0001', user: 15 },
};

class Recorder {
  constructor(outFile) {
    this.t0 = Date.now();
    this.out = outFile;
    this.phase = 'boot';
    this.phases = [];
    this.hops = [];
    this.events = [];
    this.sse = [];
    this.notes = {};
  }
  now() { return Date.now() - this.t0; }
  begin(id, label) { this.phase = id; this.phases.push({ id, label, t0: this.now() }); this.event(id, 'phase', `▶ ${label}`); return this; }
  end(summary) {
    const p = this.phases[this.phases.length - 1];
    if (p) { p.t1 = this.now(); p.summary = summary; }
    this.event(this.phase, 'phase', `■ ${summary || ''}`);
  }
  hop(h) {
    const rec = { at: this.now(), phase: this.phase, ...h };
    this.hops.push(rec);
    const mark = h.status >= 200 && h.status < 300 ? 'OK ' : h.status ? 'ERR' : '---';
    if (!h.quiet) console.log(`  [${String(rec.at).padStart(6)}ms] ${mark} ${String(h.status).padEnd(4)} ${String(h.ms ? h.ms + 'ms' : '').padEnd(8)} ${String(h.method || '').padEnd(5)} ${String(h.path || h.node || '').slice(0, 60)} ${h.note ? '· ' + String(h.note).slice(0, 70) : ''}`);
    return rec;
  }
  event(phase, kind, text, node) { const e = { at: this.now(), phase, kind, text, node }; this.events.push(e); return e; }
  frame(f) { this.sse.push({ at: this.now(), ...f }); return f; }
  write() {
    const doc = {
      ok: !this.failed, real: true, source: 'live staging ' + BASE, org: 4,
      captured_at: new Date().toISOString(), span_ms: this.now(),
      accounts: ACCOUNTS, phases: this.phases, hops: this.hops,
      events: this.events, sse: this.sse, notes: this.notes,
    };
    fs.writeFileSync(this.out, JSON.stringify(doc, null, 1));
    console.log(`\nwrote ${path.basename(this.out)} — ${this.hops.length} hops, ${this.sse.length} streamed frames, ${(this.now() / 1000).toFixed(1)}s span`);
    return doc;
  }
}

function req(method, p, { token, dual, body, timeout = 60000, rec, phase, note, quiet } = {}) {
  const url = p.startsWith('http') ? p : API + p;
  return new Promise((resolve) => {
    const u = new URL(url);
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = { Accept: 'application/json', 'User-Agent': UA };
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
    if (token) headers.Authorization = 'Bearer ' + token;
    if (dual) headers['X-Dual-Control-Session'] = dual;
    const started = Date.now();
    const r = https.request({ method, hostname: u.hostname, port: 443, path: u.pathname + u.search, headers, timeout }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        let json = null; try { json = JSON.parse(d); } catch {}
        const out = { status: res.statusCode, ms: Date.now() - started, raw: d, json, path: u.pathname + u.search, method };
        if (rec) rec.hop({ ...out, raw: undefined, json: undefined, phase, note, quiet });
        resolve(out);
      });
    });
    r.on('timeout', () => { r.destroy(); const out = { status: 0, ms: Date.now() - started, raw: '', json: null, path: u.pathname, method, error: 'timeout' }; if (rec) rec.hop({ ...out, phase, note }); resolve(out); });
    r.on('error', (e) => { const out = { status: 0, ms: Date.now() - started, raw: '', json: null, path: u.pathname, method, error: String(e.message) }; if (rec) rec.hop({ ...out, phase, note }); resolve(out); });
    if (payload) r.write(payload);
    r.end();
  });
}

/** SSE reader: every named frame is recorded with its arrival time. */
function stream(p, { token, dual, rec, label, maxMs = 90000, onFrame } = {}) {
  return new Promise((resolve) => {
    const u = new URL(API + p);
    const headers = { Accept: 'text/event-stream', 'User-Agent': UA };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (dual) headers['X-Dual-Control-Session'] = dual;
    const started = Date.now();
    let buf = '', ev = 'message', n = 0;
    const counts = {};
    const r = https.request({ method: 'GET', hostname: u.hostname, port: 443, path: u.pathname + u.search, headers }, (res) => {
      if (rec) rec.hop({ status: res.statusCode, ms: Date.now() - started, method: 'SSE', path: p, phase: rec.phase, note: `${label} open` });
      if (res.statusCode !== 200) { resolve({ status: res.statusCode, frames: 0, counts }); return; }
      res.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (line.startsWith('event:')) ev = line.slice(6).trim();
          else if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            n++; counts[ev] = (counts[ev] || 0) + 1;
            if (rec) rec.frame({ label, event: ev, data: data.slice(0, 900) });
            if (onFrame) onFrame(ev, data);
          }
        }
      });
      res.on('end', () => resolve({ status: 200, frames: n, counts }));
    });
    r.on('error', (e) => resolve({ status: 0, frames: n, counts, error: e.message }));
    r.end();
    setTimeout(() => { try { r.destroy(); } catch {} resolve({ status: 200, frames: n, counts, timedOut: true }); }, maxMs);
  });
}

async function login(who, rec, phase) {
  const a = ACCOUNTS[who];
  const r = await req('POST', '/org-users/auth/login', {
    body: { email: a.email, device_id: a.device, purpose: 'dual_control' },
    rec, phase, note: `${who} login`,
  });
  const j = r.json || {};
  if (!j.access_token) throw new Error(`login failed for ${who}: ${r.status} ${r.raw.slice(0, 200)}`);
  return { token: j.access_token, dual: j.session_token, mfa: j.mfa_required, who };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { BASE, API, UA, ACCOUNTS, Recorder, req, stream, login, sleep };
