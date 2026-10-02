# Maintainer instructions

Current architecture is entirely GitHub based. The user's later instruction explicitly replaced the original Apps Script/Sheets runtime requirement. Do not restore clasp, Apps Script, or Google Sheets as a dependency. Repository: mefferso/WWA_verification, branch main. Retain legacy/apps-script for reference only.

Read README.md, docs/architecture.md, docs/data-model.md, docs/verification-methodology.md, and docs/audit.md before changing scientific behavior. config/*.json are authoritative policy. Preserve county/parish thresholds, comparisons, and blank-duration semantics unless the user explicitly authorizes a change. src/core.cjs contains ported, reviewed meteorological functions; the Leaflet UI was retained in site/index.html. Avoid wholesale rewrites.

Never commit a Synoptic token, workbook, provider URL containing token=, response body, raw headerless Log, .env, or credentials. The sole deployment credential is the repository Actions secret SYNOPTIC_API_TOKEN. Provider errors must remain redacted; the browser cannot receive this token.

src/runner.cjs owns provider ingestion and per-event checkpoints; src/recalculate.cjs owns publication-time reaggregation under current thresholds. Both must agree on hazard-variable coverage. Recompute simultaneous Red Flag flags and durations from samples when rules change. Keep ingestion QC provenance; new settings cannot retroactively sanitize old samples. Terminal caches require observations collected after warning expiration plus settling delay, validated provider completion, fingerprint match, and nonempty observations. Failed fresh requests must preserve previous snapshots.

Data snapshots in data/events/*.json.gz are gzip JSON, named by the first 24 hex characters of SHA-256(eventKey); use EventStore. Preserve unaffected history. Never blindly replace the whole data/ directory. data/import-report.json is migration evidence; do not update its original counts during live runs. Imported events lack validated provider completion and must not be treated as terminal caches.

Before committing: npm test, npm run check, npm run build. Add meaningful regression tests for scientific/operational fixes. Check decompressed archives and committed files for secrets. Keep docs current. Changes to Google legacy code alone do not affect runtime. Frontend late responses and repeated event selection must preserve the correct polygons and timelines.

Actions jobs use a soft 45-minute budget, preserving completed events before a 60-minute job deadline. Keep contents:write confined to verification; Pages has pages:write/id-token:write and contents:read. Verification bot commits do not trigger push workflows; Pages workflow_run must publish validated checkpoints after partial failures too. Do not claim deployment succeeded without checking Actions. Any remaining settings must be described as GitHub-only activation.
