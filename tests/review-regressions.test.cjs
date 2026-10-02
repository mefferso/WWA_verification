const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadConfig}=require('../src/config.cjs'),{reusable,computeObservations}=require('../src/runner.cjs'),{results}=require('../src/payload.cjs');
const event={eventKey:'k',year:2026,eventId:'1',wfo:'LIX',hazard:'EC',issueUtc:'2026-08-01T00:00:00Z',expireUtc:'2026-08-01T00:20:00Z',warnedUgcs:['LAZ079']};
const areas=[{ugc:'LAZ079',startUtc:event.issueUtc,endUtc:event.expireUtc}],metadata=[{STID:'IN',STATE:'LA',COUNTY:'St. Tammany',CWA:'LIX',NWSZONE:'LA079',MNET_ID:1}];
test('Terminal cache requires observations fetched after expiry and settling period',()=>{
 const old={event:{...event,dataComplete:true},cacheFingerprint:'s',summaries:[{OBS_COUNT:3}],samples:[[1]],provenance:{computedUtc:'2026-08-01T00:10:00Z'}};
 assert.equal(reusable(old,event,'s',false,Date.parse('2026-08-02')),false);
 old.provenance.computedUtc='2026-08-01T02:00:00Z';assert.equal(reusable(old,event,'s',false,Date.parse('2026-08-02')),true);
 old.samples=[];assert.equal(reusable(old,event,'s',false,Date.parse('2026-08-02')),false);
});
test('Implicit cold wind-chill alternative requires wind coverage for NOT_MET',async()=>{
 const {cfg,maps}=loadConfig();const out=await computeObservations({timeseries:async()=>[{STID:'IN',OBSERVATIONS:{date_time:['2026-08-01T00:00Z','2026-08-01T00:10Z','2026-08-01T00:20Z'],air_temp_set_1:[30,30,30],wind_speed_set_1:[4,null,null]}}]},event,areas,metadata,cfg,maps);
 assert.equal(out.summaries[0].DATA_COVERAGE_PCT,0);assert.equal(results({event,areas,...out},cfg,maps)[0].VERIFY_STATUS,'INDETERMINATE');
});
test('Publishing changed wind policy recalculates simultaneous flags from samples',async()=>{
 const {cfg,maps}=loadConfig(),gustCfg={...cfg,_rfwWindBasis:'gust'};
 const rfw={...event,hazard:'RFW'};const out=await computeObservations({timeseries:async()=>[{STID:'IN',OBSERVATIONS:{date_time:['2026-08-01T00:00Z','2026-08-01T00:10Z','2026-08-01T00:20Z'],air_temp_set_1:[80,80,80],relative_humidity_set_1:[20,20,20],wind_speed_set_1:[10,10,10],wind_gust_set_1:[30,30,30]}}]},rfw,areas,metadata,gustCfg,maps);
 assert.equal(results({event:rfw,areas,...out},gustCfg,maps)[0].VERIFY_STATUS,'MET');assert.equal(results({event:rfw,areas,...out},cfg,maps)[0].VERIFY_STATUS,'NOT_MET');
});
test('Budget interruption preserves prior snapshot and leaves events resumable',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{runRange}=require('../src/runner.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wwa-budget-'));try{
 fs.cpSync(path.resolve(__dirname,'../config'),path.join(root,'config'),{recursive:true});
 const client={eventList:async()=>[{phenomena:'EC',significance:'W',eventid:1,issue:event.issueUtc,expire:event.expireUtc}],metadata:async()=>metadata,footprint:async()=>{throw Error('should not fetch');}};
 const report=await runRange({root,client,start:new Date('2026-08-01'),end:new Date('2026-09-01'),budgetMs:0});assert.equal(report.deferred,1);assert.equal(report.failed.length,0);assert.equal(report.budgetExhausted,true);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Failed fresh provider request keeps the entire previous event checkpoint',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{runRange}=require('../src/runner.cjs'),{EventStore}=require('../src/store.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wwa-retain-'));try{
 fs.cpSync(path.resolve(__dirname,'../config'),path.join(root,'config'),{recursive:true});const store=new EventStore(path.join(root,'data/events'));
 const old={event:{...event,phenomena:'EC',significance:'W',dataComplete:true},areas,summaries:[{STID:'old'}],samples:[[0]],cacheFingerprint:'old'};store.save(old);
 const client={eventList:async()=>[{phenomena:'EC',significance:'W',eventid:1,issue:event.issueUtc,expire:event.expireUtc,ugcs:['LAZ079']}],metadata:async()=>metadata,footprint:async()=>[{id:'LAZ079',properties:{},geometry:null}],timeseries:async()=>{throw Error('HTTP 503');}};
 const report=await runRange({root,client,start:new Date('2026-08-01'),end:new Date('2026-09-01'),force:true});assert.equal(report.failed.length,1);assert.deepEqual(store.load('k'),old);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Revisiting an event retains its loaded warning geometry',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const html=fs.readFileSync(path.resolve(__dirname,'../site/index.html'),'utf8');
 const func=html.slice(html.indexOf('  async function renderEvent('),html.indexOf('  async function loadEventFootprint('));
 const polygon={ugc:'LAZ079',geometry:{type:'Polygon',coordinates:[]}};
 const ctx={eventRequestToken:0,currentEvent:null,eventMap:{A:{eventKey:'A'},B:{eventKey:'B'}},WwaData:{getEventPayload:async key=>({rows:[],areaVerification:[],events:[{eventKey:key}],areas:{[key]:[{ugc:'LAZ079',geometry:null}]}})},payload:{areas:{A:[polygon]}},footprintLoaded:{A:true},currentRows:[],currentAreaVerification:[],timelineMode:false,timelineData:{},timelineBuckets:[]};
 for(const n of ['showLoading','hideLoading','setTimelineButtons','updateHeader','renderWarnedAreas','renderStations','renderAreaList','loadTimeline','fitEventBounds','loadEventFootprint','toast'])ctx[n]=()=>{};
 vm.createContext(ctx);vm.runInContext(func,ctx);await ctx.renderEvent('A');await ctx.renderEvent('B');await ctx.renderEvent('A');assert.deepEqual(ctx.payload.areas.A,[polygon]);
});
test('Completed partial verification is eligible for a fresh Pages build',()=>{
 const fs=require('node:fs'),path=require('node:path');const workflow=fs.readFileSync(path.resolve(__dirname,'../.github/workflows/pages.yml'),'utf8');
 const expression=workflow.match(/    if: (.+)/)[1];for(const conclusion of ['success','failure']){
  const evaluated=expression.replaceAll("github.event_name","'workflow_run'").replaceAll('github.event.workflow_run.conclusion',JSON.stringify(conclusion));assert.equal(Function('return '+evaluated)(),true);
 }
});
