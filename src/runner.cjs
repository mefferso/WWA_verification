'use strict';
const crypto=require('node:crypto'),path=require('node:path'),zlib=require('node:zlib');
const core=require('./core.cjs'),{EventStore,atomicWrite}=require('./store.cjs'),{loadConfig}=require('./config.cjs'),{groupEvents,footprintAreas}=require('./providers.cjs');
const {hazardUsable}=require('./recalculate.cjs');
const HASH_VERSION=4;
class BudgetExceeded extends Error {}
function fingerprint(event,areas,cfg,maps,metadata){
 return crypto.createHash('sha256').update(JSON.stringify({version:HASH_VERSION,event:[event.issueUtc,event.expireUtc,event.phenomena],
  areas:areas.map(a=>[a.ugc,a.startUtc,a.endUtc]),cfg,maps,metadata:metadata.map(st=>[st.STID,st.STATE,st.COUNTY,st.CWA,st.NWSZONE,st.LATITUDE,st.LONGITUDE,st.MNET_ID]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))})).digest('hex');
}
function reusable(old,event,signature,force,now=Date.now()){
 return !force&&old?.event?.dataComplete===true&&old.cacheFingerprint===signature&&old.event.expireUtc===event.expireUtc&&
  old.summaries?.some(r=>Number(r.OBS_COUNT)>0)&&old.samples?.length>0&&
  Date.parse(old.provenance?.computedUtc)>=Date.parse(event.expireUtc)+3600000&&Date.parse(event.expireUtc)<now-3600000;
}
async function computeObservations(client,event,areas,metadata,cfg,maps,deadline=Infinity){
 const selected=new Map();
 for(const st of metadata){
  const zone=core.normalizeUgc_(st.NWSZONE),stid=String(st.STID||'').trim(),state=String(st.STATE||'').toUpperCase(),county=String(st.COUNTY||'');
  if(!stid||!state||!county||String(st.CWA||'').toUpperCase()!==cfg._cwa||!(event.warnedUgcs||[]).includes(zone))continue;
  const rules=core.lookupRulesForArea_(maps,event.hazard,state,county,zone);if(!rules)continue;
  const windows=areas.filter(a=>a.ugc===zone).map(a=>({start:new Date(a.startUtc),end:new Date(a.endUtc)}));if(!windows.length)continue;
  const meta={STID:stid,NAME:st.NAME||'',STATE:state,COUNTY:county,NWSZONE:zone,areaUgc:zone,rules,windows,
   LATITUDE:core.toFinite_(st.LATITUDE),LONGITUDE:core.toFinite_(st.LONGITUDE),ELEVATION_FT:core.toFinite_(st.ELEVATION),MNET_ID:String(st.MNET_ID??''),
   NETWORK_NAME:core.networkName_(st.MNET_ID),NETWORK_TIER:core.classifyStationTier_(st.MNET_ID,event.hazard,cfg)};
  selected.set(stid,{meta,agg:core.newStationAggregate_({...event,issue:new Date(event.issueUtc),expire:new Date(event.expireUtc)},meta,cfg),seen:new Set(),hazardTimes:[]});
 }
 const ids=[...selected.keys()],samples=[],errors=[];
 // Bound request volume and checkpoint at event granularity. 60 IDs × 24h is
 // below Synoptic's documented station-hour cap; native samples are retained.
 for(let offset=0;offset<ids.length;offset+=60){
  const chunk=ids.slice(offset,offset+60);
  const endMs=new Date(event.expireUtc).getTime();
  for(let from=new Date(event.issueUtc).getTime();from<endMs;from+=86400000){
   if(Date.now()>=deadline)throw new BudgetExceeded('Soft runtime budget reached; current event remains resumable.');
   let stations;try{stations=await client.timeseries(chunk,new Date(from),new Date(Math.min(from+86400000,endMs)),cfg);}catch(e){
    errors.push(String(e.message));for(const id of chunk)selected.get(id).agg._fetchError=true;continue;
   }
   for(const station of stations){
    const selectedStation=selected.get(String(station.STID||''));if(!selectedStation)continue;
    const {meta,agg,seen,hazardTimes}=selectedStation,obs=station.OBSERVATIONS||{},times=obs.date_time||[];
    const variable=prefix=>obs[core.findObsKey_(obs,prefix)]||[];
    const temps=variable('air_temp'),winds=variable('wind_speed'),gusts=variable('wind_gust'),rhs=variable('relative_humidity'),dews=variable('dew_point_temperature');
    for(let i=0;i<times.length;i++){
     const when=new Date(times[i]);if(!Number.isFinite(when.getTime())||seen.has(when.getTime())||!core.isTimeActiveForStation_(meta.windows,when))continue;
     const t=core.validRange_(core.toFinite_(temps[i]),-80,140),wind=core.validRange_(core.toFinite_(winds[i]),0,200),gust=core.validRange_(core.toFinite_(gusts[i]),0,250),rh=core.validRange_(core.toFinite_(rhs[i]),0,100);
     let dew=core.validRange_(core.toFinite_(dews[i]),-120,120);if(dew===null&&t!==null&&rh!==null&&rh>0)dew=core.computeDewpointF_(t,rh);
     let wc=core.computeWindChillF_(t,wind),hi=core.computeHeatIndexF_(t,rh);if(wc!==null)wc=core.round_(wc,1);if(hi!==null)hi=core.round_(hi,1);
     if([t,wind,gust,rh,dew,hi,wc].every(v=>v===null))continue;seen.add(when.getTime());
     const flags=core.evaluateSampleCriteria_(event.hazard,meta.rules,t,wc,hi,rh,wind,gust,cfg);
     const whenUtc=when.toISOString();core.updateStationAggregate_(agg,whenUtc,when.getTime(),t,wc,hi,rh,dew,wind,gust,flags,cfg);
     if(hazardUsable(event.hazard,meta.rules,t,wind,gust,rh,hi,cfg))hazardTimes.push(when.getTime());
     samples.push([event.eventKey,meta.areaUgc,meta.STID,whenUtc,t,rh,dew,wind,gust,hi,wc,flags.tempMet?'TRUE':'FALSE',flags.wcMet?'TRUE':'FALSE',flags.hiMet?'TRUE':'FALSE',flags.rfwMet?'TRUE':'FALSE']);
    }
   }
  }
 }
 const summaries=[];for(const {agg,hazardTimes} of selected.values()){
  core.finalizeAggregate_(agg,cfg);
  agg.DATA_COVERAGE_PCT=core.round_(core.coveragePct_(hazardTimes.sort((a,b)=>a-b),core.activeWindowDurationMs_(agg.windows),cfg._durationMaxGapMinutes,agg.windows),1);
  summaries.push(core.rowToObject_(core.EVENT_OBS_HEADERS,core.aggregateToRow_(agg)));
 }
 samples.sort((a,b)=>a[3].localeCompare(b[3])||a[2].localeCompare(b[2]));
 return {summaries,samples,errors};
}
const identity=e=>[e.year,e.wfo,e.hazard,e.phenomena,String(e.eventId)].join('|');
async function runRange({root=path.resolve(__dirname,'..'),client,start,end,force=false,limit=0,budgetMs=45*60000,onProgress=()=>{}}){
 const deadline=Date.now()+budgetMs;
 const {cfg,maps}=loadConfig(root),store=new EventStore(path.join(root,'data/events')),prior=new Map(store.all().map(r=>[identity(r.event),r]));
 const events=[];for(let year=start.getUTCFullYear();year<=new Date(end.getTime()-1).getUTCFullYear();year++)events.push(...groupEvents(await client.eventList(cfg._cwa,year),cfg._cwa,year,start,end));
 const metadata=events.length?await client.metadata(cfg):[],report={schemaVersion:1,startedUtc:new Date().toISOString(),range:{start:start.toISOString(),end:end.toISOString()},computed:0,reused:0,failed:[],deferred:0,budgetExhausted:false};
 if(events.length)atomicWrite(path.join(root,'data/stations.json.gz'),zlib.gzipSync(Buffer.from(JSON.stringify([core.STATION_HEADERS,...metadata.map(st=>[st.STID,st.NAME,st.STATE,st.COUNTY,st.CWA,core.normalizeUgc_(st.NWSZONE),st.LATITUDE,st.LONGITUDE,st.ELEVATION,st.MNET_ID,st.STATUS,st.TIMEZONE])]))));
 let processed=0;
 for(const [eventIndex,event] of events.entries()){
  if(Date.now()>=deadline){report.deferred+=events.length-eventIndex;report.budgetExhausted=true;break;}
  if(limit&&processed>=limit){report.deferred++;continue;}
  const old=prior.get(identity(event));if(old)event.eventKey=old.event.eventKey;
  try{
   const areas=footprintAreas(event,await client.footprint(event)),signature=fingerprint(event,areas,cfg,maps,metadata);
   event.warnedUgcs=[...new Set(areas.map(a=>a.ugc))].sort();
   if(reusable(old,event,signature,force)){report.reused++;onProgress('Reused '+event.eventKey);continue;}
   const computed=await computeObservations(client,event,areas,metadata,cfg,maps,deadline);processed++;
   // Never replace a prior good snapshot with partial fresh provider data.
   if(computed.errors.length)throw Error('Observation request failure(s): '+computed.errors.length+'; prior snapshot retained.');
   const rowTiming=areas.every(a=>a.source==='IEM event-row UGC timing');
   const persisted={eventKey:event.eventKey,eventId:event.eventId,year:event.year,wfo:event.wfo,hazard:event.hazard,phenomena:event.phenomena,significance:event.significance,productLabel:event.productLabel,
    issueUtc:event.issueUtc,expireUtc:event.expireUtc,warnedUgcs:event.warnedUgcs.join(','),footprintSource:'IEM VTEC event footprint',
    areaTimingMode:rowTiming?'UGC-specific event-row timing':'event-wide timing fallback',dataComplete:computed.summaries.length>0,runNote:computed.summaries.length?'Fresh GitHub Actions observation calculation.':'No matching station/rule summaries; observational adequacy unresolved.',imported:false};
   store.save({schemaVersion:1,event:persisted,areas,summaries:computed.summaries,sampleHeaders:core.SAMPLE_HEADERS,samples:computed.samples,cacheFingerprint:signature,
    provenance:{computedUtc:new Date().toISOString(),algorithmVersion:HASH_VERSION,coverageBasis:'hazard-variable availability',providerCompletenessValidated:true}});
   report.computed++;onProgress('Computed '+event.eventKey+' ('+computed.summaries.length+' stations, '+computed.samples.length+' samples)');
  }catch(e){if(e instanceof BudgetExceeded){report.deferred+=events.length-eventIndex;report.budgetExhausted=true;onProgress(e.message);break;}report.failed.push({eventKey:event.eventKey,error:String(e.message)});onProgress('Failed '+event.eventKey+': '+String(e.message));}
 }
 report.finishedUtc=new Date().toISOString();atomicWrite(path.join(root,'data/last-run.json'),JSON.stringify(report,null,2)+'\n');return report;
}
module.exports={computeObservations,runRange,fingerprint,reusable,identity};
