# Quick Filter: functional specification

This specification states what Quick Filter must do, as observable behaviour and requirements. It deliberately says nothing about how to implement it.

## 1. Product summary

Quick Filter is a personal, generic, faceted filter for a catalog of items. The user narrows the catalog with checkboxes only and sees matching items in a sortable table. The flagship configuration is a catalog of AI models; a second configuration, a small fictional book catalog, proves the app is generic.

## 2. Platform requirements

- Static app with no server. It must work when opened directly from the local disk, and also when served over plain http.
- A single self-contained file must exist that carries the app plus its default configuration and data, and works when opened from disk on its own with no companion files. (Opening a multi-file page from inside a compressed archive gives a blank page; the single file avoids this.)
- When the multi-file page is opened from disk, the browser cannot read neighbouring files by itself, so the app must offer a loader: choose several files at once, choose a folder, or drag and drop files or folders. If the user picks only the configuration, the app names each further file it needs in turn. If several configurations are picked, it asks which one to use.
- When served over http, a configuration can be named in the page address; with none named, a default configuration is used. Data and taxonomy files are located relative to the configuration file.
- The data access must sit behind a clean request and response boundary so that a database backend could replace the in-browser data later without changes to the interface.

## 3. Configuration-driven interface

- The whole interface is driven by one human-editable declarative configuration file in YAML. The app itself must contain nothing specific to any dataset.
- The configuration describes:
  - Title and a header line that can show values from the dataset's metadata (for example snapshot date and item total).
  - The dataset: location, format (JSON or CSV), the unique id field, where the records and metadata sit inside a JSON file, and for CSV the delimiter, a delimiter for list values inside a cell, and the type of each column (text, number, whole number, yes/no, list, structured). Empty cells mean unrated. Yes/no accepts true/false, yes/no and 1/0.
  - Count display text, option label templates (facet name plus value), the unrated wording, range label templates (closed and open-ended) and the separator used for hierarchy paths.
  - An optional exclusive type selector: which field holds the type (one value or a list), its label, the "all" option and the type options.
  - Popup timings: the dwell before a popup switches target and the grace period before it hides, separately for facet popups and row popups, and whether the hovered row is highlighted.
  - Named reusable taxonomies (trees of values).
  - Facets, in display order (section 5).
  - Table columns, default sort, and that unrated sorts last.
  - Row popup sections, in order (section 9).
- Category trees can be written inline, referenced by name, loaded from a separate file, or generated from the data: every distinct value ordered by frequency; the top N values with the rest under an "Other" node; or values grouped under top-level groups by a prefix in the value (empty groups dropped).
- Each facet has: an id, a display label, a kind (numeric range, category tree, or yes/no), the field it reads (nested fields allowed), whether the field holds several values, which types it applies to (default all), whether an unrated option is offered (default yes), and as applicable: number display format and unit, top-level ranges (lower bound included, upper excluded, open-ended allowed), refinement rules (rounding to nice numbers or to a fixed step such as whole months or years, minimum items per range, maximum number of sub-ranges), range label wording (including "before X" and "X or later" and inclusive end values), dates read as year and month, whether option labels show the full path or only the leaf, wording for yes/no, anecdotal-tag handling, and its table column (label, alignment, number format, showing a raw value while sorting by the number, an "estimated" display variant, or no column).
- Number display formats: plain; compact thousands and millions (128k, 1.05M); money; a set number of significant digits with trailing zeros dropped; a fixed number of decimals; year-month. Prefix and suffix allowed.
- Text templates in labels and popups can insert field values, fall back across several fields, and apply simple transforms: join a list, default text when missing, limit list length, yes/no wording, conditional text, number formatting, and mapping tag keys to facet labels with the anecdotal marker. Output is always safely escaped. An unknown transform is an error.
- Validation: syntax errors (with line and column), unknown keys, invalid values, missing required keys, references to unknown types, duplicate ids and similar problems are listed in a red box, each message naming the exact location in the configuration. A facet field that no record has gives a non-blocking yellow warning. A record with no id is a fatal error.

## 4. Layout

- Header: a menu button at the top left, the title, the metadata line and the count of matching items (for example "42 of 703 models match").
- Left: the filter panel. Right: the results table.

## 5. Filter panel and facets

### 5.1 Type selector

- An exclusive radio group at the top of the panel. For the AI-model dataset: All types (default), Text generation, Embeddings, Vision, Text-to-image, Speech-to-text, Text-to-speech.
- An item with several types appears under each of them.
- "All types" shows only facets that apply to every type; a specific type shows only the facets that apply to it.
- Selections in facets hidden by a type change are kept and restored, with their facets, when the user switches back.

### 5.2 Facets in the panel

