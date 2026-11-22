---
name: Plot Logbook
description: A map-first logbook for one smallholding, its controls drawn as near-black tiles over the plot, with sand marking whatever is live.
colors:
  chrome: "#16171b"
  chrome-raised: "#24262b"
  chrome-ink: "#f2f2ea"
  chrome-muted: "#b3b4ad"
  chrome-edge: "#5a5c62"
  panel-edge: "#34363c"
  signal: "#d8c597"
  sand: "#c9b58a"
  sand-text: "#6b5729"
  night-sand-text: "#dccb9f"
  page: "#eceeee"
  panel: "#f8f9f9"
  panel-raised: "#e3e6e7"
  field: "#ffffff"
  ink: "#15161a"
  muted: "#44474d"
  line: "#d2d6d8"
  line-strong: "#8b8a84"
  night-page: "#0f1013"
  night-panel: "#17181c"
  night-panel-raised: "#212328"
  night-field: "#111216"
  night-muted: "#abaca5"
  night-line: "#2b2d32"
  ok: "#2f8f55"
  warn: "#b5730f"
  danger: "#b4302a"
  night-ok: "#5cc685"
  night-warn: "#e9a649"
  night-danger: "#ff7d72"
  gps: "#1a73e8"
typography:
  headline:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "1.65rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-.015em"
  title:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: ".01em"
  body:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  control:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  control-cell:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: ".8rem"
    fontWeight: 500
    lineHeight: 1.15
  tab:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: ".6875rem"
    fontWeight: 500
    letterSpacing: ".08em"
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: ".72rem"
    fontWeight: 500
    letterSpacing: ".1em"
  status:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: ".8rem"
    fontWeight: 500
    letterSpacing: ".06em"
  readout:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: ".8rem"
    fontWeight: 500
  meta:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: ".76rem"
    fontWeight: 500
rounded:
  tile: "12px"
  large: "14px"
  chip: "4px"
  round: "50%"
spacing:
  edge: "10px"
  gap: "8px"
  control: "44px"
  map-button: "52px"
  add-button: "61px"
  tab-bar: "54px"
  sheet-inset: "5px"
  sheet-phone: "6px 21px 18px"
  sheet-side: "6px 25px 20px"
  side-panel: "390px"
  draw-bar: "12px"
components:
  map-button:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.chrome-ink}"
    rounded: "{rounded.tile}"
    size: "{spacing.map-button}"
  map-button-on:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.chrome}"
    rounded: "{rounded.tile}"
    size: "{spacing.map-button}"
  status-pill:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.chrome-ink}"
    typography: "{typography.status}"
    rounded: "{rounded.tile}"
    padding: "0 14px"
    height: "{spacing.control}"
  add-button:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.chrome}"
    rounded: "{rounded.large}"
    size: "{spacing.add-button}"
  tab-bar:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.chrome-muted}"
    typography: "{typography.tab}"
    rounded: "{rounded.large}"
    height: "{spacing.tab-bar}"
  tab-active:
    textColor: "{colors.signal}"
  button-primary:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.tile}"
    padding: "0 16px"
    height: "{spacing.control}"
  button-primary-night:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.tile}"
    padding: "0 16px"
    height: "{spacing.control}"
  button-secondary:
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.tile}"
    padding: "0 16px"
    height: "{spacing.control}"
  action-button:
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "6px 4px"
    height: "52px"
  draw-cell:
    textColor: "{colors.chrome-ink}"
    typography: "{typography.control-cell}"
    rounded: "{rounded.tile}"
    padding: "4px"
    height: "48px"
  draw-cell-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.chrome}"
    typography: "{typography.control-cell}"
    rounded: "{rounded.tile}"
    padding: "4px"
    height: "48px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "10px 12px"
    height: "{spacing.control}"
  chip:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.meta}"
    rounded: "{rounded.chip}"
    padding: "3px 10px"
  sheet-phone:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "{spacing.sheet-phone}"
  side-panel:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.chrome-ink}"
    rounded: "{rounded.large}"
    padding: "{spacing.sheet-side}"
    width: "{spacing.side-panel}"
  draw-bar:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.chrome-ink}"
    rounded: "{rounded.tile}"
    padding: "{spacing.draw-bar}"
---

# Design System: Plot Logbook

## Overview

**Creative North Star: "Noir Data"**

The plot's map fills the screen to all four edges, and every control floats over it as a near-black tile: the sync status top left, the map buttons in a rail down the right, the add button bottom right, the tab bar along the bottom, and the drawing bar above it while you draw. The tiles are the same near-black in light and dark themes, so over both the drawn plan and the photo imagery the plot itself (its fills, its fence colours, the photo) is the brightest and most colourful thing on screen.

