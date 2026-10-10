// The logging forms. Each returns an element; on save it calls app.record(...) and app.done(form).
import { h, field, today, toast } from "./dom.js";
import * as photos from "../photos.js";
import { CATEGORIES, CAT, FENCE_COLOURS, colourOf, typeCat } from "../categories.js";
import { describeGeom, fmtArea } from "../geo.js";
import { GATE_KIND } from "../gate.js";
import { SPACINGS, POINT_NAMES, onGeom, rowSummary, rowNote } from "../points.js";

const KINDS = [["note", "Note"], ["health", "Health / condition"], ["measure", "Measurement"], ["harvest", "Harvest"], ["work", "Work done"]];
const REPEATS = [["", "once"], ["P1D", "daily"], ["P7D", "weekly"], ["P2W", "fortnightly"], ["P1M", "monthly"], ["P3M", "quarterly"], ["P1Y", "yearly"]];
const select = (opts, value) => h("select", {}, ...opts.map(([v, t]) => h("option", { value: v, selected: v === value }, t)));

export const liveFeatures = app => [...app.state.features.values()].filter(f => !f.deleted && !f.retired && !f.hiddenWith).sort((a, b) => a.name.localeCompare(b.name));
const featurePicker = (app, value, filter = () => true) => select([["", "— no feature —"], ...liveFeatures(app).filter(filter).map(f => [f.id, `${f.name} (${CAT[f.type]?.name ?? f.type})`])], value ?? "");
// Every category takes a point, so the choice is the whole list; the default is the category
// whose natural geometry matches what is being drawn.
const catSelect = (kind, value) => select(CATEGORIES.map(c => [c.id, c.name]), value ?? CATEGORIES.find(c => c.geom === kind)?.id ?? CATEGORIES[0].id);

// Pick photos from camera/gallery, prepare them, show thumbs. Returns {el, list()}
function photoPicker(app) {
  const list = [], strip = h("div.photo-strip");
  const input = h("input", { type: "file", accept: "image/*", multiple: true, capture: "environment", style: { display: "none" } });
  input.addEventListener("change", async () => {
    for (const f of input.files) {
      try {
        const p = await photos.prepare(f);
        list.push(p);
        strip.append(h("img", { src: URL.createObjectURL(p.thumbBlob), alt: "" }));
      } catch (e) { toast(`photo failed: ${e.message}`); }
    }
    input.value = "";
  });
  const el = h("div", h("div.row", h("button.btn", { type: "button", onclick: () => { input.removeAttribute("capture"); input.click(); } }, "📷 Add photos"), h("span.note", "camera or gallery")), strip, input);
  return { el, list: () => list };
}

async function savePhotos(app, picked, feature, caption) {
  const ids = [];
  for (const p of picked) {
    await photos.store(p);
    await app.record({ op: "photo", photo: p.id, file: p.file, taken: p.taken, feature: feature || null, gps: p.gps, caption: caption || "" });
    ids.push(p.id);
  }
  return ids;
}

export function observeForm(app, feature) {
  const kind = select(KINDS, "note"), text = h("textarea", { rows: 3, placeholder: "What did you see?" }), pick = photoPicker(app);
  const fsel = feature ? null : featurePicker(app);
  const form = h("form", { onsubmit: async e => {
    e.preventDefault();
    const fid = feature?.id ?? fsel.value;
    const ids = await savePhotos(app, pick.list(), fid, "");
    await app.record({ op: "observe", feature: fid || null, kind: kind.value, text: text.value.trim(), photos: ids, gps: app.gpsNow() });
    toast("logged"); app.done(form);
  } },
    h("h2", feature ? `Note on ${feature.name}` : "Note"),
    fsel && field("Feature", fsel), field("Kind", kind), field("Text", text), pick.el,
    h("div.row", h("button.btn.primary", { type: "submit" }, "Save"), h("button.btn", { type: "button", onclick: () => app.done(form) }, "Cancel")));
  return form;
}

