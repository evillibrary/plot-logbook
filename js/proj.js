// Transverse Mercator on the WGS84 ellipsoid (Gauss-Krüger series, Snyder 1987 §8).
// Metres east/north of the central meridian; lon0 and false offsets come from the data source's
// crs block at runtime, so the app has no idea where in the world it is until it loads a plot.
const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const D2R = Math.PI / 180;

function meridianArc(phi) {
  const e4 = E2 * E2, e6 = e4 * E2;
  return A * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
    - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
    - (35 * e6 / 3072) * Math.sin(6 * phi));
}

export function makeProjection({ lon_0 = 0, k = 1, x_0 = 0, y_0 = 0 } = {}) {
  const lon0 = lon_0 * D2R;

  function forward(lon, lat) {                       // degrees -> [E, N]
    const phi = lat * D2R, dl = lon * D2R - lon0;
    const s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi);
    const N = A / Math.sqrt(1 - E2 * s * s);
    const T = t * t, C = EP2 * c * c, Ac = dl * c;
    const M = meridianArc(phi);
    const x = k * N * (Ac + (1 - T + C) * Ac ** 3 / 6
      + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Ac ** 5 / 120);
    const y = k * (M + N * t * (Ac * Ac / 2 + (5 - T + 9 * C + 4 * C * C) * Ac ** 4 / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Ac ** 6 / 720));
    return [x + x_0, y + y_0];
  }

  function inverse(E, N) {                            // [E, N] -> [lon, lat] degrees
    const x = (E - x_0) / k, M = (N - y_0) / k;
    const mu = M / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 ** 3 / 256));
    const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
      + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
    const C1 = EP2 * c * c, T1 = t * t;
    const N1 = A / Math.sqrt(1 - E2 * s * s);
    const R1 = A * (1 - E2) / Math.pow(1 - E2 * s * s, 1.5);
    const D = x / N1;
    const lat = phi1 - (N1 * t / R1) * (D * D / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6 / 720);
    const lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5 / 120) / c;
    return [lon / D2R, lat / D2R];
  }

  return { forward, inverse };
}
