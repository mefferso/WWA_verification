# GitHub deployment and updates

## Activate

1. [Actions secrets](https://github.com/mefferso/WWA_verification/settings/secrets/actions): create repository secret **SYNOPTIC_API_TOKEN** with the current token from your workbook/provider account. The value was deliberately excluded from tracked files.
2. [Pages settings](https://github.com/mefferso/WWA_verification/settings/pages): Source **GitHub Actions**.
3. [Publish dashboard](https://github.com/mefferso/WWA_verification/actions/workflows/pages.yml): Run workflow on main. Confirm the deploy-pages step succeeds. Expected URL: https://mefferso.github.io/WWA_verification/.
4. [Verify warning events](https://github.com/mefferso/WWA_verification/actions/workflows/verify.yml): Run workflow with the desired period. Initial reconciliation: year 2026, annual true, force false, limit 0. Repeat when the run report lists deferred events.

If organization/repository policy disables Actions or workflow write permissions, allow these workflows and their declared permissions. The verifier needs contents:write to commit data; Pages needs pages:write and id-token:write. There is no additional personal access token. The public dashboard does not expose mutation endpoints.

## Updates

Commit or merge changes into main. CI runs tests/config validation/static build, and Pages independently repeats validation before deployment. Edit config files via GitHub's file editor or a branch/PR. Threshold/duration/wind-basis changes reaggregate saved samples during publication. QC/selection changes require a fresh verification run for affected periods; the cache fingerprint invalidates them automatically. Force is optional unless upstream historical observations changed without corresponding metadata/config changes.

Scheduled runs refresh the previous and current calendar months at 11:17 UTC daily. Manual annual=false selects one UTC calendar month; annual=true selects the whole UTC year. Limit 0 means no explicit event-count limit, subject to the 45-minute soft budget. A positive limit bounds fresh processed events; cached events do not consume it. The range includes overlapping warning periods, using each event's full issue/expiration window.

## Partial failures and recovery

Review Actions logs and `data/last-run.json`. Completed independent events are committed before the workflow marks a partial provider failure red. Pages can publish these validated checkpoints, keeping old files for failed events. The report has computed/reused/failed/deferred counts, timing, range, and soft-budget exhaustion. An authentication error requires correcting the secret; a provider outage calls for rerunning later.

Budget-deferred events are not errors, but the run is not a complete historical reconciliation. Repeat the same range with force=false. Completed post-expiration events are cached; the interrupted event starts again. A canceled/hard-timeout job can lose uncommitted local progress. Conflicting simultaneous human data edits cause git rebase/push to fail rather than overwrite history; resolve the conflict in GitHub and rerun. Verification runs serialize through Actions concurrency.

To restore old data, revert the relevant git commit or restore specific event files from history, validate, and publish. Do not delete the whole archive to fix one event. Stop schedules by disabling Verify warning events in Actions if needed.

## Credentials and Google retirement

Rotate the Synoptic token by updating the repository secret. Never put it in the browser, config JSON, imported gzip data, .env commits, or workflow source. HTTP errors are redacted. Imported workbook/headerless Log are ignored and were not committed.

No Script ID, .clasp.json, Google authorization, Apps Script web-app deployment, or live Sheet maintenance is needed. Keep the old workbook/Sheet as your personal backup if desired. Archived `legacy/apps-script/` is reference-only and has no active workflow. You may disable obsolete Google triggers once the GitHub dashboard and fresh verification runs are confirmed working; the migration did not access or alter your Google account.
