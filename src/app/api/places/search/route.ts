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
 const job=items.length?null:await queueRefresh(s.client!,'favorite-search',input);
 return json({items,job,dataMode:'live'});
},true);
