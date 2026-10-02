# Architecture

GitHub owns configuration, code, stored observations, tests, execution, and publication. IEM and Synoptic remain external weather data providers. The browser also uses public Leaflet/CDN and geographic-context services; “GitHub only” describes the application runtime/datastore, not hosting the weather-provider databases themselves.

## Data flow

1. `.github/workflows/verify.yml` runs on schedule or authenticated workflow dispatch. The token comes exclusively from an Actions secret.
2. `scripts/verify.cjs` validates the requested UTC year/month or annual range. `src/providers.cjs` reads IEM annual VTEC events, event GeoJSON, Synoptic station metadata, and station time series.
3. `src/runner.cjs` groups supported warning events, resolves canonical UGC windows, and selects stations whose current metadata zone exactly matches a warned UGC. It processes 60 station IDs per request and at most 24 hours per time slice.
4. `src/core.cjs` applies the preserved meteorological equations/rules. Native usable samples and station aggregates are saved atomically per event by `src/store.cjs`. Provider failures retain the previous event file.
5. The workflow validates/builds and commits completed checkpoints plus a run report. A 45-minute soft deadline leaves time to commit before the job's 60-minute limit. Interrupted current events remain eligible for rerun; earlier completed events are already checkpointed locally and committed by the remaining steps.
6. `.github/workflows/pages.yml` tests/builds on source pushes, manual dispatch, and completed verification runs (including partial failures). This workflow_run trigger is necessary because GITHUB_TOKEN bot pushes do not start ordinary push workflows.
7. `scripts/build-site.cjs` publishes read-only event summaries, footprints, timeline files, analytics, and the existing dashboard to Pages. `src/recalculate.cjs` rebuilds extrema/flags/durations/coverage from native samples using current rules. The browser lazy-loads one event at a time using `site/github-runtime.js`.

## Components

| Path | Responsibility |
| --- | --- |
| config/ | Exact imported thresholds, zone overrides, safe settings |
| src/core.cjs | Pure scientific/rule functions ported from reviewed Code.gs |
| src/providers.cjs | Schema-validated HTTP requests, bounded retries, sanitized errors |
| src/runner.cjs | Event ingestion, station selection, cache identity, checkpoints, budget |
| src/recalculate.cjs | Recompute derived values from saved samples under current policy |
| src/store.cjs | Safe event filenames, compressed storage, atomic replacement |
| src/payload.cjs | Current station/area statuses, event summary, historical index |
| site/ | Leaflet dashboard and asynchronous static-data adapter |
| scripts/ | CLI verification, static build, validation, one-time workbook import |
| tests/ | Scientific functions, schema/import retention, providers, runtime regressions |
| legacy/apps-script/ | Archived implementation and original deployment documentation |

## Caching and consistency

Provider calls retry up to three times with 45-second request timeouts; errors never include query strings or response bodies. Authentication errors and invalid schemas fail visibly. Accepted Synoptic response code 2 means a successful empty query, not a threshold miss.

The SHA-256 cache fingerprint includes algorithm version, event timing, warned areas, safe config/rules, and relevant station metadata. A terminal cache also requires nonempty samples/observations and computation at least one hour after expiration. Active or pre-expiration snapshots are refreshed; empty queries do not become permanent success caches. Force bypasses reuse. Footprints and current metadata are checked even for reusable events.

Event JSON is written to a temporary file then renamed. There are no large Sheet writes or mixed derived-table transactions. A failed event retains its old file, while independent completed events can publish. A canceled/hard-killed job can still lose local progress since the last git commit; the soft deadline reduces that risk but is not durable per-request cloud storage. Rerun the same range without force to continue.

Browser index/event caches are bounded and reset by Refresh dashboard. Gzip is detected from bytes so both raw-gzip and server-decompressed responses work. Native browser DecompressionStream support is required when gzip bytes are served. Late event responses are ignored, and revisiting an event preserves loaded geometry.

## Operating scale

This repository archive is appropriate for the present LIX project. Git history grows with changed compressed event files; sample arrays are held in memory one event at a time during ingestion, and publication reads the retained archive. It is not an unbounded national data warehouse. Annual jobs may require several resumptions and provider plan limits still apply. No database, Google cloud project, or always-on API server is required.
