#!/usr/bin/env node
/** rasterise the two still SVGs into PNGs for easy sharing */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HERE = __dirname.replace(/\\/g, '/');
const fileUrl = (p) => 'file:///' + p.replace(/ /g, '%20');

for (const f of ['still', 'still-vertical']) {
  const wrap = path.join(__dirname, `_wrap-${f}.html`);
  fs.writeFileSync(wrap, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#07090c}img{display:block;max-width:none}</style><img src="${f}.svg">`);
  const out = path.join(__dirname, f + '.png');
  const size = f === 'still' ? '4100,1420' : '2300,2500';
  try {
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--window-size=' + size, '--screenshot=' + out, fileUrl(HERE + `/_wrap-${f}.html`)], { stdio: 'ignore' });
    console.log('rendered', path.basename(out), fs.statSync(out).size + ' bytes');
  } catch (e) {
    console.log('failed', f, String(e.message).slice(0, 160));
  } finally {
    fs.unlinkSync(wrap);
  }
}
