import type {DiscoverInput,Restaurant,RefreshJob} from '@/lib/contracts';
import {needsRefresh,FRESHNESS} from './data';
import { FOOD_TYPES } from '@/lib/food-taxonomy';
export function refreshPlan(_restaurants:Restaurant[],input:DiscoverInput,_now=Date.now()):{kind:RefreshJob['kind'];input:Record<string,unknown>}{
 const parts=[input.query.trim()];
 for(const facet of [input.cuisine.trim(),FOOD_TYPES.find(type=>type.id===input.foodType)?.label??input.foodType?.trim()??'']){
  if(facet&&!parts.join(' ').toLowerCase().includes(facet.toLowerCase()))parts.push(facet);
 }
 // One provider query per explicit search, including the visible food/cuisine
 // filters. Cap the actor query length; result validation still enforces every facet.
 const query=parts.filter(Boolean).join(' ').slice(0,200);
 return {kind:'discovery',input:{lat:Math.round(input.lat*100)/100,lng:Math.round(input.lng*100)/100,radiusKm:input.radiusKm,mode:input.mode,...(query?{query}:{})}};
}
export function enrichmentPlan(restaurants:Restaurant[],now=Date.now()):{urls:string[]}|null{
 const urls=[...new Set(restaurants.filter(r=>!r.features||needsRefresh(r.features.updatedAt,FRESHNESS.features,now)).map(r=>r.sourceUrl))].sort().slice(0,20);
 return urls.length?{urls}:null;
}
