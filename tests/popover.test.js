// NODE_PATH=<playwright node_modules> node tests/popover.test.js — row hover popover intent behaviour
const { chromium } = require('playwright'); const path = require('path'); const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.join(__dirname, '../index.html'));
  const ok = []; const step = n => ok.push(n);
  const row = i => p.locator(`#table tbody tr[data-i="${i}"] td:first-child`);
  const popRow = () => p.locator('#pop').getAttribute('data-row');
  const inView = async () => { const r = await p.locator('#pop').boundingBox(); return r.y >= 0 && r.x >= 0 && r.y + r.height <= 900 + 1 && r.x + r.width <= 1400 + 1; };
  // 1 anchored: show on row 2, small cursor moves within the row do not move the popup
  const r2 = await row(2).boundingBox();
  await p.mouse.move(r2.x + 20, r2.y + r2.height / 2); await p.waitForTimeout(50);
  assert(await p.locator('#pop').isVisible()); assert.strictEqual(await popRow(), '2');
  const b0 = await p.locator('#pop').boundingBox();
  await p.mouse.move(r2.x + 120, r2.y + r2.height / 2, { steps: 5 }); const b1 = await p.locator('#pop').boundingBox();
  assert.strictEqual(b0.x, b1.x); assert.strictEqual(b0.y, b1.y); assert(await inView()); step('popup anchored to row, static, inside viewport');
  // 2 travel diagonally from row across other rows into the popup quickly -> no retarget
  const pb = await p.locator('#pop').boundingBox();
  const target = { x: pb.x + 40, y: pb.y + pb.height - 30 };
  // slow segment: >300ms of continuous movement toward the popup inside a single other row (safe-triangle must hold)
  const sx = r2.x + 120, sy = r2.y + r2.height / 2, ex = pb.x - 2;
  const r3 = await row(3).boundingBox(); const yRow3 = r3.y + r3.height / 2;
  for (let k = 1; k <= 10; k++) { await p.mouse.move(sx + (ex - sx) * k / 40, yRow3); await p.waitForTimeout(50); }
  assert.strictEqual(await popRow(), '2', 'retargeted during slow intentional movement');
  await p.mouse.move(target.x, target.y, { steps: 12 });
  assert.strictEqual(await popRow(), '2', 'retargeted while moving toward popup'); step('crossing other rows toward popup does not retarget');
  // 3 locked inside popup; click Provenance
  await p.waitForTimeout(400); assert.strictEqual(await popRow(), '2', 'retargeted while inside popup');
  await p.click('#pop details summary'); assert(await p.locator('#pop details').evaluate(d => d.open)); assert(await inView());
  step('locked in popup; Provenance expands and stays in viewport');
  // 4 leave popup onto a row -> retarget only after dwell
  const r8 = await row(8).boundingBox();
  await p.mouse.move(r8.x + 20, r8.y + r8.height / 2, { steps: 3 }); await p.waitForTimeout(120);
  assert.strictEqual(await popRow(), '2', 'retargeted before dwell');
  await p.waitForTimeout(350); assert.strictEqual(await popRow(), '8', 'did not retarget after dwell'); step('retarget after ~300ms dwell only');
  // 5 brief pass over another row without dwell -> no retarget
  const r12 = await row(12).boundingBox();
  await p.mouse.move(r12.x + 20, r12.y + r12.height / 2); await p.waitForTimeout(100);
  await p.mouse.move(r8.x + 20, r8.y + r8.height / 2); await p.waitForTimeout(400);
  assert.strictEqual(await popRow(), '8'); step('brief pass over another row ignored');
  // 6 Esc closes
  await p.keyboard.press('Escape'); assert(await p.locator('#pop').isHidden()); step('Esc closes');
  // 7 leaving table hides after grace
  await p.mouse.move(r8.x + 20, r8.y + r8.height / 2); await p.mouse.move(r8.x + 25, r8.y + r8.height / 2); assert(await p.locator('#pop').isVisible());
  await p.mouse.move(150, 300); await p.waitForTimeout(350); assert(await p.locator('#pop').isHidden()); step('hides ~200ms after leaving rows');
  // facet popup shares the mechanics: move from a facet across other facets into its popup -> no retarget; dwell retargets
  const f1 = await p.locator('.fname[data-facet=weights]').boundingBox();
  await p.mouse.move(f1.x + 20, f1.y + f1.height / 2); await p.waitForTimeout(60);
  assert.strictEqual(await p.locator('#fpop').getAttribute('data-key'), 'weights');
  const fb = await p.locator('#fpop').boundingBox();
  await p.mouse.move(fb.x + 30, fb.y + fb.height - 15, { steps: 10 });
  assert.strictEqual(await p.locator('#fpop').getAttribute('data-key'), 'weights'); step('facet popup: crossing other facets into popup keeps target');
  const f3 = await p.locator('.fname[data-facet=priceOut]').boundingBox();
  await p.mouse.move(f3.x + 20, f3.y + f3.height / 2, { steps: 3 }); await p.waitForTimeout(120);
  assert.strictEqual(await p.locator('#fpop').getAttribute('data-key'), 'weights');
  await p.waitForTimeout(350); assert.strictEqual(await p.locator('#fpop').getAttribute('data-key'), 'priceOut'); step('facet popup: retarget after dwell');
  await p.keyboard.press('Escape'); assert(await p.locator('#fpop').isHidden()); step('facet popup: Esc closes');
  assert.deepStrictEqual(errs, []); step('no page errors');
  console.log(ok.map(s => 'PASS ' + s).join('\n')); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
