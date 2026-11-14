# Rules for Claude working in this repo

1. Read `README.md` (concept, file formats), then `ARCHITECTURE.md` (state, pipeline, exact function signatures, failure handling, security), then the README of the folder you are working in. Priority if they disagree: ARCHITECTURE.md → README.md → folder README.
2. Only create/edit files inside the folder you were asked to work in (plus the files that folder's README says it owns). Do not change another folder's files, the function signatures in ARCHITECTURE.md §5, or the data contracts in README.md §6 — if one must change, stop and say so.
3. No build step: plain HTML/CSS/JS ES modules, Leaflet 1.9.4 and A-Frame 1.6.0 from CDN, Python 3 + numpy + Pillow for scripts. No npm, no frameworks, no backend server.
4. Never write state from a renderer/subscriber. Only `setInputs()` changes state; derived values come from `lib/pipeline.js`. Model functions (`computeLimits`, `computeBudget`, `planRoute`, `stateAt`) stay pure: no DOM, no fetch.
5. Never call NASA or other APIs at runtime — the app only reads files in `data/` (plus map tiles). Never put API keys in the repo.
6. If a data file from `data/` does not exist yet, use a mock with the exact same shape named `*.mock.json`, loaded only as a fallback through `lib/data.js`, which marks it so the UI shows a MOCK DATA badge. Never make mock data look real.
7. Every number shown to the user that comes from science must come from `data/crew_constants.json` (or another `data/` file) — never hard-code a magic number in UI code. Show whether it is NASA data or an estimate.
8. Insert text from data files with `textContent`, never `innerHTML`. Links only if they start with `https://`.
9. Coordinates are `[lat, lon]` / `{lat, lon}` everywhere; metres and degrees internally; `evaMin` = Earth minutes, `ltst` = Mars hours.
10. Start each new code file with: `// Written with AI assistance (Claude / GitHub Copilot)` (Python: `#`). Hackathon rules require declaring AI use.
11. No NASA logos, meatball, mission patches or NASA branding in UI or images. English only in UI text.
12. Keep it small and working. A demo that runs beats a big feature that doesn't.
