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
it('rejects unrelated live source results rather than treating Google query membership as dish evidence',async()=>{
 m.source.mockResolvedValue([{...place,name:'Rice Kitchen',foodTypes:['rice']},{...place,id:'korean-noodles',name:'Seoul Noodles',cuisines:['Korean restaurant']}]);
 const data=await(await discover({...input,query:'Korean noodles'})).json();
 expect(data.items.map((item:{restaurant:{id:string}})=>item.restaurant.id)).toEqual(['korean-noodles']);
});
it('requires explicit cuisine and food filters together even for authoritative sourced results',async()=>{
 m.source.mockResolvedValue([{...place,id:'korean-rice',name:'Seoul Rice',cuisines:['Korean restaurant']},{...place,id:'chinese-noodles',name:'Noodle House',cuisines:['Chinese restaurant']},{...place,id:'korean-noodles',name:'Seoul Noodles',cuisines:['Korean restaurant']}]);
 const data=await(await discover({...input,query:'',cuisine:'Korean',foodType:'noodles'})).json();
 expect(data.items.map((item:{restaurant:{id:string}})=>item.restaurant.id)).toEqual(['korean-noodles']);
});
it('does not substitute pho or rice dishes for a specific ramen search',async()=>{
 m.source.mockResolvedValue([{...place,id:'pho',name:'Pho 99',cuisines:['Vietnamese restaurant']},{...place,id:'rice',name:'Rice Kitchen',cuisines:['Japanese restaurant']},{...place,id:'ramen',name:'House Kitchen',cuisines:['Japanese restaurant'],listingCategories:['Ramen restaurant']}]);
 const data=await(await discover({...input,query:'ramen'})).json();
 expect(data.items.map((item:{restaurant:{id:string}})=>item.restaurant.id)).toEqual(['ramen']);
});
it('keeps unclassified source businesses out of dish results while scheduling their review enrichment',async()=>{
 const unknown={...place,id:'unknown',name:'House Kitchen',cuisines:['Korean restaurant']};
 m.source.mockResolvedValue([unknown]);m.queue.mockResolvedValueOnce({...job,status:'succeeded'}).mockResolvedValueOnce({...job,id:'reviews',kind:'details'});
 const data=await(await discover({...input,query:'noodles'})).json();
 expect(data.items).toEqual([]);expect(data.warning).toContain('missing dish details');expect(data.searchPhase).toBe('reviews');
 expect(m.queue.mock.calls[1][1]).toBe('details');expect(m.queue.mock.calls[1][2].urls).toContain(unknown.sourceUrl);
});
const focusPlaces=()=>{
 const feature=(quality:number,dishes:string[])=>({...demoRestaurants[0].features!,foodQuality:quality,value:quality,service:quality,atmosphere:quality,confidence:.9,cuisines:['Chinese'],dishes,evidence:[{id:'review',aspect:'food' as const,text:dishes.length?'The noodles are excellent.':'The food is decent.',sourceUrl:'https://example.com/review'}]});
 return [{...place,id:'listed-low',name:'Noodle Dynasty',googleRating:1,features:feature(.1,[])},{...place,id:'incidental-high',name:'Broad Kitchen',googleRating:5,features:feature(.99,['noodles'])},{...place,id:'listed-medium',name:'Noodle Corner',features:feature(.5,[])}];
};
it('puts listed noodle matches before higher-scoring incidental mentions and preserves taste order within the listing tier',async()=>{
 m.source.mockResolvedValue(focusPlaces());
 const data=await(await discover({...input,query:'noodles'})).json();
 expect(data.items.map((item:{restaurant:{id:string}})=>item.restaurant.id)).toEqual(['listed-medium','listed-low','incidental-high']);
 expect(data.items[1].score).toBeLessThan(data.items[2].score);
});
it('preserves personal ranking for browsing and cuisine-only queries',async()=>{
 m.source.mockResolvedValue(focusPlaces());
 for(const query of ['', 'Chinese']){
  const data=await(await discover({...input,query})).json();
  expect(data.items.map((item:{restaurant:{id:string}})=>item.restaurant.id)).toEqual(['incidental-high','listed-medium','listed-low']);
 }
});
