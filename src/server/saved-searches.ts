import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {discoverInputSchema,restaurantSchema,tasteProfileSchema,type DiscoverInput,type RankedRestaurant,type SavedSearch,type SavedSearchSummary} from '@/lib/contracts';
import {classifyRestaurant,matchRestaurantSearch,restaurantSearchRelevance} from '@/lib/food-taxonomy';
import {isEastAsianRestaurant,isAsianFusionRestaurant} from '@/lib/eligibility';
import {defaultTasteProfile,rankRestaurants} from './taste';
import {searchPlaces} from './repository';
import {deterministicSearchTitle} from './saved-search-title';
import {HttpError} from './http';

const rankedSchema=z.object({restaurant:restaurantSchema,score:z.number().finite(),distanceKm:z.number().finite().nonnegative(),confidence:z.number().min(0).max(1),explanation:z.string()}).passthrough().transform(value=>value as RankedRestaurant);
const snapshotSchema=z.object({items:z.array(rankedSchema).max(250),warning:z.string().optional(),jobId:z.string().optional(),refreshing:z.boolean().optional()});
const rowSchema=z.object({id:z.uuid(),user_id:z.uuid(),title:z.string(),title_status:z.enum(['pending','generating','ready','fallback']),input:discoverInputSchema,area_label:z.string(),result_snapshot:snapshotSchema,active_search_id:z.uuid(),created_at:z.string(),updated_at:z.string(),last_opened_at:z.string()});
export type SavedSearchRow=z.infer<typeof rowSchema>;
type Snapshot={items:RankedRestaurant[];warning?:string;jobId?:string;refreshing?:boolean};
const demoSearches=new Map<string,SavedSearchRow>();
const unavailable=()=>new HttpError(404,'That saved search is unavailable.','SEARCH_NOT_FOUND');
const summary=(row:SavedSearchRow):SavedSearchSummary=>({id:row.id,title:row.title,areaLabel:row.area_label,resultCount:row.result_snapshot.items.length,createdAt:row.created_at,updatedAt:row.updated_at,lastOpenedAt:row.last_opened_at});
export const savedSearchSummary=(value:unknown)=>summary(rowSchema.parse(value));

