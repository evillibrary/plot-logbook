// Gates: an opening in a fence, `at` metres along the fence from its end A to the gate's post
// nearer A, `width` metres wide, and what closes it: one leaf or two on hinges, a sliding leaf,
// or nothing. Pure geometry, shared by the fold (a gate sits on its fence wherever the fence
// now runs), the map (the gap, the leaves and their swing) and the gate bar.
//
// Distances run along the fence, corners and all, as a tape run along the wire would. Lengths
// are taken with sqrt rather than Math.hypot so that tools/fold.py, which mirrors gateGeom,
// comes to the same numbers to the last bit.

export const GATE_KINDS = [
  { id: "single",  name: "Single swing",     widths: [2.4, 3, 3.6, 4.2], width: 3.6 },
  { id: "double",  name: "Double swing",     widths: [3.6, 4.2, 4.8, 6],  width: 4.8 },
  { id: "sliding", name: "Sliding",          widths: [3, 4, 5, 6],        width: 4 },
  { id: "walk",    name: "Walk-through",     widths: [0.9, 1.2],          width: 1.2 },
  { id: "opening", name: "Opening, no gate", widths: [1, 2, 3, 4],        width: 3 },
];
export const GATE_KIND = Object.fromEntries(GATE_KINDS.map(k => [k.id, k]));
const MIN_WIDTH = 0.3;

const len = (a, b) => Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const cm = v => Math.round(v * 100) / 100;
const deg = v => Math.round(v * 1e7) / 1e7;

// the running length at each point
export function cumulative(xy) {
  const c = [0];
  for (let i = 1; i < xy.length; i++) c.push(c[i - 1] + len(xy[i - 1], xy[i]));
  return c;
}
export const lengthOf = xy => xy.length ? cumulative(xy)[xy.length - 1] : 0;

// where d metres along falls: on the side from point k to k + 1, a fraction t of the way
function locate(c, d) {
  const n = c.length - 1;
  if (n < 1) return { k: 0, t: 0 };
  let k = 0;
  while (k < n - 1 && c[k + 1] < d) k++;
  const s = c[k + 1] - c[k];
  return { k, t: s > 0 ? clamp((d - c[k]) / s, 0, 1) : 0 };
}
// a position turned into a point on any list that runs alongside the line: its xy, or its ll
const point = (list, { k, t }) => t === 0 || k + 1 >= list.length ? list[k] : lerp(list[k], list[k + 1], t);
// the stretch from d0 to d1 metres, with the corners in between
function stretch(c, d0, d1) {
  const a = locate(c, d0), b = locate(c, d1), out = [a];
  for (let j = a.k + 1; j <= b.k; j++) out.push({ k: j, t: 0 });
  out.push(b);
  return out;
}

export function along(xy, d) { const c = cumulative(xy); return point(xy, locate(c, clamp(d, 0, c[c.length - 1]))); }
export function slice(xy, d0, d1) { const c = cumulative(xy), L = c[c.length - 1]; return stretch(c, clamp(d0, 0, L), clamp(d1, 0, L)).map(q => point(xy, q)); }

// how far along the line the point nearest p is
export function project(xy, p) {
  const c = cumulative(xy);
  let best = Infinity, at = 0;
  for (let k = 0; k < xy.length - 1; k++) {
    const a = xy[k], b = xy[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1) : 0;
    const d = len(p, [a[0] + t * dx, a[1] + t * dy]);
    if (d < best) { best = d; at = c[k] + t * (c[k + 1] - c[k]); }
  }
  return at;
}

// the line with the stretches in `cuts` ([[d0, d1], …]) taken out: the fence with its gateways open
export function gaps(xy, cuts) {
  const L = lengthOf(xy), out = [];
  let from = 0;
  for (const [d0, d1] of [...cuts].sort((a, b) => a[0] - b[0])) {
    if (d0 > from) out.push(slice(xy, from, Math.min(d0, L)));
    from = Math.max(from, d1);
  }
  if (from < L) out.push(slice(xy, from, L));
  return out;
}

// The opening as a line of its own, for the fold: xy and ll found at the same places along
// the fence, so no projection is needed, rounded to the centimetre and 1e-7 degree.
export function gateGeom(fence, gate) {
  const c = cumulative(fence.xy), L = c[c.length - 1];
  const withLL = Array.isArray(fence.ll) && fence.ll.length === fence.xy.length;
  const xy = [], ll = [];
  for (const q of stretch(c, clamp(gate.at, 0, L), clamp(gate.at + gate.width, 0, L))) {
    const p = point(fence.xy, q).map(cm);
    if (xy.length && p[0] === xy[xy.length - 1][0] && p[1] === xy[xy.length - 1][1]) continue;
    xy.push(p);
    if (withLL) ll.push(point(fence.ll, q).map(deg));
  }
  return withLL ? { type: "LineString", xy, ll } : { type: "LineString", xy };
}

