import {z} from 'zod';
export type AreaResult={label:string;lat:number;lng:number;id?:string;primaryText?:string;secondaryText?:string;kind?:'address'|'street'|'landmark'|'area'};
export const geocodeInputSchema=z.object({query:z.string().trim().min(2,'Enter an address, landmark, or city.').max(150,'Keep the location under 150 characters.'),proximity:z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)}).optional()});
export type GeocodeInput=z.infer<typeof geocodeInputSchema>;
export class GeocodingError extends Error {constructor(public status:number,message:string,public code:string){super(message);this.name='GeocodingError';}}
const aliases:Record<string,string>={ave:'avenue',av:'avenue',hwy:'highway',rd:'road',st:'street',blvd:'boulevard',dr:'drive',ln:'lane',pkwy:'parkway',w:'west',e:'east',n:'north',s:'south'};
const words=(value:string):string[]=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.map(word=>aliases[word]??word)||[];
const terms=(value:string)=>[...new Set(words(value))].filter(word=>!['of','the','in','at'].includes(word));
/** Keep provider order for ties; explicit street numbers and place names beat proximity bias. */
export function rankAreas<T extends AreaResult>(query:string,items:T[]):T[]{
 const queryTerms=terms(query),leadingNumber=words(query)[0]?.match(/^\d+[a-z]?$/u)?.[0];
 const score=(item:AreaResult)=>{
  const label=new Set(words(item.label)),primary=terms(item.primaryText??item.label.split(',')[0]);
  let value=queryTerms.reduce((sum,term)=>sum+(label.has(term)?/^\d/u.test(term)?6:1:0),0);
  if(queryTerms.length&&primary.join(' ')===queryTerms.join(' '))value+=queryTerms.length+3;
  if(leadingNumber){value+=primary.includes(leadingNumber)?12:-12;if(item.kind==='address')value+=2;}
  return value;
 };
 return items.map((item,index)=>({item,index,score:score(item)})).sort((a,b)=>b.score-a.score||a.index-b.index).map(({item})=>item);
}
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown,max=700)=>typeof value==='string'?value.trim().slice(0,max):'';
export function normalizeGeocodingPayload(payload:unknown):AreaResult[]{
 const body=record(payload);
 if(!Array.isArray(body.features))throw new GeocodingError(502,'Location search returned incomplete results. Try again.','GEOCODING_RESPONSE');
 const result:AreaResult[]=[],seen=new Set<string>();
 for(const raw of body.features.slice(0,30)){
  const feature=record(raw),geometry=record(feature.geometry),properties=record(feature.properties);
  const center=Array.isArray(feature.center)?feature.center:geometry.type==='Point'&&Array.isArray(geometry.coordinates)?geometry.coordinates:null;
  if(!center||center.length<2||typeof center[0]!=='number'||typeof center[1]!=='number'||!Number.isFinite(center[0])||!Number.isFinite(center[1])||Math.abs(center[0])>180||Math.abs(center[1])>90)continue;
  const label=text(feature.place_name),name=text(feature.text,250),number=text(feature.address,60);
  if(!label)continue;
  const types=Array.isArray(feature.place_type)?feature.place_type.filter((item):item is string=>typeof item==='string'):[];
  const kind:NonNullable<AreaResult['kind']>=types.includes('poi')?'landmark':types.includes('address')?(number?'address':'street'):['street','road','virtual_street'].includes(text(properties.kind))?'street':'area';
  const primaryText=(number&&name?`${number} ${name}`:name)||label.split(',')[0].trim();
  const secondaryText=label.toLowerCase().startsWith(primaryText.toLowerCase())?label.slice(primaryText.length).replace(/^\s*,\s*/,'').trim():label.split(',').slice(1).join(',').trim();
  // MapTiler can return one feature ID for different civic-address points.
  const id=`${text(feature.id,200)||'location'}:${center[0]},${center[1]}`;
  if(seen.has(id))continue;seen.add(id);
  result.push({id,label,primaryText,secondaryText,kind,lat:center[1],lng:center[0]});
 }
 if(body.features.length&&!result.length)throw new GeocodingError(502,'Location search returned incomplete results. Try again.','GEOCODING_RESPONSE');
 return result;
}
export async function searchLocations(input:GeocodeInput,options:{key:string;origin:string;fetch?:typeof fetch;signal?:AbortSignal}):Promise<AreaResult[]>{
 const parsed=geocodeInputSchema.parse(input);
 if(!options.key.trim())throw new GeocodingError(503,'Location search is unavailable. Use your current location or try again later.','GEOCODING_CONFIGURATION');
 const url=new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(parsed.query)}.json`);
 url.search=new URLSearchParams({key:options.key,limit:'8',autocomplete:'true',language:'en',types:'poi,address,municipality,place,region,subregion,county,country'}).toString();
 if(parsed.proximity)url.searchParams.set('proximity',`${parsed.proximity.lng},${parsed.proximity.lat}`);
 let response:Response;
 try{response=await(options.fetch??fetch)(url,{headers:{Origin:options.origin},cache:'no-store',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)});}
 catch{throw new GeocodingError(503,'Location search took too long. Try again or use your current location.','GEOCODING_UNAVAILABLE');}
 if(response.status===429)throw new GeocodingError(429,'Location search is busy. Wait a moment and try again.','GEOCODING_BUSY');
 if(!response.ok)throw new GeocodingError(503,'Location search is temporarily unavailable. Try again or use your current location.','GEOCODING_UNAVAILABLE');
 let payload:unknown;try{payload=await response.json();}catch{throw new GeocodingError(502,'Location search returned incomplete results. Try again.','GEOCODING_RESPONSE');}
 return rankAreas(parsed.query,normalizeGeocodingPayload(payload)).slice(0,8);
}
export const demoAreas:AreaResult[]=[{id:'demo-berkeley',label:'Berkeley, California',primaryText:'Berkeley',secondaryText:'California',kind:'area',lat:37.8715,lng:-122.2730},{id:'demo-oakland',label:'Oakland, California',primaryText:'Oakland',secondaryText:'California',kind:'area',lat:37.8044,lng:-122.2712},{id:'demo-sf',label:'San Francisco, California',primaryText:'San Francisco',secondaryText:'California',kind:'area',lat:37.7749,lng:-122.4194}];
