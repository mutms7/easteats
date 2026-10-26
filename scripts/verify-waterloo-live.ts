// Manual acceptance test, excluded from CI. Starts exactly two fresh place
// searches (each Actor capped at $1), then reuses the second search for map QA.
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {chromium,expect} from '@playwright/test';
import {randomUUID,randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {defaultTasteProfile} from '../src/server/taste/index.ts';
process.loadEnvFile('.env.local');
const path='.local/waterloo-live-proof.json';
if(existsSync(path)&&!process.argv.includes('--resume'))throw new Error('Proof already exists. Inspect it before running again; --resume reuses its two search IDs.');
type Proof={query:string;startedAt:string;searchIds:string[];jobIds:string[];area?:{label:string;lat:number;lng:number};sourceCounts?:number[];map?:{items:number;pins:number;allPinsInBounds:boolean;mobilePins:number};status?:string;cleanup?:boolean};
const proof:Proof=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{query:'University Avenue Waterloo',startedAt:new Date().toISOString(),searchIds:[randomUUID(),randomUUID()],jobIds:[]};
const e=process.env,origin=e.APP_URL||'http://localhost:3000';
if(!e.NEXT_PUBLIC_SUPABASE_URL||!e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||!e.SUPABASE_SECRET_KEY)throw new Error('Local setup is incomplete.');
mkdirSync('.local',{recursive:true});const save=()=>writeFileSync(path,JSON.stringify(proof,null,2));save();
const admin=createClient(e.NEXT_PUBLIC_SUPABASE_URL,e.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await admin.auth.admin.createUser({email:`easteats-waterloo-${randomUUID()}@example.invalid`,password:randomBytes(32).toString('hex'),email_confirm:true});
if(error||!data.user)throw new Error('Could not create isolated acceptance account.');
const jar=new Map<string,string>();
const client=createServerClient(e.NEXT_PUBLIC_SUPABASE_URL,e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>{for(const {name,value} of values)jar.set(name,value);}}});
async function api(route:string,body?:unknown){
 const r=await fetch(origin+route,{method:body?'POST':'GET',headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),Origin:new URL(origin).origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 const result=await r.json();if(!r.ok)throw new Error(`Acceptance request ${route} failed (${r.status}).`);return result;
}
try{
 const link=await admin.auth.admin.generateLink({type:'magiclink',email:data.user.email!});
 if(link.error||!link.data.properties.hashed_token)throw new Error('Could not sign in acceptance account.');
 if((await client.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token})).error)throw new Error('Acceptance sign-in failed.');
 const profile=defaultTasteProfile();profile.cuisines=['Chinese','Japanese','Korean','Vietnamese'];
 const stored=await admin.from('taste_profiles').upsert({user_id:data.user.id,profile,answers:{favorites:[{restaurantId:'acceptance-fixture',name:'Acceptance fixture',city:'',reasons:['The food itself'],notes:'Synthetic acceptance preferences, not a real person.'}]}});
 if(stored.error)throw new Error('Could not save acceptance preferences.');
 const areas=(await api('/api/geocode',{query:proof.query})).items;
 if(!/Waterloo.*Ontario/i.test(areas[0]?.label||''))throw new Error('Requested Waterloo street was not ranked first.');
 proof.area=areas[0];save();
 for(let i=0;i<2;i++){
  const input={lat:proof.area!.lat,lng:proof.area!.lng,radiusKm:5,mode:'for-you',query:'',cuisine:'',searchId:proof.searchIds[i]};
  const initial=await api('/api/discover',input);
  if(!initial.job)throw new Error('Search did not create a live source job.');
  proof.jobIds[i]=initial.job.id;save();
  if(i&&proof.jobIds[0]===proof.jobIds[1])throw new Error('A repeated manual search reused the previous source job.');
  const deadline=Date.now()+180000;let previous='';let done=false;
  while(Date.now()<deadline){
   const state=(await api(`/api/jobs/${initial.job.id}`)).job.status;
   if(state!==previous){console.log(JSON.stringify({search:i+1,phase:state,jobId:initial.job.id}));previous=state;}
   if(state==='succeeded'){done=true;break;}
   if(!['queued','running'].includes(state))throw new Error(`Source search failed (${state}).`);
   const update=await api('/api/discover',input);
   if(update.job?.id!==initial.job.id)throw new Error('Polling created another source job.');
   await new Promise(resolve=>setTimeout(resolve,4000));
  }
  if(!done)throw new Error('Source search exceeded its bounded waiting window.');
  const records=await client.rpc('search_places',{p_job_id:initial.job.id});
  if(records.error||!records.data?.length)throw new Error('Completed source search has no published places.');
  proof.sourceCounts??=[];proof.sourceCounts[i]=records.data.length;save();
 }
 // Isolated browser QA uses real API data and real MapTiler tiles. Reusing the
 // completed second ID avoids a third paid place search during the map check.
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([...jar].map(([name,value])=>({name,value,url:origin})));
  const page=await context.newPage();
  await page.route('**/api/discover',route=>route.continue({postData:JSON.stringify({...route.request().postDataJSON(),searchId:proof.searchIds[1]})}));
  await page.goto(origin);
  await page.getByRole('combobox',{name:'Address or area'}).fill(proof.query);
  await page.getByRole('button',{name:'Find area',exact:true}).click();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/discover')&&r.status()===200);
  await page.getByRole('option',{name:proof.area!.label,exact:true}).click();
  const payload=await(await response).json();
  if(!payload.items?.length)throw new Error('Live discovery returned no ranked Waterloo places.');
  await expect(page.locator('.map-pin')).toHaveCount(payload.items.length,{timeout:20000});
  await expect.poll(()=>page.locator('.map-pin').evaluateAll(pins=>{
   const frame=document.querySelector('.map-canvas')!.getBoundingClientRect();
   return pins.every(pin=>{const b=pin.getBoundingClientRect();return b.left>=frame.left-1&&b.right<=frame.right+1&&b.top>=frame.top-1&&b.bottom<=frame.bottom+1;});
  }),{timeout:15000}).toBe(true);
  await page.screenshot({path:'.local/waterloo-map-desktop.png',fullPage:false});
  proof.map={items:payload.items.length,pins:await page.locator('.map-pin').count(),allPinsInBounds:true,mobilePins:0};
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Show map',exact:true}).click();
  await expect(page.locator('.map-canvas')).toBeVisible();
  await expect(page.locator('.map-pin')).toHaveCount(payload.items.length);
  await expect.poll(()=>page.locator('.map-pin').evaluateAll(pins=>{
   const frame=document.querySelector('.map-canvas')!.getBoundingClientRect();
   return pins.every(pin=>{const b=pin.getBoundingClientRect();return b.left>=frame.left-1&&b.right<=frame.right+1&&b.top>=frame.top-1&&b.bottom<=frame.bottom+1;});
  }),{timeout:15000}).toBe(true);
  proof.map.mobilePins=await page.locator('.map-pin').count();
  await page.locator('.map-shell').scrollIntoViewIfNeeded();
  await page.screenshot({path:'.local/waterloo-map-phone.png',fullPage:false});
 }finally{await browser.close();}
 proof.status='passed';save();console.log(JSON.stringify(proof));
}finally{
 await client.auth.signOut().catch(()=>undefined);
 const deleted=await admin.auth.admin.deleteUser(data.user.id);proof.cleanup=!deleted.error;save();
 if(deleted.error)throw new Error('Acceptance account cleanup failed.');
}
