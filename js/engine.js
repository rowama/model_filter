// Data access layer. UI talks ONLY to engine.query(selections). Swap createLocalEngine for a DB-backed
// implementation (same request/response shape, possibly async) without UI changes.
(function (root) {
  const { DIMS: _D, finishDims, ALL_TYPES } = root.MF_DIMS;
  const MIN_REFINE = 6;
  const rkey = (lo, hi) => lo + '~' + (hi === Infinity ? 'inf' : hi);
  const rparse = k => { const [a, b] = k.split('~'); return [+a, b === 'inf' ? Infinity : +b]; };

  function createLocalEngine(catalog) {
    const models = catalog.models;
    const DIMS = finishDims(models);
    const byId = {}; DIMS.forEach(d => byId[d.id] = d);
    // categorical metadata: ancestors, labels, children
    for (const d of DIMS) if (d.kind === 'categorical') {
      d.anc = {}; d.lab = {}; d.kids = {};
      const walk = (nodes, path, labs) => nodes.forEach(n => {
        d.anc[n.key] = path; d.lab[n.key] = [...labs, n.label].join(' › ');
        d.kids[n.key] = (n.children || []).map(c => c.key);
        if (n.children) walk(n.children, [...path, n.key], [...labs, n.label]);
      });
      walk(d.tree, [], []);
    }
    // precompute per-model values
    const V = models.map(m => {
      const o = {};
      for (const d of DIMS) {
        if (d.kind === 'numeric') { const v = d.get ? d.get(m) : m[d.field]; o[d.id] = (v === null || v === undefined || Number.isNaN(v)) ? null : v; }
        else {
          const raw = d.get ? d.get(m) : m[d.field];
          const arr = raw === null || raw === undefined ? [] : [].concat(raw);
          if (!arr.length) { o[d.id] = null; continue; }
          const s = new Set();
          arr.forEach(v => { s.add(v); (d.anc[v] || []).forEach(a => s.add(a)); });
          o[d.id] = s;
        }
      }
      return o;
    });

    const visibleDims = type => DIMS.filter(d => type === 'all' ? d.types.length === ALL_TYPES.length : d.types.includes(type));
    const universe = type => models.map((m, i) => i).filter(i => type === 'all' || models[i].types.includes(type));

    function nice(d, x) {
      if (d.step) return Math.round(x / d.step) * d.step;
      if (x <= 0) return 0;
      const mag = Math.pow(10, Math.floor(Math.log10(x)));
      let best = mag, be = Infinity;
      for (const c of [1, 2, 2.5, 5, 10]) { const e = Math.abs(c * mag - x); if (e < be) { be = e; best = c * mag; } }
      return +best.toPrecision(6);
    }
    const inRanges = (v, keys) => keys.some(k => k === 'unrated' ? v === null : (v !== null && (([a, b]) => v >= a && v < b)(rparse(k))));
    function catMatch(d, s, lvl) {
      const keys = lvl.checked; if (!keys.length) return true;
      const has = k => k === 'unrated' ? s === null : (s !== null && s.has(k));
      return (d.multi && keys.length >= 2 && lvl.mode !== 'any') ? keys.every(has) : keys.some(has);
    }
    function numChain(d, v, levels, upto) { // matches all checked levels 0..upto
      for (let k = 0; k <= upto && k < levels.length; k++) if (levels[k].checked.length && !inRanges(v, levels[k].checked)) return false;
      return true;
    }

    // Build the normalized level chain for one dimension.
    function normalizeDim(d, dsel, uni) {
      const prev = (dsel && dsel.levels) || [];
      const levels = [];
      let opts = d.kind === 'numeric' ? [...d.top.map(([a, b]) => rkey(a, b)), 'unrated'] : [...d.tree.map(n => n.key), 'unrated'];
      for (let k = 0; ; k++) {
        const p = prev[k] || { checked: [], mode: 'all' };
        const checked = (p.checked || []).filter(c => opts.includes(c));
        levels.push({ options: opts, checked, mode: p.mode === 'any' ? 'any' : 'all' });
        const real = checked.filter(c => c !== 'unrated');
        if (!real.length) break;
        const nextPrev = prev[k + 1] ? prev[k + 1].checked || [] : [];
        const next = d.kind === 'numeric' ? genNumeric(d, levels, k, uni, nextPrev) : genCat(d, real);
        if (!next.length) break;
        opts = next;
      }
      return levels;
    }
    function genCat(d, parents) {
      const out = [];
      d.tree && parents.forEach(p => (d.kids[p] || []).forEach(c => { if (!out.includes(c)) out.push(c); }));
      // keep taxonomy order
      return out;
    }
    function genNumeric(d, levels, k, uni, retainedKeys) {
      const parents = levels[k].checked.filter(c => c !== 'unrated').map(rparse);
      const vals = uni.map(i => V[i][d.id]).filter(v => v !== null && numChain(d, v, levels, k)).sort((a, b) => a - b);
      if (vals.length < MIN_REFINE) return [];
      const lo = Math.min(...parents.map(p => p[0])), hi = Math.max(...parents.map(p => p[1]));
      const retained = retainedKeys.filter(r => r !== 'unrated').map(rparse).filter(([a, b]) => parents.some(([pa, pb]) => a >= pa && b <= pb));
      const nCuts = vals.length >= 12 ? 3 : 2;
      const cuts = new Set();
      for (let i = 1; i <= nCuts; i++) {
        const q = nice(d, vals[Math.floor(i * vals.length / (nCuts + 1))]);
        if (q > lo && q < hi && q > vals[0] && !retained.some(([a, b]) => q > a && q < b)) cuts.add(q);
      }
      retained.forEach(([a, b]) => { if (a > lo && a < hi) cuts.add(a); if (b > lo && b < hi) cuts.add(b); });
      const bounds = [lo, ...[...cuts].sort((a, b) => a - b), hi];
      const segs = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        const [a, b] = [bounds[i], bounds[i + 1]];
        const key = rkey(a, b);
        const overlapsParent = parents.some(([pa, pb]) => a < pb && b > pa);
        const n = vals.filter(v => v >= a && v < b).length;
        const isRet = retained.some(([ra, rb]) => ra === a && rb === b);
        if (overlapsParent && (n > 0 || isRet)) segs.push(key);
      }
      if (segs.length < 2 && !(segs.length === 1 && retained.length)) return [];
      return segs;
    }

    function labelFor(d, key, level) {
      if (key === 'unrated') return `${d.label}: unrated`;
      if (d.kind === 'categorical') return `${d.label}: ${d.lab[key] || key}`;
      const [a, b] = rparse(key), f = d.fmt, u = d.unit;
      if (d.id === 'release') {
        if (a === 0) return `${d.label}: before ${f(b)}`;
        if (b === Infinity) return `${d.label}: ${f(a)} or later`;
        return `${d.label}: ${f(a)} – ${f(b - d.step)}`;
      }
      if (b === Infinity) return `${d.label}: ${f(a)}+${u}`;
      return `${d.label}: ${f(a)}–${f(b)}${u}`;
    }

    function dimPass(d, i, levels) {
      const g = levels.reduce((acc, l, k) => l.checked.length ? k : acc, -1);
      if (g < 0) return true;
      const v = V[i][d.id];
      return d.kind === 'numeric' ? numChain(d, v, levels, g) : catMatch(d, v, levels[g]);
    }

    function query(sel) {
      sel = sel || {}; const type = sel.type || 'all';
      const vis = visibleDims(type), uni = universe(type);
      const norm = {}; vis.forEach(d => norm[d.id] = normalizeDim(d, (sel.dims || {})[d.id], uni));
      // pass matrix
      const pass = {}; vis.forEach(d => pass[d.id] = uni.map(i => dimPass(d, i, norm[d.id])));
      const rowsIdx = uni.filter((i, j) => vis.every(d => pass[d.id][j]));
      const groups = [];
      for (const d of vis) {
        const others = uni.map((i, j) => vis.every(o => o === d || pass[o.id][j]));
        norm[d.id].forEach((lvl, k) => {
          const options = lvl.options.map(key => {
            let count = 0;
            uni.forEach((i, j) => {
              if (!others[j]) return;
              const v = V[i][d.id];
              if (d.kind === 'numeric') { if (numChain(d, v, norm[d.id], k - 1) && inRanges(v, [key])) count++; }
              else if (key === 'unrated' ? v === null : (v !== null && v.has(key))) count++;
            });
            const checked = lvl.checked.includes(key);
            return { key, label: labelFor(d, key, k), count, checked, disabled: count === 0 && !checked };
          });
          const framed = d.kind === 'categorical' && d.multi && lvl.checked.length >= 2;
          groups.push({ id: d.id + ':' + k, dim: d.id, level: k, multi: !!d.multi, options, frame: framed ? { mode: lvl.mode, keys: lvl.checked.slice() } : null });
        });
      }
      // sorting
      let rows = rowsIdx.map(i => models[i]);
      const s = sel.sort;
      if (s && s.col) {
        const dir = s.dir === 'desc' ? -1 : 1, dd = byId[s.col];
        const get = m => dd ? V[models.indexOf(m)][dd.id] : (m[s.col] === undefined ? null : m[s.col]);
        const keyed = rows.map(m => [m, get(m)]);
        keyed.sort((x, y) => {
          const a = x[1], b = y[1];
          if (a === null && b === null) return 0; if (a === null) return 1; if (b === null) return -1;
          return (typeof a === 'string' ? a.localeCompare(b) : a - b) * dir;
        });
        rows = keyed.map(x => x[0]);
      }
      const columns = [{ id: 'name', label: 'Model' }, { id: 'maker', label: 'Maker' },
        ...vis.filter(d => d.kind === 'numeric').map(d => ({ id: d.id, label: d.col, numeric: true })), { id: 'comments', label: 'Comments' }];
      const outDims = Object.assign({}, sel.dims || {});
      vis.forEach(d => outDims[d.id] = { levels: norm[d.id].map(l => ({ checked: l.checked, mode: l.mode })) });
      return { rows, total: uni.length, groups, columns, selections: { type, dims: outDims, sort: sel.sort || null } };
    }
    const value = (m, dimId) => V[models.indexOf(m)][dimId];
    return { query, dims: DIMS, meta: catalog.meta, value };
  }
  root.MF_ENGINE = { createLocalEngine, rkey, rparse };
})(typeof window !== 'undefined' ? window : globalThis);
