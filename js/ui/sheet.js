// The feature sheet: what a tapped feature is, what has happened to it, and the actions.
// Also the searchable list of every feature (the way to reach pets and animals, which have no dot).
import { h, clear, fmtWhen, toast } from "./dom.js";
import { observeForm, photoForm, jobForm, waterForm, editForm, featureForm, liveFeatures } from "./forms.js";
import * as photos from "../photos.js";
import { CATEGORIES, CAT, catOf, iconSvg } from "../categories.js";
import { describeGeom } from "../geo.js";

const CONF_LABEL = { high: "position: high", medium: "position: medium", low: "position: low — check and move" };
const ico = (cat, size = 26) => { const d = h("span.ic"); d.innerHTML = iconSvg(cat, size); return d; };

export function renderFeature(app, f) {
  const body = clear(document.getElementById("feature-body"));
  const events = app.state.byFeature.get(f.id) ?? [];
  const cat = catOf(f);
  const chips = h("div.chips",
    h("span.chip", { style: { background: cat.color, color: "#fff" } }, cat.name),
    f.geom && f.geom.type !== "Point" && h("span.chip", describeGeom(f.geom)),
    f.geom?.type === "Point" && f.confidence && h(`span.chip.${{ high: "hi", medium: "md", low: "lo" }[f.confidence] ?? ""}`, CONF_LABEL[f.confidence] ?? f.confidence),
    f.origin === "app" && h("span.chip", `added ${f.since?.slice(0, 10)} by ${f.by ?? ""}`),
    f.retired && h("span.chip.lo", `retired ${f.retired.slice(0, 10)}`),
    f.deleted && h("span.chip.lo", `deleted ${f.deleted.slice(0, 10)}`));
  const strip = h("div.photo-strip");
  const photoItems = events.filter(e => e.kind === "photo");
  for (const e of photoItems.slice(0, 12)) {
    const img = h("img", { alt: e.item.caption || "", title: `${e.item.taken?.slice(0, 10)} ${e.item.caption ?? ""}`, onclick: () => app.showPhoto(e.item) });
    photos.url(e.item.photo, e.item.file, app.source).then(u => { if (u) img.src = u; });
    strip.append(img);
  }
  const timeline = h("ul.timeline", ...events.slice(0, 40).map(e => {
    const it = e.item;
    const text = e.kind === "observe" ? `${it.kind !== "note" ? `[${it.kind}] ` : ""}${it.text}${it.photos?.length ? ` 📷${it.photos.length}` : ""}`
      : e.kind === "photo" ? `📷 ${it.caption || "photo"}`
      : e.kind === "water" ? `💧 ${it.value} ${it.unit}${it.note ? " · " + it.note : ""}`
      : e.kind === "job" ? `☐ job: ${it.title}${it.due ? ` (due ${it.due})` : ""}`
      : e.kind === "job.done" ? `☑ done: ${it.title}` : "";
    return h("li", h("time", `${fmtWhen(e.ts)} · ${it.by ?? ""}`), text);
  }));
  const counts = { photos: photoItems.length, notes: events.filter(e => e.kind === "observe").length, jobs: events.filter(e => e.kind === "job").length, readings: events.filter(e => e.kind === "water").length };
  const attached = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing";

  const actions = f.deleted ? h("div.actions", h("button.primary", { onclick: async () => { await app.record({ op: "feature.undelete", feature: f.id }); toast("restored"); app.openSheet(app.state.features.get(f.id)); } }, "↩ Restore"))
    : h("div", h("div.actions",
        h("button.primary", { onclick: () => app.showForm(observeForm(app, f)) }, "✎ Note"),
        h("button", { onclick: () => app.showForm(photoForm(app, f)) }, "📷 Photo"),
        h("button", { onclick: () => app.showForm(jobForm(app, f)) }, "☑ Job"),
        f.type === "water" ? h("button", { onclick: () => app.showForm(waterForm(app, f)) }, "💧 Reading") : h("button", { onclick: () => app.showForm(editForm(app, f)) }, "✎ Edit")),
      h("div.actions",
        f.type === "water" && h("button", { onclick: () => app.showForm(editForm(app, f)) }, "✎ Edit"),
        f.geom?.type === "Point" && h("button", { onclick: () => app.startMove(f) }, "⤧ Move"),
        f.geom && f.geom.type !== "Point" && h("button", { onclick: () => app.startRedraw(f) }, "⤧ Redraw"),
        f.retired ? h("button", { onclick: async () => { await app.record({ op: "feature.unretire", feature: f.id }); app.openSheet(app.state.features.get(f.id)); } }, "↩ Unretire")
          : h("button", { onclick: async () => { const note = prompt(`Retire ${f.name}? It stays in the history with its ${attached}, but leaves the map. Add a note:`); if (note !== null) { await app.record({ op: "feature.retire", feature: f.id, note }); app.closeSheet(); toast(`${f.name} retired`); } } }, "⏏ Retire"),
        h("button", { style: { color: "var(--danger)" }, onclick: () => app.deleteFeature(f, attached) }, "🗑 Delete")));

  body.append(...[
    h("h2", { style: { display: "flex", alignItems: "center", gap: "8px" } }, ico(cat), f.name), chips,
    f.description && h("p.desc", f.description),
    f.origin === "kml" && f.photos?.length && !photoItems.length ? h("p.note", `Survey photos: ${f.photos.join(", ")}`) : null,
    actions,
    photoItems.length ? strip : null,
    events.length ? timeline : h("p.note", "Nothing logged yet."),
  ].filter(Boolean));
  document.getElementById("feature-sheet").classList.add("open");
}

