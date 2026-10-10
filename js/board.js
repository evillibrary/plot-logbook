// The whiteboard: freehand sketching over the map, for trying ideas out without recording them.
// Nothing here goes in the event log. Each phone keeps its own marks (in IndexedDB, and in one
// file in the data source, whiteboard/<device>.json, rewritten whole whenever they change), so
// an erased mark is really gone from the app, and every phone sees every other phone's sketches
// without being able to change them. Marks are in plot metres, so they stay put on the ground
// at any zoom. Marks belong to sheets (named sketches: "River access", "Sheep fence"), each
// shown or hidden on its own in Layers.
//
// A mark: { id, sheet, tool, colour, w, xy: [[E, N]…], closed?, text?, at }. tool is pen (thin,
// w px), brush (broad and see-through, w px), track (w metres wide, to scale: a 3 m track is
// 3 m on the ground at any zoom), ruler (a straight line with its length) or text (xy is one
// point). A pen, brush or track stroke that ends where it began is `closed`: a loop, which
// reads its area and the length round it (an electric fence's wire, before the strands).
import { lineLength, polygonArea, fmtLength, fmtArea, interiorPoint } from "./geo.js";
import { colourOf } from "./categories.js";
import { isoNow } from "./events.js";
import { db } from "./db.js";

export const BOARD_COLOURS = ["red", "yellow", "blue", "green", "black", "white"];
export const TOOLS = [
  { id: "pen", name: "Pen", hint: "One finger draws a thin line. Two fingers move and zoom the map." },
  { id: "brush", name: "Brush", hint: "One finger paints a broad, see-through stroke. Two fingers move and zoom the map." },
  { id: "track", name: "Track", hint: "A stroke as wide on the ground as it says: a 3 m track is 3 m wide at any zoom." },
  { id: "ruler", name: "Ruler", hint: "Drag from one end to the other for a straight line and its length." },
  { id: "text", name: "Text", hint: "Tap where the words go." },
  { id: "erase", name: "Erase", hint: "Rub over your marks on this sheet to take them away." },
  { id: "plan", name: "To plan", hint: "Tap a mark to make it a planned line, or a planned area if it is a loop." },
  { id: "pan", name: "Move", hint: "One finger moves the map." },
];
export const TRACK_WIDTHS = [1, 2, 2.5, 3, 4, 5, 6];
const PEN_PX = 3, BRUSH_PX = 18;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cm = p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
export const newId = p => `${p}_${crypto.randomUUID().slice(0, 8)}`;

// --- pure geometry, tested ---
// Douglas-Peucker: the fewest points that keep the stroke within tol metres of where it ran
export function simplify(pts, tol) {
  if (pts.length < 3) return pts.map(p => [p[0], p[1]]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let best = -1, at = -1;
    for (let k = i + 1; k < j; k++) { const d = toSegment(pts[k], pts[i], pts[j]); if (d > best) { best = d; at = k; } }
    if (best > tol) { keep[at] = 1; stack.push([i, at], [at, j]); }
  }
  return pts.filter((_, k) => keep[k]).map(p => [p[0], p[1]]);
}
export function toSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
// A stroke that comes back to where it began (within tol metres, having gone well away first)
// and holds some ground: out along a track and back the same way is a hairpin, not a loop.
export function closes(pts, tol) {
  if (pts.length < 4) return false;
  const len = lineLength(pts);
  return dist(pts[0], pts[pts.length - 1]) <= tol && len > 6 * tol && polygonArea(pts) > tol * len / 2;
}
// what a mark measures: its length, and a loop's area and the length round it
export function measure(m) {
  if (m.tool === "text" || m.xy.length < 2) return null;
  if (m.closed) { const ring = [...m.xy, m.xy[0]]; return { length: lineLength(ring), area: polygonArea(m.xy), closed: true }; }
  return { length: lineLength(m.xy) };
}
export const measureText = s => !s ? "" : s.closed ? `${fmtArea(s.area)} inside · ${fmtLength(s.length)} round` : fmtLength(s.length);
// whether p (metres) is within tol metres of the mark, its own width counted
export function nearMark(m, p, tol, pxPerM = 1) {
  if (m.tool === "text") return dist(m.xy[0], p) <= tol * 2;
  const half = m.tool === "track" ? m.w / 2 : m.tool === "brush" ? m.w / 2 / pxPerM : 0;
  const pts = m.closed ? [...m.xy, m.xy[0]] : m.xy;
  for (let k = 1; k < pts.length; k++) if (toSegment(p, pts[k - 1], pts[k]) <= tol + half) return true;
  return pts.length === 1 && dist(pts[0], p) <= tol + half;
}
// a mark as a planned line or area: a few points, to the centimetre
export function markGeom(m) {
  if (m.tool === "text" || m.xy.length < 2) return null;
  let pts = simplify(m.xy, 0.25);
  for (let tol = 0.5; pts.length > 60; tol *= 1.6) pts = simplify(m.xy, tol);
  pts = pts.map(cm);
  if (m.closed && pts.length >= 3) return { type: "Polygon", xy: [...pts, pts[0]] };
  return { type: "LineString", xy: pts };
}

