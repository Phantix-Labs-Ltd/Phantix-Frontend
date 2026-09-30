#!/usr/bin/env node
/** diag-vapt.cjs — why did the campaign produce no scans/findings? */
const { req, login } = require('./lib.cjs');
const j = (r) => r.json;

(async () => {
  const init = await login('initiator');
  const auth = await login('authorizer');

  console.log('=== /authorizer/me (authorizer) ===');
  const me = await req('GET', '/authorizer/me', { token: auth.token, dual: auth.dual });
  console.log(me.status, JSON.stringify(j(me)).slice(0, 500));

  console.log('\n=== /authorizer/inbox (authorizer) ===');
  const inbox = await req('GET', '/authorizer/inbox', { token: auth.token, dual: auth.dual });
  console.log(inbox.status, JSON.stringify(j(inbox)).slice(0, 900));

  console.log('\n=== /audit/pending (initiator) ===');
  const ap = await req('GET', '/audit/pending', { token: init.token, dual: init.dual });
  console.log(ap.status, JSON.stringify(j(ap)).slice(0, 1200));

  console.log('\n=== /org-users/dual-control (initiator) ===');
  const dc = await req('GET', '/org-users/dual-control', { token: init.token, dual: init.dual });
  console.log(dc.status, JSON.stringify(j(dc)).slice(0, 600));

  console.log('\n=== /scans/consent (initiator) ===');
  const consent = await req('GET', '/scans/consent', { token: init.token, dual: init.dual });
  console.log(consent.status, JSON.stringify(j(consent)).slice(0, 900));

  console.log('\n=== campaign 32 (full) ===');
  const c = await req('GET', '/vapt/campaigns/32', { token: init.token, dual: init.dual });
  const cj = j(c) || {};
  console.log('status:', c.status, '| campaign status:', cj.status, '| current_step:', cj.current_step_index);
  console.log('keys:', Object.keys(cj).join(', '));
  console.log('steps:', JSON.stringify(cj.steps || cj.campaign_steps || []).slice(0, 1400));
  if (cj.meta) console.log('meta:', JSON.stringify(cj.meta).slice(0, 900));

  console.log('\n=== campaign 32 approvals ===');
  const apv = await req('GET', '/vapt/campaigns/32/approvals', { token: init.token, dual: init.dual });
  console.log(apv.status, JSON.stringify(j(apv)).slice(0, 900));

  console.log('\n=== procedures (keys) ===');
  const pr = await req('GET', '/vapt/procedures', { token: init.token, dual: init.dual });
  const pl = j(pr) || [];
  console.log(pr.status, Array.isArray(pl) ? pl.map((p) => `${p.key || p.procedure_key || p.id}:${(p.steps || []).length}steps`).join(' | ') : JSON.stringify(pl).slice(0, 400));

  console.log('\n=== scans jobs / results / active ===');
  for (const p of ['/scans/jobs', '/scans/jobs/active', '/scans/results?limit=20', '/scans/exposure']) {
    const r = await req('GET', p, { token: init.token, dual: init.dual });
    const b = j(r);
    const n = Array.isArray(b) ? b.length : (b && b.items ? b.items.length : (b === null ? 'null' : 'obj'));
    console.log(` ${r.status} ${p} → ${n}`);
  }

  console.log('\n=== risks / findings intake ===');
  for (const p of ['/risks', '/findings/intake', '/vapt/campaigns/32/findings']) {
    const r = await req('GET', p, { token: init.token, dual: init.dual });
    const b = j(r);
    const n = Array.isArray(b) ? b.length : (b && b.items ? b.items.length : (b && b.total !== undefined ? 'total=' + b.total : 'obj'));
    console.log(` ${r.status} ${p} → ${n}`);
  }
})();
