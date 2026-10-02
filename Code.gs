/***************
 * Multi-Hazard Synoptic + IEM Verification Helper (WFO LIX)
 * Rebuilt verification core
 *
 * Hazards:
 * EC = Extreme Cold / Wind Chill Warning
 * EH = Extreme / Excessive Heat Warning
 * RFW = Red Flag Warning (meteorological criteria only unless fuels are added)
 *
 * Design goals:
 * - Verify only the UGC footprint actually associated with the VTEC event.
 * - Preserve UGC-specific timing when the source exposes it; clearly mark fallback timing.
 * - Use NWS-consistent Heat Index / Wind Chill calculations.
 * - Keep zero as a valid observation.
 * - Enforce optional duration requirements from Thresholds/ZoneOverrides.
 * - Distinguish MET / NOT_MET / INDETERMINATE / NO_DATA.
 * - Preserve station provenance, network tier, QC policy, coverage and confidence.
 * - Persist events across monthly/annual reruns for historical analytics.
 * - Store lightweight observation samples for the event timeline UI.
 ***************/

const HAZARD_META = {
  EC: { label: 'Extreme Cold / Wind Chill Warning', iemPhenomena: ['EC', 'WC'], significance: 'W' },
  EH: { label: 'Extreme Heat Warning', iemPhenomena: ['EH', 'XH'], significance: 'W' },
  RFW: { label: 'Red Flag Warning', iemPhenomena: ['FW'], significance: 'W' }
};

const STATION_HEADERS = [
  'STID','NAME','STATE','COUNTY','CWA','NWSZONE','LATITUDE','LONGITUDE','ELEVATION','MNET_ID','STATUS','TIMEZONE'
];

const EVENT_HEADERS = [
  'EVENT_KEY','EVENT_YEAR','WFO','EVENT_ID','HAZARD','PHENOMENA','SIGNIFICANCE','PRODUCT_LABEL',
  'ISSUE_UTC','EXPIRE_UTC','WARNED_UGCS','FOOTPRINT_SOURCE','AREA_TIMING_MODE','DATA_COMPLETE','RUN_NOTE','UPDATED_UTC'
];

const EVENT_AREA_HEADERS = [
  'EVENT_KEY','UGC','START_UTC','END_UTC','ACTION','GEOMETRY_JSON','SOURCE'
];

const EVENT_OBS_HEADERS = [
  'EVENT_KEY','EVENT_YEAR','EVENT_ID','HAZARD','PHENOMENA','SIGNIFICANCE','PRODUCT_LABEL','ISSUE_UTC','EXPIRE_UTC',
  'AREA_UGC','STATE','COUNTY','NWSZONE','STID','NAME','LATITUDE','LONGITUDE','ELEVATION_FT','MNET_ID','NETWORK_NAME','NETWORK_TIER',
  'OBS_COUNT','FIRST_OBS_UTC','LAST_OBS_UTC','DATA_COVERAGE_PCT','QC_POLICY','FETCH_ERROR',
  'MIN_TEMP_F','MIN_TEMP_TIME_UTC','MIN_WINDCHILL_F','MIN_WINDCHILL_TIME_UTC',
  'MAX_TEMP_F','MAX_TEMP_TIME_UTC','MAX_HEAT_INDEX_F','MAX_HEAT_INDEX_TIME_UTC','HI_TEMP_F','HI_RH_PCT','HI_DEWPOINT_F',
  'MIN_RH_PCT','MIN_RH_TIME_UTC','MAX_WIND_MPH','MAX_WIND_TIME_UTC','MAX_GUST_MPH','MAX_GUST_TIME_UTC',
  'RFW_VERIFY_TIME_UTC','RFW_VERIFY_RH_PCT','RFW_VERIFY_WIND_MPH','RFW_VERIFY_GUST_MPH',
  'TEMP_CRITERIA_MAX_CONTINUOUS_MIN','WINDCHILL_CRITERIA_MAX_CONTINUOUS_MIN','HEAT_INDEX_CRITERIA_MAX_CONTINUOUS_MIN','RFW_CRITERIA_MAX_CONTINUOUS_MIN',
  'TEMP_CRITERIA_CUMULATIVE_MIN','WINDCHILL_CRITERIA_CUMULATIVE_MIN','HEAT_INDEX_CRITERIA_CUMULATIVE_MIN','RFW_CRITERIA_CUMULATIVE_MIN'
];

const RESULT_HEADERS = EVENT_OBS_HEADERS.concat([
  'THRESHOLD_SUMMARY','VERIFY_STATUS','EXCEEDED','EXCEEDED_BY','CONFIDENCE','NOTES'
]);

const SAMPLE_HEADERS = [
  'EVENT_KEY','AREA_UGC','STID','TIME_UTC','TEMP_F','RH_PCT','DEWPOINT_F','WIND_MPH','GUST_MPH','HEAT_INDEX_F','WIND_CHILL_F',
  'TEMP_MET','WINDCHILL_MET','HEAT_INDEX_MET','RFW_MET'
];

const AREA_VERIFY_HEADERS = [
  'EVENT_KEY','EVENT_YEAR','EVENT_ID','HAZARD','PRODUCT_LABEL','UGC','AREA_LABEL',
  'STATION_COUNT','USABLE_STATION_COUNT','MET_STATION_COUNT','NOT_MET_STATION_COUNT','INDETERMINATE_STATION_COUNT','NO_DATA_STATION_COUNT',
  'TIER_A_STATION_COUNT','AVG_COVERAGE_PCT','VERIFY_STATUS','CONFIDENCE','VERIFIED_BY',
  'WORST_TEMP_F','WORST_WINDCHILL_F','HOTTEST_TEMP_F','HOTTEST_HEAT_INDEX_F','LOWEST_RH_PCT','HIGHEST_WIND_MPH','HIGHEST_GUST_MPH','FIRST_VERIFY_TIME_UTC'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Synoptic Tools')
    .addItem('Run Monthly VTEC Verification', 'runMonthlyVtecVerification')
    .addItem('Run Annual VTEC Verification', 'runAnnualVtecVerification')
    .addSeparator()
    .addItem('Fetch Stations (Metadata)', 'fetchStations')
    .addItem('Rebuild Results From Existing Event Obs', 'buildResults')
    .addItem('Run Verification Self-Tests', 'runVerificationSelfTests')
    .addToUi();
}

function runAnnualVtecVerification() {
  var ui = SpreadsheetApp.getUi();
  var yearResp = ui.prompt('Annual Verification', 'Enter 4-digit year (e.g. 2026):', ui.ButtonSet.OK_CANCEL);
  if (yearResp.getSelectedButton() !== ui.Button.OK) return;
  var year = Number(String(yearResp.getResponseText() || '').trim());
  if (!isFinite(year) || year < 2000 || year > 2100) {
    ui.alert('Invalid year. Use a 4-digit year.');
    return;
  }
  ui.alert('Annual Run Done', runAnnualWeb(year), ui.ButtonSet.OK);
}

function runMonthlyVtecVerification() {
  var ui = SpreadsheetApp.getUi();
  var monthResp = ui.prompt('Monthly Verification', 'Enter month number (1-12):', ui.ButtonSet.OK_CANCEL);
  if (monthResp.getSelectedButton() !== ui.Button.OK) return;
  var yearResp = ui.prompt('Monthly Verification', 'Enter 4-digit year (e.g. 2026):', ui.ButtonSet.OK_CANCEL);
  if (yearResp.getSelectedButton() !== ui.Button.OK) return;
  var month = Number(String(monthResp.getResponseText() || '').trim());
  var year = Number(String(yearResp.getResponseText() || '').trim());
  ui.alert('Done', runMonthlyWeb(month, year), ui.ButtonSet.OK);
}

function runAnnualWeb(year) {
  if (!isFinite(year) || year < 2000 || year > 2100) throw new Error('Invalid year. Use a 4-digit year.');
  var yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  var yearEnd = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
  return runVerificationRange_(year, null, yearStart, yearEnd);
}

function runMonthlyWeb(month, year) {
  if (!isFinite(month) || month < 1 || month > 12) throw new Error('Invalid month. Use 1-12.');
  if (!isFinite(year) || year < 2000 || year > 2100) throw new Error('Invalid year. Use a 4-digit year.');
  var monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  var monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return runVerificationRange_(year, month, monthStart, monthEnd);
}

function runVerificationRange_(year, month, rangeStart, rangeEnd) {
  return withWriteLock_(function() { return runVerificationRangeUnlocked_(year, month, rangeStart, rangeEnd); });
}

function runVerificationRangeUnlocked_(year, month, rangeStart, rangeEnd) {
  validateRuntimeSchema_();
  var cfg = readConfig_();
  log_('runVerificationRange_', 'Start CWA=' + cfg._cwa + ' year=' + year + ' month=' + (month || 'ALL'));
  fetchStationsUnlocked_();
  var thresholdMaps = buildThresholdMaps_();
  var stationRows = getStationMetadata_();
  var events = fetchIemEventsForMonth_(cfg._cwa, year, month, rangeStart, rangeEnd);
  if (!events.length) return 'No supported warning events found for requested period.';

  var eventRows = [];
  var areaRows = [];
  var freshSummaryRows = [];
  var freshSampleRows = [];
  var eventKeys = [];
  var freshEventKeys = [];
  var cache = buildExistingEventCache_();
  var cacheHits = 0;
  var cachedSummaryCount = 0;
  var cachedSampleCount = 0;

  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    event.cacheFingerprint = eventCacheFingerprint_(event, cfg, thresholdMaps, stationRows);
    eventKeys.push(event.eventKey);
    for (var a = 0; a < event.areas.length; a++) areaRows.push(eventAreaToRow_(event, event.areas[a]));

    if (shouldReuseCompletedEvent_(event, cache, cfg)) {
      cacheHits++;
      event.dataComplete = true;
      event.runNote = 'Reused cached completed-event observations.';
      cachedSummaryCount += (cache.obs[event.eventKey] || []).length;
      cachedSampleCount += (cache.samples[event.eventKey] || []).length;
      log_('runVerificationRange_', 'Cache hit for ' + event.eventKey + '; observation/sample rows left in place.');
    } else {
      var computed = computeEventObservationsInMemory_(cfg, event, thresholdMaps, stationRows);
      event.dataComplete = computed.fetchErrors === 0;
      event.runNote = computed.fetchErrors ? (computed.fetchErrors + ' Synoptic chunk fetch(es) failed; results may be partial.') : 'Fresh observation calculation completed.';
      freshEventKeys.push(event.eventKey);
      freshSummaryRows = freshSummaryRows.concat(computed.summaryRows);
      freshSampleRows = freshSampleRows.concat(computed.sampleRows);
      log_('runVerificationRange_', 'Computed ' + event.eventKey + ': ' + computed.summaryRows.length + ' station summaries, ' + computed.sampleRows.length + ' samples.');
    }
    event.runNote += ' [cache:' + event.cacheFingerprint + ']';
    eventRows.push(eventToRow_(event));
  }

  log_('runVerificationRange_', 'Persisting event metadata.');
  if (freshEventKeys.length) {
    invalidateCompletedEvents_(freshEventKeys);
    log_('runVerificationRange_', 'Persisting fresh observation rows: ' + freshSummaryRows.length + ' summaries / ' + freshSampleRows.length + ' samples.');
    replaceRowsForEventKeys_('_EventObs', EVENT_OBS_HEADERS, freshSummaryRows, freshEventKeys, 0, true);
    replaceRowsForEventKeys_('_ObsSamples', SAMPLE_HEADERS, freshSampleRows, freshEventKeys, 0, true);
  } else {
    log_('runVerificationRange_', 'All requested events were cache hits; skipped _EventObs/_ObsSamples rewrite.');
  }

  // Publish completion metadata after observation writes; incomplete writes must
  // never create a newly reusable cache entry. Sheets writes are not transactional.
  replaceRowsForEventKeys_('EventAreas', EVENT_AREA_HEADERS, areaRows, eventKeys, 0, false);
  replaceRowsForEventKeys_('Events', EVENT_HEADERS, eventRows, eventKeys, 0, false);

  log_('runVerificationRange_', 'Building Results/AreaVerification.');
  buildResultsUnlocked_();

  var totalSummaryCount = freshSummaryRows.length + cachedSummaryCount;
  var totalSampleCount = freshSampleRows.length + cachedSampleCount;
  var fallbackEvents = events.filter(function(e) { return e.areaTimingMode.indexOf('fallback') !== -1 || e.footprintSource.indexOf('fallback') !== -1; }).length;
  return 'Processed ' + events.length + ' event(s), ' + totalSummaryCount + ' station/event summaries and ' + totalSampleCount + ' timeline samples. ' + cacheHits + ' completed event(s) reused from cache.' +
    (fallbackEvents ? ' ' + fallbackEvents + ' event(s) used a documented footprint/timing fallback; see Events sheet.' : '');
}

