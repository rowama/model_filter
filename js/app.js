(function () {
  const engine = MF_ENGINE.createLocalEngine(window.CATALOG);
  const dimsById = {}; engine.dims.forEach(d => dimsById[d.id] = d);
  let state = { type: 'all', dims: {}, sort: null };
  let revealOrder = []; let limit = 80; let res;
  const $ = s => document.querySelector(s);
  const m = engine.meta;
  $('#meta').textContent = `Snapshot ${m.snapshotDate} · ${m.total} models · LMArena published ${m.arenaPublishDate}`;

  // type radios
  $('#types').innerHTML = MF_DIMS.TYPES.map(t => `<label><input type="radio" name="type" value="${t.id}" ${t.id === 'all' ? 'checked' : ''}> ${t.label}</label>`).join('');
  $('#types').addEventListener('change', e => { state.type = e.target.value; update(); });

  function lvl(dim, level) {
    const d = state.dims[dim] || (state.dims[dim] = { levels: [] });
    while (d.levels.length <= level) d.levels.push({ checked: [], mode: 'all' });
    return d.levels[level];
  }
  $('#boxes').addEventListener('change', e => {
    const t = e.target, el = t.closest('[data-k]') || t.closest('.frame');
    const [dim, level] = t.dataset.g.split(':'); const L = lvl(dim, +level);
    if (t.type === 'checkbox') {
      const k = t.dataset.key;
      L.checked = t.checked ? [...L.checked, k] : L.checked.filter(x => x !== k);
      update(t.dataset.g + '|' + k);
    } else { L.mode = t.value; update(); }
  });

  function update(anchorKey) {
    const before = {};
    document.querySelectorAll('#boxes [data-k]').forEach(el => before[el.dataset.k] = el.getBoundingClientRect().top);
    res = engine.query(state); state = res.selections;
    const ids = new Set(res.groups.map(g => g.id));
    const visDims = new Set(res.groups.map(g => g.dim));
    revealOrder = revealOrder.filter(id => ids.has(id) || !visDims.has(id.split(':')[0])); // keep hidden-by-type refinements in place
    res.groups.forEach(g => { if (g.level > 0 && !revealOrder.includes(g.id)) revealOrder.push(g.id); });
    renderBoxes();
    // keep clicked box at the same screen position (never shift content above viewport), then FLIP-animate others
    const panel = $('#filters');
    if (anchorKey) {
      const a = panel.querySelector(`[data-k="${CSS.escape(anchorKey)}"]`);
      if (a && before[anchorKey] !== undefined) panel.scrollTop += a.getBoundingClientRect().top - before[anchorKey];
      if (a) { const r = a.getBoundingClientRect(), p = panel.getBoundingClientRect(); if (r.top < p.top || r.bottom > p.bottom) a.scrollIntoView({ block: 'nearest' }); }
    }
    document.querySelectorAll('#boxes [data-k]').forEach(el => {
      const b = before[el.dataset.k]; if (b === undefined) return;
      const dy = b - el.getBoundingClientRect().top; if (Math.abs(dy) < 1) return;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
    });
    renderTable();
  }

  function items() {
    const byId = {}; res.groups.forEach(g => byId[g.id] = g);
    const order = [...res.groups.filter(g => g.level === 0).map(g => g.id), ...revealOrder.filter(id => byId[id])];
    const out = [];
    order.forEach(id => {
      const g = byId[id]; let framed = false;
      g.options.forEach(o => {
        if (g.frame && o.checked) { if (!framed) { framed = true; out.push({ frame: g, opts: g.options.filter(x => x.checked) }); } return; }
        out.push({ g, o });
      });
    });
    return out;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const boxHtml = (g, o) => `<label class="box${g.level ? ' ref' : ''}" data-k="${esc(g.id + '|' + o.key)}"><input type="checkbox" data-g="${g.id}" data-key="${esc(o.key)}" ${o.checked ? 'checked' : ''}><span>${esc(o.label)}</span><span class="n">(${o.count})</span></label>`;
  function renderBoxes() {
    const its = items(); const shown = its.slice(0, limit);
    $('#boxes').innerHTML = shown.map(it => it.frame
      ? `<div class="frame" data-frame="${it.frame.id}">${it.opts.map(o => boxHtml(it.frame, o)).join('')}<div class="modes"><label><input type="radio" name="mode-${it.frame.id}" data-g="${it.frame.id}" value="all" ${it.frame.frame.mode !== 'any' ? 'checked' : ''}>All of these</label><label><input type="radio" name="mode-${it.frame.id}" data-g="${it.frame.id}" value="any" ${it.frame.frame.mode === 'any' ? 'checked' : ''}>Any of these</label></div></div>`
      : boxHtml(it.g, it.o)).join('');
    $('#sentinel').style.height = shown.length < its.length ? '40px' : '0';
  }
  new IntersectionObserver(es => { if (es[0].isIntersecting && res && limit < 5000) { limit += 60; renderBoxes(); } }, { root: $('#filters') }).observe($('#sentinel'));

  const fmtCell = (c, mo) => {
    if (c.id === 'name' || c.id === 'maker') return esc(mo[c.id] || '');
    if (c.id === 'comments') return esc(mo.comments || '');
    const v = engine.value(mo, c.id), d = dimsById[c.id];
    if (v === null) return '<span class="u">unrated</span>';
    if (d.id.startsWith('apt') || d.id === 'intelligence') return v.toFixed(1);
    if (d.id === 'release') return esc(mo.release);
    if (d.id === 'priceIn' || d.id === 'priceOut') return '$' + (+v.toPrecision(3));
    if (d.id === 'context' || d.id === 'maxOut') return d.fmt(v);
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
  $('#table tbody').addEventListener('mousemove', e => {
    const tr = e.target.closest('tr'); if (!tr) { pop.hidden = true; return; }
    const mo = res.rows[+tr.dataset.i]; const yn = v => v === null || v === undefined ? 'unrated' : v ? 'yes' : 'no';
    pop.innerHTML = [['Types', mo.types.join(', ')], ['Weights', mo.weights], ['License', mo.license || 'unrated'], ['Jobs', mo.jobs.length ? mo.jobs.map(jobLab).join('; ') : 'unrated'],
      ['Input', (mo.inputMods || []).join(', ') || 'unrated'], ['Languages', (mo.languages || []).slice(0, 25).join(', ') || 'unrated'],
      ['Tools / JSON / Reasoning', [yn(mo.tools), yn(mo.json), yn(mo.reasoning)].join(' / ')], ['Runs locally', mo.localGPU || 'unrated'],
      ['Benchmarks', Object.entries(mo.benchRaw || {}).map(([k, v]) => `${k} ${v} (p${mo.benchPct[k]})`).join(', ') || 'none'],
      ['ID', mo.orid || mo.hf || mo.id], ['Sources', mo.sources.join(', ')]].map(([k, v]) => `<div><b>${k}</b> ${esc(v)}</div>`).join('');
    pop.hidden = false;
    const x = Math.min(e.clientX + 14, innerWidth - 440), y = Math.min(e.clientY + 14, innerHeight - pop.offsetHeight - 8);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  });
  $('#table tbody').addEventListener('mouseleave', () => pop.hidden = true);
  window.MF_APP = { getState: () => state, engine };
  update();
})();
