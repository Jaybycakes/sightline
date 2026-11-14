// Written with AI assistance (Claude / GitHub Copilot)
export const R = 3396190;
export function deg2rad(d) { return d * Math.PI / 180; }
// meters between two lat/lon points (equirectangular approximation, fine at <50 km)
export function distM(lat1, lon1, lat2, lon2) {
  const x = deg2rad(lon2 - lon1) * Math.cos(deg2rad((lat1 + lat2) / 2)) * R;
  const y = deg2rad(lat2 - lat1) * R;
  return Math.hypot(x, y);
}
// bearing in degrees, 0 = north, 90 = east
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const x = deg2rad(lon2 - lon1) * Math.cos(deg2rad((lat1 + lat2) / 2));
  const y = deg2rad(lat2 - lat1);
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}
// grid <-> lat/lon (grid = data/heightgrid.json, bounds = meta.bounds)
export function toCell(grid, b, lat, lon) {
  return { r: Math.floor((b.latMax - lat) / (b.latMax - b.latMin) * grid.h),
           c: Math.floor((lon - b.lonMin) / (b.lonMax - b.lonMin) * grid.w) };
}
export function toLatLon(grid, b, r, c) {
  return { lat: b.latMax - (r + 0.5) / grid.h * (b.latMax - b.latMin),
           lon: b.lonMin + (c + 0.5) / grid.w * (b.lonMax - b.lonMin) };
}
export function heightAt(grid, r, c) { return grid.data[r * grid.w + c]; }
