// NODE_PATH=<playwright node_modules> node tests/persist.test.js — per-config filter state persistence
const { chromium } = require('playwright'); const path = require('path'); const assert = require('assert');
(async () => {
  const { serve, openApp } = require('./helpers'); const S = await serve();
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const ok = [], step = n => ok.push(n), errs = [];
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const rows = () => p.locator('#table tbody tr').count();
  const st = () => p.evaluate(() => { const s = JSON.parse(JSON.stringify(MF_APP.getState())); // compare semantically: drop empty facets/levels
    for (const [k, d] of Object.entries(s.dims)) { while (d.levels.length && !d.levels[d.levels.length - 1].checked.length) d.levels.pop(); if (!d.levels.length) delete s.dims[k]; }
    s.dims = Object.fromEntries(Object.entries(s.dims).sort()); return s; });
  const ready = t => p.waitForFunction(t => window.MF_APP && MF_APP.ready && MF_APP.spec.title === t, t);
  const openByPath = async q => { await p.click('#menu-btn'); await p.click('#menu [data-act=path]'); await p.fill('#path-input', q); await p.press('#path-input', 'Enter'); };
  const popCheck = async (facet, re) => { await p.hover(`.fname[data-facet=${facet}]`); await p.waitForTimeout(80); const fb = await p.locator('#fpop').boundingBox();
    await p.mouse.move(fb.x + 30, fb.y + 40, { steps: 4 }); for (const r of [].concat(re)) await p.locator('#fpop label.box', { hasText: r }).first().locator('input').check(); };
  const leave = async () => { await p.mouse.move(700, 450, { steps: 3 }); await p.waitForTimeout(350); };
  await openApp(p, S.base + 'index.html?config=models.yaml');
  // build state: text type, context level 1+2, jobs coding+writing with Any, hidden embed-only selection, sort desc
  await p.check('input[name=type][value=embed]'); await popCheck('embedDim', /^Embedding dim: 1024–2048/); await leave();   // will be hidden under text
  await p.check('input[name=type][value=text]');
  await popCheck('context', [/^Context window: 100k–500k tokens/]); await p.locator('#fpop .lvl[data-level="1"] label.box').first().locator('input').check(); await leave();
  await popCheck('jobs', [/^Job: Coding\(/, /^Job: Writing\(/]); await p.waitForTimeout(250); await p.locator('#fpop .frame input[value=any]').check(); await leave();
  await p.click('th[data-col=priceIn]'); await p.click('th[data-col=priceIn]');
  let want = await st(), wantRows = await rows(), wantHtml = await p.locator('#facets').innerHTML();
  assert.strictEqual(want.type, 'text'); assert.strictEqual(want.dims.jobs.levels[0].mode, 'any'); assert.deepStrictEqual(want.sort, { col: 'priceIn', dir: 'desc' });
  assert(want.dims.embedDim.levels[0].checked.length === 1, 'hidden selection kept'); step(`models state built (${wantRows} rows)`);
  // switch to books, filter there, back to models
  await openByPath('examples/books.yaml'); await ready('Book Finder (example data)'); assert.strictEqual(await rows(), 30);
  await popCheck('genre', /^Genre: Fiction\(/); await leave(); const booksRows = await rows(); assert(booksRows < 30);
  await openByPath('models.yaml'); await ready('Model Filter');
  assert.deepStrictEqual(await st(), want); assert.strictEqual(await rows(), wantRows); assert.strictEqual(await p.locator('#facets').innerHTML(), wantHtml);
  assert.strictEqual(await p.locator('input[name=type]:checked').getAttribute('value'), 'text'); assert((await p.locator('th[data-col=priceIn]').textContent()).includes('▼'));
  step('models -> books -> models restores exactly (type, levels, Any, sort)');
  await p.check('input[name=type][value=embed]'); assert(await p.locator('#facets label.sel', { hasText: 'Embedding dim' }).count()); await p.check('input[name=type][value=text]');
  step('hidden-on-type-switch selection restored');
  // (switching type re-derives numeric child ranges for that type's universe, an existing engine rule, so re-snapshot)
  want = await st(); wantRows = await rows();
  // books kept its own state
  await openByPath('examples/books.yaml'); await ready('Book Finder (example data)'); assert.strictEqual(await rows(), booksRows); step('books has its own persisted state');
  // page reload restores
  await p.reload(); await ready('Book Finder (example data)'); assert.strictEqual(await rows(), booksRows);
  await openApp(p, S.base + 'index.html?config=models.yaml', { keep: true }); assert.deepStrictEqual(await st(), want); assert.strictEqual(await rows(), wantRows);
  assert(await p.locator('#warnings').isHidden(), 'no note when nothing dropped'); step('page reload restores (books and models)');
  // stale selections dropped with a note
  await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.dims.jobs.levels[0].checked.push('no.such.job'); s.dims.ghost = { levels: [{ checked: ['x'] }] };
    s.dims.context.levels[0].checked.push('123~456'); s.sort = { col: 'nope', dir: 'asc' }; localStorage.setItem(k, JSON.stringify(s)); }, await p.evaluate(() => MF_APP.stateKey));
  await p.reload(); await ready('Model Filter');
  const s2 = await st(); assert(!s2.dims.ghost && !s2.dims.jobs.levels[0].checked.includes('no.such.job') && !s2.dims.context.levels[0].checked.includes('123~456'));
  assert.deepStrictEqual(s2.dims.jobs, want.dims.jobs); assert.strictEqual(await rows(), wantRows);
  const note = await p.locator('#warnings').textContent(); assert(/dropped 4 selections/.test(note), note); assert(await p.locator('#table tbody tr').count() > 0);
  step('stale selections (unknown key, unknown facet, invalid range, unknown sort col) dropped with note');
  // corrupt storage is safe
  await p.evaluate(k => localStorage.setItem(k, '{not json'), await p.evaluate(() => MF_APP.stateKey)); await p.reload(); await ready('Model Filter');
  assert(await rows() > 500); step('corrupt saved state ignored safely');
  // clear filters (current config only)
  await openByPath('examples/books.yaml'); await ready('Book Finder (example data)'); assert.strictEqual(await rows(), booksRows);
  await openByPath('models.yaml'); await ready('Model Filter'); await p.check('input[name=type][value=text]'); await p.click('th[data-col=speed]');
  await p.click('#menu-btn'); await p.click('#menu [data-act=clear]');
  const s3 = await st(); assert.strictEqual(s3.type, 'all'); assert.strictEqual(s3.sort, null); assert.strictEqual(await p.locator('#facets label.sel').count(), 0);
  assert(await rows() > 500); await p.reload(); await ready('Model Filter'); assert.strictEqual((await st()).type, 'all');
  await openByPath('examples/books.yaml'); await ready('Book Finder (example data)'); assert.strictEqual(await rows(), booksRows, 'books state untouched by clear'); step('Clear filters resets current config only (and persists)');
  // localStorage unavailable -> in-memory fallback (survives config switches, not reloads)
  const c2 = await b.newContext(); await c2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); });
  const q = await c2.newPage(); q.on('pageerror', e => errs.push(e.message)); await q.goto(S.base + 'index.html?config=models.yaml');
  await q.waitForFunction(() => window.MF_APP && MF_APP.ready); assert.strictEqual(await q.evaluate(() => MF_STORE.persistent), false);
  await q.check('input[name=type][value=tts]'); const nT = await q.locator('#table tbody tr').count();
  await q.evaluate(() => MF_BOOT.loadPath('examples/books.yaml')); await q.waitForFunction(() => MF_APP && MF_APP.spec.title.startsWith('Book'));
  await q.evaluate(() => MF_BOOT.loadPath('models.yaml')); await q.waitForFunction(() => MF_APP && MF_APP.spec.title === 'Model Filter');
  assert.strictEqual(await q.evaluate(() => MF_APP.getState().type), 'tts'); assert.strictEqual(await q.locator('#table tbody tr').count(), nT); await c2.close();
  step('no localStorage -> in-memory fallback keeps state across switches');
  assert.deepStrictEqual(errs, []); step('no page errors');
  ok.forEach(s => console.log('PASS', s)); console.log(`${ok.length} passed`); await b.close(); S.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
