// Written with AI assistance (Claude / GitHub Copilot)
// Map renderer: Leaflet 2D view plus a lazily loaded A-Frame 3D view. Reads the store; the only writes are
// user clicks → onPickTarget (an action, not a subscriber). The 2D/3D toggle is local view state.

const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ/';
const TILE_PATH = '/1.0.0/default/default028mm/{z}/{y}/{x}.png';
const AFRAME_SRC = 'https://aframe.io/releases/1.6.0/aframe.min.js';
const TERRAIN_SRC = 'lib/terrain.js';
const EXAGGERATE = 2;
const ASTRO_R = 25, ASTRO_LIFT = 50, BEACON_H = 400, LIFT_M = 15, ROUTE_R = 10, STEP_M = 60;
const PITCH_MIN = 0.08, PITCH_MAX = 1.5, CAM_CLEARANCE_M = 40;
const COLORS = { blind: [248, 81, 73, 120], homeHidden: [210, 153, 34, 32] };
const CREAM = '#fff4e0', INK = '#1a110c', ACCENT = '#ff8a3d', DUST = '#c98a55';
// Dust look (visual only, driven by τ): haze opacity and sky colour. Not a measured haze map.
const HAZE_PER_TAU = 0.06, HAZE_MAX = 0.6;
const SKY_CLEAR = [227, 167, 106], SKY_DUSTY = [168, 120, 84], TAU_DUSTY = 8;
const DEVIL_OFFSETS_M = [[900, 300], [-700, 1200], [400, -1100]]; // illustrative swirl positions around the astronaut
const $ = id => document.getElementById(id);

// ---------- 2D (Leaflet) ----------

function astronautIcon(heading) {
  return L.divIcon({
    className: 'astro-icon', iconSize: [28, 28], iconAnchor: [14, 14],
    html: `<svg width="28" height="28" viewBox="-14 -14 28 28" aria-hidden="true">
      <g transform="rotate(${Math.round(heading)})"><path d="M0,-13 L6,2 L-6,2 Z" fill="${CREAM}" stroke="${INK}" stroke-width="1.5"/></g>
      <circle r="5" fill="${CREAM}" stroke="${INK}" stroke-width="2"/></svg>`
  });
}

function drawOverlay(vis) {
  const cv = document.createElement('canvas');
  cv.width = vis.w; cv.height = vis.h;
  const g = cv.getContext('2d');
  const img = g.createImageData(vis.w, vis.h);
  for (let i = 0; i < vis.blind.length; i++) {
    const c = vis.blind[i] ? COLORS.blind : vis.homeHidden[i] ? COLORS.homeHidden : null;
    if (c) img.data.set(c, i * 4);
  }
  g.putImageData(img, 0, 0);
  return cv.toDataURL();
}

// A route line with a dark casing underneath so it reads over orange-brown terrain.
function routeLine(map, color, weight, dashArray) {
  const casing = L.polyline([], { color: INK, weight: weight + 4, opacity: 0.85 }).addTo(map);
  const line = L.polyline([], { color, weight, opacity: 1, dashArray }).addTo(map);
  return pts => { casing.setLatLngs(pts); line.setLatLngs(pts); };
}

