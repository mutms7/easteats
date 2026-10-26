import {discoverInputSchema,tasteProfileSchema} from '@/lib/contracts';
import {requireSession} from '@/server/session';
import {endpoint,HttpError,json,readJson} from '@/server/http';
import {demoRestaurants,demoState} from '@/server/demo';
import {cachedNearby,queueRefresh,searchPlaces} from '@/server/repository';
import {defaultTasteProfile,rankRestaurants} from '@/server/taste';
import {isEastAsianRestaurant,isAsianFusionRestaurant} from '@/lib/eligibility';
import {refreshPlan,enrichmentPlan} from '@/server/refresh-plan';
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
 const pool=sourceAuthoritative?sourced:restaurants;
 const eligible=pool.filter(r=>isEastAsianRestaurant(r)&&(input.mode!=='fusion'||isAsianFusionRestaurant(r))&&(!input.cuisine||[...r.cuisines,...(r.features?.cuisines||[])].some(c=>c.toLowerCase().includes(input.cuisine.toLowerCase())))&&(!input.maxPrice||r.priceLevel===null||r.priceLevel<=input.maxPrice));
 // Google Maps already applied the live text query. Don't require its exact
 // words in the business name before dish evidence has even been extracted.
 const selected=sourceAuthoritative?eligible:eligible.filter(r=>!input.query||`${r.name} ${r.cuisines.join(' ')} ${r.features?.dishes.join(' ')||''}`.toLowerCase().includes(input.query.toLowerCase()));
 const active=profile||defaultTasteProfile();const items=rankRestaurants(selected,active,input,input.radiusKm);
 if(!s.demo&&job?.status==='succeeded'){
  const candidates=rankRestaurants(eligible,active,input,input.radiusKm).map(item=>item.restaurant);
  const enrichment=enrichmentPlan(candidates);
  if(enrichment)try{enrichmentJob=await queueRefresh(s.client!,'details',enrichment,input.searchId);}catch{warning='Places are available. Review updates could not start right now.';}
 }
 const activeJob=(value:typeof job)=>!!value&&['queued','running'].includes(value.status);
 const searchPhase=activeJob(job)?'places':activeJob(enrichmentJob)?'reviews':'complete';
 return json({items,job,enrichmentJob,searchPhase,profileVersion:active.version,dataMode:s.demo?'demo':'live',refreshing:searchPhase!=='complete',warning});
},true);
