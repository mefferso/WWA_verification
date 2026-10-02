# Verification methodology

This documents the uploaded project and threshold export, not a newly approved warning policy. The thresholds and comparator semantics were preserved. IEM EC/WC warnings map to `EC`, EH/XH to `EH`, and FW to `RFW`; only significance `W` is supported.

## Rule precedence

Rules merge per parameter: state `ALL` rows → matching county/parish rows → exact ZoneOverrides UGC rows. County/parish matching removes punctuation and County/Parish suffixes, lowercases text, and normalizes Saint to St. `LA079` normalizes to `LAZ079`; canonical county (`LAC051`) and marine (`GMZ570`) identifiers retain their type.

Both Thresholds and ZoneOverrides use positional columns A:G. The original `THERSHOLD` header typo is retained in the schema snapshot because the code uses position E, not its label. Blank `DURATION_HOURS` means no duration requirement; a single valid threshold-meeting observation suffices. All 38 exported threshold rows have blank duration. ZoneOverrides is empty.

## Exported thresholds

| Hazard | State/area | Criteria |
| --- | --- | --- |
| EH | All LA and MS | Heat Index ≥113°F OR air temperature ≥105°F |
| RFW | All LA | RH ≤25% AND sustained wind ≥25 mph, simultaneous |
| RFW | All MS | RH ≤25% AND sustained wind ≥15 mph, simultaneous |
| EC | MS: Pearl River, Pike, Walthall, Amite, Wilkinson | Air temperature ≤10°F OR wind chill ≤10°F |
| EC | MS: Hancock, Harrison, Jackson | Air temperature ≤15°F OR wind chill ≤15°F |
| EC | LA: Pointe Coupee, West Feliciana, East Feliciana, St. Helena, Washington | Air temperature ≤10°F OR wind chill ≤10°F |
| EC | LA: St. Tammany, Tangipahoa, Livingston, East Baton Rouge, West Baton Rouge, Iberville, Ascension, St. John the Baptist, St. James, Assumption, Lafourche, Terrebonne, St. Bernard, Plaquemines, Orleans, Jefferson, St. Charles | Air temperature ≤15°F OR wind chill ≤15°F |

The EC export contains TEMP_F rules only. The existing implementation applies that rule to wind chill as an alternative when a WIND_CHILL_F rule is absent. This behavior is deliberately preserved and should be confirmed against the desired office methodology. Explicit zone or wind-chill overrides can change it without source edits.

`RFW wind basis` defaults to `sustained`; an explicit `gust` Config value substitutes gusts. Gusts are never silently used to fill missing sustained wind. RFW is meteorological verification only: fuel dryness, KBDI, land-manager decisions, and full warning justification are not inferred.

## Meteorological calculations and missing data

Heat Index uses the NWS/WPC simple formula averaged with air temperature below the preliminary 80°F transition, otherwise the Rothfusz regression with low/high humidity adjustments. Wind chill uses the NWS formula only at T ≤50°F and sustained wind >3 mph. Missing inputs return null, including null/undefined/empty strings; numeric zero remains valid. Missing dewpoint can be derived using the Magnus formula when T and positive RH exist.

Physical guards in the current processing path: temperature −80 to 140°F, wind 0–200 mph, gust 0–250 mph, RH 0–100%, and dewpoint −120 to 120°F. Derived Heat Index/wind chill are rounded to one decimal **before** threshold comparisons; this preserved behavior can affect values very close to a threshold. Wind chill outside its domain remains missing, not air temperature.

## Timing, duration, and coverage

Only samples inside inclusive warning windows are used. UGC-specific start/end times are used when exposed; event-wide start/end are explicit fallback. This export marks every event as event-wide timing fallback. No claim is made that complete VTEC cancellation/extension histories were reconstructed.

Continuous duration is the span between successive true samples, not the number of samples times a presumed interval. A false sample, a gap exceeding `Duration max gap minutes` (default 30), or an inactive warned interval breaks the run. Isolated true samples have zero continuous duration. Duplicate true timestamps do not reset a run. Overlapping active windows are unioned. Cumulative duration is retained as diagnostic information but is not used to satisfy continuous-duration rules. RFW uses the larger of RH/wind duration requirements.

Coverage is the sum of acceptable adjacent observation intervals divided by the union of active warning duration, capped at 100%. It is based on **any usable variable**, not hazard-specific completeness. The new negative-result guard requires the applicable extrema to exist, but intermittent missing hazard variables can still overstate coverage; per-variable coverage requires a future schema change. Defaults: negative-result coverage ≥50%, gap ≤30 minutes.

## Status and confidence

- `MET`: at least one configured alternative passes its threshold and duration. For RFW, simultaneous RH and wind detection plus the duration requirement passes.
- `NO_DATA`: no usable station observations inside the warned window, or no stations in a warned area.
- `NOT_MET`: sufficient aggregate coverage, required hazard metrics present, no fetch-error flag, and no criterion passed.
- `INDETERMINATE`: missing rules, missing required metrics, inadequate coverage, or incomplete fetch without a positive detection.

Tier A defaults to MNET 1 (ASOS/AWOS) and, for RFW, MNET 2 (RAWS). RAWS is B for other hazards. Explicit Tier A IDs override defaults; Tier B IDs apply after built-in classification; other networks are C. These are network proxies, not station-specific siting validation.

Station confidence is LOW for NO_DATA, incomplete fetches, or QC removal other than `on`. Otherwise Tier A plus ≥70% coverage is HIGH; A/B plus ≥40% coverage is MEDIUM; remaining cases LOW. **The export has QC removal `off`; this remains unchanged.** QC flags are requested but not interpreted/stored individually. Switching QC to `on` changes the observation policy and should be an explicit operator decision.

An area is MET if any station meets criteria, even when that station is LOW confidence. Area confidence now derives from MET-establishing stations for a MET area, rather than an unrelated Tier A station. Area NOT_MET still means observed station evidence, not proof that every point in the zone failed. No areal population weighting is applied.

Historical analytics count event–UGC pairs and unique events represented by AreaVerification, grouped by event year and hazard. Events lacking area rows are omitted. Percentages in the UI use available stored areas, not an independently validated full archive; multiple UGCs and rerun overlaps are not independent warning events. `FIRST_VERIFY_TIME_UTC` is an approximate diagnostic for EC/EH based on extrema, not a complete earliest duration-qualified exceedance search.

## References

- https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml
- https://www.weather.gov/safety/cold-wind-chill-chart
- https://docs.synopticdata.com/services/time-series
- https://docs.synopticdata.com/services/mesonet-data-qc
