import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {ApifyClient} from '../src/server/data/apify.ts';
import {normalizePlace} from '../src/server/data/normalize.ts';
import {reserve,budgetClient} from './budget.ts';
process.loadEnvFile('.env.local');mkdirSync('.local',{recursive:true});
const path='.local/pilot.json';
type State={status:string;reservationId:string;runId?:string;datasetId?:string;actualUsd?:number;count?:number};
const client=new ApifyClient(process.env.APIFY_TOKEN||'');
let state:State=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{status:'new',reservationId:''};
if(process.argv[2]==='start'){
 if(state.status!=='new')throw new Error('Pilot already started. Use poll; do not duplicate paid runs.');
 const reservation=await reserve('apify','pilot',2);state.reservationId=reservation.id;
 state.status='starting';writeFileSync(path,JSON.stringify(state));
 try {const run=await client.start({query:'Chinese restaurant',city:'Berkeley, California',maxPlaces:10,maxReviews:20},2);state={...state,status:run.status,runId:run.id,datasetId:run.defaultDatasetId};writeFileSync(path,JSON.stringify(state));console.log(JSON.stringify({status:run.status,runId:run.id}));}
 catch{state.status='uncertain';writeFileSync(path,JSON.stringify(state));throw new Error('Pilot launch failed or is uncertain. Reconcile the Apify console before retrying.');}
}else{
 if(!state.runId)throw new Error('No recorded run to poll.');const run=await client.getRun(state.runId);state.status=run.status;state.actualUsd=run.usageTotalUsd;
 if(run.status==='SUCCEEDED'){
  const raw=await client.dataset(run.defaultDatasetId,0,40);const places=raw.map(normalizePlace).filter((r):r is NonNullable<typeof r>=>r!==null);
  writeFileSync('.local/pilot-places.json',JSON.stringify(places,null,2));state.count=places.length;
 }
 writeFileSync(path,JSON.stringify(state));
 if(['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(state.status)&&typeof state.actualUsd==='number'&&process.env.SUPABASE_SECRET_KEY){const {error}=await budgetClient().rpc('settle_usage',{p_id:state.reservationId,p_actual_usd:state.actualUsd});if(error)throw new Error('Could not settle pilot usage.');}
 console.log(JSON.stringify({status:state.status,count:state.count,actualUsd:state.actualUsd,runId:state.runId}));
}
