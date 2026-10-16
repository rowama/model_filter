# Config reference (YAML)

The UI in `js/` is a generic engine. **Everything** about the data comes from one YAML file: where it is, how to parse it, which facets exist and how they refine, the table, the row popup, and the popup timings. No dataset-specific code lives in `js/`, and a test (`tests/config.test.js` › genericity guard) enforces that.

- Schema: [`docs/config.schema.json`](config.schema.json) (JSON Schema draft-07). It is generated from `js/schema.js` by `node scripts/export_schema.js`, and a test checks the two match.
- Examples: [`models.yaml`](../models.yaml) (the full AI-model catalog) and [`examples/books.yaml`](../examples/books.yaml) + `books.csv` + `genres.yaml` (30 fictional books loaded from CSV).

## Loading a config

| How the page is opened | Where the config comes from |
|---|---|
| `dist/model-filter.html` (single file) | The embedded default (`models.yaml` + `data/catalog.json` inlined by `scripts/build_single.py`). Works from `file://` with no sibling files. |
| Over http (`npx serve .`) with `?config=path.yaml` | Fetched relative to the page. Dataset and taxonomy paths resolve relative to the YAML. |
| Over http with no `?config` | The page's `<meta name="mf-default-config">` (`models.yaml`). |
| `index.html` from `file://` | A loader with **Choose files…** (multi-select), **Choose folder…** and **drag-and-drop** (files or folders). Browsers can't read sibling files from `file://`, so select the YAML together with its dataset and taxonomy files, or pick the folder. If you pick the YAML alone, the loader names the next file it needs. If several configs are selected, it asks which one to use. |

Build a single file for another config with `python3 scripts/build_single.py examples/books.yaml dist/books.html`.

**Errors:** YAML syntax errors (with line and column), schema violations and semantic problems are listed in a red box. Each message has a path, for example `x.yaml: facets[0].kind: must be one of numeric, categorical, boolean`, or `facets[1].colour: unknown key (allowed: …)`. A facet `field` that no record has shows a non-fatal yellow warning. A record without the `dataset.id` field is a fatal error.

## Top level

```yaml
version: 1              # required, must be 1
title: Model Filter     # page <title> and header
dataset: {...}          # required
header: {meta: "..."}   # header line template over dataset meta (+ {total})
counts: {...}
labels: {...}
types: {...}            # optional exclusive type selector
popups: {...}
taxonomies: {...}       # named reusable trees
facets: [...]           # required, in display order
table: {...}            # required
row_popup: {sections: [...]}
```

### dataset
| key | | |
|---|---|---|
| `path` | required | Relative to the YAML file. |
| `format` | required | `json` or `csv`. |
| `id` | required | Unique id field. Used for row flags. |
| `records` | json | Dotted path to the record array, e.g. `models`. Omit it if the file itself is an array. |
| `meta` | json | Dotted path to a metadata object, usable in `header.meta`. |
| `csv.delimiter` | csv | Default `,`. RFC-4180 quoting is supported. |
| `csv.list_delimiter` | csv | Default `\|`. Used for `list` fields. |
| `csv.fields` | csv | `{column: string\|number\|integer\|boolean\|list\|json}`. Empty cells become `null` (unrated). Booleans accept true/false/yes/no/1/0. |

### counts
`show` (default true). `option` is the count suffix on each checkbox, default `({count}{anecdotal_part})`. `anecdotal_part` is used only when anecdotal matches exist, default ` · {anecdotal}{marker}`. `results` is the header count, `{n} of {total} …`.

### labels
| key | default | meaning |
|---|---|---|
| `option` | `{facet}: {value}` | Standalone checkbox label |
| `unrated` | `unrated` | Text for missing values (options, cells, `yesno`) |
| `range` | `{lo}–{hi}{unit}` | Closed numeric range |
| `range_open` | `{lo}+{unit}` | Open-ended range (hi = null) |
| `path_separator` | ` › ` | Joins taxonomy path labels |

