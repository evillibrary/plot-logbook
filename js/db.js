// Thin promise wrapper over IndexedDB. Stores:
//   kv      settings, features.json, tile manifests            (key -> any)
//   tiles   imagery tiles                                       ("layer/z/x/y" -> Blob)
//   events  the local copy of the event log                     (id -> event, with .synced 0/1)
//   photos  photo blobs waiting for upload or cached from remote (id -> {blob, thumb})
const NAME = "plot-logbook", VERSION = 1;
let dbp;

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore("kv");
      d.createObjectStore("tiles");
      d.createObjectStore("events", { keyPath: "id" }).createIndex("synced", "synced");
      d.createObjectStore("photos");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const wait = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

function write(store, fn) {
  return open().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(store, "readwrite");
    fn(t.objectStore(store));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  get: (store, key) => open().then(d => wait(d.transaction(store).objectStore(store).get(key))),
  put: (store, value, key) => write(store, s => key === undefined ? s.put(value) : s.put(value, key)),
  del: (store, key) => write(store, s => s.delete(key)),
  clear: store => write(store, s => s.clear()),
  all: store => open().then(d => wait(d.transaction(store).objectStore(store).getAll())),
  keys: store => open().then(d => wait(d.transaction(store).objectStore(store).getAllKeys())),
  count: store => open().then(d => wait(d.transaction(store).objectStore(store).count())),
  putMany: (store, entries) => write(store, s => { for (const [k, v] of entries) s.put(v, k); }),
  putManyKeyed: (store, values) => write(store, s => { for (const v of values) s.put(v); }),
  unsynced: () => open().then(d => wait(d.transaction("events").objectStore("events").index("synced").getAll(0))),
};

export const settings = {
  async load() { return (await db.get("kv", "settings")) ?? {}; },
  async save(s) { await db.put("kv", s, "settings"); },
};
