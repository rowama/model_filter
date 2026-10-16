# Model Filter: functional and technical specification (handoff)

This document describes the app as it exists in the repository rowama/model_filter at HEAD e648ae8, built from reading the repository's own SPEC.md, README.md, docs/CONFIG.md, docs/config.schema.json, models.yaml, the examples folder, the js and scripts folders and the tests. See PROMPT.md for the rebuild brief and DECISIONS.md for the reasoning history.

## 1. Purpose and form

A personal tool for Rob to filter AI, LLM and SLM models and pick models for use cases. It is a static single-page app with no server. It runs as a single self-contained file (dist/model-filter.html, from file://), served over http (for example with npx serve), or as index.html from file:// with a file loader. The front end is generic; everything about the AI-model data lives in models.yaml and data/catalog.json.

## 2. Data pipeline

### 2.1 Snapshot (2026-10-14, shown in the header)

- Hugging Face model list API, sorted by downloads, limit 50, for these pipeline tags: text-generation; feature-extraction plus sentence-similarity (embeddings); image-text-to-text (vision); text-to-image; automatic-speech-recognition; text-to-speech. 350 unique ids.
- Hugging Face per-model metadata (safetensors, card data) and config files give licence, languages, parameter count (safetensors total, so mixture-of-experts models show total parameters), creation date, context (max position embeddings) and embedding dimension (hidden size). Gated repositories have no config, so those values are null.
- OpenRouter model list: all models (462 listed). The 19 aliases of the tilde-prefixed "latest" form are skipped as duplicates. Free and batch variants merge into their base model as a comment and are not counted in the price median.
- OpenRouter per-model endpoints: per-provider input and output quotes, max output, throughput. The 30-minute throughput value was null everywhere, so OpenRouter could not supply speed.
- platform.openai.com pricing: prices for the closed embedding, speech-to-text, text-to-speech and image models added by hand.
- LMArena (Hugging Face dataset lmarena-ai/leaderboard-dataset; configs text, webdev, vision, text_to_image; split latest; category overall): Elo, published 2026-10-07.
- SWE-bench Verified (percent resolved, max per model), Aider polyglot (pass rate 2, older entries only), LiveCodeBench (mean pass at 1; few matches), Open LLM Leaderboard archive (IFEval, BBH, MATH Level 5, GPQA, MUSR, MMLU-Pro normalized; 25 exact Hugging Face id matches).
- Merge: an OpenRouter model whose Hugging Face id matches a Hugging Face top-50 entry becomes one record. Benchmark names match by normalized name (lowercase, no punctuation or dates, suffixes such as thinking, high, preview, instruct stripped). This is heuristic; a variant's score can attach to its base model, and with several matching variants the max is taken.
- Resulting catalog: 703 models. Per-type counts (a model can have several types): text 395, vision 248, embeddings 106, speech-to-text 85, text-to-image 67, text-to-speech 59.

Rule: missing data is null and is shown as unrated. Scores are never fabricated. Unrated models are always kept.

### 2.2 Enrichment pass (2026-10-15, scripts/enrich.py)

- Provenance: every non-null field records its source in a prov map on the record, shown in the row popup under Provenance. Aptitude and intelligence provenance lists the benchmarks used.
- Artificial Analysis: the public leaderboard page embeds its model table, which is parsed (the API needs a key and was not used). It fills speed (median output tokens per second across matched variants), latency (median time to first token in seconds) and the AA intelligence index (max over variants; AA's own estimates flagged as estimated). It fills context, reasoning (only if a variant is a reasoning model) and price (only when there are no OpenRouter quotes, noted in comments) only where these were null. AA benchmarks (GPQA, HLE, tau2, TerminalBench-Hard, IFBench, SciCode, LCR, MMMU-Pro) feed the aptitudes.
- MTEB: 14 common English tasks; score is the mean over tasks a model has, with at least 10 of 14 required. Drives the Embedding score.
- Open ASR leaderboard: average word error rate, stored negated because lower is better; matched by name so repacks and quantizations count. Drives the Transcription score.
- TTS Arena V2 Elo through an explicit alias map. Drives the Speech quality score.
- Vendor pricing pages: Google AI developer site (Gemini Embedding 2), ElevenLabs API pricing (v3, v4 Turbo), Deepgram (Nova-3), OpenAI (Whisper, transcribe, tts-1-hd). Per-minute and per-character prices get their own dimensions and are never converted to per-token prices. Models still unpriced carry a comment saying why.
- Hugging Face chat templates: tool calling and reasoning are set to yes when the tokenizer chat template handles tools or thinking. These are never set to no.
- Parameter counts: exact from safetensors, else from the Open ASR size column, else parsed from the official open-weight model name (for example 8B). Closed models may only get credible published estimates, flagged as estimated with the source in provenance and shown as an approximate "est." value. No credible estimates were found, so none are set.
- Enrichment statistics recorded in the catalog meta: speed 179, latency 179, AA matched 225, MTEB 47, ASR 8, TTS 4, tools from templates 35, reasoning from templates 15, params from names 32.

### 2.3 Community evidence (anecdotal)

- Bounded to the top 100 text models with an OpenRouter id, sorted by intelligence.
- Sources: GitHub search API (issues and discussions, one query per model, job keywords limited to 5 boolean operators); X search for a handful of top coding models (rate-limited); Reddit returned HTTP 403 every time and was not used.
- An automated extractor looks for a two-sentence window naming the model with a job keyword (refactor, debug, code review, unit tests, tool calling, agentic) and a positive-usage phrase, in a first-person post, not a question, claim or benchmark statement. Its hits go only to a candidates file, because manual review showed most were false positives.
- Only manually reviewed first-person usage reports in a curated file reach the catalog, each with its URL and a verbatim quote. Snapshot: 11 tags on 5 models (Claude Opus 5.5, Kimi K3, DeepSeek V4 Flash, Grok 4.7, MiMo-V2.5-Pro).
- Stored in a jobsAnecdotal field; jobsAnecdotalOnly lists tags with no heuristic or benchmark basis. Anecdotal tags count as tagged for filtering but never feed benchmark aptitude scores (aptitudes are computed before the community pass, and a test checks this).
- The raw GitHub community folder is gitignored (it contained a third party's Hugging Face token that GitHub push protection flagged).

### 2.4 Available from

- Multi-valued categorical facet that applies to all types, with leaf-only labels (for example "Available from: OpenRouter").
- Level 1 groups: Direct from maker; Aggregators (OpenRouter and inference hosts such as Together, Fireworks, Groq, DeepInfra, Novita, plus Hugging Face Inference Providers); Cloud platforms (AWS Bedrock, Google Vertex AI, Azure, Claude Platform on AWS); Self-host (open weights download), whose only provider is "Hugging Face (download)". Level 2 is the individual providers.
- Derivation: every OpenRouter-listed model gets OpenRouter; each OpenRouter endpoint provider is added, with Amazon Bedrock, Google (Vertex), Azure and Claude Platform on AWS counted as Cloud, the maker's own API counted as Direct through an explicit maker-to-provider map, and everything else as Aggregator; open-weight Hugging Face models get Hugging Face (download); live Hugging Face inference providers (fetched 2026-10-15) add Hugging Face Inference Providers plus each provider; manual entries get Direct only where a vendor pricing page was fetched. Five manual entries have no evidence and stay unrated: Gemini Embedding 001, Imagen 4, Cohere Embed v4, ElevenLabs Multilingual v2, Midjourney.
- Coverage of 703 models: Direct 254, Aggregators 455, Cloud 101, Self-host 480. If the Hugging Face providers file is absent, those values are skipped and the facet still works.

### 2.5 Find it here links and link checking

- Stored per model as a list of links with label, kind and URL, plus link provenance. Order: maker docs, Hugging Face card, OpenRouter, then other aggregators.
- scripts/check_links.py builds candidates only from real ids in the data and fetches every one with GET, requiring HTTP 200; OpenRouter answers 200 for unknown ids, so its check also requires a model-specific page title. Only passing links are kept.
- Patterns kept: OpenRouter model pages, Hugging Face model cards, OpenAI developer model docs, Google AI Gemini model docs, Mistral model docs, Featherless, DeepInfra and Together (per-URL passes only). Dropped: xAI docs and Novita (they answer 200 for made-up ids), makers with no derivable per-model URL (Anthropic, DeepSeek and others), cloud model catalogs needing platform-specific ids, and hosts needing slugs not in the data.
- Link counts in meta: Hugging Face 477, OpenRouter 356, Featherless 94, DeepInfra 60, OpenAI docs 53, Google AI docs 22, Together 5, Mistral docs 2.

## 3. Derived values

### 3.1 Pricing

Input and output price per million tokens are separate dimensions. The filter value is the median of all provider quotes (no trimming). The Comments column names the cheapest and most expensive provider with their prices. Models with no endpoint quotes fall back to the OpenRouter list price; Hugging Face-only models have no hosted quote and are unrated. Speech-to-text has an Audio price in dollars per minute; text-to-speech has a Character price in dollars per million characters.

### 3.2 Aptitude scores

Each benchmark becomes a percentile across catalog models that have it: models below plus half the ties, divided by the count, times 100. Each aptitude is the mean of its relevant percentiles (0 to 100):

- Coding: SWE-bench Verified, Aider polyglot, LiveCodeBench, LMArena WebDev.
- Reasoning: GPQA, MATH Level 5, MMLU-Pro, BBH, MUSR.
- Writing/chat: LMArena text.
- Instruction/extraction: IFEval.
- Agentic: SWE-bench Verified.
- Vision: LMArena vision. Image-gen: LMArena text-to-image.
- Embedding: MTEB; Transcription: Open ASR; Speech quality: TTS Arena.
- Intelligence: the mean of all text and vision benchmark percentiles the model has, including AA benchmarks.
- After enrichment, AA benchmark results (GPQA, HLE, tau2, TerminalBench-Hard, IFBench, SciCode, LCR, MMMU-Pro) also feed the aptitudes.

Caveat: percentiles mix populations (the Open LLM Leaderboard covers mostly small open models), so scores are a rough ranking.

### 3.3 Heuristic fields

- Job tags: regular-expression keywords over name, description and Hugging Face tags, plus capability flags (tools to function calling, JSON to structured output, reasoning to logic, type to retrieval, image generation or speech, any coding benchmark to creating code). Evidence-based but not hand-verified.
- Runs locally: up to 14B yes; 14 to 40B high-end GPU or quantized; over 40B no; closed weights no.
- Weights: Open if Hugging Face weights exist, else Closed. Licence grouped into Permissive, Copyleft/share-alike, Open but restricted, Proprietary.
- Model type comes from OpenRouter input and output modalities or the Hugging Face pipeline; audio-input chat models count as speech-to-text; multi-type models appear under every type.

## 4. Facets (models.yaml order)

Facets without a types list apply to all types and are the only ones shown under All types.

1. Weights (categorical): Open, Closed.
2. License (categorical, taxonomy): Permissive (Apache-2.0, MIT, BSD, CC-BY); Copyleft/share-alike (GPL family, CC-BY-SA); Open but restricted (Llama community, Gemma terms, OpenRAIL, Non-commercial CC-BY-NC, Other/custom); Proprietary.
3. Input price (numeric, money, per 1M): level 1 ranges 0–0.1, 0.1–1, 1–5, 5+. Explicit split: quantile, nice, minimum 6, at most 4 children.
4. Output price (numeric, per 1M): 0–0.5, 0.5–2, 2–10, 10+.
5. Intelligence (text, vision): 0–25, 25–50, 50–75, 75+.
6. Context window (text, vision, embeddings; SI format, tokens): 0–100k, 100k–500k, 500k–1M, 1M+.
7. Job (categorical, multi-valued, anecdotal marker): Coding (creating code, refactoring, reviewing, debugging, testing, web/frontend); Writing (creative/fiction, roleplay/characters, business/marketing, summarization); Reasoning and math (math, logic/step-by-step, science/research); Data extraction (structured JSON, documents/OCR, classification/tagging); Agents and tool use (function calling, multi-step agentic, computer/browser use); Chat (general assistant, customer support); Translation (multilingual translation); Retrieval and search (semantic search/RAG, reranking, clustering); Vision understanding (image description, charts/diagrams, OCR, video); Image generation (general/photoreal, editing/inpainting); Speech (transcription, speech synthesis, voice cloning).
8. Coding score, Reasoning score, Writing/chat score, Instruction/extraction score, Agentic score (text, vision), Vision score (vision): quartile ranges 0–25, 25–50, 50–75, 75+.
9. AA intelligence index (text, vision): 0–20, 20–40, 40–60, 60+.
10. Embedding score MTEB (embeddings), Transcription score Open ASR (speech-to-text), Speech quality score TTS Arena (text-to-speech), Image-gen score (text-to-image): quartile ranges.
11. Maker (categorical): generated top 15 plus Other.
12. Available from (categorical, multi-valued, prefix groups, leaf labels): see 2.4.
13. Parameters (numeric, B): 0–3, 3–15, 15–80, 80+; column shows estimated values with an "est." template when flagged.
14. Max output (text, vision; tokens): 0–8192, 8192–32768, 32768–131072, 131072+.
15. Speed (text, vision; tokens per second): 0–50, 50–100, 100–200, 200+.
16. Latency TTFT (text, vision; seconds): 0–0.5, 0.5–1, 1–5, 5+.
17. Audio price (speech-to-text; dollars per minute): 0–0.003, 0.003–0.006, 0.006+.
18. Character price (text-to-speech; dollars per 1M characters): 0–20, 20–50, 50+.
19. Release (numeric from a date string parsed to fractional year): before 2024, 2024, 2025, 2026 or later; children split on whole months; labels "before X", "X or later", and inclusive month ranges.
20. Tool calling, Structured JSON, Reasoning mode (boolean; text, vision).
21. Runs locally (categorical): Yes (up to 14B params), High-end GPU / quantized (14–40B), No (over 40B), No (closed weights).
22. Input (categorical, multi-valued; text, vision): text, image, audio, video, file.
23. Language (categorical, multi-valued): generated top 12 plus Other.
24. Embedding dim (embeddings): 0–512, 512–1024, 1024–2048, 2048+.

Every facet offers an unrated option at level 1 unless the config disables it.

## 5. Filter semantics

- Model type radio (exclusive): All types (default), Text generation, Embeddings, Vision, Text-to-image, Speech-to-text, Text-to-speech. All types shows only shared facets; a specific type shows only facets that apply to it. Selections in facets hidden by a type switch are preserved and restored when the facet returns.
- Within a level, checked options are OR'd. Facets are AND'd. Checking at level k reveals one combined level k+1 generated from the union of level k's checked options. Only the deepest checked level (the governing level) filters that facet; numeric children are additionally constrained to the parent union so gaps never leak.
- Unchecking a parent removes children that fall only under it; a child still valid under remaining parents stays checked; unchecked siblings regenerate from the new union. For numeric facets, retained ranges are kept as fixed segments and new cuts are made around them.
- Numeric child splitting: quantiles over the parent-matching models of the current type. With at least twice the minimum count of values, up to max_children segments (default 4); otherwise one fewer. Cut points are rounded to nice numbers (1, 2, 2.5, 5 times a power of ten) or to a step (months for release, whole years for the books year facet). Empty and gap segments are dropped. No refinement when fewer than the minimum count (6 by default) match. Rough equality only.
- Categorical children come from the taxonomy tree; leaves have no children.
- Multi-valued categorical facets (Job, Available from, Input, Language): when two or more siblings at one level are checked, a light frame groups them with radios "All of these" (default, intersection) and "Any of these" (union). The boxes animate into the frame (FLIP). Single-valued facets always OR, with no frame.
- Counts: each option shows the number of models it would match given all other facets' selections and its own ancestor levels (same-level siblings excluded). Unchecked options with zero count are hidden by the engine; checked options stay visible even at zero. For the Job facet the count shows "(N · k*)" where k is how many match only through anecdotal tags.
- No submit button; every change updates results immediately.

## 6. Filter panel and facet popups

- Panel: type radios, then each visible facet by name only, in config order.
- Hovering a facet name opens its popup beside the panel, using the shared hover module: anchored and static once shown; switches facet after about 300 ms dwell; a safe triangle prevents switching while moving toward the popup; locked while the cursor is inside; about 200 ms grace on leaving; Escape closes; kept inside the viewport.
- The popup holds the level-1 checkboxes with live counts; checking reveals the next level stacked and indented beneath. The table updates on every click.
- On close, checked items appear under their facet name in the panel as checked checkboxes with standalone labels and counts; unchecking there updates results. While a popup is open, the panel is not re-rendered, so nothing shifts under the cursor. Hovering a checked item reopens the popup with every level down to the deepest checked one, plus the next level if any.
- Open alpha questions: discoverability of hover-only facets, touch and keyboard access (no click or focus opening yet), the All/Any frame, overall AND/OR intuitiveness, and readability of unrated options and counts.

## 7. Results table

- Columns: Model (carries the anecdotal row flag), Maker, one column per visible numeric facet (a facet can opt out), Comments. Column labels and formats come from each facet's column settings.
- Click a header to sort; click again to toggle ascending and descending (arrow indicators). Unrated always sorts last in both directions. models.yaml has no default sort; books.yaml sorts by title ascending.
- Header alignment matches its cells: numeric facets right, others left, overridable. On right-aligned headers the sort arrow sits to the left of the label so its right edge lines up with the numbers.
- A row that passes the Job filter only through anecdotal tags gets an orange asterisk after its name.
- Header line: "Snapshot (date) (enriched date) · total models · LMArena published (date)", plus the results count "n of total models match".

## 8. Row popup

- Same hover mechanics as facet popups: opens beside the row, top-aligned, 24 px to the right of the cursor (or left if there is no room), static once shown, 300 ms dwell to retarget, safe triangle, lock while inside, 200 ms grace, Escape closes, stays in the viewport even after Provenance expands, closes when the table re-renders.
- Row highlight: while its popup shows, the row gets a slightly darker grey background (#e4e6ea) and a bold name; it moves on retarget and clears on close.
- Sections in order: Find it here (N), collapsible, links open in a new tab with noopener, "No verified provider pages" when empty; field rows for Types, Weights, License, Jobs (anecdotal-only tags marked with an asterisk), Input, Languages (up to 25), Tools / JSON / Reasoning, Runs locally, AA index (with an AA-estimated note), Benchmarks (raw values with percentiles), ID, Sources; the anecdotal evidence list with source links and quotes up to 140 characters, titled as not used in scores; and collapsible Provenance.
- Find it here is an inline expandable section rather than a nested hover popout, so clicking links can never retarget the outer popup.

## 9. YAML config contract

- Top level: version (must be 1), title, dataset (required), header, counts, labels, types, popups, taxonomies, facets (required, display order), table (required), row_popup.
- dataset: path relative to the YAML; format json or csv; id field (required, used for row flags); records and meta as dotted paths for JSON; CSV delimiter (default comma, RFC 4180 quoting), list delimiter (default vertical bar) and field typing (string, number, integer, boolean, list, json; empty cells are null; booleans accept true/false/yes/no/1/0).
- counts: show, option suffix template, anecdotal part, results template. labels: option (facet plus value), unrated text, closed and open range templates, path separator.
- types: field (scalar or list), label, an All option, and options. Omit for no selector.
- popups: facet and row dwell and grace in milliseconds; row highlight on or off.
- Trees: inline nodes (key, optional label, children), a reference into taxonomies, a path to a YAML or JSON file, or generated (distinct values by count; top N with an Other node; prefix groups with separator, key prefix and group labels, empty groups dropped).
- Facet keys: id, label, kind (numeric, categorical, boolean), field (dotted path), multi, types, order, unrated, parse (number or yearmonth), format, unit, ranges (half-open, null upper bound means open), split (method, nice, step overriding nice, min_count, max_children), range_labels (closed, open, from_zero with lo, hi, hi_step and unit placeholders), tree, value_labels (path or leaf), bool_labels, anecdotal (exclude field, marker, row flag title), column (false, or label, align, format, display field, estimated template).
- Number formats: plain, si, money, precision, fixed, yearmonth, with optional digits, prefix and suffix.
- table: columns (field columns with label, align, class, sortable, template, row flag marker; or a facets group for numeric or all visible facets), default sort or none, unrated last.
- row_popup sections: links, fields (template rows or entries iterating an object with key and value lookups), evidence, map, text; any can be collapsible.
- Templates: literal text with placeholders holding a dotted path (comma-separated paths coalesce) and filters join, default, limit, yesno, if, fmt and tags. Output is HTML-escaped; an unknown filter is an error.
- Validation: YAML syntax errors with line and column, schema violations and semantic problems (bad enum, unknown key, missing required key, unknown type reference, duplicate id) in a red box with path-qualified messages; a facet field absent from every record gives a yellow warning; a record without the id field is fatal.
- Load paths: the single-file build uses its embedded default; over http a config query parameter is fetched relative to the page, with dataset and taxonomy paths relative to the YAML; over http without the parameter the meta default (models.yaml) is used; index.html from file:// shows a loader with Choose files, Choose folder and drag and drop, asks for each missing file in turn, and asks which config when several are selected.

## 10. Hamburger menu

At the top left of the header: Load YAML (loader as a dialog; in Chrome also Open with file access and Folder with file access via the File System Access API); Open by path (http only; updates the config query parameter with history replaceState); Reload current (refetch path, embedded default or picked files); Load default (embedded, single-file build only); Recent (up to 5 in localStorage; path entries reload over http, file-access handles are kept in IndexedDB and reopen after a permission prompt, other picked files show a re-pick hint); Clear filters. A new config replaces the running one without a page reload, after loading and validating fully; a failure shows errors and keeps the current config. Popups and highlight always reset. Keyboard: Enter, Space or Arrow Down open; arrows, Home and End move; Escape closes and returns focus; outside click closes.

## 11. Persistence

Saved on every change: type, checked options at every level, All/Any modes, selections hidden by the type, sort column and direction. Key: "mf-state:" followed by the config title, a vertical bar and the dataset path (chosen over a YAML hash so config edits keep filters; two configs with the same title and dataset share state). Storage is localStorage with an in-memory fallback that survives config switches but not reloads. Restored on every load of that config. On restore each facet is normalized under the saved type or the first type that shows it; unknown facets, keys, ranges, orphaned children, an unknown type and an unknown sort column are dropped, and a small informational note in the yellow bar states how many were dropped. Unreadable state is ignored. Clear filters resets only the current config and deletes its saved state. Known behaviour: switching type re-derives numeric child ranges for that type's universe, so a numeric sub-range chosen under one type can be pruned after switching away and back.

## 12. Single-file build

scripts/build_single.py takes an optional config path (default models.yaml) and output path (default dist/model-filter.html). It inlines the stylesheet and every script, removes the default-config meta tag, asks the runtime which files the config needs, and embeds the config plus those files keyed by path. The result works from file:// on its own. The same script builds a single file for another config such as the books example.

## 13. Books example

examples/books.yaml loads 30 fictional books from CSV, with a Format type selector built from a list field (Print, E-book, Audiobook, with "Any format"), a Genre taxonomy loaded from genres.yaml (Fiction: mystery, sci-fi, fantasy, literary; Non-fiction: history, popular science, biography, cooking), Price with a quantile split (minimum 4, up to 3 children), Rating, Length, Published year with whole-year steps, generated Tag and Language trees, a boolean In print facet only for print, a default sort by title, a non-sortable Notes column and a links section built from a URL string.

## 14. Tests

- Node: engine tests (19 query-logic tests including Find it here and Available from), enrichment tests, config tests (schema export, both configs validate, precise error messages, CSV parsing, books behaviour, popup sections, templates, genericity guard over js).
- Playwright (served over a local http server): popover intent and timings, facet popup UI, row highlight and Find it here, books over http and file:// plus the dist file and error display, header alignment, the menu, and persistence. The File System Access handle route cannot run headless and is untested.

## 15. Known gaps

- Only 10 image-gen scores; transcription scores for 8 models and speech quality for 4.
- Speed and latency only for models Artificial Analysis tracks.
- Sparse max output, structured JSON and language data.
- Job tags and local-GPU flags are heuristic; community tags are sparse and anecdotal; Reddit blocked.
- No closed-model parameter estimates.
- Still unpriced: Gemini Embedding 001, Imagen 4, Cohere Embed v4, ElevenLabs Multilingual v2, Midjourney.
- Hugging Face top-50 lists include some fine-tunes and quantizations.
- Recent-file handles have not been verified in a real Chrome.
