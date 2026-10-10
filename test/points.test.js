// Points on a line: one at a tape distance, a row spread along the line, how both ride a reshape,
// and the fold putting them where their line runs now. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { rowAlong, onGeom, rowSummary, rowNote, refitPoint, PointEdit } from "../js/points.js";
import { fold, ulid } from "../js/events.js";

// an L: 10 m east from A, then 20 m north to B
const L = [[0, 0], [10, 0], [10, 20]];
const ds = r => r.map(p => +p.d.toFixed(3));

test("one point stands at its tape distance from A, kept on the line", () => {
  assert.deepEqual(onGeom({ xy: L }, { line: "l", at: 4 }), { type: "Point", xy: [4, 0] });
  assert.deepEqual(onGeom({ xy: L }, { line: "l", at: 15 }), { type: "Point", xy: [10, 5] }, "round the corner");
  assert.deepEqual(onGeom({ xy: L }, { line: "l", at: 99 }).xy, [10, 20], "past B: at B");
  assert.deepEqual(onGeom({ xy: L, ll: [[20, -30], [20.1, -30], [20.1, -29.8]] }, { line: "l", at: 5 }).ll, [20.05, -30], "and its ll along the line's");
});

test("a row: the ends, the corners, and evenly between, no further apart than asked", () => {
  const r = rowAlong(L, { every: 3 });
  assert.deepEqual(ds(r), [0, 2.5, 5, 7.5, 10, 12.857, 15.714, 18.571, 21.429, 24.286, 27.143, 30]);
  assert.deepEqual(r.map(p => p.kind).join(","), "end,line,line,line,corner,line,line,line,line,line,line,end");
  assert.deepEqual(ds(rowAlong(L, { every: 3, corners: false })), [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30], "no corner: one run of 30 m, ten gaps");
  assert.deepEqual(ds(rowAlong(L, { every: 4, spacing: "exact" })), [0, 4, 8, 10, 12, 16, 20, 24, 28, 30], "exactly 4 m from A, and the corner and B");
  assert.deepEqual(ds(rowAlong(L, { every: 4, spacing: "exact", corners: false })), [0, 4, 8, 12, 16, 20, 24, 28, 30]);
  assert.deepEqual(rowAlong(L, { every: 0 }), [], "no spacing, no row");
  assert.deepEqual(rowAlong(L, { every: "3" }), [], "nor a spacing that is not a number");
  assert.equal(rowAlong(L, { every: 0.001 }).length, 301, "a slip of a spacing is held to 10 cm");
});

test("a row leaves a gateway clear, its posts fixed points the row is spread between", () => {
  const r = rowAlong(L, { every: 3 }, [[4, 7]]);
  assert.deepEqual(ds(r).slice(0, 5), [0, 2, 4, 7, 10], "3 m from the gate post to the corner needs nothing between");
  assert.deepEqual(r.slice(0, 5).map(p => p.kind).join(","), "end,line,gate,gate,corner");
  const g = onGeom({ xy: L }, { line: "l", every: 3 }, [[4, 7]]);
  assert.ok(!g.xy.some(p => p[1] === 0 && p[0] > 4 && p[0] < 7), "nothing in the gateway");
  assert.ok(!g.xy.some(p => p[1] === 0 && (p[0] === 4 || p[0] === 7)), "and the gate posts are the gate's to draw");
  const s = rowSummary(L, { every: 3 }, [[4, 7]]);
  assert.deepEqual({ ends: s.ends, corners: s.corners, gates: s.gates, points: s.points }, { ends: 2, corners: 1, gates: 2, points: g.xy.length });
  assert.ok(s.widest <= 3 && s.widest > 2.8, `widest gap ${s.widest}, the gateway not counted`);
  assert.match(rowNote(s, { posts: true }), /^\d+ posts: 2 at the ends, 1 at corners, \d+ between \(and 2 gate posts\) · 3\.0 m apart at most$/);
});

