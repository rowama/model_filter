# Model Filter (config-driven)
A generic, static filter app. One YAML file describes the dataset, facets, table and popups (see `docs/CONFIG.md`). This repo's config is `models.yaml` (AI models). `examples/books.yaml` is a tiny CSV example. Requirements are in SPEC.md.

- Single file: open `dist/model-filter.html` (models config and data embedded; works from file://).
- Served: `npx serve .`, then open `/` (default `models.yaml`) or `/?config=examples/books.yaml`.
- `index.html` from file://: choose or drop the YAML + dataset files, or the folder.
- Switch configs at runtime from the ☰ menu: Load YAML… (pick or drop files), Open by path… (http), Reload current, Recent.
- Rebuild data: `python3 scripts/build_data.py` (needs `raw/` and pyyaml). Re-verify links: `python3 scripts/check_links.py && python3 scripts/build_data.py`
- Rebuild single file: `python3 scripts/build_single.py [config.yaml] [out.html]`. Re-export the schema: `node scripts/export_schema.js`
- Node tests: `node tests/engine.test.js && node tests/enrich.test.js && node tests/config.test.js`
- Browser tests (playwright): `NODE_PATH=/path/to/node_modules node tests/{ui,popover,findit,books,align,menu}.test.js`