One colour does the signalling. Sand marks whatever is live: the active tab and its top bar, a map button that is switched on, the drawing bar's frame while you draw, the open sheet's grip, a chosen tool or fence type, and the one primary action in a group. Everything else on the tiles is off-white ink, quiet grey and thin edges. Measurements, status and group names are set in IBM Plex Mono; everything people read is IBM Plex Sans.

Sheets and list views (Jobs, Water, Photos, More) are the one part that follows the theme: cool near-white panels in light, near-black panels in dark, hairline rows, no boxes. On a phone a sheet is an inset card that never takes more than two thirds of the screen; on a PC it is a 390px side panel that is dark in both themes and outlined in sand. It is a field tool used in full sun: every control is at least 44px, and the system leans on contrast rather than decoration.

Seed: none. The world was picked in the Design Pipeline run (`Design Pipeline/projects/plot-logbook/`) on 21 November 2026: Noir Data, then the Floating layout, then the Signal details, then tuned values and a finish review, shipped as 0.3.8.

**Key Characteristics:**
- The map runs edge to edge; all chrome floats over it as near-black tiles, the same in both themes.
- Sand is the one signal colour, for what is live and the primary action; it never decorates.
- IBM Plex Sans for words, IBM Plex Mono for numbers, status and group names; tabular figures everywhere.
- 12px corners on tiles, sheets and controls; 14px on the tab bar, the add button and the PC panel.
- Every control at least 44px; the drawing bar's buttons are equal cells, 48px tall, icon over word.
- Drawn line icons on a 24-unit grid, stroked in the text colour at 2.4.
- The plan's colours are data, not palette.

## Colors

A near-black instrument palette over the map, one sand signal, and theme-following neutrals for the sheets and list views.

### Primary
- **Signal Sand** (`signal`): the live colour on every dark surface. The active tab's label, icon and 3px top bar; the whiteboard button while it is on; the drawing bar's frame and its title; a chosen whiteboard tool's outline; the sheet grip in dark theme; the PC side panel's outline; the add button's fill; primary buttons on the tiles and in dark theme; the focus ring on every dark surface.
- **Sheet Sand** (`sand`): the same role on light sheets and views, a shade deeper so the fill holds on near-white. Primary buttons, the grip, a chosen fence type, selected text. Text on any sand fill is `ink` (or `chrome` on the tiles).
- **Sand Text** (`sand-text`, night `night-sand-text`): sand as text and as small controls on panels: the "Back to …" links, link-style buttons, the sliders and checkboxes inside sheets (light sand is too pale for a thumb on near-white), and the focus ring on light sheets and views.

### Neutral
- **Tile Black** (`chrome`): every tile over the map, the PC side panel, `theme-color` and the manifest `theme_color`. Its raised part (`chrome-raised`) fills pressed snap buttons and whiteboard tools.
- **Tile Ink / Tile Grey** (`chrome-ink`, `chrome-muted`): text and icons on the tiles; inactive tab labels.
- **Tile Edge** (`chrome-edge`): the tiles' outline. Inside the drawing bar, button outlines are this edge mixed 70% into `chrome`. The PC panel's own border is `panel-edge`, with the sand outline drawn just inside it.
- **Page / Panel / Raised / Field** (`page`, `panel`, `panel-raised`, `field`; night `night-page`, `night-panel`, `night-panel-raised`, `night-field`): the list views' ground, phone sheets, chips and hover wells, and inputs. `page` is also the manifest `background_color`.
- **Ink / Muted** (`ink`, `muted`; night `chrome-ink`, `night-muted`): text and secondary text (field captions, meta, notes, empty states).
- **Line / Line Strong** (`line`, `line-strong`; night `night-line`, `chrome-edge`): hairline rows and input borders; the outline of action buttons and dashed planned chips.

### Status
- **OK / Warn / Danger** (`ok`, `warn`, `danger` on light sheets; `night-ok`, `night-warn`, `night-danger` in dark theme and on every dark tile and the PC panel in both themes): the sync dot, confidence chips (tinted fills mixed into the panel), overdue dates, Delete.
- **GPS Blue** (`gps`): only for location: the locate dot, the locate button's ring while GPS is on and its fill while the map follows you.

### The map is data
The drawn plan's ground, area fills (pasture, forest), fence-type colours, category colours, cadastral lines, the reshaping handles and the map labels are drawn by `js/map.js` and the app's own map styles. They are the same in both themes and are not part of this palette. The design system only sets the map labels' fonts (Plex Sans 600 for feature labels, Plex Mono for measurements and grid distances), never their colours.

