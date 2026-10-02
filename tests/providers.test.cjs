const {test}=require('node:test'),assert=require('node:assert/strict');
test('Provider errors redact token, query string, and response body',async()=>{
 const {createClient}=require('../src/providers.cjs');const client=createClient({token:'SUPER_PRIVATE',attempts:1,fetchImpl:async()=>({ok:false,status:401,text:async()=> 'SUPER_PRIVATE'})});
 await assert.rejects(()=>client.metadata({cwa:'LIX',vars:'air_temp'}),e=>!e.message.includes('SUPER_PRIVATE')&&!e.message.includes('token=')&&e.message.includes('HTTP 401'));
});
test('HTTP-200 Synoptic authentication failures reject, zero-results succeeds',async()=>{
 const {createClient}=require('../src/providers.cjs');
 const auth=createClient({token:'private',attempts:1,fetchImpl:async()=>({ok:true,status:200,json:async()=>({SUMMARY:{RESPONSE_CODE:200,RESPONSE_MESSAGE:'private'}})})});
 await assert.rejects(()=>auth.metadata({cwa:'LIX',vars:'air_temp'}),/Synoptic response code 200/);
 const empty=createClient({token:'private',attempts:1,fetchImpl:async()=>({ok:true,status:200,json:async()=>({SUMMARY:{RESPONSE_CODE:2},STATION:[]})})});assert.deepEqual(await empty.metadata({cwa:'LIX',vars:'air_temp'}),[]);
});
test('Event grouping preserves phenom identity and overlap windows',()=>{
 const {groupEvents}=require('../src/providers.cjs');
 const rows=[{phenomena:'XH',significance:'W',eventid:1,issue:'2026-08-01T15:00Z',expire:'2026-08-02T00:00Z'},
  {phenomena:'EH',significance:'W',eventid:1,issue:'2026-08-01T15:00Z',expire:'2026-08-02T00:00Z'},
  {phenomena:'SV',significance:'W',eventid:1,issue:'2026-08-01T15:00Z',expire:'2026-08-02T00:00Z'}];
 const events=groupEvents(rows,'LIX',2026,new Date('2026-08-01'),new Date('2026-09-01'));assert.equal(events.length,2);assert.notEqual(events[0].eventKey,events[1].eventKey);
});
test('Wind-only timestamps cannot establish full heat observation coverage',async()=>{
 const {computeObservations}=require('../src/runner.cjs'),{loadConfig}=require('../src/config.cjs');const {cfg,maps}=loadConfig();
 const event={eventKey:'k',hazard:'EH',year:2026,eventId:'1',issueUtc:'2026-08-01T00:00Z',expireUtc:'2026-08-01T00:20Z',warnedUgcs:['LAZ079']};
 const areas=[{ugc:'LAZ079',startUtc:event.issueUtc,endUtc:event.expireUtc}];
 const metadata=[{STID:'IN',NAME:'Test',STATE:'LA',COUNTY:'St. Tammany',CWA:'LIX',NWSZONE:'LA079',LATITUDE:30,LONGITUDE:-90,MNET_ID:1},
  {STID:'OUT',STATE:'LA',COUNTY:'St. Tammany',CWA:'LIX',NWSZONE:'LA080'}];
 const seen=[];const client={timeseries:async stids=>{seen.push(...stids);return [{STID:'IN',OBSERVATIONS:{date_time:['2026-08-01T00:00Z','2026-08-01T00:10Z','2026-08-01T00:20Z'],air_temp_set_1:[80,null,null],relative_humidity_set_1:[50,null,null],wind_speed_set_1:[5,5,5]}}];}};
 const out=await computeObservations(client,event,areas,metadata,cfg,maps);assert.deepEqual(seen,['IN']);assert.equal(out.summaries.length,1);assert.equal(out.summaries[0].DATA_COVERAGE_PCT,0);assert.equal(out.samples.length,3);
});
