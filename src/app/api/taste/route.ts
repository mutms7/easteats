import {tasteInputSchema,tasteProfileSchema} from '@/lib/contracts';
import {requireSession} from '@/server/session';
import {endpoint,json,readJson} from '@/server/http';
import {demoState} from '@/server/demo';
import {compileTasteProfile,defaultTasteProfile} from '@/server/taste';
import {freshOperation,reserveClaude,settleClaude} from '@/server/repository';
import {assertPricedModel,modelCost} from '@/server/pricing';
export const POST=endpoint(async request=>{
 const s=await requireSession();const input=tasteInputSchema.parse(await readJson(request));
 if(s.demo){demoState.answers=input;demoState.profile={...defaultTasteProfile(),interpretation:'Demo profile: these are default preferences. Live taste interpretation needs the Claude connection.'};return json({profile:demoState.profile,personalized:false,warning:'This is a demo using default preferences.'});}
 const {data:existing,error:readError}=await s.client!.from('taste_profiles').select('profile,answers').eq('user_id',s.user.id).maybeSingle();if(readError)throw readError;
 const prior=existing?.profile?tasteProfileSchema.parse(existing.profile):null;
 const {error:saveError}=await s.client!.from('taste_profiles').upsert({user_id:s.user.id,answers:{...input,_pending:true},profile:prior,updated_at:new Date().toISOString()});if(saveError)throw saveError;
 if(!process.env.ANTHROPIC_API_KEY||!process.env.SUPABASE_SECRET_KEY)return json({profile:prior||defaultTasteProfile(),personalized:false,warning:'Your answers are saved. Taste interpretation will be available once the live connection is ready.'});
 const model=process.env.ANTHROPIC_TASTE_MODEL||'claude-sonnet-5-5';assertPricedModel(model);
 const reservation=await reserveClaude(freshOperation());let actual:number|null=null;
 try {
  const profile=await compileTasteProfile(input,{apiKey:process.env.ANTHROPIC_API_KEY,model,version:(prior?.version||0)+1,onUsage:(usage)=>{actual=modelCost(usage);}});
  await settleClaude(reservation,actual??.25);
  const {error}=await s.client!.from('taste_profiles').update({profile,answers:input,updated_at:new Date().toISOString()}).eq('user_id',s.user.id);if(error)throw error;
  return json({profile,personalized:true});
 } catch {
  // Keep the reservation on uncertain network outcomes; never refund unknown spend.
  if(actual!==null)await settleClaude(reservation,actual).catch(()=>undefined);
  return json({profile:prior||defaultTasteProfile(),personalized:false,warning:'Your answers are saved, but taste interpretation couldn’t finish. You can retry from Taste.'});
 }
},true);
