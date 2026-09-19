// Imagery tiles: one zip per layer in the data source, unpacked into IndexedDB, served to Leaflet from there.
import { db } from "./db.js";

// Fetch <layer>.zip from the source and store every tile. Returns the manifest.
export async function installTileLayer(source, imagery, onProgress) {
  const bytes = await source.getBytes(imagery.file, (got, total) => onProgress?.("download", got, total));
  if (!bytes) throw new Error(`${imagery.file} not found in ${source.name}`);
  const files = fflate.unzipSync(bytes);
  const entries = [];
  let manifest = null;
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("manifest.json")) { manifest = JSON.parse(new TextDecoder().decode(data)); continue; }
    const m = name.match(/^([^/]+)\/(\d+)\/(\d+)\/(\d+)\.(jpe?g|png|webp)$/);
    if (!m) continue;
    entries.push([`${m[1]}/${m[2]}/${m[3]}/${m[4]}`, new Blob([data], { type: `image/${m[5] === "jpg" ? "jpeg" : m[5]}` })]);
  }
  if (!manifest) throw new Error("tile zip has no manifest.json");
  onProgress?.("store", 0, entries.length);
  // one transaction per 100 tiles keeps the UI responsive on a phone
  for (let i = 0; i < entries.length; i += 100) {
    await db.putMany("tiles", entries.slice(i, i + 100));
    onProgress?.("store", Math.min(i + 100, entries.length), entries.length);
  }
  manifest.tileCount = entries.length;
  await db.put("kv", manifest, `tiles:${imagery.id}`);
  return manifest;
}

export const tileManifest = id => db.get("kv", `tiles:${id}`);

// A GridLayer that reads blobs from IndexedDB. Tile coords match the zip's {z}/{x}/{y}.
export const IdbTileLayer = L.GridLayer.extend({
  initialize(layerId, manifest, options) {
    this.layerId = layerId;
    this.manifest = manifest;
    L.GridLayer.prototype.initialize.call(this, L.extend({
      tileSize: manifest.tileSize, minZoom: -3, minNativeZoom: 0, maxNativeZoom: Math.max(...Object.keys(manifest.zooms).map(Number)),
      keepBuffer: 4, updateWhenZooming: false,
    }, options));
  },
  createTile(coords, done) {
    const img = document.createElement("img");
    const z = this.manifest.zooms[coords.z];
    if (!z || coords.x < z.x[0] || coords.x > z.x[1] || coords.y < z.y[0] || coords.y > z.y[1]) {
      setTimeout(() => done(null, img), 0);
      return img;
    }
    db.get("tiles", `${this.layerId}/${coords.z}/${coords.x}/${coords.y}`).then(blob => {
      if (!blob) { done(null, img); return; }
      const url = URL.createObjectURL(blob);
      img.onload = () => { URL.revokeObjectURL(url); done(null, img); };
      img.onerror = () => { URL.revokeObjectURL(url); done(null, img); };
      img.src = url;
    }).catch(e => done(e, img));
    return img;
  },
});
