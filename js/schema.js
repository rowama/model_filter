// JSON Schema (draft-07 subset) for the filter-app YAML config + a small validator with readable error paths.
// docs/config.schema.json is exported from this object by scripts/export_schema.js (a test checks they match).
(function (root) {
  const tpl = { type: 'string', description: 'Template: literal text with {field|filter:arg} placeholders (see docs/CONFIG.md#templates).' };
  const format = { description: 'Number format.', type: 'object', additionalProperties: false, required: ['kind'], properties: {
    kind: { enum: ['plain', 'si', 'money', 'precision', 'fixed', 'yearmonth'], description: 'plain=String(v); si=1.2M/128k; money=$0.15/$2.50; precision=toPrecision(digits); fixed=toFixed(digits); yearmonth=fractional year -> YYYY-MM' },
    digits: { type: 'integer', minimum: 0, maximum: 20 }, prefix: { type: 'string' }, suffix: { type: 'string' } } };
  const treeNode = { type: 'object', additionalProperties: false, required: ['key'], properties: {
    key: { type: ['string', 'number', 'boolean'] }, label: { type: 'string' }, children: { type: 'array', items: { $ref: '#/definitions/treeNode' } } } };
  const tree = { description: 'Taxonomy tree: inline node list, {ref: <taxonomies key>}, {path: file.yaml|json}, or {generate: ...}.', anyOf: [
    { type: 'array', items: { $ref: '#/definitions/treeNode' } },
    { type: 'object', additionalProperties: false, required: ['ref'], properties: { ref: { type: 'string' } } },
    { type: 'object', additionalProperties: false, required: ['path'], properties: { path: { type: 'string' } } },
    { type: 'object', additionalProperties: false, required: ['generate'], properties: {
      generate: { enum: ['top_n', 'prefix_groups', 'distinct'] }, n: { type: 'integer', minimum: 1 }, other_label: { type: 'string' },
      separator: { type: 'string' }, key_prefix: { type: 'string' },
      groups: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['prefix', 'label'], properties: { prefix: { type: 'string' }, label: { type: 'string' } } } } } }] };
  const section = { type: 'object', required: ['type'], properties: {
    type: { enum: ['links', 'fields', 'evidence', 'map', 'text'] }, title: { type: 'string' }, field: { type: 'string' }, class: { type: 'string' },
    collapsible: { type: 'boolean' }, count_in_title: { type: 'boolean' }, empty: { type: 'string' },
    url: { type: 'string' }, text: { type: 'string' }, note: { type: 'string' },
    facet: { type: 'string' }, link_text: { type: 'string' }, quote: { type: 'string' }, quote_max: { type: 'integer', minimum: 1 },
    rows: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label'], properties: {
      label: { type: 'string' }, value: tpl,
      entries: { type: 'object', additionalProperties: false, required: ['field', 'item'], properties: { field: { type: 'string' }, item: tpl, join: { type: 'string' }, empty: { type: 'string' } } } } } } },
    additionalProperties: false };
  const SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#', $id: 'https://github.com/rowama/model_filter/docs/config.schema.json',
    title: 'Filter app config', type: 'object', additionalProperties: false, required: ['version', 'title', 'dataset', 'facets', 'table'],
    definitions: { treeNode, tree, format, section },
    properties: {
      version: { const: 1 }, title: { type: 'string' },
      dataset: { type: 'object', additionalProperties: false, required: ['path', 'format', 'id'], properties: {
        path: { type: 'string', description: 'Relative to the YAML file.' }, format: { enum: ['json', 'csv'] }, id: { type: 'string' },
        records: { type: 'string', description: 'JSON: dotted path to the record array (omit for a top-level array).' },
        meta: { type: 'string', description: 'JSON: dotted path to a metadata object, usable in header.meta.' },
        csv: { type: 'object', additionalProperties: false, properties: { delimiter: { type: 'string', minLength: 1, maxLength: 1 }, list_delimiter: { type: 'string', minLength: 1 },
          fields: { type: 'object', additionalProperties: { enum: ['string', 'number', 'integer', 'boolean', 'list', 'json'] } } } } } },
      header: { type: 'object', additionalProperties: false, properties: { meta: tpl } },
      counts: { type: 'object', additionalProperties: false, properties: { show: { type: 'boolean' }, option: tpl, anecdotal_part: tpl, results: tpl } },
      labels: { type: 'object', additionalProperties: false, properties: { option: tpl, unrated: { type: 'string' }, range: tpl, range_open: tpl, path_separator: { type: 'string' } } },
      types: { type: 'object', additionalProperties: false, required: ['field', 'options'], properties: {
        field: { type: 'string' }, label: { type: 'string' },
        all: { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: { id: { type: 'string' }, label: { type: 'string' } } },
        options: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: { id: { type: 'string' }, label: { type: 'string' } } } } } },
      popups: { type: 'object', additionalProperties: false, properties: {
        facet: { type: 'object', additionalProperties: false, properties: { dwell_ms: { type: 'integer', minimum: 0 }, grace_ms: { type: 'integer', minimum: 0 } } },
        row: { type: 'object', additionalProperties: false, properties: { dwell_ms: { type: 'integer', minimum: 0 }, grace_ms: { type: 'integer', minimum: 0 }, highlight: { type: 'boolean' } } } } },
      taxonomies: { type: 'object', additionalProperties: { $ref: '#/definitions/tree' } },
      facets: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['id', 'label', 'kind', 'field'], properties: {
        id: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' }, label: { type: 'string' }, kind: { enum: ['numeric', 'categorical', 'boolean'] },
        field: { type: 'string', description: 'Dotted path into the record.' }, multi: { type: 'boolean', description: 'Multi-valued (list) field: All/Any frame for 2+ checked siblings.' },
        types: { type: 'array', items: { type: 'string' }, description: 'Type ids this facet applies to (default: all).' },
        order: { type: 'number', description: 'Sort key for facet order (default: position in list).' },
        unrated: { type: 'boolean', description: 'Offer an "unrated" option for missing values (default true).' },
        parse: { enum: ['number', 'yearmonth'] }, format, unit: { type: 'string' },
        ranges: { type: 'array', minItems: 1, items: { type: 'array', minItems: 2, maxItems: 2, items: { type: ['number', 'null'] } }, description: 'Level-1 ranges [lo, hi); hi null = open-ended.' },
        split: { type: 'object', additionalProperties: false, properties: { method: { const: 'quantile' }, nice: { type: 'boolean' }, step: { type: ['number', 'string'], description: 'Round boundaries to multiples of step (e.g. "1/12").' }, min_count: { type: 'integer', minimum: 1 }, max_children: { type: 'integer', minimum: 2, maximum: 10 } } },
        range_labels: { type: 'object', additionalProperties: false, properties: { closed: tpl, open: tpl, from_zero: tpl } },
        tree: { $ref: '#/definitions/tree' }, value_labels: { enum: ['path', 'leaf'] },
        bool_labels: { type: 'object', additionalProperties: false, properties: { yes: { type: 'string' }, no: { type: 'string' } } },
        anecdotal: { type: 'object', additionalProperties: false, required: ['exclude_field'], properties: { exclude_field: { type: 'string', description: 'Field listing values that are ONLY anecdotal.' }, marker: { type: 'string' }, row_flag_title: { type: 'string' } } },
        column: { anyOf: [{ const: false }, { type: 'object', additionalProperties: false, properties: { label: { type: 'string' }, format, display_field: { type: 'string' },
          estimated: { type: 'object', additionalProperties: false, required: ['flag_field', 'template'], properties: { flag_field: { type: 'string' }, template: tpl, title_field: { type: 'string' } } } } }] } } } },
      table: { type: 'object', additionalProperties: false, required: ['columns'], properties: {
        columns: { type: 'array', minItems: 1, items: { anyOf: [
          { type: 'object', additionalProperties: false, required: ['field', 'label'], properties: { field: { type: 'string' }, label: { type: 'string' }, class: { type: 'string' }, sortable: { type: 'boolean' }, row_flag_marker: { type: 'boolean' }, format, template: tpl } },
          { type: 'object', additionalProperties: false, required: ['facets'], properties: { facets: { enum: ['numeric', 'all'] }, sortable: { type: 'boolean' } } }] } },
        default_sort: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['col'], properties: { col: { type: 'string' }, dir: { enum: ['asc', 'desc'] } } }] },
        unrated_last: { type: 'boolean' } } },
      row_popup: { type: 'object', additionalProperties: false, properties: { sections: { type: 'array', items: { $ref: '#/definitions/section' } } } } } };

  function typeOf(v) { return v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v; }
  function validate(data, schema = SCHEMA) {
    const errs = [];
    const resolve = s => s.$ref ? resolve(s.$ref.split('/').slice(1).reduce((o, k) => o[k], SCHEMA)) : s;
    function v(x, s, p, out) {
      s = resolve(s); const P = p || '(root)';
      if ('const' in s && JSON.stringify(x) !== JSON.stringify(s.const)) { out.push(`${P}: must be ${JSON.stringify(s.const)}`); return; }
      if (s.enum && !s.enum.includes(x)) { out.push(`${P}: must be one of ${s.enum.join(', ')} (got ${JSON.stringify(x)})`); return; }
      if (s.type) { const ts = [].concat(s.type), t = typeOf(x); if (!ts.includes(t) && !(t === 'integer' && ts.includes('number'))) { out.push(`${P}: expected ${ts.join(' or ')}, got ${t}`); return; } }
      if (s.anyOf) { let best = null; for (const sub of s.anyOf) { const o = []; v(x, sub, p, o); if (!o.length) return; if (!best || o.length < best.length) best = o; }
        out.push(...(best.length === 1 ? best : [`${P}: does not match any allowed form (${best[0]})`])); return; }
      if (typeof x === 'string') { if (s.minLength != null && x.length < s.minLength) out.push(`${P}: too short`); if (s.maxLength != null && x.length > s.maxLength) out.push(`${P}: too long`);
        if (s.pattern && !new RegExp(s.pattern).test(x)) out.push(`${P}: must match ${s.pattern}`); }
      if (typeof x === 'number') { if (s.minimum != null && x < s.minimum) out.push(`${P}: must be >= ${s.minimum}`); if (s.maximum != null && x > s.maximum) out.push(`${P}: must be <= ${s.maximum}`); }
      if (Array.isArray(x)) { if (s.minItems != null && x.length < s.minItems) out.push(`${P}: needs at least ${s.minItems} item(s)`); if (s.maxItems != null && x.length > s.maxItems) out.push(`${P}: at most ${s.maxItems} item(s)`);
        if (s.items) x.forEach((it, i) => v(it, s.items, `${p || ''}[${i}]`, out)); }
      if (typeOf(x) === 'object') {
        (s.required || []).forEach(k => { if (!(k in x)) out.push(`${p ? p + '.' : ''}${k}: required`); });
        for (const k of Object.keys(x)) {
          const q = p ? `${p}.${k}` : k;
          if (s.properties && s.properties[k]) v(x[k], s.properties[k], q, out);
          else if (s.additionalProperties === false) out.push(`${q}: unknown key${s.properties ? ` (allowed: ${Object.keys(s.properties).join(', ')})` : ''}`);
          else if (typeof s.additionalProperties === 'object') v(x[k], s.additionalProperties, q, out);
        }
      }
    }
    v(data, schema, '', errs); return errs;
  }
  root.MF_SCHEMA = { SCHEMA, validate };
})(typeof window !== 'undefined' ? window : globalThis);
