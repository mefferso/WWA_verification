const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
for(const directory of ['src','scripts','tests'])for(const file of fs.readdirSync(directory))if(file.endsWith('.cjs'))new vm.Script(fs.readFileSync(path.join(directory,file),'utf8'),{filename:file});
new vm.Script(fs.readFileSync('site/github-runtime.js','utf8'),{filename:'github-runtime.js'});
const html=fs.readFileSync('site/index.html','utf8');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1],{filename:'Index.html'});
if(/google\.script|SYNOPTIC_API_TOKEN|api\.synopticdata\.com/.test(html+fs.readFileSync('site/github-runtime.js','utf8')))throw Error('Google runtime or private provider reference in frontend');
require('../src/config.cjs').loadConfig();
console.log('Node modules, static UI, and safe configuration validate successfully.');
