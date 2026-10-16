// node tests/engine.test.js  — exercises the query() interface only.
const path = require('path'); const assert = require('assert');
require(path.join(__dirname, '../data/catalog.js')); require(path.join(__dirname, '../js/dims.js')); require(path.join(__dirname, '../js/engine.js'));
const E = MF_ENGINE.createLocalEngine(CATALOG); const { rparse } = MF_ENGINE;
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); } };
const q = s => E.query(s);
const sel = (type, dims, sort) => ({ type, dims, sort });
const L = (...levels) => ({ levels: levels.map(l => Array.isArray(l) ? { checked: l, mode: 'all' } : l) });
const grp = (r, id) => r.groups.find(g => g.id === id);
const val = (m, d) => E.value(m, d);

t('OR within a level (numeric)', () => {
  const a = q(sel('text', { context: L(['0~100000']) })).rows.length, b = q(sel('text', { context: L(['1000000~inf']) })).rows.length;
  const ab = q(sel('text', { context: L(['0~100000', '1000000~inf']) })).rows.length;
  assert.strictEqual(ab, a + b); assert(a > 0 && b > 0);
});
t('AND across dimensions', () => {
  const r = q(sel('text', { weights: L(['Open']), context: L(['100000~500000']) }));
  assert(r.rows.length > 0);
  r.rows.forEach(m => { assert.strictEqual(m.weights, 'Open'); const v = val(m, 'context'); assert(v >= 1e5 && v < 5e5); });
  const all = q(sel('text', {})).rows.filter(m => m.weights === 'Open' && m.context >= 1e5 && m.context < 5e5);
  assert.strictEqual(r.rows.length, all.length);
});
t('Counts reflect other selections', () => {
  const r = q(sel('text', { weights: L(['Open']) }));
  const o = grp(r, 'context:0').options.find(o => o.key === '100000~500000');
  assert.strictEqual(o.count, q(sel('text', { weights: L(['Open']), context: L(['100000~500000']) })).rows.length);
});
t('Governing level = deepest checked level', () => {
  const r1 = q(sel('text', { context: L(['100000~500000']) }));
  const kids = grp(r1, 'context:1').options; assert(kids.length >= 2 && kids.length <= 4, 'child count ' + kids.length);
  const k = kids[0].key; const [a, b] = rparse(k);
  const r2 = q(sel('text', { context: L(['100000~500000'], [k]) }));
  assert(r2.rows.length < r1.rows.length); r2.rows.forEach(m => assert(m.context >= a && m.context < b));
  assert.strictEqual(r2.rows.length, kids[0].count);
});
t('Union child generation: one combined child level, respects gaps', () => {
  const r = q(sel('text', { context: L(['0~100000', '1000000~inf']) }));
  assert.strictEqual(r.groups.filter(g => g.dim === 'context').length, 2);
  const kids = grp(r, 'context:1').options;
  const tot = kids.reduce((s, o) => s + o.count, 0); assert.strictEqual(tot, r.rows.length, 'children partition parent union');
  const rk = q(sel('text', { context: L(['0~100000', '1000000~inf'], kids.map(o => o.key)) }));
  rk.rows.forEach(m => assert(!(m.context >= 1e5 && m.context < 1e6), 'gap model leaked'));
});
t('Categorical union child level', () => {
  const r = q(sel('all', { jobs: L(['coding', 'writing']) }));
  const keys = grp(r, 'jobs:1').options.map(o => o.key);
  assert(keys.includes('coding.refactor') && keys.includes('writing.creative'));
  assert.strictEqual(r.groups.filter(g => g.dim === 'jobs').length, 2);
});
t('Uncheck retention (categorical)', () => {
  let s = q(sel('all', { jobs: L(['coding', 'writing'], ['coding.create']) })).selections;
  s.dims.jobs.levels[0].checked = ['coding'];
  let r = q(s); assert.deepStrictEqual(r.selections.dims.jobs.levels[1].checked, ['coding.create']);
  assert(!grp(r, 'jobs:1').options.some(o => o.key.startsWith('writing')), 'writing children should be gone');
  s = r.selections; s.dims.jobs.levels[0].checked = ['writing']; r = q(s);
  assert(!(r.selections.dims.jobs.levels[1] || { checked: [] }).checked.includes('coding.create'), 'child removed with exclusive parent');
});
t('Uncheck retention (numeric) + siblings regenerated', () => {
  let r = q(sel('text', { context: L(['0~100000', '1000000~inf']) }));
  const inTop = grp(r, 'context:1').options.find(o => rparse(o.key)[0] >= 1e6);
  assert(inTop, 'need a child in 1M+');
  r = q(sel('text', { context: L(['0~100000', '1000000~inf'], [inTop.key]) }));
  const s = r.selections; s.dims.context.levels[0].checked = ['1000000~inf'];
  r = q(s);
  assert(r.selections.dims.context.levels[1].checked.includes(inTop.key), 'retained');
  grp(r, 'context:1').options.forEach(o => assert(rparse(o.key)[0] >= 1e6, 'sibling outside remaining parent: ' + o.key));
  const s2 = r.selections; s2.dims.context.levels[0].checked = ['0~100000']; r = q(s2);
  assert(!(r.selections.dims.context.levels[1] || { checked: [] }).checked.includes(inTop.key), 'removed with parent');
  r.rows.forEach(m => assert(m.context < 1e5));
});
t('All/Any frame on multi-valued categorical', () => {
  const rAll = q(sel('all', { jobs: L({ checked: ['coding', 'writing'], mode: 'all' }) }));
  const g = grp(rAll, 'jobs:0'); assert(g.frame && g.frame.mode === 'all' && g.frame.keys.length === 2);
  rAll.rows.forEach(m => assert(m.jobs.some(j => j.startsWith('coding.')) && m.jobs.some(j => j.startsWith('writing.'))));
  const rAny = q(sel('all', { jobs: L({ checked: ['coding', 'writing'], mode: 'any' }) }));
  assert(rAny.rows.length > rAll.rows.length);
  const one = q(sel('all', { jobs: L(['coding']) })); assert.strictEqual(grp(one, 'jobs:0').frame, null);
  const num = q(sel('text', { context: L(['0~100000', '1000000~inf']) })); assert.strictEqual(grp(num, 'context:0').frame, null, 'numeric never framed');
});
t('Type switch hides + preserves + restores', () => {
  let r = q(sel('text', { aptCoding: L(['75~inf']) })); const n = r.rows.length;
  r = q({ ...r.selections, type: 'all' });
  assert(!r.groups.some(g => g.dim === 'aptCoding'), 'hidden in All');
  assert.deepStrictEqual(r.selections.dims.aptCoding.levels[0].checked, ['75~inf'], 'preserved');
  assert.strictEqual(r.rows.length, r.total, 'hidden selection has no effect');
  r = q({ ...r.selections, type: 'text' }); assert.strictEqual(r.rows.length, n, 'restored');
  assert(grp(r, 'aptCoding:0').options.find(o => o.key === '75~inf').checked);
});
t('All types shows only shared dims; type shows applicable', () => {
  const a = new Set(q(sel('all', {})).groups.map(g => g.dim)); assert(!a.has('context') && !a.has('embedDim') && a.has('weights'));
  const e = new Set(q(sel('embed', {})).groups.map(g => g.dim)); assert(e.has('embedDim') && !e.has('tools'));
});
t('Zero-count boxes hidden; checked zero-count stays visible', () => {
  let r = q(sel('embed', { weights: L(['Closed']) }));
  r.groups.flatMap(g => g.options).forEach(o => assert(o.count > 0 || o.checked, 'zero-count unchecked box visible: ' + o.label));
  const base = q(sel('embed', {}));
  assert(grp(base, 'license:0').options.some(o => o.key === 'Proprietary'));
  r = q(sel('embed', { weights: L(['Open']), license: L(['Proprietary']) }));
  const w = grp(r, 'weights:0').options.find(o => o.key === 'Open');
  assert(w && w.checked && w.count === 0, 'checked zero box kept');
  assert(!grp(r, 'weights:0').options.some(o => o.key === 'Closed' && o.count === 0));
});
t('Sorting asc/desc with unrated last', () => {
  for (const dir of ['asc', 'desc']) {
    const rows = q(sel('text', {}, { col: 'priceIn', dir })).rows; const v = rows.map(m => m.priceIn);
    const firstNull = v.indexOf(null); assert(firstNull > 0); assert(v.slice(firstNull).every(x => x === null));
    const nn = v.slice(0, firstNull); for (let i = 1; i < nn.length; i++) assert(dir === 'asc' ? nn[i] >= nn[i - 1] : nn[i] <= nn[i - 1]);
  }
});
t('No refinement below ~6 models', () => {
  const r = q(sel('text', { context: L(['500000~1000000']) })); // 8 models in snapshot
  const r2 = q(sel('embed', { embedDim: L(['2048~inf']) }));
  [r, r2].forEach(x => { const g = x.groups.filter(g => g.level === 1); const n = x.rows.length; if (n < 6) assert.strictEqual(g.length, 0); });
});
t('Unrated never fabricated: unrated option counts nulls', () => {
  const r = q(sel('text', {})); const o = grp(r, 'intelligence:0').options.find(o => o.key === 'unrated');
  assert.strictEqual(o.count, r.rows.filter(m => m.intelligence === null).length);
});
t('Available from: facet in All types, taxonomy + standalone labels', () => {
  const r = q(sel('all', {}));
  const g = grp(r, 'availableFrom:0'); assert(g, 'facet visible in All types');
  const labels = g.options.map(o => o.label);
  ['Available from: Direct from maker', 'Available from: Aggregators', 'Available from: Cloud platforms', 'Available from: Self-host (open weights download)'].forEach(l => assert(labels.includes(l), l));
  const r2 = q(sel('all', { availableFrom: L(['avail.agg']) }));
  const kids = grp(r2, 'availableFrom:1').options; assert(kids.some(o => o.label === 'Available from: OpenRouter'));
  r2.rows.forEach(m => assert(m.availableFrom.some(a => a.startsWith('agg:'))));
});
t('Available from: multi-valued All/Any frame + governing level-2', () => {
  const all = q(sel('all', { availableFrom: L({ checked: ['avail.direct', 'avail.cloud'], mode: 'all' }) }));
  assert(grp(all, 'availableFrom:0').frame);
  all.rows.forEach(m => assert(m.availableFrom.some(a => a.startsWith('direct:')) && m.availableFrom.some(a => a.startsWith('cloud:'))));
  const any = q(sel('all', { availableFrom: L({ checked: ['avail.direct', 'avail.cloud'], mode: 'any' }) }));
  assert(any.rows.length > all.rows.length);
  const lv2 = q(sel('all', { availableFrom: L(['avail.cloud'], ['cloud:AWS Bedrock']) }));
  assert(lv2.rows.length > 0); lv2.rows.forEach(m => assert(m.availableFrom.includes('cloud:AWS Bedrock')));
});
t('Available from: provenance recorded, Maker facet unchanged', () => {
  CATALOG.models.forEach(m => { if (m.availableFrom) assert(m.prov.availableFrom, m.id); });
  CATALOG.models.filter(m => (m.availableFrom || []).includes('self:Hugging Face (download)')).forEach(m => assert.strictEqual(m.weights, 'Open'));
  assert(grp(q(sel('all', {})), 'maker:0').options.some(o => o.label === 'Maker: openai'));
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
