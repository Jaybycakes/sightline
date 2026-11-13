# Rules for Claude working in this repo

1. Read `README.md` first (shared concept, file formats, coordinate rules), then the README of the folder you are working in. That folder README is the build spec.
2. Only create/edit files inside the folder you were asked to work in (plus the files that folder's README says it owns). Do not change another folder's files or the data contracts in `README.md` section 6 — if a contract must change, stop and say so.
3. No build step: plain HTML/CSS/JS ES modules, Leaflet 1.9.4 and A-Frame 1.6.0 from CDN, Python 3 + numpy + Pillow for scripts. No npm, no frameworks, no backend server.
4. If a data file from `data/` does not exist yet, create a small mock that follows the exact same shape, name it `*.mock.json`, and load the real file first with the mock as fallback.
5. Every number shown to the user that comes from science must come from `data/crew_constants.json` (or another `data/` file) — never hard-code a magic number in UI code. Show whether it is NASA data or an estimate.
6. Start each new code file with: `// Written with AI assistance (Claude / GitHub Copilot)` (Python: `#`). Hackathon rules require declaring AI use.
7. No NASA logos, meatball, mission patches or NASA branding in UI or images.
8. English only in UI text.
9. Keep it small and working. A demo that runs beats a big feature that doesn't.