// What to draw: the two posts, and by kind the leaves as they hang closed, the arc each sweeps
// opening (with the ground it needs, and where it stands open), or a sliding leaf's track: it
// runs back past the post it slides to, a leaf's length, just off the fence on its `opens` side.
// `hinge` is the post a single leaf hangs on (the one nearer A or B), or the one a sliding leaf
// slides towards; `opens` is the side it swings to, left or right looking from A towards B.
export function gateDrawing(xy, gate) {
  const L = lengthOf(xy), d0 = clamp(gate.at, 0, L), d1 = clamp(gate.at + gate.width, 0, L);
  const p0 = along(xy, d0), p1 = along(xy, d1), w = len(p0, p1);
  const out = { posts: [p0, p1], mid: lerp(p0, p1, 0.5), leaves: [], open: [], arcs: [], sectors: [], track: null };
  if (w < 0.01 || gate.kind === "opening") return out;
  const side = gate.opens === "right" ? -1 : 1, n = [-(p1[1] - p0[1]) / w * side, (p1[0] - p0[0]) / w * side];
  const swing = (h, f) => {
    const r = len(h, f), a0 = Math.atan2(f[1] - h[1], f[0] - h[0]);
    const turn = Math.sign((f[0] - h[0]) * n[1] - (f[1] - h[1]) * n[0]) || 1;
    const arc = [];
    for (let i = 0; i <= 12; i++) { const a = a0 + turn * (Math.PI / 2) * i / 12; arc.push([h[0] + r * Math.cos(a), h[1] + r * Math.sin(a)]); }
    out.leaves.push([h, f]); out.arcs.push(arc); out.sectors.push([h, ...arc]); out.open.push([h, arc[arc.length - 1]]);
  };
  const [h, f] = gate.hinge === "B" ? [p1, p0] : [p0, p1];
  if (gate.kind === "double") { swing(p0, out.mid); swing(p1, out.mid); }
  else if (gate.kind === "sliding") {
    out.leaves.push([p0, p1]);
    const u = [(h[0] - f[0]) / w, (h[1] - f[1]) / w], off = 0.35;
    out.track = [[f[0] + n[0] * off, f[1] + n[1] * off], [h[0] + u[0] * w + n[0] * off, h[1] + u[1] * w + n[1] * off]];
  } else swing(h, f);
  return out;
}

// A fence reshaped under its gate: the gate keeps its distance from the end it was measured
// from — A, or if the line was turned round, the old A that is now B, when the hinge and the
// side it opens to turn with it — and slides in to fit if the fence got too short for it there.
export function refit(gate, xy, flipped = false) {
  const L = lengthOf(xy);
  const g = flipped ? { ...gate, at: L - gate.at - gate.width, hinge: gate.hinge === "B" ? "A" : "B", opens: gate.opens === "right" ? "left" : "right" } : { ...gate };
  const at = cm(clamp(g.at, 0, Math.max(0, L - g.width)));
  return { gate: { ...g, at }, slid: Math.abs(at - g.at), fits: g.width <= L + 0.005 };
}

// which side of the line, looking from A towards B, the point p lies at d metres along: a new
// gate opens towards the middle of the plot, into the property rather than out of it
export function sideOf(xy, d, p) {
  const L = lengthOf(xy), a = along(xy, clamp(d - 0.5, 0, L)), b = along(xy, clamp(d + 0.5, 0, L));
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0 ? "left" : "right";
}

// the gate record in a fixed order, so two copies compare as strings
export const normGate = g => ({ fence: g.fence, at: g.at, width: g.width, kind: g.kind ?? "single", hinge: g.hinge ?? "A", opens: g.opens ?? "left" });

// The working copy behind the gate bar: move the gate, or one post, set its width, kind, hinge
// and swing, with undo. Post 0 is the one nearer A, post 1 the one nearer B. As in the shape
// editor, a post taken in hand is let go once it has been put somewhere.
export class GateEdit {
  constructor(xy, gate) {
    this.xy = xy; this.L = lengthOf(xy);
    this.g = normGate(gate); this.fit();
    this.orig = JSON.stringify(this.g);
    this.sel = null; this.gps = false; this.stack = [];
  }
  fit() { const g = this.g; g.width = cm(clamp(g.width, MIN_WIDTH, Math.max(MIN_WIDTH, this.L))); g.at = cm(clamp(g.at, 0, Math.max(0, this.L - g.width))); }
  change(fn, { gps = false } = {}) { this.stack.push({ g: { ...this.g }, sel: this.sel, gps: this.gps }); fn(this.g); this.fit(); this.sel = null; if (gps) this.gps = true; return true; }
  undo() { const s = this.stack.pop(); if (!s) return false; Object.assign(this, s); return true; }
  select(i) { this.sel = i == null || this.sel === i ? null : i; }
  changed() { return JSON.stringify(this.g) !== this.orig; }
  get fromB() { return cm(this.L - this.g.at - this.g.width); }
  postAlong(i) { return i === 0 ? this.g.at : this.g.at + this.g.width; }

  centreAt(d, o) { return this.change(g => { g.at = d - g.width / 2; }, o); }
  postAt(i, d, o) {
    return this.change(g => { const other = i === 0 ? g.at + g.width : g.at, lo = Math.min(d, other), hi = Math.max(d, other); g.at = lo; g.width = Math.max(MIN_WIDTH, hi - lo); }, o);
  }
  // a new width keeps the post nearer A where it is, unless that would run the gate off B
  setWidth(w) { return w >= MIN_WIDTH && w <= this.L && this.change(g => { g.width = w; }); }
  setFromA(d) { return d >= 0 && d <= this.L - this.g.width + 0.005 && this.change(g => { g.at = d; }); }
  setFromB(d) { return d >= 0 && d <= this.L - this.g.width + 0.005 && this.change(g => { g.at = this.L - d - g.width; }); }
  // a gate still at the width its old kind offered first takes the new kind's
  setKind(k) { return !!GATE_KIND[k] && this.change(g => { if (g.width === GATE_KIND[g.kind]?.width) g.width = GATE_KIND[k].width; g.kind = k; }); }
  flipHinge() { return this.change(g => { g.hinge = g.hinge === "B" ? "A" : "B"; }); }
  flipOpens() { return this.change(g => { g.opens = g.opens === "right" ? "left" : "right"; }); }
}
