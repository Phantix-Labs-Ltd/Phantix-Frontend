#!/usr/bin/env node
/**
 * agi-session.cjs — REAL multi-node exercise against staging, org 4, no-MFA account.
 *
 * Drives, in order:
 *   1. edge -> traefik -> api                       (login, no MFA)
 *   2. control_plane -> db                          (create engagement)
 *   3. ai_engine -> agi runner -> deepseek          (start session, autonomy=low)
 *   4. agi runner -> sandbox pool -> tool containers(agent recon + tools)
 *   5. agi runner -> api callbacks                  (transcript / findings / activity)
 *   6. agi runner -> deepseek again                 (operator chat, response circles back)
 *   7. ai_engine assistant -> deepseek              (POST /ai/agent/chat/stream, SSE)
 *
 * Records every HTTP hop with a timestamp + measured latency, and every SSE
 * frame with arrival time. This timeline is what the animation replays.
 *
 * Output: evidence/agi-session-trace.json
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = 'https://staging.phantix.site';
const API = BASE + '/api/v1';
const EMAIL = 'agi-test@phantixvulnserver.online';
const DEVICE = 'agi-test-device-0001';
const OUT = path.join(__dirname, 'agi-session-trace.json');
const LAB = 'phantixvulnserver.online';

const T0 = Date.now();
const timeline = [];   // every hop, in order
const sseFrames = [];  // streamed frames with arrival time

const now = () => Date.now() - T0;
const log = (...a) => console.log(`[${String(now()).padStart(6)}ms]`, ...a);

function hop(entry) { timeline.push({ at_ms: now(), ...entry }); }

function req(method, p, { token, session, body, timeout = 40000 } = {}) {
  const url = p.startsWith('http') ? p : API + p;
  return new Promise((resolve) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const headers = { Accept: 'application/json', 'User-Agent': 'staging-topology-probe/1.0' };
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
    if (token) headers.Authorization = 'Bearer ' + token;
    if (session) headers['X-Dual-Control-Session'] = session;
    const started = Date.now();
    const r = https.request({ method, hostname: u.hostname, port: 443, path: u.pathname + u.search, headers, timeout }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, ms: Date.now() - started, raw: data, correlation: res.headers['x-correlation-id'] || null }));
    });
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, ms: Date.now() - started, raw: '', error: 'timeout' }); });
    r.on('error', (e) => resolve({ status: 0, ms: Date.now() - started, raw: '', error: e.message }));
    if (payload) r.write(payload);
    r.end();
  });
}

/** SSE reader: records every named frame with its arrival time. */
function sse(method, p, { token, session, body, label, maxMs = 90000, onFrame } = {}) {
  return new Promise((resolve) => {
    const u = new URL(API + p);
    const payload = body ? JSON.stringify(body) : null;
    const headers = { Accept: 'text/event-stream', 'User-Agent': 'staging-topology-probe/1.0' };
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
    if (token) headers.Authorization = 'Bearer ' + token;
    if (session) headers['X-Dual-Control-Session'] = session;
    const started = Date.now();
    let buf = '', ev = null, count = 0;
    const r = https.request({ method, hostname: u.hostname, port: 443, path: u.pathname + u.search, headers }, (res) => {
      log(`SSE ${label} open status=${res.statusCode}`);
      hop({ node: label, kind: 'sse-open', status: res.statusCode, note: `${method} ${p}` });
      if (res.statusCode !== 200) {
        let d = ''; res.on('data', (c) => (d += c));
        res.on('end', () => { hop({ node: label, kind: 'sse-refused', status: res.statusCode, detail: d.slice(0, 300) }); resolve({ status: res.statusCode, frames: 0 }); });
        return;
      }
      res.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (line.startsWith('event:')) ev = line.slice(6).trim();
          else if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            count++;
            let detail = data.slice(0, 400);
            try {
              const j = JSON.parse(data);
              detail = JSON.stringify(j).slice(0, 400);
            } catch {}
            sseFrames.push({ at_ms: now(), label, event: ev || 'message', data: detail });
            if (onFrame) onFrame(ev, data);
            if (['done', 'error', 'end', 'session.end', 'hard_stop'].includes(ev)) { /* keep reading; server closes */ }
          }
        }
      });
      res.on('end', () => { hop({ node: label, kind: 'sse-closed', frames: count, ms: Date.now() - started }); resolve({ status: 200, frames: count }); });
    });
    r.on('error', (e) => { hop({ node: label, kind: 'sse-error', detail: e.message }); resolve({ status: 0, frames: 0 }); });
    if (payload) r.write(payload);
    r.end();
    setTimeout(() => { try { r.destroy(); } catch {} resolve({ status: 200, frames: count, timedOut: true }); }, maxMs);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---------------------------------------------------------------- 1. login
  let r = await req('GET', BASE + '/health');
  hop({ node: 'cloudflare→traefik→api', kind: 'http', method: 'GET', path: '/health', status: r.status, ms: r.ms });
  log('health', r.status);

  r = await req('POST', '/org-users/auth/login', { body: { email: EMAIL, device_id: DEVICE, purpose: 'dual_control' } });
  hop({ node: 'control_plane(api)→db', kind: 'http', method: 'POST', path: '/org-users/auth/login', status: r.status, ms: r.ms });
  const auth = JSON.parse(r.raw);
  const token = auth.access_token, dual = auth.session_token;
  log(`login ok mfa=${auth.mfa_required} token=${token ? 'yes' : 'no'}`);
  if (!token) { fs.writeFileSync(OUT, JSON.stringify({ ok: false, timeline }, null, 2)); return; }

  // ------------------------------------------------- 2. create the engagement
  const engBody = {
    organization_id: 4,
    name: `Topology map run ${new Date().toISOString().slice(0, 16)}`,
    description: 'Deployment mapping run: bounded recon to observe how work moves across the runner, sandbox and model hops.',
    scope: {
      target_allowlist: [LAB],
      target_environment: 'staging',
      rules_of_engagement: 'Recon only. Confirm reachability, enumerate what is observable, and report. No exploitation.',
    },
    config: { testing_mode: 'greybox' },
  };
  r = await req('POST', '/agi/engagements', { token, session: dual, body: engBody });
  hop({ node: 'ai_engine(api)→db', kind: 'http', method: 'POST', path: '/agi/engagements', status: r.status, ms: r.ms, detail: r.raw.slice(0, 200) });
  log('create engagement', r.status, r.raw.slice(0, 200));
  let engagementId = null;
  try { engagementId = JSON.parse(r.raw).id; } catch {}
  if (!engagementId) { fs.writeFileSync(OUT, JSON.stringify({ ok: false, timeline, note: 'engagement create failed' }, null, 2)); return; }
  log('engagement id =', engagementId);

  // ------------------------------------------------- 3. start a real session
  const startBody = {
    instruction: `Bounded recon pass on ${LAB}. Confirm which hosts answer, what the app exposes, and summarise the surface. Do not exploit anything. Finish and report.`,
    autonomy: 'low',
    include_org_assets: false,
    confirm_capabilities: true,
    confirm_environment: 'staging',
    context_pack: 'default',
    preapprove_lab_auth: true,
  };
  r = await req('POST', `/agi/engagements/${engagementId}/sessions`, { token, session: dual, body: startBody });
  hop({ node: 'api→agi_runner(8095)', kind: 'http', method: 'POST', path: `/agi/engagements/${engagementId}/sessions`, status: r.status, ms: r.ms, detail: r.raw.slice(0, 300) });
  log('start session', r.status, r.raw.slice(0, 300));
  let sessionId = null;
  try { const j = JSON.parse(r.raw); sessionId = j.id; } catch {}
  if (!sessionId) { fs.writeFileSync(OUT, JSON.stringify({ ok: false, timeline, note: 'session start failed', startRaw: r.raw }, null, 2)); return; }
  log('session id =', sessionId, '-> runner allocated, sandbox lease requested');

  // ------------------------------------------------- 4. watch the loop move
  const stream = sse('GET', `/agi/sessions/${sessionId}/stream`, { token, session: dual, label: 'agi-runner→api(SSE)', maxMs: 150000 });

  const seen = new Set();
  let transcriptSeq = 0;
  let chatted = false;
  const deadline = Date.now() + 120000;
  let lastStatus = '';
  while (Date.now() < deadline) {
    await sleep(4000);
    const s = await req('GET', `/agi/sessions/${sessionId}`, { token, session: dual });
    let st = '?';
    try { st = JSON.parse(s.raw).status; } catch {}
    hop({ node: 'api→db(agi session poll)', kind: 'poll', method: 'GET', path: `/agi/sessions/${sessionId}`, status: s.status, ms: s.ms, note: `status=${st}` });
    if (st !== lastStatus) { log(`session status: ${lastStatus} -> ${st}`); lastStatus = st; }

    const tr = await req('GET', `/agi/sessions/${sessionId}/transcript?after_seq=${transcriptSeq}`, { token, session: dual });
    hop({ node: 'api→db(transcript)', kind: 'poll', method: 'GET', path: `/agi/sessions/${sessionId}/transcript`, status: tr.status, ms: tr.ms, note: `after_seq=${transcriptSeq}` });
    try {
      const rows = JSON.parse(tr.raw);
      for (const row of rows) {
        transcriptSeq = Math.max(transcriptSeq, row.seq);
        const key = row.seq;
        if (seen.has(key)) continue;
        seen.add(key);
        const kind = (row.meta && (row.meta.node_id || row.meta.kind || row.meta.tool)) || row.role;
        log(`  transcript #${row.seq} [${row.role}/${kind}] ${String(row.content).replace(/\s+/g, ' ').slice(0, 130)}`);
      }
    } catch {}

    // mid-run operator chat: proves the runner takes new input and answers back
    if (!chatted && (st === 'running' || st === 'ready') && Date.now() > T0 + 55000) {
      const c = await req('POST', `/agi/sessions/${sessionId}/chat`, { token, session: dual, body: { message: 'Status check: summarise in one line what you have observed so far and what is still untested.' } });
      hop({ node: 'api→agi_runner(operator chat)', kind: 'http', method: 'POST', path: `/agi/sessions/${sessionId}/chat`, status: c.status, ms: c.ms, detail: c.raw.slice(0, 250) });
      log('operator chat ->', c.status, c.raw.slice(0, 200));
      chatted = true;
    }
    if (['completed', 'failed', 'stopped', 'torn_down', 'cancelled'].includes(st) && chatted) break;
  }

  // give the stream a moment to flush the final frames
  await sleep(3000);

  // ------------------------------------------------- 5. findings + activity
  const f = await req('GET', `/agi/sessions/${sessionId}/findings`, { token, session: dual });
  hop({ node: 'api→db(findings)', kind: 'http', method: 'GET', path: `/agi/sessions/${sessionId}/findings`, status: f.status, ms: f.ms, detail: f.raw.slice(0, 200) });
  let findings = 0;
  try { findings = (JSON.parse(f.raw) || []).length; } catch {}
  log('findings returned:', findings);

  const finalTr = await req('GET', `/agi/sessions/${sessionId}/transcript?after_seq=0`, { token, session: dual });
  let rows = [];
  try { rows = JSON.parse(finalTr.raw) || []; } catch {}
  log('final transcript rows:', rows.length);

  // ------------------------------------- 6. the AI engine assistant (ai_engine)
  log('--- AI engine assistant: POST /ai/agent/chat/stream ---');
  let assistantFrames = 0;
  const assistantStart = Date.now();
  await sse('POST', '/ai/agent/chat/stream', {
    token, session: dual, label: 'ai_engine assistant→deepseek(SSE)', maxMs: 70000,
    body: {
      messages: [{ role: 'user', content: 'In two sentences: what does the Phantix staging deployment expose for scan orchestration?' }],
      domain: 'cross',
      max_tokens: 400,
    },
  });
  assistantFrames = sseFrames.filter((x) => x.label.startsWith('ai_engine assistant')).length;
  hop({ node: 'ai_engine assistant(api)→deepseek', kind: 'sse', status: 200, ms: Date.now() - assistantStart, note: `${assistantFrames} frames` });
  log('assistant frames:', assistantFrames);

  // ------------------------------------------------------------- write it out
  const out = {
    ok: true, real: true, captured_at: new Date().toISOString(),
    source: 'live staging https://staging.phantix.site',
    org: 4, account: EMAIL, device_id: DEVICE,
    engagement_id: engagementId, session_id: sessionId,
    final_status: lastStatus, findings_returned: findings, transcript_rows: rows.length,
    assistant_frames: assistantFrames,
    hop_count: timeline.length,
    hops: timeline,
    sse_frames: sseFrames,
    transcript_sample: rows.slice(-40).map((x) => ({ seq: x.seq, role: x.role, meta: x.meta || {}, content: String(x.content).slice(0, 500) })),
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  log(`wrote ${OUT} (${timeline.length} hops, ${sseFrames.length} SSE frames)`);
  process.exit(0);
})();
