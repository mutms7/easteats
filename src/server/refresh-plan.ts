import type {DiscoverInput,Restaurant,RefreshJob} from '@/lib/contracts';
import {needsRefresh,FRESHNESS} from './data';
export function refreshPlan(restaurants:Restaurant[],input:DiscoverInput,now=Date.now()):{kind:RefreshJob['kind'];input:Record<string,unknown>}|null{
 const discovery={kind:'discovery' as const,input:{lat:Math.round(input.lat*100)/100,lng:Math.round(input.lng*100)/100,radiusKm:input.radiusKm,mode:input.mode}};
 if(!restaurants.length)return discovery;
 const stale=restaurants.filter(r=>needsRefresh(r.fetchedAt,FRESHNESS.details,now)||!r.features||needsRefresh(r.features.updatedAt,FRESHNESS.features,now));
 // The database reuses this area's successful job for 24 hours. Checking the
 // same stable key lets new places enter the pool even while details stay fresh.
 if(!stale.length)return discovery;
 return {kind:'details',input:{urls:[...new Set(stale.slice(0,20).map(r=>r.sourceUrl))]}};
}
