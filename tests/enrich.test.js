// node tests/enrich.test.js — anecdotal job tags + estimated parameter flag (fixture + real catalog invariants)
const path = require('path'); const assert = require('assert');
require(path.join(__dirname, '../data/catalog.js')); require(path.join(__dirname, '../js/dims.js')); require(path.join(__dirname, '../js/engine.js'));
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('PASS', n); } catch (e) { fail++; console.log('FAIL', n, '\n   ', e.message); } };
const base = { maker: 'x', weights: 'Open', license: 'MIT', types: ['text'], languages: null, inputMods: ['text'], comments: '', sources: [] };
const fx = { meta: {}, models: [
  { ...base, id: 'A', name: 'A', jobs: ['coding.refactor'], jobsAnecdotalOnly: [], jobsAnecdotal: {}, params: 7 },
  { ...base, id: 'B', name: 'B', jobs: ['coding.refactor'], jobsAnecdotalOnly: ['coding.refactor'], jobsAnecdotal: { 'coding.refactor': [{ source: 'GitHub', url: 'https://github.com/x/y/issues/1', quote: 'B worked great for refactoring' }] }, params: 8 },
  { ...base, id: 'C', name: 'C', jobs: ['chat.assistant'], jobsAnecdotalOnly: [], jobsAnecdotal: {}, weights: 'Closed', license: 'Proprietary', params: 200, paramsEstimated: true, prov: { params: 'example estimate source' } },
] };
const E = MF_ENGINE.createLocalEngine(fx);
t('anecdotal tag counts as tagged and is flagged in counts', () => {
  const r = E.query({ type: 'text', dims: { jobs: { levels: [{ checked: ['coding'] }] } } });
  assert.deepStrictEqual(r.rows.map(m => m.id).sort(), ['A', 'B']);
  const o = r.groups.find(g => g.id === 'jobs:0').options.find(o => o.key === 'coding');
  assert.strictEqual(o.count, 2); assert.strictEqual(o.anecdotal, 1);
});
t('row matching only via anecdotal tag gets record asterisk flag', () => {
  const r = E.query({ type: 'text', dims: { jobs: { levels: [{ checked: ['coding'] }, { checked: ['coding.refactor'] }] } } });
  assert(r.rowFlags.B && r.rowFlags.B.anecdotal); assert(!r.rowFlags.A);
  assert.deepStrictEqual(E.query({ type: 'text', dims: {} }).rowFlags, {}, 'no flags without a job filter');
});
t('estimated params flag formats as ~NB (est.) and filters numerically', () => {
  assert.strictEqual(MF_DIMS.fmtParams(fx.models[2]), '~200B (est.)');
  assert.strictEqual(MF_DIMS.fmtParams(fx.models[0]), '7');
  const r = E.query({ type: 'text', dims: { params: { levels: [{ checked: ['80~inf'] }] } } });
  assert.deepStrictEqual(r.rows.map(m => m.id), ['C']);
});
const M = CATALOG.models;
t('catalog: estimated params only on closed models and always with provenance', () => {
  M.filter(m => m.paramsEstimated).forEach(m => { assert.strictEqual(m.weights, 'Closed'); assert(m.prov && m.prov.params); });
});
t('catalog: anecdotal evidence has URLs + quotes; anecdotal-only tags are in jobs', () => {
  M.forEach(m => {
    Object.values(m.jobsAnecdotal || {}).flat().forEach(e => { assert(/^https:\/\//.test(e.url)); assert(e.quote.length > 10); });
    (m.jobsAnecdotalOnly || []).forEach(j => assert(m.jobs.includes(j) && m.jobsAnecdotal[j]));
  });
});
t('catalog: aptitude scores never derived from community evidence', () => {
  M.forEach(m => Object.entries(m.prov || {}).filter(([f]) => f.startsWith('apt') || f === 'intelligence')
    .forEach(([f, s]) => assert(!/github|reddit|x\.com|community|anecdot/i.test(s), `${m.id} ${f}: ${s}`)));
});
t('catalog: every non-null core field has provenance', () => {
  const F = ['priceIn', 'priceOut', 'context', 'maxOut', 'params', 'speed', 'latency', 'aaIndex', 'tools', 'json', 'reasoning', 'license', 'priceAudioMin', 'priceChars'];
  M.forEach(m => F.forEach(f => { if (m[f] !== null && m[f] !== undefined) assert(m.prov && m.prov[f], `${m.id}.${f} missing prov`); }));
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
