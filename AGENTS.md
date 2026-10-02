# Maintenance instructions

Read README, docs/audit.md, docs/data-model.md, and docs/verification-methodology.md before changing this project. GitHub owns source; the existing Sheet owns runtime data/configuration and Apps Script owns deployment. Do not create a replacement datastore or move runtime to GitHub Pages.

Never commit tokens, credentials, workbook exports, or raw logs. The sanitized schema JSON is the reviewed export baseline, not a live Sheet connection. Do not infer script/spreadsheet/deployment IDs.

Preserve threshold values, EC alternative semantics, simultaneous RFW wind/RH rules, and blank-duration behavior unless the user explicitly authorizes a methodological change. Test actual Code.gs functions rather than duplicated formulas. Run `npm test` and `npm run check` before committing. Bump event cache fingerprint version after changing observation/matching/duration semantics; rerun affected periods for policy/config changes.

Do not silently drop legacy rows or recreate runtime tabs. Sheet writes are not atomic and synchronous jobs can time out. Source commits do not mean the live Apps Script web app has been updated: report repository and runtime deployment status separately. Follow docs/deployment.md for updates and smoke tests.
