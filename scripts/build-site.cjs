'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {recalculate}=require('../src/recalculate.cjs');
const {loadConfig}=require('../src/config.cjs'),{EventStore,eventId,atomicWrite}=require('../src/store.cjs'),{buildIndex,eventPayload}=require('../src/payload.cjs');
function buildSite({root=path.resolve(__dirname,'..'),outDir=path.join(root,'dist')}={}){
 const {cfg,maps}=loadConfig(root),records=new EventStore(path.join(root,'data/events')).all();
 fs.mkdirSync(outDir,{recursive:true});fs.mkdirSync(path.join(outDir,'data/events'),{recursive:true});
 for(const file of ['index.html','github-runtime.js'])fs.copyFileSync(path.join(root,'site',file),path.join(outDir,file));
 atomicWrite(path.join(outDir,'.nojekyll'),'');
 const index=buildIndex(records,cfg,maps);index.repository='mefferso/WWA_verification';
 if(fs.existsSync(path.join(root,'data/last-run.json')))index.lastRun=JSON.parse(fs.readFileSync(path.join(root,'data/last-run.json')));
 atomicWrite(path.join(outDir,'data/index.json'),JSON.stringify(index));
 let summaries=0,samples=0;
 for(const record of records){
  const payload=eventPayload(record,cfg,maps);summaries+=record.summaries.length;samples+=record.samples.length;
  const key=record.event.eventKey,id=eventId(key);
  atomicWrite(path.join(outDir,'data/events',id+'.json.gz'),zlib.gzipSync(Buffer.from(JSON.stringify(payload)),{level:9}));
  atomicWrite(path.join(outDir,'data/events',id+'.samples.json.gz'),zlib.gzipSync(Buffer.from(JSON.stringify({eventKey:key,headers:record.sampleHeaders,rows:recalculate(record,cfg,maps).samples})),{level:9}));
  atomicWrite(path.join(outDir,'data/events',id+'.footprint.json.gz'),zlib.gzipSync(Buffer.from(JSON.stringify({eventKey:key,areas:record.areas})),{level:9}));
 }
 return {events:records.length,summaries,samples};
}
if(require.main===module)console.log(JSON.stringify(buildSite()));
module.exports={buildSite};