// Searchable list grouped by category; the home of pets and livestock.
export function renderList(app) {
  const search = h("input.list-search", { placeholder: "Find a feature…", autocomplete: "off" });
  const listEl = h("div");
  const draw = () => {
    clear(listEl);
    const q = search.value.trim().toLowerCase();
    const all = liveFeatures(app).filter(f => !q || f.name.toLowerCase().includes(q) || (f.description ?? "").toLowerCase().includes(q));
    for (const c of CATEGORIES) {
      const items = all.filter(f => f.type === c.id);
      if (!items.length && !(c.geom === "none" && !q)) continue;
      listEl.append(h("h3", { style: { margin: "12px 0 2px", fontSize: "13px", color: c.color } }, `${c.name} (${items.length})`));
      for (const f of items) {
        const n = (app.state.byFeature.get(f.id) ?? []).length;
        listEl.append(h("div.list-item", { onclick: () => f.geom ? app.goTo(f.id) : app.openSheet(f) }, ico(c),
          h("div", { style: { flex: 1 } }, f.name, h("div.meta", `${describeGeom(f.geom)}${n ? ` · ${n} entries` : ""}${f.description ? " · " + f.description.slice(0, 60) : ""}`))));
      }
      if (c.geom === "none") listEl.append(h("button.btn", { style: { marginTop: "4px" }, onclick: () => app.showForm(featureForm(app, null, { type: c.id })) }, `+ New ${c.name.toLowerCase().replace(/s$/, "")}`));
    }
    const retired = [...app.state.features.values()].filter(f => f.retired && !f.deleted);
    if (retired.length && !q) listEl.append(h("h3", { style: { margin: "12px 0 2px", fontSize: "13px", color: "var(--muted)" } }, `Retired (${retired.length})`),
      ...retired.map(f => h("div.list-item", { onclick: () => app.openSheet(f) }, ico(catOf(f)), h("div", f.name, h("div.meta", `retired ${f.retired.slice(0, 10)} ${f.retireNote ?? ""}`)))));
  };
  search.addEventListener("input", draw);
  draw();
  setTimeout(() => search.focus(), 100);
  return h("div", h("h2", "Features"), search, listEl);
}
