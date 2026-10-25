import {discoverInputSchema,tasteProfileSchema} from '@/lib/contracts';
import {requireSession} from '@/server/session';
import {endpoint,HttpError,json,readJson} from '@/server/http';
import {demoRestaurants,demoState} from '@/server/demo';
import {cachedNearby,queueRefresh} from '@/server/repository';
import {defaultTasteProfile,rankRestaurants} from '@/server/taste';
import {isEastAsianRestaurant} from '@/lib/eligibility';
import {refreshPlan} from '@/server/refresh-plan';
export const POST=endpoint(async request=>{
 const s=await requireSession();const input=discoverInputSchema.parse(await readJson(request));let profile=demoState.profile,answers=s.demo?demoState.answers:null;
 if(!s.demo){const {data,error}=await s.client!.from('taste_profiles').select('profile,answers').eq('user_id',s.user.id).maybeSingle();if(error)throw error;profile=data?.profile?tasteProfileSchema.parse(data.profile):null;answers=data?.answers;}
 if(!answers)throw new HttpError(409,'Tell us about a favorite restaurant first.','QUESTIONNAIRE_REQUIRED');
 const restaurants=s.demo?demoRestaurants:await cachedNearby(s.client!,input,input.radiusKm);
 const selected=restaurants.filter(r=>isEastAsianRestaurant(r)&&(input.mode!=='fusion'||r.features?.fusion)&&(!input.cuisine||[...r.cuisines,...(r.features?.cuisines||[])].some(c=>c.toLowerCase().includes(input.cuisine.toLowerCase())))&&(!input.maxPrice||r.priceLevel===null||r.priceLevel<=input.maxPrice)&&(!input.query||`${r.name} ${r.features?.dishes.join(' ')||''}`.toLowerCase().includes(input.query.toLowerCase())));
 const active=profile||defaultTasteProfile();const items=rankRestaurants(selected,active,input,input.radiusKm);
 const plan=refreshPlan(restaurants,input);
 let job=null,warning: string|undefined;
 if(!s.demo&&plan){try{job=await queueRefresh(s.client!,plan.kind,plan.input);}catch{warning='These are saved results. We couldn’t refresh the details right now.';}}
 return json({items,job,profileVersion:active.version,dataMode:s.demo?'demo':'live',refreshing:!!job&&!['succeeded','failed','budget_limited'].includes(job.status),warning});
},true);
