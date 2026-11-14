// Written with AI assistance (Claude / GitHub Copilot)
// Classic script: A-Frame component 'heightgrid-terrain'. World: x = east m, z = south m, y = up (home = 0).
(function () {
  if (!window.AFRAME) { console.error('heightgrid-terrain: AFRAME not found'); return; }
  const THREE = AFRAME.THREE;

  // Grid registration follows lib/geo.js toLatLon: cell (r,c) centre = latMax-(r+.5)/h*span, lonMin+(c+.5)/w*span.
  // Fractional cell coords <-> lat/lon (pure math, no THREE).
  function makeModel(grid, meta, exaggerate) {
    const b = meta.bounds, home = meta.home, w = grid.w, h = grid.h;
    const ns = grid.cellM;                                    // metres per cell, north-south
    const ew = grid.cellM * Math.cos(home.lat * Math.PI / 180); // metres per cell, east-west
    const frac = (lat, lon) => ({
      r: (b.latMax - lat) / (b.latMax - b.latMin) * h - 0.5,
      c: (lon - b.lonMin) / (b.lonMax - b.lonMin) * w - 0.5 });
    const clamp = (v, max) => Math.min(Math.max(v, 0), max);
    const sample = (r, c) => {                                // bilinear on fractional cell coords, clamped
      r = clamp(r, h - 1); c = clamp(c, w - 1);
      const r0 = Math.floor(r), c0 = Math.floor(c), r1 = Math.min(r0 + 1, h - 1), c1 = Math.min(c0 + 1, w - 1);
      const fr = r - r0, fc = c - c0, d = grid.data;
      const top = d[r0 * w + c0] * (1 - fc) + d[r0 * w + c1] * fc;
      const bot = d[r1 * w + c0] * (1 - fc) + d[r1 * w + c1] * fc;
      return top * (1 - fr) + bot * fr;
    };
    const h0 = frac(home.lat, home.lon);
    const hY = sample(h0.r, h0.c);
    const heightAt = (x, z) => (sample(z / ns + h0.r, x / ew + h0.c) - hY) * exaggerate;
    const toWorld = (lat, lon) => {
      const f = frac(lat, lon), x = (f.c - h0.c) * ew, z = (f.r - h0.r) * ns;
      return { x, y: heightAt(x, z), z };
    };
    return { ns, ew, h0, hY, heightAt, toWorld };
  }

  function buildGeometry(grid, m, step, exaggerate) {
    const idx = (n) => { const a = []; for (let i = 0; i < n; i += step) a.push(i); if (a[a.length - 1] !== n - 1) a.push(n - 1); return a; };
    const cols = idx(grid.w), rows = idx(grid.h);
    const g = new THREE.PlaneGeometry(1, 1, cols.length - 1, rows.length - 1);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, uv = g.attributes.uv;
    rows.forEach((r, j) => cols.forEach((c, i) => {
      const k = j * cols.length + i;                          // row-major, row 0 = north
      pos.setXYZ(k, (c - m.h0.c) * m.ew, (grid.data[r * grid.w + c] - m.hY) * exaggerate, (r - m.h0.r) * m.ns);
      uv.setXY(k, (c + 0.5) / grid.w, 1 - (r + 0.5) / grid.h); // image top = north
    }));
    g.computeVertexNormals();
    return g;
  }

  const getJSON = (url) => fetch(url).then((res) => {
    if (!res.ok) throw new Error(url + ' -> HTTP ' + res.status);
    return res.json();
  });
  const getTexture = (url) => new Promise((resolve) => new THREE.TextureLoader().load(url, resolve, undefined, () => {
    console.warn('heightgrid-terrain: texture failed to load, using flat colour');
    resolve(null);
  }));

  AFRAME.registerComponent('heightgrid-terrain', {
    schema: {
      src: { default: 'data/heightgrid.json' }, meta: { default: 'data/meta.json' },
      texture: { default: 'data/terrain_texture.jpg' },
      step: { type: 'int', default: 1 }, exaggerate: { type: 'number', default: 1 } },
    init: function () {
      this.ready = false;
      const d = this.data;
      Promise.all([getJSON(d.src), getJSON(d.meta), getTexture(d.texture)])
        .then(([grid, meta, tex]) => this.build(grid, meta, tex))
        .catch((e) => {
          console.error('heightgrid-terrain:', e);
          this.el.emit('terrain-error', { message: String(e && e.message || e) });
        });
    },
    build: function (grid, meta, tex) {
      if (this.removed) { if (tex) tex.dispose(); return; }
      const d = this.data, step = Math.max(1, d.step);
      const m = makeModel(grid, meta, d.exaggerate);
      if (tex) tex.colorSpace = THREE.SRGBColorSpace;
      this.material = new THREE.MeshStandardMaterial(
        tex ? { roughness: 1, metalness: 0, map: tex } : { roughness: 1, metalness: 0, color: '#b0623a' });
      this.geometry = buildGeometry(grid, m, step, d.exaggerate);
      this.el.setObject3D('mesh', new THREE.Mesh(this.geometry, this.material));
      this.toWorld = m.toWorld;
      this.heightAt = m.heightAt;
      this.sizeM = { ew: (grid.w - 1) * m.ew, ns: (grid.h - 1) * m.ns };
      this.ready = true;
      this.el.emit('terrain-loaded', this);
    },
    remove: function () {
      this.removed = true;
      this.el.removeObject3D('mesh');
      if (this.geometry) this.geometry.dispose();
      if (this.material) { if (this.material.map) this.material.map.dispose(); this.material.dispose(); }
    }
  });
})();
