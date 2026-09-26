// The drawn plan: a Leaflet map in the plot's own metric grid (E, N), north-up, with the
// feature model rendered as vectors and imagery/boundaries as toggleable overlays.
import { IdbTileLayer } from "./tiles.js";
import { CATEGORIES, catOf, iconSvg } from "./categories.js";
import { lineLength, polygonArea, fmtLength, fmtArea, centroid, interiorPoint } from "./geo.js";
import { gridFrame, gridExtent, gridLevels, gridLines, clipStart, snapToGrid, gridLabel } from "./grid.js";
import { ShapeEdit, joinTo } from "./shape.js";

const ll = xy => L.latLng(xy[1], xy[0]);           // [E, N] -> Leaflet latlng (lat = N, lng = E)
const lls = xys => xys.map(ll);
export const toXY = latlng => [latlng.lng, latlng.lat];

const ICONS = {};
const iconFor = (cat, size = 28, planned = false) => (ICONS[`${cat.id}:${size}:${planned}`] ??= L.divIcon({
  className: planned ? "feat-icon planned" : "feat-icon", html: iconSvg(cat, size), iconSize: [size, size],
  iconAnchor: [size / 2, size / 2], tooltipAnchor: [size / 2, 0] }));

// The planning grid's lines: fine, and dark on the drawn plan but light over imagery.
const GRID_STYLE = {
  plan: { minor: { color: "#2b2a22", opacity: 0.2, weight: 0.8 }, major: { color: "#2b2a22", opacity: 0.38, weight: 1.3 } },
  ortho: { minor: { color: "#ffffff", opacity: 0.45, weight: 0.8 }, major: { color: "#ffffff", opacity: 0.75, weight: 1.3 } },
};

