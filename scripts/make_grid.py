# Written with AI assistance (Claude / GitHub Copilot)
"""CTX DTM → data/meta.json, data/heightgrid.json, data/heightmap.png, data/basemap.png.

Run from repo root:  python3 scripts/make_grid.py
"""
from __future__ import annotations

import json
import math

import numpy as np
from PIL import Image

from dtm import (DATA, EW_M, FACTOR, HOME, LAT_MAX, LAT_MIN, LON_MAX, LON_MIN, PX_M, R_MARS, EYE_M,
                 latlon_to_px, load_dtm)


def downsample(z: np.ndarray) -> np.ndarray:
    h, w = (z.shape[0] // FACTOR) * FACTOR, (z.shape[1] // FACTOR) * FACTOR
    return z[:h, :w].reshape(h // FACTOR, FACTOR, w // FACTOR, FACTOR).mean(axis=(1, 3))


def hillshade(z: np.ndarray, az_deg: float = 315.0, alt_deg: float = 30.0) -> np.ndarray:
    dzdy, dzdx = np.gradient(z, PX_M, EW_M)  # rows go south, cols go east
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(-dzdx, dzdy)
    az, alt = math.radians(az_deg), math.radians(alt_deg)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0, 1)


def main() -> None:
    DATA.mkdir(exist_ok=True)
    z = load_dtm()
    g = downsample(z)
    gh, gw = g.shape
    gmin, gmax = float(g.min()), float(g.max())

    meta = {
        "bounds": {"latMin": LAT_MIN, "latMax": LAT_MAX, "lonMin": LON_MIN, "lonMax": LON_MAX},
        "marsRadiusM": R_MARS, "home": HOME, "eyeHeightM": EYE_M, "gridFile": "data/heightgrid.json",
    }
    (DATA / "meta.json").write_text(json.dumps(meta, indent=2))

    grid = {"w": gw, "h": gh, "cellM": PX_M * FACTOR, "min": round(gmin, 1), "max": round(gmax, 1),
            "data": [round(float(v), 1) for v in g.ravel()]}
    assert all(math.isfinite(v) for v in grid["data"])
    (DATA / "heightgrid.json").write_text(json.dumps(grid, separators=(",", ":"), allow_nan=False))

    Image.fromarray(np.round((g - gmin) / (gmax - gmin) * 255).astype(np.uint8)).save(DATA / "heightmap.png")
    Image.fromarray(np.round(hillshade(z) * 255).astype(np.uint8)).save(DATA / "basemap.png", optimize=True)

    r, c = latlon_to_px(HOME["lat"], HOME["lon"], z.shape)
    print(f"DTM {z.shape[1]}x{z.shape[0]} → grid {gw}x{gh} (80 m)")
    print(f"elevation {gmin:.1f} … {gmax:.1f} m; home ≈ {z[int(r), int(c)]:.1f} m")
    print("wrote data/meta.json, heightgrid.json, heightmap.png, basemap.png")


if __name__ == "__main__":
    main()
