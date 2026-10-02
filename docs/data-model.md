# Google Sheets data model

Inspected all tabs of the uploaded export on 2026-10-02. The live connected Sheet was not accessed. Existing table schemas match the uploaded backend constants; this does not imply derived rows are consistent. Keep the existing workbook, tab names, and column order. Exact machine-readable snapshot: [workbook-schema.json](workbook-schema.json). No observational rows or token are included.

## Relationships

`EVENT_KEY` joins Events to EventAreas, _EventObs, _ObsSamples, Results, and AreaVerification. `UGC`/`AREA_UGC` join the actual warned area. `STID` joins station metadata and observation records. Results extends all 56 _EventObs columns with six status fields. Events key format: `year|WFO|hazard|phenomena|ETN|first-issue-UTC-yyyymmddHHmm`.

Timestamps are UTC strings for persisted event/observation records. The web app displays America/Chicago local time. Empty numeric cells are null, not zero. Boolean flags are written as TRUE/FALSE strings; Google exports may represent them as booleans, which the backend normalizes via string conversion. Longitude/latitude are decimal degrees, wind mph, temperature/dewpoint/HI/WC °F, RH %, durations minutes, rule duration hours.

## Tab inventory

| Tab | Export data rows | Hidden | Role |
| --- | ---: | --- | --- |
| Config | 5 | No | Operator-owned key/value settings. Row 1 is Key, Value; keys are trimmed. Never publish its token. |
| _ObsSamples | 55217 | Yes | Hidden native-time samples and criterion flags. No downsampling applied at persistence. |
| AreaVerification | 238 | No | Derived event–UGC summaries and observational confidence. |
| Events | 14 | No | Persistent VTEC event metadata; DATA_COMPLETE is ingestion completion, not proof of observational adequacy. RUN_NOTE includes a non-secret calculation fingerprint. |
| EventAreas | 238 | No | Persistent event–UGC active windows; multiple windows allowed. GEOMETRY_JSON retained as an empty compatibility column. |
| _Minima | 706 | Yes | Hidden legacy working table; preserved but unused. |
| Stations | 492 | No | Metadata refreshed from Synoptic. NWSZONE normalized; ELEVATION requested in English metadata and stored as ELEVATION_FT in downstream tables (provider units should be confirmed). |
| Thresholds | 38 | No | Operator-owned A:G rules; positional columns. All exported durations blank. |
| ZoneOverrides | 0 | No | Operator-owned overrides. Export empty. When used, A:G = HAZARD, STATE, UGC, PARAMETER, THRESHOLD, COMPARATOR, DURATION_HOURS. |
| Results | 645 | No | Derived from all _EventObs rows using current threshold lookup. |
| Log | 418 | No | Append-only headerless timestamp, step, message entries. Not an input to verification. |
| _EventObs | 1754 | Yes | Hidden event–station summaries; main raw aggregate input to Results. |

## Exact exported columns

### Config

Operator-owned key/value settings. Row 1 is Key, Value; keys are trimmed. Never publish its token.

| Position | Header |
| ---: | --- |
| 1 | `Key` |
| 2 | `Value` |
### _ObsSamples

Hidden native-time samples and criterion flags. No downsampling applied at persistence.

| Position | Header |
| ---: | --- |
| 1 | `EVENT_KEY` |
| 2 | `AREA_UGC` |
| 3 | `STID` |
| 4 | `TIME_UTC` |
| 5 | `TEMP_F` |
| 6 | `RH_PCT` |
| 7 | `DEWPOINT_F` |
| 8 | `WIND_MPH` |
| 9 | `GUST_MPH` |
| 10 | `HEAT_INDEX_F` |
| 11 | `WIND_CHILL_F` |
| 12 | `TEMP_MET` |
| 13 | `WINDCHILL_MET` |
| 14 | `HEAT_INDEX_MET` |
| 15 | `RFW_MET` |
### AreaVerification

Derived event–UGC summaries and observational confidence.

