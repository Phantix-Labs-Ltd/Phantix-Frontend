#!/usr/bin/env node
/**
 * cap2-vapt.cjs — phase 2: a real VAPT campaign against the 3 VAPT assets.
 *
 * NOTE / DEFECT FOUND: the web-scan step builds `root_domains` only from
 * `asset_scope.domains | root_domains | urls`. Passing `asset_ids` alone counts
 * the assets but scans nothing (observed: campaign 32, root_domains=[],
 * 0 tools hit a target, 0 findings). So this run passes the targets explicitly
 * in the scope as well, which is the workaround an operator has to know about.
 *
 * Output: capture-2-vapt.json
 */
const path = require('path');
const fs = require('fs');
const { Recorder, req, login, sleep } = require('./lib.cjs');

const OUT = path.join(__dirname, 'capture-2-vapt.json');
const ASSETS = JSON.parse(fs.readFileSync(path.join(__dirname, 'capture-1-assets.json'), 'utf8'));
const VAPT_ASSETS = ASSETS.notes.assets_vapt || [];
const ASSET_IDS = VAPT_ASSETS.map((a) => a.id);
const DOMAINS = VAPT_ASSETS.map((a) => String(a.value).replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
const MAX_WAIT_MS = Number(process.env.VAPT_MAX_WAIT_MS || 1_800_000);
const POLL_MS = 6000;
const TERMINAL = ['completed', 'completed_partial', 'failed', 'cancelled'];

(async () => {
  const rec = new Recorder(OUT);
  rec.begin('vapt', `Phase 2 — VAPT campaign against ${ASSET_IDS.length} assets`);
  rec.notes.targets = VAPT_ASSETS;
  rec.notes.domains = DOMAINS;
  rec.notes.defect = 'asset_ids alone does not populate root_domains for the web pipeline; scope.domains is required (observed on campaign 32).';

  const init = await login('initiator', rec, 'vapt');
  rec.notes.actor = { who: 'initiator', user: 14, mfa: init.mfa };
  rec.notes.authorizer_note = 'assigned authorizer is user 9 (support@) which requires MFA; campaign ran with approval_status=not_required, so no approval was needed';

  await req('GET', '/vapt/settings', { token: init.token, dual: init.dual, rec, phase: 'vapt', note: 'settings' });
  await req('GET', '/vapt/procedures', { token: init.token, dual: init.dual, rec, phase: 'vapt', note: 'procedures' });
  await req('GET', '/vapt/campaigns/quota', { token: init.token, dual: init.dual, rec, phase: 'vapt', note: 'quota' });
  await req('GET', '/scans/consent', { token: init.token, dual: init.dual, rec, phase: 'vapt', note: 'scan consent (AUP/ROE)' });

  const plan = await req('POST', '/vapt/plan', {
    token: init.token, dual: init.dual, rec, phase: 'vapt', note: 'intelligent plan',
    body: { exclude_scan_types: ['brute_scan'] },
  });
  rec.notes.plan_status = plan.status;

  // ── create with BOTH asset_ids (for the record) and domains (so it scans)
  const scope = { asset_ids: ASSET_IDS, domains: DOMAINS, config: { include_subdomains: false, max_pages_to_crawl: 60 } };
  const body = {
    campaign_name: `Org4 lifecycle VAPT ${new Date().toISOString().slice(0, 16)}`,
    campaign_type: 'web_scan',
    procedure_key: 'web_scan',
    asset_scope: scope,
  };
  let create = await req('POST', '/vapt/campaigns', { token: init.token, dual: init.dual, rec, phase: 'vapt', note: `create campaign — assets ${ASSET_IDS.join(',')} / ${DOMAINS.length} domains`, body });
  let campaign = create.json || {};
  const campaignId = campaign.id || campaign.campaign_id;
  if (!campaignId) {
    rec.event('vapt', 'error', `create failed: ${create.status} ${create.raw.slice(0, 250)}`, 'eng-vapt');
    rec.end('campaign could not be created'); rec.write(); return;
  }
  rec.notes.campaign_id = campaignId;
  rec.notes.campaign_name = campaign.campaign_name;
  rec.notes.asset_scope = campaign.asset_scope;
  console.log(`  campaign #${campaignId} created (status=${campaign.status}, approval=${campaign.approval_status})`);

  const start = await req('POST', `/vapt/campaigns/${campaignId}/start`, { token: init.token, dual: init.dual, rec, phase: 'vapt', note: 'start campaign', body: {} });
  rec.notes.start_status = start.status;

  // ── drive to terminal, capturing phase stats and the jobs it spawns
  const t0 = Date.now();
  let last = '', seenSteps = new Map(), jobs = new Set(), phases = {};
  while (Date.now() - t0 < MAX_WAIT_MS) {
    await sleep(POLL_MS);
    const c = await req('GET', `/vapt/campaigns/${campaignId}`, { token: init.token, dual: init.dual, rec, phase: 'vapt', quiet: true });
    const cur = c.json || {};
    const st = cur.status || '?';
    if (st !== last) {
      rec.event('vapt', st === 'failed' ? 'error' : 'claim', `campaign #${campaignId} → ${st}`, 'eng-vapt');
      console.log(`  campaign: ${last || '-'} → ${st}`);
      last = st;
    }
    for (const s of (cur.steps || cur.campaign_steps || [])) {
      const key = s.id || s.step_index;
      const prev = seenSteps.get(key);
      if (!prev || prev.status !== s.status) {
        seenSteps.set(key, { status: s.status, step_type: s.step_type, step_name: s.step_name, finding_count: s.finding_count });
        rec.event('vapt', s.status === 'failed' ? 'error' : 'claim',
          `step ${s.step_index} ${s.step_type} → ${s.status}${s.finding_count ? ' (' + s.finding_count + ' findings)' : ''}`, 'worker-vapt');
        console.log(`    step ${s.step_index} ${s.step_type} → ${s.status}${s.error_message ? ' ERR: ' + s.error_message.slice(0, 80) : ''}`);
      }
      const ps = s.output_summary && s.output_summary.phase_stats;
      if (ps) { phases[`step${s.step_index}`] = ps; rec.notes.phase_stats = phases; }
      const counts = s.output_summary && s.output_summary.counts;
      if (counts) rec.notes.step_counts = { ...(rec.notes.step_counts || {}), [s.step_index]: counts };
      if (s.scan_job_ids) rec.notes.scan_job_ids = { ...(rec.notes.scan_job_ids || {}), [s.step_index]: s.scan_job_ids };
      if (s.error_message) rec.notes.step_error = { step: s.step_index, error: s.error_message };
    }
    rec.notes.steps = [...seenSteps.entries()].map(([k, v]) => ({ step: k, ...v }));

    const jr = await req('GET', '/scans/jobs?limit=25', { token: init.token, dual: init.dual, rec, phase: 'vapt', quiet: true });
    const jItems = (jr.json && (jr.json.items || jr.json)) || [];
    for (const j of (Array.isArray(jItems) ? jItems : [])) {
      if (jobs.has(j.id)) continue;
      jobs.add(j.id);
      rec.event('vapt', 'claim', `scan job #${j.id} → ${j.status} (${j.scan_type || j.tools || ''})`, 'worker-scans');
      console.log(`    scan job #${j.id} ${j.status}`);
    }
    rec.notes.scan_jobs = [...jobs];

    if (TERMINAL.includes(st)) { rec.notes.campaign_final = st; break; }
  }
  if (!rec.notes.campaign_final) rec.notes.campaign_final = last || 'timeout';

  // ── collect the outputs
  const f = await req('GET', `/vapt/campaigns/${campaignId}/findings`, { token: init.token, dual: init.dual, rec, phase: 'vapt', note: 'campaign findings' });
  const findings = (f.json && (f.json.items || f.json)) || [];
  rec.notes.findings_count = Array.isArray(findings) ? findings.length : 0;
  rec.notes.findings = Array.isArray(findings) ? findings.slice(0, 60) : findings;
  await req('GET', '/findings/intake', { token: init.token, dual: init.dual, rec, phase: 'vapt', note: 'finding tracker' });
  const res = await req('GET', '/scans/results?limit=60', { token: init.token, dual: init.dual, rec, phase: 'vapt', note: 'scan results' });
  rec.notes.scan_results_count = ((res.json && res.json.items) || []).length;
  const risk = await req('GET', '/risks', { token: init.token, dual: init.dual, rec, phase: 'vapt', note: 'risks' });
  rec.notes.risks_count = ((risk.json && risk.json.items) || []).length;
  await req('GET', '/posture', { token: init.token, dual: init.dual, rec, phase: 'vapt', note: 'posture' });

  const final = await req('GET', `/vapt/campaigns/${campaignId}`, { token: init.token, dual: init.dual, rec, phase: 'vapt', note: 'final campaign state' });
  rec.notes.campaign = final.json;

  rec.end(`campaign #${campaignId} ${rec.notes.campaign_final} · ${rec.notes.findings_count} findings · ${jobs.size} scan jobs · ${rec.notes.scan_results_count} results · ${rec.notes.risks_count} risks`);
  rec.write();
})();