function addLayers(map, data, box, onPickTarget) {
  // Offline fallback UNDER the NASA tiles (image overlays default to above tiles, which hid the real imagery)
  if (data.hasBasemap) {
    map.createPane('basemap').style.zIndex = 150; // tilePane is 200
    L.imageOverlay('data/basemap.png', box, { opacity: 1, interactive: false, pane: 'basemap' }).addTo(map);
  }
  const ctx = L.tileLayer(`${TREK}JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0${TILE_PATH}`, {
    maxNativeZoom: 13, maxZoom: 18, bounds: box,
    attribution: 'CTX mosaic: NASA/JPL-Caltech/MSSS · via NASA Mars Trek'
  }).addTo(map);
  const hirise = L.tileLayer(`${TREK}JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd${TILE_PATH}`, {
    // ponytail: HiRISE pyramid shows 1-px seams at z13–14 (NASA tile artifact); only use it close up
    minZoom: 15, maxNativeZoom: 17, maxZoom: 18, bounds: box,
    attribution: 'HiRISE mosaic: NASA/JPL-Caltech/UArizona'
  }).addTo(map);

  const blindLayer = L.imageOverlay('data:,', box, { className: 'blind-overlay', interactive: false }).addTo(map);
  const traverse = L.polyline(data.traverse.map(p => [p.lat, p.lon]), { color: '#ffffff', weight: 2, opacity: 0.6, dashArray: '2 4' });
  traverse.bindTooltip('Real Perseverance route (NASA waypoints)', { sticky: true });
  traverse.addTo(map);

  const landmarkLayer = L.layerGroup(data.landmarks.filter(l => l.id !== 'home').map(l =>
    L.marker([l.lat, l.lon], { icon: L.divIcon({ className: 'lm-icon', html: '▲', iconSize: [14, 14] }), keyboard: false })
      .bindTooltip(l.name))).addTo(map);
  const targetLayer = L.layerGroup(data.targets.map(t =>
    L.circleMarker([t.lat, t.lon], { radius: 6, color: ACCENT, weight: 2, fillOpacity: 0.3 })
      .bindTooltip(`${t.name} (Perseverance, sol ${t.sol})`)
      .on('click', e => { L.DomEvent.stop(e); onPickTarget({ lat: t.lat, lon: t.lon, id: t.id }); }))).addTo(map);

  L.marker([data.meta.home.lat, data.meta.home.lon], {
    icon: L.divIcon({ className: '', html: '<div class="home-icon"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    keyboard: false
  }).bindTooltip(data.meta.home.name).addTo(map);

  L.control.layers(
    { 'Orbital imagery': ctx },
    { 'HiRISE close-up': hirise, 'Blind zones': blindLayer, 'Perseverance route': traverse, 'Landmarks': landmarkLayer, 'Science targets': targetLayer },
    { collapsed: true, position: 'topright' }
  ).addTo(map);
  L.control.scale({ metric: true, imperial: false }).addTo(map);
  return blindLayer;
}

// ---------- 3D (A-Frame, lazy) ----------

const loadScript = src => new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = src; s.onload = resolve;
  s.onerror = () => reject(new Error(`could not load ${src}`));
  document.head.append(s);
});

function registerOrbit() {
  if (AFRAME.components['orbit-camera']) return;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  AFRAME.registerComponent('orbit-camera', {
    schema: { minDist: { default: 500 }, maxDist: { default: 25000 } },
    init() {
      this.o = { yaw: 0.6, pitch: 0.6, dist: 4000, x: 0, y: 0, z: 0 };
      this.heightAt = null;
      this.el.object3D.rotation.order = 'YXZ';
      const scene = this.el.sceneEl, pts = new Map();
      let pinch = 0;
      const span = () => { const [a, b] = [...pts.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
      scene.addEventListener('pointerdown', e => {
        pts.set(e.pointerId, [e.clientX, e.clientY]);
        scene.setPointerCapture(e.pointerId);
        pinch = pts.size === 2 ? span() : 0;
      });
      scene.addEventListener('pointermove', e => {
        const p = pts.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p[0], dy = e.clientY - p[1];
        pts.set(e.pointerId, [e.clientX, e.clientY]);
        if (pts.size === 2) { const d = span(); this.zoom(pinch / d); pinch = d; return; }
        this.o.yaw -= dx * 0.005;
        this.o.pitch = clamp(this.o.pitch + dy * 0.005, PITCH_MIN, PITCH_MAX);
      });
      for (const ev of ['pointerup', 'pointercancel']) scene.addEventListener(ev, e => pts.delete(e.pointerId));
      scene.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
    },
    zoom(f) { this.o.dist = clamp(this.o.dist * f, this.data.minDist, this.data.maxDist); },
    setTarget(x, y, z) { Object.assign(this.o, { x, y, z }); },
    tick() {
      const { yaw, pitch, dist, x, y, z } = this.o;
      const h = dist * Math.cos(pitch);
      const cx = x + h * Math.sin(yaw), cz = z + h * Math.cos(yaw);
      let cy = y + dist * Math.sin(pitch);
      const ground = this.heightAt?.(cx, cz);
      if (Number.isFinite(ground)) cy = Math.max(cy, ground + CAM_CLEARANCE_M);
      this.el.object3D.position.set(cx, cy, cz);
      this.el.object3D.rotation.set(-Math.atan2(cy - y, h), yaw, 0);
    }
  });
}

function mk(tag, attrs, parent) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.append(e);
  return e;
}

function buildScene() {
  const scene = document.createElement('a-scene');
  scene.setAttribute('embedded', '');
  scene.setAttribute('xr-mode-ui', 'enabled: false');
  scene.setAttribute('background', 'color: #e3a76a');
  const flat = color => `color: ${color}; shader: flat; side: double`;
  mk('a-entity', { light: 'type: ambient; color: #ffe6cc; intensity: 0.7' }, scene);
  mk('a-entity', { light: 'type: directional; color: #fff0dc; intensity: 0.9', position: '-4000 5000 3000' }, scene);
  return {
    scene,
    terrain: mk('a-entity', { 'heightgrid-terrain': `exaggerate: ${EXAGGERATE}` }, scene),
    cam: mk('a-entity', { camera: 'fov: 55; near: 10; far: 80000', 'orbit-camera': '' }, scene),
    home: mk('a-cylinder', { radius: 6, height: BEACON_H, material: flat(CREAM) }, scene),
    astro: mk('a-sphere', { radius: ASTRO_R, material: flat(CREAM) }, scene),
    ring: mk('a-entity', { rotation: '-90 0 0', geometry: 'primitive: ring; radiusInner: 1; radiusOuter: 2', material: flat(ACCENT) }, scene),
    routes: mk('a-entity', {}, scene)
  };
}

// Straight lat/lon legs resampled every STEP_M so the line follows the ground instead of cutting through hills.
function drape(terrain, points) {
  const out = [terrain.toWorld(points[0][0], points[0][1])];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const end = terrain.toWorld(b[0], b[1]), prev = out[out.length - 1];
    const n = Math.min(200, Math.max(1, Math.ceil(Math.hypot(end.x - prev.x, end.z - prev.z) / STEP_M)));
    for (let k = 1; k <= n; k++) out.push(terrain.toWorld(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n));
  }
  return out;
}