| Position | Header |
| ---: | --- |
| 1 | `EVENT_KEY` |
| 2 | `EVENT_YEAR` |
| 3 | `EVENT_ID` |
| 4 | `HAZARD` |
| 5 | `PRODUCT_LABEL` |
| 6 | `UGC` |
| 7 | `AREA_LABEL` |
| 8 | `STATION_COUNT` |
| 9 | `USABLE_STATION_COUNT` |
| 10 | `MET_STATION_COUNT` |
| 11 | `NOT_MET_STATION_COUNT` |
| 12 | `INDETERMINATE_STATION_COUNT` |
| 13 | `NO_DATA_STATION_COUNT` |
| 14 | `TIER_A_STATION_COUNT` |
| 15 | `AVG_COVERAGE_PCT` |
| 16 | `VERIFY_STATUS` |
| 17 | `CONFIDENCE` |
| 18 | `VERIFIED_BY` |
| 19 | `WORST_TEMP_F` |
| 20 | `WORST_WINDCHILL_F` |
| 21 | `HOTTEST_TEMP_F` |
| 22 | `HOTTEST_HEAT_INDEX_F` |
| 23 | `LOWEST_RH_PCT` |
| 24 | `HIGHEST_WIND_MPH` |
| 25 | `HIGHEST_GUST_MPH` |
| 26 | `FIRST_VERIFY_TIME_UTC` |
### Events

Persistent VTEC event metadata; DATA_COMPLETE is ingestion completion, not proof of observational adequacy. RUN_NOTE includes a non-secret calculation fingerprint.

| Position | Header |
| ---: | --- |
| 1 | `EVENT_KEY` |
| 2 | `EVENT_YEAR` |
| 3 | `WFO` |
| 4 | `EVENT_ID` |
| 5 | `HAZARD` |
| 6 | `PHENOMENA` |
| 7 | `SIGNIFICANCE` |
| 8 | `PRODUCT_LABEL` |
| 9 | `ISSUE_UTC` |
| 10 | `EXPIRE_UTC` |
| 11 | `WARNED_UGCS` |
| 12 | `FOOTPRINT_SOURCE` |
| 13 | `AREA_TIMING_MODE` |
| 14 | `DATA_COMPLETE` |
| 15 | `RUN_NOTE` |
| 16 | `UPDATED_UTC` |
### EventAreas

Persistent event–UGC active windows; multiple windows allowed. GEOMETRY_JSON retained as an empty compatibility column.

| Position | Header |
| ---: | --- |
| 1 | `EVENT_KEY` |
| 2 | `UGC` |
| 3 | `START_UTC` |
| 4 | `END_UTC` |
| 5 | `ACTION` |
| 6 | `GEOMETRY_JSON` |
| 7 | `SOURCE` |
### _Minima

Hidden legacy working table; preserved but unused.

| Position | Header |
| ---: | --- |
| 1 | `DATE` |
| 2 | `STATE` |
| 3 | `COUNTY` |
| 4 | `NWSZONE` |
| 5 | `STID` |
| 6 | `NAME` |
| 7 | `MIN_TEMP_F` |
| 8 | `MIN_TEMP_TIME_UTC` |
| 9 | `MIN_WINDCHILL_F` |
| 10 | `MIN_WINDCHILL_TIME_UTC` |
### Stations

Metadata refreshed from Synoptic. NWSZONE normalized; ELEVATION requested in English metadata and stored as ELEVATION_FT in downstream tables (provider units should be confirmed).

| Position | Header |
| ---: | --- |
| 1 | `STID` |
| 2 | `NAME` |
| 3 | `STATE` |
| 4 | `COUNTY` |
| 5 | `CWA` |
| 6 | `NWSZONE` |
| 7 | `LATITUDE` |
| 8 | `LONGITUDE` |
| 9 | `ELEVATION` |
| 10 | `MNET_ID` |
| 11 | `STATUS` |
| 12 | `TIMEZONE` |
### Thresholds

Operator-owned A:G rules; positional columns. All exported durations blank.

| Position | Header |
| ---: | --- |
| 1 | `HAZARD` |
| 2 | `STATE` |
| 3 | `COUNTY_OR_PARISH` |
| 4 | `PARAMETER` |
| 5 | `THERSHOLD` |
| 6 | `COMPARATOR` |
| 7 | `DURATION_HOURS` |
### ZoneOverrides

Operator-owned overrides. Export empty. When used, A:G = HAZARD, STATE, UGC, PARAMETER, THRESHOLD, COMPARATOR, DURATION_HOURS.

No rows/headers in the export. See the expected A:G schema above before adding overrides.
### Results

Derived from all _EventObs rows using current threshold lookup.

