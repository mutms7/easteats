import {requireSession} from '@/server/session';
import {endpoint,json} from '@/server/http';
import {listSavedSearches} from '@/server/saved-searches';
export const GET=endpoint(async()=>{const auth=await requireSession();return json({items:await listSavedSearches(auth.client,auth.user.id)});});