// tiling: the imagery's pixel grid (origin, metres per pixel at zoom 0), which fixes the CRS.
export function buildMap(container, plot, tiling, opts = {}) {
  const [oe, on] = tiling.origin, m0 = tiling.m_per_px_zoom0;
  const crs = L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(1 / m0, -oe / m0, -1 / m0, on / m0),
  });
  const map = L.map(container, { crs, zoomSnap: 0, zoomDelta: 0.5, minZoom: -2, maxZoom: 4.5, attributionControl: false, zoomControl: false });
  L.control.zoom({ position: "bottomleft" }).addTo(map);
  L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);
  // the drawn plan's ground, then the planning grid over it, then every feature (overlayPane, 400)
  map.createPane("zones").style.zIndex = 250;
  map.createPane("grid").style.zIndex = 350;
  map.getPane("grid").style.pointerEvents = "none";
  map.createPane("shape").style.zIndex = 660;          // reshaping handles: over every icon and name
  map.createPane("shapeArea").style.zIndex = 655;      // the size of an area being shaped, just under them
  map.getPane("shapeArea").style.pointerEvents = "none";

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

  // A planned feature (not built yet) is drawn dashed and faded, and carries the class the
  // Planned switch in Layers hides by.
  function styleFor(f) {
    const c = catOf(f), plan = f.planned ? { className: "planned" } : {};
    if (f.geom.type === "LineString") {
      if (f.type === "fences") return f.planned ? { color: c.color, weight: 3.5, opacity: 0.8, dashArray: "9 6", ...plan } : { color: c.color, weight: 4 };
      return { color: c.color, weight: 3, dashArray: "2 7", ...(f.planned ? { opacity: 0.65 } : {}), ...plan };
    }
    return { color: c.color, weight: 2, fillColor: c.color, fillOpacity: fillFor(f, false), ...(f.planned ? { dashArray: "7 5" } : {}), ...plan };
  }
  function fillFor(f, overImagery) {
    if (overImagery) return f.planned ? 0.06 : 0.12;
    return (f.type === "structures" ? 0.85 : 0.25) * (f.planned ? 0.4 : 1);
  }

  function draw(f) {
    if (!f.geom) return null;
    const c = catOf(f), xy = f.geom.xy, group = g(c.id);
    const cls = f.planned ? "planned" : "", tail = f.planned ? " · planned" : "";
    let layer;
    if (f.geom.type === "Point") {
      layer = L.marker(ll(xy), { icon: iconFor(c, 28, f.planned), riseOnHover: true });
      label(layer, f.name + tail, cls);
    } else if (f.geom.type === "LineString") {
      layer = L.polyline(lls(xy), styleFor(f));
      label(layer, `${f.name} · ${fmtLength(lineLength(xy))}${tail}`, cls);
    } else {
      layer = L.polygon(lls(xy), styleFor(f));
      const pin = L.marker(ll(interiorPoint(xy)), { icon: iconFor(c, 28, f.planned), riseOnHover: true, keyboard: false });
      areaPins.push({ pin, cat: c, xy, planned: !!f.planned });
      label(pin, (f.type === "structures" ? f.name : `${f.name} · ${fmtArea(polygonArea(xy))}`) + tail, cls);
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
    L.polygon(lls(z.geom.xy), { pane: "zones", stroke: false, fillColor: z.zone === "forest" ? "#b9cf9c" : "#dfe9c8", fillOpacity: 1, interactive: false }).addTo(g("zones"));
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
  let ortho = null, orthoOn = false, overImagery = false;
  const toggle = name => v => v ? g(name).addTo(map) : g(name).remove();
  const overlays = {
    ortho: { on: v => { orthoOn = v; setOrthoMode(v && !!ortho); if (!ortho) return; v ? ortho.addTo(map) : ortho.remove(); }, opacity: v => ortho?.setOpacity(v) },
    csg: { on: toggle("csg") }, sg: { on: toggle("sg") }, context: { on: toggle("context") },
    labels: { on: v => container.classList.toggle("no-labels", !v) },
    planned: { on: v => container.classList.toggle("no-planned", !v) },
    grid: { on: v => setGrid(v) },
  };
  for (const c of CATEGORIES) overlays[c.id] = { on: toggle(c.id) };
  // with imagery under the plan, the ground zones go and filled shapes become outlines
  function setOrthoMode(v) {
    overImagery = v;
    v ? g("zones").remove() : g("zones").addTo(map);
    for (const l of byId.values()) if (l.feature.geom?.type === "Polygon") l.setStyle({ fillOpacity: fillFor(l.feature, v), weight: v ? 3 : 2 });
    drawGrid();
  }
  function setImagery(id, manifest) {
    if (ortho) ortho.remove();
    ortho = new IdbTileLayer(id, manifest, { opacity: 0.85, pane: "tilePane" });
    if (orthoOn) ortho.addTo(map);
  }

  function fitAreaIcons() {
    for (const { pin, cat, xy, planned } of areaPins) {
      const pts = xy.map(p => map.latLngToContainerPoint(ll(p)));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const across = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const size = Math.max(14, Math.min(28, Math.round(across * 0.85 / 2) * 2));
      if (pin._size !== size) { pin._size = size; pin.setIcon(iconFor(cat, size, planned)); }
    }
  }

  // --- the planning grid (grid.js): square to the boundary named in features.json, 0 at its
  // corner post. Redrawn at the end of every zoom, because how many lines fit changes; the
  // labels are HTML over the map, kept where each labelled line enters the screen.
  const live = new Map(plot.features.map(f => [f.id, f]));
  const frame = gridFrame(plot.grid, live, plot.home.fenced?.[0] ?? plot.home.bounds[0]);
  const [[bx0, by0], [bx1, by1]] = plot.home.bounds;
  const extentFrom = [
    ...(plot.boundaries ?? []).map(b => b.geom.type === "Point" ? [b.geom.xy] : b.geom.xy),
    ...[plot.grid?.along, plot.grid?.from].map(id => live.get(id)?.geom?.xy).filter(Boolean),
  ];
  const ext = gridExtent(frame, extentFrom.length ? extentFrom : [[[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]]]);
  const gridLayer = L.layerGroup();
  const gridLabelBox = map.createPane("gridLabels");     // over lines and shapes, under icons and names
  gridLabelBox.style.zIndex = 580; gridLabelBox.classList.add("grid-labels");
  let gridOn = false, gridSize = 5, levels = null, labelled = [];
  const pxPerM = () => Math.pow(2, map.getZoom()) / m0;
  function setGrid(v) { gridOn = v; v ? gridLayer.addTo(map) : gridLayer.remove(); drawGrid(); }
  function drawGrid() {
    gridLayer.clearLayers();
    if (!gridOn) { labelled = []; gridLabelBox.replaceChildren(); opts.onGrid?.(null); return; }
    levels = gridLevels(gridSize, pxPerM());
    const lines = gridLines(frame, ext, levels.step, levels.major);
    const st = GRID_STYLE[overImagery ? "ortho" : "plan"];
    for (const major of [false, true]) {
      const set = lines.filter(l => l.major === major);
      if (set.length) L.polyline(set.map(l => [ll(l.a), ll(l.b)]), { pane: "grid", interactive: false, ...st[major ? "major" : "minor"] }).addTo(gridLayer);
    }
    labelled = lines.filter(l => l.val % levels.label === 0);
    placeLabels();
    opts.onGrid?.(levels);
  }
  // A line at a fixed distance along (it runs across) is labelled where it comes in from the
  // left; one at a fixed distance across, where it comes down from the top, clear of the buttons.
  // Worked out on screen, placed in the pane's own coordinates; a label that would overlap one
  // already placed (the corner, where the two rows meet) is left out.
  function placeLabels() {
    if (!gridOn) return;
    const box = { x0: 4, y0: 60, x1: container.clientWidth - 4, y1: container.clientHeight - 40 };
    const spans = [], taken = [];
    for (const dir of ["v", "u"]) for (const l of labelled) {
      if (l.dir !== dir) continue;
      let a = map.latLngToContainerPoint(ll(l.a)), b = map.latLngToContainerPoint(ll(l.b));
      if (dir === "u") [a, b] = [b, a];
      const t = clipStart(a, b, box);
      if (t === null) continue;
      const x = a.x + t * (b.x - a.x), y = a.y + t * (b.y - a.y);
      // the lines lean, so one can come on through another edge: its label would sit in the
      // wrong row and read as the other distance. Only at the grid's own end or its own edge.
      if (t > 0 && (dir === "u" ? Math.abs(y - box.y0) : Math.abs(x - box.x0)) > 0.5) continue;
      const text = gridLabel(l.val);
      const r = { x: x + 3, y: y + (dir === "u" ? 2 : -14), w: text.length * 6 + 4, h: 13 };
      if (taken.some(q => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h)) continue;
      taken.push(r);
      const s = document.createElement("span"), at = map.containerPointToLayerPoint([r.x, r.y]);
      s.className = `gl gl-${dir}`; s.textContent = text;
      s.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
      spans.push(s);
    }
    gridLabelBox.replaceChildren(...spans);
  }
  map.on("move zoom resize", placeLabels);
  map.on("zoomanim", () => gridLabelBox.classList.add("moving"));

  const onZoom = () => {
    const z = map.getZoom(); container.classList.toggle("z-lo", z < 0.6); container.classList.toggle("z-hi", z >= 1.5); fitAreaIcons();
    gridLabelBox.classList.remove("moving"); if (gridOn) drawGrid();
  };
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

  // --- drawing and reshaping a line or an area (shape.js): a handle on every point, A and B
  // lettered on a line, a + halfway along each side with its length, and an area's size in its
  // middle. With no point in hand a tap adds the next point after the end; tap a handle to take
  // it in hand, then tap where it goes (the finger does not hide the target that way), or drag
  // it. A new line or area starts with no points. Reshaping, the shape as it was stays faintly
  // underneath; the app rebuilds the map when reshaping ends, which restores it.
  const shaping = { edit: null, f: null, onChange: null, lines: [], layer: null, edge: null, closing: null, mids: [], area: null, dragFrom: null };
  const shapeGroup = L.layerGroup();
  function startShape(f, onChange, { type = "line", edit = null } = {}) {
    endShape();
    Object.assign(shaping, { edit: edit ?? new ShapeEdit(f?.geom ?? { type: type === "area" ? "Polygon" : "LineString", xy: [] }), f, onChange });
    shaping.lines = plot.features.filter(o => o.id !== f?.id && o.type === "fences" && o.geom?.type === "LineString")
      .map(o => ({ id: o.id, name: o.name, xy: o.geom.xy }));
    const was = f && byId.get(f.id);
    if (was) { was.setStyle({ opacity: 0.35, fillOpacity: 0.05, dashArray: "4 6" }); was.unbindTooltip(); }
    if (f) areaPins.find(a => a.pin.feature?.id === f.id)?.pin.remove();
    shapeGroup.addTo(map);
    drawShape();
  }
  function endShape() { shapeGroup.clearLayers(); shapeGroup.remove(); shaping.edit = null; shaping.f = null; }
  const changed = () => { drawShape(); shaping.onChange?.(); };
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const EDGE = { pane: "shape", color: "#e0392b", weight: 3, interactive: false };
  function drawShape() {
    shapeGroup.clearLayers();
    Object.assign(shaping, { layer: null, edge: null, closing: null, mids: [], area: null });
    const e = shaping.edit; if (!e) return;
    // An area's closing side, from its last corner back to the first, is dashed: that is where
    // the next corner goes. Its size sits in the middle, under the handles, and taps go through it.
    if (e.ring) {
      shaping.layer = L.polygon(lls(e.pts), { ...EDGE, stroke: false, fillColor: shaping.f ? catOf(shaping.f).color : "#e0392b", fillOpacity: 0.15 }).addTo(shapeGroup);
      shaping.closing = L.polyline(lls([e.pts.at(-1), e.pts[0]]), { ...EDGE, dashArray: "6 6" }).addTo(shapeGroup);
      shaping.area = L.marker(ll(interiorPoint(e.pts)), { pane: "shapeArea", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "sh-area", html: `<span>${fmtArea(polygonArea(e.pts))}</span>`, iconSize: [0, 0] }) }).addTo(shapeGroup);
    }
    if (e.n >= 2) shaping.edge = L.polyline(lls(e.pts), EDGE).addTo(shapeGroup);
    for (const s of e.sides()) {
      const m = L.marker(ll(mid(e.pts[s.i], e.pts[s.j])), { pane: "shape", keyboard: false,
        icon: L.divIcon({ className: "sh-mid", html: `<b>+</b><span>${s.len.toFixed(1)} m</span>`, iconSize: [30, 30] }) });
      m.on("click", ev => { L.DomEvent.stop(ev); e.insertAfter(s.i); changed(); });
      m.addTo(shapeGroup);
      shaping.mids.push({ m, i: s.i, j: s.j });
    }
    e.pts.forEach((p, i) => {
      // ends carry their letter and corners their number, so what the bar names can be found
      const end = !e.closed && (i === 0 || i === e.n - 1);
      const hnd = L.marker(ll(p), { pane: "shape", draggable: true, autoPan: false, keyboard: false,
        icon: L.divIcon({ className: `sh-h${end ? " sh-end" : ""}${e.gps[i] ? " gps" : ""}${e.sel === i ? " sel" : ""}`, html: `<i>${e.label(i).replace("Corner ", "")}</i>`, iconSize: [40, 40] }) });
      // a second tap on the point in hand lets go of it
      hnd.on("click", ev => { L.DomEvent.stop(ev); e.select(e.sel === i ? null : i); changed(); });
      hnd.on("dragstart", () => { shaping.dragFrom = [...e.pts[i]]; e.select(i); });
      hnd.on("drag", ev => { e.pts[i] = toXY(ev.target.getLatLng()); follow(); });
      hnd.on("dragend", ev => { const to = toXY(ev.target.getLatLng()); e.pts[i] = shaping.dragFrom; placePoint(i, to, { grid: !!opts.snapping?.() }); });
      hnd.addTo(shapeGroup);
    });
  }
  // while a point is dragged, the sides, their lengths, the area and the bar follow the finger
  function follow() {
    const e = shaping.edit;
    shaping.edge?.setLatLngs(lls(e.pts));
    shaping.layer?.setLatLngs(lls(e.pts));
    shaping.closing?.setLatLngs(lls([e.pts.at(-1), e.pts[0]]));
    for (const { m, i, j } of shaping.mids) {
      m.setLatLng(ll(mid(e.pts[i], e.pts[j])));
      const t = m.getElement()?.querySelector("span"); if (t) t.textContent = `${Math.hypot(e.pts[i][0] - e.pts[j][0], e.pts[i][1] - e.pts[j][1]).toFixed(1)} m`;
    }
    if (shaping.area) {
      shaping.area.setLatLng(ll(interiorPoint(e.pts)));
      const t = shaping.area.getElement()?.querySelector("span"); if (t) t.textContent = fmtArea(polygonArea(e.pts));
    }
    shaping.onChange?.();
  }
  // A point lands on another fence if it is put within a finger's width of one (a corner
  // before a side, so fences meet exactly), else on the grid when snapping, else where tapped.
  function landing(xy, grid) {
    const j = joinTo(xy, shaping.lines, 14 / pxPerM());
    return { p: j ? j.p : grid && gridOn ? snapToGrid(frame, xy, gridSize) : xy, joined: j?.name ?? null };
  }
  function placePoint(i, xy, { grid = false } = {}) { const { p, joined } = landing(xy, grid); shaping.edit.move(i, p, { joined }); changed(); }
  function addPoint(xy, { grid = false } = {}) { const { p, joined } = landing(xy, grid); shaping.edit.add(p, { joined }); changed(); }

  const center = f => f.geom.type === "Point" ? ll(f.geom.xy) : ll(centroid(f.geom.xy));
  const home = () => map.fitBounds([ll(plot.home.bounds[0]), ll(plot.home.bounds[1])], { padding: [10, 10] });
  home(); onZoom();

  return { map, groups, byId, overlays, setImagery, locate, home, ll, center,
    grid: { on: () => gridOn, size: () => gridSize, setSize: n => { gridSize = n; drawGrid(); }, frame: () => frame, extent: () => ext, levels: () => levels,
      snap: xy => snapToGrid(frame, xy, gridSize) },
    // a tap on the map while shaping: the point in hand goes there, or with none in hand the next point is added
    shape: { start: startShape, end: endShape, edit: () => shaping.edit, redraw: drawShape,
      place: (xy, o) => { const e = shaping.edit; if (!e) return false; e.sel != null ? placePoint(e.sel, xy, o) : addPoint(xy, o); return true; } } };
}
