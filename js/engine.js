// Data access layer. UI talks ONLY to engine.query(selections). Generic: driven by a compiled spec (js/runtime.js),
// no dataset-specific code. Swap createLocalEngine for a DB-backed implementation with the same request/response shape.
(function (root) {
  const rkey = (lo, hi) => lo + '~' + (hi === Infinity ? 'inf' : hi);
  const rparse = k => { const [a, b] = k.split('~'); return [+a, b === 'inf' ? Infinity : +b]; };
  const getPath = (o, p) => { let x = o; for (const k of String(p).split('.')) { if (x == null) return undefined; x = x[k]; } return x; };

  function createLocalEngine(spec) {
    const recs = spec.rows, DIMS = spec.facets;
    const byId = {}; DIMS.forEach(d => byId[d.id] = d);
    const V = recs.map(m => {
      const o = {};
      for (const d of DIMS) {
        if (d.kind === 'numeric') { o[d.id] = d.get(m); continue; }
        const arr = [].concat(d.get(m) ?? []);
        if (!arr.length) { o[d.id] = null; continue; }
        const s = new Set(); arr.forEach(v => { s.add(v); (d.anc[v] || []).forEach(a => s.add(a)); }); o[d.id] = s;
        if (d.strictGet) { const st = new Set(); d.strictGet(m).forEach(v => { st.add(v); (d.anc[v] || []).forEach(a => st.add(a)); }); o[d.id + '__strict'] = st; }
      }
      return o;
    });
    const idx = new Map(recs.map((m, i) => [m, i]));
    const T = spec.types, allId = T ? T.all.id : 'all';
    const appliesAll = d => !d.types || (T && T.ids.every(t => d.types.includes(t)));
    const visibleDims = type => DIMS.filter(d => type === allId ? appliesAll(d) : (!d.types || d.types.includes(type)));
    const typeVals = recs.map(m => T ? [].concat(getPath(m, T.field) ?? []) : []);
    const universe = type => recs.map((m, i) => i).filter(i => type === allId || typeVals[i].includes(type));

    function nice(d, x) {
      if (d.step) return Math.round(x / d.step) * d.step;
      if (!d.nice) return x;
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
    function numChain(d, v, levels, upto) {
      for (let k = 0; k <= upto && k < levels.length; k++) if (levels[k].checked.length && !inRanges(v, levels[k].checked)) return false;
      return true;
    }
    function normalizeDim(d, dsel, uni) {
      const prev = (dsel && dsel.levels) || [];
      const levels = []; const un = d.unrated ? ['unrated'] : [];
      let opts = d.kind === 'numeric' ? [...d.top.map(([a, b]) => rkey(a, b)), ...un] : [...d.tree.map(n => n.key), ...un];
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
    function genCat(d, parents) { const out = []; parents.forEach(p => (d.kids[p] || []).forEach(c => { if (!out.includes(c)) out.push(c); })); return out; }
    function genNumeric(d, levels, k, uni, retainedKeys) {
      const parents = levels[k].checked.filter(c => c !== 'unrated').map(rparse);
      const vals = uni.map(i => V[i][d.id]).filter(v => v !== null && numChain(d, v, levels, k)).sort((a, b) => a - b);
      if (vals.length < d.minCount) return [];
      const lo = Math.min(...parents.map(p => p[0])), hi = Math.max(...parents.map(p => p[1]));
      const retained = retainedKeys.filter(r => r !== 'unrated').map(rparse).filter(([a, b]) => parents.some(([pa, pb]) => a >= pa && b <= pb));
      const nCuts = vals.length >= 2 * d.minCount ? d.maxChildren - 1 : d.maxChildren - 2;
      const cuts = new Set();
      for (let i = 1; i <= nCuts; i++) {
        const q = nice(d, vals[Math.floor(i * vals.length / (nCuts + 1))]);
        if (q > lo && q < hi && q > vals[0] && !retained.some(([a, b]) => q > a && q < b)) cuts.add(q);
      }
      retained.forEach(([a, b]) => { if (a > lo && a < hi) cuts.add(a); if (b > lo && b < hi) cuts.add(b); });
      const bounds = [lo, ...[...cuts].sort((a, b) => a - b), hi];
      const segs = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        const [a, b] = [bounds[i], bounds[i + 1]]; const key = rkey(a, b);
        const overlapsParent = parents.some(([pa, pb]) => a < pb && b > pa);
        const n = vals.filter(v => v >= a && v < b).length;
        const isRet = retained.some(([ra, rb]) => ra === a && rb === b);
        if (overlapsParent && (n > 0 || isRet)) segs.push(key);
      }
      if (segs.length < 2 && !(segs.length === 1 && retained.length)) return [];
      return segs;
    }
    function labelFor(d, key) {
      if (key === 'unrated') return spec.optionLabel(d, spec.labels.unrated);
      if (d.kind === 'categorical') return spec.optionLabel(d, d.lab[key] || key);
      const [a, b] = rparse(key); return spec.optionLabel(d, spec.rangeText(d, a, b));
    }
    function dimPass(d, i, levels) {
      const g = levels.reduce((acc, l, k) => l.checked.length ? k : acc, -1);
      if (g < 0) return true;
      const v = V[i][d.id];
      return d.kind === 'numeric' ? numChain(d, v, levels, g) : catMatch(d, v, levels[g]);
    }
    function columnsFor(vis) {
      const out = [];
      for (const c of spec.table.columns) {
        if (c.facets) vis.filter(d => d.column !== false && (c.facets === 'all' || d.kind === 'numeric'))
          .forEach(d => out.push({ id: d.id, label: (d.column && d.column.label) || d.label, numeric: d.kind === 'numeric', align: (d.column && d.column.align) || (d.kind === 'numeric' ? 'right' : 'left'), facet: true, sortable: c.sortable !== false }));
        else out.push({ id: c.field, label: c.label, numeric: false, align: c.align || (c.format ? 'right' : 'left'), cls: c.class || '', sortable: c.sortable !== false, cfg: c });
      }
      return out;
    }
    function query(sel) {
      sel = sel || {}; const type = sel.type || allId;
      const vis = visibleDims(type), uni = universe(type);
      const norm = {}; vis.forEach(d => norm[d.id] = normalizeDim(d, (sel.dims || {})[d.id], uni));
      const pass = {}; vis.forEach(d => pass[d.id] = uni.map(i => dimPass(d, i, norm[d.id])));
      const rowsIdx = uni.filter((i, j) => vis.every(d => pass[d.id][j]));
      const groups = [];
      for (const d of vis) {
        const others = uni.map((i, j) => vis.every(o => o === d || pass[o.id][j]));
        norm[d.id].forEach((lvl, k) => {
          const options = lvl.options.map(key => {
            let count = 0, anecdotal = 0;
            uni.forEach((i, j) => {
              if (!others[j]) return;
              const v = V[i][d.id];
              if (d.kind === 'numeric') { if (numChain(d, v, norm[d.id], k - 1) && inRanges(v, [key])) count++; }
              else if (key === 'unrated' ? v === null : (v !== null && v.has(key))) {
                count++;
                if (d.strictGet && key !== 'unrated' && !V[i][d.id + '__strict'].has(key)) anecdotal++;
              }
            });
            const o = { key, label: labelFor(d, key), count, checked: lvl.checked.includes(key) };
            if (d.strictGet) o.anecdotal = anecdotal;
            return o;
          }).filter(o => o.count > 0 || o.checked); // zero-count boxes are hidden unless checked
          const framed = d.kind === 'categorical' && d.multi && lvl.checked.length >= 2;
          groups.push({ id: d.id + ':' + k, dim: d.id, level: k, multi: !!d.multi, options, frame: framed ? { mode: lvl.mode, keys: lvl.checked.slice() } : null });
        });
      }
      const rowFlags = {};
      vis.filter(d => d.strictGet).forEach(d => {
        const levels = norm[d.id]; const g = levels.reduce((acc, l, k) => l.checked.length ? k : acc, -1);
        if (g < 0) return;
        rowsIdx.forEach(i => { const st = V[i][d.id + '__strict']; const sv = st && st.size ? st : null;
          if (!catMatch(d, sv, levels[g])) (rowFlags[getPath(recs[i], spec.idField)] = rowFlags[getPath(recs[i], spec.idField)] || {}).anecdotal = true; });
      });
      let rows = rowsIdx.map(i => recs[i]);
      const s = sel.sort === undefined ? spec.table.defaultSort : sel.sort;
      if (s && s.col) {
        const dir = s.dir === 'desc' ? -1 : 1, dd = byId[s.col];
        const get = m => { const v = dd ? V[idx.get(m)][dd.id] : getPath(m, s.col); return v === undefined ? null : (v instanceof Set ? [...v].sort().join(',') : v); };
        const keyed = rows.map(m => [m, get(m)]);
        keyed.sort((x, y) => {
          const a = x[1], b = y[1];
          if (a === null && b === null) return 0;
          if (a === null) return spec.table.unratedLast ? 1 : -dir; if (b === null) return spec.table.unratedLast ? -1 : dir;
          return (typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b)) : a - b) * dir;
        });
        rows = keyed.map(x => x[0]);
      }
      const outDims = Object.assign({}, sel.dims || {});
      vis.forEach(d => outDims[d.id] = { levels: norm[d.id].map(l => ({ checked: l.checked, mode: l.mode })) });
      return { rows, rowFlags, total: uni.length, groups, columns: columnsFor(vis), selections: { type, dims: outDims, sort: s || null } };
    }
    const value = (m, dimId) => V[idx.get(m)][dimId];
    return { query, dims: DIMS, meta: spec.meta, value, spec };
  }
  root.MF_ENGINE = { createLocalEngine, rkey, rparse };
})(typeof window !== 'undefined' ? window : globalThis);