/** ===== VTEC / event footprint ===== */
function fetchIemEventsForMonth_(wfo, year, month, rangeStart, rangeEnd) {
  var url = buildUrl_('https://mesonet.agron.iastate.edu/json/vtec_events.py', { wfo: wfo, year: year });
  var data = fetchJsonWithRetry_(url, 3);
  var rows = data.events || [];
  var grouped = {};

  for (var i = 0; i < rows.length; i++) {
    var e = rows[i] || {};
    var phenomena = String(e.phenomena || e.phenom || e.type || '').trim().toUpperCase();
    var significance = String(e.significance || e.sig || '').trim().toUpperCase();
    var hazard = getHazardFromIem_(phenomena, significance);
    if (!hazard) continue;

    var issue = parseDateSafe_(e.issue || e.issued || e.init_issue || e.init_iss);
    var expire = parseDateSafe_(e.expire || e.expired || e.init_expire || e.init_exp);
    if (!isValidDate_(issue)) continue;
    if (!isValidDate_(expire)) expire = issue;
    if (expire < rangeStart || issue >= rangeEnd) continue;

    var eventId = String(e.eventid != null ? e.eventid : (e.etn != null ? e.etn : '')).trim();
    if (!eventId) continue;
    var baseKey = hazard + '|' + phenomena + '|' + eventId;
    if (!grouped[baseKey]) {
      grouped[baseKey] = {
        year: year, wfo: wfo, hazard: hazard, eventId: eventId,
        issue: issue, expire: expire, phenoms: {}, rawRows: []
      };
    } else {
      if (issue < grouped[baseKey].issue) grouped[baseKey].issue = issue;
      if (expire > grouped[baseKey].expire) grouped[baseKey].expire = expire;
    }
    grouped[baseKey].phenoms[phenomena] = true;
    grouped[baseKey].rawRows.push(e);
  }

  var out = [];
  Object.keys(grouped).forEach(function(k) {
    var g = grouped[k];
    var phenomList = Object.keys(g.phenoms).sort();
    g.phenomena = phenomList.join(',');
    g.significance = 'W';
    g.productLabel = resolveProductLabel_(g.hazard, g.phenoms);
    g.eventKey = [g.year, g.wfo, g.hazard, g.phenomena, g.eventId, fmtYmdHm_(g.issue)].join('|');
    g.issueUtc = toIsoMinute_(g.issue);
    g.expireUtc = toIsoMinute_(g.expire);
    enrichEventFootprint_(g);
    delete g.rawRows;
    delete g.phenoms;
    out.push(g);
  });
  out.sort(function(a, b) { return a.issue.getTime() - b.issue.getTime(); });
  return out;
}

function enrichEventFootprint_(event) {
  var rowWindows = extractAreaWindowsFromRows_(event.rawRows || [], event.issue, event.expire);
  var featureUgcs = {};
  var phenoms = String(event.phenomena || '').split(',').filter(String);
  var footprintSuccess = false;

  for (var p = 0; p < phenoms.length; p++) {
    var phen = phenoms[p];
    try {
      var url = buildUrl_('https://mesonet.agron.iastate.edu/geojson/vtec_event.py', {
        wfo: event.wfo, year: event.year, phenomena: phen, significance: event.significance, etn: event.eventId
      });
      var gj = fetchJsonWithRetry_(url, 2);
      var features = (gj && gj.features) || [];
      if (features.length) footprintSuccess = true;
      for (var f = 0; f < features.length; f++) {
        var ft = features[f] || {};
        var ugc = normalizeUgc_(ft.id || (ft.properties && (ft.properties.ugc || ft.properties.nws_ugc)) || '');
        if (!ugc) continue;
        featureUgcs[ugc] = true;
      }
    } catch (err) {
      log_('enrichEventFootprint_', 'Footprint fetch failed for ' + event.eventKey + ' ' + phen + ': ' + err);
    }
  }

  var windowsByUgc = {};
  for (var i = 0; i < rowWindows.length; i++) {
    var rw = rowWindows[i];
    if (!windowsByUgc[rw.ugc]) windowsByUgc[rw.ugc] = [];
    windowsByUgc[rw.ugc].push(rw);
  }

  Object.keys(featureUgcs).forEach(function(ugc) {
    if (!windowsByUgc[ugc]) {
      windowsByUgc[ugc] = [{
        ugc: ugc, start: event.issue, end: event.expire, action: '', source: 'IEM event GeoJSON + event-wide timing fallback'
      }];
    }
  });

  var allUgcs = Object.keys(windowsByUgc).sort();
  var source = footprintSuccess ? 'IEM VTEC event GeoJSON' : 'IEM event-row UGC fallback';
  var timingMode = rowWindows.length ? 'UGC-specific when exposed; event-wide fallback for missing UGC timing' : 'event-wide timing fallback';

  if (!allUgcs.length) {
    source = 'Unresolved footprint (no station verification)';
    timingMode = 'Unresolved footprint';
  }

  var areas = [];
  allUgcs.forEach(function(ugc) {
    var wins = windowsByUgc[ugc] || [];
    for (var j = 0; j < wins.length; j++) {
      areas.push({
        ugc: ugc,
        start: wins[j].start || event.issue,
        end: wins[j].end || event.expire,
        action: wins[j].action || '',
        geometryJson: '', // Geometry is fetched on demand for the web UI; never store large polygons in Sheets.
        source: wins[j].source || source
      });
    }
  });

  event.warnedUgcs = allUgcs;
  event.areas = areas;
  event.footprintSource = source;
  event.areaTimingMode = timingMode;
}

function extractAreaWindowsFromRows_(rows, defaultStart, defaultEnd) {
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var e = rows[i] || {};
    var ugcs = extractUgcs_(e);
    if (!ugcs.length) continue;
    var start = parseDateSafe_(e.issue || e.issued || e.init_issue || e.init_iss) || defaultStart;
    var end = parseDateSafe_(e.expire || e.expired || e.init_expire || e.init_exp) || defaultEnd;
    var action = String(e.action || e.status || '').trim().toUpperCase();
    for (var u = 0; u < ugcs.length; u++) {
      out.push({ ugc: ugcs[u], start: start, end: end, action: action, source: 'IEM event-row UGC timing' });
    }
  }
  return out;
}

function extractUgcs_(obj) {
  var candidates = [obj.ugcs, obj.ugc, obj.nws_ugc, obj.nws_ugcs, obj.zones, obj.zone];
  var found = {};
  for (var i = 0; i < candidates.length; i++) {
    var v = candidates[i];
    if (v == null) continue;
    var parts = Array.isArray(v) ? v : String(v).split(/[\s,;]+/);
    for (var j = 0; j < parts.length; j++) {
      var ugc = normalizeUgc_(parts[j]);
      if (ugc) found[ugc] = true;
    }
  }
  return Object.keys(found).sort();
}

function normalizeUgc_(value) {
  var s = String(value || '').trim().toUpperCase();
  // Canonical NWS UGC forms, e.g. LAZ079, LAC051, MSZ087, GMZ570.
  var m = s.match(/^([A-Z]{2}[CZ]\d{3})$/);
  if (m) return m[1];

  // Synoptic station metadata commonly returns public forecast zones without
  // the UGC type letter, e.g. LA079 or MS087.  These are forecast zones, so
  // canonicalize them to LAZ079 / MSZ087 before matching warning UGCs.
  var bareZone = s.match(/^([A-Z]{2})(\d{3})$/);
  if (bareZone) return bareZone[1] + 'Z' + bareZone[2];

  return '';
}

function getHazardFromIem_(phenomena, significance) {
  var keys = Object.keys(HAZARD_META);
  for (var i = 0; i < keys.length; i++) {
    var hazard = keys[i];
    var meta = HAZARD_META[hazard];
    if (meta.significance === significance && meta.iemPhenomena.indexOf(phenomena) !== -1) return hazard;
  }
  return '';
}

function resolveProductLabel_(hazard, phenoms) {
  if (hazard === 'EC') {
    var hasEC = !!phenoms.EC;
    var hasWC = !!phenoms.WC;
    if (hasEC && hasWC) return 'Extreme Cold / Wind Chill Warning';
    if (hasEC) return 'Extreme Cold Warning';
    if (hasWC) return 'Wind Chill Warning';
  }
  if (hazard === 'EH') {
    var hasEH = !!phenoms.EH;
    var hasXH = !!phenoms.XH;
    if (hasEH && hasXH) return 'Excessive / Extreme Heat Warning';
    if (hasXH) return 'Extreme Heat Warning';
    if (hasEH) return 'Excessive Heat Warning';
  }
  return HAZARD_META[hazard] ? HAZARD_META[hazard].label : hazard;
}

function eventToRow_(e) {
  return [
    e.eventKey,e.year,e.wfo,e.eventId,e.hazard,e.phenomena,e.significance,e.productLabel,e.issueUtc,e.expireUtc,
    (e.warnedUgcs || []).join(','),e.footprintSource,e.areaTimingMode,e.dataComplete===false?'FALSE':'TRUE',e.runNote||'',toIsoMinute_(new Date())
  ];
}

function eventAreaToRow_(event, a) {
  return [event.eventKey,a.ugc,toIsoMinute_(a.start),toIsoMinute_(a.end),a.action || '',a.geometryJson || '',a.source || event.footprintSource];
}

/** ===== Station metadata ===== */
function fetchStations() {
  return withWriteLock_(fetchStationsUnlocked_);
}

