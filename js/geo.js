// Geometry in the plot's metric grid ([E, N] metres). Plain Euclid: the grid is a
// transverse Mercator with k = 1 at the central meridian, so within a few km it is true scale.
export function lineLength(xy) {
  let d = 0;
  for (let i = 1; i < xy.length; i++) d += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
  return d;
}

// Shoelace; works whether or not the ring is closed.
export function polygonArea(xy) {
  let a = 0;
  const n = xy.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function centroid(xy) {
  const pts = xy.length > 1 && xy[0][0] === xy[xy.length - 1][0] && xy[0][1] === xy[xy.length - 1][1] ? xy.slice(0, -1) : xy;
  const s = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
}

const ring = xy => xy.length > 1 && xy[0][0] === xy[xy.length - 1][0] && xy[0][1] === xy[xy.length - 1][1] ? xy.slice(0, -1) : xy;

function inside([x, y], r) {                      // ray casting
  let hit = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function toEdge([x, y], r) {                      // distance to the nearest edge
  let best = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    const dx = xj - xi, dy = yj - yi, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (xi + t * dx), y - (yi + t * dy)));
  }
  return best;
}

// Where to put an area's icon: the interior point furthest from any edge, found by a coarse
// grid and then refined. The centroid is no good on its own — on an L-shaped or horseshoe
// paddock it lands outside the polygon, and the icon would sit on someone else's ground.
export function interiorPoint(xy) {
  const r = ring(xy);
  const xs = r.map(p => p[0]), ys = r.map(p => p[1]);
  let lo = [Math.min(...xs), Math.min(...ys)], hi = [Math.max(...xs), Math.max(...ys)];
  let best = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], bestD = -Infinity;
  for (let pass = 0; pass < 3; pass++) {
    const stepX = (hi[0] - lo[0]) / 12, stepY = (hi[1] - lo[1]) / 12;
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
      const p = [lo[0] + i * stepX, lo[1] + j * stepY];
      if (!inside(p, r)) continue;
      const d = toEdge(p, r);
      if (d > bestD) { bestD = d; best = p; }
    }
    if (bestD < 0) break;                          // degenerate ring: fall back to the bbox centre
    lo = [best[0] - stepX, best[1] - stepY]; hi = [best[0] + stepX, best[1] + stepY];
  }
  return best;
}

export const fmtLength = m => m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(m < 10 ? 1 : 0)} m`;
const thousands = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
// a bed reads to a tenth of a square metre, as a short side reads to the decimetre
export const fmtArea = m2 => m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha (${thousands(m2)} m²)` : m2 < 100 ? `${m2.toFixed(1)} m²` : `${thousands(m2)} m²`;

// Human summary of a geometry: "point", "42 m", "1 250 m²"
export function describeGeom(geom) {
  if (!geom) return "no position";
  if (geom.type === "Point") return "point";
  if (geom.type === "LineString") return fmtLength(lineLength(geom.xy));
  if (geom.type === "Polygon") return fmtArea(polygonArea(geom.xy));
  return geom.type;
}
