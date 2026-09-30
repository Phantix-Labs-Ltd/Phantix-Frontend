#!/usr/bin/env node
/**
 * ai-assistant.cjs — exercises the AI-engine assistant on org 4 the way the
 * front end does: scope resolve -> scope confirm -> streamed chat, then the
 * async agent run. Records the real node path for each hop.
 *
 *   api (ai_engine) -> org_data_scope -> db (37 assets)
 *                   -> deepseek          (SSE token stream)
 *                   -> ai queue -> worker-ai -> deepseek     (async run)
 *
 * Output: evidence/ai-assistant-trace.json
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = 'https://staging.phantix.site';
const API = BASE + '/api/v1';
const EMAIL = 'agi-test@phantixvulnserver.online';
const DEVICE = 'agi-test-device-0001';
const UA = 'staging-topology-probe/1.0';   // must match the registered device fingerprint
const OUT = path.join(__dirname, 'ai-assistant-trace.json');

const T0 = Date.now();
const hops = [];
const frames = [];
const now = () => Date.now() - T0;

function req(method, p, { token, session, body, timeout = 40000 } = {}) {
  const url = p.startsWith('http') ? p : API + p;
  return new Promise((resolve) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const headers = { Accept: 'application/json', 'User-Agent': UA };
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
    if (token) headers.Authorization = 'Bearer ' + token;
    if (session) headers['X-Dual-Control-Session'] = session;
    const started = Date.now();
    const r = https.request({ method, hostname: u.hostname, port: 443, path: u.pathname + u.search, headers, timeout }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, ms: Date.now() - started, raw: d }));
    });
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, ms: Date.now() - started, raw: '' }); });
    r.on('error', () => resolve({ status: 0, ms: Date.now() - started, raw: '' }));
    if (payload) r.write(payload);
    r.end();
  });
}

function sse(method, p, { token, session, body, label, maxMs = 90000 }) {
  return new Promise((resolve) => {
    const u = new URL(API + p);
    const payload = body ? JSON.stringify(body) : null;
    const headers = { Accept: 'text/event-stream', 'User-Agent': UA };
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
    if (token) headers.Authorization = 'Bearer ' + token;
    if (session) headers['X-Dual-Control-Session'] = session;
    const started = Date.now();
    let buf = '', ev = 'message', n = 0;
    const r = https.request({ method, hostname: u.hostname, port: 443, path: u.pathname + u.search, headers }, (res) => {
      hops.push({ at_ms: now(), node: label, kind: 'sse-open', status: res.statusCode });
      res.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (line.startsWith('event:')) ev = line.slice(6).trim();
          else if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            n++;
            let summary = data.slice(0, 700);
            try {
              const j = JSON.parse(data);
              summary = JSON.stringify(j).slice(0, 700);
              if (j.type === 'delta' && j.text) summary = `delta: "${String(j.text).slice(0, 120)}"`;
              if (j.type === 'delta' && j.content) summary = `delta: "${String(j.content).slice(0, 120)}"`;
              if (j.type === 'reasoning') summary = `reasoning: "${String(j.text || j.content || '').slice(0, 100)}"`;
            } catch {}
            frames.push({ at_ms: now(), label, event: ev, data: summary });
          }
        }
      });
      res.on('end', () => { hops.push({ at_ms: now(), node: label, kind: 'sse-closed', frames: n, ms: Date.now() - started }); resolve({ status: 200, frames: n }); });
    });
    r.on('error', () => { hops.push({ at_ms: now(), node: label, kind: 'sse-error' }); resolve({ status: 0, frames: 0 }); });
    if (payload) r.write(payload);
    r.end();
    setTimeout(() => { try { r.destroy(); } catch {} resolve({ status: 200, frames: n, timedOut: true }); }, maxMs);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${String(now()).padStart(6)}ms]`, ...a);

(async () => {
  // login
  let r = await req('POST', '/org-users/auth/login', { body: { email: EMAIL, device_id: DEVICE, purpose: 'dual_control' } });
  let auth = {}; try { auth = JSON.parse(r.raw); } catch {}
  const token = auth.access_token, dual = auth.session_token;
  hops.push({ at_ms: now(), node: 'edge→api→db', kind: 'http', method: 'POST', path: '/org-users/auth/login', status: r.status, ms: r.ms, note: `mfa=${auth.mfa_required}` });
  log('login', r.status, 'mfa=' + auth.mfa_required, token ? 'token ok' : 'NO TOKEN');
  if (!token) { fs.writeFileSync(OUT, JSON.stringify({ ok: false, hops, frames }, null, 2)); return; }

  // pick two real assets to authorise
  r = await req('GET', '/assets?limit=5', { token, session: dual });
  let assets = []; try { const j = JSON.parse(r.raw); assets = j.items || j || []; } catch {}
  hops.push({ at_ms: now(), node: 'api(asset_engine)→security-db', kind: 'http', method: 'GET', path: '/assets', status: r.status, ms: r.ms, note: `${assets.length} assets in scope card` });
  const assetIds = assets.slice(0, 2).map((a) => a.id);
  log('assets in org 4:', assets.length, '-> selecting ids', assetIds.join(','));

  // scope resolve (this is the card the assistant demanded)
  const query = 'Summarise the exposure of the selected assets in two sentences.';
  r = await req('POST', '/ai/agent/scope/resolve', { token, session: dual, body: { query, purpose: 'review', domain: 'consultant' } });
  let card = {}; try { card = JSON.parse(r.raw); } catch {}
  hops.push({ at_ms: now(), node: 'api(ai_engine)→org_data_scope→db', kind: 'http', method: 'POST', path: '/ai/agent/scope/resolve', status: r.status, ms: r.ms, note: `status=${card.status} token=${card.selection_token ? 'yes' : 'no'}` });
  log('scope/resolve', r.status, 'status=' + card.status, 'token=' + (card.selection_token ? 'yes' : 'no'), 'assets_listed=' + ((card.assets || []).length));
  const selToken = card.selection_token;

  // scope confirm -> grant
  let grant = null;
  if (selToken) {
    r = await req('POST', '/ai/agent/scope/confirm', { token, session: dual, body: { selection_token: selToken, asset_ids: assetIds, purpose: 'review' } });
    let conf = {}; try { conf = JSON.parse(r.raw); } catch {}
    hops.push({ at_ms: now(), node: 'api(ai_engine)→org_data_scope', kind: 'http', method: 'POST', path: '/ai/agent/scope/confirm', status: r.status, ms: r.ms, note: `grant=${conf.scope_grant ? 'issued' : 'none'}` });
    log('scope/confirm', r.status, 'grant=' + (conf.scope_grant ? 'issued' : 'none'));
    grant = conf.scope_grant || conf.grant || null;
  }

  // streamed assistant chat WITH the grant -> real DeepSeek tokens
  log('--- assistant chat/stream WITH scope grant ---');
  const chatBody = {
    messages: [{ role: 'user', content: query }],
    domain: 'consultant',
    max_tokens: 500,
  };
  if (grant) chatBody.scope_grant = grant;
  await sse('POST', '/ai/agent/chat/stream', { token, session: dual, body: chatBody, label: 'ai_engine assistant→deepseek', maxMs: 90000 });
  const chatFrames = frames.filter((f) => f.label.includes('assistant'));
  const d = chatFrames.filter((f) => f.event === 'delta').length;
  const rs = chatFrames.filter((f) => f.event === 'reasoning').length;
  log(`assistant frames=${chatFrames.length} delta=${d} reasoning=${rs}`);

  // async agent run: POST /ai/agent/runs then stream the run
  log('--- agent run (async path: ai queue -> worker-ai) ---');
  r = await req('POST', '/ai/agent/runs', { token, session: dual, body: { objective: 'Summarise org 4 exposure across the selected assets', domain: 'consultant', asset_ids: assetIds, scope_grant: grant || undefined, require_human_review: false } });
  hops.push({ at_ms: now(), node: 'api(ai_engine)→ai queue', kind: 'http', method: 'POST', path: '/ai/agent/runs', status: r.status, ms: r.ms, note: r.raw.slice(0, 200) });
  let analysisId = null; try { const j = JSON.parse(r.raw); analysisId = j.id || j.analysis_id; } catch {}
  log('agent run', r.status, 'id=' + analysisId, r.raw.slice(0, 160));

  if (analysisId) {
    for (let i = 0; i < 8; i++) {
      await sleep(4000);
      const s = await req('GET', `/ai/agent/runs/${analysisId}`, { token, session: dual });
      let st = '?'; try { st = JSON.parse(s.raw).status; } catch {}
      hops.push({ at_ms: now(), node: 'api→db(ai_agent_runs poll)', kind: 'poll', method: 'GET', path: `/ai/agent/runs/${analysisId}`, status: s.status, ms: s.ms, note: `status=${st}` });
      log(`run ${analysisId} status=${st}`);
      if (['completed', 'failed', 'error', 'succeeded'].includes(st)) break;
    }
  }

  // the other AI surfaces, for the record
  for (const p of ['/ai/agent/activity', '/ai/agent/skills', '/ai/agent/domains', '/ai/agent/intents', '/ai/agent/runs', '/ai/agent/authorizations/status', '/ai/agent/approvals']) {
    const q = await req('GET', p, { token, session: dual });
    let note = '';
    try { const j = JSON.parse(q.raw); note = Array.isArray(j) ? `array(${j.length})` : Object.keys(j).slice(0, 5).join(','); } catch {}
    hops.push({ at_ms: now(), node: 'api(ai_engine)→db', kind: 'http', method: 'GET', path: p, status: q.status, ms: q.ms, note });
    log('GET', p, q.status, note);
  }

  const out = {
    ok: true, real: true, captured_at: new Date().toISOString(),
    source: 'live staging https://staging.phantix.site', org: 4, account: EMAIL,
    scoped_asset_ids: assetIds,
    scope_card_status: card.status,
    scope_grant_issued: !!grant,
    assistant_frames: frames.filter((f) => f.label.includes('assistant')).length,
    assistant_delta_frames: frames.filter((f) => f.event === 'delta').length,
    assistant_reasoning_frames: frames.filter((f) => f.event === 'reasoning').length,
    analysis_id: analysisId,
    hop_count: hops.length,
    hops, frames,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  log(`wrote ${OUT} (${hops.length} hops, ${frames.length} frames)`);
  process.exit(0);
})();
