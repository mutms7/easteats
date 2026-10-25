import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
export function budgetClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key)throw new Error('Add SUPABASE_SECRET_KEY before running paid CLI jobs.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function reserve(provider:'apify'|'anthropic',label:string,cap:number){
 const client=budgetClient();const {data,error}=await client.rpc('reserve_usage',{p_provider:provider,p_operation:`${label}:${randomUUID()}`,p_reserved_usd:cap});
 if(error)throw new Error('Could not reserve the paid-job budget.');if(!data)throw new Error('The application spending ceiling has been reached.');
 return {client,id:String(data)};
}
export async function settle(r:Awaited<ReturnType<typeof reserve>>,cost:number){const {error}=await r.client.rpc('settle_usage',{p_id:r.id,p_actual_usd:cost});if(error)throw new Error('Could not reconcile usage. Reservation remains held.');}
