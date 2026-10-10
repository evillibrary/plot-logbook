// Areas enclosed by fences: the ground a tap lands in, found from the fence lines themselves, and
// split into equal parts. Pure geometry in plot metres, shared by the map, the app and the tests.
//
// Fences are drawn by hand and meet only roughly: an end a few centimetres short of the fence it
// runs to, or past it. An end left free within `tol` metres of another fence is taken to meet it
// (a short join is added), an end that runs a little past a fence is trimmed off with everything
// else that leads nowhere, and what is left is a set of closed rings, one per enclosure: a planar
// graph walked face by face. Gateways count as fence: a paddock with a gate in it is still a
// paddock. A fenced ring standing free inside another enclosure (round a tree, say) is a hole in it.

const EPS = 1e-3;                                 // a millimetre: closer than this is one place
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const crs = (a, b) => a[0] * b[1] - a[1] * b[0];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function nearestOn(p, a, b) {
  const d = sub(b, a), l2 = dot(d, d);
  const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / l2)) : 0;
  return { p: lerp(a, b, t), t, d: dist(p, lerp(a, b, t)) };
}
// signed area (positive anticlockwise), measured from the ring's first point so big grid
// coordinates cost no precision; and the plain area
export function signedArea(ring) {
  if (ring.length < 3) return 0;
  const o = ring[0];
  let s = 0;
  for (let i = 1; i < ring.length - 1; i++) s += crs(sub(ring[i], o), sub(ring[i + 1], o));
  return s / 2;
}
export const ringArea = ring => Math.abs(signedArea(ring));
export function ringLength(ring) { let s = 0; for (let i = 0; i < ring.length; i++) s += dist(ring[i], ring[(i + 1) % ring.length]); return s; }
export function inRing(p, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
// where two segments cross: [t along the first, u along the second], ends included; null if they
// don't, or run parallel (an end lying on the other is found separately)
function cross(a, b, c, d) {
  const r = sub(b, a), q = sub(d, c), den = crs(r, q);
  if (Math.abs(den) < 1e-12 * Math.max(1, dot(r, r) * dot(q, q))) return null;
  const w = sub(c, a), t = crs(w, q) / den, u = crs(w, r) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? [Math.min(1, Math.max(0, t)), Math.min(1, Math.max(0, u))] : null;
}

// lines: [{id, name, xy}], the fences to enclose by. Returns the enclosures, each
// {key, ring (anticlockwise, open), holes, area, perimeter, lines (ids of the fences round it),
// edges (the fence each side from ring[k] to ring[k + 1] runs along; null for a join)},
// and the ends left free: {p, line, d, to}, d the gap to the nearest other fence (to).
export function buildFaces(lines, tol = 1) {
  const segs = [];
  for (const l of lines) for (let k = 1; k < l.xy.length; k++) if (dist(l.xy[k - 1], l.xy[k]) > EPS) segs.push({ a: l.xy[k - 1], b: l.xy[k], line: l.id });
  const nearest = (p, skip) => { let best = null; for (const s of segs) { if (s.line === skip) continue; const n = nearestOn(p, s.a, s.b); if (!best || n.d < best.d) best = { ...n, s }; } return best; };
  // the free ends: joined to a fence within tol, unless the line already runs across it there
  const gaps = [], joins = [];
  for (const l of lines) {
    if (l.xy.length < 2) continue;
    const ends = [[l.xy[0], l.xy[1]], [l.xy[l.xy.length - 1], l.xy[l.xy.length - 2]]];
    for (const [end, next] of ends) {
      const best = nearest(end, l.id);
      if (best && best.d <= EPS) continue;                                // on a fence already
      // an end that has run a little past a fence it meets: trimmed later, neither joined back nor a gap
      const reach = 2 * Math.max(tol, best?.d ?? 0);
      if (segs.some(s => s.line !== l.id && (() => { const x = cross(end, next, s.a, s.b); return x && dist(end, lerp(end, next, x[0])) <= reach; })())) continue;
      if (best && best.d <= tol) { joins.push({ a: end, b: best.p, line: null, join: true }); continue; }
      // a line whose two ends almost meet closes on itself
      const other = end === l.xy[0] ? l.xy[l.xy.length - 1] : l.xy[0];
      if (l.xy.length > 2 && dist(end, other) <= tol && end === l.xy[0]) { if (dist(end, other) > EPS) joins.push({ a: end, b: other, line: null, join: true }); continue; }
      if (l.xy.length > 2 && dist(end, other) <= tol) continue;
      // one gap between two fences, not one from each side of it
      if (!gaps.some(g => g.to === l.id && best && g.line === best.s.line && dist(g.p, end) <= g.d + EPS))
        gaps.push({ p: end, line: l.id, d: best?.d ?? Infinity, to: best?.s.line ?? null });
    }
  }
  const all = [...segs, ...joins];
  // every place two segments meet, as a fraction along each
  const at = all.map(() => [0, 1]);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const s = all[i], o = all[j];
    const x = cross(s.a, s.b, o.a, o.b);
    if (x) { at[i].push(x[0]); at[j].push(x[1]); }
    for (const [p, q, k] of [[o.a, s, i], [o.b, s, i], [s.a, o, j], [s.b, o, j]]) { const n = nearestOn(p, q.a, q.b); if (n.d <= EPS) at[k].push(n.t); }
  }
  // the places, one per millimetre cell
  const verts = [], grid = new Map();
  const vertex = p => {
    const gx = Math.round(p[0] / EPS), gy = Math.round(p[1] / EPS);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const v of grid.get(`${gx + dx},${gy + dy}`) ?? []) if (dist(verts[v], p) <= EPS) return v;
    verts.push([p[0], p[1]]); const k = `${gx},${gy}`; (grid.get(k) ?? grid.set(k, []).get(k)).push(verts.length - 1);
    return verts.length - 1;
  };
  const edges = new Map();                       // "u,v" (u < v) -> line id or null for a join
  all.forEach((s, i) => {
    const ts = [...new Set(at[i].map(t => Math.round(t * 1e9) / 1e9))].sort((x, y) => x - y);
    let prev = vertex(lerp(s.a, s.b, ts[0]));
    for (const t of ts.slice(1)) {
      const v = vertex(lerp(s.a, s.b, t));
      if (v !== prev) { const k = prev < v ? `${prev},${v}` : `${v},${prev}`; if (!edges.has(k) || edges.get(k) == null) edges.set(k, s.line); }
      prev = v;
    }
  });
  // trim whatever leads nowhere, until every place has two ways out at least
  const adj = verts.map(() => new Set());
  for (const k of edges.keys()) { const [u, v] = k.split(",").map(Number); adj[u].add(v); adj[v].add(u); }
  const stack = adj.map((s, v) => s.size < 2 ? v : -1).filter(v => v >= 0);
  while (stack.length) {
    const v = stack.pop();
    for (const w of adj[v]) { adj[w].delete(v); if (adj[w].size === 1) stack.push(w); }
    adj[v].clear();
  }
  const lineOf = (u, v) => edges.get(u < v ? `${u},${v}` : `${v},${u}`);
  // walk each face, keeping it on the left: the next way out is the first clockwise from the way in
  const order = adj.map((s, v) => [...s].sort((a, b) => Math.atan2(verts[a][1] - verts[v][1], verts[a][0] - verts[v][0]) - Math.atan2(verts[b][1] - verts[v][1], verts[b][0] - verts[v][0])));
  const seen = new Set(), cycles = [];
  for (let u = 0; u < verts.length; u++) for (const v0 of order[u]) {
    if (seen.has(`${u}>${v0}`)) continue;
    const cyc = [];
    let a = u, b = v0, guard = 0;
    while (!seen.has(`${a}>${b}`) && guard++ < 100000) {
      seen.add(`${a}>${b}`); cyc.push(a);
      const list = order[b], i = list.indexOf(a), c = list[(i - 1 + list.length) % list.length];
      a = b; b = c;
    }
    if (cyc.length >= 3) cycles.push(cyc);
  }
  // which places hang together, to tell a ring standing free inside an enclosure from one of its own sides
  const comp = verts.map((_, i) => i), find = i => comp[i] === i ? i : (comp[i] = find(comp[i]));
  for (let u = 0; u < verts.length; u++) for (const v of adj[u]) comp[find(u)] = find(v);
  const faces = [], outers = [];
  for (const c of cycles) {
    const ring = c.map(i => verts[i]), s = signedArea(ring);
    if (Math.abs(s) < 1e-6) continue;
    const ls = new Set(); c.forEach((v, k) => { const l = lineOf(v, c[(k + 1) % c.length]); if (l != null) ls.add(l); });
    if (s > 0) faces.push({ key: [...c].sort((x, y) => x - y).map(i => `${Math.round(verts[i][0] * 100)},${Math.round(verts[i][1] * 100)}`).join(";"), ring, holes: [], outer: ringArea(ring), lines: [...ls],
      edges: c.map((v, k) => lineOf(v, c[(k + 1) % c.length]) ?? null), comp: find(c[0]) });
    else outers.push({ ring: [...ring].reverse(), comp: find(c[0]) });
  }
  // each free-standing ring is a hole in the smallest enclosure round it
  for (const o of outers) {
    const home = faces.filter(f => f.comp !== o.comp && inRing(o.ring[0], f.ring)).sort((x, y) => x.outer - y.outer)[0];
    if (home) home.holes.push(o.ring);
  }
  for (const f of faces) { f.area = f.outer - f.holes.reduce((s, h) => s + ringArea(h), 0); f.perimeter = ringLength(f.ring); delete f.comp; }
  return { faces, gaps };
}
// the enclosure a point is in (the smallest, and not in one of its holes), or null
export function faceAt(faces, p) {
  return faces.filter(f => inRing(p, f.ring) && !f.holes.some(h => inRing(p, h))).sort((a, b) => a.outer - b.outer)[0] ?? null;
}

