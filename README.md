# LIX WWA Verification

Source of truth for WFO LIX Extreme Heat, Extreme Cold/Wind Chill, and Red Flag warning verification. **GitHub owns source and documentation; the existing Google Sheet owns configuration, thresholds, observations, and historical results; Apps Script remains the backend/web app.** The Leaflet UI is served by Apps Script, not GitHub Pages.

## Files and maintenance

- `Code.gs`: preserved Apps Script backend with targeted regression fixes.
- `Index.html`: existing Leaflet event/area/station dashboard and timeline.
- `appsscript.json`: V8 manifest; America/Chicago display timezone; UTC event/observation timestamps.
- `docs/architecture.md`, `docs/data-model.md`, `docs/verification-methodology.md`: flow, exact schemas, and thresholds.
- `docs/audit.md`: observed rebuild inconsistencies, fixes, and unresolved limitations.
- `docs/deployment.md`: first-time linkage, updates, smoke tests, and rollback.
- `docs/workbook-schema.json`: sanitized snapshot of the uploaded workbook; no token or observational archive.
- `tests/`: dependency-free Node tests that execute the actual backend functions.

## Test locally

Install Node.js 22 or newer, then from the repository root:

```sh
npm test
npm run check
```

No npm dependencies are needed for these tests. GitHub Actions runs both checks on pushes and pull requests. These checks do not prove live Apps Script authorization, API accessibility, runtime performance, or deployed UI behavior.

## First deployment to the EXISTING Apps Script project

1. Back up the live workbook and export the current Apps Script source/manifest. Keep backups outside the repo: the workbook contains a Synoptic token.
2. In the existing Google Sheet choose **Extensions → Apps Script → Project Settings → IDs → Script ID**. Copy the **Script ID**, not the Sheet ID or deployment ID.
3. Install and authenticate clasp:

   ```sh
   npm install -g @google/clasp
   clasp login
   ```

   Enable the Apps Script API at https://script.google.com/home/usersettings if required.
4. Inspect the existing project in a separate backup directory with `clasp clone YOUR_SCRIPT_ID`. Compare its manifest and any additional source files. Do not clone into this repository: that could overwrite the reviewed source. Retain any required additional project files in GitHub before pushing because clasp replaces project contents.
5. Create a **local, ignored** `.clasp.json` in this repo:

   ```json
   { "scriptId": "YOUR_EXISTING_SCRIPT_ID", "rootDir": "." }
   ```

   Substitute the ID from step 2. No `.clasp.json` with a guessed ID is committed. `.claspignore` allows only `Code.gs`, `Index.html`, and `appsscript.json` to sync.
6. In the existing project's **Project Settings → Script Properties**, add `SYNOPTIC_API_TOKEN` with the current token. Add `SPREADSHEET_ID` with the ID between `/d/` and `/edit` in the **existing live Sheet URL**. This supports web-app execution without relying on an active editor spreadsheet. The old Config token remains a compatible fallback; after testing Script Properties, clear its value in Config if desired.
7. Run `npm test`, `npm run check`, and `clasp status`. Confirm only the three runtime files are selected and the local script ID is correct. Then run `clasp push`.
8. In Apps Script, run `runVerificationSelfTests` and authorize the necessary scopes. Run `buildResults` to regenerate stale derived Results/AreaVerification. This cannot recover missing event observations; rerun missing months as needed.
9. Choose **Deploy → Manage deployments → Edit the existing web-app deployment → Version: New version → Deploy**. Retain the existing execute-as and access settings. Updating the existing deployment preserves its URL. `clasp push` alone does not update a versioned web app.
10. Complete the [deployment smoke tests](docs/deployment.md#smoke-test) before relying on operational results.

The supplied workbook is an export of the live project, not a replacement datastore. Do not import it into a new Sheet or initialize empty tabs over the current archive.

## Every subsequent update

```sh
git pull --ff-only
npm test
npm run check
clasp status
clasp push
```

Then update the existing deployment to a new version in Apps Script and smoke-test it. Make changes in GitHub/local git first. If an emergency change is made in the Apps Script editor, pull it into a separate directory, review the diff, and commit it to GitHub before the next push. Never pull blindly over uncommitted reviewed files.

## Important operational limits

Thresholds are preserved exactly from the export, including blank durations. QC removal is currently `off`; observations stay available, but unchecked-QC results are now LOW confidence. Cache invalidation forces old completed events to be recalculated once after this migration. Start with a single month: annual execution is still synchronous and can exceed Apps Script's execution limit. Table chunking is not a transaction and is not a resumable job system. See the audit before large reruns.

Never commit workbook exports, tokens, OAuth credentials, `.clasprc.json`, or raw error logs. Deployment authentication stays on your machine/Google account; this repo does not automatically deploy or require GitHub secrets.