### Named Rules
**The Signal Rule.** Sand means "live" or "do this". Use it for the current state (active tab, a button that is on, the bar you are drawing in, the open sheet) and for the one primary action in a group, and nowhere else. Never as a decorative fill, border or background.

**The Same Tiles Rule.** What floats over the map is near-black in both themes. The tiles re-point the shared tokens (`--panel`, `--ink`, `--line`, `--accent` and the status colours) inside themselves; a new floating control gets the dark look by sitting inside `.map-top`, `.map-bottom`, `.draw-bar`, `nav.tabs` or the Leaflet controls, not by new colours.

**The Plot Leads Rule.** The chrome never uses a hue the plan uses for meaning. Fence and area colours are the user's data; nothing in the interface competes with them.

## Typography

**Display Font:** IBM Plex Sans (with sans-serif), self-hosted, weights 400 to 600 and 700, latin and latin-ext, `font-display: swap`.
**Body Font:** IBM Plex Sans.
**Label/Mono Font:** IBM Plex Mono (with ui-monospace, monospace), self-hosted at weight 500 only.

**Character:** a plain engineering sans for everything read, and its mono partner for everything measured or counted. Hierarchy comes from size and weight, not from a display face.

### Hierarchy
- **Headline** (700, 1.65rem, line-height 1.2, -.015em): sheet titles and view titles (Jobs, Water, More, Layers). The one large size.
- **Title** (600, 15px, .01em): the drawing bar's title ("Shaping …", "Gate"), in `signal`.
- **Body** (400, 15px, line-height 1.45, tabular figures): base text, descriptions, list rows, notes (.875rem in the drawing bar's hint).
- **Control** (600, 15px): buttons. Action buttons in a sheet are 500; drawing-bar cells are `control-cell` (500, .8rem, line-height 1.15, 600 for the primary).
- **Tab** (500, .6875rem, .08em, uppercase): tab labels; 600 and `signal` when active.
- **Label** (Mono 500, .72rem, .1em, uppercase): the names of collapsible groups in sheets and Layers.
- **Status** (Mono 500, .8rem, .06em, uppercase): the sync pill.
- **Readout** (Mono, .8rem): the drawing bar's live summary (length, points, area), written in parts.
- **Meta** (Mono, .76rem): dates in the timeline, due dates, counts under names. Chips use the mono at .72rem with .03em tracking.

### Named Rules
**The Measured Mono Rule.** Numbers that are measurements, counts, dates or status go in Plex Mono; words people read go in Plex Sans. Uppercase appears only in the mono labels and status and in the tab labels.

**The Readout in Parts Rule.** A multi-part readout is written as separate pieces with the separator at the end of each piece, so a wrapped line never starts with a dot.

## Layout

- **Map first.** The map view fills the screen; the app has a single grid row and the tab bar floats over the map rather than taking a row.
- **Over the map (phone and PC):** a 10px gap from every screen edge (`edge`). The sync pill sits top left; the four map buttons (find, locate, whiteboard, layers) form a rail of separate 52px tiles down the right, 8px apart. The add button (61px) sits bottom right above the tab bar. Everything at the bottom clears the tab bar by the same 10px, so it sits at 74px plus the safe area.
- **Tab bar:** 54px tall, 10px from the bottom and sides on a phone. On the PC it is 620px wide and centred; with the side panel open it centres in the space left of the panel.
- **Phone sheets (below 900px):** cards inset 5px from the sides, standing above the tab bar, at most 68% of the screen less 64px. Padding 6px top, 21px sides, 18px bottom. A sheet dropped to "peek" shows only its 84px top.
- **PC side panel (900px and up):** 390px wide, 10px from the top, right and bottom; padding 6px 25px 20px. While it is open the map buttons and add button move left of it (390px plus 30px).
- **Drawing bars:** full width less the edges on a phone, in two rows of equal cells (`minmax(70px, 1fr)`, 6px apart). On the PC 520px wide and centred; the whiteboard bar 620px. On a phone the scale bar hides while a drawing bar is up.
- **List views:** 16px top padding, 90px at the bottom to clear the tab bar; 720px wide at most on the PC (from the app's base styles).
- **Breakpoint:** one, at 900px.
- **Rhythm:** controls 8px apart in rows and actions, 6px inside the drawing bar; list rows at least 52px; field rows at least 44px.

## Elevation & Depth

The tiles over the map are flat: no shadow, a thin `chrome-edge` outline, and contrast against the map does the separating. The tab bar and drawing bars carry shadows so faint (4% and 2% black) that they read as none. Depth is kept for what genuinely sits above the map and moves: sheets and the toast.

### Shadow Vocabulary
- **Sheet** (`box-shadow: 0 -4px 20px rgb(0 0 0 / .22)`; dark theme `.6`): phone sheets.
- **Side panel** (`box-shadow: -6px 0 24px rgb(0 0 0 / .14)`): the PC panel.
- **Toast** (`box-shadow: 0 4px 16px rgb(0 0 0 / .16)`; dark `.5`): the toast, which is `ink` on `panel`, inverted from the theme.
- **Primary ledge** (`box-shadow: inset 0 -3px 0 rgb(0 0 0 / .16)`): a 3px inner bottom edge on sand primary buttons in sheets and views. The finish review suggested dropping it; it was kept as picked.

### Named Rules
**The Flat Tile Rule.** Nothing floating over the map gets a drop shadow. A tile is separated from the map by being near-black with a thin edge.

## Shapes

Firm, gently rounded rectangles. Tiles, sheets, buttons, fields and the drawing bar have 12px corners (`tile`); the three largest pieces of chrome (the tab bar, the add button, the PC panel) have 14px (`large`). Chips are nearly square at 4px; photo thumbnails are 70% of 12px. Only colour swatches, status dots and the GPS dot are round. The sheet grip is a 56px by 5px sand bar.

Edges are authored as a .5px hairline on the map tiles and tab bar, 1.5px for the drawing bar's sand frame, its buttons, action buttons and the whiteboard's chosen tool, and 1px elsewhere. Hairline rows (1px `line`) separate list items, timeline entries and Layers rows; the group rule in a sheet is 1.5px. In Edge every one of these computes to 1px (at both 1x and 2x screens), so the hairline and the firmer edge currently draw the same; the sand frame and outlines carry their weight through colour, not width.

**Icons:** a drawn line set on a 24-unit grid (`ICON` in `js/ui/dom.js`, the same paths written into index.html), stroked in `currentColor` at 2.4 with round caps and joins, no fills except small dots. 22px by default, 24px in the tabs, 28px on the add button, 18px in buttons and drawing bars, 16px on Snap, 14px in chips, 1.15em inline in notes. Icons are decorative: each button keeps its words or an `aria-label`.

## Components

### Map tiles
Near-black, outlined, quiet until they are live.
- **Map buttons:** 52px square `chrome` tiles with `chrome-ink` icons and a `chrome-edge` outline. The whiteboard button, while on, fills `signal` with a 2px `chrome` inner ring. The locate button is ringed in `gps` while GPS is on and filled `gps` while following.
- **Sync pill:** a 44px `chrome` tile with a 10px status dot and the state in the `status` mono caps.
- **Add button:** 61px, 14px corners, `signal` fill, a 28px plus icon in `chrome`.
- **Leaflet zoom and scale:** the same tile colours, zoom buttons 44px.

### Tab bar (Navigation)
- **Style:** a `chrome` bar floating 10px off the edges, 54px tall, 14px corners, a `chrome-edge` hairline. Five buttons, each a 24px icon over a `tab` caps label.
- **States:** inactive in `chrome-muted`; active in `signal` (label 600) with a 3px sand bar across the top of the button, inset 14% from each side.
- **PC:** 620px, centred; shifts left to stay clear of the side panel.

### Buttons
- **Shape:** 12px corners, at least 44px tall.
- **Primary:** `sand` fill (`signal` in dark theme and on the tiles), `ink` text, 600, 0 16px, with the 3px inner ledge in sheets and views.
- **Secondary:** transparent with a 1px `line` border and `ink` text; the border darkens to `line-strong` on hover. **Danger** is a secondary button with `danger` text.
- **Action buttons (feature sheet):** a four-column grid of 52px buttons, icon over word, transparent with a 1.5px `line-strong` border, weight 500. The one the sheet marks primary (Note, on a feature) is the sand primary.
- **Link-style:** `sand-text`, at least 32px tall; the "Back to …" button is `sand-text` at 600.
- **Focus:** a 3px outline offset 2px in the `--focus` colour: `signal` on the tiles, the PC panel and in dark theme (over 10:1), `sand-text` on light sheets and views (about 6.5:1). A new surface that changes the theme sets `--focus` along with its other tokens.

### Chips
- **Style:** `panel-raised` fill, mono 500 .72rem (the shipped face; nothing asks for a Mono weight that isn't shipped), 4px corners, 3px 10px; 36px tall when a chip is a button. A category chip takes its category's data colour.
- **Confidence:** high, medium and low are `ok`, `warn` and `danger` tinted into the panel (18%, 20%, 16%) with the same hue mixed into the ink for text. **Planned** is an unfilled chip with a dashed 1.5px `line-strong` border.
- **Fence-type chips:** 44px, `panel` with a `line` border; chosen, they fill sand.

### Cards / Containers
- **Corner Style:** none for content: list-view cards are hairline sections (a 1px `line` top rule, 14px vertical padding, no fill, no radius). Only the sheets and the jobs strip over the map are boxed.
- **Background:** `panel` for phone sheets, `chrome` for the PC panel and everything over the map.
- **Shadow Strategy:** see Elevation & Depth.
- **Border:** phone sheets 1px `line`; the PC panel 1px `panel-edge` plus a 1.5px `signal` outline just inside it.
- **Internal Padding:** phone sheets 6px 21px 18px; PC panel 6px 25px 20px; drawing bar 12px; whiteboard bar 8px; jobs strip 10px 14px.

### Inputs / Fields
- **Style:** `field` fill, 1px `line` border, 12px corners, 10px 12px padding, at least 44px. Captions above in `muted`, .8rem at 500. Placeholders in `muted` mixed 85% into the panel.
- **Selects:** every select has the field look and is at least 44px; one zero-specificity rule (`:where(select)`) covers any that no other rule styles. `color-scheme` follows the surface (dark on the tiles, the PC panel and in dark theme), so the open list and date pickers match.
- **Focus:** the focus ring above; the caret is the accent colour.
- **Checkboxes, radios, sliders:** browser controls tinted with the accent (`sand-text` inside sheets), 20px; job ticks 24px.

### Drawing bar (signature)
The control surface for the app's most important job, drawing and reshaping lines, gates, points and areas in the field.
- A `chrome` card with a 1.5px `signal` frame and 12px corners, floating above the tab bar.
- **Readout:** the title in `title` sand, then the live summary in mono parts; the Snap toggle sits at the far end of the line (36px, `chrome-raised`, filled sand when on).
- **Buttons:** rows of equal cells, at least 70px wide and 48px tall, icon above the word, transparent with a 1.5px edge. Save is the sand primary; a disabled Save is a dashed half-sand outline with quiet text, so it never looks ready when it is not. Other disabled cells drop to 40% opacity.
- **Hint:** one line under the buttons in the body face at .875rem; hidden when empty.
- **Whiteboard variant:** tools as 44px buttons on `chrome-raised`, the chosen tool outlined in sand rather than filled; colour swatches 32px with a light 2px outline and a 44px touch target; undo, redo, clear and Done below.

### Sheets (signature)
- Phone: the inset card described in Layout, with a 56px sand grip, the headline title, a 44px close button top right, and collapsible groups headed by `label` mono caps over a 1.5px rule.
- PC: the dark side panel outlined in sand. Inside it the theme tokens are re-pointed to the tile colours and the dark status colours, in both themes.
- Rows in Layers and lists are at least 44px (list items 52px) with hairline separators.

### Motion
Minimal and functional: sheets slide in over 0.2s (`ease`), the grip widens over 0.15s while dragged, and group chevrons rotate over 0.15s. There is no other animation.

## Do's and Don'ts

### Do:
- **Do** float every control over the map as a `chrome` tile with a thin `chrome-edge` outline, the same in both themes.
- **Do** keep sand for what is live and for the one primary action in a group.
- **Do** set measurements, counts, dates and status in IBM Plex Mono, and everything read in IBM Plex Sans.
- **Do** keep every control at least 44px; drawing-bar cells 48px; map buttons 52px.
- **Do** use 12px corners on tiles, sheets, buttons and fields, and 14px on the tab bar, the add button and the PC panel.
- **Do** keep 10px between the chrome and the screen edges, and between the tab bar and what floats above it.
- **Do** cap a phone sheet at about two thirds of the screen, inset 5px, above the tab bar.
- **Do** put a drawn icon from `ICON` beside a button's word, never in place of it unless the button has an `aria-label`.
- **Do** write multi-part readouts in parts, separator at the end of each part.
- **Do** use the dark-theme status colours on anything dark, in both themes.

### Don't:
- **Don't** give the tiles over the map a drop shadow.
- **Don't** use sand as decoration, a background wash or a border on something that is not live.
- **Don't** introduce a colour the plan uses for meaning; fence, area and category colours are data.
- **Don't** theme the map's own colours or labels; only their fonts belong to the design.
- **Don't** let the chrome follow the theme: only sheets and list views do.
- **Don't** set body text in the mono, or uppercase anything outside the mono labels, the status pill and the tab labels.
- **Don't** load fonts or icons from the internet; the app must work with no signal.
- **Don't** add a second accent colour.
