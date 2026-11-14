# Written with AI assistance (Claude / GitHub Copilot)
"""Line-of-sight from every 80 m cell to every landmark → data/viewsheds/<id>.png (255 visible, 0 hidden).

Observer: astronaut eyes 1.7 m above ground at the cell centre.
Target: landmark ground + heightM (natural landmarks: +2 m so the top counts).
Terrain from the full 20 m DTM; Mars curvature included (bulge d*(D-d)/(2R)).

Run from repo root:  python3 scripts/viewsheds.py
"""
from __future__ import annotations

import json
import time

import numpy as np
from PIL import Image

from dtm import DATA, EW_M, EYE_M, FACTOR, PX_M, R_MARS, latlon_to_px, load_dtm

MAX_RANGE_M = 20000
SAMPLES = 512          # points along each sight line (≤ 39 m apart at 20 km)
NEAR_OBS_M = 10        # ignore terrain right under the observer
NEAR_TGT_M = 40        # ignore terrain right at the target (a peak must not hide itself)
NATURAL_TOP_M = 2.0
BATCH = 4000


def viewshed(z: np.ndarray, gh: int, gw: int, tr: float, tc: float, top: float) -> np.ndarray:
    H, W = z.shape
    rr, cc = np.meshgrid(np.arange(gh), np.arange(gw), indexing="ij")
    orow = (rr * FACTOR + FACTOR / 2 - 0.5).ravel()
    ocol = (cc * FACTOR + FACTOR / 2 - 0.5).ravel()
    D = np.hypot((tr - orow) * PX_M, (tc - ocol) * EW_M)
    eye = z[np.clip(np.round(orow).astype(int), 0, H - 1), np.clip(np.round(ocol).astype(int), 0, W - 1)] + EYE_M
    out = np.zeros(gh * gw, dtype=bool)
    f = (np.arange(1, SAMPLES + 1) / (SAMPLES + 1))[None, :]
    todo = np.nonzero(D <= MAX_RANGE_M)[0]
    for s in range(0, len(todo), BATCH):
        idx = todo[s:s + BATCH]
        Dk, ek = D[idx, None], eye[idx, None]
        r = np.clip(np.round(orow[idx, None] + f * (tr - orow[idx, None])).astype(int), 0, H - 1)
        c = np.clip(np.round(ocol[idx, None] + f * (tc - ocol[idx, None])).astype(int), 0, W - 1)
        d = f * Dk
        terrain = z[r, c] + d * (Dk - d) / (2 * R_MARS)
        line = ek + f * (top - ek)
        consider = (d > NEAR_OBS_M) & (Dk - d > NEAR_TGT_M)
        blocked = ((terrain > line) & consider).any(axis=1)
        out[idx] = ~blocked
    return out.reshape(gh, gw)


def main() -> None:
    z = load_dtm()
    gh, gw = z.shape[0] // FACTOR, z.shape[1] // FACTOR
    landmarks = json.loads((DATA / "landmarks.json").read_text())
    (DATA / "viewsheds").mkdir(exist_ok=True)
    for old in (DATA / "viewsheds").glob("*.png"):
        old.unlink()  # stale files for landmarks that no longer exist would fail the checker
    for lm in landmarks:
        t0 = time.time()
        tr, tc = latlon_to_px(lm["lat"], lm["lon"], z.shape)
        r0, c0 = int(tr), int(tc)
        ground = float(z[max(r0 - 1, 0):r0 + 2, max(c0 - 1, 0):c0 + 2].max())  # peak top within ±20 m
        top = ground + (lm["heightM"] if lm["heightM"] > 0 else NATURAL_TOP_M)
        vs = viewshed(z, gh, gw, tr, tc, top)
        Image.fromarray(vs.astype(np.uint8) * 255).save(DATA / "viewsheds" / f"{lm['id']}.png", optimize=True)
        print(f"{lm['id']:10s} visible from {vs.mean() * 100:5.1f}% of map  ({time.time() - t0:.1f}s)")
        if lm["id"] == "home":
            rr, cc = np.meshgrid(np.arange(gh), np.arange(gw), indexing="ij")
            dist = np.hypot((rr * FACTOR + 1.5 - tr) * PX_M, (cc * FACTOR + 1.5 - tc) * EW_M)
            stats = [f"{k} km: {vs[dist <= k * 1000].mean() * 100:.0f}%" for k in (1, 2, 3, 5)]
            print("   home visible within " + ", ".join(stats) + "   (prototype: 54% / 37% / 25% / 22%)")
    print(f"wrote {len(landmarks)} viewsheds to data/viewsheds/")


if __name__ == "__main__":
    main()
