// Areas enclosed by fences: found from rough fence lines, a tap located in one, and split into
// equal parts. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFaces, faceAt, divideStrips, divideFan, ringArea, signedArea, clipHalf } from "../js/areas.js";

const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) < eps, `${msg ?? ""} ${a} vs ${b}`);
// a 40 × 20 m paddock fenced as four lines, drawn as a person would: one corner a little short,
// one a little past, one exactly on
const rough = [
  { id: "s", name: "South", xy: [[0, 0], [40, 0]] },
  { id: "e", name: "East", xy: [[40, 0.3], [40, 20]] },                 // 0.3 m short of South
  { id: "n", name: "North", xy: [[40.4, 20], [0, 20]] },                // 0.4 m past East
  { id: "w", name: "West", xy: [[0, 20], [0, 0]] },
];

test("rough corners still close the paddock, to the square centimetre", () => {
  const { faces, gaps } = buildFaces(rough, 1);
  assert.equal(faces.length, 1);
  near(faces[0].area, 800, 0.01, "area");
  near(faces[0].perimeter, 120, 0.01, "perimeter");
  assert.deepEqual([...faces[0].lines].sort(), ["e", "n", "s", "w"]);
  assert.equal(gaps.length, 0);
  assert.ok(signedArea(faces[0].ring) > 0, "kept anticlockwise");
});

test("a gap wider than the tolerance leaves it open, and says where", () => {
  const { faces, gaps } = buildFaces(rough, 0.2);
  assert.equal(faces.length, 0);
  assert.equal(gaps.length, 1);
  assert.deepEqual([gaps[0].line, gaps[0].to].sort(), ["e", "s"], "once, between East and South (not from each side)"); near(gaps[0].d, 0.3, 1e-9);
});

test("a fence across it makes two; a tap finds the one it lands in", () => {
  const lines = [...rough, { id: "x", name: "Divider", xy: [[10, -0.2], [10, 20.5]] }];
  const { faces } = buildFaces(lines, 1);
  assert.equal(faces.length, 2);
  const west = faceAt(faces, [5, 10]), east = faceAt(faces, [30, 10]);
  near(west.area, 200, 0.01); near(east.area, 600, 0.01);
  assert.ok(west.lines.includes("x") && east.lines.includes("x"));
  assert.equal(faceAt(faces, [50, 10]), null, "outside every fence: nothing");
});

test("a ring fenced off inside is a hole in the paddock round it", () => {
  const lines = [...rough, { id: "t", name: "Tree guard", xy: [[18, 8], [22, 8], [22, 12], [18, 12], [18, 8]] }];
  const { faces } = buildFaces(lines, 1);
  const paddock = faceAt(faces, [5, 5]), guard = faceAt(faces, [20, 10]);
  near(paddock.area, 784, 0.01, "800 less the 16 m² guard");
  assert.equal(paddock.holes.length, 1);
  near(guard.area, 16, 0.01);
});

test("a line that comes almost back to its start encloses what it goes round", () => {
  const { faces } = buildFaces([{ id: "loop", name: "Kraal", xy: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0.5]] }], 1);
  assert.equal(faces.length, 1); near(faces[0].area, 100, 0.01);
});

test("equal strips: three parts of a paddock, the cuts parallel to a fence", () => {
  const ring = [[0, 0], [40, 0], [40, 20], [0, 20]];
  const s = divideStrips(ring, [1, 0], 3);
  assert.equal(s.parts.length, 3); assert.equal(s.cuts.length, 2);
  for (const p of s.parts) near(p.area, 800 / 3, 1e-6);
  near(s.cuts[0][0][1], 20 / 3, 1e-6, "the first cut a third of the way up");
  near(Math.abs(s.cuts[0][1][0] - s.cuts[0][0][0]), 40, 1e-6, "and right across");
  // an L: the strips are still equal, the cuts where they have to be
  const L = [[0, 0], [30, 0], [30, 10], [10, 10], [10, 30], [0, 30]];
  const l = divideStrips(L, [1, 0], 2);
  for (const p of l.parts) near(p.area, ringArea(L) / 2, 1e-6);
  const across = divideStrips(ring, [0, 1], 4);
  for (const p of across.parts) near(p.area, 200, 1e-6);
  assert.deepEqual(across.cuts.map(c => Math.round(c[0][0] * 1e6) / 1e6).sort((a, b) => a - b), [10, 20, 30], "across: every 10 m along");
});

test("equal wedges fanning out from a gate", () => {
  const ring = [[0, 0], [40, 0], [40, 20], [0, 20]];
  const f = divideFan(ring, [20, 0], 3);
  assert.equal(f.cuts.length, 2);
  for (const p of f.parts) near(p.area, 800 / 3, 1e-6);
  for (const c of f.cuts) { near(c[0][0], 20, 1e-9); near(c[0][1], 0, 1e-9); }
  assert.deepEqual(f.outside, [false, false]);
  // round a bend, the cut leaves the area, and says so
  const L = [[0, 0], [30, 0], [30, 10], [10, 10], [10, 30], [0, 30]];
  const g = divideFan(L, [30, 5], 2);
  assert.equal(g.outside.length, 1);
  for (const p of g.parts) near(p.area, ringArea(L) / 2, 1e-6);
});

test("clipping keeps the right side of the line", () => {
  near(ringArea(clipHalf([[0, 0], [4, 0], [4, 4], [0, 4]], [1, 0], 1)), 4, 1e-12);
  near(ringArea(clipHalf([[0, 0], [4, 0], [4, 4], [0, 4]], [1, 0], 1, false)), 12, 1e-12);
});
