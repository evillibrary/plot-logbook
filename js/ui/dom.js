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
export function dragSheet(el, onClose) {
  const grip = el.querySelector(".grip");
  if (!grip) return;
  let id = null, startY = 0, dy = 0, t0 = 0;
  const release = () => { el.classList.remove("dragging"); el.style.transform = ""; };
  grip.addEventListener("pointerdown", e => {
    if (id !== null) return;
    id = e.pointerId; startY = e.clientY; dy = 0; t0 = e.timeStamp;
    grip.setPointerCapture(id);
    el.classList.add("dragging");
  });
  grip.addEventListener("pointermove", e => {
    if (e.pointerId !== id) return;
    dy = Math.max(0, e.clientY - startY);                 // down only; up would tear it off the bottom
    el.style.transform = `translateY(${dy}px)`;
  });
  grip.addEventListener("pointerup", e => {
    if (e.pointerId !== id) return;
    id = null;
    const flicked = dy > 12 && e.timeStamp - t0 < 300, tapped = dy < 4;
    release();                                            // same task as the close, so it animates on from here
    if (dy > 70 || flicked || tapped) onClose();
  });
  grip.addEventListener("pointercancel", e => { if (e.pointerId === id) { id = null; release(); } });
}
