const fs=require('node:fs'),vm=require('node:vm');
new vm.Script(fs.readFileSync('Code.gs','utf8'),{filename:'Code.gs'});
const html=fs.readFileSync('Index.html','utf8');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1],{filename:'Index.html'});
JSON.parse(fs.readFileSync('appsscript.json','utf8'));
console.log('Backend, inline frontend JavaScript, and manifest parse successfully.');
