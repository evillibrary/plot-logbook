# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

An offline-capable web app, added to the phone's home screen (manifest and service worker). Mobile
web, not native.

## Users

- **Jams, the main user.** Runs the smallholding and uses the app on a phone, outdoors, on the
  plot. Comfortable with phone apps; nothing special to allow for beyond the conditions below.
- **Stephen, the developer.** Builds and maintains the app, and uses it too.

Each device has its own author name and writes its own records, so more than one person can log
without conflicts.

## Product Purpose

A map-first logbook for one smallholding. The plot's map is the way into everything: features
(trees, buildings, fences, gates, areas, tanks) are drawn on it, and notes, photos, jobs and water
readings are logged against them, so the plot's history builds up in place.

Success is Jams drawing and planning the plot on the phone, standing in the field, and the plan
coming out right first time: fences the right length, gates in the right place, areas the right
size, planned work marked until it's built.

## Positioning

Not a farm-management suite and not a generic map app. It is this one plot's own drawn plan,
generated from its feature model, with the records attached to the features themselves, working
fully offline from a phone and syncing through a private repository the owners control.

## Operating Context

- **Phone, outdoors, mostly.** Bright sun, one hand often busy, patchy or no signal. Desktop is
  occasional.
- **Most important job: draw and plan.** Drawing and reshaping lines and areas one point at a
  time (ends A and B, add or remove a corner, set a side to a typed length, put a point at the GPS
  position, join ends onto other fences), placing gates on fences (by tap or tape distance from
  either end), the planning grid with snap, and marking features *planned* until built.
- Other jobs, in support: logging notes, photos and water readings against a feature; jobs to do,
  with repeats; finding a feature and looking back over its history and photos; the whiteboard for
  sketching over the map.
- ◎ follows the user's position as they walk and keeps the screen awake while GPS is on.
- The map has two base looks that controls must work over: the drawn plan and the ortho photo
  imagery (downloaded once for offline use). Cadastral boundaries and photo positions are overlays.

## Capabilities and Constraints

- Views: Map (with the search row, map buttons, the feature sheet, the drawing bars), Jobs, Water,
  Photos, More (Settings), plus Layers and the whiteboard.
- **Offline first.** Everything the app needs is in its shell and cached; nothing may load from
  the internet at run time. New files must be added to the service worker's shell list, and the
  version bumped in `sw.js` and `js/app.js` with every change, or phones keep the old files.
- **Sync** is an append-only event log through the GitHub Contents API; each device writes only
  its own files. The plot's data (features, tiles, log, photos) lives in a separate private repo.
- **Fence types** are named and coloured by the user and shared across devices; each fence is
  drawn in its type's colour. Area fills distinguish pasture and forest. These colours are data,
  and the interface must not compete with them.
- Plain ES modules, no build step, Leaflet for the map. Much of the page is built by script.
- Tests: `node --test` (event-log state, planning-grid geometry, the offline shell).
- Terminology to keep: feature, fence type, gate (single or double swing, sliding, walk-through,
  opening), area, planned, job, water reading, whiteboard, drawn plan, imagery, ends A and B.

## Brand Commitments

- Name: **Plot Logbook**; short name on the home screen: **Logbook**.

## Evidence on Hand

- The real plot's data, read-only, at `C:\Stephen\Work\Coding\Home Tracker\data` (a private repo
  with real locations and photos). Use it to judge designs against real content; never copy it
  elsewhere or publish it.
- No testimonials, other users or outside claims exist; don't invent any.

## Product Principles

1. **The map is the hero.** Every panel earns the space it takes from the plot.
2. **Right first time in the field.** Drawing and measuring must be precise and hard to get wrong
   on a phone in the sun; undo and cancel are always in reach.
3. **Works with no signal.** Nothing depends on the network while on the plot.
4. **The plot's own colours lead.** Fence-type colours and area fills carry meaning; the chrome
   stays out of their way.
5. **Records belong to features.** History is found by going to the thing on the map.

## Accessibility & Inclusion

- Readable in direct sunlight: body text well above WCAG AA, aiming for 7:1, over both the drawn
  plan and the photo imagery.
- Touch targets at least 44 px; usable one-handed.
