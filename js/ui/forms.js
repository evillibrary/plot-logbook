// The logging forms. Each returns an element; on save it calls app.record(...) and app.done(form).
import { h, field, today, toast } from "./dom.js";
import * as photos from "../photos.js";

const KINDS = [["note", "Note"], ["health", "Health / condition"], ["measure", "Measurement"], ["harvest", "Harvest"], ["work", "Work done"]];
const TYPES = [["planting", "Planting"], ["tree", "Tree"], ["water", "Water"], ["structure", "Structure"], ["yard", "Yard object"], ["access", "Access"], ["vegetation", "Vegetation"], ["memorial", "Memorial"], ["history", "History"]];
const REPEATS = [["", "once"], ["P1D", "daily"], ["P7D", "weekly"], ["P2W", "fortnightly"], ["P1M", "monthly"], ["P3M", "quarterly"], ["P1Y", "yearly"]];
const select = (opts, value) => h("select", {}, ...opts.map(([v, t]) => h("option", { value: v, selected: v === value }, t)));

const featurePicker = (app, value) => {
  const opts = [["", "— no feature —"], ...[...app.state.features.values()].filter(f => !f.retired && !["boundary", "beacon", "fence"].includes(f.type)).sort((a, b) => a.name.localeCompare(b.name)).map(f => [f.id, f.name])];
  return select(opts, value ?? "");
};

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

const SOURCES = [["inlet", "Water inlet (meter)"], ["tank", "Tank level"], ["rain", "Rain gauge"], ["other", "Other"]];
const UNITS = { inlet: "m3", tank: "%", rain: "mm", other: "" };
export function waterForm(app) {
  const src = select(SOURCES, "inlet"), value = h("input", { type: "number", step: "any", inputmode: "decimal", required: true });
  const unit = h("input", { value: UNITS.inlet, size: 4 }), when = h("input", { type: "datetime-local", value: new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) });
  const note = h("input", { placeholder: "Note (optional)" });
  src.addEventListener("change", () => { unit.value = UNITS[src.value]; });
  const form = h("form", { onsubmit: async e => {
    e.preventDefault();
    await app.record({ op: "water", source: src.value, value: +value.value, unit: unit.value.trim(), note: note.value.trim(), at: when.value });
    toast("water logged"); app.done(form);
  } },
    h("h2", "Water reading"), field("Source", src),
    h("div.row", field("Reading", value), field("Unit", unit)), field("When", when), field("Note", note),
    h("div.row", h("button.btn.primary", { type: "submit" }, "Save"), h("button.btn", { type: "button", onclick: () => app.done(form) }, "Cancel")));
  return form;
}

// New feature at a map position (xy in plot metres). ll = [lon, lat] for the KML export later.
export function featureForm(app, xy, viaGps) {
  const name = h("input", { placeholder: "e.g. Lemon tree", required: true }), type = select(TYPES, "planting");
  const conf = select([["low", "low — phone GPS"], ["medium", "medium — checked against the map"], ["high", "high — exactly here"]], viaGps ? "low" : "medium");
  const desc = h("textarea", { rows: 2, placeholder: "Planted when, variety, anything useful" });
  const form = h("form", { onsubmit: async e => {
    e.preventDefault();
    const lonlat = app.unproject(xy);
    await app.record({ op: "feature.add", feature: `f_${crypto.randomUUID().slice(0, 8)}`, name: name.value.trim(), type: type.value, confidence: conf.value, source: viaGps ? "phone-gps" : "app-map", description: desc.value.trim(), geom: { type: "Point", xy: [+xy[0].toFixed(2), +xy[1].toFixed(2)], ll: [+lonlat[0].toFixed(7), +lonlat[1].toFixed(7)] } });
    toast("feature added — it will go to Google Earth with the next export"); app.done(form);
  } },
    h("h2", "New feature here"), h("p.note", `E ${xy[0].toFixed(1)}  N ${xy[1].toFixed(1)}${viaGps ? " (from GPS)" : ""}`),
    field("Name", name), field("Type", type), field("Position confidence", conf), field("Description", desc),
    h("div.row", h("button.btn.primary", { type: "submit" }, "Add"), h("button.btn", { type: "button", onclick: () => app.done(form) }, "Cancel")));
  return form;
}
