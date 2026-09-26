// State derivation from the event log. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, addDuration, mergeRows } from "../js/events.js";

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

test("a planned feature stays planned until it is marked built, and nothing else is ever planned", () => {
  const s = fold(plot, [
    ev("2026-09-10T10:00:00+02:00", "feature.add", { feature: "f_p", name: "Shed", type: "structures", confidence: "medium", planned: true, geom: { type: "Point", xy: [5, 5], ll: [23, -33] } }),
    ev("2026-09-10T10:00:00+02:00", "feature.add", { feature: "f_q", name: "Gate", type: "access", confidence: "medium", geom: { type: "Point", xy: [5, 5], ll: [23, -33] } }),
    ev("2026-09-10T11:00:00+02:00", "feature.move", { feature: "f_p", geom: { type: "Point", xy: [6, 6], ll: [23, -33] } }),
  ]);
  assert.equal(s.features.get("f_p").planned, true, "a move does not build it");
  assert.equal(s.features.get("f_q").planned, undefined);
  assert.equal(s.features.get("K1").planned, undefined);
  const built = fold(plot, [
    ev("2026-09-10T10:00:00+02:00", "feature.add", { feature: "f_p", name: "Shed", type: "structures", planned: true, geom: { type: "Point", xy: [5, 5], ll: [23, -33] } }),
    ev("2026-09-12T10:00:00+02:00", "feature.edit", { feature: "f_p", changes: { planned: false } })]);
  assert.equal(built.features.get("f_p").planned, false);
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

test("unknown ops and events for unknown targets are not fatal", () => {
  const s = fold(plot, [
    ev("2026-09-10T10:00:00+02:00", "fly", {}),
    ev("2026-09-10T10:00:00+02:00", "job.done", { job: "nope" }),
    ev("2026-09-10T10:00:00+02:00", "feature.move", { feature: "nope", geom: {} }),
  ]);
  assert.equal(s.features.size, 2);
  assert.equal(s.jobs.size, 0);
});

test("records about a feature the map does not have are kept in dropped, in time order, not swallowed", () => {
  const s = fold(plot, [
    ev("2026-09-12T10:00:00+02:00", "observe", { feature: "gone", kind: "note", text: "x", photos: [] }),
    ev("2026-09-10T10:00:00+02:00", "feature.move", { feature: "beacon", geom: { type: "Point", xy: [1, 1] } }),
    ev("2026-09-11T10:00:00+02:00", "feature.retire", { feature: "beacon", note: "" }),
    ev("2026-09-11T11:00:00+02:00", "water", { source: "feature", feature: "gone", value: 1, unit: "m3" }),
    ev("2026-09-11T12:00:00+02:00", "feature.move", { feature: "K1", geom: { type: "Point", xy: [2, 2] } }),
    ev("2026-09-11T13:00:00+02:00", "observe", { feature: null, kind: "note", text: "general", photos: [] }),
  ]);
  assert.deepEqual(s.dropped.map(e => `${e.op}:${e.feature}`),
    ["feature.move:beacon", "feature.retire:beacon", "water:gone", "observe:gone"]);
  assert.deepEqual(s.features.get("K1").geom.xy, [2, 2], "a known feature still folds");
  assert.equal(s.features.has("beacon"), false, "a dropped move does not invent a feature");
});

test("a record.void takes the records it names out of the fold, whenever it was made", () => {
  const stray = [
    ev("2026-09-10T10:00:00+02:00", "feature.move", { feature: "beacon", geom: { type: "Point", xy: [1, 1] } }),
    ev("2026-09-10T10:01:00+02:00", "feature.move", { feature: "beacon", geom: { type: "Point", xy: [2, 2] } }),
  ];
  const kept = ev("2026-09-10T10:02:00+02:00", "feature.move", { feature: "beacon", geom: { type: "Point", xy: [3, 3] } });
  const moved = ev("2026-09-11T10:00:00+02:00", "feature.move", { feature: "K1", geom: { type: "Point", xy: [4, 4] } });
  const voiding = ev("2026-09-09T09:00:00+02:00", "record.void", { records: stray.map(e => e.id), note: "dismissed" });
  const s = fold(plot, [...stray, kept, moved, voiding]);
  assert.deepEqual(s.dropped.map(e => e.id), [kept.id], "only the records it names, even from before them in time");
  assert.deepEqual(s.features.get("K1").geom.xy, [4, 4]);
  assert.equal(fold(plot, [...stray, kept]).dropped.length, 3);
});

test("a move logged before its feature was added (clock skew between phones) is dropped, not misapplied", () => {
  const s = fold(plot, [
    ev("2026-09-10T10:00:00+02:00", "feature.move", { feature: "f_9", geom: { type: "Point", xy: [9, 9] } }),
    ev("2026-09-10T10:05:00+02:00", "feature.add", { feature: "f_9", name: "Fig", type: "trees", geom: { type: "Point", xy: [1, 1] } }),
  ]);
  assert.deepEqual(s.features.get("f_9").geom.xy, [1, 1]);
  assert.equal(s.dropped.length, 1);
});

test("a push can only grow a log file: lines the device has lost are merged back in", () => {
  const remote = [
    { id: "01A", ts: "2026-09-01T10:00:00+02:00", op: "observe" },
    { id: "01B", ts: "2026-09-02T10:00:00+02:00", op: "observe" },
  ].map(r => JSON.stringify(r)).join("\n") + "\n";
  const local = [
    { id: "01C", ts: "2026-09-03T10:00:00+02:00", op: "observe", synced: 0 },
    { id: "01B", ts: "2026-09-02T10:00:00+02:00", op: "observe", synced: 1 },
  ];
  const { rows, restored } = mergeRows(local, remote);
  assert.deepEqual(rows.map(r => r.id), ["01A", "01B", "01C"], "sorted by id, nothing lost");
  assert.deepEqual(restored.map(r => r.id), ["01A"]);
  assert.equal(rows.find(r => r.id === "01C").synced, 0, "local rows keep their sync state");
  assert.deepEqual(mergeRows(local, null).rows.map(r => r.id), ["01B", "01C"], "a new month file has no remote");
});

test("addDuration handles days, weeks, months, years", () => {
  assert.equal(addDuration("2026-09-10", "P7D"), "2026-09-17");
  assert.equal(addDuration("2026-09-10", "P2W"), "2026-09-24");
  assert.equal(addDuration("2026-01-31", "P1M"), "2026-03-03", "JS month overflow, documented behaviour");
  assert.equal(addDuration("2026-09-10", "P1Y"), "2027-09-10");
  assert.equal(addDuration("2026-09-10", "bogus"), "2026-09-10");
});

test("delete hides, undelete restores; retire/unretire round-trips", () => {
  const ev2 = (ts, op, rest) => ({ id: `01TESTX${ts.replace(/\D/g, "").slice(0, 19).padEnd(19, "0")}`, ts, by: "t", device: "d", op, ...rest });
  const s = fold(plot, [
    ev2("2026-09-10T10:00:00+02:00", "feature.delete", { feature: "K1" }),
    ev2("2026-09-10T10:01:00+02:00", "feature.undelete", { feature: "K1" }),
    ev2("2026-09-10T10:02:00+02:00", "feature.retire", { feature: "K2", note: "gone" }),
    ev2("2026-09-10T10:03:00+02:00", "feature.unretire", { feature: "K2" }),
    ev2("2026-09-10T10:04:00+02:00", "feature.delete", { feature: "K2" }),
  ]);
  assert.equal(s.features.get("K1").deleted, undefined);
  assert.equal(s.features.get("K2").retired, undefined);
  assert.equal(s.features.get("K2").deleted, "2026-09-10T10:04:00+02:00");
});

test("features without geometry (pets) and line/area features fold like any other", () => {
  const s = fold(plot, [
    ev("2026-09-10T10:00:00+02:00", "feature.add", { feature: "f_pet", name: "Bella", type: "pets", geom: null }),
    ev("2026-09-10T10:00:00+02:00", "feature.add", { feature: "f_fence", name: "Middle", type: "fences", confidence: "medium", geom: { type: "LineString", xy: [[0, 0], [30, 0], [30, 40]], ll: [[23, -33], [23, -33], [23, -33]] } }),
    ev("2026-09-11T10:00:00+02:00", "water", { source: "feature", feature: "K1", value: 12, unit: "m3" }),
    ev("2026-09-11T10:00:00+02:00", "job.add", { job: "w", title: "Deworm", feature: "f_pet", due: "2026-10-01", repeat: "P3M" }),
  ]);
  assert.equal(s.features.get("f_pet").geom, null);
  assert.equal(s.features.get("f_pet").confidence, "");
  assert.equal(s.features.get("f_fence").geom.xy.length, 3);
  assert.equal(s.byFeature.get("K1")[0].kind, "water");
  assert.equal(s.byFeature.get("f_pet")[0].item.title, "Deworm");
});

test("geometry helpers: length, area, formatting", async () => {
  const { lineLength, polygonArea, fmtLength, fmtArea } = await import("../js/geo.js");
  assert.equal(lineLength([[0, 0], [30, 0], [30, 40]]), 70);
  assert.equal(polygonArea([[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]]), 5000);
  assert.equal(polygonArea([[0, 0], [100, 0], [100, 50], [0, 50]]), 5000, "open ring counts the same");
  assert.equal(fmtLength(70), "70 m");
  assert.equal(fmtArea(5000), "5 000 m²");
  assert.equal(fmtArea(3.75), "3.8 m²", "a bed to a tenth");
  assert.equal(fmtArea(100), "100 m²");
  assert.equal(fmtArea(12026), "1.20 ha (12 026 m²)");
});

test("an area's icon point lands inside the area, even when the centroid does not", async () => {
  const { interiorPoint, centroid } = await import("../js/geo.js");
  const inside = ([x, y], r) => {
    let hit = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  const square = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
  const p = interiorPoint(square);
  assert.ok(Math.hypot(p[0] - 50, p[1] - 50) < 1, `square: expected the middle, got ${p}`);

  // a horseshoe: the centroid falls in the gap, outside the ring
  const horseshoe = [[0, 0], [100, 0], [100, 100], [70, 100], [70, 30], [30, 30], [30, 100], [0, 100], [0, 0]];
  assert.ok(!inside(centroid(horseshoe), horseshoe), "the centroid really is outside this one");
  assert.ok(inside(interiorPoint(horseshoe), horseshoe), "but the icon point is inside");

  // a long thin strip: still inside, and near the spine
  const strip = [[0, 0], [200, 0], [200, 10], [0, 10], [0, 0]];
  const s = interiorPoint(strip);
  assert.ok(inside(s, strip) && Math.abs(s[1] - 5) < 1.5, `strip: expected near the spine, got ${s}`);

  // vertices given anticlockwise, and left open
  const open = [[0, 0], [0, 60], [60, 60], [60, 0]];
  assert.ok(inside(interiorPoint(open), open), "open anticlockwise ring");
});
