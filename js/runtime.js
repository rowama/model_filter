// Generic config runtime: YAML -> validated config -> dataset load (JSON/CSV) -> compiled spec for engine + UI.
// Contains NO dataset-specific knowledge; everything comes from the YAML (see docs/CONFIG.md).
(function (root) {
  const req = typeof require === 'function' ? require : null;
  const Y = () => root.jsyaml || (req && req('./vendor/js-yaml.min.js'));
  const S = () => root.MF_SCHEMA || (req && (req('./schema.js'), root.MF_SCHEMA));

  class ConfigError extends Error { constructor(msgs) { super(msgs.join('\n')); this.messages = msgs; } }
  class MissingFile extends Error { constructor(path) { super('File not available: ' + path); this.path = path; } }

  const getPath = (o, p) => { if (!p) return o; let x = o; for (const k of String(p).split('.')) { if (x == null) return undefined; x = x[k]; } return x; };
  const isMissing = v => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'number' && Number.isNaN(v));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  class Safe { constructor(h) { this.html = h; } toString() { return this.html; } }
  const H = v => v instanceof Safe ? v.html : esc(v);

  function parseYaml(text, name = 'config') {
    try { return Y().load(text); }
    catch (e) { throw new ConfigError([`${name}: YAML parse error: ${e.reason || e.message}${e.mark ? ` (line ${e.mark.line + 1}, column ${e.mark.column + 1})` : ''}`]); }
  }

  // ---------- CSV ----------
  function parseCSV(text, opt = {}) {
    const d = opt.delimiter || ',', rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
      if (c === '"' && f === '') q = true; else if (c === d) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    const hdr = (rows.shift() || []).map(h => h.trim()); const types = opt.fields || {}, ld = opt.list_delimiter || '|';
    const conv = (v, t) => {
      if (v === '') return null;
      switch (t) {
        case 'number': case 'integer': { const n = Number(v); return Number.isNaN(n) ? null : n; }
        case 'boolean': return /^(true|yes|1|y)$/i.test(v.trim()) ? true : /^(false|no|0|n)$/i.test(v.trim()) ? false : null;
        case 'list': return v.split(ld).map(s => s.trim()).filter(Boolean);
        case 'json': return JSON.parse(v);
        default: return v;
      }
    };
    return rows.filter(r => r.some(x => x !== '')).map(r => { const o = {}; hdr.forEach((h, i) => o[h] = conv(r[i] === undefined ? '' : r[i], types[h])); return o; });
  }

  // ---------- formats ----------
  const fmtSI = v => v >= 1e6 ? +(v / 1e6).toPrecision(3) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(v);
  const fmtYM = v => { const y = Math.floor(v + 1e-9), m = Math.round((v - y) * 12) + 1; return y + '-' + String(m).padStart(2, '0'); };
  function formatter(f) {
    f = f || { kind: 'plain' }; const pre = f.prefix || '', suf = f.suffix || '';
    const core = { plain: v => String(v), si: fmtSI, money: v => '$' + (v < 1 ? +v.toPrecision(2) : +v.toFixed(2)),
      precision: v => String(+(+v).toPrecision(f.digits || 4)), fixed: v => (+v).toFixed(f.digits == null ? 1 : f.digits), yearmonth: fmtYM }[f.kind];
    return v => pre + core(v) + suf;
  }
  const parseStep = s => s == null ? null : typeof s === 'number' ? s : (m => m ? +m[1] / +m[2] : +s)(/^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/.exec(s));

  // ---------- templates: "text {a.b,c|filter:arg|filter} text" ----------
  function compileTemplate(str) {
    const parts = []; let i = 0;
    while (i < str.length) {
      const o = str.indexOf('{', i); if (o < 0) { parts.push(str.slice(i)); break; }
      let depth = 0, j = o; for (; j < str.length; j++) { if (str[j] === '{') depth++; else if (str[j] === '}' && !--depth) break; }
      if (j >= str.length) { parts.push(str.slice(i)); break; }
      parts.push(str.slice(i, o)); const [expr, ...fs] = str.slice(o + 1, j).split('|');
      parts.push({ paths: expr.split(',').map(s => s.trim()), filters: fs.map(x => { const k = x.indexOf(':'); return k < 0 ? [x.trim(), undefined] : [x.slice(0, k).trim(), x.slice(k + 1)]; }) });
      i = j + 1;
    }
    return parts;
  }
  function makeTemplater(spec) {
    const cache = {};
    const lookup = (ctx, p) => getPath(ctx, p.split('.').map((seg, i) => i && seg.startsWith('$') ? ctx[seg] : seg).join('.'));
    const F = {
      join: (v, a = ', ') => Array.isArray(v) ? (v.some(x => x instanceof Safe) ? new Safe(v.map(H).join(esc(a))) : v.join(a)) : v,
      default: (v, a = '') => isMissing(v) ? a : v,
      limit: (v, a) => Array.isArray(v) ? v.slice(0, +a) : v,
      yesno: (v, a) => { const [y, n, u] = (a || `yes,no,${spec.labels.unrated}`).split(','); return v === null || v === undefined ? u : v ? y : n; },
      if: (v, a = '') => v ? a : '',
      fmt: (v, a = 'plain') => isMissing(v) ? v : formatter({ kind: a.split(':')[0], digits: +(a.split(':')[1] || 4) })(v),
      tags: (v, a, ctx) => { const d = spec.facetById[a]; if (!d) return v;
        return [].concat(v || []).map(k => new Safe(esc(d.lab[k] || k) + (d.isAnecOnly && d.isAnecOnly(ctx, k) ? `<span class="anec">${esc(d.marker)}</span>` : ''))); },
    };
    function run(str, ctx, html = true) {
      const parts = cache[str] || (cache[str] = compileTemplate(str));
      return parts.map(p => {
        if (typeof p === 'string') return html ? esc(p) : p;
        let v; for (const path of p.paths) { v = lookup(ctx, path); if (!isMissing(v)) break; }
        for (const [f, a] of p.filters) { if (!F[f]) throw new Error(`unknown template filter "${f}" in "${str}"`); v = F[f](v, a, ctx); }
        if (v === null || v === undefined) v = '';
        if (Array.isArray(v)) v = v.map(x => x instanceof Safe ? x.html : html ? esc(x) : x).join(', ');
        return html ? H(v) : String(v instanceof Safe ? v.html : v);
      }).join('');
    }
    run.filters = Object.keys(F); return run;
  }

  // ---------- semantic checks beyond the schema ----------
  function semantic(cfg) {
    const e = [], ids = new Set(), typeIds = new Set(((cfg.types || {}).options || []).map(t => t.id));
    (cfg.facets || []).forEach((f, i) => {
      const p = `facets[${i}] (${f.id})`;
      if (ids.has(f.id)) e.push(`${p}: duplicate facet id`); ids.add(f.id);
      (f.types || []).forEach(t => { if (!typeIds.has(t)) e.push(`${p}.types: unknown type id "${t}" (declared: ${[...typeIds].join(', ') || 'none'})`); });
      if (f.kind === 'numeric' && !f.ranges) e.push(`${p}: numeric facet needs ranges`);
      if (f.kind === 'categorical' && !f.tree) e.push(`${p}: categorical facet needs tree`);
      if (f.kind !== 'numeric' && (f.ranges || f.split)) e.push(`${p}: ranges/split only apply to numeric facets`);
      if (f.tree && f.tree.ref && !(cfg.taxonomies || {})[f.tree.ref]) e.push(`${p}.tree.ref: unknown taxonomy "${f.tree.ref}"`);
      if (f.tree && f.tree.generate === 'prefix_groups' && !(f.tree.groups || []).length) e.push(`${p}.tree: prefix_groups needs groups`);
      (f.ranges || []).forEach((r, k) => { if (r[0] === null || (r[1] !== null && r[1] <= r[0])) e.push(`${p}.ranges[${k}]: need lo < hi (hi null = open)`); });
    });
    const secFacet = ((cfg.row_popup || {}).sections || []).forEach((s, i) => { if (s.facet && !ids.has(s.facet)) e.push(`row_popup.sections[${i}].facet: unknown facet "${s.facet}"`); });
    return e;
  }
  function validate(cfg) { const e = S().validate(cfg); return e.length ? e : semantic(cfg); }

  // ---------- loading ----------
  const join = (base, p) => { if (/^([a-z]+:|\/)/i.test(p)) return p; const b = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : ''; const out = [];
    (b + p).split('/').forEach(s => { if (s === '..') out.pop(); else if (s !== '.') out.push(s); }); return out.join('/'); };
  // files a config needs besides itself: [dataset path, ...taxonomy paths] (resolved relative to the config)
  function neededFiles(cfg, cfgPath) {
    const trees = [...Object.values(cfg.taxonomies || {}), ...(cfg.facets || []).map(f => f.tree)].filter(t => t && t.path);
    return [join(cfgPath, cfg.dataset.path), ...trees.map(t => join(cfgPath, t.path))];
  }
  function parseConfig(cfgText, cfgPath) {
    const cfg = typeof cfgText === 'string' ? parseYaml(cfgText, cfgPath) : cfgText;
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new ConfigError([`${cfgPath}: config must be a YAML mapping`]);
    const errs = validate(cfg); if (errs.length) throw new ConfigError(errs.map(x => `${cfgPath}: ${x}`));
    return cfg;
  }
  // synchronous load with a sync reader (node tests, embedded files)
  function loadSync(cfgText, cfgPath, readText) {
    const cfg = parseConfig(cfgText, cfgPath); const files = {};
    const trees = [...Object.values(cfg.taxonomies || {}), ...cfg.facets.map(f => f.tree)].filter(t => t && t.path);
    for (const t of trees) { const p = join(cfgPath, t.path), txt = readText(p);
      try { files[t.path] = t.path.endsWith('.json') ? JSON.parse(txt) : parseYaml(txt, t.path); } catch (e) { throw e instanceof ConfigError ? e : new ConfigError([`${t.path}: ${e.message}`]); } }
    const txt = readText(join(cfgPath, cfg.dataset.path));
    let rows, meta = {};
    if (cfg.dataset.format === 'csv') rows = parseCSV(txt, cfg.dataset.csv);
    else { let j; try { j = JSON.parse(txt); } catch (e) { throw new ConfigError([`${cfg.dataset.path}: invalid JSON (${e.message})`]); }
      rows = cfg.dataset.records ? getPath(j, cfg.dataset.records) : j; meta = cfg.dataset.meta ? getPath(j, cfg.dataset.meta) || {} : {}; }
    if (!Array.isArray(rows)) throw new ConfigError([`${cfg.dataset.path}: dataset.records "${cfg.dataset.records || ''}" is not an array of records`]);
    return compile(cfg, rows, meta, files);
  }
  // async load: readText(path) -> Promise<string>; throws MissingFile when a file can't be obtained
  async function load(cfgText, cfgPath, readText) {
    const cfg = parseConfig(cfgText, cfgPath); const got = {};
    for (const p of neededFiles(cfg, cfgPath)) got[p] = await readText(p);
    return loadSync(cfg, cfgPath, p => got[p]);
  }

  // ---------- compile config + rows into a spec ----------
  function compile(cfg, rows, meta = {}, files = {}) {
    const errs = validate(cfg); if (errs.length) throw new ConfigError(errs);
    const labels = Object.assign({ option: '{facet}: {value}', unrated: 'unrated', range: '{lo}–{hi}{unit}', range_open: '{lo}+{unit}', path_separator: ' › ' }, cfg.labels);
    const spec = { cfg, title: cfg.title, rows, meta, labels, idField: cfg.dataset.id, facetById: {} };
    const tplRun = makeTemplater(spec); spec.template = tplRun;
    // types
    if (cfg.types) {
      const all = cfg.types.all || { id: 'all', label: 'All' };
      spec.types = { field: cfg.types.field, label: cfg.types.label || 'Type', all, options: cfg.types.options, ids: cfg.types.options.map(t => t.id) };
    } else spec.types = null;
    const dataErr = [];
    rows.forEach((r, i) => { if (getPath(r, cfg.dataset.id) == null) dataErr.push(`dataset row ${i}: missing id field "${cfg.dataset.id}"`); });
    const resolveTree = (t, f) => {
      if (Array.isArray(t)) return t; if (t.ref) return resolveTree(cfg.taxonomies[t.ref], f);
      if (t.path) { if (!files[t.path]) throw new MissingFile(t.path); return files[t.path]; }
      const c = {}; rows.forEach(r => [].concat(getPath(r, f.field) ?? []).forEach(v => c[v] = (c[v] || 0) + 1));
      const byCount = (a, b) => c[b] - c[a] || String(a).localeCompare(String(b));
      if (t.generate === 'distinct') return Object.keys(c).sort(byCount).map(k => ({ key: k }));
      if (t.generate === 'top_n') {
        const ks = Object.keys(c).sort(byCount), n = t.n || 15, tree = ks.slice(0, n).map(k => ({ key: k })), rest = ks.slice(n).sort();
        if (rest.length) tree.push({ key: '__other_' + f.field, label: t.other_label || 'Other', children: rest.map(k => ({ key: k })) });
        return tree;
      }
      const sep = t.separator || ':', kp = t.key_prefix || '';
      return t.groups.map(g => ({ key: kp + g.prefix, label: g.label, children: Object.keys(c).filter(k => k.startsWith(g.prefix + sep)).sort(byCount).map(k => ({ key: k, label: k.slice(g.prefix.length + sep.length) })) }))
        .filter(n => n.children.length);
    };
    const normTree = nodes => nodes.map(n => ({ key: String(n.key), label: n.label != null ? String(n.label) : String(n.key), children: n.children ? normTree(n.children) : undefined }));
    spec.facets = cfg.facets.map((f, idx) => {
      if (!rows.some(r => getPath(r, f.field) !== undefined)) dataErr.push(`facets[${idx}] (${f.id}): field "${f.field}" not found in any dataset record`);
      const d = { id: f.id, label: f.label, field: f.field, cfg: f, order: f.order ?? idx, types: f.types || null, unrated: f.unrated !== false, multi: !!f.multi, column: f.column };
      if (f.kind === 'numeric') {
        Object.assign(d, { kind: 'numeric', top: f.ranges.map(([a, b]) => [a, b === null ? Infinity : b]), fmt: formatter(f.format), unit: f.unit || '',
          step: parseStep((f.split || {}).step), nice: (f.split || {}).nice !== false, minCount: (f.split || {}).min_count || 6, maxChildren: (f.split || {}).max_children || 4, rangeLabels: f.range_labels || {} });
        d.get = r => { let v = getPath(r, f.field); if (v === null || v === undefined || v === '') return null;
          if (f.parse === 'yearmonth') { const s = String(v); v = +s.slice(0, 4) + (s.length >= 7 ? (+s.slice(5, 7) - 1) / 12 : 0); }
          else if (typeof v !== 'number') v = Number(v);
          return Number.isNaN(v) ? null : v; };
      } else {
        d.kind = 'categorical'; d.uiKind = f.kind;
        if (f.kind === 'boolean') { const bl = Object.assign({ yes: 'Yes', no: 'No' }, f.bool_labels); d.tree = [{ key: 'yes', label: bl.yes }, { key: 'no', label: bl.no }];
          d.get = r => { const v = getPath(r, f.field); return v === null || v === undefined || v === '' ? null : (v === true || /^(true|yes|1)$/i.test(String(v)) ? 'yes' : 'no'); }; }
        else { d.tree = normTree(resolveTree(f.tree, f)); d.get = r => { const v = getPath(r, f.field); return v === null || v === undefined ? null : [].concat(v).map(String); }; }
        d.leafLabels = f.value_labels === 'leaf';
        if (f.anecdotal) { const ex = f.anecdotal.exclude_field; d.marker = f.anecdotal.marker || '*'; d.rowFlagTitle = f.anecdotal.row_flag_title || 'matches only via anecdotal values';
          d.strictGet = r => (d.get(r) || []).filter(v => !(getPath(r, ex) || []).map(String).includes(v));
          d.isAnecOnly = (r, k) => (getPath(r, ex) || []).map(String).includes(String(k)); }
        // categorical metadata: ancestors, labels, children
        d.anc = {}; d.lab = {}; d.kids = {};
        const walk = (nodes, path, labs) => nodes.forEach(n => {
          d.anc[n.key] = path; d.lab[n.key] = d.leafLabels ? n.label : [...labs, n.label].join(labels.path_separator);
          d.kids[n.key] = (n.children || []).map(c => c.key); if (n.children) walk(n.children, [...path, n.key], [...labs, n.label]);
        });
        walk(d.tree, [], []);
      }
      spec.facetById[d.id] = d; return d;
    }).sort((a, b) => a.order - b.order);
    if (spec.types && !rows.some(r => getPath(r, spec.types.field) !== undefined)) dataErr.push(`types.field "${spec.types.field}" not found in any dataset record`);
    spec.warnings = dataErr.filter(x => !x.startsWith('dataset row'));
    const fatal = dataErr.filter(x => x.startsWith('dataset row')); if (fatal.length) throw new ConfigError(fatal.slice(0, 20));
    spec.anecFacet = spec.facets.find(d => d.strictGet) || null;
    // labels
    spec.rangeText = (d, a, b) => {
      const ctx = { lo: a === -Infinity ? '' : d.fmt(a), hi: b === Infinity ? '' : d.fmt(b), hi_step: b === Infinity ? '' : d.fmt(b - (d.step || 0)), unit: d.unit };
      const t = a === 0 && d.rangeLabels.from_zero ? d.rangeLabels.from_zero : b === Infinity ? (d.rangeLabels.open || labels.range_open) : (d.rangeLabels.closed || labels.range);
      return tplRun(t, ctx, false);
    };
    spec.optionLabel = (d, valueText) => tplRun(labels.option, { facet: d.label, value: valueText }, false);
    // counts
    const counts = Object.assign({ show: true, option: '({count}{anecdotal_part})', anecdotal_part: ' · {anecdotal}{marker}', results: '{n} of {total} match' }, cfg.counts);
    spec.countText = (d, o) => counts.show ? tplRun(counts.option, { count: o.count, anecdotal_part: o.anecdotal ? tplRun(counts.anecdotal_part, { anecdotal: o.anecdotal, marker: d.marker }, false) : '' }, false) : '';
    spec.resultsText = (n, total) => tplRun(counts.results, { n, total }, false);
    spec.headerText = () => cfg.header && cfg.header.meta ? tplRun(cfg.header.meta, Object.assign({}, meta, { total: rows.length }), false) : '';
    spec.popups = { facet: Object.assign({ dwell_ms: 300, grace_ms: 200 }, (cfg.popups || {}).facet), row: Object.assign({ dwell_ms: 300, grace_ms: 200, highlight: true }, (cfg.popups || {}).row) };
    // table
    spec.table = { columns: cfg.table.columns, defaultSort: cfg.table.default_sort || null, unratedLast: cfg.table.unrated_last !== false };
    spec.colFormat = {};
    spec.formatCell = (col, row, value, flags) => {
      const d = spec.facetById[col.id];
      if (col.facet && d) {
        const c = d.column || {};
        if (value === null || value === undefined) return `<span class="u">${esc(labels.unrated)}</span>`;
        if (c.display_field) return esc(getPath(row, c.display_field) ?? '');
        const f = formatter(c.format || { kind: 'precision', digits: 4 }), txt = f(value);
        if (c.estimated && getPath(row, c.estimated.flag_field)) return `<span title="${esc(getPath(row, c.estimated.title_field || '') || 'estimate')}">${esc(tplRun(c.estimated.template, { value: txt }, false))}</span>`;
        return esc(txt);
      }
      const cc = col.cfg; let v = cc.template ? tplRun(cc.template, row) : getPath(row, cc.field);
      let h = cc.template ? v : (v === null || v === undefined ? '' : esc(cc.format && typeof v === 'number' ? formatter(cc.format)(v) : Array.isArray(v) ? v.join(', ') : v));
      if (cc.row_flag_marker && flags && flags.anecdotal && spec.anecFacet) h += `<span class="anec" title="${esc(spec.anecFacet.rowFlagTitle)}">${esc(spec.anecFacet.marker)}</span>`;
      return h;
    };
    // row popup
    spec.sections = (cfg.row_popup || {}).sections || [];
    spec.renderRowPopup = row => {return spec.sections.map(s => renderSection(spec, s, row)).join(''); };
    return spec;
  }

  function renderSection(spec, s, row) {
    const T = spec.template, cls = s.class ? ` class="${esc(s.class)}"` : '';
    const wrap = (title, body, n) => s.collapsible ? `<details${cls}><summary>${esc(title)}${s.count_in_title ? ` (${n})` : ''}</summary>${body}</details>` : (title ? `<div class="sec">${esc(title)}</div>` : '') + `<div${cls}>${body}</div>`;
    if (s.type === 'links') {
      const L = [].concat(getPath(row, s.field) || []).map(l => typeof l === 'string' ? { url: l, text: (l.match(/^https?:\/\/([^/]+)/) || [, l])[1], note: '' } :
        { url: l[s.url || 'url'], text: l[s.text || 'label'], note: l[s.note || 'note'] || '' }).filter(l => /^https?:\/\//.test(l.url || ''));
      const body = L.length ? '<ul>' + L.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.text || l.url)}</a>${l.note ? ` <span class="note">${esc(l.note)}</span>` : ''}</li>`).join('') + '</ul>'
        : `<div class="none">${esc(s.empty || 'No links')}</div>`;
      return wrap(s.title || 'Links', body, L.length);
    }
    if (s.type === 'fields') return s.rows.map(r => {
      let v;
      if (r.entries) { const o = getPath(row, r.entries.field) || {}; const parts = Object.entries(o).map(([k, val]) => T(r.entries.item, Object.assign({}, row, { $key: k, $value: val })));
        v = parts.length ? parts.join(esc(r.entries.join ?? ', ')) : esc(r.entries.empty ?? spec.labels.unrated); }
      else v = T(r.value || '', row);
      return `<div><b>${esc(r.label)}</b> ${v}</div>`;
    }).join('');
    if (s.type === 'evidence') {
      const d = spec.facetById[s.facet]; const o = getPath(row, s.field) || {};
      const items = Object.entries(o).map(([tag, es]) => `<div class="ev"><i>${esc(d ? d.lab[tag] || tag : tag)}${d && d.isAnecOnly && d.isAnecOnly(row, tag) ? esc(d.marker) : ''}</i>: ` +
        [].concat(es).map(e => `<a href="${esc(e[s.url || 'url'])}" target="_blank" rel="noopener">${esc(e[s.link_text || 'source'])}</a>` + (e[s.quote || 'quote'] ? ` “${esc(String(e[s.quote || 'quote']).slice(0, s.quote_max || 140))}”` : '')).join(' · ') + '</div>').join('');
      return items ? (s.title ? `<div class="sec">${esc(s.title)}</div>` : '') + items : '';
    }
    if (s.type === 'map') { const o = getPath(row, s.field) || {}; const ks = Object.entries(o); if (!ks.length) return '';
      return wrap(s.title || s.field, `<div class="prov">${ks.map(([k, v]) => `${esc(k)}: ${esc(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('<br>')}</div>`, ks.length); }
    if (s.type === 'text') { const v = getPath(row, s.field); return isMissing(v) ? '' : wrap(s.title || '', esc(v), 1); }
    return '';
  }

  root.MF_RUNTIME = { parseYaml, parseConfig, neededFiles, loadSync, parseCSV, validate, load, compile, join, getPath, ConfigError, MissingFile, compileTemplate, formatter, esc };
})(typeof window !== 'undefined' ? window : globalThis);
