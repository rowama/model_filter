// Config acquisition + hamburger menu.
// Sources: embedded default (dist) | ?config=path.yaml over http(s) | file picker / folder / drag-and-drop (any protocol)
// | File System Access handles (Chrome) remembered in IndexedDB. A new config is fully loaded and validated BEFORE it
// replaces the running one, so a failed load leaves the current config untouched.
(function () {
  const R = MF_RUNTIME, $ = s => document.querySelector(s), esc = R.esc;
  const loader = $('#loader'), errBox = $('#errors'), need = $('#need');
  const http = /^https?:$/.test(location.protocol), E = window.MF_EMBED;
  const running = () => !!(window.MF_APP && window.MF_APP.ready);
  let current = null; // {kind:'embed'|'path'|'files', path, title, reopen()}

  // ---------- loader dialog ----------
  function openLoader(msg) {
    loader.hidden = false; loader.classList.toggle('overlay', running()); $('#loader-close').hidden = !running();
    $('#path-form').hidden = !http;
    if (msg) { need.hidden = false; need.innerHTML = msg; }
    (http ? $('#path-input') : $('#pick-files-btn')).focus();
  }
  function closeLoader() { loader.hidden = true; errBox.hidden = true; need.hidden = true; }
  function showErrors(title, msgs) {
    openLoader(); errBox.hidden = false;
    errBox.innerHTML = `<b>${esc(title)}</b>${running() ? ' <i>(the current config is still loaded)</i>' : ''}<ul>${msgs.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`;
  }
  async function start(cfgText, cfgPath, reader, source) {
    try {
      const spec = await R.load(cfgText, cfgPath, reader);   // throws before touching the running app
      closeLoader(); MF_UI.mount(spec);
      current = Object.assign({ title: spec.title }, source);
      if (source.kind === 'path' && http) { const u = new URL(location.href); u.searchParams.set('config', source.path); history.replaceState(null, '', u); }
      if (source.kind !== 'embed') addRecent({ kind: source.kind, path: source.path, title: spec.title, handleId: source.handleId || null });
      renderMenu(); return true;
    } catch (e) {
      if (e instanceof R.MissingFile) { askFor(e.path); return false; }
      showErrors(e instanceof R.ConfigError ? 'Config problem — fix the YAML and try again:' : 'Could not load:', e.messages || [String(e && e.message || e)]);
      if (!(e instanceof R.ConfigError)) console.warn(e);
      return false;
    }
  }
  const fetchText = async q => { const r = await fetch(q, { cache: 'no-store' }); if (!r.ok) throw new R.ConfigError([`Could not load ${q} (HTTP ${r.status})`]); return r.text(); };
  async function loadPath(p) {
    try { const t = await fetchText(p); return start(t, p, fetchText, { kind: 'path', path: p }); }
    catch (e) { showErrors('Config problem:', e.messages || [e.message]); return false; }
  }
  const loadEmbed = () => start(E.files[E.config], E.config, async p => { if (!(p in E.files)) throw new R.MissingFile(p); return E.files[p]; }, { kind: 'embed', path: E.config });

  // ---------- picked files (input / folder / drop / FS Access) ----------
  let files = new Map(), cfgKey = null, handleId = null;
  const base = p => p.split('/').pop();
  function find(p) { if (files.has(p)) return files.get(p); const hits = [...files.keys()].filter(k => base(k) === base(p)); return hits.length ? files.get(hits[0]) : null; }
  const readFile = f => (f.text ? f.text() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(f); }));
  const pickReader = async p => { const f = find(p); if (!f) throw new R.MissingFile(p); return readFile(f); };
  function resetPick() { files = new Map(); cfgKey = null; handleId = null; need.hidden = true; errBox.hidden = true; }
  function askFor(path) {
    openLoader(`The config <code>${esc(cfgKey || '')}</code> also needs <code>${esc(path)}</code>. Select that file (several files or the whole folder at once is fine).`);
  }
  async function addFiles(list, hid) {
    for (const [rel, f] of list) files.set(rel, f);
    if (hid) handleId = hid;
    errBox.hidden = true;
    if (!cfgKey) {
      const ys = [...files.keys()].filter(k => /\.ya?ml$/i.test(k)); const cands = [];
      for (const k of ys) { const t = await readFile(files.get(k)); if (/^version:\s*1\b/m.test(t) && /^dataset:/m.test(t)) cands.push(k); }
      if (!cands.length) { openLoader(ys.length ? 'None of the selected YAML files is an app config (needs <code>version: 1</code> and <code>dataset:</code>).' : 'Select the app config YAML first (you can select it together with its dataset, or pick the folder).'); return; }
      if (cands.length > 1) {
        openLoader('Several configs found — choose one: ' + cands.map(k => `<button type="button" data-cfg="${esc(k)}">${esc(k)}</button>`).join(' '));
        need.querySelectorAll('button').forEach(b => b.onclick = () => { cfgKey = b.dataset.cfg; go(); }); return;
      }
      cfgKey = cands[0];
    }
    return go();
  }
  async function go() {
    need.hidden = true;
    const snap = { files: new Map(files), cfgKey, handleId };
    return start(await readFile(files.get(cfgKey)), cfgKey, pickReader, { kind: 'files', path: cfgKey, handleId,
      reopen: () => { files = new Map(snap.files); cfgKey = snap.cfgKey; handleId = snap.handleId; return go(); } });
  }
  const relOf = f => f.webkitRelativePath || f.name;
  $('#pick-files').onchange = e => { addFiles([...e.target.files].map(f => [relOf(f), f])); e.target.value = ''; };
  $('#pick-folder').onchange = e => { addFiles([...e.target.files].map(f => [relOf(f), f])); e.target.value = ''; };
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
  document.querySelectorAll('#drop label.btn').forEach(l => { l.tabIndex = 0; l.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); l.querySelector('input').click(); } }; });
  $('#reset').onclick = resetPick;
  $('#loader-close').onclick = closeLoader;
  $('#path-form').onsubmit = e => { e.preventDefault(); const p = $('#path-input').value.trim(); if (p) loadPath(p); };

  // ---------- File System Access (Chrome): remember handles in IndexedDB ----------
  const fsa = typeof window.showOpenFilePicker === 'function';
  const idb = () => new Promise((res, rej) => { const q = indexedDB.open('mf-handles', 1); q.onupgradeneeded = () => q.result.createObjectStore('h'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const idbOp = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('h', mode); const q = fn(tx.objectStore('h')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); };
  const putHandles = (id, v) => idbOp('readwrite', s => s.put(v, id)).catch(() => null);
  const getHandles = id => idbOp('readonly', s => s.get(id)).catch(() => null);
  async function filesFromHandles(v) {
    const out = [];
    const dirWalk = async (d, pre) => { for await (const [n, h] of d.entries()) { if (h.kind === 'file') out.push([pre + n, await h.getFile()]); else await dirWalk(h, pre + n + '/'); } };
    if (v.dir) await dirWalk(v.dir, v.dir.name + '/'); else for (const h of v.files) out.push([h.name, await h.getFile()]);
    return out;
  }
  async function permitted(v) { for (const h of v.dir ? [v.dir] : v.files) { if ((await h.queryPermission({ mode: 'read' })) !== 'granted' && (await h.requestPermission({ mode: 'read' })) !== 'granted') return false; } return true; }
  async function fsaPick(dir) {
    try {
      const v = dir ? { dir: await showDirectoryPicker({ mode: 'read' }) } : { files: await showOpenFilePicker({ multiple: true }) };
      const id = 'h' + Date.now(); await putHandles(id, v); resetPick(); addFiles(await filesFromHandles(v), id);
    } catch (e) { if (e.name !== 'AbortError') showErrors('Could not open files:', [e.message]); }
  }
  $('#fsa-files').hidden = $('#fsa-folder').hidden = !fsa;
  $('#fsa-files').onclick = () => fsaPick(false); $('#fsa-folder').onclick = () => fsaPick(true);

  // ---------- recent (localStorage, max 5) ----------
  const RK = 'mf-recent';
  const recent = () => { try { return JSON.parse(localStorage.getItem(RK)) || []; } catch { return []; } };
  function addRecent(r) {
    const key = x => x.kind + '|' + x.path + '|' + (x.kind === 'files' ? (x.handleId ? 'h' : location.pathname) : location.pathname);
    const list = [r, ...recent().filter(x => key(x) !== key(r))].slice(0, 5);
    try { localStorage.setItem(RK, JSON.stringify(list)); } catch { }
  }
  async function openRecent(r) {
    closeMenu();
    if (r.kind === 'path') { if (http) return loadPath(r.path); return openLoader(`<b>${esc(r.path)}</b> was opened by path over http. This page is a local file, so re-pick it (with its dataset) below.`); }
    if (r.handleId && fsa) {
      const v = await getHandles(r.handleId);
      if (v) { try { if (await permitted(v)) { resetPick(); return addFiles(await filesFromHandles(v), r.handleId); } } catch (e) { return showErrors('Could not reopen:', [e.message]); } }
    }
    resetPick(); openLoader(`Re-pick <b>${esc(r.path)}</b> (“${esc(r.title || '')}”) together with its dataset, or its folder. The browser doesn't allow reopening local files without asking${fsa ? ' (use “Open with file access” to make it reopenable)' : ''}.`);
  }

  // ---------- hamburger menu ----------
  const btn = $('#menu-btn'), menu = $('#menu');
  function renderMenu() {
    const rs = recent();
    const item = (act, label, extra = '') => `<li role="none"><button type="button" role="menuitem" data-act="${act}" ${extra}>${label}</button></li>`;
    menu.innerHTML = item('load', 'Load YAML…') + (http ? item('path', 'Open by path…') : '') +
      item('reload', 'Reload current', current ? '' : 'disabled') + item('clear', 'Clear filters', running() ? '' : 'disabled') + (E ? item('default', 'Load default (embedded)') : '') +
      `<li role="separator" class="sep">Recent</li>` +
      (rs.length ? rs.map((r, i) => item('recent', `${esc(r.title || r.path)} <span class="rp">${esc(r.kind === 'path' ? r.path : r.path + (r.handleId && fsa ? ' (file access)' : ' (re-pick)'))}</span>`, `data-i="${i}"`)).join('') : '<li role="none" class="none">none yet</li>');
  }
  const items = () => [...menu.querySelectorAll('[role=menuitem]:not([disabled])')];
  function openMenu(focusFirst = true) { renderMenu(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); if (focusFirst) items()[0].focus(); }
  function closeMenu(refocus) { if (menu.hidden) return; menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus(); }
  btn.onclick = () => menu.hidden ? openMenu() : closeMenu();
  btn.onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); openMenu(); } };
  menu.onkeydown = e => {
    const it = items(), i = it.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); it[(i + 1) % it.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); it[(i - 1 + it.length) % it.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); it[0].focus(); } else if (e.key === 'End') { e.preventDefault(); it[it.length - 1].focus(); }
    else if (e.key === 'Tab') closeMenu();
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!menu.hidden) closeMenu(true); else if (!loader.hidden && running()) closeLoader(); } });
  document.addEventListener('mousedown', e => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) closeMenu(); });
  menu.onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return; const act = b.dataset.act; closeMenu();
    if (act === 'load') { resetPick(); openLoader(); }
    else if (act === 'path') { resetPick(); openLoader(); $('#path-input').value = current && current.kind === 'path' ? current.path : ''; $('#path-input').focus(); }
    else if (act === 'reload') reloadCurrent();
    else if (act === 'clear') window.MF_APP && MF_APP.clear();
    else if (act === 'default') loadEmbed();
    else if (act === 'recent') openRecent(recent()[+b.dataset.i]);
  };
  function reloadCurrent() {
    if (!current) return;
    if (current.kind === 'path') return loadPath(current.path);
    if (current.kind === 'embed') return loadEmbed();
    return current.reopen().catch(e => showErrors('Could not reload (re-pick the files):', [e.message]));
  }
  window.MF_BOOT = { addFiles, start, loadPath, reloadCurrent, openRecent, recent, current: () => current, get files() { return files; } };
  renderMenu();

  // ---------- initial source ----------
  const params = new URLSearchParams(location.search), cfgParam = params.get('config');
  const meta = document.querySelector('meta[name=mf-default-config]');
  if (E && !(cfgParam && http)) loadEmbed();
  else if (http && (cfgParam || meta)) loadPath(cfgParam || meta.content);
  else openLoader(cfgParam ? `Opened from a local file, so the browser can't read <code>${esc(cfgParam)}</code> by itself. Select it (and its dataset) below, or pick the folder.` : '');
})();
