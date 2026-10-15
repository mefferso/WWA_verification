'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadConfig}=require('../src/config.cjs'),{computeObservations}=require('../src/runner.cjs');
const {recalculate}=require('../src/recalculate.cjs');
const event={eventKey:'buffer-test',year:2025,wfo:'LIX',hazard:'EC',issueUtc:'2025-01-21T12:00:00Z',expireUtc:'2025-01-21T13:00:00Z'};
const areas=[{ugc:'LAZ079',startUtc:event.issueUtc,endUtc:event.expireUtc}];
const metadata=[{STID:'TEST',STATE:'LA',COUNTY:'St. Tammany',CWA:'LIX',NWSZONE:'LA079',MNET_ID:1}];
test('Six-hour context is retained without influencing official verification',async()=>{
 const {cfg,maps}=loadConfig();
 const calls=[];
 const client={timeseries:async(ids,start,end)=>{calls.push([start.toISOString(),end.toISOString()]);return [{STID:'TEST',OBSERVATIONS:{
  date_time:['2025-01-21T11:00:00Z','2025-01-21T12:30:00Z','2025-01-21T13:30:00Z'],
  air_temp_set_1:[-40,10,-50],wind_speed_set_1:[5,5,5]}}]}};
 const out=await computeObservations(client,event,areas,metadata,cfg,maps);
 assert.equal(calls[0][0],'2025-01-21T06:00:00.000Z');
 assert.equal(calls.at(-1)[1],'2025-01-21T19:00:00.000Z');
 assert.deepEqual(out.samples.map(s=>s[3]),['2025-01-21T12:30:00.000Z']);
 assert.deepEqual(out.contextSamples.map(s=>s[3]),['2025-01-21T11:00:00.000Z','2025-01-21T13:30:00.000Z']);
 const record={event,areas,summaries:out.summaries,samples:out.samples,contextSamples:out.contextSamples};
 const baseline=recalculate({...record,contextSamples:[]},cfg,maps);
 const withContext=recalculate(record,cfg,maps);
 assert.deepEqual(withContext.summaries,baseline.summaries);
 assert.deepEqual(withContext.samples,baseline.samples);
});
