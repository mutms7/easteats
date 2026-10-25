import type {SupabaseClient} from '@supabase/supabase-js';
import type {Restaurant,RefreshJob,Location} from '@/lib/contracts';
import {restaurantSchema} from '@/lib/contracts';
import {adminClient} from './supabase';
import {HttpError} from './http';
import {createHash,randomUUID} from 'node:crypto';
export async function cachedNearby(client:SupabaseClient,location:Location,radiusKm:number):Promise<Restaurant[]> {
 const {data,error}=await client.rpc('nearby_restaurants',{p_lat:location.lat,p_lng:location.lng,p_radius_km:radiusKm});if(error)throw error;
 return (data||[]).map((r:unknown)=>restaurantSchema.parse(r));
}
export async function cachedSearch(client:SupabaseClient,query:string,city:string):Promise<Restaurant[]> {
 // Escape LIKE metacharacters. PostgREST receives values through query parameters.
 const escaped=query.replace(/[\\%_]/g,'\\$&');
 let req=client.from('restaurants').select('record').ilike('record->>name',`%${escaped}%`).limit(15);
 if(city) req=req.ilike('record->>city',`%${city.replace(/[\\%_]/g,'\\$&')}%`);
 const {data,error}=await req;if(error)throw error;
 return (data||[]).map(r=>restaurantSchema.parse(r.record));
}
export async function queueRefresh(client:SupabaseClient,kind:RefreshJob['kind'],input:Record<string,unknown>):Promise<RefreshJob|null>{
 const key=createHash('sha256').update(JSON.stringify({kind,...input})).digest('hex');
 const {data,error}=await client.rpc('request_refresh',{p_kind:kind,p_key:key,p_input:input});if(error)throw error;
 // Cron is the durable dispatcher; this is an optional low-latency kick.
 const workerSecret=process.env.WORKER_SECRET;
 if(workerSecret&&process.env.NEXT_PUBLIC_SUPABASE_URL) {
   await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/refresh-worker`,{method:'POST',headers:{'x-worker-secret':workerSecret,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(1500)}).catch(()=>undefined);
 }
 return data as RefreshJob|null;
}
export async function reserveClaude(operation:string) {
 const client=adminClient();
 const {data,error}=await client.rpc('reserve_usage',{p_provider:'anthropic',p_operation:operation,p_reserved_usd:.25});
 if(error)throw error;if(!data)throw new HttpError(429,'Live taste updates have reached their spending limit. Your answers are saved.','BUDGET_LIMIT');
 return {client,id:String(data)};
}
export async function settleClaude(reservation:Awaited<ReturnType<typeof reserveClaude>>,cost:number){
 const {error}=await reservation.client.rpc('settle_usage',{p_id:reservation.id,p_actual_usd:cost});if(error)throw error;
}
export function freshOperation(){return `taste:${randomUUID()}`;}
