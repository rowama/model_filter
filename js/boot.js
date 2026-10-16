// Config acquisition: embedded default (dist) | ?config=path.yaml over http(s) | file picker / drag-and-drop (file://).
(function () {
  const R = MF_RUNTIME, $ = s => document.querySelector(s), esc = R.esc;
  const loader = $('#loader'), errBox = $('#errors'), need = $('#need');
  function showErrors(title, msgs) {
    loader.hidden = false; errBox.hidden = false;
    errBox.innerHTML = `<b>${esc(title)}</b><ul>${msgs.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`;
  }
  async function start(cfgText, cfgPath, reader) {
    try {
      const spec = await R.load(cfgText, cfgPath, reader);
      loader.hidden = true; errBox.hidden = true; MF_UI.mount(spec);
    } catch (e) {
      if (e instanceof R.MissingFile) return askFor(e.path);
      showErrors(e instanceof R.ConfigError ? 'Config problem — fix the YAML and reload:' : 'Could not start:', e.messages || [String(e && e.message || e)]);
      if (!(e instanceof R.ConfigError)) console.warn(e);
    }
  }
  // ---- picker state (file://) ----
  const files = new Map(); let cfgKey = null;
  const base = p => p.split('/').pop();
  function find(p) {
    if (files.has(p)) return files.get(p);
    const b = base(p), hits = [...files.keys()].filter(k => base(k) === b);
    return hits.length ? files.get(hits[0]) : null;
  }
  const readFile = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(f); });
  const pickReader = async p => { const f = find(p); if (!f) throw new R.MissingFile(p); return readFile(f); };
  function askFor(path) {
    loader.hidden = false; need.hidden = false;
    need.innerHTML = `The config <code>${esc(cfgKey || '')}</code> also needs <code>${esc(path)}</code>. Select that file (several files or the whole folder at once is fine).`;
  }
  async function addFiles(list) {
    for (const [rel, f] of list) files.set(rel, f);
    errBox.hidden = true;
    if (!cfgKey) {
      const ys = [...files.keys()].filter(k => /\.ya?ml$/i.test(k)); const cands = [];
      for (const k of ys) { const t = await readFile(files.get(k)); if (/^version:\s*1\b/m.test(t) && /^dataset:/m.test(t)) cands.push(k); }
      if (!cands.length) { need.hidden = false; need.innerHTML = ys.length ? 'None of the selected YAML files is an app config (needs <code>version: 1</code> and <code>dataset:</code>).' : 'Select the app config YAML first (you can select it together with its dataset, or pick the folder).'; return; }
      if (cands.length > 1) {
        need.hidden = false; need.innerHTML = 'Several configs found — choose one: ' + cands.map(k => `<button type="button" data-cfg="${esc(k)}">${esc(k)}</button>`).join(' ');
        need.querySelectorAll('button').forEach(b => b.onclick = () => { cfgKey = b.dataset.cfg; go(); }); return;
      }
      cfgKey = cands[0];
    }
    go();
  }
  async function go() { need.hidden = true; start(await readFile(files.get(cfgKey)), cfgKey, pickReader); }
  const relOf = f => f.webkitRelativePath || f.name;
  $('#pick-files').onchange = e => addFiles([...e.target.files].map(f => [relOf(f), f]));
  $('#pick-folder').onchange = e => addFiles([...e.target.files].map(f => [relOf(f), f]));
  const drop = $('#drop');
  const walk = (entry, pre) => new Promise(res => {
    if (entry.isFile) entry.file(f => res([[pre + f.name, f]]), () => res([]));
    else { const rd = entry.createReader(), all = []; const next = () => rd.readEntries(async es => { if (!es.length) { const sub = await Promise.all(all.map(x => walk(x, pre + entry.name + '/'))); res(sub.flat()); } else { all.push(...es); next(); } }); next(); }
  });
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = async e => {
    e.preventDefault(); drop.classList.remove('over');
    const items = [...(e.dataTransfer.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    addFiles(items.length ? (await Promise.all(items.map(x => walk(x, '')))).flat() : [...e.dataTransfer.files].map(f => [f.name, f]));
  };
  $('#reset').onclick = () => { files.clear(); cfgKey = null; need.hidden = true; errBox.hidden = true; };
  window.MF_BOOT = { addFiles, start, files };

  // ---- choose source ----
  const params = new URLSearchParams(location.search), cfgParam = params.get('config');
  const E = window.MF_EMBED;
  const http = /^https?:$/.test(location.protocol);
  if (E && !(cfgParam && http)) {
    start(E.files[E.config], E.config, async p => { if (!(p in E.files)) throw new R.MissingFile(p); return E.files[p]; });
  } else if (http && (cfgParam || document.querySelector('meta[name=mf-default-config]'))) {
    const p = cfgParam || document.querySelector('meta[name=mf-default-config]').content;
    const get = async q => { const r = await fetch(q); if (!r.ok) throw new R.ConfigError([`Could not load ${q} (HTTP ${r.status})`]); return r.text(); };
    get(p).then(t => start(t, p, get), e => showErrors('Config problem:', e.messages || [e.message]));
  } else {
    loader.hidden = false;
    if (cfgParam) { need.hidden = false; need.innerHTML = `Opened from a local file, so the browser can't read <code>${esc(cfgParam)}</code> by itself. Select it (and its dataset) below, or pick the folder.`; }
  }
})();
