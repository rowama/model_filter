# Model Filter
Open `index.html` directly, or run `npx serve .` and browse to the printed URL. Requirements are in SPEC.md.
- Rebuild data: `python3 scripts/build_data.py` (needs `raw/` and pyyaml)
- Tests: `node tests/engine.test.js`
- UI test: `NODE_PATH=/path/to/node_modules node tests/ui.test.js` (needs playwright)
