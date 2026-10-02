# Data model and spreadsheet migration

`docs/workbook-schema.json` records every original tab and exact positional header, including hidden sheets and the original `THERSHOLD` typo. It documents the supplied export, not a connected live Sheet inspection. The current application reads repository files; it expects no live Sheet tabs or columns.

## Source-to-repository mapping

| Original tab | Repository destination | Import treatment |
| --- | --- | --- |
| Config (Key, Value) | config/settings.json; token → Actions secret | Explicit safe allowlist; obsolete Start/End not runtime inputs; token excluded |
| Thresholds (A:G) | config/thresholds.json | All 38 rows unchanged; blank duration → null |
| ZoneOverrides (A:G when populated) | config/zone-overrides.json | Empty array, exact UGC overrides supported |
| Stations (12 columns) | data/stations.json.gz | Header plus 492 rows; refreshed by verifier |
| Events (16 columns) | data/events/*.json.gz `event` | All 14 event identities/timings retained; imported completion reset false |
| EventAreas (7 columns) | event record `areas` | 238 original window rows; missing event areas synthesized from warned UGCs with explicit event-wide fallback |
| _EventObs (56 columns) | event record `summaries` | All 1,754 station summary rows retained |
| _ObsSamples (15 columns) | event record `sampleHeaders`, `samples` | All 55,217 samples retained; boolean flags canonicalized TRUE/FALSE |
| Results (62 columns) | Generated Pages station payload | Discard inconsistent derived rows; recalculate from native samples |
| AreaVerification (26 columns) | Generated Pages area payload | Rebuild actual warned-UGC groups; don't trust stale all-NO_DATA table |
| _Minima (10 columns) | data/legacy-minima.json.gz | All 706 legacy rows retained, not used for event verification |
| Log (headerless) | None | Excluded because request logs can contain credentials |

The original aggregate/sample/result/area field arrays are exported by `src/core.cjs`, and schema tests compare them to the snapshot. Event snapshot filenames are `SHA256(eventKey).slice(0,24) + '.json.gz'`. No user strings are used as filesystem paths.

## Event record, schemaVersion 1

- `event`: eventKey, eventId, year, wfo, hazard, phenomena, significance, productLabel, issueUtc, expireUtc, warnedUgcs, footprintSource, areaTimingMode, dataComplete, runNote, imported.
- `areas`: objects containing ugc, startUtc, endUtc, action, geometry (GeoJSON or null), source. Multiple windows may belong to one UGC; durations use their union.
- `summaries`: objects with the 56 _EventObs fields, including station metadata, extrema/times, observation counts, coverage, QC_POLICY, FETCH_ERROR, and four continuous/cumulative duration pairs.
- `sampleHeaders`: the exact 15-column sample order. `samples`: row arrays `[EVENT_KEY, AREA_UGC, STID, TIME_UTC, TEMP_F, RH_PCT, DEWPOINT_F, WIND_MPH, GUST_MPH, HEAT_INDEX_F, WIND_CHILL_F, TEMP_MET, WINDCHILL_MET, HEAT_INDEX_MET, RFW_MET]`.
- `cacheFingerprint`: optional safe config/event/metadata hash for fresh runs. Imported files omit a trusted terminal fingerprint.
- `provenance`: imported source/completeness evidence, or computation UTC, algorithm version, hazard-variable coverage basis, and provider-completeness validation.

`dataComplete` means ingestion completed with matching station summaries, not every station reported or the warning is verified. The cache separately requires nonempty samples and post-expiration computation. Imported `false` deliberately overrides unsupported spreadsheet completion markers. Ingestion QC stays attached to each summary even if current config changes.

## Publication artifacts

`dist/data/index.json` contains event summaries, filenames, sample counts, historical year/hazard groups, and latest run report. Per event, separate `.json.gz`, `.samples.json.gz`, and `.footprint.json.gz` files serve results, native timelines, and geometry. Separating them prevents loading the entire sample archive with the initial page. Native values are reaggregated under current rules; positive/duration flags are recomputed, not merely relabeled. Canonical station UGC must exactly join a warned area.

Derived station rows retain the original Results fields. Area rows retain the original 26 fields. Grouped analytics include every archived event, including events lacking observations, with `incompleteEvents` counted separately. Totals describe this archive, not all warnings ever issued.

## Safe one-time importer

`scripts/import-workbook.py /path/to/workbook.xlsx` requires Python/openpyxl and targets the repository containing the script. It refuses to overwrite existing event snapshots, validates orphan event/sample keys, extracts only recognized safe configuration, and excludes Log/workbook/token. Do not rerun it over live updated history. Its `data/import-report.json` is immutable evidence of the original migration, not a live row counter.