function fetchStationsUnlocked_() {
  var cfg = readConfig_();
  log_('fetchStations', 'Starting station metadata pull for CWA=' + cfg._cwa);
  var url = buildUrl_('https://api.synopticdata.com/v2/stations/metadata', {
    token: cfg._token, cwa: cfg._cwa, complete: 1, vars: cfg._vars, varsoperator: 'or'
  });
  var data = fetchJsonWithRetry_(url, 3);
  var stations = data.STATION || [];
  var ws = prepareSheet_('Stations', STATION_HEADERS, false);
  var out = [];
  for (var i = 0; i < stations.length; i++) {
    var st = stations[i] || {};
    out.push([
      st.STID || '',st.NAME || '',st.STATE || '',st.COUNTY || '',st.CWA || '',normalizeUgc_(st.NWSZONE) || st.NWSZONE || '',
      st.LATITUDE == null ? '' : st.LATITUDE,st.LONGITUDE == null ? '' : st.LONGITUDE,st.ELEVATION == null ? '' : st.ELEVATION,st.MNET_ID || '',st.STATUS || '',st.TIMEZONE || ''
    ]);
  }
  var writeData = [STATION_HEADERS].concat(out);
  writeSheetDataChunked_(ws,writeData,STATION_HEADERS.length,1000);
  ws.setFrozenRows(1);
  log_('fetchStations', 'Wrote ' + out.length + ' stations.');
}

function getStationMetadata_() {
  var ws = sh_('Stations');
  if (!ws) throw new Error('Stations sheet not found.');
  var rows = ws.getDataRange().getValues();
  if (rows.length < 2) throw new Error('Stations sheet is empty. Run Fetch Stations first.');
  return rows;
}

/** ===== Observation processing ===== */
function computeEventObservationsInMemory_(cfg, event, thresholdMaps, stationRows) {
  var selected = [];
  var stationById = {};
  var warnedSet = {};
  (event.warnedUgcs || []).forEach(function(u) { warnedSet[u] = true; });

  for (var i = 1; i < stationRows.length; i++) {
    var stid = String(stationRows[i][0] || '').trim();
    var name = String(stationRows[i][1] || '').trim();
    var state = String(stationRows[i][2] || '').trim().toUpperCase();
    var county = String(stationRows[i][3] || '').trim();
    var cwa = String(stationRows[i][4] || '').trim().toUpperCase();
    var nwszone = normalizeUgc_(stationRows[i][5]);
    var lat = toFinite_(stationRows[i][6]);
    var lon = toFinite_(stationRows[i][7]);
    var elevation = toFinite_(stationRows[i][8]);
    var mnetId = String(stationRows[i][9] || '').trim();
    var status = String(stationRows[i][10] || '').trim().toUpperCase();

    if (!stid || !state || !county || cwa !== cfg._cwa) continue;
    // No CWA-wide substitution when the warned footprint cannot be resolved.
    if (!nwszone || !warnedSet[nwszone]) continue;

    var rules = lookupRulesForArea_(thresholdMaps, event.hazard, state, county, nwszone);
    if (!rules) continue;
    var windows = getAreaWindowsForStation_(event, nwszone);
    var tier = classifyStationTier_(mnetId, event.hazard, cfg);
    var meta = {
      STID: stid, NAME: name, STATE: state, COUNTY: county, NWSZONE: nwszone,
      LATITUDE: lat, LONGITUDE: lon, ELEVATION_FT: elevation, MNET_ID: mnetId,
      NETWORK_NAME: networkName_(mnetId), NETWORK_TIER: tier, STATUS: status,
      rules: rules, windows: windows, areaUgc: nwszone || ''
    };
    selected.push(meta);
    stationById[stid] = meta;
  }

  if (!selected.length) return { summaryRows: [], sampleRows: [], fetchErrors: 0 };

  var agg = {};
  var sampleRows = [];
  var fetchErrors = 0;
  for (var si = 0; si < selected.length; si++) {
    var sm = selected[si];
    var key = event.eventKey + '|' + sm.STID;
    agg[key] = newStationAggregate_(event, sm, cfg);
  }

  var stids = selected.map(function(x) { return x.STID; });
  var chunkSize = 60;
  for (var s = 0; s < stids.length; s += chunkSize) {
    var chunk = stids.slice(s, s + chunkSize);
    var url = buildUrl_('https://api.synopticdata.com/v2/stations/timeseries', {
      token: cfg._token,
      stid: chunk.join(','),
      start: fmtYmdHm_(event.issue),
      end: fmtYmdHm_(event.expire),
      vars: cfg._vars,
      varsoperator: 'or',
      units: cfg._units,
      complete: 1,
      qc: 'on',
      qc_checks: cfg._qcChecks,
      qc_remove_data: cfg._qcRemove,
      qc_flags: 'on'
    });

    try {
      var data = fetchJsonWithRetry_(url, 3);
      var stations = data.STATION || [];
      for (var j = 0; j < stations.length; j++) {
        var st = stations[j] || {};
        var meta = stationById[String(st.STID || '').trim()];
        if (!meta) continue;
        var rowAgg = agg[event.eventKey + '|' + meta.STID];
        var obs = st.OBSERVATIONS || {};
        var dt = obs.date_time || [];
        if (!dt.length) continue;

        var tempKey = findObsKey_(obs, 'air_temp');
        var windKey = findObsKey_(obs, 'wind_speed');
        var gustKey = findObsKey_(obs, 'wind_gust');
        var rhKey = findObsKey_(obs, 'relative_humidity');
        var dewKey = findObsKey_(obs, 'dew_point_temperature');
        var temps = tempKey ? obs[tempKey] : [];
        var winds = windKey ? obs[windKey] : [];
        var gusts = gustKey ? obs[gustKey] : [];
        var rhs = rhKey ? obs[rhKey] : [];
        var dews = dewKey ? obs[dewKey] : [];

        for (var k = 0; k < dt.length; k++) {
          var when = String(dt[k] || '');
          var whenDate = parseDateSafe_(when);
          if (!isValidDate_(whenDate) || !isTimeActiveForStation_(meta.windows, whenDate)) continue;

          var tempF = validRange_(toFinite_(temps[k]), -80, 140);
          var windMph = validRange_(toFinite_(winds[k]), 0, 200);
          var gustMph = validRange_(toFinite_(gusts[k]), 0, 250);
          var rhPct = validRange_(toFinite_(rhs[k]), 0, 100);
          var dewF = validRange_(toFinite_(dews[k]), -120, 120);
          if (dewF === null && tempF !== null && rhPct !== null && rhPct > 0) dewF = computeDewpointF_(tempF, rhPct);

          var wc = (tempF !== null && windMph !== null) ? computeWindChillF_(tempF, windMph) : null;
          var hi = (tempF !== null && rhPct !== null) ? computeHeatIndexF_(tempF, rhPct) : null;
          if (wc !== null) wc = round_(wc, 1);
          if (hi !== null) hi = round_(hi, 1);

          var flags = evaluateSampleCriteria_(event.hazard, meta.rules, tempF, wc, hi, rhPct, windMph, gustMph, cfg);
          var hasAny = [tempF,windMph,gustMph,rhPct,dewF,hi,wc].some(function(v) { return v !== null; });
          if (!hasAny) continue;

          updateStationAggregate_(rowAgg, when, whenDate.getTime(), tempF, wc, hi, rhPct, dewF, windMph, gustMph, flags, cfg);
          sampleRows.push([
            event.eventKey,meta.areaUgc,meta.STID,when,
            tempF,rhPct,dewF,windMph,gustMph,hi,wc,
            flags.tempMet ? 'TRUE' : 'FALSE',flags.wcMet ? 'TRUE' : 'FALSE',flags.hiMet ? 'TRUE' : 'FALSE',flags.rfwMet ? 'TRUE' : 'FALSE'
          ]);
        }
      }
    } catch (err) {
      fetchErrors++;
      log_('computeEventObservationsInMemory_', 'Timeseries fetch failed for chunk: ' + err);
      Object.keys(agg).forEach(function(key) {
        if (chunk.indexOf(agg[key].STID) !== -1) agg[key]._fetchError = true;
      });
    }
  }

  var summaryRows = [];
  Object.keys(agg).forEach(function(key) {
    finalizeAggregate_(agg[key], cfg);
    summaryRows.push(aggregateToRow_(agg[key]));
  });
  return { summaryRows: summaryRows, sampleRows: sampleRows, fetchErrors: fetchErrors };
}

function newStationAggregate_(event, meta, cfg) {
  return {
    EVENT_KEY:event.eventKey, EVENT_YEAR:event.year, EVENT_ID:event.eventId, HAZARD:event.hazard, PHENOMENA:event.phenomena,
    SIGNIFICANCE:event.significance, PRODUCT_LABEL:event.productLabel, ISSUE_UTC:event.issueUtc, EXPIRE_UTC:event.expireUtc,
    AREA_UGC:meta.areaUgc, STATE:meta.STATE, COUNTY:meta.COUNTY, NWSZONE:meta.NWSZONE, STID:meta.STID, NAME:meta.NAME,
    LATITUDE:meta.LATITUDE, LONGITUDE:meta.LONGITUDE, ELEVATION_FT:meta.ELEVATION_FT, MNET_ID:meta.MNET_ID,
    NETWORK_NAME:meta.NETWORK_NAME, NETWORK_TIER:meta.NETWORK_TIER, rules:meta.rules, windows:meta.windows,
    OBS_COUNT:0, FIRST_OBS_UTC:'', LAST_OBS_UTC:'', DATA_COVERAGE_PCT:0, QC_POLICY:cfg._qcRemove, FETCH_ERROR:'FALSE',
    MIN_TEMP_F:null, MIN_TEMP_TIME_UTC:'', MIN_WINDCHILL_F:null, MIN_WINDCHILL_TIME_UTC:'',
    MAX_TEMP_F:null, MAX_TEMP_TIME_UTC:'', MAX_HEAT_INDEX_F:null, MAX_HEAT_INDEX_TIME_UTC:'', HI_TEMP_F:null, HI_RH_PCT:null, HI_DEWPOINT_F:null,
    MIN_RH_PCT:null, MIN_RH_TIME_UTC:'', MAX_WIND_MPH:null, MAX_WIND_TIME_UTC:'', MAX_GUST_MPH:null, MAX_GUST_TIME_UTC:'',
    RFW_VERIFY_TIME_UTC:'', RFW_VERIFY_RH_PCT:null, RFW_VERIFY_WIND_MPH:null, RFW_VERIFY_GUST_MPH:null,
    TEMP_CRITERIA_MAX_CONTINUOUS_MIN:0, WINDCHILL_CRITERIA_MAX_CONTINUOUS_MIN:0, HEAT_INDEX_CRITERIA_MAX_CONTINUOUS_MIN:0, RFW_CRITERIA_MAX_CONTINUOUS_MIN:0,
    TEMP_CRITERIA_CUMULATIVE_MIN:0, WINDCHILL_CRITERIA_CUMULATIVE_MIN:0, HEAT_INDEX_CRITERIA_CUMULATIVE_MIN:0, RFW_CRITERIA_CUMULATIVE_MIN:0,
    _times:[], _criteria:[], _fetchError:false
  };
}

