// Manual paid-provider acceptance check. Not run by CI. One deduplicated query,
// with a $1 Actor cap enforced by the worker and the database spending ceiling.
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {randomUUID,randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
process.loadEnvFile('.env.local');
const proofPath='.local/favorite-live-proof.json';
if(existsSync(proofPath))throw new Error('This live check already ran. Inspect its proof before repeating paid work.');
const e=process.env,origin=e.APP_URL||'http://localhost:3000';
if(!e.NEXT_PUBLIC_SUPABASE_URL||!e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||!e.SUPABASE_SECRET_KEY)throw new Error('Supabase setup is incomplete.');
const admin=createClient(e.NEXT_PUBLIC_SUPABASE_URL,e.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await admin.auth.admin.createUser({email:`easteats-search-${randomUUID()}@example.invalid`,password:randomBytes(32).toString('hex'),email_confirm:true});
if(error||!data.user)throw new Error('Could not create isolated acceptance account.');
const id=data.user.id,jar=new Map<string,string>();
const client=createServerClient(e.NEXT_PUBLIC_SUPABASE_URL,e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>{for(const {name,value} of values)jar.set(name,value);}}});
const proof:{query:string;city:string;startedAt:string;jobId?:string;matches?:{name:string;address:string}[];status?:string;cleanup?:boolean}={query:'Pho99',city:'Coquitlam',startedAt:new Date().toISOString()};
mkdirSync('.local',{recursive:true});
const save=()=>writeFileSync(proofPath,JSON.stringify(proof,null,2));save();
async function api(path:string,body?:unknown){
 const r=await fetch(`${origin}${path}`,{method:body?'POST':'GET',headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),Origin:new URL(origin).origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15_000)});
 const result=await r.json();if(!r.ok)throw new Error(`Search acceptance failed (${r.status}).`);return result;
}
try{
 // Generate the fixture account's link without using or revealing a person's login.
 const link=await admin.auth.admin.generateLink({type:'magiclink',email:data.user.email!});
 if(link.error||!link.data.properties.hashed_token)throw new Error('Could not sign in the acceptance account.');
 const signed=await client.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});
 if(signed.error)throw new Error('Acceptance sign-in failed.');
 let result=await api('/api/places/search',{query:proof.query,city:proof.city});
 proof.jobId=result.job?.id;save();
 if(!proof.jobId)throw new Error('Search did not return a live Google Maps job.');
 console.log(JSON.stringify({phase:'live lookup queued',jobId:proof.jobId,immediateMatches:result.items.length}));
 const deadline=Date.now()+180_000;
 let previous='';
 while(Date.now()<deadline){
  const state=(await api(`/api/jobs/${proof.jobId}`)).job.status;
  if(state!==previous){console.log(JSON.stringify({phase:state}));previous=state;}
  result=await api('/api/places/search',{query:proof.query,city:proof.city});
  if(state==='succeeded'){
   proof.matches=result.items.map((r:{name:string;address:string})=>({name:r.name,address:r.address}));
   if(!proof.matches?.some(r=>/pho\s*99/i.test(r.name.normalize('NFD').replace(/\p{M}/gu,''))&&/Coquitlam/i.test(r.address)))throw new Error('Live results did not contain Pho 99 in Coquitlam.');
   proof.status='passed';save();console.log(JSON.stringify(proof));break;
  }
  if(!['queued','running'].includes(state))throw new Error(`Live lookup stopped with status ${state}.`);
  await new Promise(resolve=>setTimeout(resolve,4000));
 }
 if(proof.status!=='passed')throw new Error('Live lookup exceeded its bounded acceptance window.');
}finally{
 await client.auth.signOut().catch(()=>undefined);
 const deleted=await admin.auth.admin.deleteUser(id);proof.cleanup=!deleted.error;save();
 if(deleted.error)throw new Error('Acceptance account cleanup failed.');
}
