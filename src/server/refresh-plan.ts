import type {DiscoverInput,Restaurant,RefreshJob} from '@/lib/contracts';
import {needsRefresh,FRESHNESS} from './data';
export function refreshPlan(_restaurants:Restaurant[],input:DiscoverInput,_now=Date.now()):{kind:RefreshJob['kind'];input:Record<string,unknown>}{
 const query=input.query.trim()||(input.cuisine?`${input.cuisine} restaurant`:'');
 return {kind:'discovery',input:{lat:Math.round(input.lat*100)/100,lng:Math.round(input.lng*100)/100,radiusKm:input.radiusKm,mode:input.mode,...(query?{query}:{})}};
}
export function enrichmentPlan(restaurants:Restaurant[],now=Date.now()):{urls:string[]}|null{
 const urls=[...new Set(restaurants.filter(r=>!r.features||needsRefresh(r.features.updatedAt,FRESHNESS.features,now)).map(r=>r.sourceUrl))].sort().slice(0,20);
 return urls.length?{urls}:null;
}
