'use strict';
const core=require('./core.cjs');
const IEM='https://mesonet.agron.iastate.edu',SYNOPTIC='https://api.synopticdata.com/v2';
function groupEvents(rows,wfo,year,start,end){
 const groups=new Map();
 for(const row of rows){
  const phenomena=String(row.phenomena||row.phenom||row.type||'').trim().toUpperCase();
  const significance=String(row.significance||row.sig||'').trim().toUpperCase(),hazard=core.getHazardFromIem_(phenomena,significance);
  const issueValue=row.issue||row.issued||row.init_issue||row.init_iss,expireValue=row.expire||row.expired||row.init_expire||row.init_exp;
  if(!hazard||!issueValue||!expireValue)continue;
  const issue=new Date(issueValue),expire=new Date(expireValue),eventId=String(row.eventid??row.etn??'').trim();
  if(!eventId||!Number.isFinite(issue.getTime())||!Number.isFinite(expire.getTime())||expire<=start||issue>=end||expire<=issue)continue;
  const key=[hazard,phenomena,eventId].join('|');
  if(!groups.has(key))groups.set(key,{year,wfo,hazard,phenomena,significance,eventId,issue,expire,rawRows:[]});
  const e=groups.get(key);if(issue<e.issue)e.issue=issue;if(expire>e.expire)e.expire=expire;e.rawRows.push(row);
 }
 return [...groups.values()].map(e=>({...e,eventKey:[year,wfo,e.hazard,e.phenomena,e.eventId,core.fmtYmdHm_(e.issue)].join('|'),
  issueUtc:core.toIsoMinute_(e.issue),expireUtc:core.toIsoMinute_(e.expire),productLabel:core.resolveProductLabel_(e.hazard,{[e.phenomena]:true})})).sort((a,b)=>a.issue-b.issue);
}
function createClient({token,fetchImpl=fetch,attempts=3,timeoutMs=45000,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 async function json(base,params){
  const url=core.buildUrl_(base,params);let last;
  for(let i=0;i<attempts;i++){
   let response;
   try{response=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),headers:{Accept:'application/json'}});}catch{last=Error('Network/timeout failure from '+base);}
   if(response){
    if(!response.ok){last=Error('HTTP '+response.status+' from '+base);if(response.status>=400&&response.status<500&&response.status!==429)break;}
    else{
     let data;try{data=await response.json();}catch{last=Error('Invalid JSON from '+base);}
     if(data){const code=data.SUMMARY?.RESPONSE_CODE;if(code!=null&&![1,2].includes(Number(code))){last=Error('Synoptic response code '+Number(code)+' from '+base);break;}return data;}
    }
   }
   if(i<attempts-1)await sleep(500*2**i);
  }
  throw last||Error('Provider request failed');
 }
 function auth(){if(!token)throw Error('Missing SYNOPTIC_API_TOKEN GitHub Actions secret');return token;}
 return {
  async eventList(wfo,year){const data=await json(IEM+'/json/vtec_events.py',{wfo,year});if(!Array.isArray(data.events))throw Error('Unexpected IEM event-list schema');return data.events;},
  async footprint(event){const data=await json(IEM+'/geojson/vtec_event.py',{wfo:event.wfo,year:event.year,phenomena:event.phenomena,significance:event.significance,etn:event.eventId});if(!Array.isArray(data.features))throw Error('Unexpected IEM footprint schema');return data.features;},
  async metadata(cfg){const data=await json(SYNOPTIC+'/stations/metadata',{token:auth(),cwa:cfg.cwa||cfg._cwa,complete:1,vars:cfg.vars||cfg._vars,varsoperator:'or'});if(!Array.isArray(data.STATION)&&Number(data.SUMMARY?.RESPONSE_CODE)!==2)throw Error('Unexpected Synoptic metadata schema');return data.STATION||[];},
  async timeseries(stids,start,end,cfg){const data=await json(SYNOPTIC+'/stations/timeseries',{token:auth(),stid:stids.join(','),start:core.fmtYmdHm_(start),end:core.fmtYmdHm_(end),vars:cfg._vars,varsoperator:'or',units:cfg._units,complete:1,qc:'on',qc_checks:cfg._qcChecks,qc_remove_data:cfg._qcRemove,qc_flags:'on'});if(!Array.isArray(data.STATION)&&Number(data.SUMMARY?.RESPONSE_CODE)!==2)throw Error('Unexpected Synoptic timeseries schema');return data.STATION||[];}
 };
}
function footprintAreas(event,features){
 const rowWindows=new Map();
 for(const row of event.rawRows||[]){
  const values=[row.ugcs,row.ugc,row.nws_ugc,row.nws_ugcs,row.zones,row.zone].filter(v=>v!=null);
  for(const value of values)for(const part of Array.isArray(value)?value:String(value).split(/[\s,;]+/)){
   const ugc=core.normalizeUgc_(part);if(!ugc)continue;
   const start=new Date(row.issue||row.issued||row.init_issue||row.init_iss||event.issueUtc),end=new Date(row.expire||row.expired||row.init_expire||row.init_exp||event.expireUtc);
   if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)continue;
   if(!rowWindows.has(ugc))rowWindows.set(ugc,[]);
   rowWindows.get(ugc).push({ugc,startUtc:core.toIsoMinute_(start),endUtc:core.toIsoMinute_(end),action:String(row.action||row.status||''),geometry:null,source:'IEM event-row UGC timing'});
  }
 }
 const geometry=new Map();
 for(const ft of features){const ugc=core.normalizeUgc_(ft.properties?.ugc||ft.properties?.nws_ugc)||core.normalizeUgc_(ft.id);if(!ugc)continue;
  if(ft.geometry)geometry.set(ugc,ft.geometry);
  if(!rowWindows.has(ugc))rowWindows.set(ugc,[{ugc,startUtc:event.issueUtc,endUtc:event.expireUtc,action:'',geometry:null,source:'IEM event GeoJSON + event-wide timing fallback'}]);
 }
 const areas=[...rowWindows].sort(([a],[b])=>a.localeCompare(b)).flatMap(([ugc,windows])=>windows.map(w=>({...w,geometry:geometry.get(ugc)||null})));
 if(!areas.length)throw Error('Unresolved warned footprint; existing event snapshot preserved');
 return areas;
}
module.exports={createClient,groupEvents,footprintAreas};
