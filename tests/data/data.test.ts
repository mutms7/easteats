import { describe, it, expect, vi } from 'vitest';
import { normalizePlace, needsRefresh, refreshKey, FRESHNESS, ApifyClient, buildActorInput } from '../../src/server/data/index.ts';
import { processRefreshJobs, reconcileWebhook, safeSecretEqual, sourceHash, type Rpc, type WorkerDependencies } from '../../supabase/functions/_shared/worker.ts';

const place = { placeId:'place-1',title:'Test Noodle Shop',location:{lat:37.87,lng:-122.27},city:'Berkeley',address:'123 Fictional Street',url:'https://www.google.com/maps?cid=1',categories:['Chinese restaurant'],totalScore:3.2,reviewsCount:51,price:'$$',reviews:[{reviewId:'r1',text:'The handmade noodles are springy.',stars:5,name:'DO NOT SAVE',reviewerId:'private-person-id',publishedAtDate:'2026-10-01',reviewUrl:'https://www.google.com/maps/reviews/r1'},{reviewId:'r1',text:'Duplicate review',stars:5}] };

describe('normalization and freshness',()=>{
  it('preserves business and review evidence while dropping reviewer personal fields',()=>{
    const result=normalizePlace(place)!;
    expect(result.restaurant).toMatchObject({id:'place-1',name:'Test Noodle Shop',googleRating:3.2,priceLevel:2,features:null});
    expect(result.reviews).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('DO NOT SAVE');
    expect(JSON.stringify(result)).not.toContain('private-person-id');
  });
  it('rejects places without a stable ID, name, or valid location',()=>{
    expect(normalizePlace({...place,placeId:''})).toBeNull();
    expect(normalizePlace({...place,location:{lat:91,lng:0}})).toBeNull();
    expect(normalizePlace(null)).toBeNull();
  });
  it('does not treat missing ratings as zero, and rejects unsafe URLs',()=>{
    const result=normalizePlace({...place,totalScore:null,price:'Unknown',imageUrl:'javascript:alert(1)',website:'data:text/html,x'})!;
    expect(result.restaurant.googleRating).toBeNull();
    expect(result.restaurant.priceLevel).toBeNull();
    expect(result.restaurant.imageUrl).toBeNull();
    expect(result.restaurant.websiteUrl).toBeNull();
  });
  it('creates stable IDs for text-only reviews and caps source reviews',()=>{
    const raw={...place,reviews:Array.from({length:50},(_,i)=>({text:`Review ${i}`}))};
    expect(normalizePlace(raw)?.reviews).toHaveLength(40);
    expect(normalizePlace(raw)?.reviews[0].id).toBe(normalizePlace(raw)?.reviews[0].id);
  });
  it('refreshes invalid, future, missing, and expired timestamps only',()=>{
    const now=Date.parse('2026-10-25T00:00:00Z');
    expect(needsRefresh(null,FRESHNESS.details,now)).toBe(true);
    expect(needsRefresh('bad',FRESHNESS.details,now)).toBe(true);
    expect(needsRefresh('2026-10-26T00:00:00Z',FRESHNESS.details,now)).toBe(true);
    expect(needsRefresh('2026-10-24T18:00:00Z',FRESHNESS.details,now)).toBe(true);
    expect(needsRefresh('2026-10-24T19:00:00Z',FRESHNESS.details,now)).toBe(false);
  });
  it('coalesces equivalent nearby search keys without retaining exact location',()=>{
    expect(refreshKey({kind:'discovery',lat:37.87001,lng:-122.27001,query:'  Noodle   Shop '})).toBe(refreshKey({kind:'discovery',lat:37.87002,lng:-122.27002,query:'noodle shop'}));
  });
});