- Below the type selector, each visible facet is listed by name only, in configuration order.
- Hovering a facet name opens its popup beside the panel (section 6).
- When the popup closes, the checked options of that facet are listed under its name as checked checkboxes with standalone labels and counts. Unchecking one there updates results immediately.
- Hovering a checked item in the panel reopens the facet popup showing every level down to the deepest checked level, plus the next level if one applies.
- While a popup is open, the panel must not reflow or shift under the cursor.

### 5.3 Option labels and counts

- Every option label stands alone and includes the facet name, for example "Context window: 100k–500k tokens (23)".
- Every facet offers an "unrated" option at its first level unless the configuration turns it off.
- Each option shows how many items it would match given every other facet's current selections and its own ancestor levels (its same-level siblings are not applied).
- Unchecked options with a zero count are hidden. A checked option stays visible even at zero, so it can be unchecked.

### 5.4 Filter semantics

- Within a level, checked options combine with OR.
- Facets combine with AND.
- Checking options at one level reveals one combined next level, built from the union of everything checked at that level.
- Only the deepest checked level of a facet (its governing level) filters the results. A finer choice overrides its parent. For example, checking Coding and Chat and then "Coding › Refactoring" leaves only the refactoring effect.
- Numeric sub-ranges are always limited to their checked parent ranges, so values in gaps between parents never leak in.
- Unchecking a parent removes children that fall only under it. A child still covered by another checked parent stays checked. Unchecked sibling options are regenerated from the new set of parents; for numeric facets, child ranges the user kept stay as fixed segments and new boundaries are placed around them.
- Category children come from the category tree; leaves have no children.

### 5.5 Numeric range refinement

- Top-level ranges come from the configuration.
- Sub-ranges are generated from the items currently matching the parent ranges within the current type. The goal is roughly equal numbers of items per sub-range; rough equality is acceptable.
- Boundaries are rounded to nice numbers (1, 2, 2.5 or 5 times a power of ten) or to a configured step (whole months for dates, whole years for years).
- Normally up to 4 sub-ranges; one fewer when the parent matches fewer than twice the minimum. Empty sub-ranges and ranges falling in gaps between parents are dropped.
- No refinement when the parent matches fewer than the minimum, which is 6 items by default.

### 5.6 All/Any grouping for multi-valued facets

- For facets whose items can carry several values (for example job tags, providers, input kinds, languages), when two or more sibling options at one level are checked, a light frame groups them with a choice of "All of these" (default; an item must have all) or "Any of these" (it needs one).
- The checked options move into the frame with a smooth animation.
- Single-valued facets always use OR, with no frame.

## 6. Hover popup behaviour (facet popups and row popups)

The same behaviour applies to both:

- The popup is anchored next to its target and stays put once shown; it does not follow the cursor.
- It switches to a new target only after the cursor rests on that target for about 300 ms. A brief pass over another target is ignored.
- Moving from the target toward the popup, through other targets, does not switch it (intent detection toward the popup).
- While the cursor is inside the popup it is locked and fully clickable.
- On leaving, it hides after a grace period of about 200 ms, or switches to the target under the cursor after the dwell time.
- Escape closes it.
- It always stays inside the visible window, including after a section inside it expands.
- Timings come from the configuration.

## 7. Results table

- Columns: item name, maker (for AI models), one column per visible numeric facet unless a facet opts out, and a comments column.
- Clicking a header sorts by it; clicking again reverses the direction, with an up or down arrow. Unrated values always sort last in both directions. A configuration may set a default sort and mark a column as not sortable.
- Each header uses the same alignment as its cells: numbers right-aligned, text left, overridable. On right-aligned headers the sort arrow sits to the left of the label so the label lines up with the numbers.
- Estimated values can show in a distinct form (for example "~200B (est.)").
- An item that passes the job filter only through anecdotal community tags gets an orange asterisk after its name, with an explanatory tooltip.

## 8. Row highlight

While a row's popup is showing, that row has a slightly darker grey background and a bold name. The highlight moves when the popup switches row and clears when it closes.

## 9. Row popup

Sections, in order (configurable):

