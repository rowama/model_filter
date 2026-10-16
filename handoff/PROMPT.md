# Prompt: recreate the Model Filter web app

You are an AI coding agent. Your job is to rebuild, from scratch, a static web app called Model Filter (GitHub repository rowama/model_filter). It lets the user, Rob, filter a catalog of roughly 700 AI models (LLMs, small models, embeddings, vision, image generation, speech) by many dimensions and pick models for a use case. The full functional and technical detail lives in SPEC.md in this same folder; the history of every question and decision that shaped the app lives in DECISIONS.md in this same folder. Read both before writing anything. Where this prompt and SPEC.md disagree, SPEC.md wins, because it was written from the actual repository.

## 1. Goals

- A personal, static, serverless faceted filter for AI models. It opens from a single HTML file with no server and also works when served over plain http.
- Faceted refinement made entirely of checkboxes: options within a facet level are OR'd, facets are AND'd together, and checking an option reveals a finer refinement level whose deepest checked level governs.
- Honest data: one static snapshot, gathered once. Missing values are shown as "unrated" and are never fabricated; unrated models are always kept and sort last.
- Complete decoupling of the generic front end from the data and from the description of the data: one YAML config file describes the dataset, facets, type selector, table, popups and timings. A second, made-up example dataset (books) proves the front end is generic.
- The data source is behind a query interface so a database backend can replace the in-browser scan later without UI changes.

## 2. Architecture and file layout

Build these pieces (names match the original repository):

