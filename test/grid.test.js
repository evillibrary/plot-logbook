// The planning grid's geometry. Run: node --test
// A made-up plot: a "side" fence tilted 10° off north from a corner at (1000, 2000), and a
// "front" fence square to it, so the right answers are easy to write down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridFrame, toGrid, fromGrid, snapToGrid, gridExtent, gridLevels, gridLines, clipStart, describeAt, gridLabel } from "../js/grid.js";

const rad = 10 * Math.PI / 180, V = [-Math.sin(rad), Math.cos(rad)], U = [Math.cos(rad), Math.sin(rad)];
const at = (u, v) => [1000 + u * U[0] + v * V[0], 2000 + u * U[1] + v * V[1]];
const line = (id, name, xy) => ({ id, name, type: "fences", geom: { type: "LineString", xy } });
const side = line("s", "Side fence", [at(0, 0), at(0.3, 40), at(0, 100)]);   // a kink in the middle
const front = line("f", "Front fence", [at(0, 0), at(60, 0)]);
const feats = (...fs) => new Map(fs.map(f => [f.id, f]));
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("the frame sits on the shared corner, runs along the first fence and points into the property", () => {
  const fr = gridFrame({ along: "s", from: "f" }, feats(side, front), [0, 0]);
  near(fr.o[0], 1000); near(fr.o[1], 2000);
  near(fr.v[0], V[0]); near(fr.v[1], V[1]);                  // end to end, so the kink does not tilt it
  near(fr.u[0], U[0]); near(fr.u[1], U[1]);
  assert.equal(fr.along, "Side fence"); assert.equal(fr.from, "Front fence");
});

test("it finds the corner whichever way the fences were drawn", () => {
  const rs = line("s", "Side fence", [...side.geom.xy].reverse()), rf = line("f", "Front fence", [...front.geom.xy].reverse());
  const fr = gridFrame({ along: "s", from: "f" }, feats(rs, rf), [0, 0]);
  near(fr.o[0], 1000); near(fr.o[1], 2000); near(fr.v[1], V[1]); near(fr.u[0], U[0]);
});

test("a fence on the other side flips the across direction, so it still points in", () => {
  const west = line("f", "Front fence", [at(0, 0), at(-60, 0)]);
  const fr = gridFrame({ along: "s", from: "f" }, feats(side, west), [0, 0]);
  near(fr.u[0], -U[0]); near(fr.u[1], -U[1]);
  near(toGrid(fr, at(-60, 0))[0], 60);
});

test("with no fences named, or one of them gone, it falls back to north-up from the given corner", () => {
  for (const fr of [gridFrame(undefined, feats(side, front), [5, 6]), gridFrame({ along: "s", from: "x" }, feats(side, front), [5, 6]),
    gridFrame({ along: "s", from: "f" }, feats(side, { ...front, deleted: "2026-01-01" }), [5, 6])]) {
    assert.deepEqual(fr.o, [5, 6]); assert.deepEqual(fr.u, [1, 0]); assert.deepEqual(fr.v, [0, 1]); assert.equal(fr.along, null);
  }
});

test("grid coordinates are distances along and across, and go back again", () => {
  const fr = gridFrame({ along: "s", from: "f" }, feats(side, front), [0, 0]);
  const [u, v] = toGrid(fr, at(18, 42));
  near(u, 18); near(v, 42);
  const back = fromGrid(fr, [18, 42]);
  near(back[0], at(18, 42)[0]); near(back[1], at(18, 42)[1]);
  near(toGrid(fr, at(0, 100))[1], 100);
});

test("a snapped tap lands on a grid corner", () => {
  const fr = gridFrame({ along: "s", from: "f" }, feats(side, front), [0, 0]);
  const [u, v] = toGrid(fr, snapToGrid(fr, at(17.4, 43.6), 2));
  near(u, 18); near(v, 44);
  const [u5, v5] = toGrid(fr, snapToGrid(fr, at(17.4, 43.6), 5));
  near(u5, 15); near(v5, 45);
});

test("zoomed out, a fine grid thins to coarser lines instead of turning grey", () => {
  assert.deepEqual(gridLevels(1, 8), { step: 1, major: 10, label: 10, thinned: false });
  const out = gridLevels(1, 3.3);
  assert.equal(out.step, 10); assert.equal(out.thinned, true);
  assert.equal(gridLevels(3, 2).step, 15);
  assert.equal(gridLevels(10, 1.25).step, 10);
  for (const s of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) for (const ppm of [0.8, 2, 5, 12, 40, 110]) {
    const l = gridLevels(s, ppm);
    assert.ok(l.step * ppm >= 8, `size ${s} at ${ppm} px/m: lines ${l.step * ppm} px apart`);
    assert.equal(l.step % s, 0, "every line drawn is on the chosen grid");
    assert.equal(l.major % l.step, 0); assert.equal(l.label % l.step, 0, "only drawn lines are labelled");
    assert.ok(l.label * ppm >= 56 || l.label === 10 * l.major, "labels have room");
  }
  assert.equal(gridLevels(1, 110).label, 1, "zoomed right in, every metre is labelled");
});

test("lines cover the extent, parallel to the frame, with the heavier ones on round distances", () => {
  const fr = gridFrame({ along: "s", from: "f" }, feats(side, front), [0, 0]);
  const ext = gridExtent(fr, [side.geom.xy, front.geom.xy]);
  near(ext.u0, 0); near(ext.u1, 60); near(ext.v0, 0); near(ext.v1, 100);
  const lines = gridLines(fr, ext, 5, 10);
  assert.equal(lines.filter(l => l.dir === "u").length, 13);    // 0, 5, ... 60
  assert.equal(lines.filter(l => l.dir === "v").length, 21);    // 0, 5, ... 100
  assert.deepEqual(lines.filter(l => l.dir === "u" && l.major).map(l => l.val), [0, 10, 20, 30, 40, 50, 60]);
  for (const l of lines) {
    const d = [l.b[0] - l.a[0], l.b[1] - l.a[1]], dir = l.dir === "u" ? V : U, n = Math.hypot(...d);
    near(Math.abs(d[0] * dir[0] + d[1] * dir[1]) / n, 1);
  }
  assert.equal(gridLines(fr, { u0: 0, u1: 1e7, v0: 0, v1: 10 }, 1, 10).filter(l => l.dir === "u").length, 0, "a runaway extent draws nothing");
});

test("a label goes where its line comes onto the screen", () => {
  const r = { x0: 0, y0: 0, x1: 100, y1: 100 };
  assert.equal(clipStart({ x: 10, y: 10 }, { x: 90, y: 90 }, r), 0);
  near(clipStart({ x: -100, y: 50 }, { x: 100, y: 50 }, r), 0.5);
  assert.equal(clipStart({ x: -100, y: 150 }, { x: 100, y: 150 }, r), null);
  assert.equal(clipStart({ x: -100, y: 50 }, { x: -10, y: 50 }, r), null);
});

test("positions read as tape-measure instructions", () => {
  const fr = gridFrame({ along: "s", from: "f" }, feats(side, front), [0, 0]);
  assert.equal(describeAt(fr, at(18, 42)), "42.0 m along Side fence · 18.0 m in from it");
  assert.equal(describeAt(fr, at(-1.2, 3)), "3.0 m along Side fence · 1.2 m outside it");
  assert.equal(describeAt(gridFrame(null, feats(), [0, 0]), [4, 7]), "7.0 m N · 4.0 m E of the grid corner");
  assert.equal(gridLabel(0), "0"); assert.equal(gridLabel(20), "20 m"); assert.equal(gridLabel(-5), "−5 m");
});
