(function () {
  const engine = MF_ENGINE.createLocalEngine(window.CATALOG);
  const dimsById = {}; engine.dims.forEach(d => dimsById[d.id] = d);
  let state = { type: 'all', dims: {}, sort: null };
  let res;
  const $ = s => document.querySelector(s);
  const m = engine.meta;
  $('#meta').textContent = `Snapshot ${m.snapshotDate} (enriched ${m.enrichDate || '—'}) · ${m.total} models · LMArena published ${m.arenaPublishDate}`;

  // type radios
  $('#types').innerHTML = MF_DIMS.TYPES.map(t => `<label><input type="radio" name="type" value="${t.id}" ${t.id === 'all' ? 'checked' : ''}> ${t.label}</label>`).join('');
  $('#types').addEventListener('change', e => { state.type = e.target.value; update(); });

  function lvl(dim, level) {
    const d = state.dims[dim] || (state.dims[dim] = { levels: [] });
    while (d.levels.length <= level) d.levels.push({ checked: [], mode: 'all' });
    return d.levels[level];
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Facet panel: one entry per visible dimension (facet name, no checkbox) + its checked items under it.
  const panel = $('#facets'), fpop = $('#fpop');
  function onChange(e, fromPanel) {
    const t = e.target; if (!t.dataset.g) return;
    const [dim, level] = t.dataset.g.split(':'); const L = lvl(dim, +level);
    if (t.type === 'checkbox') { const k = t.dataset.key; L.checked = t.checked ? [...L.checked, k] : L.checked.filter(x => x !== k); }
    else L.mode = t.value;
    update({ anchorKey: t.type === 'checkbox' ? t.dataset.g + '|' + t.dataset.key : null, fromPanel });
  }
  panel.addEventListener('change', e => onChange(e, true));
  fpop.addEventListener('change', e => onChange(e, false));
  const countHtml = o => `<span class="n">(${o.count}${o.anecdotal ? ` · ${o.anecdotal}*` : ''})</span>`;
  const boxHtml = (g, o) => `<label class="box${g.level ? ' ref' : ''}" data-k="${esc(g.id + '|' + o.key)}"><input type="checkbox" data-g="${g.id}" data-key="${esc(o.key)}" ${o.checked ? 'checked' : ''}><span>${esc(o.label)}</span>${countHtml(o)}</label>`;
  const groupsOf = dim => res.groups.filter(g => g.dim === dim).sort((a, b) => a.level - b.level);
  function renderPanel() {
    const dims = []; res.groups.forEach(g => { if (g.level === 0) dims.push(g.dim); });
    panel.innerHTML = dims.map(dim => {
      const d = dimsById[dim];
      const sel = groupsOf(dim).flatMap(g => g.options.filter(o => o.checked).map(o => `<label class="box sel" data-facet="${dim}" data-k="${esc(g.id + '|' + o.key)}"><input type="checkbox" checked data-g="${g.id}" data-key="${esc(o.key)}"><span>${esc(o.label)}</span>${countHtml(o)}</label>`));
      return `<div class="facet" data-facet="${dim}"><div class="fname" data-facet="${dim}">${esc(d.label)}<span class="chev">›</span></div>${sel.join('')}</div>`;
    }).join('');
  }
  function renderFacetPop(dim, el) {
    const before = {}; el.querySelectorAll('[data-k]').forEach(x => before[x.dataset.k] = x.getBoundingClientRect().top);
    const html = groupsOf(dim).map(g => {
      let framed = false; const parts = [];
      g.options.forEach(o => {
        if (g.frame && o.checked) {
          if (!framed) { framed = true; parts.push(`<div class="frame" data-frame="${g.id}">${g.options.filter(x => x.checked).map(x => boxHtml(g, x)).join('')}<div class="modes"><label><input type="radio" name="mode-${g.id}" data-g="${g.id}" value="all" ${g.frame.mode !== 'any' ? 'checked' : ''}>All of these</label><label><input type="radio" name="mode-${g.id}" data-g="${g.id}" value="any" ${g.frame.mode === 'any' ? 'checked' : ''}>Any of these</label></div></div>`); }
          return;
        }
        parts.push(boxHtml(g, o));
      });
      return `<div class="lvl" data-level="${g.level}">${parts.join('') || '<div class="none">no matching options</div>'}</div>`;
    }).join('');
    el.innerHTML = `<div class="ftitle">${esc(dimsById[dim].label)}</div>${html}`;
    el.querySelectorAll('[data-k]').forEach(x => { // FLIP: siblings glide into the All/Any frame
      const b = before[x.dataset.k]; if (b === undefined) return; const dy = b - x.getBoundingClientRect().top;
      if (Math.abs(dy) >= 1) x.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
    });
  }
  const facetPop = MF_HOVERPOP.createHoverPopover({
    pop: fpop, container: panel, selector: '[data-facet]:not(.facet)', keyOf: el => el.dataset.facet,
    render: (dim, el) => renderFacetPop(dim, el),
    anchor: () => panel.getBoundingClientRect().right + 6,
    onClose: () => renderPanel(),
  });

  function update(opt = {}) {
    res = engine.query(state); state = res.selections;
    const openDim = facetPop.isOpen() ? facetPop.key() : null;
    if (openDim && !res.groups.some(g => g.dim === openDim)) facetPop.close();
    if (!facetPop.isOpen() || opt.fromPanel) renderPanel();  // checked items land in the panel when the popup closes
    if (facetPop.isOpen()) facetPop.refresh();
    renderTable();
  }

  const fmtCell = (c, mo) => {
    if (c.id === 'name') return esc(mo.name || '') + (res.rowFlags[mo.id] && res.rowFlags[mo.id].anecdotal ? '<span class="anec" title="matches the Job filter only via anecdotal community reports">*</span>' : '');
    if (c.id === 'maker') return esc(mo[c.id] || '');
    if (c.id === 'comments') return esc(mo.comments || '');
    const v = engine.value(mo, c.id), d = dimsById[c.id];
    if (v === null) return '<span class="u">unrated</span>';
    if (d.id.startsWith('apt') || d.id === 'intelligence') return v.toFixed(1);
    if (d.id === 'release') return esc(mo.release);
    if (d.id === 'priceIn' || d.id === 'priceOut') return '$' + (+v.toPrecision(3));
    if (d.id === 'context' || d.id === 'maxOut') return d.fmt(v);
    if (d.id === 'params' && mo.paramsEstimated) return `<span title="${esc((mo.prov || {}).params || 'estimate')}">${esc(MF_DIMS.fmtParams(mo))}</span>`;
    return esc(+(+v).toPrecision(4));
  };
  function renderTable() {
    const s = state.sort || {};
    $('#table thead').innerHTML = '<tr>' + res.columns.map(c => `<th data-col="${c.id}">${esc(c.label)}${s.col === c.id ? `<span class="arr">${s.dir === 'desc' ? '▼' : '▲'}</span>` : ''}</th>`).join('') + '</tr>';
    $('#table tbody').innerHTML = res.rows.map((mo, i) => '<tr data-i="' + i + '">' + res.columns.map(c => `<td class="${c.numeric ? 'num' : ''}${c.id === 'comments' ? ' c' : ''}">${fmtCell(c, mo)}</td>`).join('') + '</tr>').join('');
    $('#resultCount').textContent = `${res.rows.length} of ${res.total} models match`;
  }
  $('#table thead').addEventListener('click', e => {
    const th = e.target.closest('th'); if (!th) return; const col = th.dataset.col;
    state.sort = state.sort && state.sort.col === col ? { col, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' };
    update();
  });
  const pop = $('#pop');
  const jobLab = k => (dimsById.jobs.lab[k] || k);
  const showPop = (tr) => {
    const mo = res.rows[+tr.dataset.i]; const yn = v => v === null || v === undefined ? 'unrated' : v ? 'yes' : 'no';
    const anecOnly = new Set(mo.jobsAnecdotalOnly || []);
    const jobs = mo.jobs.length ? mo.jobs.map(j => esc(jobLab(j)) + (anecOnly.has(j) ? '<span class="anec">*</span>' : '')).join('; ') : 'unrated';
    const anec = Object.entries(mo.jobsAnecdotal || {}).map(([tag, es]) => `<div class="ev"><i>${esc(jobLab(tag))}${anecOnly.has(tag) ? '*' : ''}</i>: ` +
      es.map(e => `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.source)}</a> “${esc(e.quote.slice(0, 140))}”`).join(' · ') + '</div>').join('');
    const prov = Object.entries(mo.prov || {}).map(([f, s]) => `${esc(f)}: ${esc(s)}`).join('<br>');
    const rowsH = [['Types', esc(mo.types.join(', '))], ['Weights', esc(mo.weights)], ['License', esc(mo.license || 'unrated')], ['Jobs', jobs],
      ['Input', esc((mo.inputMods || []).join(', ') || 'unrated')], ['Languages', esc((mo.languages || []).slice(0, 25).join(', ') || 'unrated')],
      ['Tools / JSON / Reasoning', [yn(mo.tools), yn(mo.json), yn(mo.reasoning)].join(' / ')], ['Runs locally', esc(mo.localGPU || 'unrated')],
      ['AA index', mo.aaIndex == null ? 'unrated' : mo.aaIndex + (mo.aaIndexEstimated ? ' (AA-estimated)' : '')],
      ['Benchmarks', esc(Object.entries(mo.benchRaw || {}).map(([k, v]) => `${k} ${v} (p${mo.benchPct[k]})`).join(', ') || 'none')],
      ['ID', esc(mo.orid || mo.hf || mo.id)], ['Sources', esc(mo.sources.join(', '))]];
    const L = mo.links || [];
    const find = `<details class="find"><summary>Find it here (${L.length})</summary>` + (L.length ? `<ul>` + L.map(l =>
      `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a> <span class="kind">${esc(l.kind)}</span></li>`).join('') + `</ul>` :
      `<div class="none">No verified provider pages</div>`) + `</details>`;
    pop.innerHTML = find + rowsH.map(([k, v]) => `<div><b>${k}</b> ${v}</div>`).join('') +
      (anec ? `<div class="sec">* anecdotal community reports (not used in scores):</div>${anec}` : '') +
      (prov ? `<details><summary>Provenance</summary><div class="prov">${prov}</div></details>` : '');
    pop.hidden = false;
  };
  const rowPop = MF_HOVERPOP.createHoverPopover({ pop, container: $('#table tbody'), selector: 'tr', keyOf: el => el.dataset.i,
    render: (k) => { showPop($(`#table tbody tr[data-i="${k}"]`)); pop.dataset.row = k; },
    onOpen: (k) => hlRow(k), onClose: () => hlRow(null) });
  function hlRow(k) {
    document.querySelectorAll('#table tbody tr.hl').forEach(t => t.classList.remove('hl'));
    if (k != null) { const t = $(`#table tbody tr[data-i="${k}"]`); t && t.classList.add('hl'); }
  }
  const _renderTable = renderTable; renderTable = function () { rowPop.close(); _renderTable(); };
  window.MF_APP = { getState: () => state, engine, facetPop, rowPop };
  update();
})();