export async function beginSavedSearch(client:SupabaseClient|null,userId:string,input:DiscoverInput):Promise<SavedSearchRow>{
 const id=input.savedSearchId??input.searchId;
 if(!id||!input.searchId)throw new HttpError(400,'A search identity is required.','SEARCH_ID_REQUIRED');
 if(!client){
  const old=demoSearches.get(id);if(old&&old.user_id!==userId)throw unavailable();
  const now=new Date().toISOString();
  const row=old??{id,user_id:userId,title:deterministicSearchTitle(input),title_status:'fallback' as const,input,area_label:input.areaLabel??'',result_snapshot:{items:[]},active_search_id:input.searchId,created_at:now,updated_at:now,last_opened_at:now};
  row.input=input;row.area_label=input.areaLabel??row.area_label;row.active_search_id=input.searchId;demoSearches.set(id,row);return row;
 }
 const result=await client.rpc('begin_search_conversation',{p_id:id,p_run_id:input.searchId,p_input:input,p_area_label:input.areaLabel??'',p_title:deterministicSearchTitle(input)});
 if(result.error){if(result.error.code==='42501')throw unavailable();throw result.error;}
 return rowSchema.parse(result.data);
}
export async function saveSearchSnapshot(client:SupabaseClient|null,row:SavedSearchRow,input:DiscoverInput,snapshot:Snapshot):Promise<SavedSearchRow>{
 if(!client){if(row.active_search_id===input.searchId){row.result_snapshot=snapshot;row.updated_at=new Date().toISOString();demoSearches.set(row.id,row);}return row;}
 const result=await client.rpc('save_search_snapshot',{p_id:row.id,p_run_id:input.searchId,p_snapshot:snapshot});
 if(result.error)throw result.error;
 return rowSchema.parse(result.data);
}
export async function listSavedSearches(client:SupabaseClient|null,userId:string):Promise<SavedSearchSummary[]>{
 if(!client)return [...demoSearches.values()].filter(row=>row.user_id===userId).sort((a,b)=>b.last_opened_at.localeCompare(a.last_opened_at)).map(summary);
 const {data,error}=await client.from('search_conversations').select('id,title,area_label,result_count,created_at,updated_at,last_opened_at').eq('user_id',userId).order('last_opened_at',{ascending:false}).order('id',{ascending:false}).limit(100);
 if(error)throw error;
 return(data??[]).map(row=>({id:row.id,title:row.title,areaLabel:row.area_label,resultCount:z.number().int().nonnegative().parse(row.result_count),createdAt:row.created_at,updatedAt:row.updated_at,lastOpenedAt:row.last_opened_at}));
}
async function hydrateEmptySnapshot(client:SupabaseClient,row:SavedSearchRow):Promise<SavedSearchRow>{
 if(row.result_snapshot.items.length||!row.result_snapshot.jobId)return row;
 const places=await searchPlaces(client,row.result_snapshot.jobId);
 const job=await client.rpc('get_refresh_job',{p_id:row.result_snapshot.jobId});if(job.error)throw job.error;
 const refreshing=!!job.data&&['queued','running'].includes(job.data.status);
 if(!places.length){row.result_snapshot.warning=refreshing?'This saved search was still running. Reopen it later to check for results.':row.result_snapshot.warning;return row;}
 const profileResult=await client.from('taste_profiles').select('profile').eq('user_id',row.user_id).maybeSingle();if(profileResult.error)throw profileResult.error;
 const parsed=tasteProfileSchema.safeParse(profileResult.data?.profile),profile=parsed.success?parsed.data:defaultTasteProfile();
 const eligible=places.map(restaurant=>{const tags=classifyRestaurant(restaurant);return{...restaurant,cuisines:[...new Set([...restaurant.cuisines,...tags.cuisines])],foodTypes:tags.foodTypes};}).filter(restaurant=>isEastAsianRestaurant(restaurant)&&(row.input.mode!=='fusion'||isAsianFusionRestaurant(restaurant))&&(!row.input.maxPrice||restaurant.priceLevel===null||restaurant.priceLevel<=row.input.maxPrice)&&matchRestaurantSearch(restaurant,row.input));
 const relevance=new Map(eligible.map(restaurant=>[restaurant.id,restaurantSearchRelevance(restaurant,row.input)]));
 const items=rankRestaurants(eligible,profile,row.input,row.input.radiusKm).sort((a,b)=>(relevance.get(b.restaurant.id)??0)-(relevance.get(a.restaurant.id)??0));
 return saveSearchSnapshot(client,row,{...row.input,searchId:row.active_search_id},{items,jobId:row.result_snapshot.jobId,refreshing,warning:refreshing?'This saved search is still collecting places.':undefined});
}
export async function openSavedSearch(client:SupabaseClient|null,userId:string,id:string):Promise<SavedSearch>{
 z.uuid().parse(id);
 let row:SavedSearchRow;
 if(!client){const stored=demoSearches.get(id);if(!stored||stored.user_id!==userId)throw unavailable();row=stored;}
 else{
  const result=await client.from('search_conversations').select('*').eq('id',id).eq('user_id',userId).maybeSingle();
  if(result.error)throw result.error;if(!result.data)throw unavailable();row=rowSchema.parse(result.data);
  row=await hydrateEmptySnapshot(client,row);
 }
 row.last_opened_at=new Date().toISOString();
 if(client){const updated=await client.from('search_conversations').update({last_opened_at:row.last_opened_at}).eq('id',id).eq('user_id',userId);if(updated.error)throw updated.error;}
 const warning=row.result_snapshot.warning??(!row.result_snapshot.items.length?'No results have been saved for this search yet.':undefined);
 return{...summary(row),input:row.input,items:row.result_snapshot.items as RankedRestaurant[],warning};
}
