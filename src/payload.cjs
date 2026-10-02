'use strict';
const core=require('./core.cjs'),{eventId}=require('./store.cjs'),{recalculate}=require('./recalculate.cjs');
function results(record,cfg,maps){
 return recalculate(record,cfg,maps).summaries.filter(r=>r.EVENT_KEY&&r.STID).map(raw=>{
  const row={...raw};core.numericizePayloadRow_(row);
  const rules=core.lookupRulesForArea_(maps,row.HAZARD,row.STATE,row.COUNTY,row.NWSZONE);
  const ev=core.evaluateStation_(row,rules,cfg);
  return {...row,THRESHOLD_SUMMARY:ev.thresholdSummary,VERIFY_STATUS:ev.status,EXCEEDED:ev.status==='MET'?'TRUE':'FALSE',EXCEEDED_BY:ev.exceededBy,CONFIDENCE:ev.confidence,NOTES:ev.notes};
 });
}
function areaVerification(record,rows){
 const event=record.event,groups=new Map();
 for(const a of record.areas||[])if(a.ugc&&!groups.has(a.ugc))groups.set(a.ugc,[]);
 for(const r of rows){const ugc=core.normalizeUgc_(r.AREA_UGC||r.NWSZONE);if(groups.has(ugc))groups.get(ugc).push(r);}
 return [...groups].map(([ugc,stations])=>{
  const counts={MET:0,NOT_MET:0,INDETERMINATE:0,NO_DATA:0};for(const r of stations)counts[r.VERIFY_STATUS]=(counts[r.VERIFY_STATUS]||0)+1;
  const status=counts.MET?'MET':!stations.length||counts.NO_DATA===stations.length?'NO_DATA':counts.NOT_MET&&counts.INDETERMINATE===0?'NOT_MET':'INDETERMINATE';
  const establishing=stations.filter(r=>status!=='MET'||r.VERIFY_STATUS==='MET');
  const confidence=establishing.some(r=>r.CONFIDENCE==='HIGH')?'HIGH':establishing.some(r=>r.CONFIDENCE==='MEDIUM')?'MEDIUM':'LOW';
  const finite=key=>stations.map(r=>core.toFinite_(r[key])).filter(v=>v!==null);
  const extreme=(key,type)=>{const v=finite(key);return v.length?Math[type](...v):null;};
  const coverage=finite('DATA_COVERAGE_PCT'),labels=[...new Set(stations.map(r=>r.COUNTY).filter(Boolean))];
  const times=stations.filter(r=>r.VERIFY_STATUS==='MET').map(r=>r.RFW_VERIFY_TIME_UTC||
   (r.HAZARD==='EH'?(r.EXCEEDED_BY==='TEMP'?r.MAX_TEMP_TIME_UTC:r.MAX_HEAT_INDEX_TIME_UTC):(r.EXCEEDED_BY==='TEMP'?r.MIN_TEMP_TIME_UTC:r.MIN_WINDCHILL_TIME_UTC))).filter(Boolean).sort();
  return {EVENT_KEY:event.eventKey,EVENT_YEAR:event.year,EVENT_ID:event.eventId,HAZARD:event.hazard,PRODUCT_LABEL:event.productLabel,UGC:ugc,AREA_LABEL:labels.join(' / ')||ugc,
   STATION_COUNT:stations.length,USABLE_STATION_COUNT:stations.length-counts.NO_DATA,MET_STATION_COUNT:counts.MET,NOT_MET_STATION_COUNT:counts.NOT_MET,
   INDETERMINATE_STATION_COUNT:counts.INDETERMINATE,NO_DATA_STATION_COUNT:counts.NO_DATA,TIER_A_STATION_COUNT:stations.filter(r=>r.NETWORK_TIER==='A').length,
   AVG_COVERAGE_PCT:coverage.length?core.round_(coverage.reduce((a,b)=>a+b,0)/coverage.length,1):0,VERIFY_STATUS:status,CONFIDENCE:confidence,
   VERIFIED_BY:[...new Set(stations.filter(r=>r.VERIFY_STATUS==='MET').map(r=>r.EXCEEDED_BY).filter(Boolean))].join(','),
   WORST_TEMP_F:extreme('MIN_TEMP_F','min'),WORST_WINDCHILL_F:extreme('MIN_WINDCHILL_F','min'),HOTTEST_TEMP_F:extreme('MAX_TEMP_F','max'),HOTTEST_HEAT_INDEX_F:extreme('MAX_HEAT_INDEX_F','max'),
   LOWEST_RH_PCT:extreme('MIN_RH_PCT','min'),HIGHEST_WIND_MPH:extreme('MAX_WIND_MPH','max'),HIGHEST_GUST_MPH:extreme('MAX_GUST_MPH','max'),FIRST_VERIFY_TIME_UTC:times[0]||''};
 });
}
function eventPayload(record,cfg,maps){
 const rows=results(record,cfg,maps),av=areaVerification(record,rows),event={...record.event,summary:core.summarizeEventForPayload_(rows,av)};
 return {events:[event],rows,areas:{[event.eventKey]:(record.areas||[]).map(a=>({...a,geometry:null}))},areaVerification:av};
}
function buildIndex(records,cfg,maps){
 const groups=new Map(),events=[];
 for(const r of records){const p=eventPayload(r,cfg,maps),e=p.events[0];events.push({...e,file:eventId(e.eventKey)+'.json.gz',sampleCount:(r.samples||[]).length});
  const key=e.year+'|'+e.hazard;if(!groups.has(key))groups.set(key,{year:e.year,hazard:e.hazard,events:0,areas:0,met:0,notMet:0,indeterminate:0,noData:0,incompleteEvents:0});
  const g=groups.get(key);g.events++;if(!e.dataComplete)g.incompleteEvents++;
  for(const a of p.areaVerification){g.areas++;g[{MET:'met',NOT_MET:'notMet',INDETERMINATE:'indeterminate',NO_DATA:'noData'}[a.VERIFY_STATUS]]++;}
 }
 events.sort((a,b)=>a.issueUtc.localeCompare(b.issueUtc));
 return {schemaVersion:1,events,analytics:[...groups.values()].sort((a,b)=>a.year-b.year||a.hazard.localeCompare(b.hazard))};
}
module.exports={results,areaVerification,eventPayload,buildIndex};
