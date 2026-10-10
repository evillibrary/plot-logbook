// Points on a line: a feature that stands on a line, as a gate stands on its fence, and moves
// with it. `on: {line, at}` is one point `at` metres along the line from its end A (an inspection
// hatch, a valve, a strainer post); `on: {line, every, spacing, corners}` is a row of them (fence
// posts, sprinklers): one at each end, at each corner unless `corners` is false, and then either
// spread evenly no more than `every` apart between those (spacing "even", the way a fence is set
// out) or exactly `every` apart counted from A ("exact"). A gateway in the line is left clear, and
// its posts count as fixed points that a row is spread between. Pure geometry, shared by the fold
// (where the points stand now), the map, the point bar and the forms; tools/fold.py mirrors
// onGeom and rowAlong operation for operation, so both folds come to the same points.
import { cumulative, lengthOf, cm, pointAlong } from "./gate.js";

const MIN_EVERY = 0.1;                  // a row closer than this is a typing slip, not a plan
const NEAR = 0.01;                      // two places closer than a centimetre are one
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const RANK = { end: 0, gate: 1, corner: 2, line: 3 };

export const SPACINGS = [
  { id: "even", name: "Evenly, no more than this apart" },
  { id: "exact", name: "Exactly this apart, counted from A" },
];
export const isRow = on => on?.every != null;

// A row's places along the line, [{d, kind}] in order: kind "end", "corner", "gate" (a gate post:
// fixed, but the gate draws it) or "line" (one spread between). cuts: the gateways, [[d0, d1]].
export function rowAlong(xy, on, cuts = [], c = cumulative(xy)) {
  const L = c[c.length - 1];
  if (!(typeof on.every === "number" && on.every > 0) || !(L > 0)) return [];
  const every = Math.max(on.every, MIN_EVERY);
  const openings = cuts.map(([a, b]) => [clamp(a, 0, L), clamp(b, 0, L)]).filter(([a, b]) => b - a > NEAR);
  const inside = d => openings.some(([a, b]) => d > a + NEAR && d < b - NEAR);
  const fixed = [{ d: 0, kind: "end" }, { d: L, kind: "end" }];
  if (on.corners !== false) for (let k = 1; k < c.length - 1; k++) fixed.push({ d: c[k], kind: "corner" });
  for (const [a, b] of openings) fixed.push({ d: a, kind: "gate" }, { d: b, kind: "gate" });
  const order = (x, y) => x.d - y.d || RANK[x.kind] - RANK[y.kind];
  fixed.sort(order);
  const pts = [...fixed];
  if (on.spacing === "exact") {
    for (let k = 1; k * every < L; k++) pts.push({ d: k * every, kind: "line" });
  } else {
    for (let i = 0; i + 1 < fixed.length; i++) {
      const p = fixed[i].d, q = fixed[i + 1].d;
      if (q - p <= NEAR || inside((p + q) / 2)) continue;
      const n = Math.ceil((q - p) / every - 1e-9);
      for (let j = 1; j < n; j++) pts.push({ d: p + (q - p) * j / n, kind: "line" });
    }
  }
  pts.sort(order);
  const out = [];
  for (const pt of pts) {
    if (inside(pt.d)) continue;
    if (out.length && pt.d - out[out.length - 1].d <= NEAR) continue;     // an end, a gate post, a corner before one spread between
    out.push(pt);
  }
  return out;
}

// Where a point, or a row, stands on the line as it runs now: a Point, or a MultiPoint of the
// row without its gate posts (the gates draw those).
export function onGeom(line, on, cuts = []) {
  const c = cumulative(line.xy), L = c[c.length - 1], withLL = Array.isArray(line.ll) && line.ll.length === line.xy.length;
  if (!isRow(on)) return { type: "Point", ...pointAlong(line, c, typeof on.at === "number" ? clamp(on.at, 0, L) : 0) };
  const pts = rowAlong(line.xy, on, cuts, c).filter(p => p.kind !== "gate").map(p => pointAlong(line, c, p.d));
  return withLL ? { type: "MultiPoint", xy: pts.map(p => p.xy), ll: pts.map(p => p.ll) } : { type: "MultiPoint", xy: pts.map(p => p.xy) };
}

// What a row comes to: how many at the ends, at corners, spread between, and gate posts, and the
// widest gap left between two neighbours (gateways apart), which "evenly" keeps under `every`.
export function rowSummary(xy, on, cuts = []) {
  const r = rowAlong(xy, on, cuts), n = k => r.filter(p => p.kind === k).length;
  const L = lengthOf(xy), open = cuts.map(([a, b]) => [clamp(a, 0, L), clamp(b, 0, L)]);
  let widest = 0;
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1].d, b = r[i].d;
    if (!open.some(([x, y]) => a >= x - NEAR && b <= y + NEAR)) widest = Math.max(widest, b - a);
  }
  return { ends: n("end"), corners: n("corner"), between: n("line"), gates: n("gate"), points: r.length - n("gate"), widest };
}
// "23: 2 ends, 3 corners, 18 between · 2.9 m apart at most"
export function rowNote(s, { posts = false } = {}) {
  const parts = [s.ends && `${s.ends} at the ends`, s.corners && `${s.corners} at corners`, s.between && `${s.between} between`].filter(Boolean);
  return `${s.points} ${posts ? (s.points === 1 ? "post" : "posts") : s.points === 1 ? "point" : "points"}${parts.length ? `: ${parts.join(", ")}` : ""}`
    + (s.gates ? ` (and ${s.gates} gate post${s.gates === 1 ? "" : "s"})` : "") + (s.widest ? ` · ${s.widest.toFixed(1)} m apart at most` : "");
}

// A line reshaped under a point on it: the point keeps its distance from the end it was measured
// from (A, or if the line was turned round, the old A that is now B) and slides in to stay on a
// shortened line. A row needs nothing: it is spread along the line as it runs.
export function refitPoint(on, xy, flipped = false) {
  if (isRow(on)) return { on, slid: 0 };
  const L = lengthOf(xy), want = flipped ? L - on.at : on.at, at = cm(clamp(want, 0, L));
  return { on: { ...on, at }, slid: Math.abs(at - want) };
}

// The working copy behind the point bar: where along the line the point is, with undo.
export class PointEdit {
  constructor(xy, at) {
    this.xy = xy; this.L = lengthOf(xy);
    this.at = cm(clamp(at, 0, this.L)); this.orig = this.at;
    this.gps = false; this.stack = [];
  }
  get fromB() { return cm(this.L - this.at); }
  set(d, { gps = false } = {}) { this.stack.push({ at: this.at, gps: this.gps }); this.at = cm(clamp(d, 0, this.L)); if (gps) this.gps = true; return true; }
  setFromA(d) { return d >= 0 && d <= this.L + 0.005 && this.set(d); }
  setFromB(d) { return d >= 0 && d <= this.L + 0.005 && this.set(this.L - d); }
  undo() { const s = this.stack.pop(); if (!s) return false; Object.assign(this, s); return true; }
  changed() { return this.at !== this.orig; }
}

// what a point on a line is usually called, offered as the name is typed
export const POINT_NAMES = ["Post", "Strainer post", "Inspection hatch", "Rodding eye", "Valve", "Tap", "Junction", "Sprinkler", "Light", "Marker"];
