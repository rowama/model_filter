// NODE_PATH=<playwright node_modules> node tests/menu.test.js — hamburger menu: switch configs live, failed load keeps current, recent, keyboard, dist file:// picker
const { chromium } = require('playwright'); const path = require('path'); const assert = require('assert'); const fs = require('fs');
(async () => {
  const { serve, openApp, ROOT } = require('./helpers'); const S = await serve();
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route(u => u.protocol.startsWith('http') && u.hostname !== '127.0.0.1', r => r.abort());
  const ok = [], step = n => ok.push(n), errs = [];
  let p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const rows = () => p.locator('#table tbody tr').count();
  const menuAct = async (act, i) => { await p.click('#menu-btn'); await p.click(`#menu [data-act=${act}]${i != null ? `[data-i="${i}"]` : ''}`); };
  const ready = (title) => p.waitForFunction(t => window.MF_APP && MF_APP.ready && MF_APP.spec.title === t, title);
  const openByPath = async (q) => { await menuAct('path'); await p.fill('#path-input', q); await p.press('#path-input', 'Enter'); };
  await openApp(p, S.base + 'index.html?config=models.yaml'); const nModels = await rows(); assert(nModels > 500);
  // dirty state in models: type, filter, sort, open popup
  await p.check('input[name=type][value=text]'); await p.hover('.fname[data-facet=context]'); await p.waitForTimeout(80);
  const fb = await p.locator('#fpop').boundingBox(); await p.mouse.move(fb.x + 30, fb.y + 40, { steps: 4 });
  await p.locator('#fpop label.box').first().locator('input').check(); await p.mouse.move(700, 450, { steps: 3 }); await p.waitForTimeout(350);
  await p.click('th[data-col=priceIn]'); assert(await rows() < nModels);
  // models -> books by path
  await openByPath('examples/books.yaml'); await ready('Book Finder (example data)');
  assert.strictEqual(await rows(), 30); assert.strictEqual(new URL(p.url()).searchParams.get('config'), 'examples/books.yaml');
  assert.strictEqual(await p.locator('#facets label.sel').count(), 0); assert(await p.locator('#loader').isHidden());
  assert((await p.locator('th[data-col=title]').textContent()).includes('▲'), 'books default sort, not old sort');
  assert.strictEqual(await p.locator('input[name=type]:checked').getAttribute('value'), 'any'); step('models -> books by path: no reload, state reset, ?config updated');
  // popups work on the new config, old listeners gone
  await p.hover('.fname[data-facet=genre]'); await p.waitForTimeout(80); assert.strictEqual(await p.locator('#fpop').getAttribute('data-key'), 'genre');
  await p.keyboard.press('Escape'); await p.hover('#table tbody tr:first-child td:first-child'); await p.waitForTimeout(100);
  assert((await p.locator('#pop').innerHTML()).includes('<b>Genre</b>')); assert.strictEqual(await p.locator('tr.hl').count(), 1); await p.keyboard.press('Escape'); step('popups/highlight work after switch');
  // failed load keeps current
  await openByPath('tests/fixtures/bad.yaml'); await p.waitForSelector('#errors:not([hidden])');
  assert((await p.locator('#errors').textContent()).includes('facets[0].kind')); assert((await p.locator('#errors').textContent()).includes('current config is still loaded'));
  assert.strictEqual(await rows(), 30); assert.strictEqual(await p.evaluate(() => MF_APP.spec.title), 'Book Finder (example data)');
  assert.strictEqual(new URL(p.url()).searchParams.get('config'), 'examples/books.yaml');
  await openByPath('nope.yaml'); await p.waitForSelector('#errors:not([hidden])'); assert((await p.locator('#errors').textContent()).includes('HTTP 404')); assert.strictEqual(await rows(), 30);
  await p.keyboard.press('Escape'); assert(await p.locator('#loader').isHidden()); step('failed loads (invalid, 404) keep current config; Esc closes loader');
  // recent -> back to models (by path), fully reset
  await p.click('#menu-btn'); const rec = await p.locator('#menu [data-act=recent]').allTextContents();
  assert(rec[0].includes('Book Finder') && rec.some(t => t.includes('Model Filter')), rec.join('|')); await p.keyboard.press('Escape');
  const mi = rec.findIndex(t => t.includes('Model Filter')); await menuAct('recent', mi); await ready('Model Filter');
  assert.strictEqual(await rows(), nModels); assert.strictEqual(await p.locator('#facets label.sel').count(), 0);
  assert(!/[▲▼]/.test(await p.locator('#table thead').textContent()), 'sort reset'); assert.strictEqual(new URL(p.url()).searchParams.get('config'), 'models.yaml');
  step('recent -> models: state, sort reset');
  // reload current
  await menuAct('reload'); await p.waitForTimeout(300); assert.strictEqual(await rows(), nModels); step('reload current');
  // Load YAML… (picker) over http
  await menuAct('load'); assert(await p.locator('#loader.overlay').isVisible());
  await p.setInputFiles('#pick-files', ['books.yaml', 'books.csv', 'genres.yaml'].map(f => path.join(ROOT, 'examples', f))); await ready('Book Finder (example data)');
  assert.strictEqual(await rows(), 30); step('Load YAML… picker replaces config over http');
  // recent capped at 5
  for (let i = 0; i < 4; i++) { await openByPath(i % 2 ? 'models.yaml' : 'examples/books.yaml'); await p.waitForTimeout(300); }
  assert((await p.evaluate(() => JSON.parse(localStorage.getItem('mf-recent')).length)) <= 5); step('recent list capped at 5');
  // keyboard + outside click
  await p.focus('#menu-btn'); await p.keyboard.press('ArrowDown'); assert(await p.locator('#menu').isVisible());
  assert.strictEqual(await p.evaluate(() => document.activeElement.dataset.act), 'load');
  await p.keyboard.press('ArrowDown'); assert.strictEqual(await p.evaluate(() => document.activeElement.dataset.act), 'path');
  await p.keyboard.press('Escape'); assert(await p.locator('#menu').isHidden()); assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'menu-btn');
  assert.strictEqual(await p.getAttribute('#menu-btn', 'aria-expanded'), 'false');
  await p.keyboard.press('Enter'); assert(await p.locator('#menu').isVisible()); await p.mouse.click(900, 600); assert(await p.locator('#menu').isHidden());
  step('keyboard (ArrowDown/Up, Esc returns focus, Enter) + outside click');
  // dist single file on file://: embedded default first, then picker route
  const tmp = fs.mkdtempSync('/tmp/mfmenu-'); fs.copyFileSync(path.join(ROOT, 'dist/model-filter.html'), path.join(tmp, 'model-filter.html'));
  p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await openApp(p, 'file://' + path.join(tmp, 'model-filter.html'));
  assert(await rows() > 500); await p.click('#menu-btn'); assert.strictEqual(await p.locator('#menu [data-act=path]').count(), 0, 'no Open by path on file://');
  await p.click('#menu [data-act=load]');
  await p.setInputFiles('#pick-files', [path.join(ROOT, 'examples/books.yaml')]); await p.waitForSelector('#need:not([hidden])');
  assert((await p.locator('#need').textContent()).includes('books.csv'));
  await p.setInputFiles('#pick-files', [path.join(ROOT, 'examples/books.csv'), path.join(ROOT, 'examples/genres.yaml')]); await ready('Book Finder (example data)');
  assert.strictEqual(await rows(), 30); step('dist file://: embedded default, then Load YAML… (yaml, then dataset) switches');
  await p.click('#menu-btn'); const r2 = await p.locator('#menu [data-act=recent]').first().textContent(); assert(r2.includes('re-pick'), r2);
  await p.click('#menu [data-act=recent]'); await p.waitForSelector('#need:not([hidden])'); assert((await p.locator('#need').textContent()).includes('Re-pick'));
  assert.strictEqual(await rows(), 30); await p.keyboard.press('Escape');
  await menuAct('reload'); await ready('Book Finder (example data)'); assert.strictEqual(await rows(), 30);
  await menuAct('default'); await ready('Model Filter'); assert(await rows() > 500); step('dist: recent re-pick hint, reload current (files), load default');
  assert.deepStrictEqual(errs, []); step('no page errors');
  ok.forEach(s => console.log('PASS', s)); console.log(`${ok.length} passed`); await b.close(); S.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