export function photoForm(app, feature) {
  const caption = h("input", { placeholder: "Caption (optional)" }), pick = photoPicker(app);
  const fsel = feature ? null : featurePicker(app);
  const form = h("form", { onsubmit: async e => {
    e.preventDefault();
    if (!pick.list().length) return toast("no photo chosen");
    await savePhotos(app, pick.list(), feature?.id ?? fsel.value, caption.value.trim());
    toast(`${pick.list().length} photo(s) saved`); app.done(form);
  } },
    h("h2", feature ? `Photo of ${feature.name}` : "Photo"),
    fsel && field("Feature", fsel), pick.el, field("Caption", caption),
    h("div.row", h("button.btn.primary", { type: "submit" }, "Save"), h("button.btn", { type: "button", onclick: () => app.done(form) }, "Cancel")));
  setTimeout(() => pick.el.querySelector("input[type=file]").click(), 50);
  return form;
}

export function jobForm(app, feature, job) {
  const title = h("input", { placeholder: "e.g. Water the young trees", value: job?.title ?? "", required: true });
  const due = h("input", { type: "date", value: job?.due ?? today() }), repeat = select(REPEATS, job?.repeat ?? "");
  const notes = h("textarea", { rows: 2, value: job?.notes ?? "" });
  const fsel = featurePicker(app, job?.feature ?? feature?.id ?? "");
  const form = h("form", { onsubmit: async e => {
    e.preventDefault();
    const data = { title: title.value.trim(), feature: fsel.value || null, due: due.value || null, repeat: repeat.value || null, notes: notes.value.trim() };
    if (job) await app.record({ op: "job.edit", job: job.id, changes: data });
    else await app.record({ op: "job.add", job: crypto.randomUUID().slice(0, 8), ...data });
    toast(job ? "job updated" : "job added"); app.done(form);
  } },
    h("h2", job ? "Edit job" : "New job"),
    field("Title", title), field("Feature", fsel), field("Due", due), field("Repeat", repeat), field("Notes", notes),
    h("div.row", h("button.btn.primary", { type: "submit" }, "Save"),
      job && h("button.btn.danger", { type: "button", onclick: async () => { if (confirm("Delete this job?")) { await app.record({ op: "job.delete", job: job.id }); app.done(form); } } }, "Delete"),
      h("button.btn", { type: "button", onclick: () => app.done(form) }, "Cancel")));
  return form;
}

const UNITS = { water: "m3", rain: "mm", other: "" };
export function waterForm(app, feature) {
  const waterFeatures = liveFeatures(app).filter(f => f.type === "water");
  const src = select([...waterFeatures.map(f => [f.id, f.name]), ["rain", "Rain gauge"], ["other", "Other"]], feature?.id ?? (waterFeatures[0]?.id ?? "rain"));
  const value = h("input", { type: "number", step: "any", inputmode: "decimal", required: true });
  const unitFor = () => UNITS[src.value === "rain" || src.value === "other" ? src.value : "water"];
  const unit = h("input", { value: unitFor(), size: 4 });
  const when = h("input", { type: "datetime-local", value: new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) });
  const note = h("input", { placeholder: "Note (optional)" });
  src.addEventListener("change", () => { unit.value = unitFor(); });
  const form = h("form", { onsubmit: async e => {
    e.preventDefault();
    const isFeature = !["rain", "other"].includes(src.value);
    await app.record({ op: "water", source: isFeature ? "feature" : src.value, feature: isFeature ? src.value : null, value: +value.value, unit: unit.value.trim(), note: note.value.trim(), at: when.value });
    toast("reading logged"); app.done(form);
  } },
    h("h2", feature ? `Reading: ${feature.name}` : "Water reading"), field("Source", src),
    h("div.row", field("Reading", value), field("Unit", unit)), field("When", when), field("Note", note),
    h("div.row", h("button.btn.primary", { type: "submit" }, "Save"), h("button.btn", { type: "button", onclick: () => app.done(form) }, "Cancel")));
  return form;
}

