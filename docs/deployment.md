# Deployment and update runbook

Follow the exact initial linkage/update commands in [README](../README.md). This project targets the **existing** bound Apps Script project and live Sheet. Script ID, spreadsheet ID, web-app deployment ID, and Google Cloud project ID are different identifiers. None were inferred from uploaded source or workbook.

## Manifest and authentication

The provided manifest uses V8, America/Chicago, spreadsheet access, external requests, and container UI scopes. It has no inferred deployment audience/execute-as configuration, no advanced services, and no hardcoded resource IDs. Compare the actual existing manifest before first push. Preserve required project settings/additional files if the live project differs. `SYNOPTIC_API_TOKEN` and `SPREADSHEET_ID` are manually populated Script Properties, not GitHub files.

Keep OAuth credentials local. The `.gitignore` excludes `.clasprc.json`, `.clasp.json`, workbook exports, raw CSVs, and secrets files. No automated clasp deployment was installed because the target project and deployment settings were not provided.

## Smoke test

1. Make a dated workbook backup. Note Events, _EventObs, _ObsSamples, Results, and AreaVerification row counts and key sets.
2. Run Apps Script self-tests. Local `npm test` has additional matching, cache, null-input, QC, provider-error, and duration tests beyond the menu self-tests.
3. Run `buildResults` in the existing project. This rebuilds derived tables from the 1,754 summary rows in the export; it does not refetch or restore missing EC/RFW history. Confirm each _EventObs row yields a Results row and event–UGC pairs populate the area table correctly.
4. Run one known month containing a small completed warning. The first run after migration recalculates old caches. Confirm exact warned UGC/station matching, source/timing notes, meteorological extrema, sample durations, and no token in logs/errors.
5. Run the same month again. After the event has expired for over an hour, confirm a cache hit and unchanged raw sample/summary counts. Test forced refresh separately with a workbook backup.
6. Inspect one event per hazard. Check EC temperature/wind-chill alternatives; EH Heat Index inputs and threshold; RFW simultaneous RH/sustained wind and separate gust display.
7. Load the versioned web app: station filters, polygons, area details, timeline, and analytics. Switch events quickly while timeline/geometry requests are pending. Confirm missing coordinates never become a marker at 0°,0°.
8. Run another month and confirm previously stored event keys remain. Check completed-event metadata is not published for failed/partial writes. If runtime expires, restore/check tables before rerunning; no automatic continuation exists.
9. Compare policy-sensitive outputs with the old deployment: QC `off` now caps confidence at LOW; unresolved footprints do not verify the full CWA; inactive gaps no longer inflate duration. Threshold values remain unchanged.

## Runtime and write operations

Google currently documents a six-minute execution limit. Annual runs remain synchronous. Use monthly runs first; a month can also exceed the limit. No five-minute deadline, queued continuation, or daily quota manager is implemented. Synoptic limits time-series request volume; groups of 60 IDs do not guarantee success for arbitrarily long events. See https://developers.google.com/apps-script/guides/services/quotas and https://docs.synopticdata.com/services/time-series.

Output write chunks: Stations 1,000 rows; Results 750; AreaVerification 1,000; _ObsSamples 1,500; other event-key tables 1,000. Row/column grid capacity is expanded before writing. Remaining old tails are cleared after successful writes. The script lock prevents concurrent writers within this Apps Script project; it does not block human Sheet edits or provide a cross-tab transaction. Readers can see partial updates.

Populated runtime-table header mismatches now stop with an error instead of dropping old rows. Do not fix a mismatch by clearing the table. Back up and migrate columns/rows explicitly. `_Minima` is a legacy tab and is neither deleted nor used by the current core. No schema migration is silently triggered by `clasp push`.

## Rebuild and rollback

Use `buildResults` to repair stale derived tables when raw summaries match current thresholds/configuration. After threshold, duration, wind-basis, or QC changes, rerun all affected periods to regenerate samples and aggregate duration; rebuilding extrema alone is insufficient.

For source rollback, select a known-good git commit, test, push to the same project, and update the existing deployment to the matching version (or select the previous Apps Script deployment version). For data rollback, restore the separately backed-up workbook tables. Rolling back code does not restore data, thresholds, Script Properties, or completed cache entries. Invalidate/rerun affected caches after rollback.
