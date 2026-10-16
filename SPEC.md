# Model Filter — Specification (v0.1 alpha)

Personal tool for Rob to filter AI/LLM/SLM models and pick models for use cases. Static single-page app with no server: open `index.html`, or run `npx serve` in this folder.

## 1. Data (one-time snapshot, 2026-10-14; the date is shown in the header)
| Source | Use | Status |
|---|---|---|
| Hugging Face API `api/models?pipeline_tag=…&sort=downloads&limit=50` | Top 50 by downloads for text-generation, feature-extraction + sentence-similarity (embeddings), image-text-to-text (vision), text-to-image, automatic-speech-recognition, text-to-speech | OK (350 unique ids) |
| HF `api/models/{id}?expand[]=safetensors,cardData,…` + `config.json` | license, languages, parameter count (safetensors total), created date, context (`max_position_embeddings`), embedding dim (`hidden_size`) | OK. Gated repos have no config, so their values are null |
| OpenRouter `api/v1/models` | ALL models (462 listed) | OK. The 19 `~…-latest` aliases are skipped because they duplicate other entries. `:free` and `:batch` variants merge into their base model as a comment and are not counted in the median |
| OpenRouter `api/v1/models/{id}/endpoints` | Per-provider input and output quotes, max output, throughput | OK. `throughput_last_30m` was null everywhere, so Speed is unrated for every model |
| platform.openai.com/docs/pricing | Prices for added closed embedding, STT, TTS and image models | OK. Other vendors' pages were not fetched, so those manual entries have unrated prices |
| LMArena (HF dataset `lmarena-ai/leaderboard-dataset`, configs text/webdev/vision/text_to_image, split `latest`, category `overall`) | Elo ratings | OK, published 2026-10-07 |
| SWE-bench `leaderboards.json` (Verified) | % resolved, max per model | OK |
| Aider polyglot leaderboard YAML | pass_rate_2 | OK. Older entries only |
| LiveCodeBench `performances_generation.json` | mean pass@1 per model | OK. Few matches, older models |
| Open LLM Leaderboard (HF `open-llm-leaderboard/contents`, archived) | IFEval, BBH, MATH Lvl5, GPQA, MUSR, MMLU-Pro (normalized) | OK. Exact HF-id matches only (25) |
| Not used: Artificial Analysis (needs an API key), MTEB (embedding quality), TTS/STT arenas | — | Gaps |

Merging: an OpenRouter model with a `hugging_face_id` that matches an HF top-50 entry becomes one record. Benchmark names are matched to the catalog by normalized names (lowercase, no punctuation or dates, common suffixes like -thinking/-high/-preview/-instruct stripped). Matching is heuristic. A variant's score can attach to its base model, and when several variants match, the max is taken.

**Rules:** missing data is `null` and shows as **unrated**. Scores are never fabricated. Unrated models are always kept.

### Pricing
- Input and output price per 1M tokens are separate dimensions.
- The filter value is the **median of all provider quotes** (no trimming).
- The Comments column lists the cheapest and most expensive provider with their prices.
- Models with no endpoint quotes fall back to the OpenRouter list price.
- HF-only models have no hosted quote, so their price is unrated.

### Aptitude and intelligence scoring
1. Each benchmark is converted to a percentile across the catalog models that have it: (below + 0.5·ties)/n·100.
2. Each aptitude is the average of its relevant percentiles (0–100):
   - Coding = SWE-bench Verified, Aider polyglot, LiveCodeBench, LMArena WebDev
   - Reasoning = GPQA, MATH L5, MMLU-Pro, BBH, MUSR
   - Writing/chat = LMArena text
   - Instruction/extraction = IFEval
   - Agentic = SWE-bench Verified
   - Vision = LMArena vision
   - Image-gen = LMArena text-to-image
3. Intelligence = mean of all text/vision benchmark percentiles the model has.

