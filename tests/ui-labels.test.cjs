// Regression tests for the dashboard status display contract:
// INDETERMINATE is rendered as "Couldn't judge" in a quiet non-verdict color,
// never as amber and never under its old name. The backend VERIFY_STATUS enum
// itself is unchanged (see src/core.cjs); these tests cover the display layer.
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');

test('no amber indeterminate color remains in the dashboard UI', () => {
  assert.ok(!/#f59e0b/i.test(html), '#f59e0b still present in site/index.html');
  assert.ok(!/245,158,11/.test(html), 'amber rgba(245,158,11) still present in site/index.html');
});

test('status display labels cover all four statuses', () => {
  const m = html.match(/const STATUS_LABELS=\{([^}]+)\}/);
  assert.ok(m, 'STATUS_LABELS map not found in site/index.html');
  const labels = new Function(`return {${m[1]}};`)();
  assert.deepStrictEqual(labels, {
    MET: 'Met',
    NOT_MET: 'Not met',
    INDETERMINATE: "Couldn't judge",
    NO_DATA: 'No data',
  });
});

test('indeterminate is never rendered under its old display name', () => {
  // The uppercase enum key INDETERMINATE must survive (backend contract);
  // the mixed-case display word must not appear anywhere user-facing.
  assert.ok(!/Indeterminate/.test(html), 'literal "Indeterminate" still rendered in site/index.html');
});

test('met-only toggle and status filter controls exist', () => {
  assert.ok(html.includes('id="show-met-only"'), 'met-only checkbox missing');
  assert.ok(html.includes('>Status<select id="filter-status"'), 'status filter label missing or not renamed');
  assert.ok(html.includes('polygonDimmed'), 'polygon dimming helper missing');
});
