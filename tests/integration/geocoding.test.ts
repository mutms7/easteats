import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {rankAreas,normalizeGeocodingPayload,searchLocations} from '@/server/geocoding';
const auth=vi.hoisted(()=>({signedIn:true,demo:false}));
vi.mock('@/server/session',async()=>{const {HttpError}=await import('@/server/http');return{requireSession:vi.fn(async()=>{if(!auth.signedIn)throw new HttpError(401,'Sign in to continue.','SIGN_IN_REQUIRED');return{user:{id:'user'},demo:auth.demo};})};});
import {POST} from '@/app/api/geocode/route';
const address={id:'address.22108333',place_name:'200 University Avenue West, Waterloo, Ontario N2L 3G1, Canada',text:'University Avenue West',address:'200',place_type:['address'],center:[-80.542175,43.471733]};
const options={key:'test-geocoding-key',origin:'http://localhost:3000'};
const request=(value:unknown)=>new Request('http://localhost:3000/api/geocode',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify(value)});
let provider:ReturnType<typeof vi.fn>;
beforeEach(()=>{auth.signedIn=true;auth.demo=false;vi.stubEnv('APP_URL','http://localhost:3000');vi.stubEnv('NEXT_PUBLIC_MAPTILER_KEY',options.key);provider=vi.fn(async()=>Response.json({features:[address]}));vi.stubGlobal('fetch',provider);});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('ranks the requested city above a similarly named street elsewhere',()=>{
 const results=[{label:'University Avenue, Fredericton, New Brunswick, Canada',lat:45.95,lng:-66.63},{label:'University Avenue, Waterloo, Ontario, Canada',lat:43.517834,lng:-80.517859},{label:'University Avenue, Cedar Falls, Iowa',lat:42.51,lng:-92.44}];
 expect(rankAreas('University Avenue Waterloo',results)[0]).toEqual(results[1]);expect(results[0].label).toContain('Fredericton');
});
describe('geocoder normalization and relevance',()=>{
 it('uses provider civic numbers and separates address, street, landmark, and area labels',()=>{
  const items=normalizeGeocodingPayload({features:[address,{...address,id:'street.1',address:undefined,place_name:'University Avenue West, Waterloo, Canada'},{id:'poi.1',text:'University of Waterloo',place_name:'University of Waterloo, University Campus Lane, Waterloo, Canada',place_type:['poi'],center:[-80.5452,43.4702]},{id:'region.1',text:'Ontario',place_name:'Ontario, Canada',place_type:['region'],center:[-86,50]}]});
  expect(items.map(item=>item.kind)).toEqual(['address','street','landmark','area']);
  expect(items[0]).toMatchObject({label:address.place_name,primaryText:'200 University Avenue West',secondaryText:'Waterloo, Ontario N2L 3G1, Canada',lat:43.471733,lng:-80.542175});
  expect(items[1].primaryText).toBe('University Avenue West');
 });
 it('keeps distinct address points even when MapTiler reuses a feature ID',()=>{
  const items=normalizeGeocodingPayload({features:[address,address,{...address,center:[-80.539307,43.47066],place_name:'200 University Avenue West, Waterloo, Ontario N2L 0C7, Canada'}]});
  expect(items).toHaveLength(2);expect(items[0].id).not.toBe(items[1].id);
 });
 it('rejects invalid coordinates and accepts a valid GeoJSON point fallback',()=>{
  const items=normalizeGeocodingPayload({features:[{...address,center:[-80,91]},{...address,center:['-80',43]},{...address,center:[Infinity,43]},{...address,center:undefined,geometry:{type:'Point',coordinates:[-80.54,43.47]}}]});
  expect(items).toHaveLength(1);expect(items[0]).toMatchObject({lat:43.47,lng:-80.54});
  expect(()=>normalizeGeocodingPayload({features:[{...address,center:[-181,43]}]})).toThrow('incomplete results');
 });
 it('ranks the exact house number with street abbreviations ahead of nearby partial matches',()=>{
  const items=normalizeGeocodingPayload({features:[{...address,address:'170',place_name:'170 University Avenue West, Waterloo, Canada'},{...address,id:'correct',center:[-80.54,43.47]}]});
  expect(rankAreas('200 University Ave W Waterloo',items)[0].primaryText).toBe('200 University Avenue West');
  const highway=normalizeGeocodingPayload({features:[{...address,id:'highway',address:'2991',text:'Lougheed Highway',place_name:'2991 Lougheed Highway, Coquitlam, Canada'}]});
  expect(rankAreas('2991 Lougheed Hwy Coquitlam',highway)[0].primaryText).toBe('2991 Lougheed Highway');
 });
 it('preserves provider ordering for equally relevant suggestions',()=>{
  const items=[{label:'Waterloo, Ontario, Canada',lat:43,lng:-80},{label:'Waterloo, Iowa, United States',lat:42,lng:-92}];
  expect(rankAreas('Waterloo',items)).toEqual(items);
 });
 it('builds an address/landmark autocomplete request with proximity as longitude,latitude',async()=>{
  await searchLocations({query:'200 University Ave W Waterloo',proximity:{lat:43.47,lng:-80.54}},{...options,fetch:provider as typeof fetch});
  const [raw,init]=provider.mock.calls[0],url=new URL(String(raw));
  expect(url.hostname).toBe('api.maptiler.com');expect(decodeURIComponent(url.pathname)).toContain('200 University Ave W Waterloo');
  expect(url.searchParams.get('autocomplete')).toBe('true');expect(url.searchParams.get('limit')).toBe('8');expect(url.searchParams.get('proximity')).toBe('-80.54,43.47');
  expect(url.searchParams.get('types')?.split(',')).toEqual(expect.arrayContaining(['address','poi','municipality','region','country']));
  expect(url.searchParams.has('bbox')).toBe(false);expect(init.headers).toEqual({Origin:options.origin});
 });
});
describe('POST /api/geocode',()=>{
 it('requires sign-in before requesting external suggestions',async()=>{
  auth.signedIn=false;const response=await POST(request({query:'Waterloo'}));
  expect(response.status).toBe(401);expect(provider).not.toHaveBeenCalled();
 });
 it.each([{query:'W'},{query:'Waterloo',proximity:{lat:91,lng:0}},{query:'Waterloo',proximity:{lat:0,lng:181}},{query:'Waterloo',proximity:{lat:43}},{query:'Waterloo',proximity:{lat:'43',lng:-80}}])('validates autocomplete input before calling the provider: %j',async input=>{
  const response=await POST(request(input));expect(response.status).toBe(400);expect(provider).not.toHaveBeenCalled();
 });
 it('returns backward-compatible coordinates and structured address text',async()=>{
  const response=await POST(request({query:'200 University Ave W Waterloo',proximity:{lat:43.47,lng:-80.54}}));
  expect(response.status).toBe(200);expect((await response.json()).items[0]).toMatchObject({label:address.place_name,lat:43.471733,lng:-80.542175,primaryText:'200 University Avenue West',kind:'address'});
  expect(new URL(String(provider.mock.calls[0][0])).searchParams.get('proximity')).toBe('-80.54,43.47');
 });
 it('never intercepts a live city search with hardcoded launch-city coordinates',async()=>{
  provider.mockResolvedValue(Response.json({features:[{id:'city.uk',text:'Berkeley',place_name:'Berkeley, Gloucestershire, United Kingdom',place_type:['municipality'],center:[-2.4585,51.6913]}]}));
  const response=await POST(request({query:'Berkeley'}));expect(provider).toHaveBeenCalledTimes(1);
  expect((await response.json()).items[0].label).toContain('United Kingdom');
 });
 it('uses launch-city fixtures only for an explicit demo session',async()=>{
  auth.demo=true;const response=await POST(request({query:'Berkeley'}));
  expect((await response.json()).items[0]).toMatchObject({id:'demo-berkeley',lat:37.8715,lng:-122.273});expect(provider).not.toHaveBeenCalled();
 });
 it('returns an honest empty list when the provider has no suggestions',async()=>{
  provider.mockResolvedValue(Response.json({features:[]}));
  const response=await POST(request({query:'No matching location'}));expect(response.status).toBe(200);expect(await response.json()).toEqual({items:[]});
 });
 it('returns readable provider errors without exposing the provider key or response body',async()=>{
  provider.mockResolvedValue(new Response(options.key,{status:403}));
  const response=await POST(request({query:'Waterloo'})),body=await response.json();
  expect(response.status).toBe(503);expect(body.error).toContain('Location search');expect(JSON.stringify(body)).not.toContain(options.key);
 });
 it('reports rate limits, malformed provider data, and network failures without pretending no places exist',async()=>{
  provider.mockResolvedValueOnce(new Response('',{status:429})).mockResolvedValueOnce(Response.json({features:[{...address,center:[-80,999]}]})).mockRejectedValueOnce(new Error('network failure'));
  expect((await POST(request({query:'Waterloo'}))).status).toBe(429);
  expect((await POST(request({query:'Waterloo'}))).status).toBe(502);
  expect((await POST(request({query:'Waterloo'}))).status).toBe(503);
 });
});