### types (exclusive radio selector)
```yaml
types:
  field: types                  # record field (scalar or list); a record appears under every type it lists
  label: Model type             # aria label
  all: {id: all, label: All types}
  options: [{id: text, label: Text generation}, ...]
```
Facets with no `types` apply to every type. Under **All**, only facets that apply to every type are shown. Selections in hidden facets are kept and restored when you switch back. Omit `types` entirely for no selector.

### popups
`facet: {dwell_ms: 300, grace_ms: 200}` and `row: {dwell_ms: 300, grace_ms: 200, highlight: true}`. These are the dwell before retargeting and the grace period on leave for the shared hover-popover mechanics. `highlight` turns on the highlighted row (`tr.hl`) while its popup is open.

### taxonomies & trees
A `tree` (on a categorical facet, or under `taxonomies:`) can be:
- an inline list of nodes: `{key, label?, children?}`. `label` defaults to the key.
- `{ref: name}`: a tree under `taxonomies:`.
- `{path: genres.yaml}`: a YAML or JSON file with a node list, relative to the config.
- `{generate: distinct}`: every value in the data, ordered by count.
- `{generate: top_n, n: 15, other_label: Other}`: the top N values, with the rest as children of an "Other" node.
- `{generate: prefix_groups, separator: ":", key_prefix: "avail.", groups: [{prefix: agg, label: Aggregators}, ...]}`: values like `agg:OpenRouter` are grouped under level-1 nodes. Empty groups are dropped.

Children become the next refinement level. Leaves have no children.

