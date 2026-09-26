// Gates: where they sit on a fence, what is drawn for each kind, and how they ride a reshape. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { along, slice, project, gaps, gateGeom, gateDrawing, refit, GateEdit, lengthOf, normGate, sideOf } from "../js/gate.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const nearP = (p, q, eps = 1e-9) => { near(p[0], q[0], eps); near(p[1], q[1], eps); };
// an L: 10 m east from A, then 20 m north to B
const L = [[0, 0], [10, 0], [10, 20]];
const gate = (o = {}) => normGate({ fence: "f", at: 4, width: 3, kind: "single", hinge: "A", opens: "left", ...o });

test("distances run along the fence, round its corners", () => {
  assert.equal(lengthOf(L), 30);
  nearP(along(L, 4), [4, 0]);
  nearP(along(L, 15), [10, 5]);
  nearP(along(L, 99), [10, 20]);
  assert.deepEqual(slice(L, 8, 13), [[8, 0], [10, 0], [10, 3]], "an opening across the corner keeps it");
  near(project(L, [12, 7]), 17);
  near(project(L, [-5, -5]), 0);
});

test("the fence with its gateways taken out", () => {
  const pieces = gaps(L, [[14, 16], [4, 7]]);
  assert.equal(pieces.length, 3);
  assert.deepEqual(pieces[0], [[0, 0], [4, 0]]);
  assert.deepEqual(pieces[1], [[7, 0], [10, 0], [10, 4]]);
  assert.deepEqual(pieces[2], [[10, 6], [10, 20]]);
  assert.equal(gaps(L, [[0, 30]]).length, 0, "a gateway the whole length leaves nothing");
});

test("the opening's geometry for the fold: xy and ll at the same places, to the cm", () => {
  const fence = { xy: L, ll: [[23, -33], [23.0001, -33], [23.0001, -33.0002]] };
  const g = gateGeom(fence, gate({ at: 8, width: 4 }));
  assert.deepEqual(g.xy, [[8, 0], [10, 0], [10, 2]]);
  assert.deepEqual(g.ll, [[23.00008, -33], [23.0001, -33], [23.0001, -33.00002]]);
  const short = gateGeom({ xy: [[0, 0], [5, 0]] }, gate({ at: 4, width: 3 }));
  assert.deepEqual(short, { type: "LineString", xy: [[4, 0], [5, 0]] }, "a gate past the end is cut off, and no ll without the fence's");
});

test("a single swing: the leaf hangs on its hinge post and sweeps a quarter circle to the side it opens to", () => {
  const d = gateDrawing([[0, 0], [10, 0]], gate({ at: 2, width: 3, hinge: "A", opens: "left" }));
  assert.deepEqual(d.posts, [[2, 0], [5, 0]]);
  assert.deepEqual(d.leaves, [[[2, 0], [5, 0]]]);
  nearP(d.arcs[0][0], [5, 0]);
  nearP(d.arcs[0].at(-1), [2, 3], 1e-9);             // left of A→B, which runs east, is north
  nearP(d.open[0][1], [2, 3], 1e-9);
  const right = gateDrawing([[0, 0], [10, 0]], gate({ at: 2, width: 3, hinge: "B", opens: "right" }));
  nearP(right.leaves[0][0], [5, 0]);
  nearP(right.arcs[0].at(-1), [5, -3], 1e-9);
  assert.ok(right.arcs[0].every(p => Math.abs(Math.hypot(p[0] - 5, p[1]) - 3) < 1e-9), "every arc point a leaf's length from the hinge");
});