Caveat: percentiles mix populations. For example, Open LLM Leaderboard covers mostly small open models. Treat scores as a rough ranking.

### Job taxonomy (categorical, multi-valued)
- **Coding:** creating code, refactoring, reviewing, debugging, testing, web/frontend
- **Writing:** creative/fiction, roleplay, business/marketing, summarization
- **Reasoning & math:** math, logic, science/research
- **Data extraction:** structured JSON, documents/OCR, classification
- **Agents & tool use:** function calling, multi-step agentic, computer/browser use
- **Chat:** general assistant, customer support
- **Translation:** multilingual translation
- **Retrieval & search:** semantic search/RAG, reranking, clustering
- **Vision understanding:** description, charts, OCR, video
- **Image generation:** general/photoreal, editing
- **Speech:** transcription, synthesis, voice cloning

Tags are **heuristic**: regex keywords over the name, description and HF tags, plus capability flags (tools → function calling, JSON → structured, reasoning param → logic, type → retrieval/imagegen/speech, any coding benchmark → creating code). See `scripts/build_data.py` `JOBRULES`. They are evidence-based, but not verified by hand.

### Other dimensions
| Dimension | Values / derivation |
|---|---|
| Model type | text, embed, vision, t2i, stt, tts. Multi-type models appear under every type they support. From the OpenRouter input/output modalities, or the HF pipeline. Audio-input chat models count as speech-to-text |
| Weights | Open = has HF weights; Closed otherwise |
| License | HF license, grouped Permissive / Copyleft / Open-restricted / Proprietary |
| Maker | Top 15 makers, plus "Other" |
| Parameters (B) | Safetensors total, so MoE models show total params |
| Context window | OpenRouter value, or HF `max_position_embeddings`. Embedding models use `max_position_embeddings` |
| Max output | Max output tokens |
| Speed | tok/s |
| Release | Date |
| Tool calling / Structured JSON / Reasoning mode | From OpenRouter `supported_parameters` |
| Input modalities | — |
| Languages | HF card, top 12 plus "Other" |
| Runs locally | Heuristic on params: ≤14B yes; 14–40B high-end/quantized; >40B no; closed no |
| Embedding dim | Embeddings only |