function updateStationAggregate_(a, when, ms, tempF, wc, hi, rhPct, dewF, windMph, gustMph, flags, cfg) {
  a.OBS_COUNT++;
  a._times.push(ms);
  a._criteria.push({ ms:ms, temp:flags.tempMet, wc:flags.wcMet, hi:flags.hiMet, rfw:flags.rfwMet });
  if (!a.FIRST_OBS_UTC || when < a.FIRST_OBS_UTC) a.FIRST_OBS_UTC = when;
  if (!a.LAST_OBS_UTC || when > a.LAST_OBS_UTC) a.LAST_OBS_UTC = when;

  if (tempF !== null) {
    if (a.MIN_TEMP_F === null || tempF < a.MIN_TEMP_F) { a.MIN_TEMP_F=tempF; a.MIN_TEMP_TIME_UTC=when; }
    if (a.MAX_TEMP_F === null || tempF > a.MAX_TEMP_F) { a.MAX_TEMP_F=tempF; a.MAX_TEMP_TIME_UTC=when; }
  }
  if (wc !== null && (a.MIN_WINDCHILL_F === null || wc < a.MIN_WINDCHILL_F)) { a.MIN_WINDCHILL_F=wc; a.MIN_WINDCHILL_TIME_UTC=when; }
  if (hi !== null && (a.MAX_HEAT_INDEX_F === null || hi > a.MAX_HEAT_INDEX_F)) {
    a.MAX_HEAT_INDEX_F=hi; a.MAX_HEAT_INDEX_TIME_UTC=when; a.HI_TEMP_F=tempF; a.HI_RH_PCT=rhPct; a.HI_DEWPOINT_F=dewF;
  }
  if (rhPct !== null && (a.MIN_RH_PCT === null || rhPct < a.MIN_RH_PCT)) { a.MIN_RH_PCT=rhPct; a.MIN_RH_TIME_UTC=when; }
  if (windMph !== null && (a.MAX_WIND_MPH === null || windMph > a.MAX_WIND_MPH)) { a.MAX_WIND_MPH=windMph; a.MAX_WIND_TIME_UTC=when; }
  if (gustMph !== null && (a.MAX_GUST_MPH === null || gustMph > a.MAX_GUST_MPH)) { a.MAX_GUST_MPH=gustMph; a.MAX_GUST_TIME_UTC=when; }
  if (flags.rfwMet && !a.RFW_VERIFY_TIME_UTC) {
    a.RFW_VERIFY_TIME_UTC=when; a.RFW_VERIFY_RH_PCT=rhPct; a.RFW_VERIFY_WIND_MPH=windMph; a.RFW_VERIFY_GUST_MPH=gustMph;
  }
}

function finalizeAggregate_(a, cfg) {
  a.FETCH_ERROR = a._fetchError ? 'TRUE' : 'FALSE';
  a._times.sort(function(x,y){return x-y;});
  var durationMs = activeWindowDurationMs_(a.windows);
  a.DATA_COVERAGE_PCT = round_(coveragePct_(a._times, durationMs, cfg._durationMaxGapMinutes, a.windows), 1);

  var tempRun = computeRunStats_(a._criteria, 'temp', cfg._durationMaxGapMinutes, a.windows);
  var wcRun = computeRunStats_(a._criteria, 'wc', cfg._durationMaxGapMinutes, a.windows);
  var hiRun = computeRunStats_(a._criteria, 'hi', cfg._durationMaxGapMinutes, a.windows);
  var rfwRun = computeRunStats_(a._criteria, 'rfw', cfg._durationMaxGapMinutes, a.windows);
  a.TEMP_CRITERIA_MAX_CONTINUOUS_MIN=tempRun.maxContinuousMin;
  a.WINDCHILL_CRITERIA_MAX_CONTINUOUS_MIN=wcRun.maxContinuousMin;
  a.HEAT_INDEX_CRITERIA_MAX_CONTINUOUS_MIN=hiRun.maxContinuousMin;
  a.RFW_CRITERIA_MAX_CONTINUOUS_MIN=rfwRun.maxContinuousMin;
  a.TEMP_CRITERIA_CUMULATIVE_MIN=tempRun.cumulativeMin;
  a.WINDCHILL_CRITERIA_CUMULATIVE_MIN=wcRun.cumulativeMin;
  a.HEAT_INDEX_CRITERIA_CUMULATIVE_MIN=hiRun.cumulativeMin;
  a.RFW_CRITERIA_CUMULATIVE_MIN=rfwRun.cumulativeMin;
}

function aggregateToRow_(a) {
  return EVENT_OBS_HEADERS.map(function(h) { return a[h] == null ? '' : a[h]; });
}

function evaluateSampleCriteria_(hazard, rules, tempF, wc, hi, rhPct, windMph, gustMph, cfg) {
  var tempRule = rules.TEMP_F || null;
  var wcRule = rules.WIND_CHILL_F || tempRule || null;
  var hiRule = rules.HEAT_INDEX_F || null;
  var rhRule = rules.RH_PCT || null;
  var windRule = rules.WIND_MPH || null;
  var windForRfw = cfg._rfwWindBasis === 'gust' ? gustMph : windMph;
  return {
    tempMet: tempRule ? compare_(tempF, tempRule.threshold, tempRule.comparator) : false,
    wcMet: wcRule ? compare_(wc, wcRule.threshold, wcRule.comparator) : false,
    hiMet: hiRule ? compare_(hi, hiRule.threshold, hiRule.comparator) : false,
    rfwMet: (hazard === 'RFW' && rhRule && windRule) ?
      compare_(rhPct, rhRule.threshold, rhRule.comparator) && compare_(windForRfw, windRule.threshold, windRule.comparator) : false
  };
}

function getAreaWindowsForStation_(event, nwszone) {
  var exact = [];
  for (var i = 0; i < (event.areas || []).length; i++) {
    var a = event.areas[i];
    if (nwszone && a.ugc === nwszone) exact.push({ start:a.start, end:a.end });
  }
  if (exact.length) return exact;
  return [];
}

function isTimeActiveForStation_(windows, when) {
  var t = when.getTime();
  for (var i = 0; i < windows.length; i++) {
    var s = windows[i].start.getTime(), e = windows[i].end.getTime();
    if (t >= s && t <= e) return true;
  }
  return false;
}

function activeWindowDurationMs_(windows) {
  var intervals = (windows || []).map(function(w){ return [w.start.getTime(),w.end.getTime()]; }).sort(function(a,b){return a[0]-b[0];});
  if (!intervals.length) return 0;
  var total=0, cs=intervals[0][0], ce=intervals[0][1];
  for (var i=1;i<intervals.length;i++) {
    if (intervals[i][0] <= ce) ce=Math.max(ce,intervals[i][1]);
    else { total += Math.max(0,ce-cs); cs=intervals[i][0]; ce=intervals[i][1]; }
  }
  total += Math.max(0,ce-cs);
  return total;
}

function coveragePct_(times, activeDurationMs, maxGapMin, windows) {
  if (!times.length || activeDurationMs <= 0) return 0;
  if (times.length === 1) return 0;
  var maxGapMs = maxGapMin * 60000;
  var covered = 0;
  for (var i=1;i<times.length;i++) {
    var gap = times[i]-times[i-1];
    if (gap > 0 && gap <= maxGapMs && intervalActive_(times[i-1],times[i],windows)) covered += gap;
  }
  return Math.min(100, 100 * covered / activeDurationMs);
}

function computeRunStats_(criteria, field, maxGapMin, windows) {
  if (!criteria || !criteria.length) return {maxContinuousMin:0,cumulativeMin:0};
  var arr = criteria.slice().sort(function(a,b){return a.ms-b.ms;});
  var maxGapMs = maxGapMin * 60000;
  var runStart = null, prev = null, maxSpan = 0, cumulative = 0;
  for (var i=0;i<arr.length;i++) {
    var cur = arr[i];
    var met = !!cur[field];
    if (!met) { runStart=null; prev=null; continue; }
    if (runStart === null) { runStart=cur.ms; prev=cur.ms; continue; }
    var gap = cur.ms-prev;
    if (gap === 0) continue; // A duplicate timestamp must not reset a valid run.
    if (gap < 0 || gap > maxGapMs || !intervalActive_(prev,cur.ms,windows)) { runStart=cur.ms; prev=cur.ms; continue; }
    cumulative += gap;
    prev = cur.ms;
    maxSpan = Math.max(maxSpan, cur.ms-runStart);
  }
  return { maxContinuousMin:round_(maxSpan/60000,1), cumulativeMin:round_(cumulative/60000,1) };
}

/** ===== Thresholds / rule precedence ===== */
function buildThresholdMaps_() {
  var maps = { area:{}, zone:{} };
  var ws = sh_('Thresholds');
  if (ws) {
    var rows = ws.getDataRange().getValues();
    for (var r=1;r<rows.length;r++) addRuleRow_(maps.area, rows[r], false);
  }
  var zws = sh_('ZoneOverrides');
  if (zws) {
    var zrows = zws.getDataRange().getValues();
    for (var z=1;z<zrows.length;z++) addRuleRow_(maps.zone, zrows[z], true);
  }
  return maps;
}

function addRuleRow_(target, row, isZone) {
  var hazard=String(row[0]||'').trim().toUpperCase();
  var state=String(row[1]||'').trim().toUpperCase();
  var area=String(row[2]||'').trim();
  var parameter=String(row[3]||'').trim().toUpperCase();
  var threshold=toFinite_(row[4]);
  var comparator=normalizeComparator_(row[5]);
  var durationHours=toFinite_(row[6]);
  if (!hazard || !state || !area || !parameter || threshold===null || !comparator) return;
  var key = isZone ? hazard+'|'+state+'|'+normalizeUgc_(area) : hazard+'|'+state+'|'+normalizeAreaKey_(area);
  if (!target[key]) target[key]={};
  target[key][parameter]={ threshold:threshold, comparator:comparator, durationHours:durationHours };
}

function lookupRulesForArea_(maps, hazard, state, county, zone) {
  var out={};
  var allKey=hazard+'|'+state+'|ALL';
  var countyKey=hazard+'|'+state+'|'+normalizeAreaKey_(county);
  var zoneKey=hazard+'|'+state+'|'+String(zone||'').trim().toUpperCase();
  if (maps.area[allKey]) mergeRuleMaps_(out,maps.area[allKey]);
  if (maps.area[countyKey]) mergeRuleMaps_(out,maps.area[countyKey]);
  if (zone && maps.zone[zoneKey]) mergeRuleMaps_(out,maps.zone[zoneKey]);
  return Object.keys(out).length ? out : null;
}

function mergeRuleMaps_(target,source) { Object.keys(source||{}).forEach(function(k){target[k]=source[k];}); }
function normalizeAreaKey_(value) {
  var txt=String(value||'').trim();
  if (!txt) return '';
  if (txt.toUpperCase()==='ALL') return 'ALL';
  return normCounty_(txt);
}

/** ===== Results and area verification ===== */
function buildResults() {
  return withWriteLock_(buildResultsUnlocked_);
}