// --- this phone's board, the others', and keeping them in step through the data source ---
export const BOARD_DIR = "whiteboard";
export function emptyBoard() { return { sheets: [{ id: "s_sketch", name: "Sketch" }], marks: [], dirty: false, rev: 0 }; }
export function boardText(b, ctx) {
  return JSON.stringify({ device: ctx.device, by: ctx.author, updated: isoNow(), sheets: b.sheets, marks: b.marks }, null, 1) + "\n";
}
export function parseBoard(text) {
  const j = JSON.parse(text);
  return { device: j.device, by: j.by ?? j.device, updated: j.updated ?? null, sheets: Array.isArray(j.sheets) ? j.sheets : [], marks: Array.isArray(j.marks) ? j.marks.filter(m => Array.isArray(m?.xy) && m.xy.length) : [] };
}
export async function loadBoards() {
  return { mine: (await db.get("kv", "board:mine")) ?? null, others: (await db.get("kv", "board:others")) ?? {} };
}
export const saveMine = b => db.put("kv", b, "board:mine");
export const saveOthers = o => db.put("kv", o, "board:others");

// Write this phone's board if it has changed since it was last written. A change made while the
// upload is on its way leaves it changed, for the next sync.
export async function pushBoard(source, ctx, mine) {
  if (!mine?.dirty || source.readOnly) return false;
  const rev = mine.rev;
  await source.put(`${BOARD_DIR}/${ctx.device}.json`, boardText(mine, ctx), `whiteboard: ${ctx.device} (${mine.marks.length} marks)`);
  if (mine.rev === rev) { mine.dirty = false; await saveMine(mine); }
  return true;
}
// Read the other phones' boards that have changed, and this phone's own if it has none yet (a
// phone set up again). Returns whether anything shown changed.
export async function pullBoards(source, ctx, state) {
  // The folder's own entry first: there is none until a phone has sketched (and asking for a
  // folder that is not there is an error in the console every sync), and on GitHub its sha
  // changes only when a board in it does, so an unchanged one needs no more asking.
  const dir = (await source.list("")).find(f => f.name === BOARD_DIR && f.type === "dir");
  if (dir?.sha && state.dirSha === dir.sha) return false;
  const files = dir ? (await source.list(BOARD_DIR)).filter(f => f.type !== "dir" && f.name.endsWith(".json")) : [];
  let changed = false;
  const seen = new Set();
  for (const f of files) {
    const device = f.name.slice(0, -5);
    if (device === ctx.device) {
      if (!state.mine) {
        const t = await source.getText(f.path);
        if (t) { const b = parseBoard(t); state.mine = { ...emptyBoard(), sheets: b.sheets.length ? b.sheets : emptyBoard().sheets, marks: b.marks }; await saveMine(state.mine); changed = true; }
      }
      continue;
    }
    seen.add(device);
    const had = state.others[device];
    if (had && f.sha && had.sha === f.sha) continue;
    const t = await source.getText(f.path);
    if (t == null) continue;
    const b = parseBoard(t), sum = f.sha ?? `${t.length}:${t.slice(-80)}`;
    if (had && had.sha === sum) continue;
    state.others[device] = { ...b, device, sha: sum };
    changed = true;
  }
  for (const d of Object.keys(state.others)) if (!seen.has(d)) { delete state.others[d]; changed = true; }
  if (changed) await saveOthers(state.others);
  state.dirSha = dir?.sha ?? null;
  return changed;
}