## 1b. Enrichment pass (2026-10-15) — `scripts/enrich.py`
- **Provenance:** every non-null field records its source in `prov[field]`, shown under "Provenance" in the row hover. Aptitude and intelligence provenance lists the benchmarks that were used.
- **Artificial Analysis:** the public leaderboard page (`artificialanalysis.ai/leaderboards/models`) embeds its model table, which is parsed into `raw/aa/aa_models.json`. The API needs a key and was not used.
  - Fills `speed` (median output tok/s across matched AA variants), `latency` (median TTFT in seconds) and `aaIndex` (AA Intelligence Index, max over variants; AA's own estimates are flagged `aaIndexEstimated`).
  - Fills context, reasoning (only if a variant is a reasoning model) and price (only when there are no OpenRouter quotes; noted in the comments), but only where these were null.
  - AA benchmark results feed the aptitudes: GPQA, HLE, tau2, TerminalBench-Hard, IFBench, SciCode, LCR, MMMU-Pro.
- **MTEB:** HF dataset `mteb/results`, 14 common English tasks (split=test, subset=default, max score per model and task). The score is the mean over the tasks a model has; at least 10 of the 14 are required. Stored as `mteb_eng14`, which drives the Embedding score.
- **Open ASR leaderboard:** `hf-audio/open-asr-leaderboard-results/english_short_latest.csv`, average WER. Lower is better, so it is stored as −WER. Matched by model name, so repacks and quantizations of the same weights count. Drives the Transcription score.
- **TTS Arena V2:** `tts-agi-tts-arena-v2.hf.space/api/leaderboard` Elo. Explicit alias map only. Drives the Speech quality score.
- **Vendor pricing pages:** ai.google.dev (Gemini Embedding 2), elevenlabs.io/pricing/api (v3, v4 Turbo), deepgram.com/pricing (Nova-3), OpenAI (Whisper, transcribe, tts-1-hd).
  - Per-minute and per-character prices get their own dimensions: **Audio price $/min** (speech-to-text) and **Character price $/1M chars** (text-to-speech). They are never converted to $/1M tokens.
  - Models still unpriced carry a comment saying why.
- **HF chat templates:** tool calling and reasoning are set to *yes* when the tokenizer `chat_template` handles tools or thinking. These fields are never set to *no*.
- **Parameter counts:**
  - Exact from safetensors. Otherwise from the Open ASR "Size (B)" column, or parsed from the official open-weight model name (e.g. "8B").
  - Closed models get only credible published estimates, stored with `paramsEstimated=true` plus the source in `prov.params`, and shown as "~200B (est.)".
  - **No credible estimates were found for this snapshot, so none are set** (`PARAM_ESTIMATES` in `scripts/enrich.py` is empty).
- **Community evidence (anecdotal):**
  - Bounded to the top 100 text models with an OpenRouter id (sorted by intelligence; `raw/community_targets.json`).
  - **GitHub** search API (issues and discussions): one query per model, with job keywords limited to 5 boolean operators.
  - **X** search: a handful of top coding models via the `x` tool namespace, which is rate-limited.
  - **Reddit** returned HTTP 403 on every attempt, so it was not used.
  - The automated extractor (`enrich.community`) looks for a 2-sentence window that names the model, contains a job keyword (refactor, debug, code review, unit tests, tool calling, agentic) and a positive-usage phrase, appears in a first-person post, and is not a question, claim or benchmark statement. Its hits go **only** to `raw/community/candidates.json`, because manual review showed most early hits were false positives (bug reports, quotes about other models).
  - **Only manually reviewed first-person usage reports in `raw/community/curated.json` reach the catalog.** Each one keeps the URL and a verbatim quote. Snapshot: 11 tags on 5 models (Claude Opus 5.5, Kimi K3, DeepSeek V4 Flash, Grok 4.7, MiMo-V2.5-Pro).
  - Stored in `jobsAnecdotal`. `jobsAnecdotalOnly` holds tags that have no heuristic or benchmark basis.
  - Anecdotal tags **count as tagged for filtering**. They **never feed benchmark aptitude scores**: aptitudes are computed before the community pass, and a test checks this.
  - In the UI, a Job checkbox shows "(N · k*)", where k is how many of the N match only through anecdotal tags. A result row that passes the Job filter only through anecdotal tags gets an orange **\*** after its name. The hover marks anecdotal-only tags with \* and lists the source links (the popover can be hovered and clicked).
  - Credibility caveat: the keyword and sentiment heuristic is crude. Treat these tags as leads to check.
- **New dimensions:**

| Dimension | Applies to |
|---|---|
| AA intelligence index | text/vision |
| Latency (TTFT) | text/vision |
| Embedding score (MTEB) | embeddings |
| Transcription score (Open ASR) | speech-to-text |
| Speech quality score (TTS Arena) | text-to-speech |
| Audio price $/min | speech-to-text |
| Character price $/1M chars | text-to-speech |

- Intelligence now also averages the AA benchmark percentiles.

## 1c. "Available from" facet (2026-10-15)
- **What it is:** a multi-valued categorical facet that applies to All types. The All/Any frame works for siblings. Labels show only the leaf name, e.g. "Available from: Aggregators" or "Available from: OpenRouter". The Maker facet is unchanged.
- **Level 1** (my choice: 4 groups, including **Self-host**):
  - Direct from maker
  - Aggregators (OpenRouter and inference hosts such as Together, Fireworks, Groq, DeepInfra, Novita, plus HF Inference Providers)
  - Cloud platforms (AWS Bedrock, Google Vertex AI, Azure, Claude Platform on AWS)
  - Self-host (open weights download), whose only provider is "Hugging Face (download)"
- **Level 2:** the individual providers.
- **Derivation** (`enrich.availability`, with sources in `prov.availableFrom`):
  - Every OpenRouter-listed model gets "OpenRouter".
  - Each OpenRouter per-provider endpoint (`raw/ep/`) adds its provider:
    - OpenRouter's "Amazon Bedrock", "Google" (Vertex), "Azure" and "Claude Platform on AWS" count as Cloud.
    - A provider that is the model maker's own API counts as Direct (explicit maker→provider map, e.g. google→Google AI Studio, qwen→Alibaba, x-ai→xAI).
    - Everything else counts as an Aggregator.
  - HF models with open weights get "Hugging Face (download)".
  - Live HF inference providers (`raw/hf_providers.json`, from `expand[]=inferenceProviderMapping`, fetched 2026-10-15) add "Hugging Face Inference Providers" plus each provider (zai-org on Z.AI models counts as Direct).
  - Manual entries get Direct only where a vendor pricing page was already fetched (OpenAI, Google AI Studio for Gemini Embedding 2, ElevenLabs, Deepgram).
  - No other vendor-docs claims are made. Models with no evidence stay unrated: 5 manual entries (Gemini Embedding 001, Imagen 4, Cohere Embed v4, ElevenLabs Multilingual v2, Midjourney).
- **Coverage** (models per group, of 703): Direct 254, Aggregators 455, Cloud 101, Self-host 480.
- **Rebuild without the HF inference-provider file:** if `raw/hf_providers.json` is absent, the HF inference-provider values are skipped, and the facet does not break.

## 2. Architecture
- **(Superseded 2026-10-15 by §2a: `js/dims.js` is gone.)** All dimension definitions, taxonomies and labels now live in `models.yaml`.
- `js/engine.js`: data access layer. `engine.query(selections) -> { rows, total, groups:[{id, dim, level, multi, options:[{key, label, count, checked}], frame}], columns, selections }`.
  - `selections = { type, dims: { [dimId]: { levels: [{ checked: [keys], mode: 'all'|'any' }] } }, sort: { col, dir } }`.
  - The returned `selections` is normalized: invalid children are pruned, and dims hidden by the type are passed through untouched.
- The first implementation (`createLocalEngine(spec)`) brute-force scans the records loaded by the config runtime (`data/catalog.json` through `models.yaml`). A DB backend can implement the same request/response shape without UI changes; make it async and await it in `update()`.
- `js/app.js`: UI only, and generic (`MF_UI.mount(spec)`).

## 2a. Config-driven app (2026-10-15, agenda item 2)
Goal: **complete decoupling** of the frontend from the data and from the description of the data.
- One YAML file describes everything: title, dataset pointer (JSON/CSV, id field, CSV typing/list delimiter), the exclusive type selector (with an All option and per-facet applicability), facets (numeric ranges with quantile/nice/step split rules and min count, categorical trees inline/ref/path/generated, booleans, single vs multi-valued, units and formats, unrated handling, anecdotal marker), label templates, table columns and default sort (unrated last), row-popup sections (Find it here links, field rows, evidence, provenance), popup dwell/grace, the row highlight and the counts display. Full reference: `docs/CONFIG.md`. Schema: `docs/config.schema.json`, generated from `js/schema.js`.
- **Generic runtime** (`js/runtime.js`): parses YAML with the vendored js-yaml 4.3.2 (`js/vendor/js-yaml.min.js`, MIT, no CDN). It validates against the schema plus semantic checks and shows clear path-qualified errors in the UI. It then loads the dataset and taxonomy files, compiles a spec, and passes it to `js/engine.js` (generic) and `js/app.js` (generic). `js/boot.js` chooses the config source. `tests/config.test.js` asserts that `js/` contains no dataset-specific names.
- **Config sources:** the embedded default in `dist/model-filter.html` (models.yaml + data/catalog.json inlined); `?config=path.yaml` over http; the `<meta name="mf-default-config">` default (models.yaml) over http; and on `file://` a loader with multi-file picker, folder picker and drag-and-drop. If the YAML is picked alone, the loader asks for each missing file in turn.
- **`models.yaml` reproduces the previous app exactly.** A playwright comparison against pushed HEAD 29e726e found the facet panel, every facet popup, the table header and body for all 7 types, and 101 row popups byte-identical. The one deliberate change is that the link note class was renamed from `kind` to the generic `note`.
- **Example:** `examples/books.yaml` + `books.csv` (30 fictional books, clearly marked EXAMPLE DATA) + `genres.yaml` (a taxonomy loaded by path). It shows CSV typing, a type selector built from a list field, numeric/categorical/boolean facets, a generated tree, a multi-valued frame, default sort, a non-sortable column and a links section built from a URL string.
- `scripts/build_data.py`: regenerates the data from `raw/`.

## 3. Layout
Two panels:
- **Left:** filter panel: the model type radios, then a list of facets (see §4a). *(Superseded: the infinite-scroll flat checkbox list.)*
- **Right:** results table.

## 4. Filter panel rules
1. **Model type radio group** at the top (exclusive):
   - Options: All types (default), Text generation, Embeddings, Vision, Text-to-image, Speech-to-text, Text-to-speech.
   - **All types** shows only the dimensions shared by all types.
   - A specific type shows only the dimensions that apply to it.
   - Selections in dimensions hidden by a type switch are hidden and preserved, then restored when you switch back. Their facets disappear and come back with their selections.
2. ~~Checkboxes only below the radios, no headers~~ *(superseded by §4a: the panel lists facet names; checkboxes live in facet popups, and checked items are listed under their facet)*. Still true: each label stands alone and includes the dimension name, e.g. "Context window: 100k–500k tokens (23)". Each label stands alone and includes the dimension name, e.g. "Context window: 100k–500k tokens (23)".
   - The count is the number of models the box would match, given all other dimensions' current selections and this box's ancestor levels.
   - Zero-count boxes are **hidden** (the engine omits them from `options`). Exception: a CHECKED box stays visible even at zero count so it can be unchecked.
   - ~~Scroll anchoring of the clicked box in the flat list~~ *(superseded; refinement levels now grow downward inside the popup)*.
   - Every dimension has an "unrated" box at level 1.
3. **Order:** weights, license, input price, output price, intelligence, context, jobs, aptitude scores, then maker, available from, params, max output, speed, release, tool calling, JSON, reasoning, runs locally, input modalities, languages, embedding dim. This is the facet order. ~~Refinement levels are appended at the bottom of the panel~~ *(superseded: each facet's levels stack inside its popup)*.
4. **Refinement chains:** each dimension has levels.
   - Checked boxes within a level are OR'd.
   - Checking at level k reveals ONE combined level k+1, generated from the UNION of level k's checked boxes.
   - Only the deepest checked level (the governing level) filters that dimension. Numeric child ranges are additionally constrained to the parent union so gaps never leak.
   - Governing levels are AND'd across dimensions.
5. **Numeric children:**
   - Split the parent union into 3–4 ranges (2–3 if fewer than 12 models), using quantiles over the parent-matching models of the current type.
   - Boundaries round to nice numbers (1/2/2.5/5×10^k; months for release dates). Rough equality only.
   - Empty segments and gap segments are dropped.
   - No refinement when the parent matches fewer than 6 models.
   - Top-level context ranges: 0–100k, 100k–500k, 500k–1M, 1M+.
6. **Categorical children** come from the fixed taxonomy tree. Leaves have no children.
7. **Unchecking a parent:**
   - Removes the children that fall only under it, along with their effect.
   - A child still valid under the remaining checked parents stays checked.
   - Unchecked siblings are regenerated from the new parent union. Numeric: retained ranges are kept as fixed segments and new quantile cuts are made around them.
8. **Multi-valued categorical dims (Job, Input, Language):**
   - When 2+ boxes at the same level are checked, a light frame groups them with radios "All of these" (default, intersection) and "Any of these" (union).
   - The boxes animate (FLIP) into the frame.
   - ~~Scroll anchoring in the panel~~ *(superseded)*. The frame now appears inside the facet popup.
   - Single-valued dims always OR within a level, with no frame.
9. **No submit button.** Every change updates results instantly.

## 4a. Filter facet popups (current UX, 2026-10-15)
- **Panel:** model type radios at the top. Below them, one entry per visible dimension (**facet**), shown by name only with no checkbox, in the §4.3 order. Every numeric dimension is its own facet (Input price and Output price are separate). The categorical taxonomy (Job) is one facet.
- **Facet popup:** hovering a facet name opens its popup beside the panel. It uses the same mechanics as the row popover (`js/hoverpop.js`):
  - anchored, static once shown
  - switches to another facet after about 300ms of dwell
  - a safe triangle keeps it from switching while you move toward it
  - locked while the cursor is inside
  - about 200ms grace on leaving
  - Esc closes it
  - kept inside the viewport
- **Inside the popup:** the facet's level-1 checkboxes, with live counts. Zero-count unchecked boxes are hidden.
  - Checking a box immediately reveals the next refinement level inside the popup, stacked underneath and indented.
  - All §4 chain rules apply: OR within a level, union-based children, deepest checked level governs, retained children on uncheck, numeric quantile splits rounded to nice numbers, min 6, All/Any frame for multi-valued categorical siblings (with FLIP animation).
  - The results table updates live on every click.
- **On close** (cursor leaves plus grace, or Esc), the checked items appear in the panel directly under their facet name. They are checked checkboxes with standalone labels and counts, and unchecking one there updates results live. While a popup is open, the panel is not re-rendered (only the popup and the table are), so the panel does not shift under the cursor.
- **Hovering a checked item** in the panel opens its facet's popup with every level down to the deepest checked level, plus the next level if one applies.
- The engine and data interface are unchanged; this is purely a UI-layer change. Hidden-on-type-switch preservation still applies.
- **Alpha UX evaluation:** discoverability of hover-only facets; touch and keyboard access (no click or focus opening yet).

### ALPHA UX EVALUATION ITEMS
- The All/Any grouping frame: discoverability, animation, default "All".
- General AND/OR intuitiveness: OR within a level, AND across dimensions, only the governing level filters. For example, checking "Coding" and "Chat" and then "Coding › Refactoring" drops the Chat effect, because level 2 governs.
- Whether the "unrated" boxes and the counts (which exclude same-level siblings) read clearly.

## 5. Results panel
- Table with Model, Maker, one column per visible numeric dimension, and Comments.
- Click a header to sort. Click again to toggle asc/desc (▲/▼). Unrated always sorts last.
- Hovering a row shows a popover with the categorical properties: types, weights, license, jobs, inputs, languages, tools/JSON/reasoning, runs locally, raw benchmark values and percentiles, id, sources.
- **Row hover popover behaviour** (`js/app.js`):
  1. **Anchored:** it opens beside the hovered row, top-aligned with the row, 24px to the right of the cursor (or to the left if there is no room). It stays put once shown and does not follow the cursor.
  2. **Dwell:** it moves to a new row only after the cursor rests on that row for about 300ms.
  3. **Safe triangle (intent):** a triangle runs from the last cursor point on the current row to the popup's near edge. While the cursor moves inside it, the popup does not switch rows. If the cursor stops on a row for about 300ms, it switches.
  4. **Lock:** once the cursor is inside the popup, it stays locked and can be clicked (links, Provenance). On leaving, it hides after about 200ms, or switches to the row under the cursor after the dwell time.
  5. **Esc** closes it.
  6. It always stays inside the viewport, including after Provenance expands. Re-rendering the table closes it.
  7. **Row highlight (2026-10-15):** while the popup is showing for a row, that row gets class `hl`: a slightly darker grey background (#e4e6ea, overrides the plain hover tint) and a bold model name. The class moves on retarget and is removed on close (Esc, grace-period leave, table re-render).
- **Find it here (2026-10-15):** the first item in the row popup is a collapsible **Find it here (N)** section listing links to that model's page at each place it is available. Links open in a new tab (`target="_blank" rel="noopener noreferrer"`). **Design choice:** an inline expandable `<details>` rather than a nested hover popout. A second hover layer inside a hover popup would need its own dwell/intent handling and could fight the outer popup's lock and retarget logic. The expandable sits inside the already locked popup, so clicking links can never retarget the row.
  - Links are stored in the catalog as `links: [{label, kind, url}]` with `prov.links`. Order: maker docs, Hugging Face card, OpenRouter, then other aggregators.
  - **Never invented:** `scripts/check_links.py` builds candidate URLs only from real IDs in the data (OpenRouter id, HF repo, OpenRouter id tail for maker docs, HF repo for aggregators that HF lists as live inference providers for that repo). It fetches **every** candidate (GET, HTTP 200 required) and writes `raw/link_check.json`. `enrich.links()` keeps only candidates that passed. OpenRouter returns a soft 200 for unknown ids, so its check also requires a model-specific `<title>`.
  - Patterns kept: `openrouter.ai/<id>`, `huggingface.co/<repo>`, `developers.openai.com/api/docs/models/<tail>`, `ai.google.dev/gemini-api/docs/models/<tail>`, `docs.mistral.ai/models/<tail>`, `featherless.ai/models/<repo>`, `deepinfra.com/<repo>`, `together.ai/models/<repo-name>` (only per-URL passes are shown).
  - Patterns dropped: xAI docs (`docs.x.ai/docs/models/<id>`) and Novita (`novita.ai/models/llm/<id>`) both return 200 for made-up ids, so they can't be verified. Anthropic, DeepSeek and other makers have no per-model page URL that can be derived from data. AWS Bedrock, Vertex AI and Azure model-catalog URLs need platform-specific ids that aren't in the data. Groq, Fireworks, Novita and others need slugs that aren't in the data.
- **Header alignment (2026-10-15):** each header uses the same alignment as its column's cells: numeric facets right, others left, overridable with `align` in the YAML. On right-aligned headers the sort arrow goes to the left of the label, so the label's right edge lines up with the numbers below. Covered by `tests/align.test.js` for both models.yaml and books.yaml.
- **Hamburger menu (2026-10-15):** ☰ at the top left of the header. It offers Load YAML…, Open by path… (http only; updates `?config=` via `history.replaceState`), Reload current, Load default (embedded; single-file only) and Recent (`localStorage`, max 5).
  - **Recent entries:** path entries reload over http. File System Access handles (Chrome) are stored in IndexedDB and reopen after the permission prompt. Plain picked files show a re-pick hint.
  - **Switching configs:** a new config replaces the running one without reloading the page. `MF_APP.destroy()` removes the popover listeners through an AbortController in `js/hoverpop.js`, clears the DOM and resets state and sort.
  - **Failed loads:** loading and validating finish before the swap, so a failed load shows errors and keeps the current config.
  - **Keyboard and closing:** the menu closes on Esc or an outside click, and is keyboard accessible (arrow keys, Home/End, focus returns to ☰).
  - The embedded default is still the first config loaded in the single file. Covered by `tests/menu.test.js`. The File System Access handle route can't run in headless tests; that path is untested.
- **Per-config saved filters (2026-10-15):** the type, checked boxes at all levels, All/Any modes, selections hidden by the type, and sort are saved on every change. The key is `mf-state:<title>|<dataset.path>`, chosen over a YAML hash so config edits keep filters. Storage is `localStorage` with an in-memory fallback (`MF_STORE`). State is restored on every load of that config (initial, menu, Recent, Reload current, page reload).
  - **Stale selections:** they are dropped safely, with a small non-blocking ℹ note giving the count.
  - **Clear filters:** this menu item resets the current config only.
  - **Known behaviour:** switching the type re-derives numeric child ranges for that type's universe, an existing engine rule, so a numeric child chosen under one type can be pruned after switching to another type and back.
  - Covered by `tests/persist.test.js`.

## 6. Tests
- `node tests/engine.test.js`: 19 query-logic tests (including 1 for Find it here links, verified and with provenance; including 3 for Available from: taxonomy and labels, the All/Any frame and level-2 filtering, provenance and Maker unchanged) covering OR within a level, AND across dims, counts, governing level, union child generation (numeric and categorical), uncheck retention, All/Any frame, type hide/restore, shared dims, zero-count hiding (checked zero kept), sorting, the min-6 rule, and unrated counting.
- `node tests/enrich.test.js`: anecdotal tags (counted as tagged, `anecdotal` count, row flag), the estimated-params flag and its formatting, and catalog checks (provenance, no community evidence feeding scores, URLs on evidence).
- `NODE_PATH=<playwright node_modules> node tests/popover.test.js`: popover intent. Checks that the popup stays anchored, a quick or slow move across other rows into the popup does not switch rows, clicking Provenance works inside the viewport, switching happens only after the dwell time, a brief pass over a row is ignored, Esc closes it, and it hides after the grace period. Also checks the facet popup: crossing other facets into the popup keeps the target, switching happens after the dwell, and Esc closes it.
- `NODE_PATH=<playwright node_modules> node tests/ui.test.js`: facet popups. Covers facets listed by name, hover opening the popup, a check revealing the child level in the popup, live results, checked items listed under the facet after leaving, hovering a checked item reopening the popup at depth, unchecking in the panel, type-switch hide/restore, All/Any in the popup, the anecdotal \*, the Available from facet (popup levels, frame, panel items), sorting and the row popover. Writes `tests/screenshot.png`.
- `NODE_PATH=<playwright node_modules> node tests/findit.test.js`: the row highlight (bold, darker grey) is applied on open, moves on retarget and is cleared on Esc or leave. Find it here is first in the popup, lists links with `target=_blank`, every link is clickable (opens a new tab, network blocked in the test), and the popup never retargets while you click.
- `node tests/config.test.js`: checks the schema export matches; models.yaml and books.yaml validate; error messages for a bad enum, an unknown key, a missing required key, an unknown type ref, a duplicate id and YAML syntax (with line); a missing-field warning; CSV parsing; books facets, chains, split, boolean, frame, default sort and labels; popup sections; template filters; and the genericity guard over `js/`.
- `NODE_PATH=<playwright node_modules> node tests/books.test.js`: books over http (rows, title, header, type selector, facet popup chain, row popup and highlight, sorting, a non-sortable column). On file:// it covers the loader, YAML-then-dataset two-step, multi-select, folder pick and drag-and-drop. It also checks invalid config and 404 errors shown in the UI, the http default config, and the dist single file alone on file://.
- All browser tests serve the project over a local http server (`tests/helpers.js`) and open `index.html?config=models.yaml`. The engine tests load `models.yaml` in node.

## 7. Known gaps
- Only 10 image-gen scores.
- Transcription scores cover 8 models; speech-quality scores cover 4 (most HF top-50 speech models are not on those leaderboards).
- Speed and latency (Artificial Analysis) cover only models that AA tracks; mostly hosted text models.
- Job tags and local-GPU flags are heuristic. Community tags are sparse and anecdotal.
- No closed-model parameter estimates.
- Still unpriced: Gemini Embedding 001, Imagen 4, Cohere Embed v4, ElevenLabs Multilingual v2, Midjourney.
- Reddit blocked (HTTP 403).
- HF top-50 lists include some fine-tunes and quantizations.
