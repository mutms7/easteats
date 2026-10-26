import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),cached:vi.fn(),queue:vi.fn()}));
vi.mock('@/server/session',()=>({requireSession:mocks.session}));
vi.mock('@/server/repository',()=>({cachedSearch:mocks.cached,queueRefresh:mocks.queue}));
import {POST} from '@/app/api/places/search/route';
const job={id:'lookup',status:'running',kind:'favorite-search',createdAt:'2026-10-26T00:00:00Z'};
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({demo:false,client:{},user:{id:'user'}});mocks.cached.mockResolvedValue([]);mocks.queue.mockResolvedValue(job);});
const search=(body:unknown)=>POST(new Request('http://localhost:3000/api/places/search',{method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify(body)}));
it('launches a live favorite lookup on a cache miss and returns the running job',async()=>{
 const response=await search({query:' Pho  99 ',city:' Coquitlam '});
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({items:[],job,dataMode:'live'});
 expect(mocks.queue).toHaveBeenCalledWith({},'favorite-search',{query:'pho 99',city:'coquitlam'});
});
it('keeps cached matches visible while checking Google Maps for the same submitted search',async()=>{
 const item={id:'pho-place',name:'Pho 99'};mocks.cached.mockResolvedValue([item]);
 expect(await (await search({query:'Pho99',city:'Coquitlam'})).json()).toMatchObject({items:[item],job});
 expect(mocks.queue).toHaveBeenCalledOnce();
});
it('rejects an invalid search without launching paid work',async()=>{
 expect((await search({query:'x',city:'Coquitlam'})).status).toBe(400);expect(mocks.queue).not.toHaveBeenCalled();
});
