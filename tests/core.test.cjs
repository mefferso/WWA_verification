const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const c=vm.createContext({Date,console});
vm.runInContext(fs.readFileSync('Code.gs','utf8'),c);
const rule=(threshold,comparator,durationHours=null)=>({threshold,comparator,durationHours});
const cfg={_rfwWindBasis:'sustained',_minCoveragePct:50,_tierAIds:{},_tierBIds:{}};
test('Heat Index uses NWS regression and humidity adjustments',()=>{
 assert.ok(Math.abs(c.computeHeatIndexF_(90,70)-105.922)<0.01);
 assert.ok(Math.abs(c.computeHeatIndexF_(100,10)-94.122)<0.02);
 assert.ok(Math.abs(c.computeHeatIndexF_(85,90)-101.78)<0.1);
 assert.equal(c.computeHeatIndexF_(70,50),69.525);
});
test('Meteorological functions reject missing inputs',()=>{
 for(const x of [null,undefined,'',NaN]){
  assert.equal(c.computeHeatIndexF_(x,50),null);
  assert.equal(c.computeWindChillF_(x,10),null);
  assert.equal(c.computeDewpointF_(x,50),null);
 }
 assert.equal(c.computeHeatIndexF_(90,101),null);
});
test('Wind chill valid range and standard reference',()=>{
 assert.ok(Math.abs(c.computeWindChillF_(30,10)-21.248)<0.01);
 assert.equal(c.computeWindChillF_(51,10),null);
 assert.equal(c.computeWindChillF_(30,3),null);
 assert.ok(c.computeWindChillF_(0,10)<0);
});
test('Zero remains a valid observation and threshold',()=>{
 assert.equal(c.toFinite_(0),0);assert.equal(c.toFinite_('0'),0);
 assert.equal(c.toFinite_(null),null);assert.equal(c.toFinite_(''),null);
 assert.equal(c.compare_(0,0,'<='),true);
 assert.equal(c.compare_(undefined,0,'<='),false);
});
test('UGC normalization preserves county and marine identifiers',()=>{
 for(const [a,b] of [['la079','LAZ079'],[' ms087 ','MSZ087'],['LAZ079','LAZ079'],['LAC051','LAC051'],['GMZ570','GMZ570'],['079',''],['LAZ79','']])assert.equal(c.normalizeUgc_(a),b);
});
test('Only matching station windows are used for known footprints',()=>{
 const start=new Date(0),end=new Date(3600000);
 const e={issue:start,expire:end,warnedUgcs:['LAZ079'],areas:[{ugc:'LAZ079',start,end}]};
 assert.equal(c.getAreaWindowsForStation_(e,'LAZ079').length,1);
 assert.equal(c.getAreaWindowsForStation_(e,'LAZ080').length,0);
 assert.equal(c.getAreaWindowsForStation_({...e,areas:[],warnedUgcs:[]},'LAZ079').length,0);
});
test('Duration counts spans between consecutive true samples',()=>{
 const stats=c.computeRunStats_([{ms:0,x:true},{ms:600000,x:true},{ms:1200000,x:true}],'x',30);
 assert.equal(stats.maxContinuousMin,20);assert.equal(stats.cumulativeMin,20);
 assert.equal(c.computeRunStats_([{ms:0,x:true}],'x',30).maxContinuousMin,0);
 assert.equal(c.computeRunStats_([{ms:0,x:true},{ms:3600000,x:true}],'x',30).maxContinuousMin,0);
 assert.equal(c.computeRunStats_([{ms:0,x:true},{ms:600000,x:false},{ms:1200000,x:true}],'x',30).maxContinuousMin,0);
 assert.equal(c.durationSatisfied_(59,rule(113,'>=',1)),false);
 assert.equal(c.durationSatisfied_(60,rule(113,'>=',1)),true);
});
test('Duration and coverage cannot bridge inactive warned windows',()=>{
 const windows=[{start:new Date(0),end:new Date(600000)},{start:new Date(1200000),end:new Date(1800000)}];
 assert.equal(c.activeWindowDurationMs_(windows),1200000);
 assert.equal(c.computeRunStats_([{ms:600000,x:true},{ms:1200000,x:true}],'x',30,windows).maxContinuousMin,0);
 assert.equal(c.coveragePct_([600000,1200000],1200000,30,windows),0);
});
test('RFW requires simultaneous RH and selected wind basis',()=>{
 const rules={RH_PCT:rule(25,'<='),WIND_MPH:rule(25,'>=')};
 assert.equal(c.evaluateSampleCriteria_('RFW',rules,null,null,null,20,10,30,cfg).rfwMet,false);
 assert.equal(c.evaluateSampleCriteria_('RFW',rules,null,null,null,20,10,30,{...cfg,_rfwWindBasis:'gust'}).rfwMet,true);
 assert.equal(c.evaluateSampleCriteria_('RFW',rules,null,null,null,40,30,40,cfg).rfwMet,false);
});
test('Threshold precedence is state then county then zone',()=>{
 const maps={area:{},zone:{}};
 c.addRuleRow_(maps.area,['EH','LA','ALL','TEMP_F',105,'>=',null],false);
 c.addRuleRow_(maps.area,['EH','LA','St. Tammany Parish','TEMP_F',104,'>=',null],false);
 c.addRuleRow_(maps.zone,['EH','LA','LA079','TEMP_F',103,'>=',null],true);
 assert.equal(c.lookupRulesForArea_(maps,'EH','LA','Saint Tammany County','LAZ079').TEMP_F.threshold,103);
});
test('Missing hazard metrics cannot establish NOT_MET from unrelated wind coverage',()=>{
 const r={HAZARD:'EH',OBS_COUNT:20,DATA_COVERAGE_PCT:100,NETWORK_TIER:'A',MAX_TEMP_F:null,MAX_HEAT_INDEX_F:null};
 assert.equal(c.evaluateStation_(r,{TEMP_F:rule(105,'>=')},cfg).status,'INDETERMINATE');
});
test('Unchecked QC cannot produce high confidence',()=>{
 assert.equal(c.stationConfidence_({NETWORK_TIER:'A',DATA_COVERAGE_PCT:100,QC_POLICY:'off'},'MET',cfg),'LOW');
});
test('Completed cache requires matching footprint and calculation fingerprint',()=>{
 const event={eventKey:'k',expireUtc:'2020-01-01T01:00Z',warnedUgcs:['LAZ079'],cacheFingerprint:'abc'};
 const cache={events:{k:{DATA_COMPLETE:'TRUE',EXPIRE_UTC:event.expireUtc,WARNED_UGCS:'LAZ080',RUN_NOTE:'[cache:abc]'}},obs:{k:[[]]}};
 assert.equal(c.shouldReuseCompletedEvent_(event,cache,cfg),false);
 cache.events.k.WARNED_UGCS='LAZ079';cache.events.k.RUN_NOTE='legacy';
 assert.equal(c.shouldReuseCompletedEvent_(event,cache,cfg),false);
 cache.events.k.RUN_NOTE='[cache:abc]';assert.equal(c.shouldReuseCompletedEvent_(event,cache,cfg),true);
});
test('Synoptic HTTP 200 authentication errors are not treated as empty observations',()=>{
 c.UrlFetchApp={fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({SUMMARY:{RESPONSE_CODE:200,RESPONSE_MESSAGE:'sensitive provider text'}})})};
 assert.throws(()=>c.fetchJsonWithRetry_('https://api.synopticdata.com/v2/stations/timeseries?token=private',1),/Synoptic response code 200/);
});
test('Station selection excludes un-warned stations before any API request',()=>{
 const event={eventKey:'k',hazard:'EH',year:2020,eventId:'1',issue:new Date(0),expire:new Date(600000),issueUtc:'1970-01-01T00:00Z',expireUtc:'1970-01-01T00:10Z',warnedUgcs:['LAZ079'],areas:[{ugc:'LAZ079',start:new Date(0),end:new Date(600000)}]};
 const rows=[[],['UNWARNED','Test','LA','St. Tammany','LIX','LA080',30,-90,0,'1','ACTIVE']];
 assert.equal(c.computeEventObservationsInMemory_({...cfg,_cwa:'LIX'},event,{area:{},zone:{}},rows).summaryRows.length,0);
});
test('An overlapping window union allows duration while duplicate timestamps preserve it',()=>{
 const windows=[{start:new Date(0),end:new Date(900000)},{start:new Date(600000),end:new Date(1200000)}];
 assert.equal(c.activeWindowDurationMs_(windows),1200000);
 assert.equal(c.computeRunStats_([{ms:0,x:true},{ms:600000,x:true},{ms:600000,x:true},{ms:1200000,x:true}],'x',30,windows).maxContinuousMin,20);
});
