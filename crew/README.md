# Feature: CREW — crew condition model + Walk Budget + alerts

**Owner:** Jojo · **Paste into Claude together with the root `README.md`.**

## Purpose
Turn everything that can hurt an astronaut on a Mars walk into **one answer**: *can they still get home safely, and how much margin is left?* Output = a **Walk Budget** (status + minutes + a list of reasons with sources). The map panel, the alerts, the route planner and the helmet HUD all read this one object.

This is the "very complex, very detailed, one simple purpose" part. Every factor must be traceable to a row in `data/crew_constants.json` with `isEstimate` true/false — that is how we win **Validity**.

## Files to create
```
/crew/constants.js     loads data/crew_constants.json → object keyed by `key` (C.surface_dose_msv_per_sol.value ...)
/crew/budget.js        export function computeBudget(input, C) → budget object (pure function, no DOM)
/crew/budget.test.html open in browser: runs console.assert checks on computeBudget with fixed inputs
/crew/wire.js          subscribe(store) → computes budget on every state change → setState({budget})
```
`budget.js` must be a **pure function** (same input → same output, no fetch, no DOM). That makes it testable and lets the helmet and map share it.

## Input (built from the store state + route)
```js
{
  sol: 12,                // sols since landing
  ltst: 10.5,             // local true solar time (h)
  evaMin: 95,             // minutes since EVA start
  routeHomeKm: 2.4,       // length of the current route back home (from route/route.js; straight-line × 1.3 if no route yet)
  routeMaxSlopeDeg: 8,    // steepest slope on the way home
  tau: 0.5,               // dust optical depth
  sepActive: false,       // solar particle event
  pressurePa: 718,        // MEDA pressure
  tempC: -40,
  sansAffected: true
}
```

## Output
```js
{
  status: 'GREEN' | 'AMBER' | 'RED',
  headline: 'GO' | 'CAUTION' | 'RETURN NOW',
  suitMinLeft: 265,          // usable suit time left (after reserve)
  returnMin: 62,             // minutes needed to walk home incl. safety pad
  marginMin: 203,            // suitMinLeft - returnMin
  turnBackInMin: 203,        // same as margin, floored at 0
  extraOutKm: 3.1,           // how much further they could walk out and still come back
  speedKmh: 2.6,             // walking speed used
  maxSlopeDeg: 10,           // max allowed slope today (route planner reads this)
  visibilityKm: 117,         // usable landmark range (map blind zones read this)
  doseTodayMsv: 0.4,
  cumulativeMsv: 339,        // transit + surface so far
  careerPct: 56.5,           // cumulative / career limit
  factors: [                 // one per factor, worst first
    { id: 'suit_time', level: 'GREEN', label: 'Suit time', message: '265 min usable, home is 62 min away', keys: ['eva_design_hours', 'eva_reserve_min'] }
  ]
}
```
`keys` = which constants back this factor, so the UI can show "NASA data" vs "Estimate" and link sources.

## The model — factor by factor
All numbers come from `C` (crew_constants.json). Names below are the `key`s.

### 1. Walking speed (base for everything)
- `speed = walk_speed_kmh` (3.3 km/h, Apollo walk-back planning number — estimate for Mars).
- **Arrival weakness:** sensorimotor problems last about `sensorimotor_recovery_days` (7). Factor ramps linearly from `arrival_speed_factor_sol0` (0.6, estimate) on sol 0 to 1.0 on sol 7.
- **Slope:** multiply by a Tobler hiking factor for the steepest leg: `exp(-3.5 * |tan(slope) + 0.05|) / exp(-0.175)` (Earth hiking function — estimate).
- `maxSlopeDeg` = `max_slope_early_deg` (10) before sol 7, else `max_slope_deg` (15). Both estimates. Route planner forbids steeper cells.

### 2. Suit time (the hard clock)
- `suitMinLeft = eva_design_hours*60 − evaMin − eva_reserve_min`
- `returnMin = routeHomeKm / speed * 60 * walkback_pad` (pad 1.2 = +20% like Apollo walk-back rule).
- `marginMin = suitMinLeft − returnMin`.
- RED if margin ≤ 0. AMBER if margin < 30. Else GREEN.
- `extraOutKm = max(0, marginMin) / 60 * speed / 2 / walkback_pad`.
- Message example: "Turn back in 41 min — home is 62 min away at today's pace."