function buildResultsUnlocked_() {
  validateRuntimeSchema_();
  var thresholdMaps=buildThresholdMaps_();
  var cfg=readConfig_();
  var tmp=sh_('_EventObs');
  if (!tmp) throw new Error('No _EventObs sheet found. Run verification first.');
  var rows=tmp.getDataRange().getValues();
  var res=prepareSheet_('Results',RESULT_HEADERS,false);
  if (rows.length<2) {
    writeSheetDataChunked_(res,[RESULT_HEADERS],RESULT_HEADERS.length,750);
    buildAreaVerification_();
    return 'No event observation rows to process.';
  }
  var headers=rows[0].map(String);
  var out=[];
  for (var r=1;r<rows.length;r++) {
    var obj=rowToObject_(headers,rows[r]);
    numericizeEventObs_(obj);
    var rules=lookupRulesForArea_(thresholdMaps,String(obj.HAZARD||'').toUpperCase(),String(obj.STATE||'').toUpperCase(),obj.COUNTY,obj.NWSZONE);
    var evalResult=evaluateStation_(obj,rules,cfg);
    var base=EVENT_OBS_HEADERS.map(function(h){return obj[h]==null?'':obj[h];});
    out.push(base.concat([evalResult.thresholdSummary,evalResult.status,evalResult.status==='MET'?'TRUE':'FALSE',evalResult.exceededBy,evalResult.confidence,evalResult.notes]));
  }
  var write=[RESULT_HEADERS].concat(out);
  writeSheetDataChunked_(res, write, RESULT_HEADERS.length, 750);
  res.setFrozenRows(1);
  buildAreaVerification_();
  log_('buildResults','Results table built: '+out.length+' rows.');
  return 'Results rebuilt: '+out.length+' rows.';
}

function evaluateStation_(row,rules,cfg) {
  if (!rules) return resultEval_('INDETERMINATE','', '', 'LOW','No applicable threshold rule.');
  var count=Number(row.OBS_COUNT||0);
  if (!count) return resultEval_('NO_DATA',thresholdSummaryFor_(row.HAZARD,rules,cfg),'','LOW',String(row.FETCH_ERROR||'').toUpperCase()==='TRUE'?'Observation fetch failed for this station chunk.':'No usable observations inside active warned window.');

  var enoughCoverage=Number(row.DATA_COVERAGE_PCT||0) >= cfg._minCoveragePct;
  var hazard=String(row.HAZARD||'').toUpperCase();
  var exceededBy='';
  var met=false;

  if (hazard==='EC') {
    var tr=rules.TEMP_F||null;
    var wr=rules.WIND_CHILL_F||tr||null;
    var byT=tr ? compare_(row.MIN_TEMP_F,tr.threshold,tr.comparator) && durationSatisfied_(row.TEMP_CRITERIA_MAX_CONTINUOUS_MIN,tr) : false;
    var byW=wr ? compare_(row.MIN_WINDCHILL_F,wr.threshold,wr.comparator) && durationSatisfied_(row.WINDCHILL_CRITERIA_MAX_CONTINUOUS_MIN,wr) : false;
    met=byT||byW; exceededBy=byT&&byW?'BOTH':byT?'TEMP':byW?'WINDCHILL':'';
  } else if (hazard==='EH') {
    var hr=rules.HEAT_INDEX_F||null;
    var et=rules.TEMP_F||null;
    var byH=hr ? compare_(row.MAX_HEAT_INDEX_F,hr.threshold,hr.comparator) && durationSatisfied_(row.HEAT_INDEX_CRITERIA_MAX_CONTINUOUS_MIN,hr) : false;
    var byET=et ? compare_(row.MAX_TEMP_F,et.threshold,et.comparator) && durationSatisfied_(row.TEMP_CRITERIA_MAX_CONTINUOUS_MIN,et) : false;
    met=byH||byET; exceededBy=byH&&byET?'BOTH':byH?'HEAT_INDEX':byET?'TEMP':'';
  } else if (hazard==='RFW') {
    var rr=rules.RH_PCT||null, rw=rules.WIND_MPH||null;
    var reqMin=Math.max(ruleDurationMinutes_(rr),ruleDurationMinutes_(rw));
    met=!!row.RFW_VERIFY_TIME_UTC && (reqMin<=0 || Number(row.RFW_CRITERIA_MAX_CONTINUOUS_MIN||0)>=reqMin);
    exceededBy=met?'RH_AND_'+(cfg._rfwWindBasis==='gust'?'GUST':'WIND'):'';
  }

  // Aggregate coverage is not variable-specific. At minimum require all metrics
  // used by the configured alternatives before asserting a negative result.
  var requiredMetrics = hazard==='EH' ? [rules.TEMP_F ? row.MAX_TEMP_F : 0,rules.HEAT_INDEX_F ? row.MAX_HEAT_INDEX_F : 0] :
    hazard==='EC' ? [rules.TEMP_F ? row.MIN_TEMP_F : 0,(rules.WIND_CHILL_F||rules.TEMP_F) ? row.MIN_WINDCHILL_F : 0] :
    [row.MIN_RH_PCT,cfg._rfwWindBasis==='gust' ? row.MAX_GUST_MPH : row.MAX_WIND_MPH];
  var missingMetrics = requiredMetrics.some(function(v){return toFinite_(v)===null;});
  var fetchFailed = String(row.FETCH_ERROR||'').toUpperCase()==='TRUE';
  var status=met?'MET':(enoughCoverage&&!missingMetrics&&!fetchFailed?'NOT_MET':'INDETERMINATE');
  var confidence=stationConfidence_(row,status,cfg);
  var notes='';
  if (hazard==='RFW') notes='Meteorological criteria only; full Red Flag verification also depends on fuels/land-manager context.';
  if (!enoughCoverage && !met) notes+=(notes?' ':'')+'Insufficient observational coverage for a confident non-verification.';
  if (missingMetrics&&!met) notes+=(notes?' ':'')+'Required hazard metrics are missing.';
  if (fetchFailed) notes+=(notes?' ':'')+'Observation fetch was incomplete.';
  return resultEval_(status,thresholdSummaryFor_(hazard,rules,cfg),exceededBy,confidence,notes);
}

function resultEval_(status,summary,by,confidence,notes) {
  return {status:status,thresholdSummary:summary||'',exceededBy:by||'',confidence:confidence||'LOW',notes:notes||''};
}

function thresholdSummaryFor_(hazard,rules,cfg) {
  var parts=[];
  if (hazard==='EC') {
    if (rules.TEMP_F) parts.push(ruleText_('TEMP',rules.TEMP_F));
    if (rules.WIND_CHILL_F) parts.push(ruleText_('WIND CHILL',rules.WIND_CHILL_F));
    else if (rules.TEMP_F) parts.push(ruleText_('WIND CHILL',rules.TEMP_F));
    return parts.join(' OR ');
  }
  if (hazard==='EH') {
    if (rules.HEAT_INDEX_F) parts.push(ruleText_('HEAT INDEX',rules.HEAT_INDEX_F));
    if (rules.TEMP_F) parts.push(ruleText_('TEMP',rules.TEMP_F));
    return parts.join(' OR ');
  }
  if (hazard==='RFW') {
    if (rules.RH_PCT) parts.push(ruleText_('RH',rules.RH_PCT));
    if (rules.WIND_MPH) parts.push(ruleText_(cfg._rfwWindBasis==='gust'?'GUST':'SUSTAINED WIND',rules.WIND_MPH));
    return parts.join(' AND ');
  }
  return '';
}

function ruleText_(label,rule) {
  if (!rule) return '';
  var txt=label+' '+rule.comparator+' '+rule.threshold;
  if (ruleDurationMinutes_(rule)>0) txt+=' for ≥'+formatMinutesHuman_(ruleDurationMinutes_(rule));
  return txt;
}
function ruleDurationMinutes_(rule){return rule&&isFinite(rule.durationHours)&&Number(rule.durationHours)>0?Number(rule.durationHours)*60:0;}
function durationSatisfied_(observedMin,rule){var req=ruleDurationMinutes_(rule);return req<=0||Number(observedMin||0)>=req;}

function stationConfidence_(row,status,cfg) {
  var tier=String(row.NETWORK_TIER||'C').toUpperCase();
  var cov=Number(row.DATA_COVERAGE_PCT||0);
  if (status==='NO_DATA') return 'LOW';
  if (String(row.QC_POLICY||'').toLowerCase()!=='on' || String(row.FETCH_ERROR||'').toUpperCase()==='TRUE') return 'LOW';
  if (tier==='A' && cov>=70) return 'HIGH';
  if ((tier==='A'||tier==='B') && cov>=40) return 'MEDIUM';
  return 'LOW';
}

