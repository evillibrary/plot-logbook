// Photos: read EXIF (date, GPS) from the original, downsize to a web copy + thumbnail,
// keep both in IndexedDB, upload when a writable source is available, fetch + cache remote ones.
import { db } from "./db.js";
import { ulid } from "./events.js";

const MAX_EDGE = 1600, THUMB = 320, QUALITY = 0.82;

function loadImage(blob) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(blob); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = rej; i.src = u; });
}
function resize(img, maxEdge, cover = false) {
  const c = document.createElement("canvas");
  if (cover) {                                    // square thumb, centre crop
    const s = Math.min(img.width, img.height);
    c.width = c.height = maxEdge;
    c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, maxEdge, maxEdge);
  } else {
    const k = Math.min(1, maxEdge / Math.max(img.width, img.height));
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  }
  return new Promise(res => c.toBlob(res, "image/jpeg", QUALITY));
}

// Turn a File from the camera/gallery into {id, file, thumb, taken, gps, blob, thumbBlob}.
export async function prepare(file) {
  let meta = {};
  try { meta = (await exifr.parse(file, { gps: true, pick: ["DateTimeOriginal", "GPSLatitude", "GPSLongitude", "GPSHDOP", "Orientation"] })) ?? {}; } catch {}
  const img = await loadImage(file);           // browsers apply EXIF orientation when decoding (image-orientation: from-image)
  const [blob, thumbBlob] = await Promise.all([resize(img, MAX_EDGE), resize(img, THUMB, true)]);
  const taken = meta.DateTimeOriginal instanceof Date ? localIso(meta.DateTimeOriginal) : localIso(new Date(file.lastModified || Date.now()));
  const id = ulid();
  const gps = meta.latitude != null && meta.longitude != null ? [meta.latitude, meta.longitude] : null;
  return { id, file: `photos/${taken.slice(0, 4)}/${taken.slice(5, 7)}/${id}.jpg`, taken, gps, blob, thumbBlob, size: blob.size };
}
const localIso = d => { const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

export async function store(p) {
  await db.put("photos", { blob: p.blob, thumb: p.thumbBlob, uploaded: 0, file: p.file }, p.id);
}

export async function uploadPending(source, onStatus) {
  const ids = await db.keys("photos");
  let n = 0;
  for (const id of ids) {
    const rec = await db.get("photos", id);
    if (!rec || rec.uploaded) continue;
    onStatus?.(`uploading photo ${n + 1}`);
    await source.put(rec.file, new Uint8Array(await rec.blob.arrayBuffer()), `photo ${id}`);
    await source.put(rec.file.replace(/\.jpg$/, ".thumb.jpg"), new Uint8Array(await rec.thumb.arrayBuffer()), `thumb ${id}`);
    await db.put("photos", { ...rec, uploaded: 1 }, id);
    n++;
  }
  return n;
}

const urls = new Map();
// Object URL for a photo's thumb (or full image); fetches from the source and caches if not local.
export async function url(id, file, source, full = false) {
  const key = `${id}:${full ? "f" : "t"}`;
  if (urls.has(key)) return urls.get(key);
  let rec = await db.get("photos", id);
  if (!rec || (full && !rec.blob) || (!full && !rec.thumb)) {
    if (!source) return null;
    try {
      const path = full ? file : file.replace(/\.jpg$/, ".thumb.jpg");
      const bytes = await source.getBytes(path);
      if (!bytes) return null;
      const blob = new Blob([bytes], { type: "image/jpeg" });
      rec = { ...(rec ?? { uploaded: 1, file }), [full ? "blob" : "thumb"]: blob };
      await db.put("photos", rec, id);
    } catch { return null; }
  }
  const u = URL.createObjectURL(full ? rec.blob : rec.thumb);
  urls.set(key, u);
  return u;
}