### 3. Radiation
- `cumulativeMsv = cruise_dose_msv_per_day * transit_days + surface_dose_msv_per_sol * sol + todays EVA share`.
- `careerPct = cumulativeMsv / career_limit_msv * 100` (info, GREEN unless > 80%).
- **If `sepActive`** → RED, headline "RETURN NOW": "Solar particle event. Curiosity measured `may2024_sep_dose_ugy` µGy at Gale crater in the May 2024 event. Get to shelter: home is X min away." Shelter time = `returnMin`. Also add: "Terrain gives little cover (~`terrain_shielding_pct`% near a butte)."
- Note in UI: DONKI reports events seen near Earth; we use it as a **replay trigger** for the Mars event, not a live Mars forecast.

### 4. Dust storms → visibility (feeds blind zones)
- Horizontal visibility (Koschmieder): `visKm = 3.912 / (tau / vis_dust_scale_height_km)` (scale height 15 km = estimate: dust spread evenly through the lower atmosphere).
- If `sansAffected`: `visKm *= sans_range_factor` (0.8, estimate).
- Cap at 150 km (beyond the crater anyway).
- AMBER if tau > `tau_amber` (1.0); RED if tau > `tau_red` (3.0). Message: "Dust τ = 2.0 → landmarks beyond ~29 km lost. Blind zones growing."
- Context line: Jezero normal τ ≈ 0.3–0.5; the Jan 2022 regional storm pushed τ to ~1.7–2 (`tau_jan2022_storm`).

### 5. Dust devils
- If `ltst` within `dust_devil_peak_start_ltst`–`dust_devil_peak_end_ltst` (11–14 h) → AMBER: "Dust-devil peak hours (Perseverance saw >4 per sol, peak 12–13 h). Winds up to 32 m/s feel like a ~3.6 m/s breeze on Earth because the air is ~80× thinner — not a knock-down risk; risk is sudden zero visibility and dust on visor/joints. Keep a landmark in sight."

### 6. Suit cooling vs air pressure
- Suit water-sublimator cooling needs ambient pressure ≤ `sublimator_max_pressure_pa` (~933 Pa = 7 Torr).
- `marginPa = sublimator_max_pressure_pa − pressurePa`. RED if ≤ 0, AMBER if < 100, else GREEN with message "Cooling OK: 718 Pa vs 933 Pa limit (Perseverance MEDA)".

### 7. Cold
- AMBER if `tempC < cold_amber_c` (−70) or `ltst > cold_return_ltst` (16.5): "Air cools fast before dusk (Jezero swings ~50–60 °C per sol). Plan to be home by 17:00."

### 8. Vision (SANS)
- If `sansAffected`: AMBER info: "Spaceflight eye changes (+0.5 to +1.75 D far-sighted shift) make distant landmarks harder to recognise — landmark range reduced 20%." (keys `sans_diopter_shift`, `sans_range_factor`)

### 9. Body clock
- Info only: "Sol is 39.6 min longer than an Earth day → body clock drifts; after sol N the crew has shifted N×39.6 min." Level AMBER if `sol` ≥ 3 and ltst < 8 (early starts while drifting) — estimate rule.

### 10. Bone + fall risk (arrival)
- Info factor while sol < 30: "Bone loss in transit ~1–1.5% per month → avoid falls; max slope lowered to 10° until sol 7."

### 11. After the EVA (checklist, not a level)
- When `evaMin` reaches EVA end: show "Dust-off before entry: soil is ~0.5–1% perchlorate (thyroid risk)."

### Combining
- `status` = worst level of all factors. `headline`: GREEN → "GO", AMBER → "CAUTION", RED → "RETURN NOW".
- Sort `factors` RED → AMBER → GREEN.

## Tests (`budget.test.html`)
At least these, with `console.assert` and a visible PASS/FAIL list on the page:
1. Sol 30, evaMin 60, home 2 km, τ 0.4, no SEP, 718 Pa, −30 °C, ltst 10 → GREEN.
2. Same but `sepActive: true` → RED, headline "RETURN NOW".
3. evaMin 420, home 3 km → suit time RED (margin ≤ 0).
4. τ 2.0 → visibilityKm ≈ 29 (no SANS); with SANS ≈ 23.
5. Sol 0 → speed = 0.6 × base, maxSlopeDeg 10.
6. pressurePa 950 → cooling RED.

## Acceptance checklist
- [ ] `computeBudget` is pure, uses only `C` constants (no magic numbers), all tests pass.
- [ ] Map panel shows status, minutes, and factors with NASA/estimate tags.
- [ ] Turning the storm toggle flips to RED and the route planner re-plans home.
- [ ] τ slider changes `visibilityKm` and the blind zones grow.

## Stretch
- Dose-rate curve during the SEP replay using the DONKI event timing.
- Second crew member with different sol/SANS — budget for the pair = the worse of two.