function buildAreaVerification_() {
  var resultsWs=sh_('Results');
  var areasWs=sh_('EventAreas');
  var eventsWs=sh_('Events');
  var outWs=prepareSheet_('AreaVerification',AREA_VERIFY_HEADERS,false);
  if (!eventsWs || !areasWs) { outWs.getRange(1,1,1,AREA_VERIFY_HEADERS.length).setValues([AREA_VERIFY_HEADERS]); return; }

  var eventObjs=sheetObjects_(eventsWs);
  var areaObjs=sheetObjects_(areasWs);
  var resultObjs=resultsWs ? sheetObjects_(resultsWs) : [];
  var eventMap={}; eventObjs.forEach(function(e){eventMap[e.EVENT_KEY]=e;});
  var byArea={};

  areaObjs.forEach(function(a){
    var key=a.EVENT_KEY+'|'+a.UGC;
    if (!byArea[key]) byArea[key]={eventKey:a.EVENT_KEY,ugc:a.UGC,rows:[]};
  });
  resultObjs.forEach(function(r){
    var ugc=String(r.AREA_UGC||r.NWSZONE||'');
    var key=r.EVENT_KEY+'|'+ugc;
    if (!byArea[key]) byArea[key]={eventKey:r.EVENT_KEY,ugc:ugc,rows:[]};
    byArea[key].rows.push(r);
  });

  var out=[];
  Object.keys(byArea).forEach(function(key){
    var group=byArea[key], ev=eventMap[group.eventKey]||{}, rows=group.rows;
    var counts={MET:0,NOT_MET:0,INDETERMINATE:0,NO_DATA:0}, usable=0,tierA=0,covSum=0,covN=0;
    var bySet={}, areaLabels={};
    var ex={worstTemp:null,worstWc:null,hotTemp:null,hotHi:null,lowRh:null,highWind:null,highGust:null,firstVerify:''};
    rows.forEach(function(r){
      var st=String(r.VERIFY_STATUS||'INDETERMINATE'); counts[st]=(counts[st]||0)+1;
      if (st!=='NO_DATA') usable++;
      if (String(r.NETWORK_TIER||'').toUpperCase()==='A') tierA++;
      var cv=toFinite_(r.DATA_COVERAGE_PCT); if (cv!==null){covSum+=cv;covN++;}
      if (r.EXCEEDED_BY) bySet[String(r.EXCEEDED_BY)]=true;
      if (r.COUNTY) areaLabels[String(r.COUNTY)]=true;
      ex.worstTemp=minFinite_(ex.worstTemp,r.MIN_TEMP_F); ex.worstWc=minFinite_(ex.worstWc,r.MIN_WINDCHILL_F);
      ex.hotTemp=maxFinite_(ex.hotTemp,r.MAX_TEMP_F); ex.hotHi=maxFinite_(ex.hotHi,r.MAX_HEAT_INDEX_F);
      ex.lowRh=minFinite_(ex.lowRh,r.MIN_RH_PCT); ex.highWind=maxFinite_(ex.highWind,r.MAX_WIND_MPH); ex.highGust=maxFinite_(ex.highGust,r.MAX_GUST_MPH);
      if (r.RFW_VERIFY_TIME_UTC && (!ex.firstVerify || String(r.RFW_VERIFY_TIME_UTC)<ex.firstVerify)) ex.firstVerify=String(r.RFW_VERIFY_TIME_UTC);
      if (!ex.firstVerify && r.EXCEEDED==='TRUE') {
        var t = r.MAX_HEAT_INDEX_TIME_UTC || r.MAX_TEMP_TIME_UTC || r.MIN_WINDCHILL_TIME_UTC || r.MIN_TEMP_TIME_UTC || '';
        if (t && (!ex.firstVerify || String(t)<ex.firstVerify)) ex.firstVerify=String(t);
      }
    });
    var status=counts.MET>0?'MET':(!rows.length||counts.NO_DATA===rows.length?'NO_DATA':(counts.NOT_MET>0&&counts.INDETERMINATE===0?'NOT_MET':'INDETERMINATE'));
    // Confidence must come from the station that establishes MET, not an
    // unrelated Tier A station that happened to exist in the warned area.
    var establishing=rows.filter(function(r){return status!=='MET'||String(r.VERIFY_STATUS)==='MET';});
    var confidence=establishing.some(function(r){return r.CONFIDENCE==='HIGH';})?'HIGH':
      establishing.some(function(r){return r.CONFIDENCE==='MEDIUM';})?'MEDIUM':'LOW';
    var labels=Object.keys(areaLabels); var label=labels.length===1?labels[0]:(labels.length>1?labels.join(' / '):group.ugc);
    out.push([
      group.eventKey,ev.EVENT_YEAR||'',ev.EVENT_ID||'',ev.HAZARD||'',ev.PRODUCT_LABEL||'',group.ugc,label,
      rows.length,usable,counts.MET||0,counts.NOT_MET||0,counts.INDETERMINATE||0,counts.NO_DATA||0,
      tierA,covN?round_(covSum/covN,1):0,status,confidence,Object.keys(bySet).join(',')||'',
      ex.worstTemp,ex.worstWc,ex.hotTemp,ex.hotHi,ex.lowRh,ex.highWind,ex.highGust,ex.firstVerify
    ]);
  });
  var write=[AREA_VERIFY_HEADERS].concat(out);
  writeSheetDataChunked_(outWs, write, AREA_VERIFY_HEADERS.length, 1000);
  outWs.setFrozenRows(1);
}

/** ===== Web app payload ===== */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('NWS Multi-Hazard Verification');
}

function getVerificationMapPayload() {
  var events=sheetObjects_(sh_('Events'));
  var rows=sheetObjects_(sh_('Results'));
  var areas=sheetObjects_(sh_('EventAreas'));
  var areaVerification=sheetObjects_(sh_('AreaVerification'));

  var areasByEvent={};
  areas.forEach(function(a){
    if (!areasByEvent[a.EVENT_KEY]) areasByEvent[a.EVENT_KEY]=[];
    // Keep the initial dashboard payload lightweight. Full IEM polygon geometry is
    // fetched only for the event the user is actually viewing. Google Sheets has
    // a 50,000-character cell limit, so geometry must never be persisted here.
    areasByEvent[a.EVENT_KEY].push({ugc:String(a.UGC||''),startUtc:String(a.START_UTC||''),endUtc:String(a.END_UTC||''),action:String(a.ACTION||''),geometry:null,source:String(a.SOURCE||'')});
  });
  var avByEvent={}; areaVerification.forEach(function(a){if(!avByEvent[a.EVENT_KEY])avByEvent[a.EVENT_KEY]=[];avByEvent[a.EVENT_KEY].push(a);});
  var rowsByEvent={}; rows.forEach(function(r){numericizePayloadRow_(r);if(!rowsByEvent[r.EVENT_KEY])rowsByEvent[r.EVENT_KEY]=[];rowsByEvent[r.EVENT_KEY].push(r);});

  var eventList=events.map(function(e){
    var eventRows=rowsByEvent[e.EVENT_KEY]||[];
    var av=avByEvent[e.EVENT_KEY]||[];
    return {
      eventKey:String(e.EVENT_KEY||''),eventId:String(e.EVENT_ID||''),year:Number(e.EVENT_YEAR||0),hazard:String(e.HAZARD||''),phenomena:String(e.PHENOMENA||''),
      productLabel:String(e.PRODUCT_LABEL||''),issueUtc:String(e.ISSUE_UTC||''),expireUtc:String(e.EXPIRE_UTC||''),warnedUgcs:String(e.WARNED_UGCS||''),
      footprintSource:String(e.FOOTPRINT_SOURCE||''),areaTimingMode:String(e.AREA_TIMING_MODE||''),dataComplete:String(e.DATA_COMPLETE||'').toUpperCase()==='TRUE',runNote:String(e.RUN_NOTE||''),
      summary:summarizeEventForPayload_(eventRows,av)
    };
  }).sort(function(a,b){return String(a.issueUtc)<String(b.issueUtc)?-1:1;});

  return {events:eventList,rows:rows,areas:areasByEvent,areaVerification:areaVerification,analytics:getAnalyticsPayload_()};
}

function getEventFootprintPayload(eventKey) {
  eventKey=String(eventKey||'');
  if (!eventKey) return {eventKey:'',areas:[],warning:'Missing event key.'};

  var events=sheetObjects_(sh_('Events'));
  var event=null;
  for (var i=0;i<events.length;i++) {
    if (String(events[i].EVENT_KEY||'')===eventKey) { event=events[i]; break; }
  }
  if (!event) return {eventKey:eventKey,areas:[],warning:'Event not found in Events sheet.'};

  var areaRows=sheetObjects_(sh_('EventAreas')).filter(function(a){
    return String(a.EVENT_KEY||'')===eventKey;
  });
  var geometryByUgc={};
  var warnings=[];
  var phenoms=String(event.PHENOMENA||'').split(',').map(function(x){return x.trim();}).filter(String);

  for (var p=0;p<phenoms.length;p++) {
    var phen=phenoms[p];
    try {
      var url=buildUrl_('https://mesonet.agron.iastate.edu/geojson/vtec_event.py',{
        wfo:String(event.WFO||''),
        year:Number(event.EVENT_YEAR||0),
        phenomena:phen,
        significance:String(event.SIGNIFICANCE||'W'),
        etn:String(event.EVENT_ID||'')
      });
      var gj=fetchJsonWithRetry_(url,2);
      var features=(gj&&gj.features)||[];
      for (var f=0;f<features.length;f++) {
        var ft=features[f]||{};
        var ugc=normalizeUgc_(ft.id||(ft.properties&&(ft.properties.ugc||ft.properties.nws_ugc))||'');
        if (ugc&&ft.geometry&&!geometryByUgc[ugc]) geometryByUgc[ugc]=ft.geometry;
      }
    } catch(err) {
      warnings.push(phen+': '+String(err));
      log_('getEventFootprintPayload','Footprint fetch failed for '+eventKey+' '+phen+': '+err);
    }
  }

  var out=areaRows.map(function(a){
    var ugc=String(a.UGC||'');
    return {
      ugc:ugc,
      startUtc:String(a.START_UTC||''),
      endUtc:String(a.END_UTC||''),
      action:String(a.ACTION||''),
      geometry:geometryByUgc[ugc]||null,
      source:String(a.SOURCE||'')
    };
  });
  var missing={};
  out.forEach(function(a){if(a.ugc&&!a.geometry)missing[a.ugc]=true;});
  if (Object.keys(missing).length) warnings.push('No IEM polygon geometry returned for: '+Object.keys(missing).sort().join(', '));
  return {eventKey:eventKey,areas:out,warning:warnings.join(' | ')};
}

function getEventTimelinePayload(eventKey) {
  var ws=sh_('_ObsSamples');
  if (!ws) return {eventKey:eventKey,samples:[]};
  var objects=sheetObjects_(ws);
  var out=[];
  for (var i=0;i<objects.length;i++) {
    if (String(objects[i].EVENT_KEY||'')!==String(eventKey||'')) continue;
    var o=objects[i];
    ['TEMP_F','RH_PCT','DEWPOINT_F','WIND_MPH','GUST_MPH','HEAT_INDEX_F','WIND_CHILL_F'].forEach(function(k){o[k]=toFinite_(o[k]);});
    out.push(o);
  }
  out.sort(function(a,b){return String(a.TIME_UTC)<String(b.TIME_UTC)?-1:1;});
  return {eventKey:eventKey,samples:out};
}

function summarizeEventForPayload_(rows,areas) {
  var areaCounts={MET:0,NOT_MET:0,INDETERMINATE:0,NO_DATA:0};
  areas.forEach(function(a){var s=String(a.VERIFY_STATUS||'INDETERMINATE');areaCounts[s]=(areaCounts[s]||0)+1;});
  var stationCounts={MET:0,NOT_MET:0,INDETERMINATE:0,NO_DATA:0};
  var maxHi=null,maxHiSt='',maxT=null,maxTSt='',minT=null,minTSt='',minWc=null,minWcSt='',lowRh=null,highWind=null;
  rows.forEach(function(r){
    var s=String(r.VERIFY_STATUS||'INDETERMINATE');stationCounts[s]=(stationCounts[s]||0)+1;
    if (toFinite_(r.MAX_HEAT_INDEX_F)!==null && (maxHi===null||Number(r.MAX_HEAT_INDEX_F)>maxHi)){maxHi=Number(r.MAX_HEAT_INDEX_F);maxHiSt=r.STID;}
    if (toFinite_(r.MAX_TEMP_F)!==null && (maxT===null||Number(r.MAX_TEMP_F)>maxT)){maxT=Number(r.MAX_TEMP_F);maxTSt=r.STID;}
    if (toFinite_(r.MIN_TEMP_F)!==null && (minT===null||Number(r.MIN_TEMP_F)<minT)){minT=Number(r.MIN_TEMP_F);minTSt=r.STID;}
    if (toFinite_(r.MIN_WINDCHILL_F)!==null && (minWc===null||Number(r.MIN_WINDCHILL_F)<minWc)){minWc=Number(r.MIN_WINDCHILL_F);minWcSt=r.STID;}
    lowRh=minFinite_(lowRh,r.MIN_RH_PCT); highWind=maxFinite_(highWind,r.MAX_WIND_MPH);
  });
  return {areaCounts:areaCounts,stationCounts:stationCounts,totalAreas:areas.length,totalStations:rows.length,maxHeatIndex:maxHi,maxHeatIndexStation:maxHiSt,maxTemp:maxT,maxTempStation:maxTSt,minTemp:minT,minTempStation:minTSt,minWindChill:minWc,minWindChillStation:minWcSt,lowestRh:lowRh,highestWind:highWind};
}

