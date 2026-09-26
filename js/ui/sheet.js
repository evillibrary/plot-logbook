// The feature sheet: what a tapped feature is, what has happened to it, and the actions.
// Also the searchable list of every feature, and the way back to anything not yet placed.
import { h, clear, fmtWhen, toast } from "./dom.js";
import { observeForm, photoForm, jobForm, waterForm, editForm, liveFeatures } from "./forms.js";
import * as photos from "../photos.js";
import { CATEGORIES, CAT, catOf, iconSvg } from "../categories.js";
import { describeGeom } from "../geo.js";
import { GATE_KIND, lengthOf } from "../gate.js";

const confLabel = (c, point) => ({ high: "position: high", medium: "position: medium", low: `position: low — check and ${point ? "move" : "redraw"}` })[c] ?? c;
const ico = (cat, size = 26) => { const d = h("span.ic"); d.innerHTML = iconSvg(cat, size); return d; };

export function renderFeature(app, f) {
  const body = clear(document.getElementById("feature-body"));
  const events = app.state.byFeature.get(f.id) ?? [];
  const cat = catOf(f);
  const chips = h("div.chips",
    h("span.chip", { style: { background: cat.color, color: "#fff" } }, cat.name),
    f.gate ? h("span.chip", `${GATE_KIND[f.gate.kind]?.name ?? "Gate"} · ${f.gate.width.toFixed(1)} m`) : f.geom && f.geom.type !== "Point" && h("span.chip", describeGeom(f.geom)),
    f.hiddenWith && h("span.chip.lo", "off the map with its fence"),
    f.planned && h("span.chip.plan", "planned, not built yet"),
    // lines and areas only say so when low: every one of them carried a silent "medium" until GPS vertices were tracked.
    // A plan has no measured position to be confident about.
    !f.planned && f.geom && f.confidence && (f.geom.type === "Point" || f.confidence === "low")
      && h(`span.chip.${{ high: "hi", medium: "md", low: "lo" }[f.confidence] ?? ""}`, confLabel(f.confidence, f.geom.type === "Point")),
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
  // a fence's gates, and for a gate, its fence
  const isFence = f.type === "fences" && f.geom?.type === "LineString";
  const gates = isFence ? app.gatesOn(f.id).filter(g => !g.retired) : [];
  const fence = f.gate ? app.state.features.get(f.gate.fence) : null;
  const counts = { photos: photoItems.length, notes: events.filter(e => e.kind === "observe").length, jobs: events.filter(e => e.kind === "job").length, readings: events.filter(e => e.kind === "water").length, gates: gates.length };
  const attached = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing";

  const actions = f.deleted ? h("div.actions", h("button.primary", { onclick: async () => { await app.record({ op: "feature.undelete", feature: f.id }); toast("restored"); app.openSheet(app.state.features.get(f.id)); } }, "↩ Restore"))
    : h("div", h("div.actions",
        h("button.primary", { onclick: () => app.showForm(observeForm(app, f)) }, "✎ Note"),
        h("button", { onclick: () => app.showForm(photoForm(app, f)) }, "📷 Photo"),
        h("button", { onclick: () => app.showForm(jobForm(app, f)) }, "☑ Job"),
        f.type === "water" ? h("button", { onclick: () => app.showForm(waterForm(app, f)) }, "💧 Reading") : h("button", { onclick: () => app.showForm(editForm(app, f)) }, "✎ Edit")),
      h("div.actions",
        f.planned && !f.retired && h("button.primary", { onclick: async () => { await app.record({ op: "feature.edit", feature: f.id, changes: { planned: false } }); toast(`${f.name} marked as built`); } }, "✓ Built"),
        f.type === "water" && h("button", { onclick: () => app.showForm(editForm(app, f)) }, "✎ Edit"),
        !f.geom && h("button.primary", { onclick: () => app.startMove(f) }, "📍 Place on map"),
        f.geom?.type === "Point" && h("button", { onclick: () => app.startMove(f) }, "⤧ Move"),
        f.gate && fence?.geom?.type === "LineString" && !f.hiddenWith && h("button", { title: "Move the gate, change its width, kind or swing", onclick: () => app.startGate(fence, f) }, "⤧ Move"),
        !f.gate && f.geom && f.geom.type !== "Point" && h("button", { onclick: () => app.startShape(f) }, "⤧ Shape"),
        isFence && !f.retired && h("button", { onclick: () => app.startGate(f) }, "＋ Gate"),
        // the way back from ✓ Built: a fence drawn as if it stood that is really still an idea
        !f.planned && f.geom && !f.retired && h("button", { title: "Mark as planned, not built yet", onclick: async () => { await app.record({ op: "feature.edit", feature: f.id, changes: { planned: true } }); toast(`${f.name} marked as planned`); } }, "◌ Planned"),
        f.retired ? h("button", { onclick: async () => { await app.record({ op: "feature.unretire", feature: f.id }); app.openSheet(app.state.features.get(f.id)); } }, "↩ Unretire")
          : h("button", { onclick: async () => { const note = prompt(`Retire ${f.name}? It stays in the history with its ${attached}, but leaves the map. Add a note:`); if (note !== null) { await app.record({ op: "feature.retire", feature: f.id, note }); app.closeSheet(); toast(`${f.name} retired`); } } }, "⏏ Retire"),
        h("button", { style: { color: "var(--danger)" }, onclick: () => app.deleteFeature(f, attached) }, "🗑 Delete")));

  body.append(...[
    app._fromList && h("button.back", { onclick: () => app.backToList() }, "‹ Back to list"),
    h("h2", { style: { display: "flex", alignItems: "center", gap: "8px" } }, ico(cat), f.name), chips,
    f.geom?.type === "Point" && app.gridAt(f.geom.xy) && h("p.note.grid-at", `📐 ${app.gridAt(f.geom.xy)}`),
    // where a gate stands on its fence, in tape-measure terms, with the way to the fence
    fence?.geom?.type === "LineString" && h("p.note.gate-at", `📐 ${f.gate.at.toFixed(1)} m from A · ${Math.max(0, lengthOf(fence.geom.xy) - f.gate.at - f.gate.width).toFixed(1)} m from B, on`,
      h("button.linkish", { onclick: () => app.goTo(fence.id) }, fence.name)),
    f.description && h("p.desc", f.description),
    gates.length ? h("div.gates", h("div.note", `Gates (${gates.length})`), ...gates.sort((a, b) => a.gate.at - b.gate.at).map(g =>
      h("div.list-item", { onclick: () => app.goTo(g.id) }, h("div", { style: { flex: 1 } }, g.name,
        h("div.meta", `${g.planned ? "planned · " : ""}${GATE_KIND[g.gate.kind]?.name ?? "Gate"} · ${g.gate.width.toFixed(1)} m · ${g.gate.at.toFixed(1)} m from A`))))) : null,
    f.origin === "kml" && f.photos?.length && !photoItems.length ? h("p.note", `Survey photos: ${f.photos.join(", ")}`) : null,
    actions,
    photoItems.length ? strip : null,
    events.length ? timeline : h("p.note", "Nothing logged yet."),
  ].filter(Boolean));
  document.getElementById("feature-sheet").classList.add("open");
}

// Searchable list grouped by category; the home of pets and livestock. The magnifier opens it
// fresh; coming back from a feature opened here restores it as it was left — query, open
// groups and scroll (app.listState). No autofocus: on a phone that throws the keyboard over
// the list, and the list is what you came for.
export function renderList(app, restore = false) {
  const st = restore ? app.listState : null;
  const search = h("input.list-search", { placeholder: "Find a feature…", autocomplete: "off", value: st?.q ?? "" });
  const listEl = h("div");
  let asLeft = st ? new Set(st.open) : null;          // which groups to open, until the query changes
  const snapshot = () => ({ q: search.value, open: [...listEl.querySelectorAll("details.grp[open]")].map(d => d.dataset.key),
    scroll: document.getElementById("feature-sheet").scrollTop });
  const draw = () => {
    clear(listEl);
    const q = search.value.trim().toLowerCase();
    const all = liveFeatures(app).filter(f => !q || f.name.toLowerCase().includes(q) || (f.description ?? "").toLowerCase().includes(q));
    // Collapsed until you ask: thirty-odd features in one scroll is no way to find anything,
    // and a typed query opens whatever it matched.
    const group = (key, title, colour, rows, open) => {
      const d = h("details.grp", { open: asLeft ? asLeft.has(key) : open, dataset: { key } });
      d.append(h("summary", { style: { color: colour } }, `${title} (${rows.length})`), ...rows);
      listEl.append(d);
    };
    for (const c of CATEGORIES) {
      const items = all.filter(f => f.type === c.id);
      if (!items.length) continue;
      group(c.id, c.name, c.color, items.map(f => {
        const n = (app.state.byFeature.get(f.id) ?? []).length;
        return h("div.list-item", { onclick: () => app.fromList(f, snapshot()) }, ico(c),
          h("div", { style: { flex: 1 } }, f.name, h("div.meta", `${f.planned ? "planned · " : ""}${describeGeom(f.geom)}${n ? ` · ${n} entries` : ""}${f.description ? " · " + f.description.slice(0, 60) : ""}`)));
      }), !!q);
    }
    const retired = [...app.state.features.values()].filter(f => f.retired && !f.deleted && !f.hiddenWith);
    if (retired.length && !q) group("retired", "Retired", "var(--muted)", retired.map(f =>
      h("div.list-item", { onclick: () => app.fromList(f, snapshot()) }, ico(catOf(f)),
        h("div", f.name, h("div.meta", `retired ${f.retired.slice(0, 10)} ${f.retireNote ?? ""}`)))), false);
  };
  search.addEventListener("input", () => { asLeft = null; draw(); });
  draw();
  return h("div", { dataset: { autofocus: "off" } }, h("h2", "Features"), search, listEl);
}