function setRoute(s, terrain, name, route, color) {
  const old = s.routes.getObject3D(name);
  old?.geometry.dispose();
  if (!route?.ok || route.points.length < 2) { if (old) s.routes.removeObject3D(name); return; }
  const T = AFRAME.THREE;
  const pts = drape(terrain, route.points).map(p => new T.Vector3(p.x, p.y + LIFT_M, p.z));
  const geo = new T.TubeGeometry(new T.CatmullRomCurve3(pts), Math.min(pts.length * 2, 1200), ROUTE_R, 5, false);
  s.routes.setObject3D(name, new T.Mesh(geo, new T.MeshBasicMaterial({ color })));
}

function createView3D() {
  const host = $('view3d'), msg = $('v3-msg');
  $('v3-note').textContent = `Vertical scale ×${EXAGGERATE}`;
  let s = null, starting = null, terrain = null, last = null, lastHome, lastOut, lastRadius = -1, lastTau = null;
  const say = text => { msg.textContent = text; msg.hidden = !text; };

  function update() {
    if (!terrain?.ready || !last) return;
    const { inputs: { astronaut: a }, derived: d } = last;
    const p = terrain.toWorld(a.lat, a.lon);
    s.astro.object3D.position.set(p.x, p.y + ASTRO_LIFT, p.z);
    s.ring.object3D.position.set(p.x, p.y + LIFT_M, p.z);
    const r = Math.max(5, Math.round(d.posUncertaintyM));
    if (r !== lastRadius) {
      lastRadius = r;
      s.ring.setAttribute('geometry', `primitive: ring; radiusInner: ${r - Math.max(4, r * 0.05)}; radiusOuter: ${r}; segmentsTheta: 64`);
    }
    const orbit = s.cam.components['orbit-camera'];
    if (orbit) { orbit.setTarget(p.x, p.y, p.z); orbit.heightAt = (x, z) => terrain.heightAt(x, z); }
    if (d.routeHome !== lastHome) { lastHome = d.routeHome; setRoute(s, terrain, 'home', d.routeHome, CREAM); }
    if (d.routeOut !== lastOut) { lastOut = d.routeOut; setRoute(s, terrain, 'out', d.routeOut, ACCENT); }
    const tau = Math.round(last.inputs.tau * 10) / 10;
    if (tau !== lastTau) {
      lastTau = tau;
      const f = Math.min(1, tau / TAU_DUSTY);
      const sky = SKY_CLEAR.map((c, i) => Math.round(c + (SKY_DUSTY[i] - c) * f));
      const color = `rgb(${sky.join(',')})`;
      const far = Math.max(3000, d.limits.visibilityKm * 1000);
      s.scene.setAttribute('background', `color: ${color}`);
      s.scene.setAttribute('fog', `type: linear; color: ${color}; near: ${Math.round(far * 0.15)}; far: ${Math.round(far)}`);
      host.style.background = color;
    }
  }

  async function init() {
    say('Loading 3D terrain…');
    try {
      if (!window.AFRAME) await loadScript(AFRAME_SRC);
      await loadScript(TERRAIN_SRC);
    } catch (err) { say(`3D view unavailable: ${err.message}`); starting = null; return; }
    registerOrbit();
    s = buildScene();
    s.terrain.addEventListener('terrain-loaded', e => {
      terrain = e.detail;
      say('');
      s.home.object3D.position.set(0, terrain.heightAt(0, 0) + BEACON_H / 2, 0);
      update();
    });
    s.terrain.addEventListener('terrain-error', e => say(`3D terrain failed: ${e.detail?.message ?? 'unknown error'}`));
    s.scene.addEventListener('loaded', () => { if (host.hidden) s.scene.pause(); update(); });
    host.prepend(s.scene);
  }

  return {
    show() {
      host.hidden = false;
      if (s) { if (s.scene.hasLoaded) s.scene.play(); } else starting ??= init();
    },
    hide() { host.hidden = true; if (s?.scene.hasLoaded) s.scene.pause(); },
    render(store) { last = store; update(); }
  };
}

