// The offline shell. Two ways a release silently fails to reach the phones: the service
// worker's cache key is not bumped with the app version (nothing new is ever fetched), or a
// file the app loads is missing from SHELL (it works online and breaks offline after an update).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
const sw = read("sw.js");
const SHELL = JSON.parse(sw.match(/const SHELL = (\[[^\]]*\])/)[1].replace(/\s+/g, " "));

test("the service worker's cache version matches the app version", () => {
  const cache = sw.match(/const VERSION = "plot-logbook-v([^"]+)"/)?.[1];
  const app = read("js/app.js").match(/const VERSION = "([^"]+)"/)?.[1];
  assert.ok(cache && app, "both VERSION constants found");
  assert.equal(cache, app, "bump VERSION in sw.js and js/app.js together");
});

test("every file the app loads is in the shell, and every shell entry exists", () => {
  const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap(d => d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]);
  const shipped = [...["js", "css", "vendor", "icons"].flatMap(walk), "index.html", "manifest.json"]
    .filter(f => !/(^|\/)(Thumbs\.db|\.DS_Store)$/.test(f));
  const missing = shipped.filter(f => !SHELL.includes(f));
  assert.deepEqual(missing, [], "add these to SHELL in sw.js");
  const absent = SHELL.filter(f => f !== "./" && !fs.existsSync(path.join(ROOT, f)));
  assert.deepEqual(absent, [], "SHELL names files that do not exist");
  assert.ok(SHELL.includes("./"), "the start URL itself is cached");
});
