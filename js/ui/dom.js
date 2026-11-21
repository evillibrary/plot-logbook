// Tiny DOM builder: h("button.btn.primary", { onclick }, "Save")
export function h(tag, attrs = {}, ...children) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  if (attrs instanceof Node || typeof attrs === "string") { children.unshift(attrs); attrs = {}; }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k in el && k !== "list") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
export const clear = el => { el.replaceChildren(); return el; };

export function field(label, input) { return h("label.field", h("span", label), input); }

export const fmtDate = ts => ts ? ts.slice(0, 10) : "";
export const fmtWhen = ts => {
  if (!ts) return "";
  const d = new Date(ts), now = new Date();
  const days = Math.round((now - d) / 864e5);
  const t = ts.slice(11, 16);
  if (days === 0) return `today ${t}`;
  if (days === 1) return `yesterday ${t}`;
  if (days < 7) return `${days} days ago`;
  return ts.slice(0, 10);
};
export const today = () => { const d = new Date(); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

export function toast(msg, ms = 2500) {
  let t = document.getElementById("toast");
  if (!t) { t = h("div#toast", { style: { position: "fixed", left: "50%", bottom: "80px", transform: "translateX(-50%)", background: "#1e1f1a", color: "#fff", padding: "8px 14px", borderRadius: "10px", zIndex: 1000, fontSize: "14px", maxWidth: "90vw" } }); t.id = "toast"; document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, ms);
  return t;
}

// The grip on a bottom sheet is a real handle: drag it down to dismiss, or just tap it.
// It looked like one long before it was one, and people kept pulling on it and giving up.
// Hidden by CSS in the desktop side-panel layout, where pulling down means nothing.
// With { peek: true } (the feature sheet) it does not close but drops down to its top bar, so
// the map can be seen with whatever is picked out still picked out: a tap on the grip, or a pull
// up, brings it back; pulled down again from there, it closes. The × closes it either way.
export const PEEK = 84;                                   // px of a dropped sheet left showing
export function dragSheet(el, onClose, { peek = false } = {}) {
  const grip = el.querySelector(".grip");
  if (!grip) return;
  let id = null, startY = 0, dy = 0, t0 = 0, was = false;
  const release = () => { el.classList.remove("dragging"); el.style.transform = ""; };
  grip.addEventListener("pointerdown", e => {
    if (id !== null) return;
    id = e.pointerId; startY = e.clientY; dy = 0; t0 = e.timeStamp; was = el.classList.contains("peek");
    grip.setPointerCapture(id);
    el.classList.add("dragging");
  });
  grip.addEventListener("pointermove", e => {
    if (e.pointerId !== id) return;
    dy = was ? e.clientY - startY : Math.max(0, e.clientY - startY);     // down only, unless dropped; up would tear it off the bottom
    el.style.transform = was ? `translateY(calc(100% - ${PEEK}px + ${dy}px))` : `translateY(${dy}px)`;
  });
  grip.addEventListener("pointerup", e => {
    if (e.pointerId !== id) return;
    id = null;
    const flicked = dy > 12 && e.timeStamp - t0 < 300, tapped = Math.abs(dy) < 4;
    release();                                            // same task as the close, so it animates on from here
    if (!peek) { if (dy > 70 || flicked || tapped) onClose(); return; }
    if (was) { if (dy > 40) onClose(); else if (tapped || dy < -30) el.classList.remove("peek"); return; }
    if (dy > 70 || flicked || tapped) { el.classList.add("peek"); el.scrollTop = 0; }
  });
  grip.addEventListener("pointercancel", e => { if (e.pointerId === id) { id = null; release(); } });
}

// Drawn icons, 24-unit grid, stroked in the text colour (css/design.css sizes them as .i). The same
// set is written into index.html for the tabs, the map buttons and the drawing bars. Decorative:
// every button that has one keeps its words, or an aria-label where it is icon-only.
export const ICON = {
  map: '<path d="M9 4.5 3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8z"/><path d="M9 4.5v12.7M15 6.8v12.7"/>',
  jobs: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="m8.4 12.3 2.5 2.5 4.8-5.3"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="3.5"/>',
  water: '<path d="M12 3.6c3.3 4 5.6 7.1 5.6 10.2a5.6 5.6 0 0 1-11.2 0c0-3.1 2.3-6.2 5.6-10.2z"/><path d="M9.4 14.6a2.8 2.8 0 0 0 2.4 2.5"/>',
  photos: '<path d="M3.8 8.6A1.6 1.6 0 0 1 5.4 7h2.4l1.6-2.3h5.2L16.2 7h2.4a1.6 1.6 0 0 1 1.6 1.6v8.8a1.6 1.6 0 0 1-1.6 1.6H5.4a1.6 1.6 0 0 1-1.6-1.6z"/><circle cx="12" cy="12.6" r="3.3"/>',
  more: '<circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.3"/><path d="m15.3 15.3 5.2 5.2"/>',
  locate: '<circle cx="12" cy="12" r="6.3"/><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/><path d="M12 2.6v3.1M12 18.3v3.1M2.6 12h3.1M18.3 12h3.1"/>',
  board: '<path d="M4.5 19.5 5.6 15 15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L9 18.4z"/><path d="m14 6.6 3.4 3.4"/><path d="M13.5 20.5h6.5"/>',
  edit: '<path d="M4.5 19.5 5.6 15 15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L9 18.4z"/><path d="m14 6.6 3.4 3.4"/>',
  layers: '<path d="m12 3.8 8.3 4.4-8.3 4.4-8.3-4.4z"/><path d="m3.7 12.2 8.3 4.4 8.3-4.4"/><path d="m3.7 16 8.3 4.4 8.3-4.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  undo: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>',
  redo: '<path d="m15 14 4.5-4.5L15 5"/><path d="M19.5 9.5H10a5.5 5.5 0 0 0 0 11h3"/>',
  remove: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
  swap: '<path d="M4.5 8.5h14.5M15.5 5l3.5 3.5-3.5 3.5"/><path d="M19.5 15.5H5M8.5 12 5 15.5 8.5 19"/>',
  swapV: '<path d="M8.5 19.5V5M5 8.5 8.5 5 12 8.5"/><path d="M15.5 4.5v14.5M12 15.5l3.5 3.5 3.5-3.5"/>',
  grid: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M12 4v16M4 12h16"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  move: '<path d="M12 3.5v17M3.5 12h17"/><path d="m9 6.5 3-3 3 3M9 17.5l3 3 3-3M6.5 9l-3 3 3 3M17.5 9l3 3-3 3"/>',
  planned: '<circle cx="12" cy="12" r="7.5" stroke-dasharray="3.1 3.2"/>',
  retire: '<path d="M12 5.5 5 13.5h14z"/><path d="M5 18.5h14"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7"/><path d="m6.5 7 1 12.5h9l1-12.5"/><path d="M10 11v5M14 11v5"/>',
  measure: '<path d="M4.5 19.5v-15l15 15z"/><path d="M8.5 15.5v-4.2l4.2 4.2z"/>',
  repeat: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.2v4.3h-4.3"/>',
  divide: '<path d="M5 12h14"/><circle cx="12" cy="6.3" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="17.7" r="1.5" fill="currentColor" stroke="none"/>',
};
export const iconMarkup = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
export function icon(name) {
  const t = document.createElement("template");
  t.innerHTML = iconMarkup(name);
  return t.content.firstChild;
}
