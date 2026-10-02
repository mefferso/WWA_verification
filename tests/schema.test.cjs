const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({});vm.runInContext(fs.readFileSync('legacy/apps-script/Code.gs','utf8'),c);
const snapshot=JSON.parse(fs.readFileSync('docs/workbook-schema.json','utf8'));
test('Documented export headers match every backend runtime schema',()=>{
 const names={Stations:'STATION_HEADERS',Events:'EVENT_HEADERS',EventAreas:'EVENT_AREA_HEADERS',_EventObs:'EVENT_OBS_HEADERS',_ObsSamples:'SAMPLE_HEADERS',Results:'RESULT_HEADERS',AreaVerification:'AREA_VERIFY_HEADERS'};
 for(const [sheet,constant] of Object.entries(names)){
  const expected=JSON.parse(JSON.stringify(vm.runInContext(constant,c)));
  assert.deepEqual(snapshot.sheets.find(s=>s.name===sheet).headers,expected,sheet);
 }
});
test('Threshold snapshot preserves all 38 positional rules and blank durations',()=>{
 const rules=snapshot.sheets.find(s=>s.name==='Thresholds').rules;
 assert.equal(rules.length,38);assert.ok(rules.every(r=>r[6]===null));
 assert.equal(rules.find(r=>r[0]==='RFW'&&r[1]==='LA'&&r[3]==='WIND_MPH')[4],25);
 assert.equal(rules.find(r=>r[0]==='RFW'&&r[1]==='MS'&&r[3]==='WIND_MPH')[4],15);
 assert.equal(snapshot.sheets.find(s=>s.name==='Config').settings['Synoptic API token'],'[REDACTED]');
});