const CONFIDENCE = [["low", "low — phone GPS"], ["medium", "medium — checked against the map"], ["high", "high — exactly here"]];

// A plan (the shed not yet built, a fence line being tried out) goes in the same record as the
// real farm, so it has to say so, or in a month nobody knows which is which.
function plannedBox(checked) {
  const input = h("input", { type: "checkbox", checked });
  return { input, el: h("label.check", input, "Planned — not built yet") };
}

// The fence colours in a row, the chosen one ringed and named. Buttons in a div, not a label: a
// tap anywhere on a label clicks the first button in it.
function swatches(value) {
  let cur = value;
  const name = h("span.note");
  const buttons = FENCE_COLOURS.map(c => h("button", { type: "button", title: c.name, "aria-label": c.name, dataset: { colour: c.id }, style: { background: c.color }, onclick: () => set(c.id) }));
  const set = id => { cur = id; for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.colour === cur)); name.textContent = colourOf(cur).name; };
  set(cur);
  return { el: h("div.swatches", ...buttons, name), value: () => cur };
}
const sortedTypes = app => [...app.state.fencetypes.values()].sort((a, b) => a.name.localeCompare(b.name));
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
// a new type's colour: the first no type has yet (brown is for fences with no type)
const freshColour = app => { const used = new Set([...app.state.fencetypes.values()].map(t => t.colour)); return FENCE_COLOURS.find(c => c.id !== "brown" && !used.has(c.id))?.id ?? "red"; };

// A line's type: one of the types made for its category (a fence's fence types, a pipe's pipe
// types), the one it has if that is another category's, none, or a new one named and coloured on
// the spot for the category chosen. A new line moved to another category drops a type that is not
// that category's; an existing line keeps its own. value(): {id} (null for none), or {add: {name,
// colour, category}} for a new one.
function typePicker(app, type, value, { keep = false } = {}) {
  let cur = value && app.state.fencetypes.has(value) ? value : null;
  const name = h("input", { placeholder: "e.g. Stock fence 1.2 m", autocomplete: "off" }), colour = swatches(freshColour(app));
  const fresh = h("div.ft-new", field("Name of the new type", name), h("div.field", h("span", "Its colour on the map"), colour.el));
  const chip = (id, label, col) => h("button.ft", { type: "button", dataset: { ft: id ?? "" }, onclick: () => pick(id) }, col && h("i.sw", { style: { background: col } }), label);
  const caption = h("span"), box = h("div.ft-chips");
  let chips = [];
  const pick = id => {
    cur = id;
    for (const b of chips) b.setAttribute("aria-pressed", String((b.dataset.ft || null) === cur));
    fresh.hidden = cur !== "new";
    if (cur === "new") setTimeout(() => name.focus({ preventScroll: true }), 50);
  };
  const fit = () => {
    const cat = type.value, own = cur && cur !== "new" ? app.state.fencetypes.get(cur) : null;
    if (own && typeCat(own) !== cat && !keep) cur = null;
    caption.textContent = cat === "fences" ? "Fence type" : "Type of line";
    name.placeholder = cat === "fences" ? "e.g. Stock fence 1.2 m" : cat === "water" ? "e.g. 110 mm sewer pipe" : "e.g. Garden hedge";
    chips = [chip(null, "No type"), ...sortedTypes(app).filter(t => typeCat(t) === cat || t.id === cur).map(t => chip(t.id, t.name, colourOf(t.colour).color)), chip("new", "＋ New type")];
    box.replaceChildren(...chips);
    pick(cur);
  };
  const el = h("div.field.fencetype", caption, box, fresh);
  type.addEventListener("change", fit);
  fit();
  return { el, value: () => cur === "new" ? { add: { name: name.value.trim(), colour: colour.value(), category: type.value } } : { id: cur } };
}
// The records a type choice needs before the fence's own: a new type, unless one of that name is
// already there (one type per name), when the fence takes that one. [records, id], or null if refused.
function resolveType(app, t) {
  if (!t?.add) return [[], t?.id ?? null];
  if (!t.add.name) { toast(`Name the new ${t.add.category === "fences" ? "fence " : ""}type, or choose one`); return null; }
  const same = [...app.state.fencetypes.values()].find(x => sameName(x.name, t.add.name));
  if (same) return [[], same.id];
  const id = `t_${crypto.randomUUID().slice(0, 8)}`;
  return [[{ op: "fencetype.add", fencetype: id, name: t.add.name, colour: t.add.colour, category: t.add.category }], id];
}