test("a double swing has two leaves meeting in the middle; a sliding gate a track past its post; an opening only posts", () => {
  const dbl = gateDrawing([[0, 0], [10, 0]], gate({ at: 2, width: 4, kind: "double" }));
  assert.equal(dbl.leaves.length, 2);
  nearP(dbl.leaves[0][1], [4, 0]); nearP(dbl.leaves[1][1], [4, 0]);
  nearP(dbl.arcs[0].at(-1), [2, 2]); nearP(dbl.arcs[1].at(-1), [6, 2]);
  const sl = gateDrawing([[0, 0], [10, 0]], gate({ at: 5, width: 4, kind: "sliding", hinge: "A", opens: "right" }));
  assert.deepEqual(sl.leaves, [[[5, 0], [9, 0]]]);
  assert.equal(sl.arcs.length, 0);
  nearP(sl.track[0], [9, -0.35]); nearP(sl.track[1], [1, -0.35]);
  const op = gateDrawing([[0, 0], [10, 0]], gate({ kind: "opening" }));
  assert.equal(op.leaves.length + op.arcs.length, 0);
  assert.equal(op.posts.length, 2);
});

test("a reshaped fence carries its gate at the same distance from A, sliding it in if the fence got too short", () => {
  const r = refit(gate({ at: 20, width: 3 }), [[0, 0], [30, 0]]);
  assert.deepEqual([r.gate.at, r.slid, r.fits], [20, 0, true]);
  const s = refit(gate({ at: 20, width: 3 }), [[0, 0], [21, 0]]);
  assert.deepEqual([s.gate.at, s.fits], [18, true]);
  near(s.slid, 2);
  assert.equal(refit(gate({ at: 0, width: 3 }), [[0, 0], [2, 0]]).fits, false);
});

test("a fence turned round keeps its gate where it stands, the hinge and swing turned with it", () => {
  const r = refit(gate({ at: 4, width: 3, hinge: "A", opens: "left" }), [[30, 0], [0, 0]], true);
  assert.deepEqual([r.gate.at, r.gate.hinge, r.gate.opens], [23, "B", "right"]);
  const before = gateDrawing([[0, 0], [30, 0]], gate({ at: 4, width: 3, hinge: "A", opens: "left" }));
  const after = gateDrawing([[30, 0], [0, 0]], r.gate);
  nearP(after.leaves[0][0], before.leaves[0][0]);
  nearP(after.arcs[0].at(-1), before.arcs[0].at(-1));
});

test("a new gate opens towards the middle of the plot", () => {
  assert.equal(sideOf([[0, 0], [10, 0]], 5, [5, 40]), "left");
  assert.equal(sideOf([[10, 0], [0, 0]], 5, [5, 40]), "right");
  assert.equal(sideOf(L, 20, [0, 10]), "left", "on the second side of the L, round the corner");
});

test("the gate bar's working copy: move it, move one post, set it by tape, with undo", () => {
  const e = new GateEdit([[0, 0], [30, 0]], gate({ at: 4, width: 3 }));
  e.centreAt(20);
  assert.deepEqual([e.g.at, e.g.width], [18.5, 3]);
  e.select(1); e.postAt(1, 25);
  assert.deepEqual([e.g.at, e.g.width, e.sel], [18.5, 6.5, null], "the post nearer A stays; the post in hand is let go");
  e.postAt(0, 29);
  assert.deepEqual([e.g.at, e.g.width], [25, 4], "a post taken past the other swaps them round");
  assert.ok(e.setFromB(2)); assert.equal(e.g.at, 24);
  assert.equal(e.fromB, 2);
  assert.ok(!e.setFromA(28), "a distance that runs it off the end is refused");
  e.centreAt(100); assert.equal(e.g.at, 26, "moved past the end, it stops at the end");
  e.setKind("walk"); assert.equal(e.g.width, 4, "a width chosen by hand stays when the kind changes");
  const f = new GateEdit([[0, 0], [30, 0]], gate({ width: 3.6 }));
  f.setKind("double"); assert.equal(f.g.width, 4.8, "a kind's own width follows the kind");
  f.flipHinge(); f.flipOpens();
  assert.deepEqual([f.g.hinge, f.g.opens], ["B", "right"]);
  while (f.undo());
  assert.ok(!f.changed());
  assert.ok(e.changed());
});
