import {discoverInputSchema,tasteProfileSchema} from '@/lib/contracts';
import {requireSession} from '@/server/session';
import {endpoint,HttpError,json,readJson} from '@/server/http';
import {demoRestaurants,demoState} from '@/server/demo';
import {cachedNearby,queueRefresh,searchPlaces} from '@/server/repository';
import {defaultTasteProfile,rankRestaurants} from '@/server/taste';
import {isEastAsianRestaurant,isAsianFusionRestaurant} from '@/lib/eligibility';
import {refreshPlan,enrichmentPlans} from '@/server/refresh-plan';
import {createHash} from 'node:crypto';
import {classifyRestaurant,matchRestaurantSearch,restaurantSearchRelevance} from '@/lib/food-taxonomy';
import {after} from 'next/server';
import {beginSavedSearch,saveSearchSnapshot,savedSearchSummary} from '@/server/saved-searches';
import {nameSavedSearch} from '@/server/saved-search-title';
import {loadFeedback,applyRestaurantFeedback,demoFeedbackState} from '@/server/restaurant-feedback';
export const maxDuration=60;
export const POST=endpoint(async request=>{
 const s=await requireSession();const input=discoverInputSchema.parse(await readJson(request));let profile=demoState.profile,answers=s.demo?demoState.answers:null;
 if(!s.demo&&!input.searchId)throw new HttpError(400,'Refresh East Eats and submit the search again.','SEARCH_ID_REQUIRED');
 if(!s.demo){const {data,error}=await s.client!.from('taste_profiles').select('profile,answers').eq('user_id',s.user.id).maybeSingle();if(error)throw error;profile=data?.profile?tasteProfileSchema.parse(data.profile):null;answers=data?.answers;}
 if(!answers)throw new HttpError(409,'Tell us about a favorite restaurant first.','QUESTIONNAIRE_REQUIRED');
 // Claim/verify ownership before any scrape can start. Conversation identity is
 // independent from the fresh paid-run identity used by explicit Refresh.
 const conversation=input.searchId?await beginSavedSearch(s.client,s.user.id,input):null;
 const restaurants=s.demo?demoRestaurants:await cachedNearby(s.client!,input,input.radiusKm);
 const plan=refreshPlan(restaurants,input);
 let job=null,enrichmentJob=null,warning: string|undefined;
 if(!s.demo){
  try{job=await queueRefresh(s.client!,plan.kind,plan.input,input.searchId);}catch(error){warning=error instanceof HttpError?error.message:restaurants.length?'These are saved results. We couldn’t start the live search right now.':'The live search could not start. Please try again.';}
 }
 const sourced=job?await searchPlaces(s.client!,job.id):[];
 const sourceAuthoritative=sourced.length>0||!!input.searchId&&job?.status==='succeeded';
 const pool=(sourceAuthoritative?sourced:restaurants).map(restaurant=>{
  const classification=classifyRestaurant(restaurant);
  return {...restaurant,cuisines:[...new Set([...restaurant.cuisines,...classification.cuisines])],foodTypes:classification.foodTypes};
 });
 const eligible=pool.filter(r=>isEastAsianRestaurant(r)&&(input.mode!=='fusion'||isAsianFusionRestaurant(r))&&(!input.maxPrice||r.priceLevel===null||r.priceLevel<=input.maxPrice));
 // Maps can return adjacent categories. Every recognized cuisine, food group,
 // and specific dish still needs listing or review evidence, including live hits.
 const selected=eligible.filter(r=>matchRestaurantSearch(r,input));
 if(sourceAuthoritative&&eligible.length>selected.length&&eligible.some(r=>!r.features)&&!warning)warning='Some places are still missing dish details. Review updates may add more matches.';
 const active=profile||defaultTasteProfile();
 // Stable sorting preserves personal ranking inside each listing/review tier.
 // Browsing and cuisine-only searches remain ordered by personal taste.
 const relevance=new Map(selected.map(restaurant=>[restaurant.id,restaurantSearchRelevance(restaurant,input)]));
 const baseItems=rankRestaurants(selected,active,input,input.radiusKm).sort((a,b)=>(relevance.get(b.restaurant.id)??0)-(relevance.get(a.restaurant.id)??0));
 if(!s.demo&&job?.status==='succeeded'){
  const candidates=rankRestaurants(eligible,active,input,input.radiusKm).map(item=>item.restaurant);
  const plans=enrichmentPlans(candidates);
  for(const plan of plans){
   const hex=createHash('sha256').update(`${input.searchId}:reviews:${JSON.stringify(plan.urls)}`).digest('hex');
   const batchId=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
   try{
    const next=await queueRefresh(s.client!,'details',plan,batchId);
    // Track the first active batch; stable URL-based IDs keep later polls
    // attached to the same paid jobs as evidence changes ranking.
    if(next && !enrichmentJob && ['queued','running'].includes(next.status))enrichmentJob=next;
    if(!next || ['failed','uncertain','budget_limited'].includes(next.status))warning='Places are available, but review analysis is incomplete. Try Refresh later.';
   }catch{warning='Places are available, but some review updates could not start right now.';}
  }
 }
 const activeJob=(value:typeof job)=>!!value&&['queued','running'].includes(value.status);
 const searchPhase=activeJob(job)?'places':activeJob(enrichmentJob)?'reviews':'complete';
 const saved=conversation?await saveSearchSnapshot(s.client,conversation,input,{items:baseItems,jobId:job?.id,refreshing:searchPhase!=='complete',warning}):null;
 if(s.client&&job&&sourceAuthoritative&&sourced.length&&saved?.title_status==='pending'&&baseItems.length)after(async()=>{try{await nameSavedSearch(s.client!,saved.id,input,baseItems);}catch(error){console.error('Saved search naming failed:',error instanceof Error?error.name:'UnknownError');}});
 const feedback=s.client?await loadFeedback(s.client,s.user.id):demoFeedbackState.items();
 const items=applyRestaurantFeedback(baseItems,feedback,input);
 return json({items,job,enrichmentJob,searchPhase,profileVersion:active.version,dataMode:s.demo?'demo':'live',refreshing:searchPhase!=='complete',warning,savedSearch:saved?savedSearchSummary(saved):undefined});
},true);
