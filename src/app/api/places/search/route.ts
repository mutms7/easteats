import {z} from 'zod';
import {requireSession} from '@/server/session';
import {endpoint,json,readJson} from '@/server/http';
import {demoRestaurants} from '@/server/demo';
import {cachedSearch,queueRefresh} from '@/server/repository';
const schema=z.object({query:z.string().trim().min(2).max(150),city:z.string().trim().max(150).default('')});
export const POST=endpoint(async request=>{
 const s=await requireSession();const input=schema.parse(await readJson(request));
 if(s.demo)return json({items:demoRestaurants.filter(r=>`${r.name} ${r.cuisines.join(' ')} ${r.features?.dishes.join(' ')}`.toLowerCase().includes(input.query.toLowerCase())),job:null,dataMode:'demo'});
 const items=await cachedSearch(s.client!,input.query,input.city);
 // A submitted search checks Google Maps even if some matching places are
 // cached. The database shares the same query's run for 24 hours.
 const liveInput={query:input.query.replace(/\s+/g,' ').toLowerCase(),city:input.city.replace(/\s+/g,' ').toLowerCase()};
 const job=await queueRefresh(s.client!,'favorite-search',liveInput);
 return json({items,job,dataMode:'live'});
},true);