// "Fence type", "Water type": what a type is called for the category it is made for
export const typeTitle = cat => cat === "fences" ? "Fence type" : `${CAT[cat]?.name ?? "Line"} type`;
const numberOrNull = input => { const v = parseFloat(String(input.value).replace(",", ".")); return v > 0 ? v : null; };

// A line type on its own: its name, what it is for and its colour, how much line is of it, and a
// way to remove it (its lines stay, with no type). A fence type can also say how far apart its
// posts go and how many strands of wire it carries, and then its fences count their posts and
// wire. From Layers → Line types, or a line's type chip.
export function fenceTypeForm(app, t, { onDone } = {}) {
  const name = h("input", { value: t?.name ?? "", required: true, placeholder: "e.g. Stock fence 1.2 m", autocomplete: "off" });
  const colour = swatches(t?.colour ?? freshColour(app));
  const cat = select(CATEGORIES.map(c => [c.id, c.name]), typeCat(t));
  const every = h("input", { type: "number", step: "any", min: "0.5", inputmode: "decimal", value: t?.every ?? "", placeholder: "e.g. 3" });
  const strands = h("input", { type: "number", step: "1", min: "1", inputmode: "numeric", value: t?.strands ?? "", placeholder: "e.g. 5" });
  const fenceBits = h("div", field("Posts no more than this far apart (m)", every), field("Strands of wire", strands),
    h("p.note", "Leave these empty if they don't apply. With a spacing, its fences show their posts and count them: at the ends, corners and gates, and evenly between."));
  const finish = () => onDone ? onDone() : app.done(form);
  const n = t ? app.typeSummary(t.id).n : 0;
  const heading = h("h2");
  const fit = () => { fenceBits.hidden = cat.value !== "fences"; heading.textContent = t ? `${typeTitle(cat.value)}: ${t.name}` : "New type"; };
  cat.addEventListener("change", fit);
  const form = h("form", { onsubmit: async e => {
    e.preventDefault();
    const nm = name.value.trim();
    if ([...app.state.fencetypes.values()].some(x => x.id !== t?.id && sameName(x.name, nm))) return toast(`There is already a type called ${nm}`);
    const fence = cat.value === "fences", ev = fence ? numberOrNull(every) : null, st = fence ? numberOrNull(strands) : null;
    if (ev != null && ev < 0.5) return toast("Posts closer than half a metre? Check the spacing");
    if (!t) await app.record({ op: "fencetype.add", fencetype: `t_${crypto.randomUUID().slice(0, 8)}`, name: nm, colour: colour.value(), category: cat.value,
      ...(ev != null ? { every: ev } : {}), ...(st != null ? { strands: Math.round(st) } : {}) });
    else {
      const changes = {};
      if (nm !== t.name) changes.name = nm;
      if (colour.value() !== t.colour) changes.colour = colour.value();
      if (cat.value !== typeCat(t)) changes.category = cat.value;
      if (ev !== (t.every ?? null)) changes.every = ev;
      if ((st != null ? Math.round(st) : null) !== (t.strands ?? null)) changes.strands = st != null ? Math.round(st) : null;
      if (Object.keys(changes).length) await app.record({ op: "fencetype.edit", fencetype: t.id, changes });
    }
    toast(t ? "saved" : `${nm} added`); finish();
  } },
    heading,
    t && h("p.note", n ? app.typeNote(t.id) : `No ${typeCat(t) === "fences" ? "fence" : "line"} has this type yet.`),
    field("Name", name), field("For", cat), h("div.field", h("span", "Colour on the map"), colour.el), fenceBits,
    h("div.row", h("button.btn.primary", { type: "submit" }, t ? "Save" : "Add"),
      t && h("button.btn.danger", { type: "button", onclick: async () => {
        const noun = typeCat(t) === "fences" ? "fence" : "line";
        if (!confirm(`Remove the ${typeTitle(typeCat(t)).toLowerCase()} ${t.name}?${n ? `\n\nIts ${n === 1 ? `${noun} stays` : `${n} ${noun}s stay`}, with no type${noun === "fence" ? ", drawn brown" : ""}.` : ""}`)) return;
        await app.record({ op: "fencetype.delete", fencetype: t.id }); toast(`${t.name} removed`); finish(); } }, "Remove"),
      h("button.btn", { type: "button", onclick: finish }, "Cancel")));
  fit();
  return form;
}

