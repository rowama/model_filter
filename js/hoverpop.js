// Generic robust hover popover: anchored, dwell-to-retarget, safe-triangle intent, lock-on-enter, grace on leave, Esc, viewport clamp.
// Targets are identified by KEY (data attribute), so the host may re-render its DOM while the popover stays attached.
(function (root) {
  function createHoverPopover(o) {
    const { pop, container, selector, keyOf, render, anchor, onOpen, onClose, DWELL = 300, GRACE = 200 } = o;
    const ac = new AbortController(), sig = { signal: ac.signal }; // destroy() removes every listener
    let curKey = null, locked = false, dwellT = null, hideT = null, pendingKey = null, leavePt = null, lastPt = null;
    const targetAt = (x, y) => { const el = document.elementFromPoint(x, y); const t = el && el.closest ? el.closest(selector) : null; return t && container.contains(t) ? t : null; };
    const elFor = k => [...container.querySelectorAll(selector)].find(e => keyOf(e) === k);
    function clamp() {
      const ph = pop.offsetHeight, pw = pop.offsetWidth;
      const t = parseFloat(pop.style.top) || 8, l = parseFloat(pop.style.left) || 8;
      pop.style.top = Math.max(8, Math.min(t, innerHeight - ph - 8)) + 'px';
      pop.style.left = Math.max(8, Math.min(l, innerWidth - pw - 8)) + 'px';
    }
    function place(el, x) {
      const r = el.getBoundingClientRect(), pw = pop.offsetWidth;
      let left = anchor ? anchor(el, x) : x + 24;
      if (left + pw > innerWidth - 8) left = Math.max(8, x - 24 - pw);
      pop.style.left = left + 'px'; pop.style.top = r.top + 'px'; clamp();
    }
    function open(el, x) {
      clearTimeout(hideT); clearTimeout(dwellT); pendingKey = null; curKey = keyOf(el);
      render(curKey, pop); pop.hidden = false; pop.dataset.key = curKey; place(el, x); onOpen && onOpen(curKey);
    }
    function close() {
      if (pop.hidden && curKey === null) return;
      clearTimeout(hideT); clearTimeout(dwellT); pop.hidden = true; const k = curKey; curKey = null; locked = false; pendingKey = null; leavePt = null;
      onClose && onClose(k);
    }
    function refresh() { if (curKey !== null && !pop.hidden) { render(curKey, pop); clamp(); } }
    const sign = (p, a, b) => (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
    function towardPop(p) {
      if (!leavePt || pop.hidden) return false;
      const r = pop.getBoundingClientRect(), ex = leavePt.x <= r.left ? r.left : r.right;
      const A = leavePt, B = { x: ex, y: r.top - 10 }, C = { x: ex, y: r.bottom + 10 };
      const d1 = sign(p, A, B), d2 = sign(p, B, C), d3 = sign(p, C, A);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    }
    function armDwell(k) {
      pendingKey = k; clearTimeout(dwellT);
      dwellT = setTimeout(() => { if (locked || !lastPt) return; const t = targetAt(lastPt.x, lastPt.y); if (t && keyOf(t) === k) open(t, lastPt.x); }, DWELL);
    }
    container.addEventListener('mousemove', e => {
      const p = { x: e.clientX, y: e.clientY }; const t = e.target.closest(selector); lastPt = p;
      if (!t || !container.contains(t) || locked) return;
      clearTimeout(hideT); const k = keyOf(t);
      if (pop.hidden) { open(t, p.x); return; }
      if (k === curKey) { leavePt = p; clearTimeout(dwellT); pendingKey = null; return; }
      if (towardPop(p)) { armDwell(k); return; }
      if (k !== pendingKey) armDwell(k);
    }, sig);
    container.addEventListener('mouseleave', () => { if (!locked) { clearTimeout(hideT); hideT = setTimeout(() => { if (!locked) close(); }, GRACE); } }, sig);
    pop.addEventListener('mouseenter', () => { locked = true; clearTimeout(hideT); clearTimeout(dwellT); pendingKey = null; }, sig);
    pop.addEventListener('mouseleave', e => {
      locked = false; leavePt = null; clearTimeout(hideT);
      lastPt = { x: e.clientX, y: e.clientY }; const t = targetAt(e.clientX, e.clientY);
      if (t && keyOf(t) === curKey) return;
      if (t) armDwell(keyOf(t));
      hideT = setTimeout(() => { if (!locked && !(lastPt && targetAt(lastPt.x, lastPt.y))) close(); }, GRACE);
    }, sig);
    pop.addEventListener('toggle', clamp, { capture: true, signal: ac.signal });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) close(); }, sig);
    return { open: (k, x) => { const el = elFor(k); if (el) open(el, x || el.getBoundingClientRect().right); }, close, refresh, clamp,
      isOpen: () => !pop.hidden, key: () => curKey, isLocked: () => locked,
      destroy: () => { clearTimeout(dwellT); clearTimeout(hideT); ac.abort(); pop.hidden = true; curKey = null; locked = false; } };
  }
  root.MF_HOVERPOP = { createHoverPopover };
})(typeof window !== 'undefined' ? window : globalThis);
