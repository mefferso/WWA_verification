const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib');
const code=fs.readFileSync(require('node:path').resolve(__dirname,'../site/github-runtime.js'),'utf8');
for(const compressed of [true,false])test('Static adapter reads '+(compressed?'gzip':'HTTP-decompressed')+' event data and resets its cache',async()=>{
 const index={events:[{eventKey:'A',file:'abcdef.json.gz'}]},samples={eventKey:'A',headers:['STID','TEMP_F','TEMP_MET'],rows:[['ZERO',0,true]]};let calls=0;
 const ctx={window:{DecompressionStream},document:{baseURI:'https://mefferso.github.io/WWA_verification/'},URL,URLSearchParams,Uint8Array,Blob,Response,DecompressionStream,TextDecoder,
 fetch:async url=>{calls++;const file=String(url);if(file.endsWith('index.json'))return new Response(JSON.stringify(index));const bytes=Buffer.from(JSON.stringify(samples));return new Response(compressed?zlib.gzipSync(bytes):bytes);}};
 vm.createContext(ctx);vm.runInContext(code,ctx);const api=ctx.window.WwaData;
 const result=await api.getTimeline('A');assert.equal(result.samples[0].TEMP_F,0);assert.equal(result.samples[0].TEMP_MET,'TRUE');assert.equal(calls,2);
 await api.getTimeline('A');assert.equal(calls,2);api.clear();await api.getTimeline('A');assert.equal(calls,4);
});
