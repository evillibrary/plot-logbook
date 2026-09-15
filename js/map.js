// The drawn plan: a Leaflet map in the plot's own metric grid (E, N), north-up, with the
// feature model rendered as vectors and imagery/boundaries/photos as toggleable overlays.
import { IdbTileLayer } from "./tiles.js";

const ll = xy => L.latLng(xy[1], xy[0]);           // [E, N] -> Leaflet latlng (lat = N, lng = E)
const lls = xys => xys.map(ll);
export const toXY = latlng => [latlng.lng, latlng.lat];

// Symbol table by feature type: fill colour, pixel radius for the tap target, canopy radius in metres.
const SYM = {
  structure: { fill: "#c9c3b5", stroke: "#5b564c" },
  fence:     { stroke: "#7a4b1e", weight: 3 },
  access:    { fill: "#e0892e", stroke: "#8a4a0c", line: { color: "#8a8378", weight: 3, dashArray: "6 6" } },
  yard:      { fill: "#b7ae9c", stroke: "#6d6455" },
  water:     { fill: "#3f8fd8", stroke: "#1b4f86", line: { color: "#3f8fd8", weight: 3, dashArray: "2 6" } },
  tree:      { fill: "#3e8a3a", stroke: "#1f4d1c", canopy: 3 },
  planting:  { fill: "#6fbf5a", stroke: "#2b6e24", canopy: 1.2 },
  memorial:  { fill: "#8d6bb8", stroke: "#4c3470" },
  vegetation:{ fill: "#9cc48c", stroke: "#4f7a45", line: { color: "#4f7a45", weight: 2, dashArray: "1 5" } },
  history:   { fill: "#c9a978", stroke: "#7d6238", line: { color: "#7d6238", weight: 2, dashArray: "4 4" } },
  beacon:    { fill: "#222", stroke: "#000", r: 4 },
  boundary:  { stroke: "#c33", weight: 2 },
  default:   { fill: "#999", stroke: "#444" },
};
const CONF = { high: "#2e9e4e", medium: "#e2a020", low: "#d9433b" };