// --- dividing an enclosure into equal parts ---
// The part of a ring on one side of a line: the points with dot(n, p) <= c (keep "below") or >= c.
export function clipHalf(ring, n, c, below = true) {
  const out = [], side = p => (dot(n, p) - c) * (below ? 1 : -1);
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length], sp = side(p), sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) out.push(lerp(p, q, sp / (sp - sq)));
  }
  return out;
}
// the stretches of the line dot(n, p) = c that lie inside the ring
function chords(ring, n, c) {
  const along = [-n[1], n[0]], pts = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length], dp = dot(n, p) - c, dq = dot(n, q) - c;
    if ((dp < 0) !== (dq < 0)) pts.push(lerp(p, q, dp / (dp - dq)));
  }
  pts.sort((a, b) => dot(along, a) - dot(along, b));
  const out = [];
  for (let i = 0; i + 1 < pts.length; i += 2) if (dist(pts[i], pts[i + 1]) > EPS) out.push([pts[i], pts[i + 1]]);
  return out;
}
const unit = v => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
// In n strips of equal area, the cuts running along `dir` (a direction, [dx, dy]): parallel to a
// fence, give its direction; across it, give the direction at right angles. Each cut is found by
// halving until its strip is right to well under a square centimetre.
export function divideStrips(ring, dir, n) {
  const o = ring[0], r = ring.map(p => sub(p, o)), d = unit(dir), nv = [-d[1], d[0]], total = ringArea(r);
  const ds = r.map(p => dot(nv, p)), lo0 = Math.min(...ds), hi0 = Math.max(...ds);
  const cs = [];
  for (let k = 1; k < n; k++) {
    const want = total * k / n;
    let lo = lo0, hi = hi0;
    for (let it = 0; it < 100 && hi - lo > 1e-9; it++) { const m = (lo + hi) / 2; ringArea(clipHalf(r, nv, m)) < want ? lo = m : hi = m; }
    cs.push((lo + hi) / 2);
  }
  const back = p => [p[0] + o[0], p[1] + o[1]];
  const bounds = [lo0 - 1, ...cs, hi0 + 1];
  const parts = [];
  for (let k = 0; k < n; k++) { const part = clipHalf(clipHalf(r, nv, bounds[k + 1]), nv, bounds[k], false); parts.push({ ring: part.map(back), area: ringArea(part) }); }
  return { cuts: cs.flatMap(c => chords(r, nv, c).map(s => s.map(back))), parts, total };
}
// In n wedges of equal area from a point on the edge (a gate, a corner): each cut runs straight
// from it to the edge across the way. A cut that would leave the enclosure (round a bend in its
// edge) is flagged `outside`.
export function divideFan(ring, from, n) {
  const o = ring[0], r = ring.map(p => sub(p, o)), P = sub(from, o), total = ringArea(r);
  // the edge walked once round from the point nearest `from`
  let bi = 0, bt = 0, bd = Infinity;
  r.forEach((p, i) => { const x = nearestOn(P, p, r[(i + 1) % r.length]); if (x.d < bd) { bd = x.d; bi = i; bt = x.t; } });
  const start = lerp(r[bi], r[(bi + 1) % r.length], bt), path = [start];
  for (let k = 1; k <= r.length; k++) path.push(r[(bi + k) % r.length]);
  path.push(start);
  const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + dist(path[i - 1], path[i]));
  const L = cum[cum.length - 1];
  const pointAt = s => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const seg = cum[i] - cum[i - 1]; return lerp(path[i - 1], path[i], seg ? (s - cum[i - 1]) / seg : 0); };
  const piece = (s0, s1) => { const pts = [start, pointAt(s0)]; for (let i = 1; i < path.length; i++) if (cum[i] > s0 && cum[i] < s1) pts.push(path[i]); pts.push(pointAt(s1)); return pts; };
  const ss = [0];
  for (let k = 1; k < n; k++) {
    let lo = ss[ss.length - 1], hi = L;
    for (let it = 0; it < 100 && hi - lo > 1e-9; it++) { const m = (lo + hi) / 2; ringArea(piece(0, m)) < total * k / n ? lo = m : hi = m; }
    ss.push((lo + hi) / 2);
  }
  ss.push(L);
  const back = p => [p[0] + o[0], p[1] + o[1]];
  const cuts = ss.slice(1, -1).map(s => { const q = pointAt(s); return { seg: [back(start), back(q)], outside: leaves(r, start, q) }; });
  const parts = ss.slice(0, -1).map((s, k) => { const pc = piece(s, ss[k + 1]); return { ring: pc.map(back), area: ringArea(pc) }; });
  return { cuts: cuts.map(c => c.seg), outside: cuts.map(c => c.outside), parts, total };
}
// whether the straight run a→b leaves the ring between its ends
function leaves(ring, a, b) {
  for (let i = 0; i < ring.length; i++) {
    const x = cross(a, b, ring[i], ring[(i + 1) % ring.length]);
    if (x && x[0] > 1e-6 && x[0] < 1 - 1e-6) return true;
  }
  return !inRing(lerp(a, b, 0.5), ring);
}

// The direction of a fence along an enclosure: its longest side on that fence.
export function sideDir(face, line) {
  let best = null;
  face.ring.forEach((p, k) => { if (face.edges[k] !== line) return; const q = face.ring[(k + 1) % face.ring.length], l = dist(p, q); if (!best || l > best.l) best = { l, d: sub(q, p) }; });
  return best?.d ?? null;
}
// The corners of an enclosure worth fanning from: where its edge turns by more than 20°.
export function corners(face) {
  const r = face.ring, out = [];
  r.forEach((p, k) => {
    const a = r[(k - 1 + r.length) % r.length], b = r[(k + 1) % r.length], u = sub(p, a), v = sub(b, p);
    const turn = Math.abs(Math.atan2(crs(u, v), dot(u, v)));
    if (turn > Math.PI / 9) out.push({ p, k, lines: [face.edges[(k - 1 + r.length) % r.length], face.edges[k]] });
  });
  return out;
}
