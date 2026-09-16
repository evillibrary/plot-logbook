// State derivation from the event log. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, addDuration } from "../js/events.js";

const plot = { features: [
  { id: "K1", name: "Avocado", type: "planting", confidence: "low", geom: { type: "Point", xy: [10, 10], ll: [23, -33] } },
  { id: "K2", name: "House", type: "structure", confidence: "high", geom: { type: "Polygon", xy: [[0, 0], [1, 0], [1, 1], [0, 0]] } },
] };
let n = 0;
const ev = (ts, op, rest) => ({ id: `01TEST${String(++n).padStart(20, "0")}`, ts, by: "t", device: "d", op, ...rest });

test("KML features come through untouched, marked origin kml", () => {
  const s = fold(plot, []);
  assert.equal(s.features.size, 2);
  assert.equal(s.features.get("K1").origin, "kml");
  assert.equal(s.features.get("K1").name, "Avocado");
});

test("feature add / move / edit / retire", () => {
  const s = fold(plot, [
    ev("2026-09-10T10:00:00+02:00", "feature.add", { feature: "f_1", name: "Lemon", type: "planting", confidence: "low", geom: { type: "Point", xy: [5, 5], ll: [23, -33] } }),
    ev("2026-09-11T10:00:00+02:00", "feature.move", { feature: "f_1", geom: { type: "Point", xy: [6, 6], ll: [23, -33] }, confidence: "medium" }),
    ev("2026-09-12T10:00:00+02:00", "feature.edit", { feature: "f_1", changes: { name: "Meyer lemon" } }),
    ev("2026-09-13T10:00:00+02:00", "feature.move", { feature: "K1", geom: { type: "Point", xy: [11, 11], ll: [23, -33] } }),
    ev("2026-09-14T10:00:00+02:00", "feature.retire", { feature: "K1", note: "died" }),
  ]);
  const f = s.features.get("f_1");
  assert.equal(f.origin, "app");
  assert.equal(f.name, "Meyer lemon");
  assert.deepEqual(f.geom.xy, [6, 6]);
  assert.equal(f.confidence, "medium");
  const k = s.features.get("K1");
  assert.deepEqual(k.geom.xy, [11, 11]);
  assert.equal(k.confidence, "low", "move without confidence keeps the old one");
  assert.equal(k.retired, "2026-09-14T10:00:00+02:00");
});

test("events fold in ts order regardless of file order", () => {
  const later = ev("2026-09-12T10:00:00+02:00", "feature.edit", { feature: "K1", changes: { name: "Second" } });
  const earlier = ev("2026-09-11T10:00:00+02:00", "feature.edit", { feature: "K1", changes: { name: "First" } });
  assert.equal(fold(plot, [later, earlier]).features.get("K1").name, "Second");
});

test("one-off job closes on done; repeating job advances its due date and stays open", () => {
  const s = fold(plot, [
    ev("2026-09-10T10:00:00+02:00", "job.add", { job: "a", title: "Fix gate", due: "2026-09-12" }),
    ev("2026-09-10T10:00:00+02:00", "job.add", { job: "b", title: "Water", feature: "K1", due: "2026-09-10", repeat: "P7D" }),
    ev("2026-09-12T09:00:00+02:00", "job.done", { job: "a" }),
    ev("2026-09-10T18:00:00+02:00", "job.done", { job: "b" }),
    ev("2026-09-17T18:00:00+02:00", "job.done", { job: "b" }),
  ]);
  assert.equal(s.jobs.get("a").done, "2026-09-12T09:00:00+02:00");
  const b = s.jobs.get("b");
  assert.equal(b.done, null);
  assert.equal(b.due, "2026-09-24");
  assert.equal(b.history.length, 2);
  assert.equal(s.byFeature.get("K1").filter(e => e.kind === "job.done").length, 2);
});

test("job edit, reopen and delete", () => {
  const s = fold(plot, [
    ev("2026-09-10T10:00:00+02:00", "job.add", { job: "a", title: "Fix gate", due: "2026-09-12" }),
    ev("2026-09-11T10:00:00+02:00", "job.done", { job: "a" }),
    ev("2026-09-11T11:00:00+02:00", "job.edit", { job: "a", changes: { done: null, due: "2026-09-20" } }),
    ev("2026-09-10T10:00:00+02:00", "job.add", { job: "z", title: "Gone" }),
    ev("2026-09-10T10:01:00+02:00", "job.delete", { job: "z" }),
  ]);
  assert.equal(s.jobs.get("a").done, null);
  assert.equal(s.jobs.get("a").due, "2026-09-20");
  assert.equal(s.jobs.has("z"), false);
});

test("photos and observations land on their feature's timeline, newest first", () => {
  const s = fold(plot, [
    ev("2026-09-10T10:00:00+02:00", "photo", { photo: "p1", file: "photos/2026/09/p1.jpg", taken: "2026-09-01T08:00:00", feature: null, caption: "" }),
    ev("2026-09-10T10:01:00+02:00", "photo.edit", { photo: "p1", changes: { feature: "K1", caption: "before" } }),
    ev("2026-09-12T10:00:00+02:00", "observe", { feature: "K1", kind: "health", text: "fine", photos: ["p1"] }),
    ev("2026-09-12T10:00:00+02:00", "water", { source: "rain", value: 12, unit: "mm" }),
  ]);
  assert.equal(s.photos.get("p1").feature, "K1");
  assert.equal(s.photos.get("p1").caption, "before");
  const tl = s.byFeature.get("K1");
  assert.deepEqual(tl.map(e => e.kind), ["observe", "photo"]);
  assert.equal(tl[1].ts, "2026-09-01T08:00:00", "photo timeline uses taken, not recorded");
  assert.equal(s.water.length, 1);
  assert.equal(s.obs.length, 1);
});

test("unknown ops and events for unknown targets are ignored, not fatal", () => {
  const s = fold(plot, [
    ev("2026-09-10T10:00:00+02:00", "fly", {}),
    ev("2026-09-10T10:00:00+02:00", "job.done", { job: "nope" }),
    ev("2026-09-10T10:00:00+02:00", "feature.move", { feature: "nope", geom: {} }),
  ]);
  assert.equal(s.features.size, 2);
  assert.equal(s.jobs.size, 0);
});

test("addDuration handles days, weeks, months, years", () => {
  assert.equal(addDuration("2026-09-10", "P7D"), "2026-09-17");
  assert.equal(addDuration("2026-09-10", "P2W"), "2026-09-24");
  assert.equal(addDuration("2026-01-31", "P1M"), "2026-03-03", "JS month overflow, documented behaviour");
  assert.equal(addDuration("2026-09-10", "P1Y"), "2027-09-10");
  assert.equal(addDuration("2026-09-10", "bogus"), "2026-09-10");
});
