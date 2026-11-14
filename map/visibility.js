// Written with AI assistance (Claude / GitHub Copilot)
// SEE: blind zones = cells where no usable landmark (home included) is in sight.
// A landmark is usable from a cell if its viewshed says visible AND it is within the dust visibility range.
// Pure maths + a cache; no DOM (the overlay image is drawn in map.js).

import { distM, toLatLon } from '../lib/geo.js';

let ctx = null;
const cache = new Map();

export function initVisibility(viewsheds, landmarks, grid, bounds) {
  const n = grid.w * grid.h;
  for (const lm of landmarks) {
    const vs = viewsheds[lm.id];
    if (!vs || vs.length !== n) throw new Error(`viewshed for "${lm.id}" missing or wrong size`);
  }
  const lat = new Float64Array(n), lon = new Float64Array(n);
  for (let r = 0; r < grid.h; r++) for (let c = 0; c < grid.w; c++) {
    const p = toLatLon(grid, bounds, r, c);
    lat[r * grid.w + c] = p.lat; lon[r * grid.w + c] = p.lon;
  }
  // distance from every cell to every landmark, computed once
  const items = landmarks.map(lm => {
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = distM(lat[i], lon[i], lm.lat, lm.lon);
    return { id: lm.id, vs: viewsheds[lm.id], d };
  });
  const home = items.find(it => it.id === 'home');
  if (!home) throw new Error('landmarks must include "home"');
  ctx = { w: grid.w, h: grid.h, n, items, home, others: items.filter(it => it !== home) };
  cache.clear();
}

export function visibilityArrays(visKm) {
  if (!ctx) throw new Error('initVisibility not called');
  if (cache.has(visKm)) return cache.get(visKm);
  const { n, home, others, w, h } = ctx;
  const R = visKm * 1000;
  const blind = new Uint8Array(n), homeHidden = new Uint8Array(n);
  let near = 0, nearSeen = 0;
  for (let i = 0; i < n; i++) {
    const homeVis = home.vs[i] === 1 && home.d[i] <= R;
    let any = homeVis;
    for (let k = 0; !any && k < others.length; k++) any = others[k].vs[i] === 1 && others[k].d[i] <= R;
    homeHidden[i] = homeVis ? 0 : 1;
    blind[i] = any ? 0 : 1;
    if (home.d[i] <= 3000) { near++; if (homeVis) nearSeen++; }
  }
  const out = Object.freeze({ blind, homeHidden, w, h, homeVisiblePct3km: near ? 100 * nearSeen / near : 0 });
  cache.set(visKm, out);
  return out;
}
