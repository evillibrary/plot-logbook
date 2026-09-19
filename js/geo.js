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

export const fmtLength = m => m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(m < 10 ? 1 : 0)} m`;
const thousands = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
export const fmtArea = m2 => m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha (${thousands(m2)} m²)` : `${thousands(m2)} m²`;

// Human summary of a geometry: "point", "42 m", "1 250 m²"
export function describeGeom(geom) {
  if (!geom) return "no position";
  if (geom.type === "Point") return "point";
  if (geom.type === "LineString") return fmtLength(lineLength(geom.xy));
  if (geom.type === "Polygon") return fmtArea(polygonArea(geom.xy));
  return geom.type;
}