// --- drawing it on the map, and drawing on it ---
// The marks go in a pane of their own over every feature and name, under the editing handles.
// While the whiteboard is open the features take no taps at all (CSS on #map.boarding): one
// finger draws, two fingers pinch and move the map (Leaflet's own touch zoom, which pans with the
// fingers), and Move frees one finger to move it.
export class BoardView {
  constructor(app) {
    this.app = app;
    this.map = null; this.group = null; this.layers = new Map();
    this.active = false; this.stroke = null; this.ptrs = new Set();
    this.preview = null;
  }
  get b() { return this.app.board; }
  pxPerM() { return this.mapApi ? this.mapApi.pxPerM() : 1; }

  attach(mapApi) {
    this.detach();
    this.mapApi = mapApi; this.map = mapApi.map;
    if (!this.map.getPane("board")) { const p = this.map.createPane("board"); p.style.zIndex = 640; p.style.pointerEvents = "none"; }
    this.group = L.layerGroup();
    this._zoom = () => this.restyle();
    this.map.on("zoomend", this._zoom);
    const el = this.map.getContainer();
    this._down = e => this.down(e); this._move = e => this.move(e); this._up = e => this.up(e);
    el.addEventListener("pointerdown", this._down, true);
    window.addEventListener("pointermove", this._move, true);
    window.addEventListener("pointerup", this._up, true);
    window.addEventListener("pointercancel", this._up, true);
    this.setActive(this.active);
    this.draw();
  }
  detach() {
    if (!this.map) return;
    const el = this.map.getContainer();
    el.removeEventListener("pointerdown", this._down, true);
    window.removeEventListener("pointermove", this._move, true);
    window.removeEventListener("pointerup", this._up, true);
    window.removeEventListener("pointercancel", this._up, true);
    this.map.off("zoomend", this._zoom);
    this.group?.remove();
    this.map = null;
  }
  setActive(on) {
    this.active = on;
    if (!this.map) return;
    const el = this.map.getContainer();
    el.classList.toggle("boarding", on);
    this.cancelStroke();
    this.panning(!on || this.app.boardTool === "pan");
    on ? this.map.doubleClickZoom.disable() : this.map.doubleClickZoom.enable();
    this.showGroup();
  }
  panning(on) { if (!this.map) return; on ? this.map.dragging.enable() : this.map.dragging.disable(); }
  showGroup() {
    if (!this.map) return;
    (this.active || this.app.settings.boardShow) ? this.group.addTo(this.map) : this.group.remove();
  }