// New feature: geom is {type, xy} in plot metres (ll added here), or null for pets/livestock.
// opts.viaGps: a point at the GPS position; opts.gpsPoints/points: how many of a drawn line's
// or area's vertices were GPS fixes rather than taps; opts.back: the way back to the shape.
// opts.gate (with opts.fence, opts.fromB): a gate, named after its fence and as sure of its
// place as the fence is, planned if the fence is. opts.on (with opts.line, opts.fromB): a point
// on a line, the same way, in the line's category to begin with.
export function featureForm(app, geom, opts = {}) {
  const gate = opts.gate ?? null, on = opts.on ?? null, parent = gate ? opts.fence : on ? opts.line : null, area = opts.area ?? null;
  const kind = !geom ? "none" : geom.type === "Point" ? "point" : geom.type === "LineString" ? "line" : "area";
  const name = h("input", { placeholder: kind === "none" ? "e.g. Bella" : kind === "line" ? "e.g. North paddock fence" : kind === "area" ? "e.g. Top paddock" : "e.g. Lemon tree", required: true,
    value: gate ? app.freshName(`${opts.fence.name} gate`) : "", ...(on ? { list: "point-names", placeholder: "e.g. Inspection hatch" } : {}) });
  const names = on && h("datalist", { id: "point-names" }, ...POINT_NAMES.map(n => h("option", { value: n })));
  const type = catSelect(kind, gate ? "access" : on ? opts.line.type : opts.type);
  const fromGps = !!opts.viaGps || opts.gpsPoints > 0;
  // a gate is no surer than its fence, and along it only as sure as a tap on the map
  const conf = select(CONFIDENCE, fromGps || parent?.confidence === "low" ? "low" : "medium");
  const how = opts.viaGps ? " (from GPS)" : opts.gpsPoints ? ` (${opts.gpsPoints === opts.points ? "every point" : `${opts.gpsPoints} of ${opts.points} points`} by GPS)` : "";
  const desc = h("textarea", { rows: 2, placeholder: gate ? "Latch, chain and lock, which way it swings, anything useful" : kind === "none" ? "Breed, born, anything useful" : "Planted when, variety, anything useful" });
  const planned = geom ? plannedBox(!!(parent?.planned || opts.planned)) : null;
  // a new fence starts as the last one drawn was, since fences are often put up a kind at a time
  const typePick = kind === "line" && !gate ? typePicker(app, type, app.lastFenceType) : null;
  const at = geom?.type === "Point" ? app.gridAt(geom.xy) : null;
  const form = h("form", { onsubmit: async e => {
    e.preventDefault();
    const t = typePick?.value(), rt = resolveType(app, t);
    if (!rt) return;
    const [typeRecords, ft] = rt;
    if (t) app.lastFenceType = ft;
    let g = null;
    if (geom) {
      const toLL = xy => app.unproject(xy).map(v => +v.toFixed(7));
      g = geom.type === "Point" ? { type: "Point", xy: geom.xy, ll: toLL(geom.xy) } : { type: geom.type, xy: geom.xy, ll: geom.ll ?? geom.xy.map(toLL) };
    }
    const fid = `f_${crypto.randomUUID().slice(0, 8)}`;
    await app.recordAll([...typeRecords, { op: "feature.add", feature: fid, name: name.value.trim(), type: type.value, confidence: geom ? conf.value : null, source: !geom ? "app" : fromGps ? "phone-gps" : "app-map", description: desc.value.trim(), geom: g,
      ...(planned?.input.checked ? { planned: true } : {}), ...(gate ? { gate } : {}), ...(on ? { on } : {}), ...(area ? { area } : {}), ...(ft ? { fencetype: ft } : {}) }]);
    toast(`${name.value.trim()} added`);
    // a newly named area stays picked out, its own sheet now
    if (area && app.state.features.get(fid)) { app._formOpen = false; app.openSheet(app.state.features.get(fid)); } else app.done(form);
  } },
    opts.back && h("button.back", { type: "button", onclick: opts.back }, opts.backLabel ?? (gate ? "‹ Back to the gate" : on ? "‹ Back to the line" : "‹ Back to the shape")),
    h("h2", gate ? "New gate" : area ? "Name this area" : on ? `New point on ${opts.line.name}` : kind === "none" ? "New pet or animal" : kind === "line" ? "New line" : kind === "area" ? "New area" : "New point"),
    gate ? h("p.note", `${GATE_KIND[gate.kind].name} · ${gate.width.toFixed(1)} m · ${gate.at.toFixed(1)} m from A and ${opts.fromB.toFixed(1)} m from B on ${opts.fence.name}${opts.viaGps ? " (placed by GPS)" : ""}`)
      : on ? h("p.note", `${on.at.toFixed(1)} m from A and ${opts.fromB.toFixed(1)} m from B on ${opts.line.name}${opts.viaGps ? " (placed by GPS)" : ""}`)
      : area ? h("p.note", `${opts.areaM2 != null ? fmtArea(opts.areaM2) : describeGeom(geom)} inside ${opts.fences?.join(", ") ?? "its fences"}. It follows them: move a fence and the area changes with it.`)
      : geom && h("p.note", `${describeGeom(geom)}${how}${at ? ` · ${at}` : ""}`),
    field("Name", name), names, field("Category", type), typePick?.el, planned?.el, geom ? field("Position confidence", conf) : null, field("Description", desc),
    h("div.row", h("button.btn.primary", { type: "submit" }, "Add"), h("button.btn", { type: "button", onclick: () => app.done(form) }, "Cancel")));
  return form;
}

