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
 const {data,error}=await client.rpc('search_restaurants',{p_query:query,p_city:city});if(error)throw error;
 return (data||[]).map((record:unknown)=>restaurantSchema.parse(record));
}
export async function searchPlaces(client:SupabaseClient,jobId:string):Promise<Restaurant[]>{
 const {data,error}=await client.rpc('search_places',{p_job_id:jobId});if(error)throw error;
 return (data||[]).map((record:unknown)=>restaurantSchema.parse(record));
}
export async function queueRefresh(client:SupabaseClient,kind:RefreshJob['kind'],input:Record<string,unknown>,searchId?:string):Promise<RefreshJob|null>{
 const sourceInput=searchId?{...input,searchId}:input;
 const key=createHash('sha256').update(JSON.stringify(searchId?{kind,searchId}:{kind,...sourceInput})).digest('hex');
 const {data,error}=await client.rpc('request_refresh',{p_kind:kind,p_key:key,p_input:sourceInput});
 if(error){if(error.message.includes('Daily refresh limit reached'))throw new HttpError(429,'You’ve reached today’s live search limit. Your existing results are still available.','SEARCH_LIMIT');throw error;}
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
