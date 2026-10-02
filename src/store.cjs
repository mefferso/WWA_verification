'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const eventId=key=>crypto.createHash('sha256').update(String(key)).digest('hex').slice(0,24);
function atomicWrite(file,bytes){
 fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';
 try{fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
class EventStore{
 constructor(directory){this.directory=directory;fs.mkdirSync(directory,{recursive:true});}
 file(key){return path.join(this.directory,eventId(key)+'.json.gz');}
 load(key){const file=this.file(key);if(!fs.existsSync(file))return null;const record=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));if(record.event.eventKey!==key)throw Error('Event key mismatch');return record;}
 save(record){if(!record?.event?.eventKey)throw Error('Missing event key');atomicWrite(this.file(record.event.eventKey),zlib.gzipSync(Buffer.from(JSON.stringify(record)),{level:9}));}
 all(){return fs.readdirSync(this.directory).filter(x=>/^[a-f0-9]{24}\.json\.gz$/.test(x)).sort().map(x=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(this.directory,x)))));}
}
module.exports={EventStore,eventId,atomicWrite};
