// The Jobs, Water and Photos tabs.
import { h, clear, fmtWhen, today } from "./dom.js";
import { jobForm, waterForm, photoForm, observeForm } from "./forms.js";
import * as photos from "../photos.js";

const fname = (app, id) => app.state.features.get(id)?.name ?? "";

export function renderJobs(app) {
  const el = clear(document.getElementById("jobs-view"));
  const t = today();
  const jobs = [...app.state.jobs.values()];
  const open = jobs.filter(j => !j.done).sort((a, b) => (a.due ?? "9") < (b.due ?? "9") ? -1 : 1);
  const done = jobs.filter(j => j.done).sort((a, b) => a.done < b.done ? 1 : -1).slice(0, 20);
  const groups = [["Overdue", open.filter(j => j.due && j.due < t)], ["Today", open.filter(j => j.due === t)], ["Upcoming", open.filter(j => !j.due || j.due > t)]];
  const row = j => h("div.card.job" + (j.due && j.due < t && !j.done ? ".overdue" : ""),
    h("input", { type: "checkbox", checked: !!j.done, onchange: async ev => { if (ev.target.checked) await app.record({ op: "job.done", job: j.id }); else await app.record({ op: "job.edit", job: j.id, changes: { done: null } }); } }),
    h("div", { style: { flex: 1 } },
      h("div", j.title, j.repeat ? h("span.chip", { style: { marginLeft: "6px" } }, "↻") : null),
      h("div.due", [j.due ? `due ${j.due}` : "no date", j.feature ? ` · ${fname(app, j.feature)}` : "", j.history.length ? ` · done ${j.history.length}×` : ""].join("")),
      j.notes && h("div.note", j.notes)),
    j.feature && h("button.btn", { onclick: () => app.goTo(j.feature) }, "📍"),
    h("button.btn", { onclick: () => app.showForm(jobForm(app, null, j), el) }, "✎"));
  el.append(h("h1", "Jobs"), h("div.row", h("button.btn.primary", { onclick: () => app.showForm(jobForm(app, null), el) }, "+ New job")));
  let any = false;
  for (const [title, list] of groups) if (list.length) { any = true; el.append(h("h3", title), ...list.map(row)); }
  if (!any) el.append(h("p.empty", "No open jobs."));
  if (done.length) el.append(h("h3", "Done"), ...done.map(row));
}

export function renderWater(app) {
  const el = clear(document.getElementById("water-view"));
  const rows = [...app.state.water].sort((a, b) => (b.at ?? b.ts).localeCompare(a.at ?? a.ts));
  el.append(h("h1", "Water"), h("div.row", h("button.btn.primary", { onclick: () => app.showForm(waterForm(app), el) }, "+ Reading")));
  const bySource = new Map();
  for (const r of rows) (bySource.get(r.source) ?? bySource.set(r.source, []).get(r.source)).push(r);
  for (const [src, list] of bySource) {
    const latest = list[0], prev = list[1];
    const delta = prev && latest.unit === "m3" ? ` (+${(latest.value - prev.value).toFixed(2)} since ${prev.at?.slice(0, 10) ?? prev.ts.slice(0, 10)})` : "";
    el.append(h("div.card", h("h3", src.replace("_", " ")), h("div", `${latest.value} ${latest.unit}${delta}`), h("div.note", `${fmtWhen(latest.at ?? latest.ts)} · ${latest.by}${latest.note ? " · " + latest.note : ""}`), sparkline(list.slice(0, 30).reverse())));
  }
  if (!rows.length) el.append(h("p.empty", "No readings yet."));
  else el.append(h("h3", "All readings"), h("ul.timeline", ...rows.slice(0, 50).map(r => h("li", h("time", `${(r.at ?? r.ts).slice(0, 16).replace("T", " ")} · ${r.by}`), `${r.source.replace("_", " ")}: ${r.value} ${r.unit} ${r.note ?? ""}`))));
}

