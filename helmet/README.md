# Feature: Helmet view (3D, A-Frame) — the AR concept

**Owner:** Edward (remote) · **Paste into Claude / GitHub Copilot together with the root `README.md`.**

## Purpose
Show what the astronaut sees: real Jezero terrain in first person, with a **home beacon that you can see even when a hill hides it**, a route line on the ground, and the Walk Budget as a HUD. This is our "future AR helmet" concept — today a 3D view, tomorrow see-through AR in a real helmet (NASA is already working on AR for suits: Joint AR at JSC, NASA SUITS).

It must work **standalone** (`helmet/index.html` opened directly) and **inside the main app** (iframe receiving live state).

## Files to create
```
/helmet/index.html     A-Frame scene, loads helmet.js
/helmet/terrain.js     A-Frame component: builds the terrain mesh from data/heightgrid.json
/helmet/helmet.js      beacon, route line, landmarks, HUD, walk-along mode, postMessage listener
```
A-Frame from CDN: `<script src="https://aframe.io/releases/1.6.0/aframe.min.js"></script>`. No build step. Run from the repo root with `python3 -m http.server 8000` → http://localhost:8000/helmet/ (paths to data are `../data/...`).

## Start without waiting for Sean (mock data)
Create `helmet/heightgrid.mock.json` with the same shape as `data/heightgrid.json` (e.g. 100 × 100, cellM 80, data = a few sine hills + a crater bowl). Load `../data/heightgrid.json` first; if it fails, load the mock. Same for `../data/meta.json` (mock: home at the grid centre).

## World coordinates
- Origin (0,0,0) = **home** (meta.home), at home's ground height.
- x = east (metres), z = **south** (A-Frame/three.js: north = −z), y = up (metres, elevation − home elevation).
- Lat/lon → x/z: `x = deg2rad(lon − home.lon) * cos(deg2rad(home.lat)) * R`, `z = −deg2rad(lat − home.lat) * R` (R = 3,396,190). Use `lib/geo.js` (`import { deg2rad, R } from '../lib/geo.js'`).
- Vertical scale 1× (true). Optional `?exaggerate=2` for drama — label it on screen if used.

## Terrain component (`terrain.js`)
```js
AFRAME.registerComponent('heightgrid-terrain', {
  schema: { src: { type: 'string' } },
  async init() {
    // fetch grid; geometry = new THREE.PlaneGeometry(w*cellM_ew, h*cellM, w-1, h-1)
    // geometry.rotateX(-Math.PI / 2) FIRST so it lies flat; plane row 0 (top) now points north (-z) ✔
    // THEN for each vertex i: position.setY(i, grid.data[i] - homeElevation)  (vertex order = row-major, row 0 = north, col 0 = west)
    // offset the mesh so home's cell sits at x=0,z=0
    // geometry.computeVertexNormals(); material = MeshStandardMaterial({ color:'#b0623a', roughness:1, flatShading:true })
    // this.el.setObject3D('mesh', mesh)
  }
});
```
(`cellM_ew` = 80 × cos(home.lat) ≈ 76 m, `cellM` = 80 m.) 399 × 378 ≈ 150k vertices — fine on a laptop. If a phone struggles, sample every 2nd vertex.

Optional texture: a CTX tile image draped on the mesh — stretch only.

## Scene
- Sky: daytime Mars butterscotch `#c9a27e` → horizon `#e0c49a`; light: one directional "sun" + soft ambient.
- **Fog from dust:** `fog="type: linear; color: #c9a27e; near: 200; far: <visibilityKm*1000>"`, where `visibilityKm` comes from the Walk Budget state. As the dust storm rises in the demo, the far landmarks literally disappear — this links the 3D view to the map's blind zones. Clamp far to 30 km max for rendering.
- Camera: at the astronaut position, y = ground height there + 1.7 m. Use `look-controls` (mouse/touch drag) and `wasd-controls` with acceleration tuned to walking speed. Keep the camera glued to the ground (raycast down or sample the grid each tick).

## Overlays (the "AR" layer)
- **Home beacon:** a tall thin cylinder (e.g. 200 m high, 3 m radius, emissive cyan `#56d4ff`) at home + a label "HOME 2.4 km". Render it with `material="depthTest: false; transparent: true; opacity: 0.6"` so it shows **through hills** — like AR. Change label to "HOME (hidden behind terrain)" when the line of sight is blocked (raycast from camera to beacon base against the terrain mesh).
- **Direction arrow:** fixed in the HUD (bottom centre), rotates to the bearing of home relative to the camera heading.
- **Route:** a line on the ground following `route.points` (from state, or `../data/route_demo.json`), 0.5 m above terrain, amber.
- **Landmarks:** small labelled markers from `../data/landmarks.json`; hide those beyond `visibilityKm`.
- **HUD** (HTML overlay on top of the canvas, not 3D text — easier to read): status word + colour (GO / CAUTION / RETURN NOW), suit minutes left, minutes to home, dust τ and visibility km, position uncertainty ± m, distance + bearing home. Big readable mono font. No NASA logos.

## Live state from the main app
```js
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'sightline:state') return;
  const s = e.data.state;   // shape: root README section 7 (+ s.budget from crew/README.md)
  // move camera to s.astronaut (unless the user is walking manually), update HUD, fog, route, beacon label
});
```
Standalone mode: read query params `?lat=&lon=&tau=&status=` with sensible defaults (home, τ 0.4, GREEN), so the page works alone for Edward's testing.

## Walk-along mode
Button "Walk route": camera moves along `route.points` at ~1.3 m/s (or faster ×20 for the video), facing the direction of travel, with the HUD updating distance to home.

## Acceptance checklist
- [ ] Real Jezero terrain renders (delta, rim visible) from `data/heightgrid.json`.
- [ ] Camera starts at home at eye height, can look around (mouse + touch).
- [ ] Beacon visible through terrain; label changes when hidden.
- [ ] HUD arrow points home correctly (test: walk 1 km north → arrow points back/south).
- [ ] Fog follows dust τ (τ 0.4 → clear; τ 2 → far hills gone).
- [ ] Works inside the main app's iframe and standalone. 30+ fps on a normal laptop.

## Stretch
- Sun position from LTST (shadows).
- Dust-devil particle effect around 12:00 LTST.
- WebXR "Enter VR" button (A-Frame has it built in) — nice for the pitch photo.