  // every mark on a sheet that is showing: this phone's, then the others'
  visible() {
    const hidden = new Set(this.app.settings.boardHidden ?? []), out = [];
    const mine = this.b.mine ?? emptyBoard();
    for (const m of mine.marks) if (!hidden.has(`me:${m.sheet}`) || (this.active && m.sheet === this.app.boardSheet)) out.push({ m, own: true });
    for (const [dev, o] of Object.entries(this.b.others)) for (const m of o.marks) if (!hidden.has(`${dev}:${m.sheet}`)) out.push({ m, own: false, by: o.by });
    return out;
  }
  draw() {
    if (!this.group) return;
    this.group.clearLayers(); this.layers.clear();
    for (const v of this.visible()) { const l = this.markLayer(v.m, v.own); l.addTo(this.group); this.layers.set(v.m.id, { l, ...v }); }
  }
  // a track's width is in metres, so it changes on the screen with every zoom
  restyle() {
    const k = this.pxPerM();
    for (const { l, m } of this.layers.values()) if (m.tool === "track") l.eachLayer?.(q => q.options.track && q.setStyle({ weight: Math.max(2, m.w * k) }));
  }
  markLayer(m, own) {
    const ll = this.mapApi.ll, col = colourOf(m.colour).color, fade = own ? 1 : 0.7, pane = "board";
    const parts = [], lls = m.xy.map(ll);
    const pale = m.colour === "white" || m.colour === "yellow";
    if (m.tool === "text") {
      parts.push(L.marker(lls[0], { pane, interactive: false, keyboard: false,
        icon: L.divIcon({ className: "bd-text", html: `<span style="color:${col}${pale ? ";text-shadow:0 0 2px #000,0 0 3px #000" : ""}">${esc(m.text ?? "")}</span>`, iconSize: [0, 0] }) }));
      return L.layerGroup(parts);
    }
    const base = { pane, interactive: false, lineCap: "round", lineJoin: "round" };
    const style = m.tool === "brush" ? { ...base, color: col, weight: m.w ?? BRUSH_PX, opacity: 0.38 * fade }
      : m.tool === "track" ? { ...base, color: col, weight: Math.max(2, (m.w ?? 3) * this.pxPerM()), opacity: 0.45 * fade, track: true }
      : m.tool === "ruler" ? { ...base, color: col, weight: 3, opacity: 0.95 * fade, dashArray: "10 7", lineCap: "butt" }
      : { ...base, color: col, weight: m.w ?? PEN_PX, opacity: 0.95 * fade };
    if (pale && m.tool !== "brush" && m.tool !== "track") parts.push(m.closed ? L.polygon(lls, { ...style, color: "#1e1f1a", weight: style.weight + 2, opacity: 0.5 * fade, fill: false })
      : L.polyline(lls, { ...style, color: "#1e1f1a", weight: style.weight + 2, opacity: 0.5 * fade }));
    const line = m.closed ? L.polygon(lls, { ...style, fill: true, fillColor: col, fillOpacity: 0.08 * fade }) : L.polyline(lls, style);
    parts.push(line);
    // a ruler and a track say how long they are, a loop its area and the length round it
    if (m.tool === "ruler" || m.tool === "track" || m.closed) {
      const at = m.closed ? ll(interiorPoint(m.xy)) : lls[Math.floor((lls.length - 1) / 2)];
      parts.push(L.marker(at, { pane, interactive: false, keyboard: false,
        icon: L.divIcon({ className: "bd-measure", html: `<span>${measureText(measure(m))}</span>`, iconSize: [0, 0] }) }));
    }
    return L.layerGroup(parts);
  }

