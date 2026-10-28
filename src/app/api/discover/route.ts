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
export const POST=endpoint(async request=>{
 const s=await requireSession();const input=discoverInputSchema.parse(await readJson(request));let profile=demoState.profile,answers=s.demo?demoState.answers:null;
 if(!s.demo&&!input.searchId)throw new HttpError(400,'Refresh East Eats and submit the search again.','SEARCH_ID_REQUIRED');
 if(!s.demo){const {data,error}=await s.client!.from('taste_profiles').select('profile,answers').eq('user_id',s.user.id).maybeSingle();if(error)throw error;profile=data?.profile?tasteProfileSchema.parse(data.profile):null;answers=data?.answers;}
 if(!answers)throw new HttpError(409,'Tell us about a favorite restaurant first.','QUESTIONNAIRE_REQUIRED');
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
 const items=rankRestaurants(selected,active,input,input.radiusKm).sort((a,b)=>(relevance.get(b.restaurant.id)??0)-(relevance.get(a.restaurant.id)??0));
 if(!s.demo&&job?.status==='succeeded'){
  const candidates=rankRestaurants(eligible,active,input,input.radiusKm).map(item=>item.restaurant);
  const plans=enrichmentPlans(candidates);
  for(const [index,plan] of plans.entries()){
   const hex=createHash('sha256').update(`${input.searchId}:reviews:${index}`).digest('hex');
   const batchId=index===0?input.searchId!:`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
   try{
    const next=await queueRefresh(s.client!,'details',plan,batchId);
    // Track the first active batch. Each subsequent completed batch makes
    // the next one eligible for client polling without launching a duplicate.
    if(next && !enrichmentJob && ['queued','running'].includes(next.status))enrichmentJob=next;
   }catch{warning='Places are available, but some review updates could not start right now.';}
  }
 }
 const activeJob=(value:typeof job)=>!!value&&['queued','running'].includes(value.status);
 const searchPhase=activeJob(job)?'places':activeJob(enrichmentJob)?'reviews':'complete';
 return json({items,job,enrichmentJob,searchPhase,profileVersion:active.version,dataMode:s.demo?'demo':'live',refreshing:searchPhase!=='complete',warning});
},true);
