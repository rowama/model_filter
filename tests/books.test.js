// NODE_PATH=<playwright node_modules> node tests/books.test.js — CSV example over http, file:// picker/drag-drop, validation errors in UI
const { chromium } = require('playwright'); const path = require('path'); const assert = require('assert'); const fs = require('fs');
(async () => {
  const { serve, openApp, ROOT } = require('./helpers'); const S = await serve();
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route(u => u.protocol.startsWith('http') && u.hostname !== '127.0.0.1', r => r.abort());
  const ok = []; const step = n => ok.push(n); const errs = [];
  let p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const rows = () => p.locator('#table tbody tr').count();
  // 1 served: ?config=examples/books.yaml
  await openApp(p, S.base + 'index.html?config=examples/books.yaml');
  assert.strictEqual(await rows(), 30); assert.strictEqual(await p.title(), 'Book Finder (example data)');
  assert((await p.locator('#meta').textContent()).startsWith('EXAMPLE DATA')); assert.strictEqual(await p.locator('#resultCount').textContent(), '30 of 30 books');
  assert((await p.locator('th[data-col=title]').textContent()).includes('▲'), 'default sort arrow'); step('books.yaml over http: 30 rows, title, header, default sort');
  assert.deepStrictEqual(await p.$$eval('#types input', es => es.map(e => e.value)), ['any', 'print', 'ebook', 'audio']);
  await p.check('input[name=type][value=audio]'); const nAudio = await rows(); assert(nAudio < 30 && nAudio > 0);
  await p.check('input[name=type][value=any]'); step(`type selector from config (audio=${nAudio})`);
  await p.hover('.fname[data-facet=genre]'); await p.waitForTimeout(80); assert.strictEqual(await p.locator('#fpop').getAttribute('data-key'), 'genre');
  const fb = await p.locator('#fpop').boundingBox(); await p.mouse.move(fb.x + 30, fb.y + 40, { steps: 5 });
  await p.locator('#fpop label.box', { hasText: /^Genre: Fiction\(/ }).locator('input').check();
  assert.strictEqual(await p.locator('#fpop .lvl').count(), 2); assert(await rows() < 30);
  await p.locator('#fpop label.box', { hasText: /Fiction › Mystery/ }).locator('input').check();
  const nm = await rows(); await p.mouse.move(700, 450, { steps: 4 }); await p.waitForTimeout(350);
  assert(await p.locator('#facets label.sel', { hasText: 'Genre: Fiction › Mystery' }).count()); step(`facet popup chain from taxonomy file (mystery=${nm})`);
  await p.locator('#facets label.sel', { hasText: 'Genre: Fiction › Mystery' }).locator('input').click();
  await p.locator('#facets label.sel', { hasText: /^Genre: Fiction\(/ }).locator('input').click(); assert.strictEqual(await rows(), 30);
  const td = p.locator('#table tbody tr[data-i="0"] td').first(); await td.hover(); await p.waitForTimeout(100);
  assert(await p.locator('#pop').isVisible()); assert.strictEqual(await p.locator('#table tbody tr.hl').count(), 1);
  assert((await p.locator('#pop').innerHTML()).includes('<b>Genre</b>')); step('row popup + highlight from config');
  await p.keyboard.press('Escape');
  await p.click('th[data-col=notes]'); assert(!/[▲▼]/.test(await p.locator('th[data-col=notes]').textContent()), 'sortable: false honoured');
  await p.click('th[data-col=price]'); const prices = await p.$$eval('#table tbody tr td:nth-child(3)', t => t.map(x => +x.textContent.replace('$', '')));
  assert.deepStrictEqual(prices, [...prices].sort((a, b) => a - b)); step('sort numeric column');
  // 2 file:// -> loader; pick YAML first, then the rest
  p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.join(ROOT, 'index.html'));
  assert(await p.locator('#loader').isVisible()); assert(await p.locator('#app').isHidden()); step('file:// shows loader');
  await p.setInputFiles('#pick-files', [path.join(ROOT, 'examples/books.yaml')]);
  await p.waitForSelector('#need:not([hidden])'); assert((await p.locator('#need').textContent()).includes('books.csv'));
  step('YAML alone -> asks for its dataset');
  await p.setInputFiles('#pick-files', [path.join(ROOT, 'examples/books.csv'), path.join(ROOT, 'examples/genres.yaml')]);
  await p.waitForFunction(() => window.MF_APP && MF_APP.ready); assert.strictEqual(await rows(), 30); step('then dataset + taxonomy -> app renders (two-step)');
  // 3 file:// select all at once (multi-select)
  p = await ctx.newPage(); await p.goto('file://' + path.join(ROOT, 'index.html'));
  await p.setInputFiles('#pick-files', ['books.yaml', 'books.csv', 'genres.yaml'].map(f => path.join(ROOT, 'examples', f)));
  await p.waitForFunction(() => window.MF_APP && MF_APP.ready); assert.strictEqual(await rows(), 30); step('multi-select all files at once');
  // 4 folder pick
  p = await ctx.newPage(); await p.goto('file://' + path.join(ROOT, 'index.html'));
  await p.setInputFiles('#pick-folder', path.join(ROOT, 'examples'));
  await p.waitForFunction(() => window.MF_APP && MF_APP.ready); assert.strictEqual(await rows(), 30); step('folder pick');
  // 5 drag-and-drop
  p = await ctx.newPage(); await p.goto('file://' + path.join(ROOT, 'index.html'));
  const payload = ['books.yaml', 'books.csv', 'genres.yaml'].map(f => [f, fs.readFileSync(path.join(ROOT, 'examples', f), 'utf8')]);
  await p.evaluate(fl => { const dt = new DataTransfer(); fl.forEach(([n, t]) => dt.items.add(new File([t], n))); document.querySelector('#drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, payload);
  await p.waitForFunction(() => window.MF_APP && MF_APP.ready); assert.strictEqual(await rows(), 30); step('drag-and-drop files');
  // 6 invalid config -> clear errors in UI (picker and http)
  p = await ctx.newPage(); await p.goto('file://' + path.join(ROOT, 'index.html'));
  await p.setInputFiles('#pick-files', [path.join(ROOT, 'tests/fixtures/bad.yaml')]);
  await p.waitForSelector('#errors:not([hidden])'); const et = await p.locator('#errors').textContent();
  assert(et.includes('dataset.format: must be one of json, csv') && et.includes('facets[0].kind: must be one of numeric, categorical, boolean'), et);
  p = await ctx.newPage(); await p.goto(S.base + 'index.html?config=tests/fixtures/bad.yaml'); await p.waitForSelector('#errors:not([hidden])');
  assert((await p.locator('#errors').textContent()).includes('facets[0].kind'));
  p = await ctx.newPage(); await p.goto(S.base + 'index.html?config=nope.yaml'); await p.waitForSelector('#errors:not([hidden])');
  assert((await p.locator('#errors').textContent()).includes('nope.yaml (HTTP 404)')); step('validation / missing-file errors shown in UI');
  // 7 default config when served without ?config
  p = await ctx.newPage(); await openApp(p, S.base + 'index.html'); assert((await rows()) > 500); step('http without ?config -> default models.yaml');
  // 8 dist single file alone on file:// uses embedded models.yaml
  const tmp = fs.mkdtempSync('/tmp/mfdist-'); fs.copyFileSync(path.join(ROOT, 'dist/model-filter.html'), path.join(tmp, 'model-filter.html'));
  p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await openApp(p, 'file://' + path.join(tmp, 'model-filter.html'));
  assert((await rows()) > 500); assert.strictEqual(await p.title(), 'Model Filter'); step('dist single file (embedded config + data) on file://');
  assert.deepStrictEqual(errs, []); step('no page errors');
  ok.forEach(s => console.log('PASS', s)); console.log(`${ok.length} passed`); await b.close(); S.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
