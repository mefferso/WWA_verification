const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function context(){const c=vm.createContext({Date});vm.runInContext(fs.readFileSync('Code.gs','utf8'),c);return c;}
function sheet(initial,failAt=0){
 const data=initial.map(r=>r.slice()),ops=[];let writes=0,maxRows=initial.length||1,maxCols=initial[0]?.length||1;
 const s={data,ops,getLastRow:()=>data.length,getLastColumn:()=>Math.max(...data.map(r=>r.length),0),getMaxRows:()=>maxRows,getMaxColumns:()=>maxCols,
  insertRowsAfter:(_,n)=>{maxRows+=n;},insertColumnsAfter:(_,n)=>{maxCols+=n;},getDataRange:()=>({getValues:()=>data.map(r=>r.slice())}),
  getRange:(r,col,n,m)=>({setValues:values=>{ops.push('write');if(++writes===failAt)throw Error('simulated interruption');for(let i=0;i<n;i++){data[r+i-1]??=[];for(let j=0;j<m;j++)data[r+i-1][col+j-1]=values[i][j];}},
   clearContent:()=>{ops.push('clear');for(let i=0;i<n;i++)for(let j=0;j<m;j++)if(data[r+i-1])data[r+i-1][col+j-1]='';},
   getValues:()=>data.slice(r-1,r-1+n).map(a=>a.slice(col-1,col-1+m))}),
  setFrozenRows:()=>{},hideSheet:()=>{},showSheet:()=>{}};
 return s;
}
test('Chunk writer writes before clearing tails and expands grid',()=>{
 const c=context(),s=sheet([['h','extra'],['old','extra'],['tail','extra']]);
 c.writeSheetDataChunked_(s,[['h'],['new']],1,100);
 assert.equal(s.ops[0],'write');assert.equal(s.data[1][0],'new');assert.equal(s.data[2][0],'');assert.equal(s.data[0][1],'');
 const bigger=sheet([['h']]);c.writeSheetDataChunked_(bigger,[['h','h2'],['v','v2']],2,100);assert.equal(bigger.getMaxRows(),2);assert.equal(bigger.getMaxColumns(),2);
});
test('An interrupted first write does not pre-clear existing history',()=>{
 const c=context(),s=sheet([['h'],['old']],1);
 assert.throws(()=>c.writeSheetDataChunked_(s,[['h'],['new']],1,100),/interruption/);
 assert.deepEqual(s.data,[['h'],['old']]);assert.equal(s.ops.includes('clear'),false);
});
test('Event-key replacement preserves other events and rejects incompatible history',()=>{
 const c=context(),s=sheet([['EVENT_KEY','value'],['keep','old'],['replace','old']]);c.prepareSheet_=()=>s;
 c.replaceRowsForEventKeys_('test',['EVENT_KEY','value'],[['replace','new']],['replace'],0,false);
 assert.deepEqual(s.data,[['EVENT_KEY','value'],['keep','old'],['replace','new']]);
 const bad=sheet([['WRONG'],['old']]);c.prepareSheet_=()=>bad;
 assert.throws(()=>c.replaceRowsForEventKeys_('test',['EVENT_KEY'],[],['x'],0,false),/schema mismatch/);
 assert.deepEqual(bad.data,[['WRONG'],['old']]);
});
test('Write lock releases on failure and refuses overlapping work',()=>{
 const c=context();let released=false,called=false;
 c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{released=true;}})};
 assert.throws(()=>c.withWriteLock_(()=>{throw Error('failure');}),/failure/);assert.equal(released,true);
 c.LockService={getScriptLock:()=>({tryLock:()=>false})};assert.throws(()=>c.withWriteLock_(()=>{called=true;}),/Another verification/);assert.equal(called,false);
});
test('Fingerprint ignores secrets and changes when thresholds or timing change',()=>{
 const c=context();c.Utilities={DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,text)=>[...crypto.createHash('sha256').update(text).digest()]};
 const e={areas:[{ugc:'LAZ079',start:new Date(0),end:new Date(600000)}]},cfg={_token:'sensitive','Synoptic API token':'sensitive'};
 const one=c.eventCacheFingerprint_(e,cfg,{area:{},zone:{}},[]);
 assert.equal(one,c.eventCacheFingerprint_(e,{...cfg,_token:'changed','Synoptic API token':'changed'},{area:{},zone:{}},[]));
 assert.notEqual(one,c.eventCacheFingerprint_(e,cfg,{area:{rule:113},zone:{}},[]));
 assert.notEqual(one,c.eventCacheFingerprint_({areas:[{...e.areas[0],end:new Date(1200000)}]},cfg,{area:{},zone:{}},[]));
});
test('Zero coverage setting and preferred Script Properties retain compatibility',()=>{
 const c=context();c.sh_=()=>({getDataRange:()=>({getValues:()=>[['Key','Value'],['Synoptic API token','legacy'],['Minimum coverage for nonverify %',0],['QC remove flagged (on/off)','off']]})});
 c.PropertiesService={getScriptProperties:()=>({getProperty:()=> 'preferred'})};
 const cfg=c.readConfig_();assert.equal(cfg._token,'preferred');assert.equal(cfg._minCoveragePct,0);assert.equal(cfg._qcRemove,'off');
 c.PropertiesService={getScriptProperties:()=>({getProperty:()=>null})};assert.equal(c.readConfig_()._token,'legacy');
});
