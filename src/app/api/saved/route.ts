import {requireSession} from '@/server/session';
import {endpoint,json} from '@/server/http';
import {demoRestaurants,demoState} from '@/server/demo';
export const GET=endpoint(async()=>{
 const s=await requireSession();if(s.demo)return json({items:demoRestaurants.filter(r=>demoState.saved.has(r.id))});
 const {data:rows,error}=await s.client!.from('saved_places').select('place_id').eq('user_id',s.user.id);if(error)throw error;
 if(!rows?.length)return json({items:[]});const {data,error:e}=await s.client!.from('restaurants').select('record').in('id',rows.map(r=>r.place_id));if(e)throw e;return json({items:(data||[]).map(r=>r.record)});
});
