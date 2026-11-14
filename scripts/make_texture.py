# Written with AI assistance (Claude / GitHub Copilot)
"""Build data/terrain_texture.jpg: NASA Mars Trek CTX orthomosaic cropped to the DTM bounds.

Output:
  data/terrain_texture.jpg   RGB JPEG, left=lonMin, right=lonMax, top=latMax, bottom=latMin

Run from repo root:  python3 scripts/make_texture.py
Missing tiles (404) are left black and counted. Fetched once; the app never calls APIs at runtime.
"""
from __future__ import annotations

import io
import json
import math
import ssl
import subprocess
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

from dtm import DATA

URL = ("https://trek.nasa.gov/tiles/Mars/EQ/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0/"
       "1.0.0/default/default028mm/{z}/{y}/{x}.png")
HEADERS = {"User-Agent": "sightline-hackathon-data-fetch/1.0"}
Z, TILE, MAX_W = 12, 256, 4096
SIZE = 180 / 2**Z  # tile size in degrees


def get_tile(xy):
    """Return PNG bytes, or None if the tile does not exist."""
    x, y = xy
    url = URL.format(z=Z, y=y, x=x)
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as err:
        if err.code == 404:
            return None
        raise
    except urllib.error.URLError as err:
        if not isinstance(err.reason, ssl.SSLError):
            raise
        # python.org builds on macOS ship without CA certs; curl uses the system store (verification stays ON)
        out = subprocess.run(["curl", "-sfL", "--max-time", "60", "-A", HEADERS["User-Agent"], url],
                             capture_output=True)
        return out.stdout if out.returncode == 0 and out.stdout else None


def main() -> None:
    b = json.load(open(DATA / "meta.json"))["bounds"]
    x0, x1 = math.floor((b["lonMin"] + 180) / SIZE), math.floor((b["lonMax"] + 180) / SIZE)
    y0, y1 = math.floor((90 - b["latMax"]) / SIZE), math.floor((90 - b["latMin"]) / SIZE)
    coords = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    with ThreadPoolExecutor(max_workers=6) as pool:
        data = list(pool.map(get_tile, coords))

    mosaic = Image.new("RGB", ((x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE))
    missing = 0
    for (x, y), png in zip(coords, data):
        if png is None:
            missing += 1
            print(f"WARNING: missing tile x={x} y={y} (left black)")
            continue
        mosaic.paste(Image.open(io.BytesIO(png)).convert("RGB"), ((x - x0) * TILE, (y - y0) * TILE))

    ppd = TILE / SIZE  # pixels per degree
    left = round((b["lonMin"] - (x0 * SIZE - 180)) * ppd)
    right = round((b["lonMax"] - (x0 * SIZE - 180)) * ppd)
    top = round(((90 - y0 * SIZE) - b["latMax"]) * ppd)
    bottom = round(((90 - y0 * SIZE) - b["latMin"]) * ppd)
    img = mosaic.crop((left, top, right, bottom))
    if img.width > MAX_W:
        img = img.resize((MAX_W, round(img.height * MAX_W / img.width)), Image.LANCZOS)
    out = DATA / "terrain_texture.jpg"
    img.save(out, "JPEG", quality=85)
    print(f"wrote {out}  {img.width}x{img.height}  tiles={len(coords)}  missing={missing}")


if __name__ == "__main__":
    main()
