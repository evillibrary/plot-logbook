# Plot Logbook

A map-first logbook for a smallholding, built as an offline-capable web app. The plot itself —
its map, imagery, trees, buildings and every record — lives in a **separate private GitHub repo**
that you point the app at from Settings; this repo is only the app.

- Drawn plan generated from your feature model, with ortho imagery, cadastral boundaries and
  photo positions as toggleable overlays
- Log notes, photos, jobs (with repeats) and water readings against features, offline, from a phone
- Records sync as an append-only event log through the GitHub Contents API; each device writes
  only its own files so nothing ever conflicts
- Add or move features in the field; export them to Google Earth with the private repo's tools
- Reshape a line or area one point at a time: ends A and B, a corner added or taken out, a side
  set to a typed length, a point put at the GPS position, ends that join onto other fences
- A planning grid (1–10 m squares) square to a boundary line named in `features.json` and counted
  in metres from its corner, with snap-to-grid for drawing; features can be marked *planned* until
  they are built

## Data repo layout

```
data/features.json              feature model (metric grid + WGS84), zones, imagery list
data/tiles/<layer>.zip          tile pyramid {z}/{x}/{y}.jpg + manifest.json
data/log/<device>/<yyyy-mm>.jsonl
data/photos/<yyyy>/<mm>/<id>.jpg (+ .thumb.jpg)
```

## Setup on a device

1. Open the app (GitHub Pages URL), add to home screen.
2. Settings → your name, the private repo's owner/name, and a fine-grained personal access token
   with *Contents: read and write* on that one repository. Save & connect.
3. "Download imagery for offline" once; it's cached on the device.

## Local development

Serve the app and a data folder from one origin, e.g. from their common parent:
`python -m http.server 8000`, then open
`http://localhost:8000/<app>/index.html?source=http://localhost:8000/<data-folder>/data/&author=me`
(read-only source; records stay on the device).

Tests: `node --test` (state derivation from the event log, the planning grid's geometry, the offline shell).
