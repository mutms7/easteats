import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
process.loadEnvFile('.env.local');
const origin=process.env.APP_URL||'http://localhost:3000';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,secret=process.env.SUPABASE_SECRET_KEY!;
if(!url||!key||!secret)throw new Error('Local Supabase setup is incomplete.');
const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const email=`easteats-smoke-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('hex');
const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(error||!data.user)throw new Error('Could not create isolated smoke-test account.');
const id=data.user.id;const jar=new Map<string,string>();
const client=createServerClient(url,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>{for(const {name,value} of values)jar.set(name,value);}}});
const proof:{checks:string[];jobId?:string;cleanup?:boolean}={checks:[]};
async function api(path:string,body?:unknown,method?:string){
 const r=await fetch(`${origin}${path}`,{method:method||(body===undefined?'GET':'POST'),headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),Origin:new URL(origin).origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await r.json();if(!r.ok)throw new Error(`Live API check failed: ${path} (${r.status})`);return result;
}
try{
 const signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw new Error('Test sign-in failed.');
 const session=await api('/api/session');if(session.user?.id!==id)throw new Error('Server did not verify the signed-in test account.');proof.checks.push('verified authenticated session');
 const search=await api('/api/places/search',{query:'Noodle Dynasty',city:'Berkeley'});if(!search.items?.length)throw new Error('Expected cached pilot restaurant.');const restaurant=search.items[0];proof.checks.push('cached favorite search');
 const taste=await api('/api/taste',{favorites:[{restaurantId:restaurant.id,name:restaurant.name,city:restaurant.city,reasons:['The food itself','Great value'],notes:'Live integration test: I like handmade noodles and spicy food; table service is less important.'}]});if(!taste.personalized)throw new Error('Live taste compilation did not finish.');proof.checks.push('real Claude profile through authenticated API');
 await api(`/api/saved/${encodeURIComponent(restaurant.id)}`,undefined,'PUT');await api(`/api/saved/${encodeURIComponent(restaurant.id)}`,undefined,'PUT');
 const saved=await api('/api/saved');if(saved.items?.length!==1)throw new Error('Repeated save was not idempotent.');proof.checks.push('idempotent saved places');
 await api(`/api/saved/${encodeURIComponent(restaurant.id)}`,undefined,'DELETE');
 const discovery=await api('/api/discover',{lat:37.8715,lng:-122.273,radiusKm:5,mode:'for-you'});if(!discovery.items?.length||discovery.dataMode!=='live')throw new Error('Expected live cached recommendations.');proof.checks.push('ranked live nearby recommendations');proof.jobId=discovery.job?.id;
 if(process.env.NEXT_PUBLIC_MAPTILER_KEY){const geocoded=await api('/api/geocode',{query:'San Jose, California'});if(!geocoded.items?.length)throw new Error('Expected geocoding result.');proof.checks.push('MapTiler geocoding');}
 console.log(JSON.stringify({status:'passed',...proof}));
}finally{
 const deleted=await admin.auth.admin.deleteUser(id);proof.cleanup=!deleted.error;mkdirSync('.local',{recursive:true});writeFileSync('.local/live-api-proof.json',JSON.stringify(proof,null,2));if(deleted.error)throw new Error('Test account cleanup failed.');
}
