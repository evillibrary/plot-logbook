// Where the plot's data lives. Two implementations:
//   GitHubSource  a private repo read/written through the Contents API with a fine-grained token
//   HttpSource    a plain URL (local dev: `python -m http.server` in the data folder), read-only
// Both expose: getJson(path), getBytes(path, onProgress), getText(path), list(dir), put(path, data, msg), check()

const enc = new TextEncoder();

function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export class GitHubSource {
  constructor({ owner, repo, branch = "main", token, prefix = "data" }) {
    Object.assign(this, { owner, repo, branch, token, prefix });
    this.name = `${owner}/${repo}`;
    this.shas = new Map();                     // path -> sha of the version we last saw
  }
  url(path) { return `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.prefix}/${path}`; }
  headers(accept = "application/vnd.github+json") {
    return { Authorization: `Bearer ${this.token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28" };
  }
  async fetch(path, accept) {
    const r = await fetch(`${this.url(path)}?ref=${this.branch}`, { headers: this.headers(accept), cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub ${r.status} on ${path}`);
    return r;
  }
  async getBytes(path, onProgress) {
    const r = await this.fetch(path, "application/vnd.github.raw+json");
    if (!r) return null;
    const total = +r.headers.get("content-length") || 0;
    if (!onProgress || !r.body) return new Uint8Array(await r.arrayBuffer());
    const reader = r.body.getReader(), chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length; onProgress(got, total);
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
  async getText(path) { const b = await this.getBytes(path); return b && new TextDecoder().decode(b); }
  async getJson(path) { const t = await this.getText(path); return t && JSON.parse(t); }
  async list(dir) {
    const r = await this.fetch(dir);
    if (!r) return [];
    const items = await r.json();
    for (const it of items) this.shas.set(`${dir}/${it.name}`, it.sha);
    return items.map(it => ({ name: it.name, path: `${dir}/${it.name}`, type: it.type, sha: it.sha, size: it.size }));
  }
  async sha(path) {
    if (this.shas.has(path)) return this.shas.get(path);
    const r = await this.fetch(path);
    if (!r) return null;
    const j = await r.json();
    this.shas.set(path, j.sha);
    return j.sha;
  }
  // Create or update a file. data: string | Uint8Array. Retries once on a sha conflict.
  async put(path, data, message) {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    for (let attempt = 0; attempt < 2; attempt++) {
      const sha = await this.sha(path);
      const body = { message, branch: this.branch, content: b64(bytes), ...(sha ? { sha } : {}) };
      const r = await fetch(this.url(path), { method: "PUT", headers: this.headers(), body: JSON.stringify(body) });
      if (r.status === 409 || r.status === 422) { this.shas.delete(path); continue; }
      if (!r.ok) throw new Error(`GitHub ${r.status} writing ${path}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      this.shas.set(path, j.content.sha);
      return j.content.sha;
    }
    throw new Error(`conflict writing ${path}`);
  }
  async check() {
    const r = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}`, { headers: this.headers() });
    if (!r.ok) throw new Error(r.status === 401 ? "token rejected" : r.status === 404 ? "repo not found (or token lacks access)" : `GitHub ${r.status}`);
    const j = await r.json();
    return { private: j.private, push: j.permissions?.push };
  }
}

export class HttpSource {
  constructor({ baseUrl }) { this.base = baseUrl.replace(/\/?$/, "/"); this.name = this.base; }
  async fetch(path) {
    const r = await fetch(this.base + path, { cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${path}`);
    return r;
  }
  async getBytes(path, onProgress) {
    const r = await this.fetch(path);
    if (!r) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    onProgress?.(b.length, b.length);
    return b;
  }
  async getText(path) { const r = await this.fetch(path); return r && r.text(); }
  async getJson(path) { const r = await this.fetch(path); return r && r.json(); }
  async list(dir) {                          // python http.server gives an HTML index; scrape the hrefs
    const t = await this.getText(dir + "/");
    if (!t) return [];
    return [...t.matchAll(/href="([^"?/][^"]*?)(\/?)"/g)]
      .map(m => ({ name: decodeURIComponent(m[1]), path: `${dir}/${decodeURIComponent(m[1])}`, type: m[2] ? "dir" : "file", sha: null }));
  }
  async put() { throw new Error("local source is read-only; records stay on this device until a GitHub repo is set"); }
  async check() {
    const j = await this.getJson("features.json");
    if (!j) throw new Error("features.json not found");
    return { push: false };
  }
}

export function makeSource(s) {
  if (s.localUrl) return new HttpSource({ baseUrl: s.localUrl });
  if (s.owner && s.repo && s.token) return new GitHubSource({ owner: s.owner, repo: s.repo, branch: s.branch || "main", token: s.token });
  return null;
}
