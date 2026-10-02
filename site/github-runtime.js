/* Public read-only adapter. Tokens and authenticated writes stay in Actions. */
window.WwaData=(()=>{
 let indexPromise;const pending=new Map();
 const base=new URL('data/',document.baseURI);
 async function read(url,gzip=false){
  const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw Error('Data request failed: HTTP '+response.status);
  if(!gzip)return response.json();
  const bytes=new Uint8Array(await response.arrayBuffer());
  // Some hosts decompress gzip at HTTP level; avoid double decompression.
  if(bytes[0]===31&&bytes[1]===139){if(!window.DecompressionStream)throw Error('This browser needs gzip decompression support. Use a current Chrome, Edge, Firefox, or Safari.');
   const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));return JSON.parse(await new Response(stream).text());}
  return JSON.parse(new TextDecoder().decode(bytes));
 }
 function getIndex(){return indexPromise??=read(new URL('index.json',base)).catch(e=>{indexPromise=null;throw e;});}
 async function eventFile(key,suffix=''){
  const index=await getIndex(),event=index.events.find(e=>e.eventKey===key);if(!event)throw Error('Event not found');
  const cacheKey=key+suffix;if(!pending.has(cacheKey))pending.set(cacheKey,read(new URL('events/'+event.file.replace('.json.gz',suffix+'.json.gz'),base),true).catch(e=>{pending.delete(cacheKey);throw e;}));
  // Keep at most a few event responses in memory as history grows.
  if(pending.size>9){const oldest=pending.keys().next().value;if(oldest!==cacheKey)pending.delete(oldest);}
  return pending.get(cacheKey);
 }
 async function getTimeline(key){const data=await eventFile(key,'.samples');return {eventKey:key,samples:data.rows.map(row=>Object.fromEntries(data.headers.map((h,i)=>[h,typeof row[i]==='boolean'?(row[i]?'TRUE':'FALSE'):row[i]])))};}
 async function getFootprint(key){
  const stored=await eventFile(key,'.footprint');if(stored.areas.every(a=>a.geometry))return stored;
  const index=await getIndex(),event=index.events.find(e=>e.eventKey===key);if(!event)return stored;
  try{
   const params=new URLSearchParams({wfo:event.wfo||'LIX',year:event.year,phenomena:event.phenomena,significance:event.significance||'W',etn:event.eventId});
   const response=await fetch('https://mesonet.agron.iastate.edu/geojson/vtec_event.py?'+params);if(!response.ok)throw Error('HTTP '+response.status);
   const gj=await response.json(),geometries={};for(const ft of gj.features||[]){const raw=String(ft.properties?.ugc||ft.properties?.nws_ugc||ft.id||'').toUpperCase();if(/^[A-Z]{2}[CZ]\d{3}$/.test(raw)&&ft.geometry)geometries[raw]=ft.geometry;}
   return {...stored,areas:stored.areas.map(a=>({...a,geometry:a.geometry||geometries[a.ugc]||null})),warning:stored.areas.some(a=>!a.geometry&&!geometries[a.ugc])?'Some warned polygons are unavailable.':''};
  }catch{return {...stored,warning:'Imported polygons are unavailable until a GitHub verification run fetches them; station results remain available.'};}
 }
 return {getIndex,getEventPayload:key=>eventFile(key),getTimeline,getFootprint,clear(){indexPromise=null;pending.clear();}};
})();
