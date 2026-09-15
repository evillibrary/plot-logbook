// The feature sheet: what a tapped feature is, what has happened to it, and the four actions.
import { h, clear, fmtWhen } from "./dom.js";
import { observeForm, photoForm, jobForm } from "./forms.js";
import * as photos from "../photos.js";

const CONF_LABEL = { high: "position: high", medium: "position: medium", low: "position: low — check and move" };

export function renderFeature(app, f) {
  const body = clear(document.getElementById("feature-body"));
  const events = app.state.byFeature.get(f.id) ?? [];
  const chips = h("div.chips",
    h("span.chip", f.type || "feature"),
    f.confidence && h(`span.chip.${{ high: "hi", medium: "md", low: "lo" }[f.confidence] ?? ""}`, CONF_LABEL[f.confidence] ?? f.confidence),
    f.origin === "app" && h("span.chip", "added in app"),
    f.retired && h("span.chip.lo", `retired ${f.retired.slice(0, 10)}`));
  const strip = h("div.photo-strip");
  const photoItems = events.filter(e => e.kind === "photo");
  for (const e of photoItems.slice(0, 12)) {
    const img = h("img", { alt: e.item.caption || "", title: `${e.item.taken?.slice(0, 10)} ${e.item.caption ?? ""}`, onclick: () => app.showPhoto(e.item) });
    photos.url(e.item.photo, e.item.file, app.source).then(u => { if (u) img.src = u; });
    strip.append(img);
  }
  const timeline = h("ul.timeline", ...events.slice(0, 30).map(e => {
    const it = e.item;
    const text = e.kind === "observe" ? `${it.kind !== "note" ? `[${it.kind}] ` : ""}${it.text}${it.photos?.length ? ` 📷${it.photos.length}` : ""}`
      : e.kind === "photo" ? `📷 ${it.caption || "photo"}`
      : e.kind === "job" ? `☐ job: ${it.title}${it.due ? ` (due ${it.due})` : ""}`
      : e.kind === "job.done" ? `☑ done: ${it.title}` : "";
    return h("li", h("time", `${fmtWhen(e.ts)} · ${it.by ?? ""}`), text);
  }));
  body.append(...[
    h("h2", f.name), chips,
    f.description && h("p.desc", f.description),
    f.origin === "kml" && f.photos?.length && !photoItems.length ? h("p.note", `Survey photos: ${f.photos.join(", ")}`) : null,
    h("div.actions",
      h("button.primary", { onclick: () => app.showForm(observeForm(app, f)) }, "✎ Note"),
      h("button", { onclick: () => app.showForm(photoForm(app, f)) }, "📷 Photo"),
      h("button", { onclick: () => app.showForm(jobForm(app, f)) }, "☑ Job"),
      h("button", { onclick: () => app.startMove(f) }, "⤧ Move")),
    photoItems.length ? strip : null,
    events.length ? timeline : h("p.note", "Nothing logged yet."),
    f.origin === "app" && !f.retired ? h("p", h("button.btn.danger", { onclick: async () => { const note = prompt("Retire this feature (died, removed)? Add a note:"); if (note !== null) { await app.record({ op: "feature.retire", feature: f.id, note }); app.closeSheet(); } } }, "Retire feature")) : null,
  ].filter(Boolean));
  document.getElementById("feature-sheet").classList.add("open");
}