## facets
| key | applies to | meaning |
|---|---|---|
| `id` | all | Unique, `[A-Za-z_]\w*`. Also used as the table column id. |
| `label` | all | Facet name in the panel and the `{facet}` in option labels. |
| `kind` | all | `numeric` (range chain), `categorical` (taxonomy tree) or `boolean` (Yes/No). |
| `field` | all | Dotted path into the record. |
| `multi` | categorical | A list-valued field. When 2+ siblings are checked, an **All of these / Any of these** frame appears (default All). |
| `types` | all | Type ids this facet applies to. Default: all. |
| `order` | all | Sort key. Default: position in the list. |
| `unrated` | all | Offer an "unrated" option for missing values. Default true. |
| `parse` | numeric | `number` (default) or `yearmonth` (`YYYY-MM[-DD]` → fractional year). |
| `format` | numeric | Number format for range labels (below). |
| `unit` | numeric | Appended through `{unit}`. |
| `ranges` | numeric | Level-1 ranges `[[lo, hi], ...]`, half-open `[lo, hi)`. `hi: null` means open-ended. |
| `split` | numeric | Child-level rules: `method: quantile`, `nice: true` (round to 1/2/2.5/5×10ⁿ), `step` (round to a multiple, e.g. `"1/12"` for months, which overrides `nice`), `min_count: 6` (don't refine below this many matches), `max_children: 4` (with fewer than 2×min_count matches, one fewer). |
| `range_labels` | numeric | Per-facet templates: `closed`, `open`, `from_zero` (used when lo = 0). Placeholders: `{lo}`, `{hi}`, `{hi_step}` (hi − step, an inclusive end such as `2024-12`), `{unit}`. |
| `tree` | categorical | See above. |
| `value_labels` | categorical | `path` (default, `Job: Coding › Refactoring`) or `leaf` (`Available from: OpenRouter`). |
| `bool_labels` | boolean | `{yes: Yes, no: No}`. Option keys are `yes`/`no`. |
| `anecdotal` | categorical | `{exclude_field, marker: "*", row_flag_title}`. Values listed in `exclude_field` still count as tagged (they filter in), but they are also counted separately (`(12 · 3*)`). Matching rows get the marker in any column with `row_flag_marker: true`, and the `tags` filter marks those values in popups. |
| `column` | all | `false` hides the facet's table column. Otherwise `{label, align, format, display_field, estimated}`. `align` is `left`, `center` or `right`; the default is right for numeric facets. The header uses the same alignment as its cells. `display_field` shows a raw field (e.g. a date string) while sorting by the numeric value. `estimated: {flag_field, template: "~{value}B (est.)", title_field}` is used when the flag is true. The cell format defaults to `{kind: precision, digits: 4}`. |

Refinement chain (all facets): within a level, checked boxes are OR'd. Checking reveals the next level, built from the **union** of the checked parents. Only the deepest checked level governs. Facets are AND'd together. Unchecked options with zero matches are hidden, but checked ones stay visible.

### format
`{kind, digits?, prefix?, suffix?}`. The `kind` is one of:
- `plain`: `String(v)`
- `si`: `128k`, `1.05M`
- `money`: `$0.15`, `$2.50`
- `precision`: `toPrecision(digits)`, with trailing zeros dropped
- `fixed`: `toFixed(digits)`
- `yearmonth`: `2025-03`

## table
```yaml
table:
  columns:
    - {field: name, label: Model, row_flag_marker: true}   # plain field column
    - {facets: numeric}        # one column per visible numeric facet ('all' = every visible facet)
    - {field: notes, label: Notes, class: c, sortable: false, template: "{a} / {b}"}
  default_sort: {col: title, dir: asc}   # or null
  unrated_last: true                     # missing values sort last in both directions
```
Field columns take an optional `align` (`left`, `center` or `right`); the default is right when the column has a `format`, otherwise left. A header always uses its column's alignment. On right-aligned headers the sort arrow sits on the left, so the label's right edge lines up with the numbers. Click a header to sort. Click again to toggle asc/desc (▲/▼). Facet columns sort by the facet value, field columns by the raw field.

## row_popup.sections (in order)
| type | keys | renders |
|---|---|---|
| `links` | `field`, `url`/`text`/`note` (keys in each link object; defaults `url`, `label`, `note`), `title`, `collapsible`, `count_in_title`, `class`, `empty` | A list of links with `target=_blank`. The field can be a list of objects or a URL string (the hostname is shown). Only http(s) links are kept. |
| `fields` | `rows: [{label, value: template}]` or `rows: [{label, entries: {field, item, join, empty}}]` | `<b>Label</b> value` lines. `entries` iterates an object, with `{$key}`/`{$value}` and dynamic lookups such as `{benchPct.$key}`. |
| `evidence` | `field` (map tag → [{url, source, quote}]), `facet`, `title`, `link_text`, `url`, `quote`, `quote_max` | Source links with short quotes. Tag labels come from the facet. Anecdotal-only tags get the marker. |
| `map` | `field`, `title`, `collapsible` | `key: value` lines (e.g. provenance), collapsible. |
| `text` | `field`, `title`, `collapsible` | One text field. |

`collapsible: true` renders a `<details>` element. It sits inside the already-locked popup, so clicking links never retargets the row.

## Templates
`literal {path|filter:arg|filter} literal`. Output is HTML-escaped.
- `path`: a dotted field path. `a,b,c` means the first non-missing of these (coalesce).
- Filters:
  - `join:sep` (default `, `)
  - `default:text` (used when null, empty or an empty list)
  - `limit:n`
  - `yesno[:yes,no,unrated]`
  - `if:text` (outputs text when the value is truthy)
  - `fmt:kind[:digits]`
  - `tags:facetId` (maps keys to facet labels and adds the anecdotal marker)
- An unknown filter is an error.

## Minimal example (CSV)
```yaml
version: 1
title: Books
dataset: {path: books.csv, format: csv, id: id, csv: {fields: {price: number, tags: list}}}
facets:
  - {id: price, label: Price, kind: numeric, field: price, ranges: [[0, 10], [10, null]]}
  - {id: tags, label: Tag, kind: categorical, field: tags, multi: true, tree: {generate: distinct}}
table: {columns: [{field: title, label: Title}, {facets: numeric}]}
```
