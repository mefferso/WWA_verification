'use strict';
const {createClient}=require('../src/providers.cjs'),{runRange}=require('../src/runner.cjs');
function rangeFromArgs(args,now=new Date()){
 const values={};for(let i=0;i<args.length;i++){const arg=args[i];if(['--annual','--force','--recent'].includes(arg))values[arg]=true;else if(['--year','--month','--limit'].includes(arg)&&args[i+1]&&!args[i+1].startsWith('--'))values[arg]=Number(args[++i]);else throw Error('Unknown or incomplete argument: '+arg);}
 const limit=values['--limit']??0;if(!Number.isInteger(limit)||limit<0)throw Error('Invalid event limit');
 if(values['--recent'])return {start:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)),end:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)),force:!!values['--force'],limit};
 const year=values['--year'];if(!Number.isInteger(year)||year<2000||year>2100)throw Error('Year must be an integer from 2000 through 2100');
 if(values['--annual'])return {start:new Date(Date.UTC(year,0,1)),end:new Date(Date.UTC(year+1,0,1)),force:!!values['--force'],limit};
 const month=values['--month'];if(!Number.isInteger(month)||month<1||month>12)throw Error('Month must be an integer from 1 through 12');
 return {start:new Date(Date.UTC(year,month-1,1)),end:new Date(Date.UTC(year,month,1)),force:!!values['--force'],limit};
}
async function main(){
 const range=rangeFromArgs(process.argv.slice(2));if(!process.env.SYNOPTIC_API_TOKEN)throw Error('Add SYNOPTIC_API_TOKEN under GitHub repository Settings → Secrets and variables → Actions.');
 const report=await runRange({...range,client:createClient({token:process.env.SYNOPTIC_API_TOKEN}),onProgress:message=>console.log(message)});
 console.log(JSON.stringify({computed:report.computed,reused:report.reused,failed:report.failed.length,deferred:report.deferred}));if(report.failed.length)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={rangeFromArgs};
