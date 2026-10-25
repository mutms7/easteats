import {cookies} from 'next/headers';
import {configured} from '@/server/config';
import {userClient} from '@/server/supabase';
import {endpoint,json} from '@/server/http';
export const POST=endpoint(async()=>{if(configured()){const c=await userClient();await c.auth.signOut();}(await cookies()).delete('east-eats-demo');return json({ok:true});},true);
