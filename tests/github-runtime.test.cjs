const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('Native Node core preserves meteorological and zero semantics',()=>{
 const core=require('../src/core.cjs');
 assert.ok(Math.abs(core.computeHeatIndexF_(90,70)-105.922)<0.01);
 assert.ok(Math.abs(core.computeWindChillF_(30,10)-21.248)<0.01);
 assert.equal(core.computeHeatIndexF_(null,70),null);
 assert.equal(core.normalizeUgc_('LA079'),'LAZ079');assert.equal(core.toFinite_(0),0);
});
test('Per-event store safely names files and round-trips all native samples',()=>{
 const {EventStore,eventId}=require('../src/store.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wwa-test-'));
 try{
  const store=new EventStore(dir);const record={event:{eventKey:'2026|LIX|EH|XH|4|202608151600'},areas:[],summaries:[],samples:[[0,null,false]]};
  store.save(record);assert.deepEqual(store.load(record.event.eventKey),record);
  assert.match(eventId('../unsafe|key'),/^[a-f0-9]{24}$/);
  assert.equal(store.all().length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Rebuilt areas join actual warned UGCs and use establishing station confidence',()=>{
 const {areaVerification}=require('../src/payload.cjs');
 const record={event:{eventKey:'k',year:2026,hazard:'EH',eventId:'1'},areas:[{ugc:'LAZ079'}]};
 const rows=[{EVENT_KEY:'k',AREA_UGC:'LAZ079',STID:'A',VERIFY_STATUS:'NOT_MET',NETWORK_TIER:'A',CONFIDENCE:'HIGH',DATA_COVERAGE_PCT:100},
  {EVENT_KEY:'k',AREA_UGC:'LAZ079',STID:'C',VERIFY_STATUS:'MET',NETWORK_TIER:'C',CONFIDENCE:'LOW',DATA_COVERAGE_PCT:60},
  {EVENT_KEY:'k',AREA_UGC:'LAZ080',STID:'OUTSIDE',VERIFY_STATUS:'MET',CONFIDENCE:'HIGH'}];
 const areas=areaVerification(record,rows);assert.equal(areas.length,1);assert.equal(areas[0].VERIFY_STATUS,'MET');assert.equal(areas[0].CONFIDENCE,'LOW');assert.equal(areas[0].STATION_COUNT,2);
});
test('Site build publishes every archived event and only safe static payloads',()=>{
 const {buildSite}=require('../scripts/build-site.cjs');const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'wwa-site-'));
 try{
  const {EventStore}=require('../src/store.cjs'),source=new EventStore(path.join(root,'data/events')).all();
  const report=buildSite({root,outDir:dir});assert.equal(report.events,source.length);assert.equal(report.summaries,source.reduce((n,r)=>n+r.summaries.length,0));assert.equal(report.samples,source.reduce((n,r)=>n+r.samples.length,0));
  const imported=JSON.parse(fs.readFileSync(path.join(root,'data/import-report.json')));assert.equal(imported.summaryRows,1754);assert.equal(imported.sampleRows,55217);assert.equal(imported.events,14);
  const index=JSON.parse(fs.readFileSync(path.join(dir,'data/index.json')));assert.equal(index.events.length,source.length);
  assert.ok(index.events.filter(e=>e.imported).every(e=>e.dataComplete===false));
  assert.equal(fs.existsSync(path.join(dir,'config')),false);assert.equal(fs.existsSync(path.join(dir,'Code.gs')),false);
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');assert.equal(html.includes('google.script.run'),false);assert.ok(html.includes('github-runtime.js'));
  const gzip=require('node:zlib'),records=fs.readdirSync(path.join(dir,'data/events')).filter(f=>/^[a-f0-9]{24}\.json\.gz$/.test(f)).map(f=>JSON.parse(gzip.gunzipSync(fs.readFileSync(path.join(dir,'data/events',f)))));
  assert.equal(records.reduce((n,r)=>n+r.rows.length,0),report.summaries);
  assert.ok(records.every(r=>r.areaVerification.every(a=>['MET','NOT_MET','INDETERMINATE','NO_DATA'].includes(a.VERIFY_STATUS))));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
