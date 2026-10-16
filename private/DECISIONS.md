# Decisions log: how Quick Filter came to be

A chronological summary of the conversation between Rob and the assistant that produced Quick Filter (GitHub rowama/model_filter, HEAD e648ae8). Each entry records the question raised and the decision made. See SPEC.md for the resulting behaviour and PROMPT.md for the rebuild brief.

## 1. Initial vision

- Rob described an "infinite" filter panel made only of checkboxes, with faceted refinement: OR within a facet, AND across facets.
- He asked to be told what is wrong with the idea and to be guided step by step, one question per response. This working style held for the whole project.

## 2. Labels and AND/OR

- Question: without headers, how does a user know what a checkbox belongs to? Decision: every label stands alone and includes the facet name (for example "Context window: 100k–500k tokens").
- Whether the AND/OR combination is intuitive was left to be judged in alpha testing.

## 3. Refinement levels

- Finer detail overrides the parent: a sub-facet is ANDed with its parent, and only the deepest checked level governs that facet.
- A child level is built from the union of all checked parents (one combined level, not one per parent).

## 4. Meta-facet and ontology

- One controller per dimension (a meta-facet), rather than ad hoc boxes. The assistant proposed the ontology of dimensions.

## 5. Unchecking parents and the taxonomy

- When a parent is unchecked, a child stays checked if any remaining checked parent still covers it; unchecked siblings regenerate from the new union.
- The job/category taxonomy was discussed; the result is the eleven-group Job taxonomy in SPEC.md.

## 6. All/Any frame

- For multi-valued facets with several checked siblings, a grouping frame offers "All of these" or "Any of these". Default: All.

## 7. Sibling rearranging

- Moving checked siblings together could be jarring; deferred to alpha evaluation. (The implementation animates boxes into the frame.)

## 8. Table and sorting

- Results go in a table with sortable column headers and one column per numeric dimension. Unrated values always sort last.

## 9. Hover for categorical tags

- Hovering a row shows its categorical tags in a popup.

## 10. Benchmarks

- Public benchmarks are combined by converting each to a percentile and averaging. Unrated models are kept and marked as unrated, never dropped or given invented scores.

## 11. Pricing

- Input and output prices are separate dimensions.
- The filter uses the median (midpoint) of all provider quotes.
- The data is too thin for skew handling, so a Comments column names the cheapest and most expensive provider instead.

## 12. Data scope

- Data is grabbed only once, as a static snapshot.
- Scope evolved: first the top 200 most downloaded models; then the top 50 of each Hugging Face type, plus all frontier models, plus all OpenRouter models. Start with six model types (text generation, embeddings, vision, text-to-image, speech-to-text, text-to-speech). The snapshot ended at 703 models dated 2026-10-14.

## 13. Model type selector

- Model type is an exclusive radio group including "All types".
- Selections in dimensions hidden by the chosen type are preserved and restored when switching back.

## 14. Numeric splits

- Rob preferred equal-count subranges. The assistant explained roaring bitmaps and realistic limits on how finely counts can be computed.
- Decision: quantile splits rounded to nice numbers; rough equality is acceptable; minimum 6 models per range (no refinement below that).

## 15. Counts

- Rob liked a count on every option. Zero-count options were first greyed out, later changed to hidden, except when checked (so they can be unchecked).

## 16. Dimension order

- The assistant picks the dimension order. Keep all dimensions.

## 17. Architecture

- A static app, with the data source decoupled behind a query interface so a database can come later. The spec was written first, then the app was built.

## 18. Blank page

- Rob saw a blank page after opening index.html inside a zip. Solved with a single-file dist build (dist/model-filter.html) that embeds everything and works from file://.

## 19. Repository and pushes

- Repository rowama/model_filter. Pushes go through Rob's Windows clone at D:\rob\projects\model_filter.
- GitHub push protection flagged a stranger's Hugging Face token inside raw/community/github (downloaded community content). That folder was untracked and gitignored.

## 20. Filling unrated values

- Parameter counts: no credible estimates exist for closed models, so none are set.
- Community reports: Reddit returned 403; X and GitHub were used.
- Community or anecdotal job tags get an asterisk, with source links in the hover, and never affect benchmark scores. Only manually reviewed first-person reports reach the catalog (11 tags on 5 models).

## 21. Hover dwell problem

- The row popup was hard to reach because it kept switching rows. Fixed with a shared hover module: 300 ms dwell, intent toward the popup (safe triangle), lock while inside, 200 ms grace on leaving, Escape closes.

## 22. Agenda item 1: facet hover popups

- Item 1 was originally sort orders; it was replaced by facet hover popups in the filter panel. The panel shows facet names; the popup holds the checkbox levels; results update live; checked items drop into the panel and reopen the popup at depth when hovered.
- Input and output cost became two separate top-level facets. Each range dimension is its own top-level facet with its ranges in the popup.

## 23. Available from

- Added an "Available from" provider facet. The assistant proposed the structure (Direct from maker, Aggregators, Cloud platforms, Self-host, with individual providers beneath) and Rob approved.

## 24. Row highlight and Find it here

- The hovered row gets a grey background and bold name while its popup is open.
- The row popup gained a "Find it here" expandable list of verified provider links. Links are only kept if a real fetch returned HTTP 200.

## 25. Agenda item 2: YAML config

- A declarative YAML config fully decouples the front end: facets, type selector, columns, popups and a dataset pointer (local JSON or CSV for now).
- A books example was added to prove genericity. The model data file is data/catalog.json, described by models.yaml.

## 26. Header alignment

- Cosmetic fix: column headers align like their cells, with the sort arrow on the left of right-aligned headers.

## 27. Hamburger menu

- Added a menu to load a new YAML (file picker or drag and drop), open by path over http, reload, load the embedded default, and a Recent list of up to 5.

## 28. Persistence

- Filters persist per dataset between switches. Rob was fine with cookies; the assistant used localStorage keyed by the config title plus the dataset path. A Clear filters menu item was added.
- Known quirk: switching type rebuilds numeric sub-ranges, so a sub-range picked under another type can be lost.

## 29. Pending: agenda item 3

- An AI utility agent harness to guide creating a subject-matter database in the same way: gather the list of items, then flesh out the filterable dimensions. Not started.

## 30. Known data gaps at handoff

- Sparse max output, structured JSON and language data.
- Some closed models remain unpriced: Gemini Embedding 001, Imagen 4, Cohere Embed v4, ElevenLabs Multilingual v2, Midjourney.
- Recent file handles have not been verified in real Chrome.
