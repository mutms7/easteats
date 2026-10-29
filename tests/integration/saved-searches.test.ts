import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {discoverInputSchema} from '@/lib/contracts';
import {demoRestaurants} from '@/server/demo';
import {defaultTasteProfile} from '@/server/taste';
const m=vi.hoisted(()=>({session:vi.fn(),source:vi.fn(),queue:vi.fn(),reserve:vi.fn(),settle:vi.fn(),feedback:vi.fn(),apply:vi.fn()}));
vi.mock('@/server/session',()=>({requireSession:m.session}));
vi.mock('@/server/repository',()=>({searchPlaces:m.source,queueRefresh:m.queue,reserveClaude:m.reserve,settleClaude:m.settle}));
vi.mock('@/server/restaurant-feedback',()=>({loadFeedback:m.feedback,applyRestaurantFeedback:m.apply}));
import {GET as history} from '@/app/api/searches/route';
import {GET as open} from '@/app/api/searches/[id]/route';
import {beginSavedSearch,saveSearchSnapshot} from '@/server/saved-searches';
import {HttpError} from '@/server/http';

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const id='50af1120-c246-4f90-a1e3-cf838796255b',run='b3e09514-0c7b-424f-bbe1-d4244665e80a';
const input=discoverInputSchema.parse({searchId:run,lat:37.8715,lng:-122.273,query:'noodles',areaLabel:'Private street address'});
const item={restaurant:demoRestaurants[0],score:70,distanceKm:1,confidence:.8,explanation:'Saved base result',baseScore:70};
const fixture=()=>({id,user_id:owner,title:'Noodles in Berkeley',title_status:'ready',input,area_label:input.areaLabel!,result_snapshot:{items:[item]} as {items:typeof item[];jobId?:string;refreshing?:boolean;warning?:string},result_count:1,active_search_id:run,created_at:'2026-10-28T00:00:00Z',updated_at:'2026-10-28T00:00:00Z',last_opened_at:'2026-10-28T00:00:00Z'});
let row:ReturnType<typeof fixture>,client:SupabaseClient,queries:Array<{table:string;fields?:string;filters:Array<[string,unknown]>;patch?:Record<string,unknown>}>,rpc:ReturnType<typeof vi.fn>,provider:ReturnType<typeof vi.fn>;
function testClient():SupabaseClient{
 rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
  if(name==='get_refresh_job')return{data:{id:args.p_id,status:'succeeded'},error:null};
  if(name==='save_search_snapshot'){
   if(args.p_run_id===row.active_search_id){row.result_snapshot=args.p_snapshot as typeof row.result_snapshot;row.result_count=row.result_snapshot.items.length;}
   return{data:structuredClone(row),error:null};
  }
  throw new Error(`Unexpected RPC: ${name}`);
 });
 return{rpc,from:(table:string)=>{
  const query:{table:string;fields?:string;filters:Array<[string,unknown]>;patch?:Record<string,unknown>}={table,filters:[]};queries.push(query);
  const records=()=>{
   const available=table==='search_conversations'?[row]:table==='taste_profiles'?[{user_id:owner,profile:defaultTasteProfile()}]:[];
   return available.filter(value=>query.filters.every(([key,target])=>(value as Record<string,unknown>)[key]===target));
  };
  const result=()=>{const data=records();if(query.patch){for(const record of data)Object.assign(record,query.patch);return{data:null,error:null};}return{data:structuredClone(data),error:null};};
  const chain={select:(fields:string)=>{query.fields=fields;return chain;},update:(patch:Record<string,unknown>)=>{query.patch=patch;return chain;},eq:(key:string,value:unknown)=>{query.filters.push([key,value]);return chain;},order:()=>chain,limit:()=>chain,maybeSingle:async()=>({data:structuredClone(records()[0]??null),error:null}),then:(resolve:(value:unknown)=>unknown,reject:(error:unknown)=>unknown)=>Promise.resolve(result()).then(resolve,reject)};
  return chain;
 }} as unknown as SupabaseClient;
}
beforeEach(()=>{
 vi.clearAllMocks();row=fixture();queries=[];client=testClient();provider=vi.fn();vi.stubGlobal('fetch',provider);
 m.session.mockResolvedValue({user:{id:owner},demo:false,client});m.source.mockResolvedValue([]);m.feedback.mockResolvedValue([]);m.apply.mockImplementation(items=>items);
});
afterEach(()=>vi.unstubAllGlobals());
const request=(suffix='')=>new Request(`https://east-eats.example/api/searches${suffix}`);