function getAnalyticsPayload_() {
  var areas=sheetObjects_(sh_('AreaVerification'));
  var events=sheetObjects_(sh_('Events'));
  var eventMap={}; events.forEach(function(e){eventMap[e.EVENT_KEY]=e;});
  var groups={}, seenEvents={};
  areas.forEach(function(a){
    var e=eventMap[a.EVENT_KEY]||{}; var year=String(e.EVENT_YEAR||a.EVENT_YEAR||''); var hazard=String(e.HAZARD||a.HAZARD||'');
    var key=year+'|'+hazard; if(!groups[key])groups[key]={year:Number(year||0),hazard:hazard,events:0,areas:0,met:0,notMet:0,indeterminate:0,noData:0};
    groups[key].areas++;
    var s=String(a.VERIFY_STATUS||''); if(s==='MET')groups[key].met++;else if(s==='NOT_MET')groups[key].notMet++;else if(s==='NO_DATA')groups[key].noData++;else groups[key].indeterminate++;
    var ek=key+'|'+a.EVENT_KEY; if(!seenEvents[ek]){seenEvents[ek]=true;groups[key].events++;}
  });
  return Object.keys(groups).map(function(k){return groups[k];}).sort(function(a,b){return a.year-b.year || a.hazard.localeCompare(b.hazard);});
}

/** ===== Meteorological calculations ===== */
function computeWindChillF_(tempF,windMph) {
  tempF=toFinite_(tempF); windMph=toFinite_(windMph);
  if (tempF===null||windMph===null||windMph<0) return null;
  if (tempF>50||windMph<=3) return null;
  var v16=Math.pow(windMph,0.16);
  return 35.74+0.6215*tempF-35.75*v16+0.4275*tempF*v16;
}

function computeHeatIndexF_(tempF,rhPct) {
  tempF=toFinite_(tempF); rhPct=toFinite_(rhPct);
  if (tempF===null||rhPct===null||rhPct<0||rhPct>100) return null;
  var simple=0.5*(tempF+61.0+((tempF-68.0)*1.2)+(rhPct*0.094));
  var preliminary=(simple+tempF)/2.0;
  if (preliminary<80) return preliminary;
  var hi=-42.379+2.04901523*tempF+10.14333127*rhPct-0.22475541*tempF*rhPct-0.00683783*tempF*tempF-0.05481717*rhPct*rhPct+0.00122874*tempF*tempF*rhPct+0.00085282*tempF*rhPct*rhPct-0.00000199*tempF*tempF*rhPct*rhPct;
  if (rhPct<13&&tempF>=80&&tempF<=112) hi-=((13-rhPct)/4)*Math.sqrt((17-Math.abs(tempF-95))/17);
  else if (rhPct>85&&tempF>=80&&tempF<=87) hi+=((rhPct-85)/10)*((87-tempF)/5);
  return hi;
}

function computeDewpointF_(tempF,rhPct) {
  tempF=toFinite_(tempF); rhPct=toFinite_(rhPct);
  if (tempF===null||rhPct===null||rhPct<=0||rhPct>100) return null;
  var tc=(tempF-32)*5/9;
  var a=17.625,b=243.04;
  var gamma=Math.log(rhPct/100)+(a*tc)/(b+tc);
  var tdc=(b*gamma)/(a-gamma);
  return round_(tdc*9/5+32,1);
}

/** ===== Network / confidence helpers ===== */
function classifyStationTier_(mnetId,hazard,cfg) {
  var id=String(mnetId||'');
  if (cfg._tierAIds[id]) return 'A';
  if (id==='1') return 'A'; // Synoptic ASOS/AWOS
  if (id==='2') return hazard==='RFW'?'A':'B'; // RAWS is especially appropriate for fire weather
  if (cfg._tierBIds[id]) return 'B';
  return 'C';
}
function networkName_(id) {
  id=String(id||'');
  if (id==='1') return 'ASOS/AWOS';
  if (id==='2') return 'RAWS';
  return id?'Synoptic Network '+id:'Unknown network';
}


/** ===== Completed-event observation cache ===== */
function buildExistingEventCache_() {
  var out = { events:{}, obs:{}, samples:{} };
  sheetObjects_(sh_('Events')).forEach(function(e) { out.events[String(e.EVENT_KEY||'')] = e; });
  var obsWs = sh_('_EventObs');
  if (obsWs) {
    var values = obsWs.getDataRange().getValues();
    if (!values.length || !headersMatch_(values[0], EVENT_OBS_HEADERS)) values=[];
    for (var r=1;r<values.length;r++) {
      var key=String(values[r][0]||''); if(!key)continue;
      if(!out.obs[key])out.obs[key]=[];
      out.obs[key].push(values[r].slice(0,EVENT_OBS_HEADERS.length));
    }
  }
  var sampleWs = sh_('_ObsSamples');
  if (sampleWs) {
    var svals=sampleWs.getDataRange().getValues();
    if (!svals.length || !headersMatch_(svals[0], SAMPLE_HEADERS)) svals=[];
    for (var s=1;s<svals.length;s++) {
      var skey=String(svals[s][0]||''); if(!skey)continue;
      if(!out.samples[skey])out.samples[skey]=[];
      out.samples[skey].push(svals[s].slice(0,SAMPLE_HEADERS.length));
    }
  }
  return out;
}

function shouldReuseCompletedEvent_(event, cache, cfg) {
  if (cfg._forceRefreshCompleted) return false;
  var old=cache.events[event.eventKey];
  if (!old || String(old.DATA_COMPLETE||'').toUpperCase()!=='TRUE') return false;
  if (String(old.EXPIRE_UTC||'') !== String(event.expireUtc||'')) return false;
  if (String(old.WARNED_UGCS||'') !== (event.warnedUgcs||[]).join(',')) return false;
  if (!event.cacheFingerprint || String(old.RUN_NOTE||'').indexOf('[cache:'+event.cacheFingerprint+']')===-1) return false;
  if (!(cache.obs[event.eventKey]||[]).length) return false;
  var exp=parseDateSafe_(event.expireUtc);
  return exp && exp.getTime() < Date.now()-60*60*1000;
}

/** ===== Persistence helpers ===== */
function replaceRowsForEventKeys_(sheetName,headers,newRows,eventKeys,eventKeyIndex,hidden) {
  var ws=prepareSheet_(sheetName,headers,hidden);
  var existing=ws.getDataRange().getValues();
  var remove={}; (eventKeys||[]).forEach(function(k){remove[String(k)]=true;});
  var keep=[];
  var schemaOk = existing.length && headersMatch_(existing[0], headers);
  if (existing.length>1 && !schemaOk) throw new Error(sheetName+' schema mismatch; no legacy rows were discarded. Back up and migrate explicitly.');
  if (existing.length>1 && schemaOk) {
    for (var r=1;r<existing.length;r++) if (!remove[String(existing[r][eventKeyIndex]||'')]) { var kept=existing[r].slice(0,headers.length); while(kept.length<headers.length)kept.push(''); keep.push(kept); }
  }
  var data=[headers].concat(keep,newRows||[]);
  var chunkSize = sheetName === '_ObsSamples' ? 1500 : 1000;
  writeSheetDataChunked_(ws, data, headers.length, chunkSize);
  ws.setFrozenRows(1);
  if (hidden) ws.hideSheet(); else ws.showSheet();
}

function writeSheetDataChunked_(ws,data,colCount,chunkSize) {
  chunkSize = Math.max(100, Number(chunkSize||1000));
  data = data || [];
  colCount = Number(colCount||0);
  if (!colCount) return;
  var lastRow = ws.getLastRow();
  var lastCol = ws.getLastColumn();
  // Do not erase the full table before the first chunk succeeds. Chunk writes
  // still are not atomic: back up the live workbook before large reruns.
  if (!data.length) { if(lastRow&&lastCol)ws.getRange(1,1,lastRow,lastCol).clearContent(); return; }
  if (ws.getMaxRows() < data.length) ws.insertRowsAfter(ws.getMaxRows(), data.length - ws.getMaxRows());
  if (ws.getMaxColumns() < colCount) ws.insertColumnsAfter(ws.getMaxColumns(), colCount - ws.getMaxColumns());
  for (var start=0; start<data.length; start+=chunkSize) {
    var chunk=data.slice(start, Math.min(start+chunkSize,data.length));
    ws.getRange(start+1,1,chunk.length,colCount).setValues(chunk);
  }
  if (lastRow>data.length) ws.getRange(data.length+1,1,lastRow-data.length,lastCol).clearContent();
  if (lastCol>colCount) ws.getRange(1,colCount+1,Math.min(lastRow,data.length),lastCol-colCount).clearContent();
}

function headersMatch_(actual,expected){ if(!actual||actual.length<expected.length)return false; for(var i=0;i<expected.length;i++)if(String(actual[i]||'').trim()!==String(expected[i]||'').trim())return false; return true; }

function sheetObjects_(ws) {
  if (!ws) return [];
  var values=ws.getDataRange().getValues();
  if (values.length<2) return [];
  var headers=values[0].map(function(h){return String(h||'').trim();});
  var out=[];
  for (var r=1;r<values.length;r++) out.push(rowToObject_(headers,values[r]));
  return out;
}
function rowToObject_(headers,row){var o={};for(var c=0;c<headers.length;c++)o[headers[c]]=row[c];return o;}
function numericizeEventObs_(o){
  ['OBS_COUNT','DATA_COVERAGE_PCT','MIN_TEMP_F','MIN_WINDCHILL_F','MAX_TEMP_F','MAX_HEAT_INDEX_F','HI_TEMP_F','HI_RH_PCT','HI_DEWPOINT_F','MIN_RH_PCT','MAX_WIND_MPH','MAX_GUST_MPH','RFW_VERIFY_RH_PCT','RFW_VERIFY_WIND_MPH','RFW_VERIFY_GUST_MPH','TEMP_CRITERIA_MAX_CONTINUOUS_MIN','WINDCHILL_CRITERIA_MAX_CONTINUOUS_MIN','HEAT_INDEX_CRITERIA_MAX_CONTINUOUS_MIN','RFW_CRITERIA_MAX_CONTINUOUS_MIN','TEMP_CRITERIA_CUMULATIVE_MIN','WINDCHILL_CRITERIA_CUMULATIVE_MIN','HEAT_INDEX_CRITERIA_CUMULATIVE_MIN','RFW_CRITERIA_CUMULATIVE_MIN'].forEach(function(k){o[k]=toFinite_(o[k]);});
}
function numericizePayloadRow_(o){numericizeEventObs_(o);o.LATITUDE=toFinite_(o.LATITUDE);o.LONGITUDE=toFinite_(o.LONGITUDE);o.ELEVATION_FT=toFinite_(o.ELEVATION_FT);}

