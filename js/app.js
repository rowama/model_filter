// Generic UI: renders whatever the compiled spec (js/runtime.js) describes. No dataset-specific code.
(function (root) {
  function mount(spec) {
    const engine = MF_ENGINE.createLocalEngine(spec);
    const dimsById = spec.facetById, T = spec.types;
    let state = { type: T ? T.all.id : 'all', dims: {}, sort: spec.table.defaultSort };
    let res;
    const $ = s => document.querySelector(s);
    const esc = MF_RUNTIME.esc;
    document.title = spec.title; $('#title').textContent = spec.title;
    $('#meta').textContent = spec.headerText();
    $('#warnings').innerHTML = (spec.warnings || []).map(w => `<div>⚠ ${esc(w)}</div>`).join(''); $('#warnings').hidden = !(spec.warnings || []).length;

    // exclusive type selector
    const types = $('#types');
    if (T) {
      types.setAttribute('aria-label', T.label); types.hidden = false;
      types.innerHTML = [T.all, ...T.options].map(t => `<label><input type="radio" name="type" value="${esc(t.id)}" ${t.id === T.all.id ? 'checked' : ''}> ${esc(t.label)}</label>`).join('');
      types.onchange = e => { state.type = e.target.value; update(); };
    } else { types.hidden = true; types.innerHTML = ''; }

    function lvl(dim, level) {
      const d = state.dims[dim] || (state.dims[dim] = { levels: [] });
      while (d.levels.length <= level) d.levels.push({ checked: [], mode: 'all' });
      return d.levels[level];
    }
    // Facet panel: one entry per visible facet (name, no checkbox) + its checked items under it.
    const panel = $('#facets'), fpop = $('#fpop');
    function onChange(e, fromPanel) {
      const t = e.target; if (!t.dataset.g) return;
      const i = t.dataset.g.lastIndexOf(':'), dim = t.dataset.g.slice(0, i), level = +t.dataset.g.slice(i + 1); const L = lvl(dim, level);
      if (t.type === 'checkbox') { const k = t.dataset.key; L.checked = t.checked ? [...L.checked, k] : L.checked.filter(x => x !== k); }
      else L.mode = t.value;
      update({ fromPanel });
    }
    panel.onchange = e => onChange(e, true);
    fpop.onchange = e => onChange(e, false);
    const countHtml = (g, o) => { const t = spec.countText(dimsById[g.dim], o); return t ? `<span class="n">${esc(t)}</span>` : ''; };
    const boxHtml = (g, o) => `<label class="box${g.level ? ' ref' : ''}" data-k="${esc(g.id + '|' + o.key)}"><input type="checkbox" data-g="${esc(g.id)}" data-key="${esc(o.key)}" ${o.checked ? 'checked' : ''}><span>${esc(o.label)}</span>${countHtml(g, o)}</label>`;
    const groupsOf = dim => res.groups.filter(g => g.dim === dim).sort((a, b) => a.level - b.level);
    function renderPanel() {
      const dims = []; res.groups.forEach(g => { if (g.level === 0) dims.push(g.dim); });
      panel.innerHTML = dims.map(dim => {
        const d = dimsById[dim];
        const sel = groupsOf(dim).flatMap(g => g.options.filter(o => o.checked).map(o => `<label class="box sel" data-facet="${esc(dim)}" data-k="${esc(g.id + '|' + o.key)}"><input type="checkbox" checked data-g="${esc(g.id)}" data-key="${esc(o.key)}"><span>${esc(o.label)}</span>${countHtml(g, o)}</label>`));
        return `<div class="facet" data-facet="${esc(dim)}"><div class="fname" data-facet="${esc(dim)}">${esc(d.label)}<span class="chev">›</span></div>${sel.join('')}</div>`;
      }).join('');
    }
    function renderFacetPop(dim, el) {
      const before = {}; el.querySelectorAll('[data-k]').forEach(x => before[x.dataset.k] = x.getBoundingClientRect().top);
      const html = groupsOf(dim).map(g => {
        let framed = false; const parts = [];
        g.options.forEach(o => {
          if (g.frame && o.checked) {
            if (!framed) { framed = true; parts.push(`<div class="frame" data-frame="${esc(g.id)}">${g.options.filter(x => x.checked).map(x => boxHtml(g, x)).join('')}<div class="modes"><label><input type="radio" name="mode-${esc(g.id)}" data-g="${esc(g.id)}" value="all" ${g.frame.mode !== 'any' ? 'checked' : ''}>All of these</label><label><input type="radio" name="mode-${esc(g.id)}" data-g="${esc(g.id)}" value="any" ${g.frame.mode === 'any' ? 'checked' : ''}>Any of these</label></div></div>`); }
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
      render: (dim, el) => renderFacetPop(dim, el), anchor: () => panel.getBoundingClientRect().right + 6,
      onClose: () => renderPanel(), DWELL: spec.popups.facet.dwell_ms, GRACE: spec.popups.facet.grace_ms,
    });

    function update(opt = {}) {
      res = engine.query(state); state = res.selections;
      const openDim = facetPop.isOpen() ? facetPop.key() : null;
      if (openDim && !res.groups.some(g => g.dim === openDim)) facetPop.close();
      if (!facetPop.isOpen() || opt.fromPanel) renderPanel();  // checked items land in the panel when the popup closes
      if (facetPop.isOpen()) facetPop.refresh();
      renderTable();
    }
    const idOf = mo => MF_RUNTIME.getPath(mo, spec.idField);
    function renderTable() {
      rowPop.close();
      const s = state.sort || {};
      $('#table thead').innerHTML = '<tr>' + res.columns.map(c => { const arr = s.col === c.id ? `<span class="arr">${s.dir === 'desc' ? '▼' : '▲'}</span>` : ''; // arrow on the outer side so right-aligned text lines up with the numbers
        return `<th data-col="${esc(c.id)}" class="a-${c.align}${c.sortable ? '' : ' nosort'}">${c.align === 'right' ? arr + `<span class="lbl">${esc(c.label)}</span>` : `<span class="lbl">${esc(c.label)}</span>` + arr}</th>`; }).join('') + '</tr>';
      $('#table tbody').innerHTML = res.rows.map((mo, i) => '<tr data-i="' + i + '">' + res.columns.map(c =>
        `<td class="a-${c.align}${c.numeric ? ' num' : ''}${c.cls ? ' ' + esc(c.cls) : ''}">${spec.formatCell(c, mo, c.facet ? engine.value(mo, c.id) : null, res.rowFlags[idOf(mo)])}</td>`).join('') + '</tr>').join('');
      $('#resultCount').textContent = spec.resultsText(res.rows.length, res.total);
    }
    $('#table thead').onclick = e => {
      const th = e.target.closest('th'); if (!th) return; const col = th.dataset.col;
      const c = res.columns.find(x => x.id === col); if (!c || !c.sortable) return;
      state.sort = state.sort && state.sort.col === col ? { col, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' };
      update();
    };
    const pop = $('#pop');
    const rowPop = MF_HOVERPOP.createHoverPopover({ pop, container: $('#table tbody'), selector: 'tr', keyOf: el => el.dataset.i,
      render: (k) => { pop.innerHTML = spec.renderRowPopup(res.rows[+k]); pop.dataset.row = k; },
      onOpen: (k) => hlRow(k), onClose: () => hlRow(null), DWELL: spec.popups.row.dwell_ms, GRACE: spec.popups.row.grace_ms });
    function hlRow(k) {
      if (!spec.popups.row.highlight) return;
      document.querySelectorAll('#table tbody tr.hl').forEach(t => t.classList.remove('hl'));
      if (k != null) { const t = $(`#table tbody tr[data-i="${k}"]`); t && t.classList.add('hl'); }
    }
    $('#app').hidden = false;
    update();
    root.MF_APP = { getState: () => state, engine, spec, rows: spec.rows, facetPop, rowPop, ready: true };
    return root.MF_APP;
  }
  root.MF_UI = { mount };
})(window);
