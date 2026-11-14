// Written with AI assistance (Claude / GitHub Copilot)
// A* route planner on the height grid. Pure (no browser APIs, no network), never throws.
// Signature fixed by ARCHITECTURE.md §5: planRoute(grid, bounds, vis, start, goal, opts)

import { toCell, toLatLon, distM } from '../lib/geo.js';

const MODES = ['shortest', 'safest', 'homeInSight'];
const TOBLER_NORM = Math.exp(-0.175);
const HEURISTIC_DIV = 1.2; // tobler peaks ~1.19 on gentle downhill

// ---- minimal binary min-heap (parallel arrays: key f, value node id) ----
class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p];
      i = p;
    }
    k[i] = key; v[i] = val;
  }
  popVal() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c];
        i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

function fail(mode, reason) {
  return { ok: false, reason, mode, points: [], lengthKm: 0, etaMin: 0 };
}

function tobler(tanSigned) {
  return Math.exp(-3.5 * Math.abs(tanSigned + 0.05)) / TOBLER_NORM;
}

export function planRoute(grid, bounds, vis, start, goal, opts) {
  let mode = opts && opts.mode;
  try {
    if (!MODES.includes(mode)) mode = 'shortest';
    if (!grid || !grid.data || !(grid.w > 0) || !(grid.h > 0)) return fail(mode, 'missing height grid');
    if (!bounds) return fail(mode, 'missing map bounds');
    if (!vis || !vis.blind || !vis.homeHidden) return fail(mode, 'missing visibility grid');
    if (vis.w !== grid.w || vis.h !== grid.h) return fail(mode, 'visibility grid size mismatch');
    if (!opts) return fail(mode, 'missing route options');
    const speedKmh = Number(opts.speedKmh);
    const maxSlopeDeg = Number(opts.maxSlopeDeg);
    if (!Number.isFinite(speedKmh) || speedKmh <= 0) return fail(mode, 'invalid walking speed');
    if (!Number.isFinite(maxSlopeDeg) || maxSlopeDeg <= 0) return fail(mode, 'invalid slope limit');
    const maxExp = Number.isFinite(opts.maxExpansions) && opts.maxExpansions > 0 ? opts.maxExpansions : 400000;

    if (!start || !goal || !Number.isFinite(start.lat) || !Number.isFinite(start.lon) ||
        !Number.isFinite(goal.lat) || !Number.isFinite(goal.lon)) return fail(mode, 'outside map');
    const inB = (p) => p.lat >= bounds.latMin && p.lat <= bounds.latMax && p.lon >= bounds.lonMin && p.lon <= bounds.lonMax;
    if (!inB(start) || !inB(goal)) return fail(mode, 'outside map');

    const W = grid.w, H = grid.h, data = grid.data, blind = vis.blind, hh = vis.homeHidden;
    const clampCell = (cell) => ({ r: Math.min(H - 1, Math.max(0, cell.r)), c: Math.min(W - 1, Math.max(0, cell.c)) });
    let s = clampCell(toCell(grid, bounds, start.lat, start.lon));
    const g = clampCell(toCell(grid, bounds, goal.lat, goal.lon));

    const dy = grid.cellM > 0 ? grid.cellM : 80;
    const dx = dy * Math.cos((bounds.latMin + bounds.latMax) / 2 * Math.PI / 180);
    const dd = Math.hypot(dx, dy);
    // neighbour table: dr, dc, ground distance (m)
    const NB = [[-1, 0, dy], [1, 0, dy], [0, -1, dx], [0, 1, dx], [-1, -1, dd], [-1, 1, dd], [1, -1, dd], [1, 1, dd]];
    const maxTan = Math.tan(maxSlopeDeg * Math.PI / 180);

    const ok = (v) => Number.isFinite(v);
    const stepAllowed = (i, j, dist) => {
      const a = data[i], b = data[j];
      if (!ok(a) || !ok(b)) return false;
      return Math.abs(b - a) / dist <= maxTan;
    };
    const hasAllowedStep = (r, c) => {
      const i = r * W + c;
      if (!ok(data[i])) return false;
      for (let n = 0; n < 8; n++) {
        const nr = r + NB[n][0], nc = c + NB[n][1];
        if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
        if (stepAllowed(i, nr * W + nc, NB[n][2])) return true;
      }
      return false;
    };

    // relocate a blocked start to the nearest cell with an allowed step
    if (!hasAllowedStep(s.r, s.c)) {
      let found = null;
      for (let ring = 1; ring <= 10 && !found; ring++) {
        let bestD = Infinity;
        for (let r = s.r - ring; r <= s.r + ring; r++) {
          for (let c = s.c - ring; c <= s.c + ring; c++) {
            if (Math.max(Math.abs(r - s.r), Math.abs(c - s.c)) !== ring) continue;
            if (r < 0 || c < 0 || r >= H || c >= W) continue;
            if (!hasAllowedStep(r, c)) continue;
            const d = Math.hypot((r - s.r) * dy, (c - s.c) * dx);
            if (d < bestD) { bestD = d; found = { r, c }; }
          }
        }
      }
      if (found) s = found;
      // else: keep s; A* will report the exhausted open set
    }

    const sIdx = s.r * W + s.c, gIdx = g.r * W + g.c;
    const straightKm = distM(start.lat, start.lon, goal.lat, goal.lon) / 1000;

    let path; // array of cell indices start..goal
    if (sIdx === gIdx) {
      path = [sIdx];
    } else {
      const N = W * H;
      const gScore = new Float64Array(N).fill(Infinity);
      const cameFrom = new Int32Array(N).fill(-1);
      const closed = new Uint8Array(N);
      const hScale = 1 / (speedKmh * 1000 / 60 * HEURISTIC_DIV); // metres -> minutes lower bound
      const gr = g.r, gc = g.c;
      const heur = (r, c) => Math.hypot((r - gr) * dy, (c - gc) * dx) * hScale;
      const penal = mode === 'shortest' ? 0 : 1;
      const mPerMin = speedKmh * 1000 / 60;

      const heap = new MinHeap();
      gScore[sIdx] = 0;
      heap.push(heur(s.r, s.c), sIdx);
      let expansions = 0, reached = false;
      while (heap.size > 0) {
        const cur = heap.popVal();
        if (closed[cur]) continue;
        closed[cur] = 1;
        if (cur === gIdx) { reached = true; break; }
        if (++expansions > maxExp) return fail(mode, 'No route found within the search limit');
        const r = (cur / W) | 0, c = cur - r * W;
        const hCur = data[cur];
        const gCur = gScore[cur];
        for (let n = 0; n < 8; n++) {
          const nr = r + NB[n][0], nc = c + NB[n][1];
          if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
          const j = nr * W + nc;
          if (closed[j]) continue;
          const hn = data[j];
          if (!ok(hn) || !ok(hCur)) continue;
          const dist = NB[n][2];
          const t = (hn - hCur) / dist; // signed tan of slope, uphill positive
          if (Math.abs(t) > maxTan) continue;
          const minutes = dist / (mPerMin * tobler(t));
          let pen = 1;
          if (penal) {
            pen += 3 * blind[j];
            if (mode === 'homeInSight') pen += 6 * hh[j];
          }
          const ng = gCur + minutes * pen;
          if (ng < gScore[j]) {
            gScore[j] = ng;
            cameFrom[j] = cur;
            heap.push(ng + heur(nr, nc), j);
          }
        }
      }
      if (!reached) return fail(mode, 'All paths exceed ' + maxSlopeDeg + '° slope limit');
      path = [];
      for (let i = gIdx; i !== -1; i = cameFrom[i]) path.push(i);
      path.reverse();
    }

    // ---- metrics on the full cell path (no penalties) ----
    let lenM = 0, etaMin = 0, maxSl = 0, blindN = 0, hhN = 0;
    for (let k = 0; k < path.length; k++) {
      const i = path[k];
      if (blind[i]) blindN++;
      if (hh[i]) hhN++;
      if (k === 0) continue;
      const p = path[k - 1];
      const ar = (p / W) | 0, ac = p - ar * W, br = (i / W) | 0, bc = i - br * W;
      const dist = Math.hypot((br - ar) * dy, (bc - ac) * dx);
      const dh = data[i] - data[p];
      lenM += dist;
      etaMin += dist / 1000 / (speedKmh * tobler(dh / dist)) * 60;
      const sl = Math.atan(Math.abs(dh) / dist) * 180 / Math.PI;
      if (sl > maxSl) maxSl = sl;
    }
    let lengthKm = lenM / 1000;
    if (path.length === 1) {
      lengthKm = straightKm;
      etaMin = straightKm / speedKmh * 60;
    }

    // ---- simplify: drop intermediate points on collinear runs ----
    const keep = [path[0]];
    let pdr = 0, pdc = 0;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k];
      const ar = (a / W) | 0, ac = a - ar * W, br = (b / W) | 0, bc = b - br * W;
      const ddr = br - ar, ddc = bc - ac;
      if (k > 1 && (ddr !== pdr || ddc !== pdc)) keep.push(a);
      pdr = ddr; pdc = ddc;
    }
    if (path.length > 1) keep.push(path[path.length - 1]);

    const points = keep.map((i) => {
      const r = (i / W) | 0, c = i - r * W;
      const ll = toLatLon(grid, bounds, r, c);
      return [ll.lat, ll.lon];
    });
    points[0] = [start.lat, start.lon];
    if (points.length === 1) points.push([goal.lat, goal.lon]);
    else points[points.length - 1] = [goal.lat, goal.lon];

    return {
      ok: true, reason: null, mode, points, lengthKm, etaMin, maxSlopeDeg: maxSl,
      blindFraction: blindN / path.length, homeHiddenFraction: hhN / path.length
    };
  } catch (e) {
    return fail(mode, 'route planner error: ' + (e && e.message));
  }
}
