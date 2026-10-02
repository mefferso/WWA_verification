'use strict';
const fs=require('node:fs'),path=require('node:path'),core=require('./core.cjs');
function loadConfig(root=path.resolve(__dirname,'..')){
 const settings=JSON.parse(fs.readFileSync(path.join(root,'config/settings.json')));
 if(settings.units!=='english,speed|mph,temp|f')throw Error('Only Fahrenheit/mph configuration is supported');
 if(!['on','off','mark'].includes(settings.qcRemove))throw Error('Invalid QC policy');
 if(!['sustained','gust'].includes(settings.rfwWindBasis))throw Error('Invalid RFW wind basis');
 if(!Number.isFinite(settings.durationMaxGapMinutes)||settings.durationMaxGapMinutes<1)throw Error('Invalid sample gap');
 if(!Number.isFinite(settings.minimumCoveragePct)||settings.minimumCoveragePct<0||settings.minimumCoveragePct>100)throw Error('Invalid coverage threshold');
 const cfg={_cwa:settings.cwa,_qcChecks:settings.qcChecks,_qcRemove:settings.qcRemove,
  _vars:core.ensureVars_(settings.vars,['air_temp','wind_speed','wind_gust','relative_humidity','dew_point_temperature']),_units:settings.units,
  _rfwWindBasis:settings.rfwWindBasis,_durationMaxGapMinutes:settings.durationMaxGapMinutes,_minCoveragePct:settings.minimumCoveragePct,
  _tierAIds:core.parseIdSet_(settings.tierAMnetIds.join(',')),_tierBIds:core.parseIdSet_(settings.tierBMnetIds.join(','))};
 const thresholdRows=JSON.parse(fs.readFileSync(path.join(root,'config/thresholds.json')));
 const zoneRows=JSON.parse(fs.readFileSync(path.join(root,'config/zone-overrides.json')));
 const maps={area:{},zone:{}};
 for(const [rows,isZone] of [[thresholdRows,false],[zoneRows,true]])for(const r of rows){
  if(r.length!==7||!['EC','EH','RFW'].includes(r[0])||!['LA','MS'].includes(r[1])||!['TEMP_F','WIND_CHILL_F','HEAT_INDEX_F','RH_PCT','WIND_MPH'].includes(r[3])||core.toFinite_(r[4])===null||!core.normalizeComparator_(r[5])||(r[6]!==null&&(!Number.isFinite(r[6])||r[6]<0))||(isZone&&!core.normalizeUgc_(r[2])))throw Error('Invalid threshold rule');
  core.addRuleRow_(isZone?maps.zone:maps.area,r,isZone);
 }
 return {settings,cfg,maps};
}
module.exports={loadConfig};
