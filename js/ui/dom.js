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
