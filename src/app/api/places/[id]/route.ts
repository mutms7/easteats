import {requireSession} from '@/server/session';
import {endpoint,HttpError,json} from '@/server/http';
import {demoRestaurants} from '@/server/demo';
export const GET=endpoint(async(request)=>{
 const s=await requireSession();const id=decodeURIComponent(new URL(request.url).pathname.split('/').pop()||'');
 if(s.demo){const restaurant=demoRestaurants.find(r=>r.id===id);if(!restaurant)throw new HttpError(404,'That restaurant couldn’t be found.');return json({restaurant});}
 const {data,error}=await s.client!.from('restaurants').select('record').eq('id',id).maybeSingle();if(error)throw error;if(!data)throw new HttpError(404,'That restaurant couldn’t be found.');
 const {data:features,error:fe}=await s.client!.from('restaurant_features').select('features').eq('place_id',id).maybeSingle();if(fe)throw fe;
 return json({restaurant:{...data.record,features:features?.features||data.record.features}});
});
