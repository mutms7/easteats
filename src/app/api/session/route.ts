import {session} from '@/server/session';
import {googleProviderReady,demoEnabled} from '@/server/config';
import {demoState} from '@/server/demo';
import {endpoint,json} from '@/server/http';
import {tasteInputSchema} from '@/lib/contracts';
import {defaultTasteProfile} from '@/server/taste';
export const GET=endpoint(async()=>{
  const s=await session(); let profile=null,answers=null;
  if(s.demo){profile=demoState.profile;answers=demoState.answers;}
  else if(s.user&&s.client){const {data,error}=await s.client.from('taste_profiles').select('profile,answers').eq('user_id',s.user.id).maybeSingle();if(error) throw error;profile=data?.profile??null;answers=data?.answers??null;}
  const valid=tasteInputSchema.safeParse(answers);const personalized=!!profile&&!s.demo;
  const pending=!!answers&&typeof answers==='object'&&'_pending' in answers&&answers._pending===true;
  if(!profile&&valid.success)profile={...defaultTasteProfile(),interpretation:'These are default preferences. Your answers are saved, and you can retry personalization from Taste.'};
  return json({user:s.user?{id:s.user.id,email:s.user.email}:null,configured:s.user?true:await googleProviderReady(),demo:demoEnabled(),profile,answers:valid.success?valid.data:null,dataMode:s.demo?'demo':'live',personalized,warning:pending?'Your answers are saved. Your latest taste update hasn’t finished; retry it from Taste.':undefined});
});
