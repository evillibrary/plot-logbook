// Drawing and reshaping a line or an area one point at a time: add the next point, move one,
// add a corner, take one out, set a side to a length, swap which end is A, start again. Pure
// operations on a working copy with undo; nothing is recorded until the caller saves geom().
// map.js draws the handles, app.js the bar. A new line or area is the same thing begun with no
// points, so drawing and reshaping work alike.
//
// One rule for where a tap goes: with no point in hand, it adds the next point after the end
// (after B, or after an area's last corner); with one in hand, that point goes there and is let
// go, so the tap after adds again.
//
// A line's first point is its end A and its last is B (gates will be measured from A).

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const copy = pts => pts.map(p => [p[0], p[1]]);
const openRing = xy => xy.length > 1 && xy[0][0] === xy.at(-1)[0] && xy[0][1] === xy.at(-1)[1] ? xy.slice(0, -1) : xy;

export class ShapeEdit {
  constructor(geom) {
    this.closed = geom.type === "Polygon";
    this.pts = copy(this.closed ? openRing(geom.xy) : geom.xy);
    this.gps = this.pts.map(() => false);            // which points are GPS fixes rather than taps
    this.orig = copy(this.pts);
    this.sel = null;
    this.last = null;                                // the point placed or added last, for the readout
    this.joined = null;                              // the line the last placement landed on
    this.flipped = false;                            // turned round, so a fence's gates are measured from the other end
    this.stack = [];
  }
  get n() { return this.pts.length; }
  get min() { return this.closed ? 3 : 2; }
  get ring() { return this.closed && this.n >= 3; }  // an area still being drawn is a line until it has three corners

  snapshot() { this.stack.push({ pts: copy(this.pts), gps: [...this.gps], sel: this.sel, last: this.last, flipped: this.flipped }); }
  undo() {
    const s = this.stack.pop(); if (!s) return false;
    Object.assign(this, { pts: s.pts, gps: s.gps, sel: s.sel, last: s.last, flipped: s.flipped, joined: null });
    return true;
  }
  select(i) { this.sel = i == null || i < 0 || i >= this.n ? null : i; this.joined = null; }

  // the next point, after B (an area's after its last corner); returns its index
  add(p, { gps = false, joined = null } = {}) {
    this.snapshot();
    this.pts.push([p[0], p[1]]); this.gps.push(gps);
    this.sel = null; this.last = this.n - 1; this.joined = joined;
    return this.last;
  }
  // put point i at p and let go of it
  move(i, p, { gps = false, joined = null } = {}) {
    this.snapshot();
    this.pts[i] = [p[0], p[1]]; this.gps[i] = gps;
    this.sel = null; this.last = i; this.joined = joined;
  }
  // a new corner halfway along the side that starts at point i, in hand ready to move; returns its index
  insertAfter(i) {
    this.snapshot();
    const a = this.pts[i], b = this.pts[(i + 1) % this.n];
    this.pts.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); this.gps.splice(i + 1, 0, false);
    this.sel = i + 1; this.last = i + 1; this.joined = null;
    return i + 1;
  }
  // any point can go; a shape with too few left simply cannot be saved until more are added
  remove(i) {
    if (i == null || i < 0 || i >= this.n) return false;
    this.snapshot();
    this.pts.splice(i, 1); this.gps.splice(i, 1);
    this.sel = null; this.last = null; this.joined = null;
    return true;
  }
  // every point gone, to draw it afresh (one step, so ↶ Undo brings the shape back)
  restart() {
    if (!this.n) return false;
    this.snapshot();
    Object.assign(this, { pts: [], gps: [], sel: null, last: null, joined: null });
    return true;
  }
  // The point a side is measured from: the one before (the next, for end A).
  anchorOf(i) {
    if (this.closed) return (i - 1 + this.n) % this.n;
    return i === 0 ? 1 : i - 1;
  }
  // Slide point i along its side so that side is `len` metres, the anchor staying put.
  setLength(i, len) {
    if (this.n < 2) return false;
    const a = this.pts[this.anchorOf(i)], p = this.pts[i], d = dist(a, p);
    if (!(len > 0) || d === 0) return false;
    this.move(i, [a[0] + (p[0] - a[0]) * len / d, a[1] + (p[1] - a[1]) * len / d], { gps: false });
    return true;
  }
  reverse() {
    if (this.closed) return false;
    this.snapshot();
    this.pts.reverse(); this.gps.reverse(); this.flipped = !this.flipped;
    if (this.sel != null) this.sel = this.n - 1 - this.sel;
    if (this.last != null) this.last = this.n - 1 - this.last;
    return true;
  }

  label(i) {
    if (this.closed) return `Corner ${i + 1}`;
    return i === 0 ? "A" : i === this.n - 1 ? "B" : `Corner ${i}`;
  }
  // every side as { i, j, len }: from point i to point j
  sides() {
    const out = [];
    for (let i = 0; i < (this.ring ? this.n : this.n - 1); i++) { const j = (i + 1) % this.n; out.push({ i, j, len: dist(this.pts[i], this.pts[j]) }); }
    return out;
  }
  // the sides that meet at point i, the one towards A first
  sidesAt(i) { return this.sides().filter(s => s.i === i || s.j === i).sort((x, y) => (x.j === i ? -1 : 1) - (y.j === i ? -1 : 1)); }
  gpsCount() { return this.gps.filter(Boolean).length; }

  changed() { return this.pts.length !== this.orig.length || this.pts.some((p, k) => dist(p, this.orig[k]) > 0.005); }
  onlyReversed() { const r = [...this.orig].reverse(); return this.pts.length === r.length && this.pts.every((p, k) => dist(p, r[k]) <= 0.005); }
  // a new shape needs its points; a reshaped one needs a change as well
  canSave(isNew) { return this.n >= this.min && (isNew || this.changed()); }
  // A GPS fix makes the shape phone-GPS evidence; a point placed on the map makes it medium;
  // turning it round (A and B swapped) says nothing new about where it is.
  confidence(current) { return this.gpsCount() ? "low" : this.onlyReversed() ? current : "medium"; }
  geom() {
    const xy = this.pts.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]);
    return this.closed ? { type: "Polygon", xy: [...xy, xy[0]] } : { type: "LineString", xy };
  }
}

// The nearest point on any of the lines within tol metres: a corner of one if any is that
// close, so fences meet exactly; else the nearest point along the nearest one.
export function joinTo(p, lines, tol) {
  let best = null;
  for (const l of lines) for (const q of l.xy) {
    const d = dist(p, q);
    if (d <= tol && (!best || d < best.d)) best = { p: [q[0], q[1]], d, kind: "corner", id: l.id, name: l.name };
  }
  if (best) return best;
  for (const l of lines) for (let k = 1; k < l.xy.length; k++) {
    const a = l.xy[k - 1], b = l.xy[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    const f = [a[0] + t * dx, a[1] + t * dy], d = dist(p, f);
    if (d <= tol && (!best || d < best.d)) best = { p: f, d, kind: "line", id: l.id, name: l.name };
  }
  return best;
}
