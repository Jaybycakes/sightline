# Feature: Python precompute scripts

**Owners:** Sean (terrain + data) and Brayden (viewsheds + Skyline Fix) · **Paste into Claude together with the root `README.md`.**

## Purpose
The website has no server, so all heavy maths runs **once, offline, in Python**, and the results are saved into `data/` as small JSON/PNG files the browser loads. Each script is run by hand: `python3 scripts/<name>.py`.

Setup (use Python 3.11–3.13):
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install numpy pillow
```
Raw downloads go in `raw/` (git-ignored; share them via Google Drive).

## Input: the CTX DTM
Download (9.7 MB):
```bash
mkdir -p raw && curl -L -o raw/dtm.tif "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif"
```
- 1596 × 1512 float32, 20 m posting, equirectangular, standard parallel 0°, Mars radius 3,396,190 m.
- Bounds: lat 18.2110273909634–18.7211944818728, lon 77.1604654592237–77.6989751662947.
- No-data values are < −10000 → set to NaN. Pillow can open it: `np.array(Image.open('raw/dtm.tif'), dtype=np.float32)`.
- Ground metres per pixel: north–south 20.0; east–west 20.0 × cos(lat).

## Scripts to write

### 1. `scripts/make_grid.py` → `data/meta.json`, `data/heightgrid.json`, `data/heightmap.png`, `data/basemap.png` (Sean — FIRST, others are waiting)
- Downsample ×4 by block mean (ignore NaN) → 399 × 378 (crop the extra rows/cols: 1596/4 = 399, 1512/4 = 378).
- **Fill no-data (NaN) with the nearest valid value first** (`scipy`-free: repeat a 3×3 nan-mean fill until none left). `json.dump` would otherwise write `NaN`, which is invalid JSON.
- Write `heightgrid.json` exactly as root README section 6 (values rounded to 0.1 m, row 0 = north).
- Write `basemap.png`: hillshade of the full 20 m DTM (sun azimuth 315°, altitude 30°), grayscale, 1596 × 1512 — offline fallback under the map tiles.
- Write `heightmap.png` 8-bit grayscale scaled min→0, max→255.
- Write `meta.json` exactly as root README.
- Print min/max and the height at home (expect ≈ −2567 m).

### 2. `scripts/landmarks.py` → `data/landmarks.json` (Sean)
- Always include `home` (lat 18.4447, lon 77.4508, heightM 5, kind habitat).
- Auto-pick ~12 natural landmarks: local maxima on the 20 m DTM with **prominence ≥ 40 m** within a 1.5 km window, spread out (min 1.5 km apart), inside 8 km of home first. Name them by type + direction, e.g. "Delta butte NW 3.1 km". `heightM: 0`.
- Add the crater rim high point(s) (kind `rim`).
- Sean: open them in Mars Trek (trek.nasa.gov/mars) and rename any that match a real named feature (e.g. "Kodiak" butte). Mark `"source": "auto-picked from CTX DTM"` or `"named feature, verified on Mars Trek"`.

### 3. `scripts/viewsheds.py` → `data/viewsheds/<id>.png` (Brayden)
For each landmark: for every cell of the 399 × 378 working grid, is the landmark's top visible from an astronaut's eyes (1.7 m) standing in that cell?
- Use the **full 20 m DTM** for the line of sight, output on the 80 m grid.
- Line of sight from observer O (ground + 1.7 m) to target T (ground + heightM, or + 2 m for natural landmarks so a peak top counts):
  - sample every 20 m along the line; at distance d from O (total D), the terrain blocks if
    `terrain(d) + d*(D-d)/(2R) > line_height(d)` (the `d*(D-d)/(2R)` term = Mars curvature bulge).
- Vectorise with numpy: for each landmark, loop over grid cells in numpy batches (all cells × ~N samples). ~150k cells × up to ~1500 samples is heavy → limit to cells within **20 km** of the landmark (beyond that, mark 0), and step 40 m for d > 5 km. Should run in minutes.
- Save PNG: 255 visible, 0 hidden.
- Print: "home visible from X% of ground within 1/2/3/5 km". Earlier prototype result for the habitat: **54% / 37% / 25% / 22%** — sanity-check against that.
- Reference prototype logic (from our research session): horizon + LOS with curvature on the same DTM.

### 4. `scripts/skyline.py` → `data/skyline/<site>.json` (Brayden + Sean) — see `skyline/README.md` for the full spec

### 6. `scripts/check_data.py` — the gate (already written)
Validates every contract in ARCHITECTURE.md §7. Run before every push of data and before submitting:
```bash
python3 scripts/check_data.py
```
Exit code 0 = all good. It lists every problem otherwise.

### 5. `scripts/fetch_nasa.py` → `data/traverse.json`, `data/targets.json`, `data/donki_sep_may2024.json` (Sean) — see `data/README.md`

## Rules
- Every script prints what it wrote and key numbers (for our notes / the video).
- Header line `# Written with AI assistance (Claude / GitHub Copilot)`.
- Run Python on downloaded files with `python3 -I` (isolated mode) for safety.
- Commit the **outputs in `data/`**, not the raw `.tif`.

## Acceptance checklist
- [ ] `data/meta.json`, `heightgrid.json`, `heightmap.png` exist and match the contract.
- [ ] `landmarks.json` has home + ~12 landmarks.
- [ ] One viewshed PNG per landmark; home stats printed and close to the prototype.
- [ ] Skyline results for at least 3 sites.
