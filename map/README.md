# Feature: Main app — 2D map, blind zones, panels, demo player

**Owner:** Brayden · **Also owns:** `/index.html`, `/styles.css`, `/lib/geo.js`, `/lib/store.js`
**Paste into Claude together with the root `README.md`.**

## Purpose
This is the screen judges see. It shows the Jezero map and the astronaut's position, and answers **"can this astronaut still get home?"** at a glance. It hosts every other feature: the walk budget panel (`crew/`), routes (`route/`), Skyline Fix (`skyline/`) and the helmet view (`helmet/`, in an iframe).

## Files to create
```
/index.html            page shell, loads Leaflet CSS/JS from cdnjs, <script type="module" src="map/app.js">
/styles.css            all main-app styles
/lib/geo.js            exactly as in root README section 5
/lib/store.js          exactly as in root README section 7
/map/app.js            boot: load data files, create map, mount panels, subscribe to store
/map/map.js            Leaflet map, base layers, markers, route + traverse lines, uncertainty circle
/map/visibility.js     blind-zone overlay (combine viewshed PNGs, dust visibility cut-off)
/map/panels.js         walk budget panel, alert list, sources/"how we know" modal, controls
/map/scenario.js       demo player: plays data/scenario_demo.json on a timeline
```

## First hour (unblocks everyone)
1. `lib/geo.js`, `lib/store.js` copied from the root README.
2. `index.html` with an empty map and a right-side panel.
3. Push. Tell the group.

## Layout
- Desktop (≥ 1024 px): map fills the left ~68%; right column = **Walk Budget card** (big status + minutes left), **Alerts** list, **Controls**. A collapsible bottom strip = **scenario timeline** (play/pause, scrub, current sol / LTST / EVA minutes).
- Mobile (≤ 768 px): map on top (60vh), panels stacked below. No horizontal scroll.
- A "Helmet view" button opens `helmet/index.html` in an iframe overlay (full-screen modal with close button). Send state to it with `postMessage` (root README section 7).
- Visual direction: mission-control dark UI over the orbital imagery. Status colours: GREEN `#3fb950`, AMBER `#d29922`, RED `#f85149`. Monospace for numbers (e.g. "IBM Plex Mono" or "JetBrains Mono" from Google Fonts), clean sans for text. Avoid generic template look: no gradient blobs, no tiny label text above every heading, no "01 ·" numbering.

## Map (map/map.js)
```js
const map = L.map('map', { crs: L.CRS.EPSG4326, minZoom: 9, maxZoom: 18, maxBounds: [[18.20, 77.15], [18.73, 77.71]] })
  .setView([18.4447, 77.4508], 13);
const ctx = L.tileLayer('https://trek.nasa.gov/tiles/Mars/EQ/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0/1.0.0/default/default028mm/{z}/{y}/{x}.png',
  { maxNativeZoom: 13, maxZoom: 18, attribution: 'CTX mosaic: NASA/JPL-Caltech/MSSS, via NASA Mars Trek' }).addTo(map);
const hirise = L.tileLayer('https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/default/default028mm/{z}/{y}/{x}.png',
  { maxNativeZoom: 17, maxZoom: 18, minZoom: 13, attribution: 'HiRISE mosaic: NASA/JPL-Caltech/UArizona, via NASA Mars Trek' }).addTo(map);
```
(Tile availability verified: CTX up to z13, HiRISE up to z17. HiRISE covers only part of the area — CTX stays underneath.)

Layers (use `L.control.layers` to toggle):
- **Home** marker (habitat icon) + **landmarks** (small triangles, label on hover) from `data/landmarks.json`.
- **Science targets** from `data/targets.json`.
- **Perseverance traverse** (thin white line) from `data/traverse.json` — label "Real Perseverance route (NASA)". It shows our terrain is real and drivable.
- **Astronaut** marker with a heading wedge, and an **uncertainty circle** (`L.circle`, radius = `state.posUncertaintyM`). Never draw a precise "blue dot" — the circle is the point of the app.
- **Route** polyline(s) from `route/route.js` — `safest` solid, `shortest` dashed.
- **Blind zones** overlay (below).
- Click on map → in "Plan" mode, sets the route target and calls `planRoute` (see `route/README.md`).

