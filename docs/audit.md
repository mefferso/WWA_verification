# Migration audit — 2026-10-02

Evidence: the two uploaded source files and **all tabs** in `Cold_Hot_verification.xlsx`, including hidden tabs. The connected live Sheet and deployed Apps Script project were not accessed; the schema snapshot is authoritative only for this supplied export. Local tests execute actual Code.gs functions in a Node VM; no live provider token was used.

## Export observations

- Config has five settings: token (redacted), CWA LIX, QC removal off, and January 2026 Start/End strings. Start/End are legacy values ignored by monthly/annual range functions.
- Stations: 492 rows; 368 LAZ, 73 MSZ, and 51 GMZ identifiers. Bare zones already normalize in the uploaded source.
- Events: 14 rows (EC 2, RFW 4, EH 8), all marked complete; all footprints from IEM event GeoJSON, all timing event-wide fallback.
- EventAreas: 238 rows. _ObsSamples: 55,217 rows across five event keys. _EventObs: 1,754 rows across five event keys, all EH.
- Results: 645 populated rows across two event keys; 644 station results plus one row populated only through event metadata columns. Of the 644 station rows, 124 MET, 85 NOT_MET, 37 INDETERMINATE, 398 NO_DATA.
- AreaVerification: 238 rows across six event keys, **all NO_DATA**, inconsistent with the positive station results. The export cannot establish whether an interrupted write, separate reruns, or an earlier rebuild caused this mismatch. A rebuild and historical period reconciliation are required.
- _Minima: 706 legacy rows; preserved and unused. ZoneOverrides: empty. Thresholds: 38 rules, every duration blank. Log: 418 headerless entries; contents not published.

## Targeted changes with regression evidence

| Issue | Finding/action |
| --- | --- |
| UGC normalization | Existing bare-zone normalization retained and tested, including county/marine identifiers. Unresolved footprints now fail closed rather than selecting the whole CWA. Known-footprint window lookup cannot fall back to event-wide timing for a nonmatching station. |
| Heat Index/wind chill | Regression and adjustments retained; reference outputs tested. Fixed null/empty coercion in public meteorological helpers and invalid RH input. Pipeline already guarded most missing inputs. |
| Zero values | Kept numeric zero for observations/comparisons; fixed zero coordinate/elevation metadata loss and Config coverage-zero fallback. Frontend no longer coerces missing coordinates to 0. |
| RFW | Simultaneous RH and selected wind/gust behavior retained and tested. No silent gust substitution. Fuel verification remains out of scope. |
| Duration | Fixed inactive-gap bridging in duration/coverage; duplicate true timestamps no longer reset duration. Window union, false samples, isolated samples, and maximum gaps tested. |
| Station QC/confidence | QC off remains unchanged; unchecked-QC and fetch-error confidence capped LOW. Area MET confidence now uses establishing stations, not unrelated Tier A presence. Added a missing-metric guard before NOT_MET. |
| Cache | Completed reuse now validates footprint and non-secret algorithm/config/rule/metadata/timing hash. Old entries refresh once. Invalidate completion before fresh writes and publish metadata after raw persistence. |
| Provider errors | HTTP-200 Synoptic error codes no longer count as successful empty responses. Error messages omit provider bodies and query strings that could echo tokens. Zero-results response code 2 remains valid. |
| Writes/schema | Populated header mismatches abort rather than discard history. Capacity expansion and chunking also apply to Stations. Removed eager whole-table clearing; clear old tails only after successful writes. Mutation entry points acquire a script lock. |
| Timeline | Ignore late responses for a previously selected event. Existing native-sample archive and five-minute display bins retained. |
| Web datastore | Optional SPREADSHEET_ID property targets the existing Sheet reliably when no active spreadsheet exists in web execution. Preferred token Script Property retains Config fallback. |

## Remaining limitations and follow-up work

1. **Actual warned-area matching:** exact forecast-zone metadata matching works for canonical LAZ/MSZ/GMZ IDs. No county-UGC-to-zone/point crosswalk, multiple-zone station parser, geometry membership test, or historical zone-boundary mapping was introduced. County UGCs can remain NO_DATA. Missing footprint events remain visible but have no selected stations; no CWA-wide assertion is made.
2. **Area timing:** export has no exact UGC-specific timing. Existing row timing may not reflect the full action/extension/cancellation lifecycle. GeoJSON membership union and event-wide fallback are not a substitute for VTEC segment history.
3. **Runtime/memory:** annual and monthly jobs remain synchronous; retries, 60-station chunks, full-history reads, and accumulated sample rows can time out. There is no persisted job cursor/continuation trigger. Event cache skips observation requests but still reads the archive and refreshes metadata/footprints.
4. **Sheets consistency:** chunking is not atomic. A timeout can leave mixed old/new rows; removing eager clearing reduces damage but does not guarantee recovery. Derived table mismatch is evident in the export. Large historical reruns need a backup and reconciliation; locks do not prevent users editing Sheets.
5. **Coverage/QC:** any-variable coverage is not per-hazard coverage. Required-extrema guards do not solve intermittent missing variables or missing simultaneous RH/wind overlap. QC flag details and siting evidence are not retained. Sensor selection uses the first preferred array, without multi-sensor fusion.
6. **Historical analytics:** only ingested history is represented; export has complete markers for events without corresponding station samples/summaries. Missing/partial tables invalidate any archive-wide interpretation. Events without area summaries are omitted. VTEC year handling uses the requested year and event keys include issue timestamp; cross-year carryover and mutable first issue need further historical fixtures.
7. **Threshold changes:** `buildResults` reevaluates extrema but stored duration flags/RFW detection times were calculated under ingestion-time rules. Rerun affected periods after changes; cache fingerprints enforce fresh calculations on the next range run.
8. **Timeline scale/meaning:** fetching one event still scans the entire sample table. Initial map payload includes all Results. Frontend bins retain one sample per station and may not show every short-lived exceedance. Timeline MET colors are instantaneous, not duration-qualified. EC/EH first-verification timestamps in area summaries are approximate extrema diagnostics.
9. **Deployment validation:** Script ID, live manifest, access audience, execute-as setting, and deployment ID were absent. They were not guessed. No live Sheet edits, Apps Script push, API smoke test, or web-app deployment occurred as part of this repository migration.

These items are documented rather than hidden behind a wholesale rewrite. The supplied meteorological thresholds, sheet names/columns, public Apps Script entry points, and Leaflet interface remain the project baseline.