describe('Apify adapter',()=>{
  it('supports favorite search anywhere without requiring a city',()=>{
    expect(buildActorInput({query:'My favorite noodle shop'})).toMatchObject({searchStringsArray:['My favorite noodle shop'],scrapeReviewsPersonalData:false,reviewsSort:'newest'});
    expect(buildActorInput({query:'Noodles',city:'Tokyo'})).toHaveProperty('locationQuery','Tokyo');
  });
  it('uses the fusion discovery query only when the user has not supplied one',()=>{
    expect(buildActorInput({mode:'fusion',city:'Berkeley'})).toHaveProperty('searchStringsArray',['East Asian fusion restaurant']);
    expect(buildActorInput({mode:'fusion',city:'Berkeley',query:'Korean tacos'})).toHaveProperty('searchStringsArray',['Korean tacos']);
    expect(buildActorInput({mode:'for-you',city:'Berkeley'})).toHaveProperty('searchStringsArray',['East Asian restaurant']);
  });
  it('caps paid expansion and uses a bounded polygon',()=>{
    const input=buildActorInput({lat:37.87,lng:-122.27,radiusKm:5,maxPlaces:999,maxReviews:999});
    expect(input).toMatchObject({maxCrawledPlacesPerSearch:40,maxReviews:40,maxImages:0,customGeolocation:{type:'Polygon'}});
    expect(buildActorInput({urls:['https://www.google.com/maps?cid=1']})).toHaveProperty('startUrls');
    expect(()=>buildActorInput({urls:['https://attacker.example/']})).toThrow();
    expect(()=>buildActorInput({lat:91,lng:0})).toThrow();
  });
  it('sets the provider charge cap, disables automatic restarts, and keeps tokens out of URLs',async()=>{
    const calls:Array<{url:string;init?:RequestInit}>=[];
    const fetcher=vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{calls.push({url:String(input),init});return Response.json({data:{id:'run1',actId:'actor',defaultDatasetId:'dataset1',status:'READY'}});}) as typeof fetch;
    const client=new ApifyClient('secret-token',fetcher);
    await client.start({query:'Noodles',city:'Berkeley'},1,'https://example.com/webhook','webhook-secret');
    const u=new URL(calls[0].url);
    expect(u.searchParams.get('maxTotalChargeUsd')).toBe('1');
    expect(u.searchParams.get('restartOnError')).toBe('false');
    expect(calls[0].url).not.toContain('secret-token');
    expect(calls[0].init?.headers).toMatchObject({Authorization:'Bearer secret-token'});
    const hooks=JSON.parse(atob(u.searchParams.get('webhooks')!));
    expect(JSON.parse(hooks[0].headersTemplate)).toEqual({'x-webhook-secret':'webhook-secret'});
  });
  it('does not automatically retry a failed paid launch',async()=>{
    const fetcher=vi.fn(async()=>{throw new Error('timeout');}) as typeof fetch;
    await expect(new ApifyClient('token',fetcher).start({query:'Noodles'})).rejects.toThrow('timeout');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

const queueJob={id:'job1',status:'running',kind:'discovery',input:{query:'Noodles',city:'Berkeley'},run_id:'run1',dataset_id:'dataset1',reservation_id:'apify-budget',cursor_offset:0};
function dependencies(override:Partial<WorkerDependencies>={},responses:Record<string,unknown>={}) {
  const calls:Array<{name:string;args?:Record<string,unknown>}>=[];
  const rpc:Rpc=async(name,args)=>{calls.push({name,args});return {data:name in responses?responses[name]:name==='claim_refresh_jobs'?[queueJob]:name==='reserve_usage'?'reservation1':null,error:null};};
  const apify={start:vi.fn(),getRun:vi.fn(async()=>({id:'run1',actId:'actor',status:'SUCCEEDED',defaultDatasetId:'dataset1',usageTotalUsd:.01})),dataset:vi.fn(async()=>[place])};
  const extract=vi.fn(async()=>({foodQuality:.8,value:null,service:null,atmosphere:null,cuisines:['Chinese'],dishes:['noodles'],flavors:[],spice:null,fusion:false,reviewCount:1,confidence:.1,evidence:[],updatedAt:new Date().toISOString()}));
  return {deps:{rpc,apify,extract,anthropicKey:'test-key',extractModel:'claude-haiku-5-5',extractionVersion:'v1',...override} as WorkerDependencies,calls};
}

describe('durable worker',()=>{
  it('starts favorite lookup with five places and zero reviews, retaining the same spending cap',async()=>{
    const {deps,calls}=dependencies({}, {claim_refresh_jobs:[{...queueJob,kind:'favorite-search',run_id:null,input:{query:'Pho 99',city:'Coquitlam'}}]});
    deps.apify.start=vi.fn(async()=>({id:'favorite-run',actId:'actor',status:'READY',defaultDatasetId:'favorite-dataset'}));
    await processRefreshJobs(deps);
    expect(deps.apify.start).toHaveBeenCalledWith({query:'Pho 99',city:'Coquitlam',maxPlaces:5,maxReviews:0},1,undefined,undefined);
    expect(calls.find(c=>c.name==='reserve_usage')?.args?.p_reserved_usd).toBe(1);
    expect(deps.extract).not.toHaveBeenCalled();
  });
  it('ingests all five favorite matches and completes immediately without Claude',async()=>{
    const {deps,calls}=dependencies({}, {claim_refresh_jobs:[{...queueJob,kind:'favorite-search'}]});
    deps.apify.dataset=vi.fn(async(_id,offset)=>offset===0?Array.from({length:5},(_,i)=>({...place,placeId:`favorite-${i}`,title:`Pho 99 ${i}`})):[]);
    deps.extract=vi.fn(async()=>{throw new Error('Favorite search must not invoke Claude');});
    expect(await processRefreshJobs(deps)).toEqual({processed:1,failed:0});
    const ingested=calls.filter(c=>c.name==='ingest_place');
    expect(ingested).toHaveLength(5);
    expect(ingested.every(c=>Array.isArray(c.args?.p_reviews)&&c.args.p_reviews.length===0)).toBe(true);
    expect(calls.some(c=>c.name==='update_refresh_job'&&c.args?.p_status==='succeeded'&&c.args?.p_offset===5)).toBe(true);
    expect(deps.apify.dataset).toHaveBeenNthCalledWith(1,'dataset1',0,5);
    expect(deps.apify.dataset).toHaveBeenNthCalledWith(2,'dataset1',5,1);
    expect(deps.extract).not.toHaveBeenCalled();
    expect(calls.filter(c=>c.name==='reserve_usage'&&c.args?.p_provider==='anthropic')).toHaveLength(0);
  });
  it('publishes partial favorite matches while the source is running without releasing its budget reservation',async()=>{
    const {deps,calls}=dependencies({}, {claim_refresh_jobs:[{...queueJob,kind:'favorite-search',cursor_offset:2}]});
    deps.apify.getRun=vi.fn(async()=>({id:'run1',actId:'actor',status:'RUNNING',defaultDatasetId:'dataset1',usageTotalUsd:.01}));
    await processRefreshJobs(deps);
    expect(deps.apify.dataset).toHaveBeenCalledWith('dataset1',2,5);
    expect(calls.some(c=>c.name==='ingest_place')).toBe(true);
    expect(calls.some(c=>c.name==='update_refresh_job'&&c.args?.p_status==='running'&&c.args?.p_offset===3)).toBe(true);
    expect(calls.some(c=>c.name==='update_refresh_job'&&c.args?.p_status==='succeeded')).toBe(false);
    expect(calls.some(c=>c.name==='settle_usage')).toBe(false);
    expect(deps.extract).not.toHaveBeenCalled();
  });
  it('keeps an empty partial favorite dataset running until the source finishes',async()=>{
    const {deps,calls}=dependencies({}, {claim_refresh_jobs:[{...queueJob,kind:'favorite-search'}]});
    deps.apify.getRun=vi.fn(async()=>({id:'run1',actId:'actor',status:'RUNNING',defaultDatasetId:'dataset1'}));
    deps.apify.dataset=vi.fn(async()=>[]);
    await processRefreshJobs(deps);
    expect(calls.some(c=>c.name==='update_refresh_job'&&c.args?.p_status==='succeeded')).toBe(false);
    expect(calls.some(c=>c.name==='update_refresh_job'&&c.args?.p_status==='running')).toBe(true);
  });
  it('does not change discovery processing before its source run completes',async()=>{
    const {deps}=dependencies();
    deps.apify.getRun=vi.fn(async()=>({id:'run1',actId:'actor',status:'RUNNING',defaultDatasetId:'dataset1'}));
    await processRefreshJobs(deps);
    expect(deps.apify.dataset).not.toHaveBeenCalled();
    expect(deps.extract).not.toHaveBeenCalled();
  });
  it('holds an ambiguous Apify launch rather than launching it twice',async()=>{
    const {deps,calls}=dependencies({}, {claim_refresh_jobs:[{...queueJob,status:'queued',run_id:null}]});
    deps.apify.start=vi.fn(async()=>{throw new Error('timeout');});
    await processRefreshJobs(deps);
    expect(deps.apify.start).toHaveBeenCalledTimes(1);
    expect(calls.some(c=>c.name==='update_refresh_job'&&c.args?.p_status==='uncertain')).toBe(true);
    expect(calls.some(c=>c.name==='settle_usage')).toBe(false);
  });
  it('does not launch an Actor when a budget reservation is denied',async()=>{
    const {deps,calls}=dependencies({}, {claim_refresh_jobs:[{...queueJob,run_id:null}],reserve_usage:null});
    await processRefreshJobs(deps);
    expect(deps.apify.start).not.toHaveBeenCalled();
    expect(calls.some(c=>c.name==='update_refresh_job'&&c.args?.p_status==='budget_limited')).toBe(true);
  });
  it('ingests small pages, checkpoints, and explicitly releases the lease',async()=>{
    const {deps,calls}=dependencies();
    expect(await processRefreshJobs(deps)).toEqual({processed:1,failed:0});
    expect(calls.find(c=>c.name==='ingest_place')?.args?.p_record).toMatchObject({id:'place-1'});
    expect(calls.some(c=>c.name==='update_refresh_job'&&c.args?.p_status==='ingesting'&&c.args?.p_offset===1)).toBe(true);
    expect(calls.some(c=>c.name==='release_refresh_job')).toBe(true);
    expect(calls.find(c=>c.name==='claim_refresh_jobs')?.args?.p_limit).toBe(1);
  });
  it('reserves a NEW model operation after a charged response fails validation',async()=>{
    const {deps,calls}=dependencies();
    deps.extract=vi.fn(async(_reviews,options)=>{await options.onUsage({model:'claude-haiku-5-5',inputTokens:1000,outputTokens:100});throw new Error('invalid model output');});
    await processRefreshJobs(deps);
    await processRefreshJobs(deps);
    const paid=calls.filter(c=>c.name==='reserve_usage'&&c.args?.p_provider==='anthropic');
    expect(paid).toHaveLength(2);
    expect(paid[0].args?.p_operation).not.toBe(paid[1].args?.p_operation);
    expect(calls.filter(c=>c.name==='settle_usage'&&c.args?.p_id==='reservation1')).toHaveLength(0);
    expect(calls.filter(c=>c.name==='retry_refresh_job')).toHaveLength(2);
  });
  it.each([{inputTokens:100_000,expected:.0105},{inputTokens:100_001,expected:.0525005}])('accounts for the Haiku long-input pricing threshold at $inputTokens tokens',async({inputTokens,expected})=>{
    const {deps,calls}=dependencies();
    deps.extract=vi.fn(async(_reviews,options)=>{
      await options.onUsage({model:'claude-haiku-5-5',inputTokens,outputTokens:1000});
      return {foodQuality:null,value:null,service:null,atmosphere:null,cuisines:[],dishes:[],flavors:[],spice:null,fusion:false,reviewCount:1,confidence:0,evidence:[],updatedAt:new Date().toISOString()};
    });
    await processRefreshJobs(deps);
    const charge=calls.find(c=>c.name==='settle_usage'&&c.args?.p_id==='reservation1');
    expect(charge?.args?.p_actual_usd).toBeCloseTo(expected,8);
  });
  it('holds the full reservation during all eight concurrent chunks, then settles their total once',async()=>{
    const {deps,calls}=dependencies();
    deps.extract=vi.fn(async(_reviews,options)=>{
      await Promise.all(Array.from({length:8},()=>options.onUsage({model:'claude-haiku-5-5',inputTokens:1000,outputTokens:1000})));
      expect(calls.filter(c=>c.name==='settle_usage'&&c.args?.p_id==='reservation1')).toHaveLength(0);
      return {foodQuality:null,value:null,service:null,atmosphere:null,cuisines:[],dishes:[],flavors:[],spice:null,fusion:false,reviewCount:40,confidence:0,evidence:[],updatedAt:new Date().toISOString()};
    });
    await processRefreshJobs(deps);
    const charges=calls.filter(c=>c.name==='settle_usage'&&c.args?.p_id==='reservation1').map(c=>Number(c.args?.p_actual_usd));
    expect(charges).toHaveLength(1);expect(charges[0]).toBeCloseTo(.0048,8);
    expect(deps.apify.dataset).toHaveBeenCalledWith('dataset1',0,1);
    expect(deps.extract).toHaveBeenCalledWith(expect.any(Array),expect.objectContaining({timeoutMs:25_000}));
  });
  it('keeps the complete reservation when one chunk reports usage but another has an unknown outcome',async()=>{
    const {deps,calls}=dependencies();
    deps.extract=vi.fn(async(_reviews,options)=>{
      await options.onUsage({model:'claude-haiku-5-5',inputTokens:1000,outputTokens:1000});
      const error=new Error('Taste interpretation could not connect.');
      Object.assign(error,{code:'PROVIDER'});
      throw error;
    });
    const result=await processRefreshJobs(deps);
    expect(result).toEqual({processed:0,failed:1});
    expect(calls.find(c=>c.name==='reserve_usage'&&c.args?.p_provider==='anthropic')?.args?.p_reserved_usd).toBe(.1);
    expect(calls.filter(c=>c.name==='settle_usage'&&c.args?.p_id==='reservation1')).toHaveLength(0);
    expect(calls.some(c=>c.name==='record_refresh_error'&&c.args?.p_code==='PROVIDER')).toBe(true);
  });
  it('keeps the reservation when a completed extraction supplies no usage information',async()=>{
    const {deps,calls}=dependencies();
    await processRefreshJobs(deps);
    expect(calls.filter(c=>c.name==='settle_usage'&&c.args?.p_id==='reservation1')).toHaveLength(0);
  });
  it('reserves the larger total needed by older Haiku extraction models',async()=>{
    const {deps,calls}=dependencies({extractModel:'claude-haiku-4-5-20251001'});
    await processRefreshJobs(deps);
    expect(calls.find(c=>c.name==='reserve_usage'&&c.args?.p_provider==='anthropic')?.args?.p_reserved_usd).toBe(.5);
  });
  it('uses feature cache without another paid extraction',async()=>{
    const {deps,calls}=dependencies();
    const hash=await sourceHash(normalizePlace(place)!.reviews,'v1','claude-haiku-5-5');
    const original=deps.rpc;
    deps.rpc=async(name,args)=>name==='get_cached_features'?{data:{sourceHash:hash,features:await dependencies().deps.extract([],{} as never)},error:null}:original(name,args);
    await processRefreshJobs(deps);
    expect(deps.extract).not.toHaveBeenCalled();
    expect(calls.filter(c=>c.name==='reserve_usage'&&c.args?.p_provider==='anthropic')).toHaveLength(0);
  });
  it('does not trust callback dataset IDs and treats a duplicate completed callback idempotently',async()=>{
    const {deps,calls}=dependencies({}, {get_job_by_run:{...queueJob,status:'succeeded'}});
    expect(await reconcileWebhook('run1',deps)).toBe(true);
    expect(deps.apify.getRun).not.toHaveBeenCalled();
    expect(calls.filter(c=>c.name==='update_refresh_job')).toHaveLength(0);
  });
  it('rejects callbacks for unowned runs before contacting the provider',async()=>{
    const {deps}=dependencies({}, {get_job_by_run:null});
    expect(await reconcileWebhook('unknown-run',deps)).toBe(false);
    expect(deps.apify.getRun).not.toHaveBeenCalled();
  });
  it('requires nonempty matching secrets',async()=>{
    expect(await safeSecretEqual('secret','secret')).toBe(true);
    expect(await safeSecretEqual('wrong','secret')).toBe(false);
    expect(await safeSecretEqual('',undefined)).toBe(false);
  });
});