/** ===== Self-tests ===== */
function runVerificationSelfTests() {
  var tests=[];
  function t(name,pass,detail){tests.push({name:name,pass:!!pass,detail:detail||''});}
  var hi=computeHeatIndexF_(90,70); t('NWS Heat Index 90F/70%',hi>105&&hi<107,'got '+hi);
  var wc=computeWindChillF_(30,10); t('NWS Wind Chill 30F/10mph',wc>20&&wc<22,'got '+wc);
  t('Zero is valid numeric data',toFinite_(0)===0,'toFinite_(0)='+toFinite_(0));
  var run=computeRunStats_([{ms:0,x:true},{ms:600000,x:true},{ms:1200000,x:true}], 'x', 30);
  t('Duration run = 20 minutes',Math.abs(run.maxContinuousMin-20)<0.01,'got '+run.maxContinuousMin);
  var failed=tests.filter(function(x){return !x.pass;});
  var msg=tests.map(function(x){return (x.pass?'PASS':'FAIL')+' — '+x.name+(x.detail?' ('+x.detail+')':'');}).join('\n');
  log_('runVerificationSelfTests',msg);
  try { SpreadsheetApp.getUi().alert('Verification Self-Tests',msg,SpreadsheetApp.getUi().ButtonSet.OK); } catch(e) {}
  if (failed.length) throw new Error(failed.length+' verification self-test(s) failed.');
  return msg;
}

/** ===== General helpers ===== */
function runtimeSpreadsheet_(){
  var id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var ss=id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
  if(!ss)throw new Error('Set SPREADSHEET_ID in Script Properties to the existing live Sheet ID for web app execution.');
  return ss;
}
function sh_(name){return runtimeSpreadsheet_().getSheetByName(name);}
function prepareSheet_(name,headers,hidden){
  var ss=runtimeSpreadsheet_(),ws=ss.getSheetByName(name);
  if(!ws)ws=ss.insertSheet(name);
  if(hidden)ws.hideSheet();else ws.showSheet();
  return ws;
}
function log_(step,message){
  var ws=sh_('Log'); if(!ws)ws=runtimeSpreadsheet_().insertSheet('Log');
  ws.appendRow([Utilities.formatDate(new Date(),'UTC','yyyy-MM-dd HH:mm:ss'),step,message]);
}

function readConfig_() {
  var ws=sh_('Config'); if(!ws)throw new Error('Config sheet not found.');
  var values=ws.getDataRange().getValues(),cfg={};
  for(var r=1;r<values.length;r++){var key=String(values[r][0]||'').trim();if(key)cfg[key]=values[r][1];}
  // Script Properties is preferred. Retain the existing Config fallback so the
  // live workbook keeps working during migration; never export it to GitHub.
  var secret=PropertiesService.getScriptProperties().getProperty('SYNOPTIC_API_TOKEN')||cfg['Synoptic API token'];
  if(!secret)throw new Error('Missing SYNOPTIC_API_TOKEN Script Property or "Synoptic API token" in Config.');
  cfg._token=String(secret).trim();
  cfg._cwa=String(cfg['CWA']||'LIX').trim().toUpperCase();
  cfg._qcChecks=String(cfg['QC checks']||'synopticlabs').trim();
  cfg._qcRemove=String(cfg['QC remove flagged (on/off)']||'on').trim().toLowerCase();
  if(['on','off','mark'].indexOf(cfg._qcRemove)===-1)cfg._qcRemove='on';
  cfg._vars=ensureVars_(String(cfg['Vars']||''),['air_temp','wind_speed','wind_gust','relative_humidity','dew_point_temperature']);
  cfg._units=String(cfg['Units']||'english,speed|mph,temp|f').trim();
  cfg._rfwWindBasis=String(cfg['RFW wind basis']||'sustained').trim().toLowerCase()==='gust'?'gust':'sustained';
  cfg._durationMaxGapMinutes=Number(cfg['Duration max gap minutes']||30); if(!isFinite(cfg._durationMaxGapMinutes)||cfg._durationMaxGapMinutes<1)cfg._durationMaxGapMinutes=30;
  cfg._minCoveragePct=toFinite_(cfg['Minimum coverage for nonverify %']); if(cfg._minCoveragePct===null||cfg._minCoveragePct<0||cfg._minCoveragePct>100)cfg._minCoveragePct=50;
  cfg._forceRefreshCompleted=String(cfg['Force refresh completed events']||'off').trim().toLowerCase()==='on';
  cfg._tierAIds=parseIdSet_(cfg['Tier A MNET IDs']||'');
  cfg._tierBIds=parseIdSet_(cfg['Tier B MNET IDs']||'');
  return cfg;
}
function ensureVars_(existing,required){var set={};String(existing||'').split(',').forEach(function(v){v=v.trim();if(v)set[v]=true;});required.forEach(function(v){set[v]=true;});return Object.keys(set).join(',');}
function parseIdSet_(v){var out={};String(v||'').split(/[\s,;]+/).forEach(function(x){x=x.trim();if(x)out[x]=true;});return out;}

function fetchJsonWithRetry_(url,attempts){
  attempts=attempts||3; var lastErr=null;
  for(var i=0;i<attempts;i++){
    try{
      var resp=UrlFetchApp.fetch(url,{muteHttpExceptions:true});
      var code=resp.getResponseCode(),text=resp.getContentText();
      if(code>=200&&code<300){
        var parsed=JSON.parse(text),summary=parsed.SUMMARY;
        if(summary&&summary.RESPONSE_CODE!=null&&[1,2].indexOf(Number(summary.RESPONSE_CODE))===-1){
          lastErr=new Error('Synoptic response code '+Number(summary.RESPONSE_CODE)+' from '+String(url).split('?')[0]);
        }else return parsed;
      }else{
      // Provider error bodies can echo request credentials. Do not log them.
      lastErr=new Error('HTTP '+code+' from '+String(url).split('?')[0]);
      }
    }catch(e){lastErr=new Error('Fetch/JSON failure from '+String(url).split('?')[0]);}
    if(i<attempts-1)Utilities.sleep(Math.pow(2,i)*500);
  }
  throw lastErr||new Error('Fetch failed');
}
function buildUrl_(base,params){var q=[];for(var k in params){if(params[k]===null||params[k]===undefined||params[k]==='')continue;q.push(encodeURIComponent(k)+'='+encodeURIComponent(String(params[k])));}return base+'?'+q.join('&');}
function findObsKey_(obs,prefix){var keys=Object.keys(obs||{});for(var i=0;i<keys.length;i++)if(keys[i].indexOf(prefix)===0&&/_set_1$/.test(keys[i])&&Array.isArray(obs[keys[i]]))return keys[i];for(var j=0;j<keys.length;j++)if(keys[j].indexOf(prefix)===0&&Array.isArray(obs[keys[j]]))return keys[j];return '';}
function compare_(val,thr,comparator){if(val===null||val===''||!isFinite(val)||thr===null||thr===''||!isFinite(thr))return false;switch(String(comparator||'').trim()){case'<':return val<thr;case'<=':return val<=thr;case'>':return val>thr;case'>=':return val>=thr;default:return false;}}
function normalizeComparator_(val){var c=String(val||'').trim();return(c==='<'||c==='<='||c==='>'||c==='>=')?c:'';}
function normCounty_(s){var x=String(s||'').toLowerCase();x=x.replace(/\b(parish|county)\b/g,'');x=x.replace(/[.,/]/g,' ');x=x.replace(/\s+/g,' ').trim();x=x.replace(/\bsaint\b/g,'st');x=x.replace(/\bst\s+/g,'st ');return x;}
function parseDateSafe_(v){if(v instanceof Date)return isValidDate_(v)?v:null;var d=new Date(v);return isValidDate_(d)?d:null;}
function validRange_(v,min,max){return v!==null&&isFinite(v)&&v>=min&&v<=max?v:null;}
function toFinite_(v){if(v===null||v===undefined||v==='')return null;var n=Number(v);return isFinite(n)?n:null;}
function minFinite_(a,b){var n=toFinite_(b);return n===null?a:(a===null||a===''?n:Math.min(Number(a),n));}
function maxFinite_(a,b){var n=toFinite_(b);return n===null?a:(a===null||a===''?n:Math.max(Number(a),n));}
function round_(x,dec){var p=Math.pow(10,dec);return Math.round(x*p)/p;}
function fmtYmdHm_(d){return Utilities.formatDate(d,'UTC','yyyyMMddHHmm');}
function toIsoMinute_(d){return Utilities.formatDate(d,'UTC',"yyyy-MM-dd'T'HH:mm'Z'");}
function pad2_(n){return('0'+n).slice(-2);}
function isValidDate_(d){return d&&Object.prototype.toString.call(d)==='[object Date]'&&!isNaN(d.getTime());}
function formatMinutesHuman_(m){m=Math.round(Number(m)||0);if(m<60)return m+'m';var h=Math.floor(m/60),r=m%60;return h+'h'+(r?' '+r+'m':'');}

/** Coverage of an entire sample interval by the union of active windows. */
function intervalActive_(startMs,endMs,windows){
  if(!windows)return true; // Backwards-compatible pure helper/self-test calls.
  var clipped=windows.map(function(w){return {start:new Date(Math.max(startMs,w.start.getTime())),end:new Date(Math.min(endMs,w.end.getTime()))};})
    .filter(function(w){return w.end>=w.start;});
  return activeWindowDurationMs_(clipped)>=endMs-startMs;
}

function withWriteLock_(fn){
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))throw new Error('Another verification/write is running. Retry after it finishes.');
  try{return fn();}finally{lock.releaseLock();}
}

function validateRuntimeSchema_(){
  var expected={Stations:STATION_HEADERS,Events:EVENT_HEADERS,EventAreas:EVENT_AREA_HEADERS,
    _EventObs:EVENT_OBS_HEADERS,_ObsSamples:SAMPLE_HEADERS,Results:RESULT_HEADERS,AreaVerification:AREA_VERIFY_HEADERS};
  Object.keys(expected).forEach(function(name){
    var ws=sh_(name);if(!ws||ws.getLastRow()===0)return;
    var cols=ws.getLastColumn();
    var actual=ws.getRange(1,1,1,cols).getValues()[0];
    if(!headersMatch_(actual,expected[name]))throw new Error(name+' schema mismatch. Back up and migrate explicitly before running verification.');
  });
}

function invalidateCompletedEvents_(keys){
  var ws=sh_('Events');if(!ws||ws.getLastRow()<2)return;
  var remove={};keys.forEach(function(k){remove[k]=true;});
  var data=ws.getDataRange().getValues(),col=EVENT_HEADERS.indexOf('DATA_COMPLETE');
  for(var i=1;i<data.length;i++)if(remove[String(data[i][0])])data[i][col]='FALSE';
  writeSheetDataChunked_(ws,data,EVENT_HEADERS.length,1000);
}

function eventCacheFingerprint_(event,cfg,maps,stations){
  // Bump version after observation, matching, or duration behavior changes.
  // Hash only non-secret inputs; API tokens must never enter persisted metadata.
  var input={version:2,vars:cfg._vars,units:cfg._units,qc:cfg._qcChecks,remove:cfg._qcRemove,
    wind:cfg._rfwWindBasis,gap:cfg._durationMaxGapMinutes,tierA:cfg._tierAIds,tierB:cfg._tierBIds,
    rules:maps,stations:stations,areas:(event.areas||[]).map(function(a){return [a.ugc,a.start.getTime(),a.end.getTime()];})};
  var digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(input));
  return digest.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}
