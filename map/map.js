// Written with AI assistance (Claude / GitHub Copilot)
// Leaflet map renderer. Reads the store; the only writes are user clicks → onPickTarget (an action, not a subscriber).

const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ/';
const TILE_PATH = '/1.0.0/default/default028mm/{z}/{y}/{x}.png';

const COLORS = { blind: [248, 81, 73, 110], homeHidden: [210, 153, 34, 60] };

function astronautIcon(heading) {
  return L.divIcon({
    className: 'astro-icon', iconSize: [28, 28], iconAnchor: [14, 14],
    html: `<svg width="28" height="28" viewBox="-14 -14 28 28" aria-hidden="true">
      <g transform="rotate(${Math.round(heading)})"><path d="M0,-13 L6,2 L-6,2 Z" fill="#56d4ff" opacity=".9"/></g>
      <circle r="5" fill="#fff" stroke="#0d1014" stroke-width="2"/></svg>`
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

export function createMapView(data, { onPickTarget }) {
  const b = data.bounds;
  const box = [[b.latMin, b.lonMin], [b.latMax, b.lonMax]];
  const map = L.map('map', {
    crs: L.CRS.EPSG4326, minZoom: 10, maxZoom: 18, zoomSnap: 1,
    maxBounds: L.latLngBounds(box).pad(0.05)
  }).setView([data.meta.home.lat, data.meta.home.lon], 13);

  if (data.hasBasemap) L.imageOverlay('data/basemap.png', box, { opacity: 1, interactive: false }).addTo(map);
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
    L.circleMarker([t.lat, t.lon], { radius: 6, color: '#d29922', weight: 2, fillOpacity: 0.3 })
      .bindTooltip(`${t.name} (Perseverance, sol ${t.sol})`)
      .on('click', e => { L.DomEvent.stop(e); onPickTarget({ lat: t.lat, lon: t.lon, id: t.id }); }))).addTo(map);

  L.marker([data.meta.home.lat, data.meta.home.lon], {
    icon: L.divIcon({ className: '', html: '<div class="home-icon"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    keyboard: false
  }).bindTooltip(data.meta.home.name).addTo(map);

  const routeOut = L.polyline([], { color: '#d29922', weight: 4, opacity: 0.95 }).addTo(map);
  const routeHome = L.polyline([], { color: '#56d4ff', weight: 3, opacity: 0.95, dashArray: '8 6' }).addTo(map);
  const uncertainty = L.circle([0, 0], { radius: 30, color: '#56d4ff', weight: 1.5, fillOpacity: 0.08 }).addTo(map);
  const astro = L.marker([0, 0], { icon: astronautIcon(0), keyboard: false, zIndexOffset: 1000 }).addTo(map);

  L.control.layers(
    { 'Orbital imagery': ctx },
    { 'HiRISE close-up': hirise, 'Blind zones': blindLayer, 'Perseverance route': traverse, 'Landmarks': landmarkLayer, 'Science targets': targetLayer },
    { collapsed: true, position: 'topright' }
  ).addTo(map);
  L.control.scale({ metric: true, imperial: false }).addTo(map);

  map.on('click', e => onPickTarget({ lat: e.latlng.lat, lon: e.latlng.lng }));

  let lastVisKey = null, lastHeading = null;
  function render({ inputs, derived }) {
    if (derived.visKey !== lastVisKey) { blindLayer.setUrl(drawOverlay(derived.vis)); lastVisKey = derived.visKey; }
    const a = inputs.astronaut;
    astro.setLatLng([a.lat, a.lon]);
    // keep the astronaut in view while the demo plays (view change only, no state write)
    if (inputs.scenarioT !== null) map.panInside([a.lat, a.lon], { padding: [120, 120], animate: false });
    const h = Math.round(a.headingDeg / 5) * 5;
    if (h !== lastHeading) { astro.setIcon(astronautIcon(h)); lastHeading = h; }
    uncertainty.setLatLng([a.lat, a.lon]).setRadius(derived.posUncertaintyM);
    routeHome.setLatLngs(derived.routeHome?.ok ? derived.routeHome.points : []);
    routeOut.setLatLngs(derived.routeOut?.ok ? derived.routeOut.points : []);
  }
  return { map, render };
}
