# Roadmap: what to do, in what order

**Deadline: Sunday 15 Nov, 23:59 WIB.** Times below are WIB.

## Status (Sat 08:55)
| Piece | Owner | State |
|---|---|---|
| Architecture, docs, data checker | Brayden | ✅ done |
| Real terrain, landmarks, viewsheds, NASA data | Brayden | ✅ done |
| Main app UI v2 + 3D terrain engine (`lib/terrain.js`) | Brayden | ✅ done |
| Crew model `crew/budget.js` | Jojo | ⏳ app uses placeholder |
| Route planner `route/route.js` | Jojo | ⏳ app uses straight lines |
| Skyline Fix maths `scripts/skyline.py` | Sean | ⏳ |
| Skyline Fix panel `skyline/skyline.js` | Brayden | ⏳ |
| Missing sources (3 constants) + landmark names + `sources.md` | Sean | ⏳ |
| Helmet overlays (beacon, HUD, walk) | Edward | ⏳ |
| Video + submission page | Brayden + Sean | ⏳ Sunday |

## How to decide what to work on next
When you finish something, pick the **first** item that is true:
1. **Something breaks the demo** (console error, blank map, demo stops) → fix it now, whoever owns it.
2. **Your feature isn't done** → keep building it.
3. **Someone is blocked waiting on you** → unblock them.
4. **The demo story path looks bad** (anything visible in the 30-second video) → polish it.
5. **Anything else** (UX outside the demo path, stretch goals) → only if 1–4 are empty.

Never start a stretch goal while a teammate's feature is unfinished. Ask in the group chat first.

## Phases

### Phase 1: Build (Sat until 18:00)
Everyone builds their own piece **in parallel**, in their own folder, on top of the current app. Push every hour.
- Jojo: `crew/budget.js` first (it changes the most on screen), then `route/route.js`.
- Sean: `scripts/skyline.py` (≥ 3 sites), then the 3 missing sources, landmark names and `sources.md`.
- Brayden: `skyline/skyline.js` (start from a mock `data/skyline/landing.json` that has Sean's shape), and answer questions.
- Edward: helmet overlays on `lib/terrain.js`.

**Gate:** each feature passes its own README acceptance checklist **before** it's called done.

### Phase 2: Integrate (Sat 18:00 → 23:59)
- Brayden pulls everything and runs the full demo after **every** merge.
- MOCK DATA badge must be gone (no placeholders left).
- `python3 scripts/check_data.py` → 0 problems.
- **23:59 checkpoint:** the whole demo story plays end to end on real modules. Sleep after.

### Phase 3: Fix + polish (Sun 07:00 → 14:00)
In this order, no skipping:
1. **Bugs** that break or confuse the demo.
2. **UX on the demo path:** what the judge sees in the video (answer card, storm moment, blind zones growing, new route, Skyline Fix, helmet).
3. Mobile check (375 px), keyboard focus, reduced motion.
4. Stretch (beacon placement, real Navcam skyline check), only if 1–3 are done.

### Phase 4: Freeze (Sun 14:00 → 16:00)
- Run the slop-judge review on the live site, and fix only what it flags on the demo path.
- Test the live GitHub Pages link in an incognito window.
- **16:00 FEATURE FREEZE.** After this: bug fixes only, no new features.

### Phase 5: Ship (Sun 16:00 → 23:00)
- 16:00–19:00 Brayden: record + edit the 30-second video (`SUBMISSION.md` script, English subtitles, press `v` for video mode).
- 16:00–19:00 Sean: paste the project page text from `SUBMISSION.md` + `data/sources.md`.
- 19:00–21:00: everyone tests all links in incognito.
- **21:00 first Submit for Judging.** Fix anything → **final re-submit by 23:00.**

## Communication
- Group chat message when you **start**, **push** and **get blocked**. One line each.
- Contract change (function signature, data format)? Ask Brayden first. Don't change it alone.
- Edward: 15-minute call at 13:00 and 20:00 on Saturday to sync.
