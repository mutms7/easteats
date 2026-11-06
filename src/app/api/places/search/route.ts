import {z} from 'zod';
import {requireSession} from '@/server/session';
import {endpoint,HttpError,json,readJson} from '@/server/http';
import {locationSchema} from '@/lib/contracts';
import {distanceKm} from '@/server/taste/ranking';
import {demoRestaurants} from '@/server/demo';
import {cachedSearch,queueRefresh} from '@/server/repository';
const schema=z.object({query:z.string().trim().min(2).max(150),city:z.string().trim().max(150).default(''),searchId:z.string().uuid().optional(),proximity:locationSchema.optional()});
export const POST=endpoint(async request=>{
 const s=await requireSession();const input=schema.parse(await readJson(request));
 if(s.demo)return json({items:demoRestaurants.filter(r=>`${r.name} ${r.cuisines.join(' ')} ${r.features?.dishes.join(' ')}`.toLowerCase().includes(input.query.toLowerCase())),job:null,dataMode:'demo'});
 if(!input.searchId)throw new HttpError(400,'Refresh East Eats and submit the search again.','SEARCH_ID_REQUIRED');
 let items=await cachedSearch(s.client!,input.query,input.city);
 if(input.proximity&&!input.city) items=items.sort((a,b)=>distanceKm(input.proximity!,a)-distanceKm(input.proximity!,b));
 // Each new submitted search gets a UUID. Polls replay that UUID so they
 // cannot launch additional paid work, even if a provider run fails.
 const liveInput={query:input.query.replace(/\s+/g,' ').toLowerCase(),city:input.city.replace(/\s+/g,' ').toLowerCase(),...(!input.city&&input.proximity?{...input.proximity,radiusKm:1}:{})};
 const job=await queueRefresh(s.client!,'favorite-search',liveInput,input.searchId);
 return json({items,job,dataMode:'live'});
},true);
