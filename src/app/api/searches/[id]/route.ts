import {requireSession} from '@/server/session';
import {endpoint,json} from '@/server/http';
import {openSavedSearch} from '@/server/saved-searches';
import {loadFeedback,applyRestaurantFeedback,demoFeedbackState} from '@/server/restaurant-feedback';
export const GET=endpoint(async request=>{
 const auth=await requireSession(),id=decodeURIComponent(new URL(request.url).pathname.split('/').pop()??'');
 const search=await openSavedSearch(auth.client,auth.user.id,id);
 search.items=applyRestaurantFeedback(search.items,auth.client?await loadFeedback(auth.client,auth.user.id):demoFeedbackState.items(),search.input);
 return json({search});
});
