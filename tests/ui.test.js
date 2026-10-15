// UI smoke test: NODE_PATH=<dir with playwright> node tests/ui.test.js
const { chromium } = require('playwright'); const path = require('path'); const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + path.join(__dirname, '../index.html'));
  const ok = []; const step = (n) => ok.push(n);
  const box = label => p.locator('#boxes label.box', { hasText: label }).first();
  const rows = async () => p.locator('#table tbody tr').count();
  const total = await rows(); assert(total > 500); step('initial table ' + total);
  assert(await p.locator('#meta').textContent().then(t => t.includes('Snapshot'))); step('snapshot date shown');
  await p.check('input[name=type][value=text]'); const tText = await rows(); assert(tText < total); step('type radio text ' + tText);
  await box('Context window: 100k–500k tokens').locator('input').check();
  const r1 = await rows(); assert(r1 < tText); step('instant update ' + r1);
  const scrollEnd = async () => { for (let i = 0; i < 6; i++) { await p.locator('#filters').evaluate(e => e.scrollTop = e.scrollHeight); await p.waitForTimeout(120); } };
  await scrollEnd();
  const labels = await p.locator('#boxes label.box span:first-of-type').allTextContents();
  const last = labels.slice(-3); assert(last.every(l => l.startsWith('Context window:')), 'refinement appended at bottom: ' + last); step('refinement appended at bottom');
  // frame
  await box(/^Job: Coding\(/).locator('input').check();
  const wb = box(/^Job: Writing\(/); await wb.scrollIntoViewIfNeeded(); const y0 = (await wb.boundingBox()).y; await wb.locator('input').check();
  await p.waitForTimeout(300); const y1 = (await box(/^Job: Writing\(/).boundingBox()).y; const st = await p.locator('#filters').evaluate(e => e.scrollTop); assert(Math.abs(y1 - y0) < 2 || (st === 0 && y1 < y0 && y1 >= 0), `clicked box moved ${y0}->${y1} st=${st}`); assert(await box(/^Job: Writing\(/).isVisible()); step(`clicked box anchored/visible (${y0}->${y1}, scrollTop ${st})`);
  await p.waitForTimeout(300);
  assert.strictEqual(await p.locator('.frame').count(), 1); assert.strictEqual(await p.locator('.frame label.box').count(), 2);
  const fAll = await rows(); await p.locator('.frame input[value=any]').check(); const fAny = await rows(); assert(fAny > fAll); step(`All/Any frame all=${fAll} any=${fAny}`);
  const zeroUnchecked = await p.locator('#boxes label.box').evaluateAll(ls => ls.filter(l => l.querySelector('.n').textContent === '(0)' && !l.querySelector('input').checked).length);
  assert.strictEqual(zeroUnchecked, 0); step('zero-count unchecked boxes hidden');
  // type switch preserve
  await p.check('input[name=type][value=all]'); assert.strictEqual(await p.locator('#boxes', { hasText: 'Context window' }).count(), 0);
  await p.check('input[name=type][value=text]'); assert(await box('Context window: 100k–500k tokens').locator('input').isChecked()); step('type switch hide/restore');
  // sort
  await p.click('th[data-col=priceIn]'); assert((await p.locator('th[data-col=priceIn]').textContent()).includes('▲'));
  await p.click('th[data-col=priceIn]'); assert((await p.locator('th[data-col=priceIn]').textContent()).includes('▼'));
  const lastCell = await p.locator('#table tbody tr:last-child td').nth(2).textContent(); step('sort desc arrow; last row price=' + lastCell);
  await p.hover('#table tbody tr:first-child td:first-child'); assert(await p.locator('#pop').isVisible()); step('hover popover');
  await p.locator('#filters').evaluate(e => e.scrollTop = e.scrollHeight); await p.waitForTimeout(200);
  step('infinite scroll items ' + await p.locator('#boxes label.box').count());
  await p.screenshot({ path: path.join(__dirname, 'screenshot.png') });
  assert.deepStrictEqual(errs, []); step('no console errors');
  console.log(ok.map(s => 'PASS ' + s).join('\n')); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