describe('private saved-search history and replay',()=>{
 it('requires sign-in before listing or opening any saved search',async()=>{
  m.session.mockRejectedValue(new HttpError(401,'Sign in required'));
  expect((await history(request())).status).toBe(401);expect((await open(request(`/${id}`))).status).toBe(401);expect(queries).toEqual([]);
 });
 it('lists compact owner-filtered summaries using generated result counts without downloading inputs or snapshots',async()=>{
  row.result_count=7;
  const response=await history(request()),body=await response.json();
  expect(body.items[0]).toMatchObject({id,title:'Noodles in Berkeley',resultCount:7});
  expect(body.items[0].items).toBeUndefined();expect(body.items[0].input).toBeUndefined();
  expect(queries[0].fields).toContain('result_count');expect(queries[0].fields).not.toContain('result_snapshot');expect(queries[0].fields).not.toContain('input');expect(queries[0].filters).toContainEqual(['user_id',owner]);
 });
 it('opens a stable snapshot with current feedback, marks it recently opened, and never starts paid work',async()=>{
  m.feedback.mockResolvedValue([{restaurantId:item.restaurant.id,sentiment:'dislike'}]);m.apply.mockImplementation(items=>items.map((value:typeof item)=>({...value,score:50})));
  const before=row.last_opened_at;
  const response=await open(request(`/${id}`)),body=await response.json();
  expect(response.status).toBe(200);expect(body.search).toMatchObject({id,input:{searchId:run},items:[{score:50,baseScore:70}]});
  expect(row.last_opened_at).not.toBe(before);expect(m.apply.mock.calls[0][2]).toMatchObject({query:'noodles'});
  await open(request(`/${id}`));
  expect(m.queue).not.toHaveBeenCalled();expect(m.reserve).not.toHaveBeenCalled();expect(provider).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
 });
 it('cannot open a different account’s search or leak its title',async()=>{
  row.user_id=other;
  const response=await open(request(`/${id}`));expect(response.status).toBe(404);expect(await response.text()).not.toContain('Noodles in Berkeley');expect(m.feedback).not.toHaveBeenCalled();
 });
 it('rejects malformed conversation IDs without provider or queue calls',async()=>{
  expect((await open(request('/not-a-uuid'))).status).toBe(400);expect(queries).toEqual([]);expect(m.queue).not.toHaveBeenCalled();
 });
 it('hydrates an empty snapshot from its already-running owned job using only database reads',async()=>{
  row.result_snapshot={items:[],jobId:'existing-job',refreshing:true};row.title_status='pending';
  m.source.mockResolvedValue([demoRestaurants[0]]);
  const response=await open(request(`/${id}`)),body=await response.json();
  expect(response.status).toBe(200);expect(body.search.items[0].restaurant.id).toBe(demoRestaurants[0].id);
  expect(m.source).toHaveBeenCalledWith(client,'existing-job');expect(rpc.mock.calls.map(call=>call[0])).toEqual(['get_refresh_job','save_search_snapshot']);
  expect(m.queue).not.toHaveBeenCalled();expect(m.reserve).not.toHaveBeenCalled();expect(provider).not.toHaveBeenCalled();
 });
 it('returns an honest pending message when an existing source job has not published places',async()=>{
  row.result_snapshot={items:[],jobId:'existing-job',refreshing:true};rpc.mockResolvedValue({data:{status:'running'},error:null});
  const body=await(await open(request(`/${id}`))).json();expect(body.search.items).toEqual([]);expect(body.search.warning).toContain('still running');expect(m.queue).not.toHaveBeenCalled();expect(provider).not.toHaveBeenCalled();
 });
});

describe('conversation persistence boundaries',()=>{
 it('uses savedSearchId as conversation identity and keeps paid-run identity separate',async()=>{
  rpc.mockResolvedValue({data:row,error:null});
  await beginSavedSearch(client,owner,{...input,savedSearchId:id});
  expect(rpc).toHaveBeenCalledWith('begin_search_conversation',expect.objectContaining({p_id:id,p_run_id:run,p_area_label:'Private street address'}));
 });
 it('passes only server-built snapshot data to the checkpoint RPC',async()=>{
  rpc.mockResolvedValue({data:row,error:null});const owned=await beginSavedSearch(client,owner,{...input,savedSearchId:id});
  await saveSearchSnapshot(client,owned,input,{items:[item],jobId:'source-job',refreshing:true});
  expect(rpc).toHaveBeenLastCalledWith('save_search_snapshot',{p_id:id,p_run_id:run,p_snapshot:{items:[item],jobId:'source-job',refreshing:true}});
 });
});
