#!/usr/bin/env node
/**
 * cap3-agi.cjs — phase 3: a full AGI pentest session over the 3 AGI assets
 * (crAPI, VAmPI, DVWA-GraphQL), captured end to end.
 *
 *   accept agreement → create engagement (3-target allowlist) → start session
 *   → stream SSE → poll transcript/findings/actions → approve state-changing
 *     actions → confirm job completion → collect the graph + decisions
 *
 * Output: capture-3-agi.json
 */
const path = require('path');
const fs = require('fs');
const { Recorder, req, stream, login, sleep } = require('./lib.cjs');

const OUT = path.join(__dirname, 'capture-3-agi.json');
const ASSETS = JSON.parse(fs.readFileSync(path.join(__dirname, 'capture-1-assets.json'), 'utf8'));
const AGI_ASSETS = ASSETS.notes.assets_agi || [];
const ASSET_IDS = AGI_ASSETS.map((a) => a.id);
const HOSTS = AGI_ASSETS.map((a) => String(a.value).replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
const ALLOW = [...HOSTS, ...HOSTS.map((h) => 'https://' + h)];
const MAX_WAIT_MS = Number(process.env.AGI_MAX_WAIT_MS || 2_400_000);   // 40 min ceiling
const POLL_MS = 7000;
const TERMINAL = ['completed', 'failed', 'stopped', 'torn_down', 'cancelled'];

(async () => {
  const rec = new Recorder(OUT);
  rec.begin('agi', `Phase 3 — AGI pentest session over ${HOSTS.length} assets`);
  rec.notes.targets = AGI_ASSETS;
  rec.notes.allowlist = ALLOW;

  const me = await login('initiator', rec, 'agi');
  rec.notes.actor = { who: 'initiator', user: 14, mfa: me.mfa };

  // ── agreement gate (cleared on the reset, so this is a real lifecycle step)
  const access = await req('GET', '/agi/access', { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'AGI access + agreement state' });
  const ag = await req('GET', '/agi/agreement', { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'usage agreement' });
  const agreement = ag.json || {};
  rec.notes.agreement = { version: agreement.version, accepted: agreement.accepted, must_accept: agreement.must_accept };
  if (agreement.must_accept || agreement.accepted === false) {
    await req('POST', '/agi/agreement/accept', { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'accept AGI usage agreement', body: {} });
    rec.event('agi', 'claim', 'operator accepted the AGI usage agreement', 'eng-ai');
  }
  await req('GET', '/agi/org/settings/bootstrap', { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'org settings bootstrap' });
  const os = await req('GET', '/agi/org/settings', { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'org AGI settings' });
  const settings = os.json || {};
  rec.notes.settings_before = settings;
  // Enabling AGI for the org is a platform-admin action; the org starts disabled,
  // so the capture has to include this step or no session can start.
  if (settings.enabled_for_org !== true) {
    rec.event('agi', 'block', 'AGI is disabled for this organization — enabling it (platform-admin step)', 'eng-control');
    const en = await req('PATCH', '/agi/org/settings', {
      token: me.token, dual: me.dual, rec, phase: 'agi', note: 'enable AGI for the org',
      body: {
        enabled_for_org: true, daily_session_limit: 5, max_allowlist_targets: 10,
        allow_state_changing: true, require_dual_control_for_active: false,
        require_asset_backed_targets: true, default_target_environment: 'staging',
        allow_production_testing: false,
      },
    });
    rec.notes.settings_after = en.json;
    const acc = await req('GET', '/agi/access', { token: me.token, dual: me.dual, rec, phase: 'agi', note: 're-check AGI access' });
    rec.notes.access_after_enable = ((acc.json || {}).agi) || {};
    console.log(`  AGI enabled for org 4 → can_use=${(rec.notes.access_after_enable || {}).can_use}`);
  }
  const accessAfter = await req('GET', '/agi/access', { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'AGI access (gate check)' });
  rec.notes.access = ((accessAfter.json || {}).agi) || {};
  await req('GET', '/agi/org/context-packs', { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'context packs' });
  await req('GET', '/agi/org/test-accounts', { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'org test accounts' });

  // ── engagement scoped to exactly the 3 assets
  const engBody = {
    organization_id: 4,
    name: `Org4 lifecycle AGI ${new Date().toISOString().slice(0, 16)}`,
    description: 'Lifecycle capture: 3-asset greybox pentest run by the AGI agent, end to end.',
    scope: {
      target_allowlist: ALLOW,
      target_environment: 'staging',
      rules_of_engagement: 'Authorised lab testing of the three in-scope assets. Recon, API/logic probing and verification are permitted. Report what is found.',
    },
    config: {
      testing_mode: 'greybox',
      process_flow: 'unordered',
      critical_workflows: ['signup', 'login', 'api'],
      out_of_scope_behaviours: ['denial of service', 'destructive writes'],
    },
  };
  const eng = await req('POST', '/agi/engagements', { token: me.token, dual: me.dual, rec, phase: 'agi', note: `create engagement — allowlist ${HOSTS.length} hosts`, body: engBody });
  const engagement = eng.json || {};
  const engagementId = engagement.id;
  if (!engagementId) {
    rec.event('agi', 'error', `engagement create failed: ${eng.status} ${eng.raw.slice(0, 300)}`, 'eng-ai');
    rec.end('engagement could not be created'); rec.write(); return;
  }
  rec.notes.engagement_id = engagementId;
  rec.notes.engagement_name = engagement.name;
  console.log(`  engagement #${engagementId} created (status=${engagement.status})`);
  await req('GET', `/agi/engagements/${engagementId}/brief`, { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'engagement brief' });

  // ── start the session: 3 assets, agent-led recon then verification
  const instruction = [
    `Run a bounded, evidence-first greybox assessment of these three in-scope assets, and only these:`,
    ...AGI_ASSETS.map((a) => `  - ${a.value}  (${a.name})`),
    ``,
    `For each asset: fingerprint it, enumerate the API surface and the authentication flow, then test for`,
    `broken object/function-level authorisation (BOLA/BFLA), injection, and any exposed secrets or debug endpoints.`,
    `Verify anything you report before calling it a finding; say "inconclusive" rather than guessing.`,
    `Finish with a per-asset summary of what is confirmed, what is untested, and what you would do next.`,
  ].join('\n');

  const startBody = {
    instruction,
    autonomy: 'medium',
    include_org_assets: false,
    confirm_capabilities: true,
    confirm_environment: 'staging',
    context_pack: 'default',
    preapprove_lab_auth: true,
  };
  const st = await req('POST', `/agi/engagements/${engagementId}/sessions`, { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'start session (3 targets, autonomy=medium)', timeout: 90000, body: startBody });
  const session = st.json || {};
  const sessionId = session.id;
  if (!sessionId) {
    rec.event('agi', 'error', `session start failed: ${st.status} ${st.raw.slice(0, 300)}`, 'agi-runner');
    rec.end('session could not be started'); rec.write(); return;
  }
  rec.notes.session_id = sessionId;
  rec.notes.runner_session_id = session.runner_session_id;
  rec.notes.container_id = session.container_id;
  rec.notes.session_cap = 4;
  console.log(`  session #${sessionId} started (runner=${session.runner_session_id})`);

  // ── stream everything the runner emits
  const sse = stream(`/agi/sessions/${sessionId}/stream`, {
    token: me.token, dual: me.dual, rec, label: 'agi-runner SSE', maxMs: MAX_WAIT_MS,
    onFrame: (ev, data) => {
      if (['session_start', 'asset_plan', 'job_progress', 'loop_stop', 'final_decision', 'campaign_done', 'tool_error'].includes(ev)) {
        console.log(`    [sse] ${ev}: ${data.slice(0, 110)}`);
      }
    },
  });

  // ── drive the session
  const t0 = Date.now();
  let seq = 0, lastStatus = '', actionsApproved = new Set(), jobConfirmed = false;
  const transcript = [];
  while (Date.now() - t0 < MAX_WAIT_MS) {
    await sleep(POLL_MS);
    const s = await req('GET', `/agi/sessions/${sessionId}`, { token: me.token, dual: me.dual, rec, phase: 'agi', quiet: true });
    const cur = s.json || {};
    if (cur.status !== lastStatus) {
      rec.event('agi', 'claim', `session #${sessionId} → ${cur.status}`, 'agi-runner');
      console.log(`  session: ${lastStatus || '-'} → ${cur.status}`);
      lastStatus = cur.status;
    }
    rec.notes.session_final = lastStatus;
    rec.notes.job = cur.job;
    rec.notes.loop = cur.loop;
    rec.notes.loop_status = cur.loop_status;

    // transcript
    const tr = await req('GET', `/agi/sessions/${sessionId}/transcript?after_seq=${seq}`, { token: me.token, dual: me.dual, rec, phase: 'agi', quiet: true });
    const rows = Array.isArray(tr.json) ? tr.json : [];
    for (const row of rows) {
      seq = Math.max(seq, row.seq);
      transcript.push({ seq: row.seq, role: row.role, meta: row.meta || {}, content: String(row.content || '').slice(0, 1200), at: rec.now() });
      const kind = (row.meta && (row.meta.node_id || row.meta.kind || row.meta.tool)) || row.role;
      if (['tool', 'assistant', 'system', 'operator'].includes(row.role)) {
        console.log(`    #${row.seq} [${row.role}/${kind}] ${String(row.content).replace(/\s+/g, ' ').slice(0, 100)}`);
      }
    }
    rec.notes.transcript_count = transcript.length;

    // approve state-changing actions as they appear
    const pa = await req('GET', `/agi/sessions/${sessionId}/actions/pending`, { token: me.token, dual: me.dual, rec, phase: 'agi', quiet: true });
    const acts = Array.isArray(pa.json) ? pa.json : [];
    for (const a of acts) {
      const aid = a.id || a.action_id;
      if (!aid || actionsApproved.has(aid)) continue;
      actionsApproved.add(aid);
      await req('POST', `/agi/actions/${aid}/decide`, {
        token: me.token, dual: me.dual, rec, phase: 'agi',
        note: `approve action #${aid}: ${String(a.action_type || a.kind || '').slice(0, 40)}`,
        body: { approve: true, notes: 'staging lifecycle capture — auto-approve' },
      });
      rec.event('agi', 'claim', `operator approved ${a.action_type || a.kind || 'action'} #${aid}`, 'agi-oversight');
    }
    rec.notes.actions_approved = [...actionsApproved];

    // confirm completion when the verifier says the job is done
    const jb = await req('GET', `/agi/sessions/${sessionId}/job`, { token: me.token, dual: me.dual, rec, phase: 'agi', quiet: true });
    const job = jb.json || {};
    const jobDone = job.status === 'done' || job.status === 'job_done' || job.verified === true;
    if (jobDone && !jobConfirmed) {
      jobConfirmed = true;
      await req('POST', `/agi/sessions/${sessionId}/job/confirm?stop=false`, {
        token: me.token, dual: me.dual, rec, phase: 'agi', note: 'confirm job complete',
        body: { notes: 'objective verified complete — capturing results' },
      });
      rec.event('agi', 'done', 'operator confirmed the job as complete', 'agi-finding-mgr');
    }

    if (TERMINAL.includes(lastStatus)) break;
  }

  await Promise.race([sse, sleep(4000)]);

  // ── collect everything produced
  const f = await req('GET', `/agi/sessions/${sessionId}/findings`, { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'session findings' });
  const findings = Array.isArray(f.json) ? f.json : [];
  rec.notes.findings_count = findings.length;
  rec.notes.findings = findings.slice(0, 80);

  const g = await req('GET', `/agi/sessions/${sessionId}/graph`, { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'attack graph' });
  rec.notes.graph = g.json ? { nodes: (g.json.nodes || []).length, edges: (g.json.edges || []).length } : null;

  const cap = await req('GET', `/agi/sessions/${sessionId}/capabilities`, { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'capabilities' });
  rec.notes.capabilities = cap.json;

  const fin = await req('GET', `/agi/sessions/${sessionId}`, { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'final session state' });
  rec.notes.session = fin.json;

  const full = await req('GET', `/agi/sessions/${sessionId}/transcript?after_seq=0`, { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'full transcript' });
  rec.notes.transcript_full = Array.isArray(full.json) ? full.json.map((r) => ({ seq: r.seq, role: r.role, meta: r.meta || {}, content: String(r.content || '').slice(0, 2000) })) : [];
  rec.notes.transcript_count = rec.notes.transcript_full.length;

  await req('GET', '/agi/engagements', { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'engagements' });
  await req('GET', '/agi/sessions', { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'sessions' });
  await req('GET', '/agi/knowledge', { token: me.token, dual: me.dual, rec, phase: 'agi', note: 'knowledge summaries' });

  rec.end(`session #${sessionId} ${rec.notes.session_final} · ${findings.length} findings · ${rec.notes.transcript_count} transcript rows · ${rec.sse.length} streamed frames`);
  rec.write();
})();
