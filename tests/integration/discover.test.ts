import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),cached:vi.fn(),source:vi.fn(),queue:vi.fn(),profile:vi.fn(),begin:vi.fn(),save:vi.fn(),feedback:vi.fn(),applyFeedback:vi.fn()}));
vi.mock('@/server/session',()=>({requireSession:m.session}));
vi.mock('@/server/repository',()=>({cachedNearby:m.cached,searchPlaces:m.source,queueRefresh:m.queue}));
vi.mock('@/server/saved-searches',()=>({beginSavedSearch:m.begin,saveSearchSnapshot:m.save,savedSearchSummary:(row:{id:string})=>({id:row.id,title:'Saved noodles',resultCount:1})}));
vi.mock('@/server/restaurant-feedback',()=>({loadFeedback:m.feedback,applyRestaurantFeedback:m.applyFeedback}));
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
 m.begin.mockImplementation(async(_client,_user,search)=>({id:search.savedSearchId??search.searchId,title_status:'fallback'}));m.save.mockImplementation(async(_client,row)=>row);
 m.feedback.mockResolvedValue([]);m.applyFeedback.mockImplementation(items=>items);
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
it('verifies conversation ownership before any paid work can be queued',async()=>{
 const {HttpError}=await import('@/server/http');m.begin.mockRejectedValueOnce(new HttpError(404,'Search unavailable'));
 expect((await discover({...input,savedSearchId:'d4f81891-25e3-4bce-90e8-930645bd9d71'})).status).toBe(404);
 expect(m.queue).not.toHaveBeenCalled();expect(m.cached).not.toHaveBeenCalled();
});
it('keeps conversation identity separate from refresh-run identity and persists a server-built base snapshot',async()=>{
 const conversationId='d4f81891-25e3-4bce-90e8-930645bd9d71';
 m.applyFeedback.mockImplementation(items=>items.map((item:{score:number})=>({...item,score:item.score+3})));
 const data=await(await discover({...input,savedSearchId:conversationId,areaLabel:'Private location'})).json();
 expect(data.savedSearch.id).toBe(conversationId);expect(m.begin.mock.calls[0][2]).toMatchObject({searchId:id,savedSearchId:conversationId});
 expect(m.queue.mock.calls[0][3]).toBe(id);expect(m.begin.mock.invocationCallOrder[0]).toBeLessThan(m.queue.mock.invocationCallOrder[0]);
 const snapshot=m.save.mock.calls[0][3];expect(snapshot.jobId).toBe(job.id);expect(snapshot.items[0].score).toBe(data.items[0].score-3);
});

it('keeps later review job identities as earlier batches complete and rank order changes',async()=>{
 const places=Array.from({length:25},(_,i)=>({...place,id:`place-${i}`,sourceUrl:`https://www.google.com/maps/place/${String(i).padStart(3,'0')}`}));
 m.source.mockResolvedValue(places);
 m.queue.mockImplementation(async(_client,kind)=>kind==='discovery'?{...job,status:'succeeded'}:{...job,kind:'details'});
 await discover({...input,query:''});
 const initial=m.queue.mock.calls.filter(call=>call[1]==='details').map(call=>({plan:call[2],id:call[3]}));
 m.queue.mockClear();
 m.source.mockResolvedValue(places.map((r,i)=>i<12?{...r,features:{...demoRestaurants[0].features!,updatedAt:new Date().toISOString()}}:r).reverse());
 await discover({...input,query:''});
 const remaining=m.queue.mock.calls.filter(call=>call[1]==='details').map(call=>({plan:call[2],id:call[3]}));
 expect(remaining).toEqual(initial.slice(1));
});
it.each(['failed','uncertain','budget_limited'])('reports incomplete enrichment when a details job is %s',async status=>{
 m.queue.mockResolvedValueOnce({...job,status:'succeeded'}).mockResolvedValueOnce({...job,kind:'details',status});
 const data=await(await discover(input)).json();
 expect(data.warning).toContain('review analysis is incomplete');
 expect(data.refreshing).toBe(false);
});
