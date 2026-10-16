# Prompt: build Quick Filter

You are an AI coding agent. Build a web app called Quick Filter from the vision, features and requirements below. The complete functional requirements are in SPEC.md in this same folder; read it in full before you start. If this prompt and SPEC.md ever disagree, SPEC.md wins. You choose the technology, structure and internal design; you will be judged on whether the observable behaviour meets the requirements.

## 1. Vision

Quick Filter is a personal, generic faceted-filter tool. A user narrows a catalog of items down to the few that fit a need, using nothing but checkboxes. Picking an option within a facet broadens the result (OR); combining facets narrows it (AND); checking an option reveals finer options beneath it, and the finest level the user has checked decides the filter for that facet. Every option shows how many items it would match, so the user never runs into a dead end.

The app is completely generic: everything about the data (where it is, which facets exist, how ranges split, what the table shows, what the hover popups show, timings) comes from one human-editable declarative configuration file in YAML. Swapping the configuration and data turns it into a different filter app with no change to the app itself.

The flagship dataset is a catalog of AI models (text generation, embeddings, vision, image generation, speech-to-text, text-to-speech), so the user can choose models for a use case. A second, unrelated example dataset (a small fictional book catalog) proves the app is generic.

## 2. Hard requirements

- Static, serverless app. It must work when opened directly as a page from the local disk with no server, including as a single self-contained file that carries the default configuration and data inside it, and must also work when served over plain http.
- Data comes from local JSON or CSV files named by the configuration. The way the app queries data must be isolated so that a database backend could replace it later without changing the interface.
- Honest data: missing values are shown as "unrated" and are never invented. Unrated items are always kept, can be filtered on, and sort last.
- No submit button. Every change updates the results immediately.
- Filter selections persist per configuration across sessions and when switching between configurations, and can be cleared.

## 3. What to build

Follow SPEC.md for the details of each of these:

1. The filter panel with an exclusive type selector and a list of facets by name.
2. Facet hover popups holding the checkbox refinement levels, with counts, the All/Any grouping for multi-valued facets, and checked items listed back in the panel.
3. The filter semantics: OR within a level, AND across facets, refinement levels built from the union of checked parents, the deepest checked level governs, retention rules on uncheck, hidden-and-restored selections when the type changes.
4. Numeric range refinement that aims for roughly equal counts per range, rounded to nice boundaries, with a minimum number of items per range.
5. The results table with sortable columns and the row hover popup with a "Find it here" link list, details, anecdotal evidence and provenance.
6. Hover behaviour for all popups that lets the cursor travel into the popup without it jumping to another target.
7. A menu for loading and switching configurations, reloading, recent configurations and clearing filters.
8. Clear, location-specific error messages for bad configurations.
9. The AI-model sample dataset meeting the data requirements in SPEC.md (one-time snapshot, scope, prices, benchmark-based scores, community tags, providers, verified links).
10. The book example configuration and dataset.
11. Automated tests covering the filter logic, configuration validation, the popups and their timing, the menu and persistence.

## 4. Acceptance criteria

The configuration contract in Appendix A of SPEC.md is normative and must be followed exactly: exact key names, literal values, defaults and error rules, so that both shipped reference configurations load unchanged. The acceptance criteria are listed in SPEC.md section 16. In short: every behaviour described there is observable in the running app, both datasets load from their configurations alone, the single-file version opens from disk with no server, nothing in the data is fabricated, and the automated tests pass.

## 5. Working style with the user

Tell the user plainly what is wrong with an idea and guide him step by step. Ask one question per response and take one step at a time. Offer concrete proposals for him to approve, state trade-offs honestly, and defer subjective interface questions to alpha testing when he prefers. Never invent facts, and say clearly when data is missing. Do not publish or push anything on his behalf.
