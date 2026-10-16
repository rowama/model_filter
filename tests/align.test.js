// NODE_PATH=<playwright node_modules> node tests/align.test.js — header alignment matches cell alignment (models.yaml + books.yaml)
const { chromium } = require('playwright'); const path = require('path'); const assert = require('assert');
(async () => {
  const { serve, openApp } = require('./helpers'); const S = await serve();
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 2400, height: 900 } }); const ok = [];
  const check = async (label) => {
    const r = await p.evaluate(() => [...document.querySelectorAll('#table thead th')].map((th, i) => {
      const td = document.querySelector(`#table tbody tr td:nth-child(${i + 1})`); const lbl = th.querySelector('.lbl').getBoundingClientRect();
      const rng = document.createRange(); rng.selectNodeContents(td); const cr = rng.getBoundingClientRect();
      return { col: th.dataset.col, thAlign: getComputedStyle(th).textAlign, tdAlign: getComputedStyle(td).textAlign, num: td.classList.contains('num'), lblR: lbl.right, cellR: cr.right, lblL: lbl.left, cellL: cr.left };
    }));
    for (const c of r) {
      assert.strictEqual(c.thAlign, c.tdAlign, `${label} ${c.col}: header ${c.thAlign} vs cell ${c.tdAlign}`);
      if (c.num && c.cellR > 0) { assert.strictEqual(c.thAlign, 'right'); assert(Math.abs(c.lblR - c.cellR) <= 1.5, `${label} ${c.col}: header right ${c.lblR} vs cell right ${c.cellR}`); }
      else if (c.cellR > 0) assert(Math.abs(c.lblL - c.cellL) <= 1.5, `${label} ${c.col}: left edges ${c.lblL} vs ${c.cellL}`);
    }
    return r.filter(c => c.num).length;
  };
  for (const [name, cfg, col] of [['models', 'models.yaml', 'priceIn'], ['books', 'examples/books.yaml', 'price']]) {
    await openApp(p, S.base + 'index.html?config=' + cfg);
    if (name === 'models') await p.check('input[name=type][value=text]');
    const n = await check(name); ok.push(`${name}: ${n} numeric headers right-aligned to their numbers`);
    for (const dir of ['asc', 'desc']) { await p.click(`th[data-col=${col}]`); await check(`${name} sorted ${dir}`);
      assert(await p.$eval(`th[data-col=${col}]`, th => th.firstElementChild.classList.contains('arr')), 'arrow on the left of right-aligned header'); }
    ok.push(`${name}: alignment holds with sort arrow (arrow left of label)`);

  }
  ok.forEach(s => console.log('PASS', s)); console.log(`${ok.length} passed`); await b.close(); S.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
