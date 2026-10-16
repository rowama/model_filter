// NODE_PATH=<playwright node_modules> node tests/findit.test.js — row highlight + 'Find it here' links
const { chromium } = require('playwright'); const path = require('path'); const assert = require('assert');
(async () => {
  const { serve, openApp } = require('./helpers'); const S = await serve(); const APP = S.base + 'index.html?config=models.yaml';
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route(u => u.hostname !== '127.0.0.1', r => r.abort()); // never hit the network from tests
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await openApp(p, APP);
  const ok = []; const step = n => ok.push(n);
  const tr = i => p.locator(`#table tbody tr[data-i="${i}"]`);
  const hl = () => p.$$eval('#table tbody tr.hl', ts => ts.map(t => t.dataset.i));
  const popRow = () => p.locator('#pop').getAttribute('data-row');
  // catalog: links present, provenance recorded, only http(s)
  const cat = await p.evaluate(() => MF_APP.rows.filter(m => m.links && m.links.length).map(m => ({ l: m.links, pv: m.prov && m.prov.links })));
  assert(cat.length > 300); assert(cat.every(c => c.pv && c.l.every(x => /^https:\/\//.test(x.url)))); step(`catalog links with provenance (${cat.length} models)`);
  // highlight on open
  const b2 = await tr(2).locator('td').first().boundingBox();
  await p.mouse.move(b2.x + 20, b2.y + b2.height / 2); await p.waitForTimeout(80);
  assert.deepStrictEqual(await hl(), ['2']);
  const st = await tr(2).locator('td').first().evaluate(td => [getComputedStyle(td).fontWeight, getComputedStyle(td).backgroundColor]);
  assert(+st[0] >= 700, 'bold'); assert.strictEqual(st[1], 'rgb(228, 230, 234)'); step('row highlighted (bold name, darker grey) while popup shows');
  // retarget clears old
  const b6 = await tr(6).locator('td').first().boundingBox();
  await p.mouse.move(b6.x + 20, b6.y + b6.height / 2, { steps: 2 }); await p.waitForTimeout(450);
  assert.strictEqual(await popRow(), '6'); assert.deepStrictEqual(await hl(), ['6']); step('highlight moves on retarget');
  // Find it here at top
  const first = await p.locator('#pop > *').first().evaluate(e => e.className); assert.strictEqual(first, 'find');
  const n = await p.evaluate(() => (MF_APP.rowPop, document.querySelectorAll('#pop .find a').length));
  const pb = await p.locator('#pop summary').first().boundingBox();
  await p.mouse.move(pb.x + 10, pb.y + pb.height / 2, { steps: 10 }); await p.click('#pop details.find summary');
  assert(await p.locator('#pop details.find').evaluate(d => d.open)); assert(n > 0, 'has links');
  const as = await p.$$eval('#pop .find a', a => a.map(x => [x.target, x.href]));
  assert(as.every(([t, h]) => t === '_blank' && h.startsWith('https://'))); step(`Find it here lists ${n} links, target=_blank`);
  // click each link: opens new tab, popup does not retarget, highlight persists
  for (let i = 0; i < n; i++) {
    const a = p.locator('#pop .find a').nth(i); const bb = await a.boundingBox();
    await p.mouse.move(bb.x + 5, bb.y + bb.height / 2, { steps: 4 });
    const [np] = await Promise.all([ctx.waitForEvent('page'), a.click()]);
    await np.close();
    assert.strictEqual(await popRow(), '6', 'retargeted'); assert(await p.locator('#pop').isVisible());
  }
  assert.deepStrictEqual(await hl(), ['6']); step('links clickable, popup stays on row, highlight persists');
  // close clears highlight
  await p.keyboard.press('Escape'); await p.waitForTimeout(50);
  assert(await p.locator('#pop').isHidden()); assert.deepStrictEqual(await hl(), []); step('close (Esc) clears highlight');
  // leave -> grace close clears too
  await p.mouse.move(b2.x + 20, b2.y + b2.height / 2); await p.waitForTimeout(80); assert.deepStrictEqual(await hl(), ['2']);
  await p.mouse.move(5, 5, { steps: 3 }); await p.waitForTimeout(450); assert.deepStrictEqual(await hl(), []); step('leave clears highlight');
  assert.deepStrictEqual(errs, []);
  ok.forEach(s => console.log('PASS', s)); console.log(`${ok.length} passed`); await b.close(); S.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
