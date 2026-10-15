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

## 2. Architecture
- `js/dims.js`: dimension definitions and taxonomy trees.
- `js/engine.js`: data access layer. `engine.query(selections) -> { rows, total, groups:[{id, dim, level, multi, options:[{key, label, count, checked, disabled}], frame}], columns, selections }`.
  - `selections = { type, dims: { [dimId]: { levels: [{ checked: [keys], mode: 'all'|'any' }] } }, sort: { col, dir } }`.
  - The returned `selections` is normalized: invalid children are pruned, and dims hidden by the type are passed through untouched.
- The first implementation (`createLocalEngine`) brute-force scans the embedded JSON (`data/catalog.js`). A DB backend can implement the same request/response shape without UI changes; make it async and await it in `update()`.
- `js/app.js`: UI only.
- `scripts/build_data.py`: regenerates the data from `raw/`.

## 3. Layout
Two panels:
- **Left:** filter panel, a vertical list with infinite scroll that renders in chunks as you scroll.
- **Right:** results table.

## 4. Filter panel rules
1. **Model type radio group** at the top (exclusive):
   - Options: All types (default), Text generation, Embeddings, Vision, Text-to-image, Speech-to-text, Text-to-speech.
   - **All types** shows only the dimensions shared by all types.
   - A specific type shows only the dimensions that apply to it.
   - Selections in dimensions hidden by a type switch are hidden and preserved, then restored when you switch back. Their refinement levels keep their place in the list.
2. **Checkboxes only** below the radios. No headers. Each label stands alone and includes the dimension name, e.g. "Context window: 100k–500k tokens (23)".
   - The count is the number of models the box would match, given all other dimensions' current selections and this box's ancestor levels.
   - Zero-count boxes are greyed out and disabled, not hidden. A checked box stays enabled.
   - Every dimension has an "unrated" box at level 1.
3. **Order:** weights, license, input price, output price, intelligence, context, jobs, aptitude scores, then maker, params, max output, speed, release, tool calling, JSON, reasoning, runs locally, input modalities, languages, embedding dim. Refinement levels are appended at the bottom in the order they are revealed.
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
   - The clicked box is anchored: the scroll position is adjusted so it stays at the same screen position. Content above the viewport never shifts visually, and the box is scrolled into view if needed.
   - Single-valued dims always OR within a level, with no frame.
9. **No submit button.** Every change updates results instantly.

### ALPHA UX EVALUATION ITEMS
- The All/Any grouping frame: discoverability, animation, default "All".
- General AND/OR intuitiveness: OR within a level, AND across dimensions, only the governing level filters. For example, checking "Coding" and "Chat" and then "Coding › Refactoring" drops the Chat effect, because level 2 governs.
- Whether the "unrated" boxes and the counts (which exclude same-level siblings) read clearly.

## 5. Results panel
- Table with Model, Maker, one column per visible numeric dimension, and Comments.
- Click a header to sort. Click again to toggle asc/desc (▲/▼). Unrated always sorts last.
- Hovering a row shows a popover with the categorical properties: types, weights, license, jobs, inputs, languages, tools/JSON/reasoning, runs locally, raw benchmark values and percentiles, id, sources.

## 6. Tests
- `node tests/engine.test.js`: 15 query-logic tests covering OR within a level, AND across dims, counts, governing level, union child generation (numeric and categorical), uncheck retention, All/Any frame, type hide/restore, shared dims, zero-count disable, sorting, the min-6 rule, and unrated counting.
- `NODE_PATH=<playwright node_modules> node tests/ui.test.js`: headless Chromium end to end, writes `tests/screenshot.png`.

## 7. Known gaps
- Speed: no data.
- Few reasoning/IFEval matches (archived leaderboard).
- Only 10 image-gen scores.
- No embedding-quality, STT or TTS benchmarks.
- Job tags and local-GPU flags are heuristic.
- Manual closed entries for non-OpenAI vendors have no prices.
- HF top-50 lists include some fine-tunes and quantizations.