test("a reshape carries a point from the end it was measured from; a row needs nothing", () => {
  assert.deepEqual(refitPoint({ line: "l", at: 4 }, [[0, 0], [20, 0]]), { on: { line: "l", at: 4 }, slid: 0 });
  assert.deepEqual(refitPoint({ line: "l", at: 4 }, [[0, 0], [20, 0]], true).on.at, 16, "turned round: from the new A");
  const short = refitPoint({ line: "l", at: 25 }, [[0, 0], [20, 0]]);
  assert.equal(short.on.at, 20); assert.equal(short.slid, 5);
  const row = { line: "l", every: 3 };
  assert.equal(refitPoint(row, [[0, 0], [5, 0]]).on, row);
});

test("the point bar's working copy: tape from either end, undo", () => {
  const e = new PointEdit(L, 12.345);
  assert.equal(e.at, 12.35); assert.equal(e.fromB, 17.65); assert.ok(!e.changed());
  assert.ok(e.setFromB(10)); assert.equal(e.at, 20);
  assert.ok(!e.setFromA(31), "off the line: refused");
  assert.ok(e.set(-4)); assert.equal(e.at, 0, "a tap off the end lands on it");
  e.undo(); e.undo(); assert.equal(e.at, 12.35); assert.ok(!e.changed());
});

test("the fold stands points on their line as it runs now, and hides them with it", () => {
  const ev = (ts, op, extra) => ({ id: ulid(), ts, by: "t", device: "d", op, ...extra });
  const line = xy => ({ type: "LineString", xy, ll: xy });
  const s = fold({ features: [] }, [
    ev("2026-10-01T10:00:00+02:00", "feature.add", { feature: "f_pipe", name: "Pipe", type: "water", geom: line([[0, 0], [30, 0]]) }),
    ev("2026-10-01T10:01:00+02:00", "feature.add", { feature: "f_hatch", name: "Hatch", type: "water", geom: { type: "Point", xy: [9, 9] }, on: { line: "f_pipe", at: 12 } }),
    ev("2026-10-01T10:02:00+02:00", "feature.add", { feature: "f_posts", name: "Posts", type: "fences", geom: { type: "MultiPoint", xy: [] }, on: { line: "f_pipe", every: 10 } }),
    ev("2026-10-01T10:03:00+02:00", "feature.add", { feature: "f_gate", name: "Gate", type: "access", geom: line([[0, 0], [1, 0]]), gate: { fence: "f_pipe", at: 18, width: 4, kind: "single", hinge: "A", opens: "left" } }),
    ev("2026-10-02T10:00:00+02:00", "feature.move", { feature: "f_pipe", geom: line([[0, 0], [0, 40]]) }),
  ]);
  assert.deepEqual(s.features.get("f_hatch").geom, { type: "Point", xy: [0, 12], ll: [0, 12] }, "the hatch went round with the pipe");
  assert.deepEqual(s.features.get("f_posts").geom.xy, [[0, 0], [0, 9], [0, 18], [0, 22], [0, 31], [0, 40]].filter(p => p[1] !== 18 && p[1] !== 22),
    "the row spread along the new run, clear of the gateway, gate posts left to the gate");
  const gone = fold({ features: [] }, [
    ev("2026-10-01T10:00:00+02:00", "feature.add", { feature: "f_pipe", name: "Pipe", type: "water", geom: line([[0, 0], [30, 0]]) }),
    ev("2026-10-01T10:01:00+02:00", "feature.add", { feature: "f_hatch", name: "Hatch", type: "water", geom: { type: "Point", xy: [9, 9] }, on: { line: "f_pipe", at: 12 } }),
    ev("2026-10-02T10:00:00+02:00", "feature.retire", { feature: "f_pipe" }),
  ]);
  assert.equal(gone.features.get("f_hatch").hiddenWith, "f_pipe");
});

test("ids made in one millisecond sort in the order they were made", () => {
  const t = Date.now() + 10_000, ids = [];
  for (let i = 0; i < 200; i++) ids.push(ulid(t));
  assert.deepEqual([...ids].sort(), ids);
  assert.equal(new Set(ids).size, 200);
  assert.ok(ulid() > ids.at(-1), "and a clock behind the last id carries on from it");
});
