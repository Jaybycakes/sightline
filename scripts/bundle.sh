#!/bin/bash
# Regenerates CONTEXT_BUNDLE.md from all docs. Run from repo root.
{ echo "# Sightline — full team context (paste this whole file into Claude)"; echo; echo "> Generated bundle of every doc in the repo. Tell Claude which part is yours. Regenerate: \`bash scripts/bundle.sh\`"
for f in README.md ARCHITECTURE.md ROADMAP.md CLAUDE.md map/README.md crew/README.md route/README.md data/README.md scripts/README.md skyline/README.md helmet/README.md SUBMISSION.md; do
  echo; echo "---"; echo; echo "# FILE: \`$f\`"; echo; cat "$f"; done; } > CONTEXT_BUNDLE.md
