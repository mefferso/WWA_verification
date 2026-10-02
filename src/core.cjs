'use strict';
// Meteorological core ported from reviewed Code.gs. No Google runtime dependency.
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
  hi = validHeatIndexF_(hi);
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
  hi = validHeatIndexF_(hi);
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

function summarizeEventForPayload_(rows,areas) {
  var areaCounts={MET:0,NOT_MET:0,INDETERMINATE:0,NO_DATA:0};
  areas.forEach(function(a){var s=String(a.VERIFY_STATUS||'INDETERMINATE');areaCounts[s]=(areaCounts[s]||0)+1;});
  var stationCounts={MET:0,NOT_MET:0,INDETERMINATE:0,NO_DATA:0};
  var maxHi=null,maxHiSt='',maxT=null,maxTSt='',minT=null,minTSt='',minWc=null,minWcSt='',lowRh=null,highWind=null;
  rows.forEach(function(r){
    var s=String(r.VERIFY_STATUS||'INDETERMINATE');stationCounts[s]=(stationCounts[s]||0)+1;
    var validHi=validHeatIndexF_(r.MAX_HEAT_INDEX_F);
    if (validHi!==null && (maxHi===null||validHi>maxHi)){maxHi=validHi;maxHiSt=r.STID;}
    if (toFinite_(r.MAX_TEMP_F)!==null && (maxT===null||Number(r.MAX_TEMP_F)>maxT)){maxT=Number(r.MAX_TEMP_F);maxTSt=r.STID;}
    if (toFinite_(r.MIN_TEMP_F)!==null && (minT===null||Number(r.MIN_TEMP_F)<minT)){minT=Number(r.MIN_TEMP_F);minTSt=r.STID;}
    if (toFinite_(r.MIN_WINDCHILL_F)!==null && (minWc===null||Number(r.MIN_WINDCHILL_F)<minWc)){minWc=Number(r.MIN_WINDCHILL_F);minWcSt=r.STID;}
    lowRh=minFinite_(lowRh,r.MIN_RH_PCT); highWind=maxFinite_(highWind,r.MAX_WIND_MPH);
  });
  return {areaCounts:areaCounts,stationCounts:stationCounts,totalAreas:areas.length,totalStations:rows.length,maxHeatIndex:maxHi,maxHeatIndexStation:maxHiSt,maxTemp:maxT,maxTempStation:maxTSt,minTemp:minT,minTempStation:minTSt,minWindChill:minWc,minWindChillStation:minWcSt,lowestRh:lowRh,highestWind:highWind};
}

function computeWindChillF_(tempF,windMph) {
  tempF=toFinite_(tempF); windMph=toFinite_(windMph);
  if (tempF===null||windMph===null||windMph<0) return null;
  if (tempF>50||windMph<=3) return null;
  var v16=Math.pow(windMph,0.16);
  return 35.74+0.6215*tempF-35.75*v16+0.4275*tempF*v16;
}

function validHeatIndexF_(value) {
  var n=toFinite_(value);
  return n!==null && n>0 && n<=128 ? n : null;
}

