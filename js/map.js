// The drawn plan: a Leaflet map in the plot's own metric grid (E, N), north-up, with the
// feature model rendered as vectors and imagery/boundaries as toggleable overlays.
import { IdbTileLayer } from "./tiles.js";
import { CATEGORIES, catOf, iconSvg } from "./categories.js";
import { lineLength, polygonArea, fmtLength, fmtArea, centroid, interiorPoint } from "./geo.js";

const ll = xy => L.latLng(xy[1], xy[0]);           // [E, N] -> Leaflet latlng (lat = N, lng = E)
const lls = xys => xys.map(ll);
export const toXY = latlng => [latlng.lng, latlng.lat];

const ICONS = {};
const iconFor = (cat, size = 28) => (ICONS[`${cat.id}:${size}`] ??= L.divIcon({
  className: "feat-icon", html: iconSvg(cat, size), iconSize: [size, size],
  iconAnchor: [size / 2, size / 2], tooltipAnchor: [size / 2, 0] }));

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
  const areaPins = [];
  const label = (layer, text, cls = "") => layer.bindTooltip(text, { permanent: true, direction: "right", offset: [8, 0], className: `lbl ${cls}`, interactive: false });

  // A feature swallowed taps that were meant for the map, so nothing could be placed inside
  // an area — a cow in a paddock, a crop in a bed. During a pick the tap falls through.
  function tapped(e, f, layer) {
    L.DomEvent.stop(e);
    if (opts.picking?.()) opts.onPick?.(toXY(e.latlng));
    else opts.onSelect?.(f, layer);
  }

  function styleFor(f) {
    const c = catOf(f);
    if (f.geom.type === "LineString") return f.type === "fences" ? { color: c.color, weight: 4 } : { color: c.color, weight: 3, dashArray: "2 7" };
    return { color: c.color, weight: 2, fillColor: c.color, fillOpacity: f.type === "structures" ? 0.85 : 0.25 };
  }

  function draw(f) {
    if (!f.geom) return null;
    const c = catOf(f), xy = f.geom.xy, group = g(c.id);
    let layer;
    if (f.geom.type === "Point") {
      layer = L.marker(ll(xy), { icon: iconFor(c), riseOnHover: true });
      label(layer, f.name);
    } else if (f.geom.type === "LineString") {
      layer = L.polyline(lls(xy), styleFor(f));
      label(layer, `${f.name} · ${fmtLength(lineLength(xy))}`);
    } else {
      layer = L.polygon(lls(xy), styleFor(f));
      const pin = L.marker(ll(interiorPoint(xy)), { icon: iconFor(c), riseOnHover: true, keyboard: false });
      areaPins.push({ pin, cat: c, xy });
      label(pin, f.type === "structures" ? f.name : `${f.name} · ${fmtArea(polygonArea(xy))}`);
      pin.feature = f;
      pin.on("click", e => tapped(e, f, layer));
      pin.addTo(group);
    }
    layer.feature = f;
    layer.on("click", e => tapped(e, f, layer));
    layer.addTo(group);
    byId.set(f.id, layer);
    return layer;
  }

  // --- base: zones, context, boundaries ---
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
  for (const b of plot.boundaries ?? []) {
    const grp = /CSG/i.test(b.name) ? g("csg") : g("sg");
    const style = { color: b.type === "beacon" ? "#222" : /CSG/i.test(b.name) ? "#d4b400" : "#c33", weight: 2, fill: false, dashArray: b.type === "boundary" && !/CSG/i.test(b.name) ? null : null };
    if (b.geom.type === "Point") { const m = L.circleMarker(ll(b.geom.xy), { radius: 4, color: "#222", fillColor: "#fff", fillOpacity: 1, weight: 2 }); m.bindTooltip(b.name, { direction: "top" }); m.addTo(grp); }
    else if (b.geom.type === "LineString") L.polyline(lls(b.geom.xy), style).addTo(grp);
    else L.polygon(lls(b.geom.xy), style).addTo(grp);
  }
  for (const f of plot.features) draw(f);

  g("zones").addTo(map); g("context").addTo(map);
  for (const c of CATEGORIES) g(c.id).addTo(map);

  // --- overlays ---
  let ortho = null, orthoOn = false;
  const toggle = name => v => v ? g(name).addTo(map) : g(name).remove();
  const overlays = {
    ortho: { on: v => { orthoOn = v; setOrthoMode(v && !!ortho); if (!ortho) return; v ? ortho.addTo(map) : ortho.remove(); }, opacity: v => ortho?.setOpacity(v) },
    csg: { on: toggle("csg") }, sg: { on: toggle("sg") }, context: { on: toggle("context") },
    labels: { on: v => container.classList.toggle("no-labels", !v) },
  };
  for (const c of CATEGORIES) overlays[c.id] = { on: toggle(c.id) };
  // with imagery under the plan, the ground zones go and filled shapes become outlines
  function setOrthoMode(v) {
    v ? g("zones").remove() : g("zones").addTo(map);
    for (const l of byId.values()) if (l.feature.geom?.type === "Polygon") l.setStyle({ fillOpacity: v ? 0.12 : styleFor(l.feature).fillOpacity, weight: v ? 3 : 2 });
  }
  function setImagery(id, manifest) {
    if (ortho) ortho.remove();
    ortho = new IdbTileLayer(id, manifest, { opacity: 0.85, pane: "tilePane" });
    if (orthoOn) ortho.addTo(map);
  }

  function fitAreaIcons() {
    for (const { pin, cat, xy } of areaPins) {
      const pts = xy.map(p => map.latLngToContainerPoint(ll(p)));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const across = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const size = Math.max(14, Math.min(28, Math.round(across * 0.85 / 2) * 2));
      if (pin._size !== size) { pin._size = size; pin.setIcon(iconFor(cat, size)); }
    }
  }
  const onZoom = () => { const z = map.getZoom(); container.classList.toggle("z-lo", z < 0.6); container.classList.toggle("z-hi", z >= 1.5); fitAreaIcons(); };
  map.on("zoomend", onZoom);

  // --- locate me ---
  let me = null, meRing = null, watchId = null;
  function locate(project) {
    if (!navigator.geolocation) return opts.onStatus?.("no GPS on this device");
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; me?.remove(); meRing?.remove(); me = meRing = null; opts.onLocate?.(null); return; }
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

  // --- drawing a line or an area: vertices in, preview shown, geometry out ---
  const drawing = { type: null, pts: [], shape: null, dots: [] };
  function startDraw(type) { cancelDraw(); drawing.type = type; }
  function addVertex(xy) {
    drawing.pts.push(xy);
    drawing.dots.push(L.circleMarker(ll(xy), { radius: 5, color: "#fff", weight: 2, fillColor: "#e0392b", fillOpacity: 1, interactive: false }).addTo(map));
    refreshDraw();
  }
  function undoVertex() { drawing.pts.pop(); drawing.dots.pop()?.remove(); refreshDraw(); }
  function refreshDraw() {
    drawing.shape?.remove(); drawing.shape = null;
    const p = drawing.pts;
    if (p.length < 2) return;
    const style = { color: "#e0392b", weight: 3, dashArray: "6 4", fillColor: "#e0392b", fillOpacity: 0.15, interactive: false };
    drawing.shape = (drawing.type === "area" && p.length >= 3 ? L.polygon(lls(p), style) : L.polyline(lls(p), style)).addTo(map);
  }
  function drawSummary() {
    const p = drawing.pts;
    if (drawing.type === "area") return p.length >= 3 ? fmtArea(polygonArea(p)) : `${p.length} of 3 points`;
    return p.length >= 2 ? fmtLength(lineLength(p)) : `${p.length} of 2 points`;
  }
  function finishDraw() {
    const p = drawing.pts.map(v => [+v[0].toFixed(2), +v[1].toFixed(2)]);
    const type = drawing.type;
    cancelDraw();
    if (type === "area") return p.length >= 3 ? { type: "Polygon", xy: [...p, p[0]] } : null;
    return p.length >= 2 ? { type: "LineString", xy: p } : null;
  }
  function cancelDraw() { drawing.shape?.remove(); for (const d of drawing.dots) d.remove(); Object.assign(drawing, { type: null, pts: [], shape: null, dots: [] }); }

  const center = f => f.geom.type === "Point" ? ll(f.geom.xy) : ll(centroid(f.geom.xy));
  const home = () => map.fitBounds([ll(plot.home.bounds[0]), ll(plot.home.bounds[1])], { padding: [10, 10] });
  home(); onZoom();

  return { map, groups, byId, overlays, setImagery, locate, home, ll, center,
    draw: { start: startDraw, add: addVertex, undo: undoVertex, finish: finishDraw, cancel: cancelDraw, summary: drawSummary, count: () => drawing.pts.length, active: () => !!drawing.type } };
}