  // --- input ---
  xyOf(e) {
    const r = this.map.getContainer().getBoundingClientRect();
    const ll = this.map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top));
    return [ll.lng, ll.lat];
  }
  down(e) {
    if (!this.active || !this.map) return;
    if (e.target.closest?.(".leaflet-control")) return;
    this.ptrs.add(e.pointerId);
    // a second finger: the map is being pinched or moved, so whatever the first began is no stroke
    if (this.ptrs.size > 1) { this.cancelStroke(); return; }
    const tool = this.app.boardTool;
    if (tool === "pan" || (e.pointerType === "mouse" && e.button !== 0)) return;
    const xy = this.xyOf(e);
    this.stroke = { id: e.pointerId, tool, pts: [xy], px: [e.clientX, e.clientY], moved: 0, erased: [] };
    if (tool === "erase") this.eraseAt(xy);
    else this.drawPreview();
  }
  move(e) {
    const s = this.stroke;
    if (!s || e.pointerId !== s.id) return;
    const d = Math.hypot(e.clientX - s.px[0], e.clientY - s.px[1]);
    if (d < 2) return;
    s.moved += d; s.px = [e.clientX, e.clientY];
    const xy = this.xyOf(e);
    if (s.tool === "ruler") s.pts[1] = xy; else s.pts.push(xy);
    if (s.tool === "erase") this.eraseAt(xy); else this.drawPreview();
  }
  up(e) {
    this.ptrs.delete(e.pointerId);
    const s = this.stroke;
    if (!s || e.pointerId !== s.id) return;
    this.stroke = null; this.clearPreview();
    if (e.type === "pointercancel") return;
    this.app.boardStrokeDone(s, this.pxPerM());
  }
  cancelStroke() {
    if (this.stroke?.erased.length) this.app.boardStrokeDone({ ...this.stroke, cancelled: true }, this.pxPerM());
    this.stroke = null; this.clearPreview();
  }
  eraseAt(xy) {
    const s = this.stroke, tol = 14 / this.pxPerM();
    for (const v of this.layers.values()) {
      if (!v.own || v.m.sheet !== this.app.boardSheet || s.erased.includes(v.m)) continue;
      if (nearMark(v.m, xy, tol, this.pxPerM())) { s.erased.push(v.m); v.l.remove(); }
    }
  }
  // the stroke as it is being drawn, and what it measures so far
  drawPreview() {
    const s = this.stroke; if (!s || s.tool === "text" || s.tool === "plan") return;
    this.clearPreview();
    const m = { tool: s.tool, colour: this.app.boardColour, w: s.tool === "track" ? this.app.boardTrack : s.tool === "brush" ? BRUSH_PX : PEN_PX, xy: s.pts };
    if (s.tool === "ruler" && s.pts.length < 2) return;
    const tol = 20 / this.pxPerM(), loop = s.tool !== "ruler" && closes(s.pts, tol);
    this.preview = this.markLayer({ ...m, closed: false }, true).addTo(this.map);
    this.app.boardReadout(measureText(loop ? measure({ ...m, xy: s.pts.slice(0, -1), closed: true }) : measure(m)) + (loop ? " (a loop)" : ""));
  }
  clearPreview() { this.preview?.remove(); this.preview = null; }
  // the mark nearest a tap, any phone's, for To plan
  markAt(xy) {
    const tol = 16 / this.pxPerM();
    let best = null;
    for (const v of this.layers.values()) { if (v.m.tool === "text") continue; if (nearMark(v.m, xy, tol, this.pxPerM())) { const d = Math.min(...v.m.xy.map(q => dist(q, xy))); if (!best || d < best.d) best = { v, d }; } }
    return best?.v.m ?? null;
  }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// A finished stroke as a mark, or null when it is too small to be one (a tap with the pen).
export function strokeMark(s, { sheet, colour, track, pxPerM }) {
  const at = isoNow(), id = newId("m");
  if (s.tool === "text") return null;
  if (s.tool === "ruler") return s.pts.length === 2 && dist(s.pts[0], s.pts[1]) >= 0.1 ? { id, sheet, tool: "ruler", colour, w: PEN_PX, xy: s.pts.map(cm), at } : null;
  if (s.pts.length < 2 || s.moved < 6) return null;
  let pts = simplify(s.pts, 0.8 / pxPerM);
  const closed = closes(pts, 20 / pxPerM);
  if (closed) pts = pts.slice(0, -1);
  if (closed && pts.length < 3) return null;
  const w = s.tool === "track" ? track : s.tool === "brush" ? BRUSH_PX : PEN_PX;
  return { id, sheet, tool: s.tool, colour, w, xy: pts.map(cm), ...(closed ? { closed: true } : {}), at };
}
