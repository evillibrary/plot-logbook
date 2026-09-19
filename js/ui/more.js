// Settings: who you are, where the plot's data lives, and the plot/imagery loaders.
import { h, clear, field, toast } from "./dom.js";
import { db } from "../db.js";
import { catOf } from "../categories.js";

export function renderMore(app) {
  const el = clear(document.getElementById("more-view"));
  const s = app.settings;
  const author = h("input", { value: s.author ?? "", placeholder: "your first name" });
  const owner = h("input", { value: s.owner ?? "", placeholder: "github user", autocapitalize: "none" });
  const repo = h("input", { value: s.repo ?? "", placeholder: "private repo name", autocapitalize: "none" });
  const branch = h("input", { value: s.branch ?? "main", autocapitalize: "none" });
  const token = h("input", { type: "password", value: s.token ?? "", placeholder: "fine-grained token: Contents read/write on that repo", autocapitalize: "none" });
  const localUrl = h("input", { value: s.localUrl ?? "", placeholder: "http://localhost:8001/data/  (dev only, read-only)", autocapitalize: "none" });
  const status = h("div.status");
  const progress = h("div.status");

  const save = async () => {
    Object.assign(app.settings, { author: author.value.trim(), owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || "main", token: token.value.trim(), localUrl: localUrl.value.trim() });
    app.settings.device ??= `${(app.settings.author || "dev").toLowerCase().replace(/[^a-z0-9]/g, "")}-${crypto.randomUUID().slice(0, 4)}`;
    await app.saveSettings();
    status.textContent = "checking…";
    try { const r = await app.connect(); status.textContent = `connected to ${app.source.name}${r.push === false ? " (read-only)" : ""}${r.private === false ? " — WARNING: that repo is public" : ""}`; }
    catch (e) { status.textContent = `not connected: ${e.message}`; }
  };

  el.append(...[
    h("h1", "Settings"),
    h("div.card", h("h3", "You"), field("Name", author), h("p.note", `This device: ${s.device ?? "(set after first save)"}`)),
    h("div.card", h("h3", "Data source (private GitHub repo)"),
      field("Owner", owner), field("Repository", repo), field("Branch", branch), field("Token", token),
      h("details", h("summary.note", "Local development"), field("Local data URL", localUrl)),
      h("div.row", h("button.btn.primary", { onclick: save }, "Save & connect")), status),
    h("div.card", h("h3", "Plot data"),
      h("p.note", app.plot ? `${app.plot.features.length} features loaded from ${app.plot.source?.file ?? "source"} (generated ${app.plot.generated?.slice(0, 16)})` : "No plot loaded yet."),
      h("div.row",
        h("button.btn", { onclick: async () => { try { progress.textContent = "loading features…"; await app.loadPlot(true); progress.textContent = "features updated"; } catch (e) { progress.textContent = e.message; } } }, "Reload features"),
        h("button.btn", { onclick: async () => { try { await app.installImagery((stage, a, b) => { progress.textContent = stage === "download" ? `downloading imagery ${(a / 1048576).toFixed(1)}${b ? " / " + (b / 1048576).toFixed(1) : ""} MB` : `storing tiles ${a}/${b}`; }); progress.textContent = "imagery ready offline"; } catch (e) { progress.textContent = e.message; } } }, "Download imagery for offline")),
      progress),
    h("div.card", h("h3", "Sync"),
      h("p.note", { id: "sync-summary" }, ""),
      h("div.row", h("button.btn.primary", { onclick: () => app.sync(true) }, "Sync now"))),
    (() => { const del = [...app.state.features.values()].filter(f => f.deleted); return del.length ? h("div.card", h("h3", `Deleted features (${del.length})`),
      ...del.map(f => h("div.row", { style: { justifyContent: "space-between", padding: "4px 0" } }, h("span", `${f.name} `, h("span.note", `${catOf(f).name} · ${f.deleted.slice(0, 10)} by ${f.deletedBy ?? ""}`)),
        h("button.btn", { onclick: async () => { await app.record({ op: "feature.undelete", feature: f.id }); toast(`${f.name} restored`); } }, "Restore")))) : null; })(),
    h("div.card", h("h3", "Danger zone"),
      h("p.note", "Records not yet synced would be lost."),
      h("button.btn.danger", { onclick: async () => { if (confirm("Clear everything stored on this device?")) { for (const st of ["kv", "tiles", "events", "photos"]) await db.clear(st); location.reload(); } } }, "Clear local data")),
    h("p.note", `Plot Logbook ${app.version}`),
  ].filter(Boolean));
  app.updateSyncSummary();
}
