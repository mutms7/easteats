import {it,expect} from 'vitest';
import {refreshPlan} from '@/server/refresh-plan';
import {demoRestaurants} from '@/server/demo';
const input={lat:37.871234,lng:-122.273456,radiusKm:5,mode:'for-you' as const,query:'',cuisine:''};
const now=Date.parse('2026-10-25T00:00:00Z');
it('checks one stable daily area job regardless of display filters',()=>{const r={...demoRestaurants[0],fetchedAt:new Date(now).toISOString(),features:{...demoRestaurants[0].features!,updatedAt:new Date(now).toISOString()}};const plan=refreshPlan([r],input,now);expect(plan?.kind).toBe('discovery');expect(refreshPlan([r],{...input,maxPrice:1,query:'dumplings',cuisine:'Japanese'},now)).toEqual(plan);});
it('refreshes stale details independently from the daily discovery cache',()=>{const r={...demoRestaurants[0],fetchedAt:new Date(now-7*3600000).toISOString()};expect(refreshPlan([r],input,now)).toEqual({kind:'details',input:{urls:[r.sourceUrl]}});});
it('persists only coarse location for a cold-area search',()=>{expect(refreshPlan([],input,now)).toEqual({kind:'discovery',input:{lat:37.87,lng:-122.27,radiusKm:5,mode:'for-you'}});});
