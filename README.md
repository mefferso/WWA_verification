# LIX WWA Verification

[Repository](https://github.com/mefferso/WWA_verification) · [Dashboard](https://mefferso.github.io/WWA_verification/) · [Update data](https://github.com/mefferso/WWA_verification/actions/workflows/verify.yml)

Verify WFO LIX Extreme Heat, Extreme Cold / Wind Chill, and Red Flag Warnings using IEM VTEC warnings and Synoptic observations. **GitHub is the source of truth and the runtime:** Actions runs the Node backend, versioned compressed files store data, and Pages serves the existing Leaflet dashboard. Google Sheets, Apps Script, and clasp are no longer needed.

## One-time activation in GitHub

1. Open **Settings → Secrets and variables → Actions → New repository secret**. Name it `SYNOPTIC_API_TOKEN` and paste your existing Synoptic token as its value. Never put it in a code/config file, issue, or commit. The spreadsheet's token was excluded from this migration.
2. Open **Settings → Pages**, set **Source** to **GitHub Actions**. Under **Actions → Publish dashboard**, use **Run workflow** to publish the imported archive.
3. Open **Actions → Verify warning events → Run workflow**. For the first historical reconciliation, choose year `2026`, **annual** `true`, **force** `false`, event limit `0`. This fetches fresh observations for the imported records and other supported warnings in that year. If `data/last-run.json` reports deferred events, run it again with force still false; completed snapshots are reused.

The automation is already in this repo. These account settings need repository-owner access; the connector used for migration cannot write GitHub secrets or Pages settings. No Google project ID, deployment, Sheet rebuild, or manual source copying is required. The dashboard link works after Pages successfully deploys.

## Daily operation and changes

The verification workflow runs daily at **11:17 UTC**, refreshing warnings overlapping the previous/current UTC calendar months. Scheduled execution timing is controlled by GitHub. For other periods use **Run workflow** with year/month, or annual=true. Use force=true only when deliberately refetching cached historical observations. The dashboard's **Update data** button opens this authenticated workflow; public visitors cannot mutate the archive or access the token.

Edit thresholds in `config/thresholds.json`, settings in `config/settings.json`, and zone overrides in `config/zone-overrides.json` through GitHub or a branch/PR. Each rule is `[hazard, state, countyOrParishOrALL, parameter, threshold, comparator, durationHours]`; zone override position 3 is a canonical UGC. Blank spreadsheet durations became JSON `null`. The exact county/parish thresholds are in [verification methodology](docs/verification-methodology.md).

Source/config commits to main test and republish the dashboard. Existing native samples are reprocessed with the current thresholds, duration/gap policy, and selected sustained/gust basis during publication. Changing provider QC policy or station selection requires **Verify warning events** to ingest observations again; old samples retain their original QC provenance. The verifier's fingerprint also invalidates affected event caches automatically.

## Local development (optional)

Node **22 or later**; no runtime npm packages are required.

```sh
git clone https://github.com/mefferso/WWA_verification.git
cd WWA_verification
npm test
npm run check
npm run build
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. For local provider runs, supply `SYNOPTIC_API_TOKEN` through your environment, then run `npm run verify -- --year 2026 --month 8` or `npm run verify -- --year 2026 --annual`. Avoid writing the token into shell scripts or committed files. Generated `dist/` is ignored; Pages builds it in Actions. Commit intentional data updates in `data/` alongside source/config changes when working locally.

## What was imported

The supplied workbook contained 14 events, 492 station metadata rows, 238 area-window rows, 1,754 station summaries, 55,217 native samples, and 706 legacy minima. All 38 thresholds were preserved. The existing derived Results and AreaVerification disagreed; publication rebuilds them from native samples rather than trusting those tables. Nine events have no archived station samples. Imported events are explicitly incomplete until fresh provider reconciliation; historical analytics represent available history, not a complete warning census.

The source workbook and its token/headerless logs are excluded. `docs/workbook-schema.json` documents all original tabs/columns with the token redacted. `data/import-report.json` records import counts; `legacy/apps-script/` preserves the reviewed old implementation but is not deployed.

- [Architecture](docs/architecture.md)
- [Data model and original sheet mapping](docs/data-model.md)
- [Thresholds, matching, duration, QC, and limitations](docs/verification-methodology.md)
- [Deployment, recovery, and historical updates](docs/deployment.md)
- [Migration audit](docs/audit.md)
- [Maintainer instructions](AGENTS.md)
