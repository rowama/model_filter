// UI test (facet popups): NODE_PATH=<dir with playwright> node tests/ui.test.js
const { chromium } = require('playwright'); const path = require('path'); const assert = require('assert');
(async () => {
  const { serve, openApp } = require('./helpers'); const S = await serve(); const APP = S.base + 'index.html?config=models.yaml';
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await openApp(p, APP);
  const ok = []; const step = n => ok.push(n);
  const rows = () => p.locator('#table tbody tr').count();
  const fpop = p.locator('#fpop');
  const popBox = re => p.locator('#fpop label.box', { hasText: re }).first();
  const panelSel = re => p.locator('#facets label.box.sel', { hasText: re }).first();
  const leave = async () => { await p.mouse.move(700, 450, { steps: 4 }); await p.waitForTimeout(350); };
  const total = await rows(); assert(total > 500); step('initial table ' + total);
  assert((await p.locator('#meta').textContent()).includes('Snapshot')); step('snapshot date shown');
  // facets listed by name without checkboxes
  assert.strictEqual(await p.locator('#facets .fname input').count(), 0);
  assert(await p.locator('#facets .fname', { hasText: 'Input price' }).count() && await p.locator('#facets .fname', { hasText: 'Output price' }).count());
  step('facets listed by name (no checkbox), Input/Output price separate');
  await p.check('input[name=type][value=text]'); const tText = await rows(); assert(tText < total); step('type radio text ' + tText);
  // hover facet -> popup with level-1 boxes
  await p.hover('.fname[data-facet=context]'); await p.waitForTimeout(80);
  assert(await fpop.isVisible()); assert.strictEqual(await fpop.getAttribute('data-key'), 'context');
  assert.strictEqual(await p.locator('#fpop .lvl').count(), 1); step('hover facet -> popup with level 1');
  // zero-count unchecked hidden in popup
  const zero = await p.locator('#fpop label.box').evaluateAll(ls => ls.filter(l => l.querySelector('.n').textContent.startsWith('(0') && !l.querySelector('input').checked).length);
  assert.strictEqual(zero, 0); step('zero-count unchecked boxes hidden');
  // check -> child level appears inside popup, results update live
  const pb = await fpop.boundingBox(); await p.mouse.move(pb.x + 30, pb.y + 40, { steps: 5 });
  await popBox('Context window: 100k–500k tokens').locator('input').check();
  const r1 = await rows(); assert(r1 < tText, 'live results'); assert.strictEqual(await p.locator('#fpop .lvl').count(), 2, 'child level in popup');
  assert(await fpop.isVisible()); step(`check -> child level in popup; live results ${tText}->${r1}`);
  const child = p.locator('#fpop .lvl[data-level="1"] label.box').first(); const childLabel = (await child.locator('span').first().textContent());
  await child.locator('input').check(); const r2 = await rows(); assert(r2 < r1); step('governing child level filters live ' + r2);
  // panel not yet showing items while popup open; leave -> items appear under facet
  assert.strictEqual(await p.locator('#facets .facet[data-facet=context] label.sel').count(), 0);
  await leave(); assert(await fpop.isHidden());
  const sel = await p.locator('#facets .facet[data-facet=context] label.sel span:first-of-type').allTextContents();
  assert(sel.includes('Context window: 100k–500k tokens') && sel.includes(childLabel), 'panel items: ' + sel); step('leave -> checked items listed under facet');
  // hover checked item -> popup reopens at depth (both levels + next level if any)
  await panelSel(childLabel).hover(); await p.waitForTimeout(80);
  assert(await fpop.isVisible()); assert(await p.locator('#fpop .lvl').count() >= 2);
  assert(await popBox(childLabel).locator('input').isChecked()); step('hover checked item -> popup at depth');
  await leave();
  // uncheck in panel updates live
  await panelSel(childLabel).locator('input').click(); await p.waitForTimeout(50); assert.strictEqual(await panelSel(childLabel).count(), 0, 'item removed from panel'); assert.strictEqual(await rows(), r1); step('uncheck in panel updates live');
  await leave();
  // type switch hides + preserves
  await p.check('input[name=type][value=all]'); assert.strictEqual(await p.locator('#facets .facet[data-facet=context]').count(), 0);
  await p.check('input[name=type][value=text]'); assert.strictEqual(await rows(), r1);
  assert(await panelSel('Context window: 100k–500k tokens').locator('input').isChecked()); step('type switch hide/restore');
  // All/Any frame in popup (Job)
  await p.hover('.fname[data-facet=jobs]'); await p.waitForTimeout(80);
  const jb = await fpop.boundingBox(); await p.mouse.move(jb.x + 30, jb.y + 40, { steps: 5 });
  await popBox(/^Job: Coding\(/).locator('input').check(); await popBox(/^Job: Writing\(/).locator('input').check();
  await p.waitForTimeout(250);
  assert.strictEqual(await p.locator('#fpop .frame').count(), 1); assert.strictEqual(await p.locator('#fpop .frame label.box').count(), 2);
  const fAll = await rows(); await p.locator('#fpop .frame input[value=any]').check(); const fAny = await rows(); assert(fAny > fAll);
  step(`All/Any frame in popup all=${fAll} any=${fAny}`);
  // Esc closes and panel updates
  await p.keyboard.press('Escape'); assert(await fpop.isHidden());
  assert(await p.locator('#facets .facet[data-facet=jobs] label.sel').count() >= 2); step('Esc closes; selections in panel');
  // anecdotal asterisk (fresh page): Job -> Coding -> Refactoring
  await openApp(p, APP);
  await p.hover('.fname[data-facet=jobs]'); await p.waitForTimeout(80);
  const jb2 = await fpop.boundingBox(); await p.mouse.move(jb2.x + 30, jb2.y + 40, { steps: 5 });
  await popBox(/^Job: Coding\(/).locator('input').check();
  await popBox(/^Job: Coding › Refactoring\(/).locator('input').check();
  assert((await popBox(/^Job: Coding › Refactoring\(/).textContent()).includes('*'));
  assert(await p.locator('#table tbody .anec').count() > 0); step('anecdotal * in popup count + row');
  await leave();
  // Available from facet in popup (All types): level 1 -> level 2 providers, All/Any frame
  await openApp(p, APP);
  await p.hover('.fname[data-facet=availableFrom]'); await p.waitForTimeout(80);
  const ab = await fpop.boundingBox(); await p.mouse.move(ab.x + 30, ab.y + 40, { steps: 5 });
  const before = await rows();
  await popBox(/^Available from: Aggregators\(/).locator('input').check();
  assert(await popBox(/^Available from: OpenRouter\(/).count(), 'level-2 provider in popup'); assert(await rows() < before);
  await popBox(/^Available from: Cloud platforms\(/).locator('input').check(); await p.waitForTimeout(250);
  assert.strictEqual(await p.locator('#fpop .frame').count(), 1);
  await popBox(/^Available from: OpenRouter\(/).locator('input').check();
  await leave(); assert(await panelSel(/^Available from: OpenRouter\(/).count()); step('Available from facet: popup levels, frame, panel items');
  // sorting
  await p.click('th[data-col=priceIn]'); assert((await p.locator('th[data-col=priceIn]').textContent()).includes('▲'));
  await p.click('th[data-col=priceIn]'); assert((await p.locator('th[data-col=priceIn]').textContent()).includes('▼')); step('sort arrows');
  await p.hover('#table tbody tr:first-child td:first-child'); await p.waitForTimeout(80); assert(await p.locator('#pop').isVisible()); step('row popover');
  await p.screenshot({ path: path.join(__dirname, 'screenshot.png') });
  assert.deepStrictEqual(errs, []); step('no console errors');
  console.log(ok.map(s => 'PASS ' + s).join('\n')); await b.close(); S.close();
})().catch(e => { console.error('FAIL', e.message, e.stack.split('\n').find(l => l.includes('ui.test'))); process.exit(1); });
