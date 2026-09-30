#!/usr/bin/env node
/**
 * cap1-assets.cjs — phase 1: onboard 6 assets into a freshly cleared org 4.
 *
 *   3 "vapt-lab" assets  → targeted by the VAPT campaign in phase 2
 *   3 "agi-lab"  assets  → targeted by the AGI agent session in phase 3
 *
 * Captured exactly as an operator would do it, one call per asset, so the
 * animation can show the asset engine writing to the security DB.
 *
 * Output: capture-1-assets.json
 */
const path = require('path');
const { Recorder, req, login, sleep } = require('./lib.cjs');

const OUT = path.join(__dirname, 'capture-1-assets.json');

const VAPT_ASSETS = [
  { value: 'https://juice.phantixvulnserver.online', name: 'OWASP Juice Shop (lab)', env: 'staging', crit: 'high' },
  { value: 'https://dvwa.phantixvulnserver.online', name: 'DVWA (lab)', env: 'staging', crit: 'high' },
  { value: 'https://bwapp.phantixvulnserver.online', name: 'bWAPP (lab)', env: 'staging', crit: 'medium' },
];
const AGI_ASSETS = [
  { value: 'https://crapi.phantixvulnserver.online', name: 'crAPI (lab)', env: 'staging', crit: 'critical' },
  { value: 'https://vampi.phantixvulnserver.online', name: 'VAmPI (lab)', env: 'staging', crit: 'high' },
  { value: 'https://dvga.phantixvulnserver.online', name: 'Damn Vulnerable GraphQL (lab)', env: 'staging', crit: 'medium' },
];

(async () => {
  const rec = new Recorder(OUT);
  rec.begin('assets', 'Phase 1 — asset onboarding (3 for VAPT, 3 for AGI)');

  const me = await login('initiator', rec, 'assets');
  rec.notes.actor = { who: 'initiator', user: 14, email: require('./lib.cjs').ACCOUNTS.initiator.email, mfa: me.mfa };

  // baseline: prove the slate is clean
  const before = await req('GET', '/assets?limit=200', { token: me.token, dual: me.dual, rec, phase: 'assets', note: 'baseline asset count' });
  const beforeItems = (before.json && before.json.items) || [];
  rec.notes.assets_before = beforeItems.length;
  console.log(`  baseline: ${beforeItems.length} asset(s) in org 4`);

  const created = { vapt: [], agi: [] };

  for (const [group, list] of [['vapt', VAPT_ASSETS], ['agi', AGI_ASSETS]]) {
    for (const a of list) {
      const r = await req('POST', '/assets', {
        token: me.token, dual: me.dual, rec, phase: 'assets',
        note: `${group}: ${a.value}`,
        body: {
          asset_type: 'web_app',
          value: a.value,
          name: a.name,
          environment: a.env,
          criticality: a.crit,
          confirm_ownership: true,
          force_verify: true,
          metadata: { onboarded_by: 'staging-system-map capture', purpose: group === 'vapt' ? 'vapt-campaign' : 'agi-session' },
        },
      });
      const j = r.json || {};
      if (j.id || j.asset_id) {
        const id = j.id || j.asset_id;
        created[group].push({ id, value: a.value, name: a.name, criticality: a.crit });
        rec.event('assets', 'done', `asset #${id} created — ${a.value}`, 'eng-asset');
      } else {
        rec.event('assets', 'error', `asset create failed (${r.status}) — ${a.value}: ${r.raw.slice(0, 160)}`, 'eng-asset');
      }
      await sleep(220);
    }
  }

  // verify by re-listing
  const after = await req('GET', '/assets?limit=200', { token: me.token, dual: me.dual, rec, phase: 'assets', note: 'asset count after onboarding' });
  const afterItems = (after.json && after.json.items) || [];
  rec.notes.assets_after = afterItems.length;
  rec.notes.assets_vapt = created.vapt;
  rec.notes.assets_agi = created.agi;

  // asset tags, so the map has a real dependency to show
  const tags = await req('GET', '/asset-tags', { token: me.token, dual: me.dual, rec, phase: 'assets', note: 'tags' });
  const tagList = (tags.json && tags.json.items) || [];
  rec.notes.asset_tags = tagList.length;

  for (const grp of ['vapt', 'agi']) {
    for (const a of created[grp]) {
      const detail = await req('GET', `/assets/${a.id}`, { token: me.token, dual: me.dual, rec, phase: 'assets', quiet: true, note: `read back #${a.id}` });
      a.readback_status = detail.status;
      if (detail.json) {
        a.type = detail.json.asset_type;
        a.verified = detail.json.is_verified;
        a.risk = detail.json.risk_level || detail.json.risk_score;
      }
    }
  }

  rec.end(`${afterItems.length} assets in org 4 (${created.vapt.length} VAPT + ${created.agi.length} AGI)`);
  console.log(`\n  VAPT assets: ${created.vapt.map((a) => '#' + a.id).join(', ')}`);
  console.log(`  AGI  assets: ${created.agi.map((a) => '#' + a.id).join(', ')}`);
  rec.write();
})();