## Blind zones (map/visibility.js) — the SEE feature
A cell is **blind** if the astronaut standing there cannot see **any usable landmark** (home included).
A landmark L is usable from cell X when:
1. viewshed `data/viewsheds/<L.id>.png` is 255 at X, **and**
2. distance(X, L) ≤ effective visibility range `visKm` (from the walk budget output: `budget.visibilityKm`, which comes from dust τ and SANS vision — see `crew/README.md`).

Implementation:
```js
// load each viewshed PNG into an offscreen canvas once, keep Uint8 arrays
// on every state change of tau / sansAffected:
//   for each cell: blind = !landmarks.some(L => vis[L.id][i] && distM(cell, L) <= visKm*1000)
//   paint an ImageData (blind = rgba(248,81,73,0.35), home-visible = transparent, landmark-only = rgba(210,153,34,0.15))
//   L.imageOverlay(canvas.toDataURL(), [[latMin, lonMin], [latMax, lonMax]], { opacity: 1 })
```
- Precompute each cell's lat/lon once with `toLatLon`.
- 399 × 378 × ~15 landmarks = ~2M checks: fast enough. Only recompute when `tau`, `sansAffected` or the landmarks change, not every tick.
- Legend: red = "No landmark in sight", amber = "Home hidden, landmark visible", clear = "Home in sight".
- Show the stat line: "Home visible from X% of ground within 3 km" (computed from the same arrays).

## Panels (map/panels.js)
- **Walk Budget card** (from `state.budget`, see `crew/README.md`): big status word (GO / CAUTION / RETURN NOW), minutes of suit time left, minutes needed to walk home (with 20% margin), "turn-back in X min", visibility km.
- **Alerts list**: `budget.factors` sorted RED → AMBER → GREEN. Each row: icon, message, and a small "NASA data" or "Estimate" tag. Clicking a row opens the sources modal at that constant.
- **Controls** (for judges to play): sol since landing slider (0–60), LTST slider (6–19), dust τ slider (0.2–5), "Solar storm" toggle, "Vision changes (SANS)" toggle, route mode (shortest / safest / keep home in sight).
- **"How we know" modal**: table of every row in `data/crew_constants.json` — label, value, unit, NASA data / estimate, source link. This is our Validity proof — make it look good.
- **Skyline Fix** button → opens the panel from `skyline/`.

## Demo player (map/scenario.js)
Plays `data/scenario_demo.json`:
- Clock: 1 real second = 2 EVA minutes (configurable). Play / pause / scrub / restart.
- Moves the astronaut along `state.route.points` at the walk speed from the budget.
- Applies events at `tMin`: `tau` → `setState({tau})`; `sep_onset` → `setState({sepActive:true})` and show a full-width red banner "Solar particle event — replay of May 2024 storm measured by Curiosity. Return to shelter."; `skyline_fix` → open Skyline Fix panel with that site's result; `eva_end` → stop.
- On `sep_onset` the route planner is re-run with target = home, mode = `safest`, so the new route home appears.
- Each tick: `setState({evaMin, ltst: startLtst + evaMin / 61.65, astronaut})` (one Mars "hour" = 1/24 sol = 61.65 Earth minutes) then `computeBudget` re-runs (crew module subscribes).
- A "Video mode" key (`v`) hides controls for clean screen recording.

## Acceptance checklist
- [ ] Map loads CTX + HiRISE tiles at Jezero, EPSG4326, no console errors.
- [ ] Home, landmarks, targets, real Perseverance traverse visible.
- [ ] Blind-zone overlay grows when τ slider goes up; stat line updates.
- [ ] Walk Budget card + alerts update live from the sliders.
- [ ] Demo player runs the whole story start to end without touching anything.
- [ ] Helmet iframe opens and receives state.
- [ ] Works at 375 px and 1440 px wide, keyboard focus visible on all controls.
- [ ] Works on GitHub Pages (relative paths only, e.g. `data/meta.json` not `/data/meta.json`).

## Stretch (only after the checklist)
- "Where to put a beacon": click to place a 10 m beacon mast; show how many blind cells it would fix (needs a viewshed computed on the fly in a Web Worker, or precompute candidates in `scripts/`).
- Sun direction / shadows from LTST.
