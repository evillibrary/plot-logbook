// Append-only event log. Every record the app makes is an event; state is a fold over
// features.json + all events. Each device writes only its own monthly file in the data
// source (log/<device>/<yyyy-mm>.jsonl), so two devices never race on one file.
import { db } from "./db.js";

// --- ids and time ---
const CROCK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function ulid(t = Date.now()) {
  let s = "";
  for (let i = 9; i >= 0; i--) { s = CROCK[t % 32] + s; t = Math.floor(t / 32); }
  const r = crypto.getRandomValues(new Uint8Array(16));
  for (let i = 0; i < 16; i++) s += CROCK[r[i] & 31];
  return s;
}
export function isoNow(d = new Date()) {                     // local time with offset, e.g. 2026-09-15T14:02:11+02:00
  const p = n => String(n).padStart(2, "0"), o = -d.getTimezoneOffset(), sg = o >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sg}${p(Math.floor(Math.abs(o) / 60))}:${p(Math.abs(o) % 60)}`;
}
const month = ts => ts.slice(0, 7);

// --- local store ---
export async function append(ev, ctx) {
  const full = { id: ulid(), ts: isoNow(), by: ctx.author, device: ctx.device, ...ev, synced: 0 };
  await db.put("events", full);
  return full;
}
export const allEvents = () => db.all("events");

// --- fold to state ---
export function fold(plot, events) {
  const features = new Map();
  for (const f of plot.features) features.set(f.id, { ...f, origin: "kml" });
  const obs = [], jobs = new Map(), water = [], photos = new Map();
  const sorted = [...events].sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.id < b.id ? -1 : 1);
  for (const e of sorted) {
    switch (e.op) {
      case "observe": obs.push(e); break;
      case "photo": photos.set(e.photo, { ...e }); break;
      case "photo.edit": if (photos.has(e.photo)) Object.assign(photos.get(e.photo), e.changes); break;
      case "water": water.push(e); break;
      case "job.add": jobs.set(e.job, { id: e.job, title: e.title, feature: e.feature ?? null, due: e.due ?? null, repeat: e.repeat ?? null, notes: e.notes ?? "", created: e.ts, by: e.by, done: null, history: [] }); break;
      case "job.edit": if (jobs.has(e.job)) Object.assign(jobs.get(e.job), e.changes); break;
      case "job.done": {
        const j = jobs.get(e.job); if (!j) break;
        j.history.push({ ts: e.ts, by: e.by, note: e.note ?? "" });
        if (j.repeat && j.due) { j.due = addDuration(j.due, j.repeat); j.done = null; } else j.done = e.ts;
        break;
      }
      case "job.delete": jobs.delete(e.job); break;
      case "feature.add": features.set(e.feature, { id: e.feature, name: e.name, type: e.type, folder: "Added in app", kml_id: "", source: e.source ?? "app", confidence: e.geom ? (e.confidence ?? "low") : "", photos: [], description: e.description ?? "", visible: true, geom: e.geom ?? null, origin: "app", since: e.ts, by: e.by }); break;
      case "feature.move": if (features.has(e.feature)) { const f = features.get(e.feature); f.geom = e.geom; f.confidence = e.confidence ?? f.confidence; f.moved = e.ts; } break;
      case "feature.edit": if (features.has(e.feature)) Object.assign(features.get(e.feature), e.changes, { edited: e.ts }); break;
      case "feature.retire": if (features.has(e.feature)) { features.get(e.feature).retired = e.ts; features.get(e.feature).retireNote = e.note ?? ""; } break;
      case "feature.unretire": if (features.has(e.feature)) { const f = features.get(e.feature); delete f.retired; delete f.retireNote; } break;
      case "feature.delete": if (features.has(e.feature)) { features.get(e.feature).deleted = e.ts; features.get(e.feature).deletedBy = e.by; } break;
      case "feature.undelete": if (features.has(e.feature)) { const f = features.get(e.feature); delete f.deleted; delete f.deletedBy; } break;
    }
  }
  const byFeature = new Map();
  const add = (fid, kind, item) => { if (!fid) return; (byFeature.get(fid) ?? byFeature.set(fid, []).get(fid)).push({ kind, ts: item.ts ?? item.taken, item }); };
  for (const o of obs) add(o.feature, "observe", o);
  for (const w of water) add(w.feature, "water", { ...w, ts: w.at ? w.at + (w.at.length === 16 ? ":00" : "") : w.ts });
  for (const p of photos.values()) add(p.feature, "photo", { ...p, ts: p.taken || p.ts });
  for (const j of jobs.values()) { add(j.feature, "job", { ...j, ts: j.created }); for (const h of j.history) add(j.feature, "job.done", { ...j, ts: h.ts, by: h.by }); }
  for (const list of byFeature.values()) list.sort((a, b) => a.ts < b.ts ? 1 : -1);
  return { features, obs, jobs, water, photos, byFeature };
}

// ISO 8601 durations: P7D, P2W, P1M, P3M, P1Y
export function addDuration(dateStr, dur) {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(dur);
  if (!m) return dateStr;
  const d = new Date(dateStr + "T00:00:00");
  d.setFullYear(d.getFullYear() + (+m[1] || 0)); d.setMonth(d.getMonth() + (+m[2] || 0));
  d.setDate(d.getDate() + (+m[3] || 0) * 7 + (+m[4] || 0));
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;      // local date, never via UTC
}

// --- sync with the data source ---
const line = e => { const { synced, ...rest } = e; return JSON.stringify(rest); };

export async function push(source, ctx, onStatus) {
  const pending = await db.unsynced();
  if (!pending.length) return 0;
  const mine = pending.filter(e => e.device === ctx.device);
  const files = new Set(mine.map(e => `log/${e.device}/${month(e.ts)}.jsonl`));
  const all = (await db.all("events")).filter(e => e.device === ctx.device);
  let n = 0;
  for (const path of files) {
    const [, dev, mon] = path.match(/^log\/(.+)\/(\d{4}-\d{2})\.jsonl$/);
    const rows = all.filter(e => e.device === dev && month(e.ts) === mon).sort((a, b) => a.id < b.id ? -1 : 1);
    onStatus?.(`uploading ${path}`);
    await source.put(path, rows.map(line).join("\n") + "\n", `log: ${rows.length} events from ${dev} (${mon})`);
    const done = rows.filter(e => !e.synced).map(e => ({ ...e, synced: 1 }));
    await db.putManyKeyed("events", done);
    n += done.length;
  }
  return n;
}

export async function pull(source, onStatus) {
  const seen = (await db.get("kv", "logShas")) ?? {};
  let n = 0, features = false;                 // whether anything that arrived changes the map
  const dirs = await source.list("log");
  for (const d of dirs.filter(x => x.type === "dir")) {
    for (const f of (await source.list(d.path)).filter(x => x.name.endsWith(".jsonl"))) {
      if (f.sha && seen[f.path] === f.sha) continue;
      onStatus?.(`reading ${f.path}`);
      const text = await source.getText(f.path);
      if (text == null) continue;
      const rows = text.split("\n").filter(Boolean).map(l => ({ ...JSON.parse(l), synced: 1 }));
      const local = new Set(await db.keys("events"));
      const fresh = rows.filter(r => !local.has(r.id));
      if (fresh.some(r => String(r.op).startsWith("feature."))) features = true;
      // rows already in the local store that were ours and unsynced are now confirmed
      await db.putManyKeyed("events", rows);
      n += fresh.length;
      if (f.sha) seen[f.path] = f.sha;
    }
  }
  await db.put("kv", seen, "logShas");
  return { n, features };
}
