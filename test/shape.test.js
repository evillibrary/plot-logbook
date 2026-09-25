// Reshaping lines and areas one point at a time. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { ShapeEdit, joinTo } from "../js/shape.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const line = () => new ShapeEdit({ type: "LineString", xy: [[0, 0], [10, 0], [10, 20]] });
const square = () => new ShapeEdit({ type: "Polygon", xy: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] });

test("a line's ends are A and B, the rest corners; an area's points are all corners", () => {
  const l = line();
  assert.deepEqual([0, 1, 2].map(i => l.label(i)), ["A", "Corner 1", "B"]);
  const s = square();
  assert.equal(s.n, 4, "the closing point is not a point of its own");
  assert.deepEqual([0, 3].map(i => s.label(i)), ["Corner 1", "Corner 4"]);
});

test("moving one end leaves the rest alone, and undo puts it back", () => {
  const l = line();
  l.move(0, [0, -5]);
  assert.deepEqual(l.pts, [[0, -5], [10, 0], [10, 20]]);
  assert.ok(l.changed());
  assert.ok(l.undo());
  assert.deepEqual(l.pts, [[0, 0], [10, 0], [10, 20]]);
  assert.ok(!l.changed());
  assert.ok(!l.undo(), "nothing left to undo");
});

test("a new corner goes halfway along its side, and is selected", () => {
  const l = line();
  assert.equal(l.insertAfter(1), 2);
  assert.deepEqual(l.pts[2], [10, 10]);
  assert.equal(l.sel, 2);
  assert.equal(l.label(3), "B");
  const s = square();
  s.insertAfter(3);                                   // the closing side, from the last corner back to the first
  assert.deepEqual(s.pts[4], [0, 5]);
});

test("a line keeps two points and an area three", () => {
  const l = new ShapeEdit({ type: "LineString", xy: [[0, 0], [5, 0]] });
  assert.ok(!l.remove(0));
  const s = square();
  assert.ok(s.remove(2)); assert.equal(s.n, 3);
  assert.ok(!s.remove(0));
});

test("setting a side's length slides the point along it, the other end staying put", () => {
  const l = line();
  assert.ok(l.setLength(2, 25));                      // B, measured from the corner before it
  assert.deepEqual(l.pts[2].map(v => +v.toFixed(9)), [10, 25]);
  assert.ok(l.setLength(0, 4));                       // A, measured from the next point
  assert.deepEqual(l.pts[0].map(v => +v.toFixed(9)), [6, 0]);
  const s = square();
  s.setLength(0, 20);                                 // an area's corner 1 is measured from its last corner
  near(Math.hypot(s.pts[0][0] - 0, s.pts[0][1] - 10), 20);
  assert.ok(!l.setLength(1, 0) && !l.setLength(1, NaN), "nonsense lengths are refused");
});

test("swapping A and B turns the line round and keeps the same point selected", () => {
  const l = line();
  l.select(0);
  assert.ok(l.reverse());
  assert.deepEqual(l.pts, [[10, 20], [10, 0], [0, 0]]);
  assert.equal(l.sel, 2);
  assert.equal(l.confidence("high"), "high", "turning it round says nothing new about where it is");
  assert.ok(!square().reverse(), "an area has no ends");
});

test("confidence: a GPS point makes it low, a tap medium", () => {
  const a = line(); a.move(1, [11, 0]);
  assert.equal(a.confidence("high"), "medium");
  const b = line(); b.move(1, [11, 0], { gps: true }); b.move(2, [10, 21]);
  assert.equal(b.confidence("high"), "low");
});

test("sides, and the ones that meet at a point, towards A first", () => {
  const l = line();
  assert.deepEqual(l.sides().map(s => s.len), [10, 20]);
  assert.deepEqual(l.sidesAt(1).map(s => s.len), [10, 20]);
  assert.deepEqual(l.sidesAt(0).map(s => s.len), [10]);
  assert.equal(square().sides().length, 4);
});

test("the saved shape is rounded to the centimetre, and an area's ring closed again", () => {
  const s = new ShapeEdit({ type: "Polygon", xy: [[0.001, 0], [10.126, 0], [10, 10.004], [0.001, 0]] });
  assert.deepEqual(s.geom(), { type: "Polygon", xy: [[0, 0], [10.13, 0], [10, 10], [0, 0]] });
  assert.deepEqual(line().geom(), { type: "LineString", xy: [[0, 0], [10, 0], [10, 20]] });
});

test("an end dropped near another fence joins it: at its corner if close, else along it", () => {
  const fences = [{ id: "f", name: "Fence", xy: [[0, 0], [20, 0], [20, 20]] }];
  const c = joinTo([19.5, 0.6], fences, 1.5);
  assert.equal(c.kind, "corner"); assert.deepEqual(c.p, [20, 0]); assert.equal(c.name, "Fence");
  const a = joinTo([8, 0.7], fences, 1.5);
  assert.equal(a.kind, "line"); assert.deepEqual(a.p, [8, 0]);
  assert.equal(joinTo([8, 3], fences, 1.5), null, "too far to mean it");
  const b = joinTo([20.4, 10], fences, 1.5);
  assert.deepEqual(b.p, [20, 10]);
});
