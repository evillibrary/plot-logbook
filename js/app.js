// Wires the pieces together: settings -> source -> plot + events -> map and views.
import { db, settings as settingsStore } from "./db.js";
import { makeSource } from "./source.js";
import { makeProjection } from "./proj.js";
import { buildMap, toXY } from "./map.js";
import { installTileLayer, tileManifest } from "./tiles.js";
import * as events from "./events.js";
import * as photos from "./photos.js";
import { h, clear, toast, today, dragSheet } from "./ui/dom.js";
import { renderFeature, renderList } from "./ui/sheet.js";
import { CATEGORIES, iconSvg } from "./categories.js";
import { renderJobs, renderWater, renderPhotos, photoViewer } from "./ui/views.js";
import { renderMore } from "./ui/more.js";
import { observeForm, photoForm, jobForm, waterForm, featureForm } from "./ui/forms.js";

const VERSION = "0.2.7";
const $ = id => document.getElementById(id);

const app = {
  version: VERSION, settings: {}, source: null, plot: null, state: null, mapApi: null, proj: null,
  tab: "map", selected: null, pickMode: null, lastGps: null, syncing: false,

  get ctx() { return { author: this.settings.author || "unknown", device: this.settings.device || "unknown" }; },
  gpsNow() { return this.lastGps; },
  unproject(xy) { return this.proj ? this.proj.inverse(xy[0], xy[1]) : [0, 0]; },
  async saveSettings() { await settingsStore.save(this.settings); },

  async connect() {
    this.source = makeSource(this.settings);
    if (!this.source) throw new Error("no data source set");
    const r = await this.source.check();
    if (!this.plot) await this.loadPlot(true);
    this.sync();
    return r;
  },

  // features.json: from the source if asked/needed, else the cached copy
  async loadPlot(refresh = false) {
    let plot = refresh ? null : await db.get("kv", "plot");
    if (!plot && this.source) {
      plot = await this.source.getJson("features.json");
      if (!plot) throw new Error("features.json not found in the data source");
      await db.put("kv", plot, "plot");
      await db.put("kv", await this.source.version("features.json").catch(() => null), "plotVersion");
    }
    if (!plot) return;
    this.plot = plot;
    this.proj = makeProjection({ lon_0: plot.crs?.lon_0 ?? 0, k: 1 });
    await this.refold();
    await this.buildMap();
  },

  // The survey in features.json is reference data, not the record, so a rebuilt copy can
  // replace the cached one without asking. Until 0.2.1 a device kept whatever features.json
  // it first loaded for ever: a build that moved features out of features[] left the events
  // logged against them folding away unseen, on a map that was quietly weeks out of date.
  busyWithSomething() {
    return !!this.pickMode || this._formOpen
      || $("feature-sheet").classList.contains("open")
      || $("layers-sheet").classList.contains("open");
  },

  // Never reload out from under a half-written note; the events are safe in IndexedDB either
  // way, but losing what is on screen is not the same thing.
  applyUpdate() {
    if (!this._updateReady || this._reloading) return;
    if (this.busyWithSomething()) {
      if (!this._updateAnnounced) { this._updateAnnounced = true; toast("Update ready — applying when you have finished here", 5000); }
      return;
    }
    this._reloading = true;
    this.saveView();
    location.reload();
  },

  // The self-reload lands about eight seconds after opening, often after the map has been
  // panned: carry the view (and the tab) across it rather than snapping back to the home view.
  saveView() {
    if (!this.mapApi) return;
    const c = this.mapApi.map.getCenter();
    try { sessionStorage.setItem("pl:view", JSON.stringify({ c: [c.lat, c.lng], z: this.mapApi.map.getZoom(), tab: this.tab, t: Date.now() })); } catch {}
  },
  restoreView() {
    let v = null;
    try { v = JSON.parse(sessionStorage.getItem("pl:view")); sessionStorage.removeItem("pl:view"); } catch {}
    if (!v || Date.now() - v.t > 60000 || !this.mapApi) return;
    this.mapApi.map.setView(v.c, v.z, { animate: false });
    if (v.tab && v.tab !== "map") this.showTab(v.tab);
  },

  async checkPlot() {
    if (!this.source || !this.plot) return false;
    let remote;
    try { remote = await this.source.version("features.json"); } catch { return false; }
    if (!remote || remote === await db.get("kv", "plotVersion")) { this._plotStale = false; return false; }
    if (this.busyWithSomething()) { this._plotStale = true; return false; }   // retry when they are done
    this._plotStale = false;
    const was = this.plot.generated;
    await this.loadPlot(true);
    const now = this.plot.generated;
    toast(now && now !== was ? `Base data updated to ${now.slice(0, 10)}` : "Base data updated", 4000);
    return true;
  },

  async installImagery(onProgress) {
    const im = this.plot?.imagery?.[0];
    if (!im) throw new Error("plot has no imagery");
    if (!this.source) throw new Error("no data source connected");
    await installTileLayer(this.source, im, onProgress);
    await this.buildMap();
  },

  async refold() {
    this.state = events.fold(this.plot, await events.allEvents());
  },

  async buildMap() {
    if (!this.plot) return;
    const im = this.plot.imagery?.[0];
    const grid = im ? { origin: im.origin, m_per_px_zoom0: im.m_per_px_zoom0 } : { origin: [this.plot.home.bounds[0][0], this.plot.home.bounds[1][1]], m_per_px_zoom0: 0.2 };
    const view = this.mapApi ? { center: this.mapApi.map.getCenter(), zoom: this.mapApi.map.getZoom() } : null;
    this.mapApi?.map.remove();
    const live = { ...this.plot, features: [...this.state.features.values()].filter(f => !f.retired && !f.deleted && f.geom) };
    this.mapApi = buildMap($("map"), live, grid, {
      onSelect: f => { if (this.pickMode) return; this.openSheet(f); },
      picking: () => !!this.pickMode,
      onPick: xy => this.onMapClick(xy),
      onStatus: msg => toast(msg),
      onLocate: (xy, acc) => { this.lastGps = xy ? { xy, acc, ll: this.unproject(xy) } : null; if (this.pickMode?.kind === "draw") this.refreshDrawBar(); },
    });
    if (im) { const man = await tileManifest(im.id); if (man) this.mapApi.setImagery(im.id, man); }
    this.mapApi.map.on("click", e => this.onMapClick(toXY(e.latlng)));
    for (const cb of document.querySelectorAll("#layers-sheet input[type=checkbox]")) this.mapApi.overlays[cb.dataset.layer]?.on(cb.checked);
    this.mapApi.overlays.ortho.opacity(+$("ortho-opacity").value);
    if (view) this.mapApi.map.setView(view.center, view.zoom);
  },

  // --- records ---
  async record(ev) {
    await events.append(ev, this.ctx);
    if (ev.op.startsWith("feature.")) this._needsMap = true;
    await this.refold();
    this.render();
    this.updateSyncSummary();
    clearTimeout(this._syncT); this._syncT = setTimeout(() => this.sync(), 1500);
  },

  async sync(manual = false) {
    if (!this.source) return;
    if (this.syncing) { this._syncAgain = true; return; }
    if (!navigator.onLine) { this.setSyncPill("pending", "offline"); return; }
    this.syncing = true;
    const status = m => this.setSyncPill("pending", m);
    try {
      const got = await events.pull(this.source, status);
      let sent = 0, up = 0;
      try { sent = await events.push(this.source, this.ctx, status); up = await photos.uploadPending(this.source, status); }
      catch (e) { if (!/read-only/.test(e.message)) throw e; }
      // a feature someone else added or moved has to reach the map now, not on the next open
      if (got.n) { await this.refold(); if (got.features) this._needsMap = true; this.render(); }
      await this.checkPlot();
      const pending = (await db.unsynced()).length;
      this.setSyncPill(pending ? "pending" : "ok", pending ? `${pending} to send` : "synced");
      if (manual) toast(`sync: ${got.n} received, ${sent} sent, ${up} photos`);
    } catch (e) {
      this.setSyncPill("err", "sync failed");
      if (manual) toast(`sync failed: ${e.message}`, 5000);
      console.error(e);
    } finally {
      this.syncing = false; this.updateSyncSummary();
      if (this._syncAgain) { this._syncAgain = false; this.sync(); }
    }
  },
  setSyncPill(cls, text) { $("sync-dot").className = `dot ${cls}`; $("sync-text").textContent = text; },
  async updateSyncSummary() {
    const el = $("sync-summary"); if (!el) return;
    const pending = (await db.unsynced()).length, total = await db.count("events"), ph = (await db.all("photos")).filter(p => !p.uploaded).length;
    el.textContent = `${total} events on this device, ${pending} not yet sent, ${ph} photos waiting. Source: ${this.source?.name ?? "none"}.`;
  },

  // --- UI ---
  render() {
    ({ jobs: renderJobs, water: renderWater, photos: renderPhotos, more: renderMore })[this.tab]?.(this);
    if (this.tab === "map" && this.selected && $("feature-sheet").classList.contains("open") && !this._formOpen) {
      const f = this.state.features.get(this.selected.id); if (f) renderFeature(this, f);
    }
    if (this.mapApi && this.tab === "map" && this._needsMap) { this._needsMap = false; this.buildMap(); }
    const t = today();
    const due = [...(this.state?.jobs.values() ?? [])].filter(j => !j.done && j.due && j.due <= t).length;
    $("jobs-strip").hidden = !due; $("jobs-strip").textContent = `${due} job${due === 1 ? "" : "s"} due`;
  },
  showTab(name) {
    this.tab = name;
    for (const v of document.querySelectorAll(".view")) v.hidden = v.dataset.view !== name;
    for (const b of document.querySelectorAll("nav.tabs button")) b.classList.toggle("active", b.dataset.tab === name);
    this.closeSheet();
    this.render();
    if (name === "map") this.mapApi?.map.invalidateSize();
  },
  openSheet(f, { fromList = false } = {}) {
    this.selected = f; this._formOpen = false; this._listShown = false; this._fromList = fromList;
    $("layers-sheet").classList.remove("open");
    $("feature-sheet").scrollTop = 0;
    renderFeature(this, f);
  },
  closeSheet() {
    $("feature-sheet").classList.remove("open"); $("layers-sheet").classList.remove("open"); this._formOpen = false; this._listShown = false;
    // leaving a feature opened from the list another way: drop the history entry that back would have used
    if (this._fromList) { this._fromList = false; if (history.state?.pl === "list") history.back(); }
    if (this._plotStale) setTimeout(() => this.checkPlot(), 300);
    this.applyUpdate();
  },
  showForm(form) {
    this._formOpen = true; this._listShown = false;
    clear($("feature-body")).append(form);
    $("layers-sheet").classList.remove("open");
    $("feature-sheet").classList.add("open");
    $("feature-sheet").scrollTop = 0;
    if (form.dataset?.autofocus !== "off") setTimeout(() => form.querySelector?.("input:not([type=file]), textarea, select")?.focus({ preventScroll: true }), 220);
  },
  done() {
    this._formOpen = false;
    if (this.selected && this.tab === "map") { const f = this.state.features.get(this.selected.id); f ? renderFeature(this, f) : this.closeSheet(); }
    else this.closeSheet();
    this.render();
  },
  showPhoto(p) { this.showForm(photoViewer(this, p)); },
  goTo(fid, opts = {}) {
    const f = this.state.features.get(fid); if (!f) return;
    this.showTab("map");
    const layer = this.mapApi.byId.get(fid);
    if (layer) { const c = layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter(); this.mapApi.map.setView(c, Math.max(this.mapApi.map.getZoom(), 1.5)); }
    this.openSheet(f, opts);
  },

  // --- the list and the way back to it ---
  // A result opens its feature with a history entry under it, so the phone's own back gesture
  // (and the browser's back button) return to the list as it was left, as does "‹ Back to list".
  showList(restore = false) {
    this.showForm(renderList(this, restore));
    this._listShown = true; this._fromList = false;
    if (restore) $("feature-sheet").scrollTop = this.listState?.scroll ?? 0;
  },
  fromList(f, snapshot) {
    this.listState = snapshot;
    history.pushState({ pl: "list" }, "");
    f.geom ? this.goTo(f.id, { fromList: true }) : this.openSheet(f, { fromList: true });
  },
  backToList() { history.state?.pl === "list" ? history.back() : this.showList(true); },
  onPopState() {
    if (!this._fromList) return;                                     // a stale entry: its sheet is already gone
    if (this._formOpen && !this._listShown) { history.pushState({ pl: "list" }, ""); toast("Save or cancel first"); return; }
    this.showList(true);
  },

  // --- delete with a way back ---
  async deleteFeature(f, attached) {
    if (!confirm(`Delete ${f.name}?\n\nAttached: ${attached}. Those records stay in the log but lose their link (photos go to "Unlinked"). Retire instead if it died or was removed.\n\nYou can undo for 10 seconds, or restore later from More.`)) return;
    await this.record({ op: "feature.delete", feature: f.id });
    this.closeSheet();
    const t = toast(`${f.name} deleted`, 10000);
    t.append(h("button", { style: { marginLeft: "12px", background: "#fff", color: "#1e1f1a", border: 0, borderRadius: "6px", padding: "4px 10px" }, onclick: async () => { await this.record({ op: "feature.undelete", feature: f.id }); t.hidden = true; toast(`${f.name} restored`); } }, "Undo"));
  },

  // --- picking and drawing on the map ---
  startMove(f) { this.startPick({ kind: "move", feature: f }, f.geom ? `Tap the new position for ${f.name}` : `Tap where ${f.name} is`); },
  startAdd(type) { this.startPick({ kind: "add", type }, "Tap the map where the new feature is"); },

  // Any wait-for-a-tap shows a bar with a way out: before 0.2.5 the only escapes from a
  // half-started move were a wrong tap or a reload.
  startPick(mode, prompt) {
    this.pickMode = mode; this.closeSheet();
    $("pick-title").textContent = prompt; $("pick-bar").hidden = false; $("btn-add").hidden = true;
    toast(prompt, 4000); $("map").classList.add("picking");
  },
  endPick() {
    this.pickMode = null;
    $("pick-bar").hidden = true; $("btn-add").hidden = false; $("map").classList.remove("picking");
  },
  cancelPick() {
    const was = this.pickMode; this.endPick();
    if (was?.kind === "move") this.openSheet(this.state.features.get(was.feature.id) ?? was.feature);
    toast("cancelled");
  },
  startDraw(type, opts = {}) {                       // type: "line" | "area"
    this.closeSheet();
    this.pickMode = { kind: "draw", type, ...opts };
    this.mapApi.draw.start(type); $("map").classList.add("picking");
    $("draw-title").textContent = opts.feature ? `Redrawing ${opts.feature.name}` : type === "line" ? "New line" : "New area";
    $("pick-bar").hidden = true; $("draw-bar").hidden = false; $("btn-add").hidden = true; $("jobs-strip").hidden = true;
    this.refreshDrawBar();
  },
  startRedraw(f) { this.startDraw(f.geom.type === "Polygon" ? "area" : "line", { feature: f }); },
  refreshDrawBar() {
    const d = this.mapApi.draw, gps = this.lastGps;
    $("draw-summary").textContent = `· ${d.count()} point${d.count() === 1 ? "" : "s"}${d.gpsCount() ? ` (${d.gpsCount()} by GPS)` : ""} · ${d.summary()}`;
    $("draw-gps").disabled = !gps; $("draw-gps").title = gps ? `±${Math.round(gps.acc)} m` : "turn on ◎ first";
    $("draw-undo").disabled = !d.count();
    $("draw-finish").disabled = d.count() < (this.pickMode?.type === "area" ? 3 : 2);
  },
  endDraw() {
    this.mapApi.draw.cancel(); this.pickMode = null;
    $("draw-bar").hidden = true; $("btn-add").hidden = false; $("map").classList.remove("picking");
    this.render();
    if (this._plotStale) setTimeout(() => this.checkPlot(), 300);
    this.applyUpdate();
  },
  // A line walked with "Point at GPS" is phone-GPS evidence (±5–10 m), not a trace off the
  // imagery, and is recorded as such: source phone-gps, confidence defaulting to low.
  async finishDraw() {
    const mode = this.pickMode, d = this.mapApi.draw, points = d.count(), gpsPoints = d.gpsCount();
    const geom = d.finish();
    if (!geom) return;
    if (mode.feature) {
      const toLL = xy => this.unproject(xy).map(v => +v.toFixed(7));
      await this.record({ op: "feature.move", feature: mode.feature.id, geom: { ...geom, ll: geom.xy.map(toLL) }, confidence: gpsPoints ? "low" : "medium" });
      this.endDraw(); toast(`${mode.feature.name} redrawn`);
    } else {
      const type = mode.type;
      this.endDraw();
      this.showForm(featureForm(this, geom, { type: type === "line" ? "fences" : "paddocks", points, gpsPoints }));
    }
  },
  async onMapClick(xy) {
    if (!this.pickMode) { this.closeSheet(); return; }
    const mode = this.pickMode;
    if (mode.kind === "draw") { this.mapApi.draw.add(xy); this.refreshDrawBar(); return; }
    this.endPick();
    if (mode.kind === "move") {
      const f = mode.feature;
      await this.record({ op: "feature.move", feature: f.id, geom: { type: "Point", xy: [+xy[0].toFixed(2), +xy[1].toFixed(2)], ll: this.unproject(xy).map(v => +v.toFixed(7)) }, confidence: "medium" });
      this.render(); toast(`${f.name} moved`);
    } else {
      this.showForm(featureForm(this, { type: "Point", xy: [+xy[0].toFixed(2), +xy[1].toFixed(2)] }, mode.type ? { type: mode.type } : {}));
    }
  },
  addMenu() {
    const gps = this.lastGps;
    const item = (label, fn) => h("button.btn", { style: { display: "block", width: "100%", textAlign: "left", marginBottom: "8px" }, onclick: fn }, label);
    this.showForm(h("div", h("h2", "Log"),
      item("\u270e Note", () => this.showForm(observeForm(this, null))),
      item("\ud83d\udcf7 Photo", () => this.showForm(photoForm(this, null))),
      item("\u2611 Job", () => this.showForm(jobForm(this, null))),
      item("\ud83d\udca7 Water reading", () => this.showForm(waterForm(this))),
      h("h2", { style: { marginTop: "14px" } }, "Add to the map"),
      item("\ud83d\udccd Point \u2014 tap its place on the map", () => this.startAdd()),
      gps && item(`\ud83d\udccd Point at my GPS position (\u00b1${Math.round(gps.acc)} m)`, () => this.showForm(featureForm(this, { type: "Point", xy: gps.xy.map(v => +v.toFixed(2)) }, { viaGps: true }))),
      item("\u2571 Line \u2014 a fence, a pipe, a path", () => this.startDraw("line")),
      item("\u2b20 Area \u2014 a paddock, a bed, a stand", () => this.startDraw("area")),
    ));
  },
};