export function editForm(app, f) {
  const kind = !f.geom ? "none" : f.geom.type === "Point" ? "point" : f.geom.type === "LineString" ? "line" : "area";
  const name = h("input", { value: f.name, required: true }), type = catSelect(kind, f.type);
  const desc = h("textarea", { rows: 3, value: f.description ?? "" });
  const conf = f.geom ? select(CONFIDENCE, CONFIDENCE.some(([v]) => v === f.confidence) ? f.confidence : "medium") : null;
  const planned = f.geom || f.planned ? plannedBox(!!f.planned) : null;
  const typePick = kind === "line" && !f.gate ? typePicker(app, type, f.fencetype, { keep: true }) : null;
  const form = h("form", { onsubmit: async e => {
    e.preventDefault();
    const t = typePick?.value(), rt = resolveType(app, t);
    if (!rt) return;
    const [typeRecords, ft] = rt;
    const changes = { name: name.value.trim(), type: type.value, description: desc.value.trim() };
    if (conf && conf.value !== f.confidence) changes.confidence = conf.value;
    if (planned && planned.input.checked !== !!f.planned) changes.planned = planned.input.checked;
    // null takes the type off; a type since removed already counts as none
    if (t && ft !== (app.state.fencetypes.has(f.fencetype) ? f.fencetype : null)) { changes.fencetype = ft; app.lastFenceType = ft; }
    await app.recordAll([...typeRecords, { op: "feature.edit", feature: f.id, changes }]);
    toast("saved"); app.done(form);
  } },
    h("h2", `Edit ${f.name}`), field("Name", name), field("Category", type), typePick?.el, planned?.el, conf && field("Position confidence", conf), field("Description", desc),
    h("div.row", h("button.btn.primary", { type: "submit" }, "Save"), h("button.btn", { type: "button", onclick: () => app.done(form) }, "Cancel")));
  return form;
}

