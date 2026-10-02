# GitHub-only runtime implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run and host WWA verification entirely in GitHub with no Google dependency.

**Architecture:** Pure meteorological core reused from the reviewed source; Node provider/runner/store modules generate per-event compressed snapshots. Pages serves selected-event data; Actions updates and publishes it.

**Tech stack:** Node.js 22, built-in fetch/zlib/fs/node:test; Leaflet 1.9.4; GitHub Actions/Pages.

**Spec:** ../specs/2026-10-02-github-runtime-design.md

## Global constraints

- Preserve the 38 threshold rows, blank duration behavior, EC alternatives, and simultaneous RFW rules.
- No Google runtime, clasp dependency, exposed token, new paid infrastructure, or secret in static outputs.
- Preserve available raw history and make incomplete event history explicit.

## Review focus

- Failed API requests must preserve old event files and fail the run visibly.
- Cache policy changes, inactive gaps, and missing variables must not yield stale/nonnegative assertions.
- Static Pages must not contain authenticated dispatch tokens or stale-event callbacks.
- Event keys may include separators; filenames must be safe and collision-resistant.
- Concurrent source/data changes must not cause a force push or overwrite source changes.

### Task 1: Core, data schema, and import

Files: src/core.cjs, src/store.cjs, src/payload.cjs, config/*.json, scripts/import-workbook.py, tests/github-runtime.test.cjs.

Interfaces: core exports existing pure functions and headers. Store save/load is event-key indexed; payload builds index/map/area/analytics from event records. Import consumes workbook paths locally and writes safe config and snapshots, never a token.

- [x] Write migration/store tests and observe expected missing-module failures.
- [x] Extract meteorological functions without changing formulas; implement atomic snapshots and payload reconstruction.
- [x] Import all events/summaries/samples from the new workbook; rebuild derived results.
- [x] Run core/store/import assertions; compare imported counts with workbook.

### Task 2: Providers and job runner

Files: src/providers.cjs, src/runner.cjs, scripts/verify.cjs, provider tests.

Interfaces: provider client offers event list, footprint, metadata, time series with bounded retry/timeouts. Runner consumes safe config, rules, secret environment, and store; checkpoints per event. CLI accepts validated year/month/annual/force/limit flags.

- [x] Write request-error, station-match, cache, and checkpoint tests; observe failures.
- [x] Implement async providers and reuse core aggregation; retain timing/QC provenance.
- [x] Implement fingerprints and single-event atomic persistence; fail partial provider jobs visibly while retaining prior data.
- [x] Run offline integration fixtures for each hazard and failure recovery.

### Task 3: Static dashboard and GitHub workflows

Files: site/index.html, site/github-runtime.js, scripts/build-site.cjs, .github/workflows/{test,verify,pages}.yml.

Interfaces: static adapter exposes existing map/footprint/timeline payload functions through fetch; public controls link to Actions. Site build publishes no backend source or credentials. Workflows validate, run verification, commit only config/data outputs, and publish built site.

- [x] Test site build and static payload adapter without Google objects.
- [x] Adapt existing UI with selected-event lazy loading and stale-response guards.
- [x] Add serialized authenticated Actions jobs, daily/manual runs, and Pages publication.
- [x] Smoke-test generated HTML/data and ensure no token/Google runtime references.

### Task 4: Documentation, review, publication

- [x] Rewrite README/AGENTS/architecture/deployment for GitHub runtime; archive old Sheets-specific instructions.
- [x] Run all tests, static build, secret scan, schema/count checks, and one fresh code review.
- [ ] Commit to the existing repo, verify remote file hashes and Actions result.
- [ ] Report exact account settings still required when connector cannot set Secrets/Pages.

## Implementation evidence

Ported the existing meteorological core and retained the Leaflet UI. Workbook import counts agree: 14 events, 1,754 summaries, 55,217 samples, 38 thresholds. Fresh code review found six issues; regression tests reproduced them before fixes. The reviewer confirmed all six resolved. Soft-budget deferral, post-expiration cache checks, hazard-variable coverage, policy reaggregation, partial checkpoint publication, and repeated selection geometry now have regression coverage. Browser visual QA was unavailable (Chromium not installed); static parsing, generated payload checks, and VM adapter/event-selection smoke tests passed. Secrets and Pages activation remain repository-owner settings because the connector cannot write those APIs.