function setupToggle(map, view3d) {
  const b2 = $('v-2d'), b3 = $('v-3d');
  const set = is3d => {
    b2.setAttribute('aria-pressed', String(!is3d));
    b3.setAttribute('aria-pressed', String(is3d));
    $('map').hidden = is3d;
    $('legend').hidden = is3d;
    if (is3d) view3d.show(); else { view3d.hide(); map.invalidateSize(); }
  };
  b2.addEventListener('click', () => set(false));
  b3.addEventListener('click', () => set(true));
}

// ---------- entry ----------

export function createMapView(data, { onPickTarget }) {
  const store0 = { data };
  const b = data.bounds;
  const box = [[b.latMin, b.lonMin], [b.latMax, b.lonMax]];
  const map = L.map('map', {
    crs: L.CRS.EPSG4326, minZoom: 10, maxZoom: 18, zoomSnap: 1,
    maxBounds: L.latLngBounds(box).pad(0.05)
  }).setView([data.meta.home.lat, data.meta.home.lon], 13);

  const blindLayer = addLayers(map, data, box, onPickTarget);
  const setRouteOut = routeLine(map, ACCENT, 4);
  const setRouteHome = routeLine(map, CREAM, 3, '8 6');
  const haze = L.rectangle(box, { stroke: false, fillColor: DUST, fillOpacity: 0, interactive: false }).addTo(map);
  const seeRing = L.circle([0, 0], { radius: 1000, color: DUST, weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(map);
  const devils = L.layerGroup().addTo(map);
  const uncertainty = L.circle([0, 0], { radius: 30, color: CREAM, weight: 1.5, fillColor: CREAM, fillOpacity: 0.12 }).addTo(map);
  const astro = L.marker([0, 0], { icon: astronautIcon(0), keyboard: false, zIndexOffset: 1000 }).addTo(map);
  map.on('click', e => onPickTarget({ lat: e.latlng.lat, lon: e.latlng.lng }));

  const view3d = createView3D();
  setupToggle(map, view3d);

  let lastVisKey = null, lastHeading = null, lastDevils = null;
  function renderWeather({ inputs, derived }) {
    const C = store0.data.C, a = inputs.astronaut;
    haze.setStyle({ fillOpacity: Math.min(HAZE_MAX, inputs.tau * HAZE_PER_TAU) });
    seeRing.setLatLng([a.lat, a.lon]).setRadius(derived.limits.visibilityKm * 1000);
    const devilHours = inputs.ltst >= C.dust_devil_peak_start_ltst && inputs.ltst <= C.dust_devil_peak_end_ltst;
    const key = devilHours ? `${a.lat.toFixed(3)},${a.lon.toFixed(3)}` : null;
    if (key === lastDevils) return;
    lastDevils = key;
    devils.clearLayers();
    if (!devilHours) return;
    const mPerDegLat = 2 * Math.PI * 3396190 / 360; // Mars: ~59.3 km per degree of latitude
    for (const [dx, dy] of DEVIL_OFFSETS_M) {
      const lat = a.lat + dy / mPerDegLat, lon = a.lon + dx / (mPerDegLat * Math.cos(a.lat * Math.PI / 180));
      L.marker([lat, lon], { icon: L.divIcon({ className: 'devil', html: '<span></span>', iconSize: [36, 36] }), interactive: true, keyboard: false })
        .bindTooltip('Dust-devil hours: illustrative swirl, not a forecast position')
        .addTo(devils);
    }
  }
  function render(store) {
    const { inputs, derived } = store;
    if (derived.visKey !== lastVisKey) { blindLayer.setUrl(drawOverlay(derived.vis)); lastVisKey = derived.visKey; }
    const a = inputs.astronaut;
    astro.setLatLng([a.lat, a.lon]);
    // keep the astronaut in view while the demo plays (view change only, no state write)
    if (inputs.scenarioT !== null && !$('map').hidden) map.panInside([a.lat, a.lon], { padding: [120, 120], animate: false });
    const h = Math.round(a.headingDeg / 5) * 5;
    if (h !== lastHeading) { astro.setIcon(astronautIcon(h)); lastHeading = h; }
    uncertainty.setLatLng([a.lat, a.lon]).setRadius(derived.posUncertaintyM);
    renderWeather(store);
    setRouteHome(derived.routeHome?.ok ? derived.routeHome.points : []);
    setRouteOut(derived.routeOut?.ok ? derived.routeOut.points : []);
    view3d.render(store);
  }
  return { map, render };
}
