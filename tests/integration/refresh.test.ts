import {it,expect} from 'vitest';
import {refreshPlan,enrichmentPlan,enrichmentPlans} from '@/server/refresh-plan';
import {demoRestaurants} from '@/server/demo';
const input={lat:37.871234,lng:-122.273456,radiusKm:5,mode:'for-you' as const,query:'',cuisine:''};
const now=Date.parse('2026-10-25T00:00:00Z');
it('starts discovery even with fresh cached places',()=>{const r={...demoRestaurants[0],fetchedAt:new Date(now).toISOString()};expect(refreshPlan([r],input,now).kind).toBe('discovery');});
it('does not replace a submitted place search with slow review enrichment',()=>{const r={...demoRestaurants[0],features:null};expect(refreshPlan([r],input,now).kind).toBe('discovery');expect(enrichmentPlan([r],now)).toEqual({urls:[r.sourceUrl]});});
it('sends the submitted restaurant or dish query to Apify',()=>expect(refreshPlan([],{...input,query:'ramen'},now).input).toMatchObject({query:'ramen'}));
it('sends food and cuisine filters to Apify even with an empty text search',()=>expect(refreshPlan([],{...input,foodType:'noodles',cuisine:'Korean'},now).input).toMatchObject({query:'Korean Noodles'}));
it('keeps typed searches and visible filters in the same provider lookup',()=>expect(refreshPlan([],{...input,query:'Ramen',foodType:'noodles',cuisine:'Japanese'},now).input).toMatchObject({query:'Ramen Japanese Noodles'}));
it('schedules review enrichment in bounded batches beyond the first twenty',()=>{
 const candidates=Array.from({length:35},(_,i)=>({...demoRestaurants[0],id:'place-'+i,sourceUrl:'https://www.google.com/maps/place/'+i,features:null}));
 const batches=enrichmentPlans(candidates,now);
 expect(batches.map(batch=>batch.urls.length)).toEqual([12,12,11]);
 expect(new Set(batches.flatMap(batch=>batch.urls)).size).toBe(35);
});
it('avoids re-extracting still-fresh evidence',()=>{const r={...demoRestaurants[0],features:{...demoRestaurants[0].features!,updatedAt:new Date(now).toISOString()}};expect(enrichmentPlan([r],now)).toBe(null);});
it('persists only coarse location for a cold-area search',()=>{expect(refreshPlan([],input,now)).toEqual({kind:'discovery',input:{lat:37.87,lng:-122.27,radiusKm:5,mode:'for-you'}});});

it('keeps pending batches stable as early evidence completes and ranking reverses',()=>{
 const candidates=Array.from({length:60},(_,i)=>({...demoRestaurants[0],id:'place-'+i,sourceUrl:'https://www.google.com/maps/place/'+String(i).padStart(3,'0'),features:null}));
 const initial=enrichmentPlans(candidates,now);
 const completed=new Set(initial[0].urls);
 const next=candidates.map(r=>completed.has(r.sourceUrl)?{...r,features:{...demoRestaurants[0].features!,updatedAt:new Date(now).toISOString()}}:r).reverse();
 expect(enrichmentPlans(next,now)).toEqual(initial.slice(1));
 expect(initial.flatMap(plan=>plan.urls)).toHaveLength(60);
});
it('retains a partially completed batch and bounds broad enrichment at 120 places',()=>{
 const candidates=Array.from({length:130},(_,i)=>({...demoRestaurants[0],id:'place-'+i,sourceUrl:'https://www.google.com/maps/place/'+String(i).padStart(3,'0'),features:null}));
 const initial=enrichmentPlans(candidates,now);
 const mixed=candidates.map((r,i)=>i===0?{...r,features:{...demoRestaurants[0].features!,updatedAt:new Date(now).toISOString()}}:r);
 expect(enrichmentPlans(mixed,now)).toEqual(initial);
 expect(initial).toHaveLength(10);
 expect(initial.flatMap(plan=>plan.urls)).toHaveLength(120);
});