export function buildMap(container, plot, grid, opts = {}) {
  const [oe, on] = grid.origin, m0 = grid.m_per_px_zoom0;
  const crs = L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(1 / m0, -oe / m0, -1 / m0, on / m0),
  });
  const map = L.map(container, { crs, zoomSnap: 0, zoomDelta: 0.5, minZoom: -2, maxZoom: 4.5, attributionControl: false, zoomControl: false });
  L.control.zoom({ position: "bottomleft" }).addTo(map);
  L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);

  const groups = {};
  const g = name => (groups[name] ??= L.layerGroup());
  const byId = new Map();
  let confidenceMode = false;

  const label = (layer, text, cls = "") => layer.bindTooltip(text, { permanent: true, direction: "right", offset: [8, 0], className: `lbl ${cls}`, interactive: false });

  function pointStyle(f) {
    const s = SYM[f.type] ?? SYM.default;
    return { radius: s.r ?? 7, fillColor: s.fill, fillOpacity: 0.95, color: confidenceMode ? (CONF[f.confidence] ?? "#888") : s.stroke, weight: confidenceMode ? 3 : 1.5 };
  }

  function draw(f, group) {
    const s = SYM[f.type] ?? SYM.default;
    const xy = f.geom.xy;
    let layer;
    if (f.geom.type === "Point") {
      if (s.canopy) L.circle(ll(xy), { radius: s.canopy, color: s.stroke, weight: 1, fillColor: s.fill, fillOpacity: 0.35, interactive: false }).addTo(group);
      layer = L.circleMarker(ll(xy), pointStyle(f));
      label(layer, f.name);
    } else if (f.geom.type === "LineString") {
      layer = L.polyline(lls(xy), s.line ?? { color: s.stroke, weight: s.weight ?? 2 });
      if (f.type !== "fence") label(layer, f.name);
    } else {
      layer = L.polygon(lls(xy), { color: s.stroke, weight: 1.5, fillColor: s.fill, fillOpacity: 0.9 });
      label(layer, f.name);
    }
    layer.feature = f;
    layer.on("click", e => { L.DomEvent.stop(e); opts.onSelect?.(f, layer); });
    layer.addTo(group);
    byId.set(f.id, layer);
    return layer;
  }

  // --- base: zones, context, features ---
  for (const z of plot.zones ?? []) {
    L.polygon(lls(z.geom.xy), { stroke: false, fillColor: z.zone === "forest" ? "#b9cf9c" : "#dfe9c8", fillOpacity: 1, interactive: false }).addTo(g("zones"));
  }
  for (const c of plot.context ?? []) {
    if (c.geom.type === "Polygon") {
      const p = L.polygon(lls(c.geom.xy), { color: "#b9b4a8", weight: 1, fill: false, interactive: false }).addTo(g("context"));
      label(p, c.name.replace(/\s*\(.*\)$/, ""), "parcel");
    } else if (c.geom.type === "LineString") {
      const p = L.polyline(lls(c.geom.xy), { color: "#a39e93", weight: 5, opacity: 0.6, interactive: false }).addTo(g("context"));
      label(p, c.name, "street");
    }
  }
  const boundaryTypes = new Set(["boundary", "beacon"]);
  for (const f of plot.features) {
    if (f.type === "fence") draw(f, g("fences"));
    else if (boundaryTypes.has(f.type)) draw(f, /CSG/i.test(f.name) ? g("csg") : g("sg"));
    else draw(f, g("features"));
  }
  for (const p of plot.photoPositions ?? []) {
    const m = L.circleMarker(ll(p.geom.xy), { radius: 4, color: "#b7791f", weight: 1, fillColor: "#f4c542", fillOpacity: 0.9 });
    m.bindTooltip(`${p.name}<br><small>${p.taken}</small>`, { direction: "top" });
    m.addTo(g("photos"));
  }
  // beacons should sit above the polygon in the same group; Leaflet draws in insertion order, fine.

  g("zones").addTo(map); g("context").addTo(map); g("features").addTo(map); g("fences").addTo(map);
  g("zones").setZIndex?.(1);

  // --- overlays ---
  let ortho = null;
  const overlays = {
    ortho: { on: v => { orthoOn = v; setOrthoMode(v); if (!ortho) return; v ? ortho.addTo(map) : ortho.remove(); }, opacity: v => ortho?.setOpacity(v) },
    fences: { on: v => v ? g("fences").addTo(map) : g("fences").remove() },
    csg: { on: v => v ? g("csg").addTo(map) : g("csg").remove() },
    sg: { on: v => v ? g("sg").addTo(map) : g("sg").remove() },
    photos: { on: v => v ? g("photos").addTo(map) : g("photos").remove() },
    context: { on: v => v ? g("context").addTo(map) : g("context").remove() },
    labels: { on: v => container.classList.toggle("no-labels", !v) },
    confidence: { on: v => { confidenceMode = v; for (const l of byId.values()) if (l.setStyle && l.feature.geom.type === "Point") l.setStyle(pointStyle(l.feature)); } },
  };
  let orthoOn = false;
  // with imagery under the plan, the ground zones go and filled shapes become outlines
  function setOrthoMode(v) {
    v ? g("zones").remove() : g("zones").addTo(map);
    for (const l of byId.values()) {
      if (l.feature.geom.type === "Polygon" && l.feature.type !== "boundary") l.setStyle({ fillOpacity: v ? 0.1 : 0.9, weight: v ? 2.5 : 1.5 });
    }
  }
  function setImagery(id, manifest) {
    if (ortho) ortho.remove();
    ortho = new IdbTileLayer(id, manifest, { opacity: 0.85, pane: "tilePane" });
    if (orthoOn) ortho.addTo(map);
  }

  // label density by zoom
  const onZoom = () => { const z = map.getZoom(); container.classList.toggle("z-lo", z < 0.6); container.classList.toggle("z-hi", z >= 1.5); };
  map.on("zoomend", onZoom);

  // --- locate me ---
  let me = null, meRing = null, watchId = null;
  function locate(project) {
    if (!navigator.geolocation) return opts.onStatus?.("no GPS on this device");
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; me?.remove(); meRing?.remove(); me = meRing = null; return; }
    watchId = navigator.geolocation.watchPosition(pos => {
      const xy = project(pos.coords.longitude, pos.coords.latitude);
      const p = ll(xy);
      if (!me) {
        meRing = L.circle(p, { radius: pos.coords.accuracy, color: "#1a73e8", weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
        me = L.marker(p, { icon: L.divIcon({ className: "", html: '<div class="locate-dot"></div>', iconSize: [16, 16] }), interactive: false }).addTo(map);
        map.setView(p, Math.max(map.getZoom(), 1.5));
      } else { me.setLatLng(p); meRing.setLatLng(p).setRadius(pos.coords.accuracy); }
      opts.onLocate?.(xy, pos.coords.accuracy);
    }, err => opts.onStatus?.(`GPS: ${err.message}`), { enableHighAccuracy: true, maximumAge: 5000 });
  }
  const myPosition = () => me ? toXY(me.getLatLng()) : null;

  const home = () => map.fitBounds([ll(plot.home.bounds[0]), ll(plot.home.bounds[1])], { padding: [10, 10] });
  home(); onZoom();

  return { map, groups, byId, overlays, setImagery, locate, myPosition, home, ll, redraw: () => { for (const l of byId.values()) if (l.setStyle && l.feature.geom.type === "Point") l.setStyle(pointStyle(l.feature)); } };
}