async function boot() {
  app.settings = await settingsStore.load();
  // ?source=<url>&author=<name> seeds a local read-only source (dev / first run on the desktop)
  const q = new URLSearchParams(location.search);
  if (q.get("source")) { app.settings.localUrl = q.get("source"); if (q.get("author")) app.settings.author = q.get("author"); app.settings.device ??= `dev-${crypto.randomUUID().slice(0, 4)}`; await app.saveSettings(); }
  app.source = makeSource(app.settings);
  // tabs, sheets, buttons
  for (const b of document.querySelectorAll("nav.tabs button")) b.addEventListener("click", () => app.showTab(b.dataset.tab));
  for (const b of document.querySelectorAll("[data-close]")) b.addEventListener("click", () => app.closeSheet());
  for (const el of document.querySelectorAll(".sheet")) dragSheet(el, () => app.closeSheet());
  $("btn-layers").addEventListener("click", () => { $("feature-sheet").classList.remove("open"); $("layers-sheet").classList.toggle("open"); });
  $("btn-locate").addEventListener("click", () => app.mapApi?.locate((lon, lat) => app.proj.forward(lon, lat)));
  $("btn-add").addEventListener("click", () => app.addMenu());
  $("btn-list").addEventListener("click", () => app.plot && app.showList());
  $("draw-gps").addEventListener("click", () => { if (app.lastGps) { app.mapApi.draw.add(app.lastGps.xy.map(v => +v.toFixed(2)), true); app.refreshDrawBar(); } });
  $("draw-undo").addEventListener("click", () => { app.mapApi.draw.undo(); app.refreshDrawBar(); });
  $("draw-finish").addEventListener("click", () => app.finishDraw());
  $("draw-cancel").addEventListener("click", () => app.endDraw());
  $("pick-cancel").addEventListener("click", () => app.cancelPick());
  document.addEventListener("keydown", e => { if (e.key === "Escape" && app.pickMode) app.pickMode.kind === "draw" ? app.endDraw() : app.cancelPick(); });
  // one toggle per category under "Features"
  const catBox = $("layer-categories");
  for (const c of CATEGORIES) {
    const cb = h("input", { type: "checkbox", checked: true, dataset: { layer: c.id } });
    const sw = h("span.swatch"); sw.innerHTML = iconSvg(c, 22);
    catBox.append(h("label", cb, sw, c.name));
  }
  for (const cb of document.querySelectorAll("#layers-sheet input[type=checkbox]")) cb.addEventListener("change", () => app.mapApi?.overlays[cb.dataset.layer]?.on(cb.checked));
  $("sync-pill").addEventListener("click", () => app.source ? app.sync(true) : app.showTab("more"));
  $("jobs-strip").addEventListener("click", () => app.showTab("jobs"));
  $("ortho-opacity").addEventListener("input", e => app.mapApi?.overlays.ortho.opacity(+e.target.value));
  // see the map through the layers panel, so ticking a box visibly does something
  const sheetAlpha = v => { $("layers-sheet").style.opacity = v; $("sheet-opacity").value = v; };
  sheetAlpha(app.settings.sheetOpacity ?? 1);
  $("sheet-opacity").addEventListener("input", e => { sheetAlpha(e.target.value); app.settings.sheetOpacity = +e.target.value; app.saveSettings(); });
  for (const d of document.querySelectorAll("#layers-sheet details.grp")) {
    d.open = app.settings.layerGroups?.[d.id] ?? true;
    d.addEventListener("toggle", () => { app.settings.layerGroups = { ...app.settings.layerGroups, [d.id]: d.open }; app.saveSettings(); });
  }
  window.addEventListener("popstate", () => app.onPopState());
  window.addEventListener("online", () => app.sync());
  window.addEventListener("offline", () => app.setSyncPill("pending", "offline"));

  try { await app.loadPlot(false); } catch (e) { console.warn(e); }
  if (!app.plot) {
    // first run: no plot yet — go straight to settings
    app.state = events.fold({ features: [] }, []);
    app.showTab("more");
    toast(app.source ? "Loading plot…" : "Set up your data source to load the plot", 4000);
    if (app.source) { try { await app.connect(); app.showTab("map"); } catch (e) { toast(e.message, 5000); } }
  } else {
    app.render();
    app.restoreView();
    app.setSyncPill(app.source ? "pending" : "", app.source ? (navigator.onLine ? "…" : "offline") : "no source");
    app.sync();
  }
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    // The shell is cache-first, so new code only arrives with a new service worker, which
    // claims the page as soon as it installs. The page in front of you is still running the
    // old modules at that point: reload, or every update costs two opens.
    const replacing = !!navigator.serviceWorker.controller;      // false on a first-ever install
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (replacing) { app._updateReady = true; app.applyUpdate(); } });
    navigator.serviceWorker.register("sw.js").catch(console.warn);
  }
  // ask the browser not to evict our IndexedDB under storage pressure: unsynced field notes live there
  navigator.storage?.persist?.().then(ok => { if (!ok) console.warn("persistent storage not granted"); });
}

window.app = app;
boot();
