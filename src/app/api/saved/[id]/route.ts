import {requireSession} from '@/server/session';
import {endpoint,HttpError,json} from '@/server/http';
import {demoRestaurants,demoState} from '@/server/demo';
const change=(save:boolean)=>endpoint(async request=>{
 const s=await requireSession();const id=decodeURIComponent(new URL(request.url).pathname.split('/').pop()||'');
 if(s.demo){if(!demoRestaurants.some(r=>r.id===id))throw new HttpError(404,'Restaurant not found.');if(save)demoState.saved.add(id);else demoState.saved.delete(id);return json({saved:save});}
 const result=save?await s.client!.from('saved_places').upsert({user_id:s.user.id,place_id:id},{onConflict:'user_id,place_id',ignoreDuplicates:true}):await s.client!.from('saved_places').delete().eq('user_id',s.user.id).eq('place_id',id);
 if(result.error)throw result.error;return json({saved:save});
},true);
export const PUT=change(true);export const DELETE=change(false);
