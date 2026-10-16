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