- index.html at the root: the page shell. It loads the stylesheet, the vendored YAML parser and the app scripts, and names the default config (models.yaml) in a meta tag called mf-default-config.
- css/style.css: all styling, including the row highlight, the All/Any frame, the hamburger menu and the error and warning bars.
- js/vendor/js-yaml.min.js: js-yaml version 4.3.2, vendored (MIT licence), never loaded from a CDN.
- js/schema.js: the config schema (the single source of truth). docs/config.schema.json is a JSON Schema draft-07 export of it, produced by scripts/export_schema.js, and a test checks the two match.
- js/runtime.js: parses the YAML, validates it against the schema plus semantic checks, reports path-qualified errors, loads the dataset (JSON or CSV) and any taxonomy files, compiles a spec, and implements the template language used by labels and popups.
- js/engine.js: generic query engine. One query call takes the current selections (type, per-facet levels of checked keys with an All/Any mode per level, and sort) and returns the rows, total, the option groups with counts, the columns and the normalized selections. The first implementation brute-force scans records in memory; a future database backend implements the same request and response shape (made asynchronous and awaited).
- js/hoverpop.js: the shared hover-popover mechanics used by both the facet popups and the row popup (dwell, intent triangle, lock, grace, Escape, viewport clamping, listener cleanup through an abort controller).
- js/app.js: the generic UI (filter panel, facet popups, results table, row popup, saved state).
- js/boot.js: decides where the config comes from (embedded, query parameter, meta default, or the file:// loader) and owns the hamburger menu.
- models.yaml: the real config for the AI model catalog. data/catalog.json: the catalog (an object with a meta block and a models array). data/catalog.js is still written by the build but no longer loaded.
- examples/books.yaml, examples/books.csv (30 fictional books clearly marked as example data) and examples/genres.yaml (a taxonomy file loaded by path).
- docs/CONFIG.md: the human config reference; docs/config.schema.json: the exported schema.
- scripts/build_data.py (rebuilds the catalog from the raw folder), scripts/enrich.py (enrichment pass), scripts/check_links.py (verifies candidate provider URLs), scripts/fetch_github_community.py (community evidence search), scripts/build_single.py (single-file build), scripts/export_schema.js.
- raw/: cached source downloads. The raw/community/github folder must be gitignored (see the push-protection incident in DECISIONS.md).
- dist/model-filter.html: the single-file build.
- tests/: node tests and Playwright browser tests (section 10).

No dataset-specific names may appear anywhere in js/; a test enforces this.

## 3. Data pipeline (done once; the result is a static snapshot)

Follow SPEC.md section "Data pipeline" exactly. In summary:

- Gather the list once (snapshot dated 2026-10-14): the top 50 Hugging Face models by downloads for each of the pipeline tags text-generation, feature-extraction plus sentence-similarity (embeddings), image-text-to-text (vision), text-to-image, automatic-speech-recognition and text-to-speech; every OpenRouter model (aliases whose id starts with a tilde and ends in latest are skipped; free and batch variants merge into their base model); plus closed frontier models added by hand (for example OpenAI embedding, speech and image models).
- Details from Hugging Face model metadata and config files (licence, languages, parameter count from safetensors, creation date, context from max position embeddings, embedding dimension from hidden size). From the OpenRouter per-model endpoint lists: per-provider input and output price quotes, max output and capabilities.
- Benchmarks: LMArena (text, webdev, vision, text-to-image; published 2026-10-07), SWE-bench Verified, Aider polyglot, LiveCodeBench, the archived Open LLM Leaderboard, and in the enrichment pass Artificial Analysis (parsed from the public leaderboard page; no API key), MTEB, the Open ASR leaderboard and TTS Arena V2. Names are matched heuristically after normalization.
- Enrichment (2026-10-15): provenance for every non-null field, speed, latency, the AA index, vendor pricing pages, chat-template capability hints, parameter counts (exact or parsed from open-weight names; closed-model estimates only when credible, and none were found), curated community evidence, the Available from facet, and verified Find it here links.
- Link checking: candidate URLs are built only from real ids in the data, every candidate is fetched and must return HTTP 200 (OpenRouter additionally needs a model-specific page title), and only passing links reach the catalog. URL patterns that answer 200 for made-up ids are dropped as unverifiable.

## 4. UI behaviour

- Two panels: the filter panel on the left, the results table on the right, a header with the hamburger menu, the title, the snapshot line and the results count.
- Filter panel: an exclusive Model type radio group at the top (All types by default, then Text generation, Embeddings, Vision, Text-to-image, Speech-to-text, Text-to-speech). Below it, one entry per visible facet, shown by name only. Hovering a facet name opens its popup, which holds the checkbox levels with live counts. Checked items appear in the panel under their facet name when the popup closes; hovering a checked item reopens the popup at full depth.
- Every option label stands alone and includes the facet name, for example "Context window: 100k–500k tokens (23)". Every facet has an unrated option at level 1. Unchecked zero-count options are hidden; checked ones stay visible so they can be unchecked.
- Hover popups (facet and row) share one module: about 300 ms dwell before switching target, a safe intent triangle toward the popup, locked while the cursor is inside, about 200 ms grace on leaving, Escape closes, always kept inside the viewport.
- Results table: Model, Maker, one column per visible numeric facet, and Comments. Click headers to sort, click again to toggle direction; unrated sorts last both ways. Header alignment matches its cells. Hovering a row opens the row popup (row highlighted in grey with a bold name) with a collapsible "Find it here (N)" link list first, then categorical properties, anecdotal evidence and collapsible provenance.

## 5. Filter semantics

Implement exactly the rules in SPEC.md: OR within a level, AND across facets, the next level is generated from the union of the checked parents, only the deepest checked level governs, a child stays checked while any parent covering it remains checked, unchecked siblings regenerate, numeric children come from quantile splits rounded to nice numbers with a minimum of 6 models, multi-valued categorical siblings get an All/Any frame defaulting to All, and selections in facets hidden by the type are preserved and restored. Counts for an option reflect all other facets' current selections and the option's ancestor levels.

## 6. YAML config contract

Implement every key documented in SPEC.md (and docs/CONFIG.md in the original repo): version, title, dataset (path, format json or csv, id, records, meta, CSV delimiter, list delimiter and field typing), header meta template, counts, labels, types, popups, taxonomies, facets (numeric, categorical, boolean, with ranges, split rules, range labels, trees by inline list, reference, file path or generation, value labels, boolean labels, anecdotal handling, column options), table (columns, default sort, unrated last) and row popup sections (links, fields, evidence, map, text). The template mini-language with filters must match. Errors are path-qualified and shown in a red box; a facet field that no record has gives a yellow warning; a record without the id field is fatal.

## 7. Menu

A hamburger button at the top left with: Load YAML (file picker, folder picker, drag and drop, plus File System Access buttons in Chrome), Open by path (http only, updates the config query parameter), Reload current, Load default (embedded, single-file build only), Recent (up to 5), and Clear filters. A failed load shows errors and keeps the running config. The menu is keyboard accessible and closes on Escape or an outside click.

## 8. Persistence

Save the type, checked options at every level, All/Any modes, hidden-by-type selections and sort on every change, in localStorage, keyed by the config title plus the dataset path (with an in-memory fallback). Restore on every load of that config. Drop stale selections safely and show a small non-blocking note with the count. Clear filters resets only the current config.

## 9. Single-file dist build

The user once got a blank page by opening index.html from inside a zip. The fix is scripts/build_single.py, which inlines the stylesheet, all scripts, the YAML parser, the config and every file it references into dist/model-filter.html, so it works from file:// with no sibling files. It accepts an optional config path and output path.

## 10. Tests to write

Node: engine logic (OR, AND, counts, governing level, union children, retention on uncheck, All/Any, type hide and restore, zero-count hiding, sorting, the minimum-6 rule, unrated counting, Find it here links, Available from), enrichment (anecdotal handling, estimated params, provenance, no community evidence feeding scores), config (schema export match, valid and invalid configs with precise errors, CSV parsing, books behaviour, templates, the genericity guard). Playwright browser tests served over a local http server: facet popups, popover intent and timings, row highlight and Find it here, the books example and the file:// loader and dist file, header alignment, the menu, and persistence.

## 11. Acceptance criteria

- dist/model-filter.html opens from file:// alone and shows 703 models from the 2026-10-14 snapshot.
- models.yaml and books.yaml both load and validate; js/ contains no dataset-specific names.
- All filter semantics, counts, popups, menu and persistence behave as SPEC.md describes, and every test listed above passes.
- No fabricated values, prices, parameter estimates or links; unrated stays unrated.
- No secrets or third-party tokens are committed.

## 12. Working style with the user

Rob wants to be told plainly what is wrong with an idea and to be guided step by step. Ask one question per response and take one step at a time. Propose concrete options (for example an ontology or taxonomy) for him to approve, flag trade-offs honestly, and defer subjective UX questions to alpha testing when he says so. Never invent facts; say when data is missing. Do not push to GitHub yourself: Rob pushes from his own Windows clone.
