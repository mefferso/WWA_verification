'use strict';
const core=require('./core.cjs');
// Availability is for every configured alternative: sparse wind cannot prove
// a cold warning missed its implicit temperature-or-wind-chill threshold.
function hazardUsable(hazard,rules,t,wind,gust,rh,hi,cfg){
 if(hazard==='EH')return (!rules.TEMP_F||t!==null)&&(!rules.HEAT_INDEX_F||hi!==null);
 if(hazard==='EC')return (!rules.TEMP_F||t!==null)&&(!(rules.WIND_CHILL_F||rules.TEMP_F)||(t!==null&&wind!==null));
 return rh!==null&&(cfg._rfwWindBasis==='gust'?gust!==null:wind!==null);
}
function recalculate(record,cfg,maps){
 const aggregates=new Map(),samples=[];
 for(const raw of record.summaries||[]){
  if(!raw.EVENT_KEY||!raw.STID)continue;
  const zone=core.normalizeUgc_(raw.AREA_UGC||raw.NWSZONE),rules=core.lookupRulesForArea_(maps,record.event.hazard,raw.STATE,raw.COUNTY,zone)||{};
  const windows=(record.areas||[]).filter(a=>a.ugc===zone).map(a=>({start:new Date(a.startUtc),end:new Date(a.endUtc)}));
  const meta={...raw,areaUgc:zone,NWSZONE:zone,rules,windows,NETWORK_TIER:core.classifyStationTier_(raw.MNET_ID,record.event.hazard,cfg)};
  const agg=core.newStationAggregate_(record.event,meta,cfg);
  // QC cannot be retroactively applied to samples whose ingestion removed none.
  agg.QC_POLICY=raw.QC_POLICY||'off';agg._fetchError=String(raw.FETCH_ERROR).toUpperCase()==='TRUE';
  aggregates.set(String(raw.STID),{agg,times:[],seen:new Set()});
 }
 for(const raw of record.samples||[]){
  const a=aggregates.get(String(raw[2]));if(!a)continue;
  const when=new Date(raw[3]),ms=when.getTime();if(!Number.isFinite(ms)||a.seen.has(ms)||!core.isTimeActiveForStation_(a.agg.windows,when))continue;a.seen.add(ms);
  const t=core.toFinite_(raw[4]),rh=core.toFinite_(raw[5]),dew=core.toFinite_(raw[6]),wind=core.toFinite_(raw[7]),gust=core.toFinite_(raw[8]);
  const h=core.computeHeatIndexF_(t,rh),w=core.computeWindChillF_(t,wind),hi=h===null?null:core.round_(h,1),wc=w===null?null:core.round_(w,1);
  const flags=core.evaluateSampleCriteria_(record.event.hazard,a.agg.rules,t,wc,hi,rh,wind,gust,cfg);
  core.updateStationAggregate_(a.agg,when.toISOString(),ms,t,wc,hi,rh,dew,wind,gust,flags,cfg);
  if(hazardUsable(record.event.hazard,a.agg.rules,t,wind,gust,rh,hi,cfg))a.times.push(ms);
  samples.push([...raw.slice(0,9),hi,wc,...[flags.tempMet,flags.wcMet,flags.hiMet,flags.rfwMet].map(v=>v?'TRUE':'FALSE')]);
 }
 const summaries=[];
 for(const {agg,times} of aggregates.values()){
  core.finalizeAggregate_(agg,cfg);agg.DATA_COVERAGE_PCT=core.round_(core.coveragePct_(times.sort((a,b)=>a-b),core.activeWindowDurationMs_(agg.windows),cfg._durationMaxGapMinutes,agg.windows),1);
  summaries.push(core.rowToObject_(core.EVENT_OBS_HEADERS,core.aggregateToRow_(agg)));
 }
 return {...record,summaries,samples};
}
module.exports={recalculate,hazardUsable};
