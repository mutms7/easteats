import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),compile:vi.fn(),reserve:vi.fn(),settle:vi.fn(),read:vi.fn(),upsert:vi.fn(),update:vi.fn()}));
vi.mock('@/server/session',()=>({requireSession:m.session}));
vi.mock('@/server/repository',()=>({freshOperation:()=> 'fixture-taste-operation',reserveClaude:m.reserve,settleClaude:m.settle}));
vi.mock('@/server/taste',async original=>({...await original<typeof import('@/server/taste')>(),compileTasteProfile:m.compile}));
import {POST} from '@/app/api/taste/route';
import {defaultTasteProfile,provisionalTasteProfile} from '@/server/taste';
import {demoState} from '@/server/demo';
import {HttpError} from '@/server/http';
const favorite={restaurantId:'fixture-favorite',name:'Favorite',city:'',reasons:['Great value'],notes:''};
const save=(goal:string)=>POST(new Request('http://localhost:3000/api/taste',{method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({favorites:[favorite],goal})}));
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('APP_URL','http://localhost:3000');vi.stubEnv('ANTHROPIC_API_KEY','');vi.stubEnv('SUPABASE_SECRET_KEY','');
 m.read.mockResolvedValue({data:null,error:null});m.upsert.mockResolvedValue({error:null});m.update.mockResolvedValue({error:null});m.reserve.mockResolvedValue({id:'fixture-reservation'});m.settle.mockResolvedValue(undefined);
 const client={from:()=>({select:()=>({eq:()=>({maybeSingle:m.read})}),upsert:m.upsert,update:(value:unknown)=>({eq:()=>m.update(value)})})};
 m.session.mockResolvedValue({user:{id:'fixture-user'},demo:false,client});
});
afterEach(()=>{vi.unstubAllEnvs();});
it('persists a usable selected-priority profile when favorite interpretation is unavailable',async()=>{
 const response=await save('service'),data=await response.json();expect(response.status).toBe(200);expect(data.personalized).toBe(false);
 expect(data.profile.weights.service).toBeGreaterThan(defaultTasteProfile().weights.service);
 expect(m.upsert.mock.calls[0][0]).toMatchObject({answers:{goal:'service',_pending:true},profile:{weights:data.profile.weights}});
 expect(m.compile).not.toHaveBeenCalled();expect(m.reserve).not.toHaveBeenCalled();
});
it('preserves the selected-priority fallback after a provider failure without releasing unknown spend',async()=>{
 vi.stubEnv('ANTHROPIC_API_KEY','fixture-key');vi.stubEnv('SUPABASE_SECRET_KEY','fixture-secret');m.compile.mockRejectedValue(new Error('fixture provider failure'));
 const data=await(await save('date-night')).json();expect(data.personalized).toBe(false);expect(data.profile.weights).toEqual(provisionalTasteProfile('date-night').weights);expect(m.settle).not.toHaveBeenCalled();
});
it('rejects an unsupported priority before saving or contacting a provider',async()=>{
 expect((await save('ignore-the-system')).status).toBe(400);expect(m.upsert).not.toHaveBeenCalled();expect(m.compile).not.toHaveBeenCalled();
});
it('keeps the saved priority usable when the Claude spending limit prevents a call',async()=>{
 vi.stubEnv('ANTHROPIC_API_KEY','fixture-key');vi.stubEnv('SUPABASE_SECRET_KEY','fixture-secret');m.reserve.mockRejectedValue(new HttpError(429,'Budget reached','BUDGET_LIMIT'));
 const response=await save('date-night'),data=await response.json();expect(response.status).toBe(200);expect(data.personalized).toBe(false);expect(data.profile.weights).toEqual(provisionalTasteProfile('date-night').weights);expect(data.warning).toContain('spending limit');expect(m.compile).not.toHaveBeenCalled();
});
it('applies the goal in demo mode without calling paid providers',async()=>{
 m.session.mockResolvedValue({user:{id:'fixture-demo'},demo:true,client:null});
 const data=await(await save('hidden-gems')).json();expect(data.profile.weights).toEqual(provisionalTasteProfile('hidden-gems').weights);expect(demoState.answers?.goal).toBe('hidden-gems');expect(m.compile).not.toHaveBeenCalled();expect(m.reserve).not.toHaveBeenCalled();
});
it('provisional retries preserve tags without repeatedly compounding goal weights',()=>{
 const prior={...defaultTasteProfile(),dishes:['dumplings']};const first=provisionalTasteProfile('service',prior),second=provisionalTasteProfile('service',first);
 expect(second.weights).toEqual(first.weights);expect(second.dishes).toEqual(['dumplings']);expect(provisionalTasteProfile(undefined,prior)).toBe(prior);
});