function computeHeatIndexF_(tempF,rhPct) {
  tempF=toFinite_(tempF); rhPct=toFinite_(rhPct);
  if (tempF===null||rhPct===null||rhPct<0||rhPct>100) return null;
  var simple=0.5*(tempF+61.0+((tempF-68.0)*1.2)+(rhPct*0.094));
  var preliminary=(simple+tempF)/2.0;
  if (preliminary<80) return validHeatIndexF_(preliminary);
  var hi=-42.379+2.04901523*tempF+10.14333127*rhPct-0.22475541*tempF*rhPct-0.00683783*tempF*tempF-0.05481717*rhPct*rhPct+0.00122874*tempF*tempF*rhPct+0.00085282*tempF*rhPct*rhPct-0.00000199*tempF*tempF*rhPct*rhPct;
  if (rhPct<13&&tempF>=80&&tempF<=112) hi-=((13-rhPct)/4)*Math.sqrt((17-Math.abs(tempF-95))/17);
  else if (rhPct>85&&tempF>=80&&tempF<=87) hi+=((rhPct-85)/10)*((87-tempF)/5);
  return validHeatIndexF_(hi);
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
function headersMatch_(actual,expected){ if(!actual||actual.length<expected.length)return false; for(var i=0;i<expected.length;i++)if(String(actual[i]||'').trim()!==String(expected[i]||'').trim())return false; return true; }

function rowToObject_(headers,row){var o={};for(var c=0;c<headers.length;c++)o[headers[c]]=row[c];return o;}
function numericizeEventObs_(o){
  ['OBS_COUNT','DATA_COVERAGE_PCT','MIN_TEMP_F','MIN_WINDCHILL_F','MAX_TEMP_F','MAX_HEAT_INDEX_F','HI_TEMP_F','HI_RH_PCT','HI_DEWPOINT_F','MIN_RH_PCT','MAX_WIND_MPH','MAX_GUST_MPH','RFW_VERIFY_RH_PCT','RFW_VERIFY_WIND_MPH','RFW_VERIFY_GUST_MPH','TEMP_CRITERIA_MAX_CONTINUOUS_MIN','WINDCHILL_CRITERIA_MAX_CONTINUOUS_MIN','HEAT_INDEX_CRITERIA_MAX_CONTINUOUS_MIN','RFW_CRITERIA_MAX_CONTINUOUS_MIN','TEMP_CRITERIA_CUMULATIVE_MIN','WINDCHILL_CRITERIA_CUMULATIVE_MIN','HEAT_INDEX_CRITERIA_CUMULATIVE_MIN','RFW_CRITERIA_CUMULATIVE_MIN'].forEach(function(k){o[k]=toFinite_(o[k]);});
}
function numericizePayloadRow_(o){numericizeEventObs_(o);o.LATITUDE=toFinite_(o.LATITUDE);o.LONGITUDE=toFinite_(o.LONGITUDE);o.ELEVATION_FT=toFinite_(o.ELEVATION_FT);}

/** ===== Self-tests ===== */
function ensureVars_(existing,required){var set={};String(existing||'').split(',').forEach(function(v){v=v.trim();if(v)set[v]=true;});required.forEach(function(v){set[v]=true;});return Object.keys(set).join(',');}
function parseIdSet_(v){var out={};String(v||'').split(/[\s,;]+/).forEach(function(x){x=x.trim();if(x)out[x]=true;});return out;}

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


function fmtYmdHm_(d){return d.toISOString().slice(0,16).replace(/[-:T]/g,'');}
function toIsoMinute_(d){return d.toISOString().slice(0,16)+'Z';}

module.exports={HAZARD_META,STATION_HEADERS,EVENT_HEADERS,EVENT_AREA_HEADERS,EVENT_OBS_HEADERS,RESULT_HEADERS,SAMPLE_HEADERS,AREA_VERIFY_HEADERS,normalizeUgc_,getHazardFromIem_,resolveProductLabel_,newStationAggregate_,updateStationAggregate_,finalizeAggregate_,aggregateToRow_,evaluateSampleCriteria_,getAreaWindowsForStation_,isTimeActiveForStation_,activeWindowDurationMs_,coveragePct_,computeRunStats_,addRuleRow_,lookupRulesForArea_,mergeRuleMaps_,normalizeAreaKey_,evaluateStation_,resultEval_,thresholdSummaryFor_,ruleText_,ruleDurationMinutes_,durationSatisfied_,stationConfidence_,summarizeEventForPayload_,computeWindChillF_,validHeatIndexF_,computeHeatIndexF_,computeDewpointF_,classifyStationTier_,networkName_,headersMatch_,rowToObject_,numericizeEventObs_,numericizePayloadRow_,ensureVars_,parseIdSet_,buildUrl_,findObsKey_,compare_,normalizeComparator_,normCounty_,parseDateSafe_,validRange_,toFinite_,minFinite_,maxFinite_,round_,pad2_,isValidDate_,formatMinutesHuman_,intervalActive_,fmtYmdHm_,toIsoMinute_};
