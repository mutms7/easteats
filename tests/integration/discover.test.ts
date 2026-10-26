import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),cached:vi.fn(),source:vi.fn(),queue:vi.fn(),profile:vi.fn()}));
vi.mock('@/server/session',()=>({requireSession:m.session}));
vi.mock('@/server/repository',()=>({cachedNearby:m.cached,searchPlaces:m.source,queueRefresh:m.queue}));
import {POST} from '@/app/api/discover/route';
import {defaultTasteProfile} from '@/server/taste';
import {demoRestaurants} from '@/server/demo';
const id='50af1120-c246-4f90-a1e3-cf838796255b';
const input={lat:37.8715,lng:-122.273,radiusKm:5,mode:'for-you',searchId:id,query:'spicy noodles'};
const place={...demoRestaurants[0],name:'Noodle Bar',lat:37.8715,lng:-122.273,cuisines:['Chinese restaurant'],features:null};
const job={id:'source-job',status:'running',kind:'discovery',createdAt:'2026-10-26T00:00:00Z'};
beforeEach(()=>{
 vi.clearAllMocks();
 const client={from:()=>({select:()=>({eq:()=>({maybeSingle:m.profile})})})};
 m.session.mockResolvedValue({user:{id:'user'},demo:false,client});
 m.profile.mockResolvedValue({data:{profile:defaultTasteProfile(),answers:{favorites:[]}},error:null});
 m.cached.mockResolvedValue([place]);m.source.mockResolvedValue([place]);m.queue.mockResolvedValue(job);
});
const discover=(body:unknown)=>POST(new Request('http://localhost:3000/api/discover',{method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify(body)}));
it('keeps live dish-query results even without literal words in the business name',async()=>{
 const data=await(await discover(input)).json();expect(data.items).toHaveLength(1);expect(data.items[0].restaurant.name).toBe('Noodle Bar');expect(data.searchPhase).toBe('places');
 expect(m.queue.mock.calls[0][1]).toBe('discovery');expect(m.queue.mock.calls[0][2]).toMatchObject({query:'spicy noodles'});expect(m.queue.mock.calls[0][3]).toBe(id);
});
it('starts review enrichment separately after publishing source places',async()=>{
 const review={...job,id:'review-job',kind:'details'};m.queue.mockResolvedValueOnce({...job,status:'succeeded'}).mockResolvedValueOnce(review);
 const data=await(await discover(input)).json();expect(data.items).toHaveLength(1);expect(data.job.id).toBe(job.id);expect(data.enrichmentJob).toEqual(review);expect(data.searchPhase).toBe('reviews');
});
it('does not turn a genuine completed empty source search into unrelated cached matches',async()=>{
 m.source.mockResolvedValue([]);m.queue.mockResolvedValue({...job,status:'succeeded'});
 const data=await(await discover({...input,query:''})).json();expect(data.items).toHaveLength(0);expect(m.queue).toHaveBeenCalledOnce();
});
it('includes sourced Asian fusion before food evidence is available',async()=>{
 m.source.mockResolvedValue([{...place,cuisines:['Asian fusion restaurant']}]);
 expect((await(await discover({...input,mode:'fusion'})).json()).items).toHaveLength(1);
});
