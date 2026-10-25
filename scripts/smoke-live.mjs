import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
process.loadEnvFile('.env.local');
const {compileTasteProfile,extractFeatures}=await import('../src/server/taste/index.ts');
const {modelCost}=await import('../src/server/pricing.ts');
const {reserve,settle}=await import('./budget.ts');
mkdirSync('.local',{recursive:true});
if(!existsSync('.local/pilot-places.json'))throw new Error('Run the bounded Apify pilot first.');
if(existsSync('.local/claude-smoke.json'))throw new Error('Live smoke evidence already exists. Don’t repeat paid checks without a reason.');
const places=JSON.parse(readFileSync('.local/pilot-places.json','utf8'));
const selected=places.find(p=>p.restaurant.name==='Noodle Dynasty')||places[0];
const usage=[];
const options={apiKey:process.env.ANTHROPIC_API_KEY,onUsage:u=>usage.push({...u,costUsd:modelCost(u)})};
const result={startedAt:new Date().toISOString(),usage};
try{
 const tasteBudget=await reserve('anthropic','smoke-taste',.25);
 result.profile=await compileTasteProfile({favorites:[{restaurantId:selected.restaurant.id,name:selected.restaurant.name,city:selected.restaurant.city,reasons:['The food itself','Great value'],notes:'Smoke-test preference: I enjoy handmade noodles and bold flavors, and service matters less.'}]},{...options,model:process.env.ANTHROPIC_TASTE_MODEL,onUsage:async u=>{options.onUsage(u);await settle(tasteBudget,modelCost(u));}});
 const extractionBudget=await reserve('anthropic','smoke-extraction',.10);
 result.features=await extractFeatures(selected.reviews.slice(0,5),{...options,model:process.env.ANTHROPIC_EXTRACT_MODEL,onUsage:async u=>{options.onUsage(u);await settle(extractionBudget,modelCost(u));}});
 result.placeId=selected.restaurant.id;result.status='passed';
}catch(error){result.status='failed';result.error=error instanceof Error?error.message:'Provider failure';}
writeFileSync('.local/claude-smoke.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,models:usage.map(u=>u.model),costUsd:usage.reduce((s,u)=>s+u.costUsd,0),error:result.error}));
if(result.status!=='passed')process.exitCode=1;
