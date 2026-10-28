import {tasteInputSchema,tasteProfileSchema} from '@/lib/contracts';
import {requireSession} from '@/server/session';
import {endpoint,HttpError,json,readJson} from '@/server/http';
import {demoState} from '@/server/demo';
import {compileTasteProfile,provisionalTasteProfile} from '@/server/taste';
import {freshOperation,reserveClaude,settleClaude} from '@/server/repository';
import {assertPricedModel,modelCost} from '@/server/pricing';
export const maxDuration=60;
export const POST=endpoint(async request=>{
 const s=await requireSession();const input=tasteInputSchema.parse(await readJson(request));
 if(s.demo){demoState.answers=input;demoState.profile=provisionalTasteProfile(input.goal);return json({profile:demoState.profile,personalized:false,warning:input.goal?'Demo mode: your selected priority is applied to fictional places. Favorite interpretation needs the live connection.':'This is a demo using default preferences.'});}
 const {data:existing,error:readError}=await s.client!.from('taste_profiles').select('profile,answers').eq('user_id',s.user.id).maybeSingle();if(readError)throw readError;
 const prior=existing?.profile?tasteProfileSchema.parse(existing.profile):null;
 const provisional=input.goal?{...provisionalTasteProfile(input.goal,prior),version:(prior?.version||0)+1}:prior;
 const fallback=provisional??provisionalTasteProfile(input.goal);
 const priorityNotice=input.goal?' Your selected priority is applied.':'';
 const {error:saveError}=await s.client!.from('taste_profiles').upsert({user_id:s.user.id,answers:{...input,_pending:true},profile:provisional,updated_at:new Date().toISOString()});if(saveError)throw saveError;
 if(!process.env.ANTHROPIC_API_KEY||!process.env.SUPABASE_SECRET_KEY)return json({profile:fallback,personalized:false,warning:`Your answers are saved.${priorityNotice} Learning from your favorites will be available once the live connection is ready.`});
 const model=process.env.ANTHROPIC_TASTE_MODEL||'claude-sonnet-5-5';assertPricedModel(model);
 let reservation:Awaited<ReturnType<typeof reserveClaude>>;
 try { reservation=await reserveClaude(freshOperation()); }
 catch(error){if(error instanceof HttpError&&error.code==='BUDGET_LIMIT')return json({profile:fallback,personalized:false,warning:`Your answers are saved.${priorityNotice} Favorite interpretation has reached its spending limit, but you can keep exploring.`});throw error;}
 let actual:number|null=null;
 try {
  const profile=await compileTasteProfile(input,{apiKey:process.env.ANTHROPIC_API_KEY,model,version:(prior?.version||0)+1,onUsage:(usage)=>{actual=modelCost(usage);}});
  await settleClaude(reservation,actual??.25);
  const {error}=await s.client!.from('taste_profiles').update({profile,answers:input,updated_at:new Date().toISOString()}).eq('user_id',s.user.id);if(error)throw error;
  return json({profile,personalized:true});
 } catch {
  // Keep the reservation on uncertain network outcomes; never refund unknown spend.
  if(actual!==null)await settleClaude(reservation,actual).catch(()=>undefined);
  return json({profile:fallback,personalized:false,warning:`Your answers are saved, but favorite interpretation could not finish.${priorityNotice} You can retry from Taste.`});
 }
},true);
