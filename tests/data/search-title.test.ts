import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {discoverInputSchema} from '../../src/lib/contracts';
import {demoRestaurants} from '../../src/server/demo';
const budget=vi.hoisted(()=>({reserve:vi.fn(),settle:vi.fn()}));
vi.mock('@/server/repository',()=>({reserveClaude:budget.reserve,settleClaude:budget.settle}));
import {deterministicSearchTitle,nameSavedSearch} from '../../src/server/saved-search-title';

const id='50af1120-c246-4f90-a1e3-cf838796255b';
const input=discoverInputSchema.parse({lat:37.8715,lng:-122.273,query:'sushi near 123 Private Street',areaLabel:'123 Private Street',searchId:id});
const items=[{restaurant:demoRestaurants[0],score:50,distanceKm:1,confidence:.5,explanation:''}];
let claimed:boolean,updates:Array<Record<string,unknown>>,provider:ReturnType<typeof vi.fn>,client:SupabaseClient;
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('ANTHROPIC_API_KEY','test-only');vi.stubEnv('ANTHROPIC_SEARCH_MODEL','claude-haiku-5-5');claimed=false;updates=[];
 client={rpc:vi.fn(async()=>{if(claimed)return{data:false,error:null};claimed=true;return{data:true,error:null};}),from:()=>({update:(value:Record<string,unknown>)=>{updates.push(value);return{eq:()=>({eq:async()=>({error:null})})};}})} as unknown as SupabaseClient;
 budget.reserve.mockResolvedValue({id:'reservation'});budget.settle.mockResolvedValue(undefined);
 provider=vi.fn(async()=>Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({title:'Sushi in Berkeley'})}],usage:{input_tokens:200,output_tokens:20}}));vi.stubGlobal('fetch',provider);
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('once-only metered saved search titles',()=>{
 it('uses an atomic claim so concurrent polls make one paid call and records known usage',async()=>{
  await Promise.all([nameSavedSearch(client,id,input,items),nameSavedSearch(client,id,input,items)]);
  expect(budget.reserve).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(new RegExp(`^search-title:${id}:`)));expect(provider).toHaveBeenCalledOnce();expect(budget.settle).toHaveBeenCalledOnce();expect(budget.settle.mock.calls[0][1]).toBeCloseTo(.00003);
  expect(updates).toEqual([{title:'Sushi in Berkeley',title_status:'ready'}]);
 });
 it('sends only recognized food facets and public cities, never private location/query text',async()=>{
  await nameSavedSearch(client,id,input,items);
  const request=JSON.parse(provider.mock.calls[0][1].body),payload=JSON.parse(request.messages[0].content).untrusted_data;
  expect(payload).toEqual({cuisines:[],foodTypes:['sushi'],dishes:[],cities:['Berkeley']});
  expect(JSON.stringify(request)).not.toContain('123 Private');expect(JSON.stringify(request)).not.toContain('37.8715');expect(request.max_tokens).toBe(128);expect(provider.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
 });
 it('keeps a deterministic fallback with missing credentials and never retries it on polls',async()=>{
  vi.stubEnv('ANTHROPIC_API_KEY','');await nameSavedSearch(client,id,input,items);await nameSavedSearch(client,id,input,items);
  expect(updates).toEqual([{title:'Sushi in Berkeley',title_status:'fallback'}]);expect(budget.reserve).not.toHaveBeenCalled();expect(provider).not.toHaveBeenCalled();
 });
 it('keeps unknown transport spend reserved and does not retry a failed naming attempt',async()=>{
  provider.mockRejectedValue(new Error('transport timeout'));await nameSavedSearch(client,id,input,items);await nameSavedSearch(client,id,input,items);
  expect(provider).toHaveBeenCalledOnce();expect(budget.settle).not.toHaveBeenCalled();expect(updates[0].title_status).toBe('fallback');
 });
 it('accounts for returned usage even if the generated title is invalid',async()=>{
  provider.mockResolvedValue(Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({title:'<invalid>'})}],usage:{input_tokens:200,output_tokens:20}}));
  await nameSavedSearch(client,id,input,items);expect(budget.settle).toHaveBeenCalledOnce();expect(updates[0].title_status).toBe('fallback');
 });
 it('does not claim or spend before public restaurant city data is available',async()=>{
  await nameSavedSearch(client,id,input,[]);expect(client.rpc).not.toHaveBeenCalled();expect(budget.reserve).not.toHaveBeenCalled();
  expect(deterministicSearchTitle(input)).toBe('Sushi');
 });
 it('falls back without a model call if budget reservation fails',async()=>{
  budget.reserve.mockRejectedValue(new Error('budget exhausted'));await nameSavedSearch(client,id,input,items);
  expect(provider).not.toHaveBeenCalled();expect(updates[0].title_status).toBe('fallback');
 });
});