// A row of points along a line (fence posts, sprinklers, hatches every 30 m): what they are, how far
// apart, spread evenly or counted exactly from A, and whether the corners have one too. Says how many
// that makes as it is typed. New from a line's sheet (line, null), or this row changed (line, p).
export function rowForm(app, line, p = null) {
  const cuts = app.cutsOn(line.id), fence = line.type === "fences";
  const name = h("input", { required: true, autocomplete: "off", value: p?.name ?? (fence ? app.freshName(`${line.name} posts`) : ""), placeholder: fence ? "e.g. Fence posts" : "e.g. Inspection hatches" });
  const type = catSelect("point", p?.type ?? line.type);
  const every = h("input", { type: "number", step: "any", min: "0.5", inputmode: "decimal", required: true, value: p?.on.every ?? (fence ? 3 : 10) });
  const spacing = select(SPACINGS.map(s => [s.id, s.name]), p?.on.spacing ?? "even");
  const corners = h("input", { type: "checkbox", checked: p ? p.on.corners !== false : true });
  const planned = plannedBox(p ? !!p.planned : !!line.planned);
  const desc = h("textarea", { rows: 2, value: p?.description ?? "", placeholder: "Size, depth, anything useful" });
  const count = h("p.note.row-count");
  const on = () => ({ line: line.id, every: parseFloat(String(every.value).replace(",", ".")), spacing: spacing.value, corners: corners.checked });
  const show = () => { const o = on(); count.textContent = o.every >= 0.5 ? `On ${line.name}: ${rowNote(rowSummary(line.geom.xy, o, cuts))}.` : "How far apart are they?"; };
  for (const el of [every, spacing, corners]) { el.addEventListener("input", show); el.addEventListener("change", show); }
  const form = h("form", { onsubmit: async e => {
    e.preventDefault();
    const o = on();
    if (!(o.every >= 0.5)) return toast("Half a metre apart at the least");
    const geom = onGeom(line.geom, o, cuts), nm = name.value.trim();
    if (!p) await app.record({ op: "feature.add", feature: `f_${crypto.randomUUID().slice(0, 8)}`, name: nm, type: type.value, confidence: line.confidence === "low" ? "low" : "medium",
      source: "app-map", description: desc.value.trim(), geom, ...(planned.input.checked ? { planned: true } : {}), on: o });
    else await app.record({ op: "feature.edit", feature: p.id, changes: { name: nm, type: type.value, description: desc.value.trim(), on: o,
      ...(planned.input.checked !== !!p.planned ? { planned: planned.input.checked } : {}) } });
    toast(p ? "saved" : `${nm}: ${geom.xy.length} on ${line.name}`); app.done(form);
  } },
    h("h2", p ? `Edit ${p.name}` : `Points along ${line.name}`),
    field("Name", name), field("Category", type), field("How far apart (m)", every), field("Spacing", spacing),
    h("label.check", corners, "One at every corner too"), count, planned.el, field("Description", desc),
    h("div.row", h("button.btn.primary", { type: "submit" }, p ? "Save" : "Add"), h("button.btn", { type: "button", onclick: () => app.done(form) }, "Cancel")));
  show();
  return form;
}