// A small inline SVG of readings over time; enough to see a trend, no library.
function sparkline(list) {
  if (list.length < 2) return null;
  const W = 280, H = 48, vals = list.map(r => r.value), min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = list.map((r, i) => `${(i / (list.length - 1)) * (W - 4) + 2},${H - 2 - ((r.value - min) / span) * (H - 4)}`).join(" ");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", "100%"); svg.setAttribute("height", H); svg.style.display = "block"; svg.style.marginTop = "6px";
  svg.innerHTML = `<polyline fill="none" stroke="#3f8fd8" stroke-width="2" points="${pts}"/>`;
  return svg;
}

export function renderPhotos(app) {
  const el = clear(document.getElementById("photos-view"));
  const all = [...app.state.photos.values()].sort((a, b) => (b.taken ?? b.ts).localeCompare(a.taken ?? a.ts));
  const filter = h("select", h("option", { value: "" }, "All features"), ...[...app.state.features.values()].filter(f => app.state.byFeature.get(f.id)?.some(e => e.kind === "photo")).map(f => h("option", { value: f.id }, f.name)));
  const grid = h("div.photo-grid");
  const draw = () => {
    clear(grid);
    const list = filter.value ? all.filter(p => p.feature === filter.value) : all;
    let lastMonth = "";
    for (const p of list) {
      const m = (p.taken ?? p.ts).slice(0, 7);
      if (m !== lastMonth) { grid.append(h("h3", { style: { gridColumn: "1 / -1", margin: "8px 0 0" } }, m)); lastMonth = m; }
      const img = h("img", { alt: p.caption ?? "", loading: "lazy", title: `${p.taken?.slice(0, 10)} ${fname(app, p.feature)} ${p.caption ?? ""}`, onclick: () => app.showPhoto(p) });
      photos.url(p.photo, p.file, app.source).then(u => { if (u) img.src = u; });
      grid.append(img);
    }
    if (!list.length) grid.append(h("p.empty", { style: { gridColumn: "1 / -1" } }, "No photos yet."));
  };
  filter.addEventListener("change", draw);
  el.append(h("h1", "Photos"), h("div.row", h("button.btn.primary", { onclick: () => app.showForm(photoForm(app, null), el) }, "📷 Add"), filter), grid);
  draw();
}

// Full-size photo viewer with details and a link to its feature.
export function photoViewer(app, p) {
  const img = h("img", { alt: p.caption ?? "", style: { maxWidth: "100%", maxHeight: "70vh", display: "block", margin: "0 auto", borderRadius: "8px", background: "#ddd" } });
  photos.url(p.photo, p.file, app.source, true).then(u => { if (u) img.src = u; else photos.url(p.photo, p.file, app.source).then(t => { if (t) img.src = t; }); });
  return h("div",
    h("h2", p.caption || fname(app, p.feature) || "Photo"),
    h("p.note", `${(p.taken ?? p.ts).replace("T", " ")} · ${p.by ?? ""}${p.feature ? " · " + fname(app, p.feature) : ""}${p.gps ? ` · GPS ${p.gps[0].toFixed(5)}, ${p.gps[1].toFixed(5)}` : ""}`),
    img,
    h("div.row", { style: { marginTop: "10px" } },
      p.feature && h("button.btn", { onclick: () => app.goTo(p.feature) }, "📍 On map"),
      h("button.btn", { onclick: () => { const c = prompt("Caption:", p.caption ?? ""); if (c !== null) app.record({ op: "photo.edit", photo: p.photo, changes: { caption: c } }).then(() => app.closeSheet()); } }, "✎ Caption"),
      !p.feature && h("button.btn", { onclick: () => { const sel = h("select", ...[...app.state.features.values()].map(f => h("option", { value: f.id }, f.name))); app.showForm(h("form", { onsubmit: async e => { e.preventDefault(); await app.record({ op: "photo.edit", photo: p.photo, changes: { feature: sel.value } }); app.closeSheet(); } }, h("h2", "Link photo to"), sel, h("div.row", h("button.btn.primary", { type: "submit" }, "Link")))); } }, "Link to feature"),
      h("button.btn", { onclick: () => app.closeSheet() }, "Close")));
}
