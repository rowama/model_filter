// node tests/config.test.js — YAML config: schema validation + clear errors, schema export, generic runtime, CSV example (books)
const fs = require('fs'), path = require('path'), assert = require('assert');
const H = require('./helpers'); const R = MF_RUNTIME;
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('PASS', n); } catch (e) { fail++; console.log('FAIL', n, '\n   ', e.message); } };
const errsOf = (yamlText) => { try { R.parseConfig(yamlText, 'x.yaml'); return []; } catch (e) { return e.messages; } };
const books = () => H.loadEngine('examples/books.yaml');

t('docs/config.schema.json is the exported js/schema.js', () => {
  assert.deepStrictEqual(JSON.parse(H.read('docs/config.schema.json')), JSON.parse(JSON.stringify(MF_SCHEMA.SCHEMA)));
});
t('models.yaml and examples/books.yaml validate cleanly', () => {
  assert.deepStrictEqual(R.validate(R.parseYaml(H.read('models.yaml'))), []);
  assert.deepStrictEqual(R.validate(R.parseYaml(H.read('examples/books.yaml'))), []);
  assert.deepStrictEqual(H.loadSpec('models.yaml').warnings, []); assert.deepStrictEqual(H.loadSpec('examples/books.yaml').warnings, []);
});
t('clear validation messages (path + reason)', () => {
  const base = R.parseYaml(H.read('examples/books.yaml'));
  const bad = JSON.parse(JSON.stringify(base));
  bad.facets[0].kind = 'tree'; bad.facets[1].colour = 'red'; delete bad.table; bad.facets[2].types = ['vinyl']; bad.dataset.format = 'xml';
  const e = errsOf(bad);
  assert(e.some(m => m.includes('facets[0].kind: must be one of numeric, categorical, boolean')), e.join('\n'));
  assert(e.some(m => m.includes('facets[1].colour: unknown key')), e.join('\n'));
  assert(e.some(m => m.includes('table: required')), e.join('\n'));
  assert(e.some(m => m.includes('dataset.format: must be one of json, csv')), e.join('\n'));
  const sem = JSON.parse(JSON.stringify(base)); sem.facets[2].types = ['vinyl']; sem.facets.push({ ...sem.facets[0] });
  const e2 = errsOf(sem);
  assert(e2.some(m => /types: unknown type id "vinyl"/.test(m)) && e2.some(m => /duplicate facet id/.test(m)), e2.join('\n'));
  const y = errsOf('version: 1\ntitle: [oops\n'); assert(/YAML parse error.*line \d+/.test(y[0]), y[0]);
});
t('missing dataset field -> warning, missing id -> error', () => {
  const cfg = R.parseYaml(H.read('examples/books.yaml')); cfg.facets[1].field = 'prise';
  const files = { 'genres.yaml': R.parseYaml(H.read('examples/genres.yaml')) };
  const s = R.compile(cfg, R.parseCSV(H.read('examples/books.csv'), cfg.dataset.csv), {}, files);
  assert(s.warnings.some(w => w.includes('field "prise" not found')));
  assert.throws(() => R.compile(cfg, [{ title: 'x' }], {}, files), /missing id field "id"/);
});
t('CSV parsing: quotes, typed fields, lists, booleans, empty -> null', () => {
  const rows = R.parseCSV('id,n,l,b,s\n1,2.5,a|b,yes,"x, ""y"""\n2,,,,\n', { fields: { n: 'number', l: 'list', b: 'boolean' } });
  assert.deepStrictEqual(rows, [{ id: '1', n: 2.5, l: ['a', 'b'], b: true, s: 'x, "y"' }, { id: '2', n: null, l: null, b: null, s: null }]);
});
t('books (CSV): 30 rows, taxonomy from path, type selector from list field', () => {
  const E = books(); const r = E.query({});
  assert.strictEqual(r.rows.length, 30); assert.strictEqual(r.total, 30);
  assert.deepStrictEqual(E.spec.facetById.genre.tree.map(n => n.label), ['Fiction', 'Non-fiction']);
  const a = E.query({ type: 'audio' }); assert(a.rows.length < 30 && a.rows.every(b => b.formats.includes('audio')));
  assert(!r.groups.some(g => g.dim === 'inPrint'), 'print-only facet hidden under All');
  assert(E.query({ type: 'print' }).groups.some(g => g.dim === 'inPrint'));
});
t('books: categorical chain, numeric split, boolean, multi frame, default sort', () => {
  const E = books();
  const r = E.query({ dims: { genre: { levels: [{ checked: ['fic'] }] } } });
  assert(r.groups.find(g => g.id === 'genre:1').options.some(o => o.label === 'Genre: Fiction › Mystery'));
  assert(r.rows.every(b => b.genre.startsWith('fic.')));
  const p = E.query({ dims: { pages: { levels: [{ checked: ['250~500', '500~inf'] }] } } });
  const kids = p.groups.find(g => g.id === 'pages:1'); assert(kids && kids.options.length >= 2);
  assert.strictEqual(kids.options.reduce((s, o) => s + o.count, 0), p.rows.length);
  const ip = E.query({ type: 'print', dims: { inPrint: { levels: [{ checked: ['yes'] }] } } });
  assert(ip.rows.length && ip.rows.every(b => b.in_print === true));
  assert(E.query({ type: 'print' }).groups.find(g => g.id === 'inPrint:0').options.some(o => o.label === 'In print: Out of print'));
  const fr = E.query({ dims: { tags: { levels: [{ checked: ['debut', 'series'] }] } } }); assert(fr.groups.find(g => g.id === 'tags:0').frame);
  assert(!E.query({}).groups.find(g => g.id === 'tags:0').options.some(o => o.key === 'unrated'), 'unrated: false honoured');
  const titles = E.query({}).rows.map(b => b.title); assert.deepStrictEqual(titles, [...titles].sort((a, b) => a.localeCompare(b)));
  assert.deepStrictEqual(E.query({}).columns.map(c => c.label), ['Title', 'Author', 'Price', 'Rating', 'Pages', 'Year', 'Notes']);
});
t('books: labels from templates, year step=1, row popup sections', () => {
  const E = books(); const y = E.query({}).groups.find(g => g.id === 'year:0').options.map(o => o.label);
  assert(y.includes('Published: before 1980') && y.includes('Published: 1980–1999') && y.includes('Published: 2015 or later'), y.join());
  const b = E.spec.rows.find(x => x.url); const h = E.spec.renderRowPopup(b);
  assert(h.startsWith('<details class="find"><summary>Find it here (1)</summary>') && h.includes(`href="${b.url}"`) && h.includes('target="_blank"'));
  assert(h.includes('<b>Genre</b> ' + (b.genre.startsWith('fic') ? 'Fiction' : 'Non-fiction') + ' › '));
  assert(E.spec.headerText().startsWith('EXAMPLE DATA'));
});
t('template engine: coalesce, filters, escaping', () => {
  const s = H.loadSpec('examples/books.yaml');
  assert.strictEqual(s.template('{a,b|default:-}', { b: '<x>' }), '&lt;x&gt;');
  assert.strictEqual(s.template('{l|limit:2|join:+}', { l: [1, 2, 3] }), '1+2');
  assert.strictEqual(s.template('{v|yesno} {w|yesno:Y,N,?}', { v: false, w: null }), 'no ?');
  assert.strictEqual(s.template('{n|fmt:si}', { n: 128000 }, false), '128k');
  assert.throws(() => s.template('{x|bogus}', {}), /unknown template filter/);
});
t('genericity guard: no dataset-specific names in js/ (excl. vendor)', () => {
  const bad = /\b(jobs|priceIn|priceOut|openrouter|huggingface|availableFrom|anecdotalOnly|jobsAnecdotal|paramsEstimated|catalog|Snapshot|LMArena|release|maker|models?)\b/i;
  for (const f of fs.readdirSync(path.join(H.ROOT, 'js')).filter(f => f.endsWith('.js'))) {
    H.read('js/' + f).split('\n').forEach((l, i) => { const code = l.replace(/\/\/.*$/, ''); assert(!bad.test(code), `js/${f}:${i + 1}: ${l.trim().slice(0, 100)}`); });
  }
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