- **Find it here (N):** collapsible, first, listing links to the item's page at each place it is available (maker documentation, model hub, aggregators). Links open in a new tab safely. With none, it says "No verified provider pages". It expands inline inside the locked popup, not as a second hover layer, so clicking links can never switch the popup to another row.
- **Details:** for AI models: types, weights, license, jobs (anecdotal-only tags marked with an asterisk), input kinds, languages (up to 25), tool calling / structured output / reasoning, runs locally, intelligence index (noting when it is the index publisher's own estimate), each raw benchmark value with its percentile, identifier, and data sources.
- **Anecdotal evidence:** for each community tag, a link to the source and a short quote (up to about 140 characters), under a heading stating these reports are not used in scores.
- **Provenance:** collapsible, the source of every filled value.

## 10. Menu

A menu button at the top left of the header offers:

- **Load configuration:** the loader as a dialog over the running app (multi-file pick, folder pick, drag and drop, prompts for missing files). Where the browser allows, an option to open with lasting file access so the files can be reopened later.
- **Open by path** (when served): load a configuration by its path and update the page address to match.
- **Reload current:** re-read the current source.
- **Load default:** in the single-file version only, return to the built-in configuration.
- **Recent:** up to 5 recently used configurations. Path entries reload directly; entries opened with lasting file access reopen after the browser's permission prompt; other picked files show a hint to pick them again.
- **Clear filters:** reset the current configuration's type, selections and sort to defaults and forget its saved state, leaving other configurations untouched.

A new configuration replaces the running one without reloading the page, but only after it has fully loaded and validated. If that fails, the errors are shown and the current configuration stays. Popups and highlights always reset on a switch. The menu works by keyboard (open with Enter, Space or Down; move with arrows, Home and End; Escape closes and returns focus to the button) and closes on an outside click.

## 11. Persistence

- Filter state is saved on every change and restored whenever that configuration loads: first load, loading from the menu, recent entries, reload and page refresh, across sessions.
- Saved: the selected type, checked options at every level, All/Any choices, selections hidden by the current type, and the sort column and direction.
- State is tied to the configuration's title plus its dataset location, so editing labels or ranges keeps the user's filters. Two configurations with the same title and dataset share state.
- If browser storage is unavailable, state still survives configuration switches within the session.
- On restore, anything that no longer fits (unknown facets, options or ranges no longer offered, children whose parent is gone, unknown type or sort column) is dropped safely, and a small non-blocking note says how many selections were dropped. Unreadable saved state is ignored.
- Known accepted behaviour: numeric sub-ranges are recomputed for the current type's items, so a sub-range chosen under one type can be lost after switching to another type and back.

## 12. AI-model sample dataset requirements

### 12.1 Scope and snapshot

- Gathered once as a static snapshot; the snapshot date appears in the header.
- Six types: text generation, embeddings, vision, text-to-image, speech-to-text, text-to-speech.
- Scope: the top 50 most-downloaded models of each type on Hugging Face, plus every model listed on OpenRouter, plus major closed frontier models of these types. Duplicate alias listings are skipped; free or batch variants are folded into their base model. The same model from two sources becomes one item. The reference snapshot (dated 2026-10-14, enriched 2026-10-15) held 703 models: text 395, vision 248, embeddings 106, speech-to-text 85, text-to-image 67, text-to-speech 59.

### 12.2 Facets (in this order)

1. Weights: Open, Closed.
2. License, grouped: Permissive (Apache-2.0, MIT, BSD, CC-BY); Copyleft/share-alike (GPL family, CC-BY-SA); Open but restricted (Llama community, Gemma terms, OpenRAIL, Non-commercial CC-BY-NC, Other/custom); Proprietary.
3. Input price per 1M tokens: 0–0.1, 0.1–1, 1–5, 5+ dollars.
4. Output price per 1M tokens: 0–0.5, 0.5–2, 2–10, 10+ dollars.
5. Intelligence (text, vision): 0–25, 25–50, 50–75, 75+.
6. Context window (text, vision, embeddings): 0–100k, 100k–500k, 500k–1M, 1M+ tokens.
7. Job (multi-valued, with anecdotal marker): Coding (creating code, refactoring, reviewing, debugging, testing, web/frontend); Writing (creative/fiction, roleplay/characters, business/marketing, summarization); Reasoning and math (math, logic/step-by-step, science/research); Data extraction (structured JSON, documents/OCR, classification/tagging); Agents and tool use (function calling, multi-step agentic, computer/browser use); Chat (general assistant, customer support); Translation (multilingual translation); Retrieval and search (semantic search/RAG, reranking, clustering); Vision understanding (image description, charts/diagrams, OCR, video); Image generation (general/photoreal, editing/inpainting); Speech (transcription, speech synthesis, voice cloning).
8. Scores from 0 to 100 in quarters: Coding, Reasoning, Writing/chat, Instruction/extraction, Agentic (text, vision); Vision (vision).
9. Artificial Analysis intelligence index (text, vision): 0–20, 20–40, 40–60, 60+.
10. Embedding score (embeddings), Transcription score (speech-to-text), Speech quality score (text-to-speech), Image-gen score (text-to-image), in quarters.
11. Maker: top 15 plus Other.
12. Available from (multi-valued, leaf-only labels such as "Available from: OpenRouter"): Direct from maker; Aggregators (OpenRouter and inference hosts such as Together, Fireworks, Groq, DeepInfra, Novita, and Hugging Face inference providers); Cloud platforms (AWS Bedrock, Google Vertex AI, Azure, Claude Platform on AWS); Self-host (open weights download from Hugging Face). Individual providers form the second level.
13. Parameters (billions): 0–3, 3–15, 15–80, 80+.
14. Max output (text, vision): 0–8192, 8192–32768, 32768–131072, 131072+ tokens.
15. Speed (text, vision): 0–50, 50–100, 100–200, 200+ tokens per second.
16. Latency to first token (text, vision): 0–0.5, 0.5–1, 1–5, 5+ seconds.
17. Audio price per minute (speech-to-text): 0–0.003, 0.003–0.006, 0.006+ dollars.
18. Character price per 1M characters (text-to-speech): 0–20, 20–50, 50+ dollars.
19. Release date: before 2024, 2024, 2025, 2026 or later; sub-ranges on whole months.
20. Tool calling, Structured JSON, Reasoning mode (yes/no; text, vision).
21. Runs locally: Yes (up to 14B parameters); High-end GPU / quantized (14–40B); No (over 40B); No (closed weights).
22. Input kinds (multi-valued; text, vision): text, image, audio, video, file.
23. Language (multi-valued): top 12 plus Other.
24. Embedding dimension (embeddings): 0–512, 512–1024, 1024–2048, 2048+.

### 12.3 Pricing rules

- Input and output prices are separate facets.
- The filter value is the median of all provider quotes, untrimmed.
- The comments column names the cheapest and the most expensive provider with their prices.
- Without per-provider quotes, the aggregator's list price is used; models only on a model hub with no hosted offer are unrated.
- Speech-to-text priced per minute and text-to-speech priced per character get their own facets and are never converted to per-token prices.
- Official vendor pricing pages are the source for closed models not sold through aggregators. A model still unpriced carries a comment saying why.

### 12.4 Benchmark score rules

- Sources of truth are public leaderboards: LMArena (text, web development, vision, text-to-image), SWE-bench Verified, Aider polyglot, LiveCodeBench, the Open LLM Leaderboard, the Artificial Analysis public leaderboard (speed, latency, intelligence index and its benchmarks), MTEB (embeddings, a fixed set of common English tasks with most of them required), the Open ASR leaderboard (word error rate, lower is better) and TTS Arena.
- Each benchmark becomes a percentile among catalog models that have it (ties count as half).
- Each aptitude score is the average of its relevant benchmark percentiles: Coding (software-engineering, coding and web-development benchmarks), Reasoning (graduate science questions, hard math, broad knowledge and multi-step reasoning), Writing/chat (text arena), Instruction/extraction (instruction-following), Agentic (agentic software engineering), Vision (vision arena), Image-gen (text-to-image arena), Embedding, Transcription and Speech quality from their leaderboards.
- Intelligence is the average of all text and vision benchmark percentiles a model has.
- Matching benchmark entries to models is by normalized name; when several variants match, the best is taken.
- Unrated models are kept and marked. Scores are a rough ranking, since percentiles mix different populations.

### 12.5 Other data rules

- Every filled value records its source, shown under Provenance.
- Parameter counts are exact where published for open weights. Closed models get a value only from a credible published estimate, marked as estimated with its source; if none exists, unrated.
- Job tags come from evidence (descriptions, capability flags, benchmark coverage). Runs locally is derived from parameter count and openness.
- Tool calling and reasoning may be inferred as "yes" from evidence but never inferred as "no".

### 12.6 Community tags

- First-person usage reports from public communities (GitHub issues and discussions, X; Reddit if reachable) may add job tags.
- Only manually reviewed reports with a link and a verbatim quote are accepted. Automatic extraction may only propose candidates.
- Community tags count as tagged for filtering but never affect benchmark scores.
- Job options show "(N · k*)", where k is how many of the N match only through community tags. Such items get the asterisk in the table, and the popup lists the sources.
- Never commit third-party secrets found in downloaded community content.

### 12.7 Provider availability and links

- Available from is derived only from evidence: aggregator listings, their per-provider offers, model hub availability and live hub inference providers, and vendor pages already used for pricing. Items without evidence stay unrated.
- Find it here links are built only from real identifiers in the data, and every link must be checked to return a real model-specific page before it is shown. Sites that answer successfully for made-up identifiers count as unverifiable and are excluded.

## 13. Book example dataset

A second configuration with about 30 fictional books from a CSV file, clearly labelled as example data. It shows: a Format type selector from a list field (Print, E-book, Audiobook, plus "Any format"); a Genre tree loaded from a separate file (Fiction: mystery, sci-fi, fantasy, literary; Non-fiction: history, popular science, biography, cooking); Price with refinement (minimum 4 per range, at most 3 sub-ranges); Rating; Length in pages; Published year refined by whole years; generated Tag and Language trees; an In print yes/no facet only for print; a default sort by title; a non-sortable Notes column; and a link section built from a single web address.

## 14. Tests

Automated tests must cover: OR within a level, AND across facets, counts, the governing level, child levels from the union of parents, retention on uncheck, All/Any, hide and restore on type change, zero-count hiding, sorting with unrated last, the minimum per range, unrated counting, anecdotal tags not feeding scores, configuration validation messages, CSV reading, genericity (no dataset-specific logic in the app), facet and row popup timing and intent, row highlight and Find it here, both datasets in a real browser over http and from disk, the single file opened alone, header alignment, the menu, and persistence.

## 15. Known data limitations (acceptable)

- Few image-generation, transcription and speech-quality scores.
- Speed and latency only for models tracked by Artificial Analysis.
- Sparse max output, structured JSON and language data.
- Job tags and runs-locally values are heuristic; community tags are sparse.
- No closed-model parameter estimates.
- Some closed models remain unpriced: Gemini Embedding 001, Imagen 4, Cohere Embed v4, ElevenLabs Multilingual v2, Midjourney.

## 16. Acceptance criteria

- The single self-contained file opens from disk with no server and shows the AI-model catalog with its snapshot date and total.
- The multi-file version works over http and from disk via the loader.
- Both the AI-model and book configurations load and behave correctly with no change to the app.
- All filter semantics, counts, zero-count hiding, All/Any, type hide and restore, popup timings, table sorting, row highlight, row popup sections, menu actions, persistence and clear filters behave as described.
- Bad configurations produce precise, location-specific errors and leave a running configuration intact.
- No value, price, score, estimate or link in the data is invented; unrated stays unrated.
- All automated tests pass.

## Appendix A: Configuration file contract

This appendix is normative. It is the complete, exact vocabulary of the Quick Filter configuration file as a public, user-facing contract. Key names, literal values and defaults must be implemented exactly as written. Key names and literal values are shown in plain text inside double quotes.

### A.1 General rules

- The file is YAML. Full YAML must be accepted, including anchors and aliases (an anchor such as "&q4" defined on one value and reused elsewhere with the alias "*q4"); the AI-model reference configuration relies on them, for example to share one list of score ranges and one column format across many facets.
- YAML 1.2 core rules apply: only true and false (any letter case) are booleans, so unquoted yes, no, on and off are ordinary strings. This matters because "bool_labels" uses the keys "yes" and "no".
- The top level must be a mapping. Unknown keys are errors at every level where this appendix lists the allowed keys; the error names the path of the unknown key and lists the allowed keys. Missing required keys, wrong value types, values outside an allowed list, numbers outside their limits and strings that break a pattern are errors too, each reported with its path (for example "facets[0].kind: must be one of numeric, categorical, boolean").
- Types used below: string, number (any number, including whole numbers), integer (whole number), boolean (true or false), null, list, mapping.
- A "dotted path" is a field name, or several names joined by a full stop to reach into nested values (for example "prov.params").
- All relative file locations (dataset, taxonomy files) are resolved relative to the configuration file's own location.
- A conforming app must accept both shipped reference configurations, the AI-model configuration and the book example configuration (with its separate genre taxonomy file), completely unchanged.

### A.2 Top-level keys

- "version": required. Must be exactly the integer "1".
- "title": required, string. Used as the page title and header title, and as part of the saved-filter identity.
- "dataset": required, mapping (A.3).
- "header": optional, mapping (A.4).
- "counts": optional, mapping (A.5).
- "labels": optional, mapping (A.6).
- "types": optional, mapping (A.7). Without it there is no type selector.
- "popups": optional, mapping (A.8).
- "taxonomies": optional, mapping from a taxonomy name (any string) to a tree (A.9).
- "facets": required, list with at least one facet (A.10), in display order.
- "table": required, mapping (A.12).
- "row_popup": optional, mapping (A.13).

No other top-level key is allowed.

### A.3 "dataset"

- "path": required, string. Location of the data file, relative to the configuration.
- "format": required, one of "json" or "csv".
- "id": required, string. Name of the unique id field. Every record must have it; a record without it is a fatal error.
- "records": optional, string (dotted path). For JSON: where the list of records sits inside the file (the AI-model configuration uses "models"). Omit when the file itself is a list. If the value found is not a list, it is an error.
- "meta": optional, string (dotted path). For JSON: a metadata mapping whose fields can be used as placeholders in "header" "meta" (the AI-model configuration uses "meta").
- "csv": optional, mapping, for CSV:
  - "delimiter": string of exactly one character. Default a comma. Standard CSV double-quote quoting, with doubled quotes inside quoted cells, must be supported. The first row is the header row; fully empty rows are ignored.
  - "list_delimiter": string of at least one character. Default a vertical bar "|". Splits cells of "list" columns; parts are trimmed and empty parts dropped.
  - "fields": mapping from column name to one of "string", "number", "integer", "boolean", "list", "json". Columns not listed are strings. An empty cell is null (unrated) for every type. "number" and "integer" give null if the text is not a number. "boolean" accepts true, yes, 1 or y as true and false, no, 0 or n as false (any letter case); anything else is null. "json" parses the cell as structured JSON text.

### A.4 "header"

- "meta": optional template string (A.14). Placeholders are the fields of the dataset metadata plus "total" (number of records). The AI-model configuration uses "snapshotDate", "enrichDate", "total" and "arenaPublishDate".

### A.5 "counts"

- "show": boolean, default true. When false, options show no counts.
- "option": template, default "({count}{anecdotal_part})". Placeholders: "count" (matches for that option) and "anecdotal_part" (the rendered "anecdotal_part" template, or empty when there are no anecdotal-only matches).
- "anecdotal_part": template, default " · {anecdotal}{marker}". Placeholders: "anecdotal" (how many of the matches qualify only through anecdotal values) and "marker" (the facet's anecdotal marker).
- "results": template, default "{n} of {total} match". Placeholders: "n" (matching items) and "total" (all items).

### A.6 "labels"

- "option": template, default "{facet}: {value}". Placeholders: "facet" (the facet "label") and "value" (the option text).
- "unrated": string, default "unrated". Text for missing values in options, table cells and the "yesno" transform.
- "range": template for closed numeric ranges, default "{lo}–{hi}{unit}".
- "range_open": template for open-ended ranges, default "{lo}+{unit}".
- "path_separator": string, default " › ". Joins taxonomy labels into a path label.

### A.7 "types" (exclusive type selector)

- "field": required, string (dotted path). The record field holding the type; it may be one value or a list, and an item appears under every type it lists.
- "label": optional string, default "Type". Accessible name of the selector.
- "all": optional mapping with required "id" (string) and required "label" (string). The "show everything" option; default id "all", label "All".
- "options": required, list of at least one mapping, each with required "id" (string) and required "label" (string).

A facet's "types" may only name ids declared in "options"; an unknown id is an error. Under the "all" option only facets without a "types" key are shown.

### A.8 "popups"

- "facet": mapping with "dwell_ms" (integer, at least 0, default 300) and "grace_ms" (integer, at least 0, default 200).
- "row": mapping with "dwell_ms" (integer, at least 0, default 300), "grace_ms" (integer, at least 0, default 200) and "highlight" (boolean, default true; highlights the row whose popup is open).

"dwell_ms" is how long the cursor must rest on a new target before the popup switches to it; "grace_ms" is how long the popup stays after the cursor leaves it.

### A.9 Trees (taxonomies)

A tree, wherever it appears (under "taxonomies" or as a facet "tree"), takes exactly one of these forms:

- An inline list of nodes. Each node is a mapping with required "key" (string, number or boolean; treated as text), optional "label" (string; defaults to the key) and optional "children" (a list of nodes). Children form the next refinement level; leaves have none. No other node keys are allowed.
- A mapping with only "ref" (string): the name of a tree under "taxonomies". An unknown name is an error.
- A mapping with only "path" (string): a separate file, relative to the configuration, containing a node list. It is read as JSON if its name ends with the extension json, otherwise as YAML.
- A mapping with "generate" plus its options (no other keys):
  - "generate": one of "distinct", "top_n", "prefix_groups".
  - "distinct": one leaf per distinct value found in the field, ordered by frequency (most frequent first, ties alphabetical).
  - "top_n": the "n" most frequent values as leaves (integer, at least 1, default 15), and if more values exist, one extra node labelled "other_label" (string, default "Other") whose children are the remaining values in alphabetical order.
  - "prefix_groups": values are expected to look like a prefix, a separator, then a name (for example "agg:OpenRouter"). "separator" (string, default ":"); "key_prefix" (string, default empty) is prepended to each group's key; "groups" (required and non-empty for this form) is a list of mappings each with required "prefix" (string) and required "label" (string). Each group becomes a top-level node whose children are the values starting with its prefix and separator, ordered by frequency, labelled with the part after the separator. Groups with no values are dropped.

### A.10 Facets (each item of "facets")

Required keys: "id", "label", "kind", "field". No keys other than those listed here are allowed.

- "id": string matching a letter or underscore followed by letters, digits or underscores. Must be unique (a duplicate is an error). Also identifies the facet's table column and sort column.
- "label": string. Facet name in the panel and the "facet" placeholder in option labels.
- "kind": one of "numeric" (range refinement), "categorical" (tree refinement), "boolean" (Yes/No).
- "field": string (dotted path) into each record. If no record has this field, a non-blocking warning is shown.
- "multi": boolean, default false. The field holds a list of values; with two or more checked siblings the All/Any frame appears ("All of these" by default).
- "types": list of type ids this facet applies to. Default: all types.
- "order": number. Sort key for facet order; default is the position in the list.
- "unrated": boolean, default true. Offer an "unrated" option for missing values.
- "parse": numeric only; one of "number" (default) or "yearmonth". "yearmonth" reads text such as 2025-03 or 2025-03-14 as a fractional year (year plus month minus one, divided by twelve).
- "format": numeric only; a format mapping (A.11) used in range labels.
- "unit": string, inserted through the "unit" placeholder in range labels.
- "ranges": numeric facets require it (an error otherwise; not allowed on other kinds). List of at least one pair; each pair is a list of exactly two items, each a number or null. Ranges include the lower bound and exclude the upper bound. The lower bound may not be null; a null upper bound means open-ended; otherwise the upper bound must be greater than the lower.
- "split": numeric only (not allowed on other kinds); mapping of child-level rules:
  - "method": only the literal "quantile" is allowed (meaning sub-ranges aim for roughly equal item counts; this is the only behaviour).
  - "nice": boolean, default true. Round boundaries to the nearest of 1, 2, 2.5, 5 or 10 times a power of ten.
  - "step": number, or a string fraction written as two numbers separated by a slash (for example "1/12" for whole months). Rounds boundaries to multiples of the step and takes precedence over "nice".
  - "min_count": integer, at least 1, default 6. Do not refine when fewer items match.
  - "max_children": integer from 2 to 10, default 4. With fewer than twice "min_count" matches, one fewer is used.
- "range_labels": numeric only; mapping of templates "closed", "open" and "from_zero" (used when the lower bound is 0). Placeholders: "lo", "hi", "hi_step" (the upper bound minus the step, giving an inclusive end such as 2024-12) and "unit". When absent, "labels" "range" and "range_open" apply.
- "tree": categorical facets require it (an error otherwise). A tree (A.9).
- "value_labels": categorical only; "path" (default; the label is the full path, for example "Job: Coding › Refactoring") or "leaf" (only the node's own label, for example "Available from: OpenRouter").
- "bool_labels": boolean facets; mapping with "yes" (string, default "Yes") and "no" (string, default "No"). Option keys are "yes" and "no". A field value of true, or text true, yes or 1, counts as yes; any other present value counts as no; missing counts as unrated.
- "anecdotal": categorical; mapping with required "exclude_field" (string, dotted path to a list of this facet's values that are supported only by anecdotal evidence), optional "marker" (string, default "*") and optional "row_flag_title" (string, default "matches only via anecdotal values"; the tooltip of the row marker). Anecdotal values still count as matches, are counted separately in option counts, flag matching rows with the marker in any column that has "row_flag_marker", and are marked by the "tags" transform and the "evidence" section.
- "column": either the literal false (no table column for this facet) or a mapping:
  - "label": string, the column header (defaults to the facet label).
  - "align": one of "left", "center", "right". Default right for numeric facets.
  - "format": a format mapping (A.11) for the cell. Default precision with 4 digits.
  - "display_field": string (dotted path). Show this raw field in the cell (for example a date text) while sorting by the facet's numeric value.
  - "estimated": mapping with required "flag_field" (string), required "template" (template whose placeholder "value" is the formatted value, for example "~{value}B (est.)") and optional "title_field" (string, a field shown as the cell tooltip). Used when the flag field is true.

### A.11 Format mapping

Keys: "kind" (required), "digits" (integer 0 to 20), "prefix" (string), "suffix" (string). No other keys. "kind" is one of:

- "plain": the value as text.
- "si": 1,000,000 and above as millions with three significant digits and an "M" (1.05M); 1,000 and above as rounded thousands with a "k" (128k); else plain.
- "money": a dollar sign, then for values below 1 two significant digits (0.15), otherwise two decimals with trailing zeros dropped (2.5, 3).
- "precision": the number of significant "digits" (default 4), trailing zeros dropped.
- "fixed": exactly "digits" decimals (default 1).
- "yearmonth": a fractional year shown as year-month (2025-03).

"prefix" and "suffix" are added around the result.

### A.12 "table"

- "columns": required, list of at least one column. Each column is one of two forms:
  - A field column with required "field" (string, dotted path) and required "label" (string), and optional "align" ("left", "center", "right"; default right if a "format" is given, else left), "class" (string, a styling class name such as "c"), "sortable" (boolean, default true), "row_flag_marker" (boolean; append the anecdotal marker to rows that match only through anecdotal values), "format" (format mapping applied to numeric values) and "template" (template over the record, replacing the plain field value). List values are shown joined with a comma and space.
  - A facet group with required "facets", one of "numeric" (one column per visible numeric facet) or "all" (one column per visible facet), and optional "sortable" (boolean). Facets whose "column" is false are skipped.
- "default_sort": null (no initial sort) or a mapping with required "col" (string: a field column's field or a facet id) and optional "dir" ("asc" or "desc", default "asc").
- "unrated_last": boolean, default true. Missing values sort last in both directions.

Headers always use their column's alignment; on right-aligned headers the sort arrow sits to the left of the label.

### A.13 "row_popup"

- "sections": list of sections, rendered in order. Each section has required "type", one of "links", "fields", "evidence", "map", "text", and may use only these keys: "type", "title", "field", "class", "collapsible", "count_in_title", "empty", "url", "text", "note", "facet", "link_text", "quote", "quote_max", "rows".
- Shared keys: "title" (string heading), "field" (string, dotted path to the data shown), "class" (string styling class, such as "find"), "collapsible" (boolean; renders an inline expandable section inside the locked popup, so clicking inside never retargets the popup), "count_in_title" (boolean; appends the number of entries in parentheses to a collapsible title).
- "links": "field" holds either a list of mappings or a single web address string (then the host name is shown as the link text). In each mapping, "url" names the key holding the address (default "url"), "text" names the key holding the link text (default "label"), "note" names the key holding a small note shown after the link (default "note"). Only addresses starting with http or https are kept. Links open in a new tab safely. "title" defaults to "Links"; "empty" (string) is shown when there are no links, default "No links".
- "fields": "rows" is a list of mappings, each with required "label" (string) and either "value" (template over the record) or "entries" (mapping with required "field" (string, dotted path to a mapping), required "item" (template applied to each key and value of that mapping, where "$key" and "$value" are the current key and value and a path segment starting with a dollar sign is replaced by that value, so "benchPct.$key" looks up the percentile for the current key), optional "join" (string between items, default a comma and space) and optional "empty" (string when the mapping is empty, default the "unrated" label)). No other row keys are allowed. Each row shows the label in bold followed by the value.
- "evidence": "field" holds a mapping from tag to a list of evidence entries; "facet" (string) names the facet whose labels and anecdotal marker are used (an unknown facet id is an error); in each entry "url" names the address key (default "url"), "link_text" names the key holding the link text (default "source"), "quote" names the quote key (default "quote"); "quote_max" (integer, at least 1, default 140) truncates quotes. "title" is shown above the entries; the section is omitted when there is no evidence.
- "map": shows each key and value of the mapping in "field" as "key: value" lines; "title" defaults to the field name; omitted when empty.
- "text": shows one text field; omitted when missing.

### A.14 Templates

- A template is literal text with placeholders. A placeholder is written as an expression in curly braces. Everything outside braces is literal text. All output is escaped so it is shown as text, never interpreted as markup.
- The expression starts with a dotted path. Several paths separated by commas mean "the first one that is not missing" (for example "orid,hf,id"). Missing means null, absent, empty text or an empty list.
- Transforms follow, each introduced by a vertical bar "|". A transform's argument, if any, follows a colon after its name (for example "default:unrated" or "join:; "). Transforms apply left to right. An unknown transform name is an error.
- Transforms, exact names:
  - "join": joins a list with the argument (default a comma and a space).
  - "default": when the value is missing, outputs the argument (default empty).
  - "limit": keeps the first n list items (argument n).
  - "yesno": maps true, false and missing to three comma-separated words given as the argument (default "yes", "no" and the "unrated" label), for example "yesno:yes,no,unknown".
  - "if": outputs the argument when the value is truthy, else nothing (for example "if: (AA-estimated)").
  - "fmt": formats a number; argument is a format kind (A.11) optionally followed by a colon and digits (default digits 4), for example "fmt:fixed:1".
  - "tags": argument is a facet id; maps value keys to that facet's labels and appends the facet's anecdotal marker to anecdotal-only values.
- A list result that remains after the transforms is shown joined with a comma and a space.
- Placeholder names available in each place:
  - "header" "meta": dataset metadata fields plus "total".
  - "counts" "option": "count", "anecdotal_part". "counts" "anecdotal_part": "anecdotal", "marker". "counts" "results": "n", "total".
  - "labels" "option": "facet", "value". Range templates ("labels" "range", "range_open", and facet "range_labels" "closed", "open", "from_zero"): "lo", "hi", "hi_step", "unit".
  - Column "estimated" "template": "value".
  - Field column "template", fields row "value": any record field path.
  - Fields row "entries" "item": any record field path plus "$key" and "$value".

### A.15 Values used by the reference configurations

These literal values appear in the shipped configurations and must work: facet kinds "numeric", "categorical", "boolean"; "parse" "yearmonth"; format kinds "money", "si", "precision", "fixed", "plain", "yearmonth"; "split" with "method" "quantile", "nice" true, "min_count", "max_children" and "step" given both as "1/12" and as 1; tree forms inline, "ref" (taxonomies "jobs" and "license"), "path" (a separate genre file) and "generate" with "top_n", "distinct" and "prefix_groups" (with "separator", "key_prefix" and "groups"); "value_labels" "leaf"; "bool_labels"; "anecdotal" with "exclude_field", "marker" and "row_flag_title"; "column" with "label", "format", "display_field" and "estimated" ("flag_field", "template", "title_field"); table column forms including "facets" "numeric", "class", "sortable" false and "row_flag_marker"; "default_sort" both null and a mapping with "col" and "dir" "asc"; "unrated_last"; section types "links", "fields", "evidence", "map", "text"; CSV field types "integer", "number", "list", "boolean" (declared in the book example for its columns "year", "pages", "rating", "price", "formats", "tags" and "in_print"; column names under "fields" are free, dataset-defined names, not reserved words); YAML anchors and aliases.
