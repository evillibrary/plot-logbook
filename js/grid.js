// The planning grid: squares lined up with a line on the ground (a boundary fence) and counted
// in metres from the corner post where it meets a second line, so a square on the map is a
// tape-measure distance on site. Pure geometry in the plot's metric grid ([E, N] metres);
// map.js draws it and app.js snaps taps to it.
//
// A frame is { o, u, v, along, from }: o the zero corner, v a unit vector along the first line,
// u a unit vector square to it pointing into the property, and along/from the two lines' names
// (null for the north-up fallback when the data names no lines, or they are gone).

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = a => Math.hypot(a[0], a[1]);

function toSegment(p, a, b) {
  const d = sub(b, a), l2 = dot(d, d);
  const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / l2)) : 0;
  return len(sub(p, [a[0] + t * d[0], a[1] + t * d[1]]));
}
const toLine = (p, xy) => Math.min(...xy.slice(1).map((q, i) => toSegment(p, xy[i], q)));

// spec is features.json's `grid`: { along: id, from: id }. features: Map of the live features.
// The corner is whichever end of `along` lies nearer `from`; the direction is that line's
// overall run from end to end, so a kink in one panel does not tilt the whole grid.
export function gridFrame(spec, features, fallbackOrigin) {
  const usable = f => f && !f.deleted && f.geom?.type === "LineString" && f.geom.xy.length >= 2;
  const A = features.get(spec?.along), B = features.get(spec?.from);
  if (usable(A) && usable(B)) {
    const a = A.geom.xy, b = B.geom.xy;
    let o = a[0], far = a.at(-1);
    if (toLine(far, b) < toLine(o, b)) [o, far] = [far, o];
    const run = sub(far, o), l = len(run);
    if (l > 0) {
      const v = [run[0] / l, run[1] / l];
      let u = [v[1], -v[0]];
      const bFar = len(sub(b[0], o)) > len(sub(b.at(-1), o)) ? b[0] : b.at(-1);
      if (dot(sub(bFar, o), u) < 0) u = [-u[0], -u[1]];
      return { o: [...o], u, v, along: A.name, from: B.name };
    }
  }
  return { o: [...fallbackOrigin], u: [1, 0], v: [0, 1], along: null, from: null };
}

export const toGrid = (fr, p) => { const d = sub(p, fr.o); return [dot(d, fr.u), dot(d, fr.v)]; };
export const fromGrid = (fr, [a, b]) => [fr.o[0] + a * fr.u[0] + b * fr.v[0], fr.o[1] + a * fr.u[1] + b * fr.v[1]];
export function snapToGrid(fr, p, size) {
  const [a, b] = toGrid(fr, p);
  return fromGrid(fr, [Math.round(a / size) * size, Math.round(b / size) * size]);
}

// The rectangle, in grid terms, that holds every point given.
export function gridExtent(fr, xyLists) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const xy of xyLists) for (const p of xy) {
    const [a, b] = toGrid(fr, p);
    u0 = Math.min(u0, a); u1 = Math.max(u1, a); v0 = Math.min(v0, b); v1 = Math.max(v1, b);
  }
  return { u0, u1, v0, v1 };
}

// Heavier lines every 10 m where the step divides 10, otherwise every fifth line.
const majorOf = s => 10 % s === 0 && s < 10 ? 10 : s * 5;

// Which lines to draw at this zoom. Where the chosen size would put lines closer than minPx on
// screen, the next coarser step instead, so zoomed out the grid thins rather than going grey.
// `label` is how often a line gets its distance written on it: the finest drawn multiple with
// room for the writing.
export function gridLevels(size, pxPerM, minPx = 8, labelPx = 56) {
  let step = size;
  while (step * pxPerM < minPx && step < 1e5) step = majorOf(step);
  const major = majorOf(step);
  const label = [step, 2 * step, 5 * step, major, 2 * major, 5 * major, 10 * major]
    .sort((x, y) => x - y).find(c => c * pxPerM >= labelPx) ?? 10 * major;
  return { step, major, label, thinned: step !== size };
}

// Every line inside the extent at multiples of `step` from the corner. A "u" line has a fixed
// distance across (it runs along, parallel to the first line); a "v" line a fixed distance along.
export function gridLines(fr, ext, step, major, cap = 4000) {
  const out = [];
  for (const [dir, lo, hi] of [["u", ext.u0, ext.u1], ["v", ext.v0, ext.v1]]) {
    const k0 = Math.ceil(lo / step - 1e-9), k1 = Math.floor(hi / step + 1e-9);
    if (k1 - k0 > cap) continue;                         // a runaway extent: draw nothing rather than hang
    for (let k = k0; k <= k1; k++) {
      const val = k * step || 0;                         // never -0: an extent a hair below zero starts at k = -0
      const [a, b] = dir === "u" ? [[val, ext.v0], [val, ext.v1]] : [[ext.u0, val], [ext.u1, val]];
      out.push({ dir, val, major: val % major === 0, a: fromGrid(fr, a), b: fromGrid(fr, b) });
    }
  }
  return out;
}

// Where segment a->b ({x, y} screen points) first enters the rectangle r, as a fraction of the
// way from a; null if it misses. (Liang–Barsky.) Grid labels sit there, so they stay on screen.
export function clipStart(a, b, r) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.x0], [dx, r.x1 - a.x], [-dy, a.y - r.y0], [dy, r.y1 - a.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return t0;
}

const metres = x => `${x < -0.05 ? "−" : ""}${Math.abs(x).toFixed(1)} m`;

// A position in tape-measure terms: "42.0 m along Side fence · 18.0 m in from it".
export function describeAt(fr, p) {
  const [a, b] = toGrid(fr, p);
  if (!fr.along) return `${metres(b)} N · ${metres(a)} E of the grid corner`;
  return `${metres(b)} along ${fr.along} · ${Math.abs(a).toFixed(1)} m ${a < -0.05 ? "outside it" : "in from it"}`;
}

export const gridLabel = val => val === 0 ? "0" : `${val < 0 ? "−" : ""}${Math.abs(val)} m`;
