// The logging forms. Each returns an element; on save it calls app.record(...) and app.done(form).
import { h, field, today, toast } from "./dom.js";
import * as photos from "../photos.js";
import { CATEGORIES, CAT } from "../categories.js";
import { describeGeom } from "../geo.js";
import { GATE_KIND } from "../gate.js";

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

// New feature: geom is {type, xy} in plot metres (ll added here), or null for pets/livestock.
// opts.viaGps: a point at the GPS position; opts.gpsPoints/points: how many of a drawn line's
// or area's vertices were GPS fixes rather than taps; opts.back: the way back to the shape.
// opts.gate (with opts.fence, opts.fromB): a gate, named after its fence and as sure of its
// place as the fence is, planned if the fence is.
export function featureForm(app, geom, opts = {}) {
  const gate = opts.gate ?? null;
  const kind = !geom ? "none" : geom.type === "Point" ? "point" : geom.type === "LineString" ? "line" : "area";
  const name = h("input", { placeholder: kind === "none" ? "e.g. Bella" : kind === "line" ? "e.g. North paddock fence" : kind === "area" ? "e.g. Top paddock" : "e.g. Lemon tree", required: true,
    value: gate ? `${opts.fence.name} gate` : "" });
  const type = catSelect(kind, gate ? "access" : opts.type);
  const fromGps = !!opts.viaGps || opts.gpsPoints > 0;
  // a gate is no surer than its fence, and along it only as sure as a tap on the map
  const conf = select(CONFIDENCE, fromGps || (gate && opts.fence.confidence === "low") ? "low" : "medium");
  const how = opts.viaGps ? " (from GPS)" : opts.gpsPoints ? ` (${opts.gpsPoints === opts.points ? "every point" : `${opts.gpsPoints} of ${opts.points} points`} by GPS)` : "";
  const desc = h("textarea", { rows: 2, placeholder: gate ? "Latch, chain and lock, which way it swings, anything useful" : kind === "none" ? "Breed, born, anything useful" : "Planted when, variety, anything useful" });
  const planned = geom ? plannedBox(!!(gate && opts.fence.planned)) : null;
  const at = geom?.type === "Point" ? app.gridAt(geom.xy) : null;
  const form = h("form", { onsubmit: async e => {
    e.preventDefault();
    let g = null;
    if (geom) {
      const toLL = xy => app.unproject(xy).map(v => +v.toFixed(7));
      g = geom.type === "Point" ? { type: "Point", xy: geom.xy, ll: toLL(geom.xy) } : { type: geom.type, xy: geom.xy, ll: geom.ll ?? geom.xy.map(toLL) };
    }
    await app.record({ op: "feature.add", feature: `f_${crypto.randomUUID().slice(0, 8)}`, name: name.value.trim(), type: type.value, confidence: geom ? conf.value : null, source: !geom ? "app" : fromGps ? "phone-gps" : "app-map", description: desc.value.trim(), geom: g,
      ...(planned?.input.checked ? { planned: true } : {}), ...(gate ? { gate } : {}) });
    toast(`${name.value.trim()} added`); app.done(form);
  } },
    opts.back && h("button.back", { type: "button", onclick: opts.back }, gate ? "‹ Back to the gate" : "‹ Back to the shape"),
    h("h2", gate ? "New gate" : kind === "none" ? "New pet or animal" : kind === "line" ? "New line" : kind === "area" ? "New area" : "New point"),
    gate ? h("p.note", `${GATE_KIND[gate.kind].name} · ${gate.width.toFixed(1)} m · ${gate.at.toFixed(1)} m from A and ${opts.fromB.toFixed(1)} m from B on ${opts.fence.name}${opts.viaGps ? " (placed by GPS)" : ""}`)
      : geom && h("p.note", `${describeGeom(geom)}${how}${at ? ` · ${at}` : ""}`),
    field("Name", name), field("Category", type), planned?.el, geom ? field("Position confidence", conf) : null, field("Description", desc),
    h("div.row", h("button.btn.primary", { type: "submit" }, "Add"), h("button.btn", { type: "button", onclick: () => app.done(form) }, "Cancel")));
  return form;
}

export function editForm(app, f) {
  const kind = !f.geom ? "none" : f.geom.type === "Point" ? "point" : f.geom.type === "LineString" ? "line" : "area";
  const name = h("input", { value: f.name, required: true }), type = catSelect(kind, f.type);
  const desc = h("textarea", { rows: 3, value: f.description ?? "" });
  const conf = f.geom ? select(CONFIDENCE, CONFIDENCE.some(([v]) => v === f.confidence) ? f.confidence : "medium") : null;
  const planned = f.geom || f.planned ? plannedBox(!!f.planned) : null;
  const form = h("form", { onsubmit: async e => {
    e.preventDefault();
    const changes = { name: name.value.trim(), type: type.value, description: desc.value.trim() };
    if (conf && conf.value !== f.confidence) changes.confidence = conf.value;
    if (planned && planned.input.checked !== !!f.planned) changes.planned = planned.input.checked;
    await app.record({ op: "feature.edit", feature: f.id, changes });
    toast("saved"); app.done(form);
  } },
    h("h2", `Edit ${f.name}`), field("Name", name), field("Category", type), planned?.el, conf && field("Position confidence", conf), field("Description", desc),
    h("div.row", h("button.btn.primary", { type: "submit" }, "Save"), h("button.btn", { type: "button", onclick: () => app.done(form) }, "Cancel")));
  return form;
}
