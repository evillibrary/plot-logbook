// The feature sheet: what a tapped feature is, what has happened to it, and the actions.
// Also the searchable list of every feature, and the way back to anything not yet placed.
import { h, clear, fmtWhen, toast } from "./dom.js";
import { observeForm, photoForm, jobForm, waterForm, editForm, fenceTypeForm, liveFeatures, typeTitle } from "./forms.js";
import * as photos from "../photos.js";
import { CATEGORIES, CAT, catOf, catLook, lineTypeOf, isLine, typeCat, colourOf, iconSvg } from "../categories.js";
import { describeGeom, fmtLength, fmtArea, lineLength } from "../geo.js";
import { GATE_KIND, lengthOf } from "../gate.js";
import { isRow, rowSummary, rowNote } from "../points.js";

const confLabel = (c, point) => ({ high: "position: high", medium: "position: medium", low: `position: low — check and ${point ? "move" : "redraw"}` })[c] ?? c;
const ico = (cat, size = 26) => { const d = h("span.ic"); d.innerHTML = iconSvg(cat, size); return d; };

export function renderFeature(app, f) {
  const body = clear(document.getElementById("feature-body"));
  const events = app.state.byFeature.get(f.id) ?? [];
  const cat = catOf(f), ft = lineTypeOf(f, app.state.fencetypes);
  // an area that follows its fences: the ground they enclose now
  const face = f.area && !f.deleted ? app.areaFace(f) : null;
  const chips = h("div.chips",
    h("span.chip", { style: { background: cat.color, color: "#fff" } }, cat.name),
    f.gate ? h("span.chip", `${GATE_KIND[f.gate.kind]?.name ?? "Gate"} · ${f.gate.width.toFixed(1)} m`)
      : face ? h("span.chip", fmtArea(face.area)) : f.geom && f.geom.type !== "Point" && h("span.chip", describeGeom(f.geom)),
    f.area && !face && h("span.chip.lo", "its fences no longer close round it"),
    // its line type, in the colour the map draws it; a tap renames or recolours the type
    ft && h("button.chip.ftype", { title: `${typeTitle(typeCat(ft))}: tap to rename or recolour ${ft.name}`, onclick: () => app.showForm(fenceTypeForm(app, ft)) },
      h("i.sw", { style: { background: colourOf(ft.colour).color } }), ft.name),
    f.hiddenWith && h("span.chip.lo", f.on ? "off the map with its line" : "off the map with its fence"),
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
  // a fence's gates, and for a gate, its fence; a line's points, and for a point, its line
  const isFence = f.type === "fences" && isLine(f), aLine = isLine(f);
  const gates = isFence ? app.gatesOn(f.id).filter(g => !g.retired) : [];
  const fence = f.gate ? app.state.features.get(f.gate.fence) : null;
  const points = aLine ? app.pointsOn(f.id).filter(q => !q.retired) : [];
  const line = f.on ? app.state.features.get(f.on.line) : null, onLine = line?.geom?.type === "LineString" && !f.hiddenWith;
  // a fence whose type spaces its posts: how many, and how much wire
  const posts = isFence && ft?.every > 0 ? app.postsOn(f, ft) : null;
  const counts = { photos: photoItems.length, notes: events.filter(e => e.kind === "observe").length, jobs: events.filter(e => e.kind === "job").length, readings: events.filter(e => e.kind === "water").length, gates: gates.length, "points on it": points.length };
  const attached = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing";

  const actions = f.deleted ? h("div.actions", h("button.primary", { onclick: async () => { await app.record({ op: "feature.undelete", feature: f.id }); toast("restored"); app.openSheet(app.state.features.get(f.id)); } }, "↩ Restore"))
    : h("div", h("div.actions",
        h("button.primary", { onclick: () => app.showForm(observeForm(app, f)) }, "✎ Note"),
        h("button", { onclick: () => app.showForm(photoForm(app, f)) }, "📷 Photo"),
        h("button", { onclick: () => app.showForm(jobForm(app, f)) }, "☑ Job"),
        f.type === "water" && !f.on ? h("button", { onclick: () => app.showForm(waterForm(app, f)) }, "💧 Reading") : h("button", { onclick: () => edit() }, "✎ Edit")),
      h("div.actions",
        f.planned && !f.retired && h("button.primary", { onclick: async () => { await app.record({ op: "feature.edit", feature: f.id, changes: { planned: false } }); toast(`${f.name} marked as built`); } }, "✓ Built"),
        f.type === "water" && !f.on && h("button", { onclick: () => edit() }, "✎ Edit"),
        !f.geom && h("button.primary", { onclick: () => app.startMove(f) }, "📍 Place on map"),
        f.geom?.type === "Point" && !f.on && h("button", { onclick: () => app.startMove(f) }, "⤧ Move"),
        f.on && !isRow(f.on) && onLine && h("button", { title: "Move it along its line", onclick: () => app.startPoint(line, f) }, "⤧ Move"),
        f.gate && fence?.geom?.type === "LineString" && !f.hiddenWith && h("button", { title: "Move the gate, change its width, kind or swing", onclick: () => app.startGate(fence, f) }, "⤧ Move"),
        !f.gate && !f.on && !f.area && f.geom && f.geom.type !== "Point" && h("button", { onclick: () => app.startShape(f) }, "⤧ Shape"),
        face && !f.retired && h("button", { title: "Split it into equal parts with planned fences", onclick: () => app.startDivide(face, f) }, "÷ Divide"),
        isFence && !f.retired && h("button", { onclick: () => app.startGate(f) }, "＋ Gate"),
        aLine && !f.retired && h("button", { title: "One point on the line: a hatch, a valve, a strainer post", onclick: () => app.startPoint(f) }, "＋ Point"),
        aLine && !f.retired && h("button", { title: "A row of points along the line: posts every 3 m, hatches every 30 m", onclick: () => app.editRow(f) }, "＋ Row"),
        // the way back from ✓ Built: a fence drawn as if it stood that is really still an idea
        !f.planned && f.geom && !f.retired && h("button", { title: "Mark as planned, not built yet", onclick: async () => { await app.record({ op: "feature.edit", feature: f.id, changes: { planned: true } }); toast(`${f.name} marked as planned`); } }, "◌ Planned"),
        f.retired ? h("button", { onclick: async () => { await app.record({ op: "feature.unretire", feature: f.id }); app.openSheet(app.state.features.get(f.id)); } }, "↩ Unretire")
          : h("button", { onclick: async () => { const note = prompt(`Retire ${f.name}? It stays in the history with its ${attached}, but leaves the map. Add a note:`); if (note !== null) { await app.record({ op: "feature.retire", feature: f.id, note }); app.closeSheet(); toast(`${f.name} retired`); } } }, "⏏ Retire"),
        h("button", { style: { color: "var(--danger)" }, onclick: () => app.deleteFeature(f, attached) }, "🗑 Delete")));

  function edit() { f.on && isRow(f.on) && onLine ? app.editRow(line, f) : app.showForm(editForm(app, f)); }

  body.append(...[
    app._fromList && h("button.back", { onclick: () => app.backToList() }, "‹ Back to list"),
    h("h2", { style: { display: "flex", alignItems: "center", gap: "8px" } }, ico(catLook(f, app.state.fencetypes)), f.name), chips,
    f.geom?.type === "Point" && app.gridAt(f.geom.xy) && h("p.note.grid-at", `📐 ${app.gridAt(f.geom.xy)}`),
    // where a gate stands on its fence, in tape-measure terms, with the way to the fence
    fence?.geom?.type === "LineString" && h("p.note.gate-at", `📐 ${f.gate.at.toFixed(1)} m from A · ${Math.max(0, lengthOf(fence.geom.xy) - f.gate.at - f.gate.width).toFixed(1)} m from B, on`,
      h("button.linkish", { onclick: () => app.goTo(fence.id) }, fence.name)),
    // where a point stands on its line, or how a row is spread along it
    onLine && !isRow(f.on) && h("p.note.gate-at", `📐 ${f.on.at.toFixed(1)} m from A · ${Math.max(0, lengthOf(line.geom.xy) - f.on.at).toFixed(1)} m from B, on`,
      h("button.linkish", { onclick: () => app.goTo(line.id) }, line.name)),
    onLine && isRow(f.on) && h("p.note.gate-at", `📐 ${rowNote(rowSummary(line.geom.xy, f.on, app.cutsOn(line.id)))} · ${f.on.spacing === "exact" ? "exactly" : "no more than"} ${f.on.every} m apart along`,
      h("button.linkish", { onclick: () => app.goTo(line.id) }, line.name)),
    face && fencesRound(app, face),
    !face && f.area && app.areas(true).gaps.length ? h("p.note", `Open ends near it: ${app.areas(true).gaps.filter(g => g.d <= 10).slice(0, 3).map(g => app.gapText(g)).join("; ")}.`) : null,
    posts && h("p.note.posts", `${rowNote(posts, { posts: true })}${ft.strands ? ` · ${fmtLength(lineLength(f.geom.xy) * ft.strands)} of wire (${ft.strands} strands)` : ""}`),
    f.description && h("p.desc", f.description),
    gates.length ? h("div.gates", h("div.note", `Gates (${gates.length})`), ...gates.sort((a, b) => a.gate.at - b.gate.at).map(g =>
      h("div.list-item", { onclick: () => app.goTo(g.id) }, h("div", { style: { flex: 1 } }, g.name,
        h("div.meta", `${g.planned ? "planned · " : ""}${GATE_KIND[g.gate.kind]?.name ?? "Gate"} · ${g.gate.width.toFixed(1)} m · ${g.gate.at.toFixed(1)} m from A`))))) : null,
    points.length ? h("div.gates.points", h("div.note", `On this line (${points.length})`), ...points.sort((a, b) => (a.on.at ?? -1) - (b.on.at ?? -1)).map(q =>
      h("div.list-item", { onclick: () => app.goTo(q.id) }, h("div", { style: { flex: 1 } }, q.name,
        h("div.meta", `${q.planned ? "planned · " : ""}${isRow(q.on) ? `${q.geom?.xy?.length ?? 0} along it, ${q.on.every} m apart` : `${q.on.at.toFixed(1)} m from A`}`))))) : null,
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
    // a fence is found by its type's name too ("all the stock fence")
    const typeName = f => lineTypeOf(f, app.state.fencetypes)?.name ?? "";
    const all = liveFeatures(app).filter(f => !q || f.name.toLowerCase().includes(q) || (f.description ?? "").toLowerCase().includes(q) || typeName(f).toLowerCase().includes(q));
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
        return h("div.list-item", { onclick: () => app.fromList(f, snapshot()) }, ico(catLook(f, app.state.fencetypes)),
          h("div", { style: { flex: 1 } }, f.name, h("div.meta", `${f.planned ? "planned · " : ""}${typeName(f) ? typeName(f) + " · " : ""}${describeGeom(f.geom)}${n ? ` · ${n} entries` : ""}${f.description ? " · " + f.description.slice(0, 60) : ""}`)));
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

// what goes round an enclosure, each a way to its fence, and how sure its size is
function fencesRound(app, face) {
  const fs = face.lines.map(id => app.state.features.get(id)).filter(Boolean);
  // a fence traced half a metre out either way moves the edge by that much all round
  const plus = Math.max(1, Math.round(face.perimeter * 0.5 / 10) * 10);
  return h("div.area-about",
    h("p.note.round", `📐 ${fmtLength(face.perimeter)} round, inside `, ...fs.flatMap((f, k) => [k ? (k === fs.length - 1 ? " and " : ", ") : "", h("button.linkish", { onclick: () => app.goTo(f.id) }, f.name)])),
    h("p.note", `Good to about ±${fmtArea(plus)}: the fences are traced to about half a metre.${face.holes.length ? ` Less ${face.holes.length} fenced-off patch${face.holes.length === 1 ? "" : "es"} inside.` : ""}`));
}

// The card for an enclosure picked out by a tap: its size, what goes round it, and what to do with it.
export function areaCard(app, face, at) {
  const planned = face.lines.some(id => app.state.features.get(id)?.planned);
  return h("div", { dataset: { autofocus: "off" } },
    h("h2", "Enclosed area"),
    h("div.chips", h("span.chip", fmtArea(face.area)), planned && h("span.chip.plan", "planned fences round it")),
    fencesRound(app, face),
    h("p.note", "Tap it again to name it."),
    h("div.actions",
      h("button.primary", { onclick: () => app.nameArea(face, at) }, "✎ Name it"),
      h("button", { title: "Split it into equal parts with planned fences", onclick: () => app.startDivide(face) }, "÷ Divide"),
      h("button", { onclick: () => app.closeSheet() }, "Close")));
}