| Position | Header |
| ---: | --- |
| 1 | `EVENT_KEY` |
| 2 | `EVENT_YEAR` |
| 3 | `EVENT_ID` |
| 4 | `HAZARD` |
| 5 | `PHENOMENA` |
| 6 | `SIGNIFICANCE` |
| 7 | `PRODUCT_LABEL` |
| 8 | `ISSUE_UTC` |
| 9 | `EXPIRE_UTC` |
| 10 | `AREA_UGC` |
| 11 | `STATE` |
| 12 | `COUNTY` |
| 13 | `NWSZONE` |
| 14 | `STID` |
| 15 | `NAME` |
| 16 | `LATITUDE` |
| 17 | `LONGITUDE` |
| 18 | `ELEVATION_FT` |
| 19 | `MNET_ID` |
| 20 | `NETWORK_NAME` |
| 21 | `NETWORK_TIER` |
| 22 | `OBS_COUNT` |
| 23 | `FIRST_OBS_UTC` |
| 24 | `LAST_OBS_UTC` |
| 25 | `DATA_COVERAGE_PCT` |
| 26 | `QC_POLICY` |
| 27 | `FETCH_ERROR` |
| 28 | `MIN_TEMP_F` |
| 29 | `MIN_TEMP_TIME_UTC` |
| 30 | `MIN_WINDCHILL_F` |
| 31 | `MIN_WINDCHILL_TIME_UTC` |
| 32 | `MAX_TEMP_F` |
| 33 | `MAX_TEMP_TIME_UTC` |
| 34 | `MAX_HEAT_INDEX_F` |
| 35 | `MAX_HEAT_INDEX_TIME_UTC` |
| 36 | `HI_TEMP_F` |
| 37 | `HI_RH_PCT` |
| 38 | `HI_DEWPOINT_F` |
| 39 | `MIN_RH_PCT` |
| 40 | `MIN_RH_TIME_UTC` |
| 41 | `MAX_WIND_MPH` |
| 42 | `MAX_WIND_TIME_UTC` |
| 43 | `MAX_GUST_MPH` |
| 44 | `MAX_GUST_TIME_UTC` |
| 45 | `RFW_VERIFY_TIME_UTC` |
| 46 | `RFW_VERIFY_RH_PCT` |
| 47 | `RFW_VERIFY_WIND_MPH` |
| 48 | `RFW_VERIFY_GUST_MPH` |
| 49 | `TEMP_CRITERIA_MAX_CONTINUOUS_MIN` |
| 50 | `WINDCHILL_CRITERIA_MAX_CONTINUOUS_MIN` |
| 51 | `HEAT_INDEX_CRITERIA_MAX_CONTINUOUS_MIN` |
| 52 | `RFW_CRITERIA_MAX_CONTINUOUS_MIN` |
| 53 | `TEMP_CRITERIA_CUMULATIVE_MIN` |
| 54 | `WINDCHILL_CRITERIA_CUMULATIVE_MIN` |
| 55 | `HEAT_INDEX_CRITERIA_CUMULATIVE_MIN` |
| 56 | `RFW_CRITERIA_CUMULATIVE_MIN` |
| 57 | `THRESHOLD_SUMMARY` |
| 58 | `VERIFY_STATUS` |
| 59 | `EXCEEDED` |
| 60 | `EXCEEDED_BY` |
| 61 | `CONFIDENCE` |
| 62 | `NOTES` |
### Log

Append-only headerless timestamp, step, message entries. Not an input to verification.

No header row. Columns A:C: UTC timestamp, step, message.
### _EventObs

Hidden event–station summaries; main raw aggregate input to Results.

