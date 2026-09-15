// Wires the pieces together: settings -> source -> plot + events -> map and views.
import { db, settings as settingsStore } from "./db.js";
import { makeSource } from "./source.js";
import { makeProjection } from "./proj.js";
import { buildMap, toXY } from "./map.js";
import { installTileLayer, tileManifest } from "./tiles.js";
import * as events from "./events.js";
import * as photos from "./photos.js";
import { h, clear, toast } from "./ui/dom.js";
import { renderFeature } from "./ui/sheet.js";
import { renderJobs, renderWater, renderPhotos, photoViewer } from "./ui/views.js";
import { renderMore } from "./ui/more.js";
import { observeForm, photoForm, jobForm, waterForm, featureForm } from "./ui/forms.js";

const VERSION = "0.1.1";
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
    }
    if (!plot) return;
    this.plot = plot;
    this.proj = makeProjection({ lon_0: plot.crs?.lon_0 ?? 0, k: 1 });
    await this.refold();
    await this.buildMap();
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
    const live = { ...this.plot, features: [...this.state.features.values()].filter(f => !f.retired) };
    this.mapApi = buildMap($("map"), live, grid, {
      onSelect: f => { if (this.pickMode) return; this.openSheet(f); },
      onStatus: msg => toast(msg),
      onLocate: (xy, acc) => { this.lastGps = { xy, acc, ll: this.unproject(xy) }; },
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
      if (got) { await this.refold(); this.render(); }
      const pending = (await db.unsynced()).length;
      this.setSyncPill(pending ? "pending" : "ok", pending ? `${pending} to send` : "synced");
      if (manual) toast(`sync: ${got} received, ${sent} sent, ${up} photos`);
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
    const t = new Date().toISOString().slice(0, 10);
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
  openSheet(f) {
    this.selected = f; this._formOpen = false;
    $("layers-sheet").classList.remove("open");
    renderFeature(this, f);
  },
  closeSheet() { $("feature-sheet").classList.remove("open"); $("layers-sheet").classList.remove("open"); this._formOpen = false; },
  showForm(form) {
    this._formOpen = true;
    clear($("feature-body")).append(form);
    $("layers-sheet").classList.remove("open");
    $("feature-sheet").classList.add("open");
    form.querySelector?.("input:not([type=file]), textarea, select")?.focus();
  },
  done() {
    this._formOpen = false;
    if (this.selected && this.tab === "map") { const f = this.state.features.get(this.selected.id); f ? renderFeature(this, f) : this.closeSheet(); }
    else this.closeSheet();
    this.render();
  },
  showPhoto(p) { this.showForm(photoViewer(this, p)); },
  goTo(fid) {
    const f = this.state.features.get(fid); if (!f) return;
    this.showTab("map");
    const layer = this.mapApi.byId.get(fid);
    if (layer) { const c = layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter(); this.mapApi.map.setView(c, Math.max(this.mapApi.map.getZoom(), 1.5)); }
    this.openSheet(f);
  },

  // pick a point on the map: for moving a feature or adding one
  startMove(f) { this.pickMode = { kind: "move", feature: f }; this.closeSheet(); toast(`Tap the new position for ${f.name}`, 4000); $("map").style.cursor = "crosshair"; },
  startAdd() { this.pickMode = { kind: "add" }; this.closeSheet(); toast("Tap the map where the new feature is", 4000); $("map").style.cursor = "crosshair"; },
  async onMapClick(xy) {
    if (!this.pickMode) { this.closeSheet(); return; }
    const mode = this.pickMode; this.pickMode = null; $("map").style.cursor = "";
    if (mode.kind === "move") {
      const f = mode.feature;
      if (f.geom.type !== "Point") return toast("only point features can be moved in the app");
      await this.record({ op: "feature.move", feature: f.id, geom: { type: "Point", xy: [+xy[0].toFixed(2), +xy[1].toFixed(2)], ll: this.unproject(xy).map(v => +v.toFixed(7)) }, confidence: "medium" });
      this._needsMap = true; this.render(); toast(`${f.name} moved`);
    } else {
      this.showForm(featureForm(this, xy, false));
    }
  },
  addMenu() {
    const gps = this.lastGps;
    const item = (label, fn) => h("button.btn", { style: { display: "block", width: "100%", textAlign: "left", marginBottom: "8px" }, onclick: fn }, label);
    this.showForm(h("div", h("h2", "Log"),
      item("✎ Note", () => this.showForm(observeForm(this, null))),
      item("📷 Photo", () => this.showForm(photoForm(this, null))),
      item("☑ Job", () => this.showForm(jobForm(this, null))),
      item("💧 Water reading", () => this.showForm(waterForm(this))),
      item("＋ New feature — tap its place on the map", () => this.startAdd()),
      gps && item(`＋ New feature at my GPS position (±${Math.round(gps.acc)} m)`, () => this.showForm(featureForm(this, gps.xy, true))),
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
  $("btn-layers").addEventListener("click", () => { $("feature-sheet").classList.remove("open"); $("layers-sheet").classList.toggle("open"); });
  $("btn-locate").addEventListener("click", () => app.mapApi?.locate((lon, lat) => app.proj.forward(lon, lat)));
  $("btn-add").addEventListener("click", () => app.addMenu());
  $("sync-pill").addEventListener("click", () => app.source ? app.sync(true) : app.showTab("more"));
  $("jobs-strip").addEventListener("click", () => app.showTab("jobs"));
  for (const cb of document.querySelectorAll("#layers-sheet input[type=checkbox]")) cb.addEventListener("change", () => app.mapApi?.overlays[cb.dataset.layer]?.on(cb.checked));
  $("ortho-opacity").addEventListener("input", e => app.mapApi?.overlays.ortho.opacity(+e.target.value));
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
    app.setSyncPill(app.source ? "pending" : "", app.source ? (navigator.onLine ? "…" : "offline") : "no source");
    app.sync();
  }
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(console.warn);
}

window.app = app;
boot();
