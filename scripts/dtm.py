# Written with AI assistance (Claude / GitHub Copilot)
"""Shared helpers for the CTX DTM (used by make_grid.py, landmarks.py, viewsheds.py)."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW_DTM = ROOT / "raw" / "dtm.tif"
DATA = ROOT / "data"

R_MARS = 3396190.0
LAT_MIN, LAT_MAX = 18.2110273909634, 18.7211944818728
LON_MIN, LON_MAX = 77.1604654592237, 77.6989751662947
PX_M = 20.0  # projected metres per DTM pixel (both axes)
FACTOR = 4  # working grid = DTM downsampled x4 → 80 m cells
HOME = {"id": "home", "name": "Habitat (Octavia E. Butler Landing)", "lat": 18.4447, "lon": 77.4508, "heightM": 5}
EYE_M = 1.7
LAT_MID = (LAT_MIN + LAT_MAX) / 2
EW_M = PX_M * math.cos(math.radians(LAT_MID))  # true ground metres per pixel east-west


def fill_nan(z: np.ndarray) -> np.ndarray:
    """Fill NaN with the mean of valid 3x3 neighbours, repeated until none remain (no scipy needed)."""
    z = z.copy()
    for _ in range(1000):
        bad = np.isnan(z)
        if not bad.any():
            return z
        p = np.pad(z, 1, mode="edge")
        stack = np.stack([p[1 + dy:1 + dy + z.shape[0], 1 + dx:1 + dx + z.shape[1]]
                          for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
        with np.errstate(invalid="ignore"):
            mean = np.nanmean(stack, axis=0)
        z[bad] = mean[bad]
    raise RuntimeError("could not fill NaN holes")


def load_dtm() -> np.ndarray:
    if not RAW_DTM.exists():
        raise SystemExit(f"Missing {RAW_DTM}. Download it first (see scripts/README.md).")
    z = np.array(Image.open(RAW_DTM), dtype=np.float32)
    z[z < -1e4] = np.nan
    return fill_nan(z)


def latlon_to_px(lat: float, lon: float, shape: tuple[int, int]) -> tuple[float, float]:
    h, w = shape
    return (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * h, (lon - LON_MIN) / (LON_MAX - LON_MIN) * w


def px_to_latlon(r: float, c: float, shape: tuple[int, int]) -> tuple[float, float]:
    h, w = shape
    return LAT_MAX - r / h * (LAT_MAX - LAT_MIN), LON_MIN + c / w * (LON_MAX - LON_MIN)


def ground_m(dr: np.ndarray | float, dc: np.ndarray | float):
    """Ground distance in metres for a pixel offset (rows, cols) on the 20 m DTM."""
    return np.hypot(np.asarray(dr) * PX_M, np.asarray(dc) * EW_M)