| Position | Header |
| ---: | --- |
| 1 | `EVENT_KEY` |
| 2 | `EVENT_YEAR` |
| 3 | `EVENT_ID` |
| 4 | `HAZARD` |
| 5 | `PHENOMENA` |
| 6 | `SIGNIFICANCE` |
| 7 | `PRODUCT_LABEL` |
| 8 | `ISSUE_UTC` |
| 9 | `EXPIRE_UTC` |
| 10 | `AREA_UGC` |
| 11 | `STATE` |
| 12 | `COUNTY` |
| 13 | `NWSZONE` |
| 14 | `STID` |
| 15 | `NAME` |
| 16 | `LATITUDE` |
| 17 | `LONGITUDE` |
| 18 | `ELEVATION_FT` |
| 19 | `MNET_ID` |
| 20 | `NETWORK_NAME` |
| 21 | `NETWORK_TIER` |
| 22 | `OBS_COUNT` |
| 23 | `FIRST_OBS_UTC` |
| 24 | `LAST_OBS_UTC` |
| 25 | `DATA_COVERAGE_PCT` |
| 26 | `QC_POLICY` |
| 27 | `FETCH_ERROR` |
| 28 | `MIN_TEMP_F` |
| 29 | `MIN_TEMP_TIME_UTC` |
| 30 | `MIN_WINDCHILL_F` |
| 31 | `MIN_WINDCHILL_TIME_UTC` |
| 32 | `MAX_TEMP_F` |
| 33 | `MAX_TEMP_TIME_UTC` |
| 34 | `MAX_HEAT_INDEX_F` |
| 35 | `MAX_HEAT_INDEX_TIME_UTC` |
| 36 | `HI_TEMP_F` |
| 37 | `HI_RH_PCT` |
| 38 | `HI_DEWPOINT_F` |
| 39 | `MIN_RH_PCT` |
| 40 | `MIN_RH_TIME_UTC` |
| 41 | `MAX_WIND_MPH` |
| 42 | `MAX_WIND_TIME_UTC` |
| 43 | `MAX_GUST_MPH` |
| 44 | `MAX_GUST_TIME_UTC` |
| 45 | `RFW_VERIFY_TIME_UTC` |
| 46 | `RFW_VERIFY_RH_PCT` |
| 47 | `RFW_VERIFY_WIND_MPH` |
| 48 | `RFW_VERIFY_GUST_MPH` |
| 49 | `TEMP_CRITERIA_MAX_CONTINUOUS_MIN` |
| 50 | `WINDCHILL_CRITERIA_MAX_CONTINUOUS_MIN` |
| 51 | `HEAT_INDEX_CRITERIA_MAX_CONTINUOUS_MIN` |
| 52 | `RFW_CRITERIA_MAX_CONTINUOUS_MIN` |
| 53 | `TEMP_CRITERIA_CUMULATIVE_MIN` |
| 54 | `WINDCHILL_CRITERIA_CUMULATIVE_MIN` |
| 55 | `HEAT_INDEX_CRITERIA_CUMULATIVE_MIN` |
| 56 | `RFW_CRITERIA_CUMULATIVE_MIN` |

## Config keys and defaults

| Exact trimmed key | Export value | Default/behavior |
| --- | --- | --- |
| Synoptic API token | Redacted | Preferred Script Property SYNOPTIC_API_TOKEN; Config fallback retained |
| CWA | LIX | LIX; trailing space in exported key is trimmed |
| QC remove flagged (on/off) | off | on when absent; supports on/off/mark; export deliberately remains off |
| Start (UTC) | 2026-01-01 00:00 | Legacy; ignored by monthly/annual entry points |
| End (UTC) | 2026-01-31 23:59 | Legacy; ignored by monthly/annual entry points |
| QC checks | Absent | synopticlabs |
| Vars | Absent | Ensures air_temp, wind_speed, wind_gust, relative_humidity, dew_point_temperature |
| Units | Absent | `english,speed\|mph,temp\|f` (do not change without updating unit handling) |
| RFW wind basis | Absent | sustained; explicit gust selects gust |
| Duration max gap minutes | Absent | 30; invalid/less than 1 falls back |
| Minimum coverage for nonverify % | Absent | 50; valid 0–100 preserved |
| Force refresh completed events | Absent | off; on bypasses cache |
| Tier A MNET IDs | Absent | Empty explicit list; built-in ASOS/AWOS/RAWS rules remain |
| Tier B MNET IDs | Absent | Empty explicit list |

Script Properties: SYNOPTIC_API_TOKEN (secret) and SPREADSHEET_ID (existing datastore ID). Neither is inferred or committed. Threshold snapshots live in the sanitized JSON and [methodology](verification-methodology.md); the live Sheet is their runtime authority.

## Preservation and schema validation

Config, Thresholds, and ZoneOverrides are read, never rewritten by verification. _Minima is unused and untouched. Populated runtime-table headers must match backend constants; schema preflight stops on mismatch. Extra columns are not a supported extension: output rebuilding writes the defined schema and clears trailing columns. Back up and plan explicit migrations before extending the schema. Sheet styling/protection/validation is not reconstructed from the export or changed by this repo migration. Output routines may show/hide the runtime tabs according to the documented layout.
