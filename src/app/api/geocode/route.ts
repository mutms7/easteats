import {z} from 'zod';
import {requireSession} from '@/server/session';
import {endpoint,HttpError,json,readJson} from '@/server/http';
import {appOrigin} from '@/server/config';
const places=[{label:'Berkeley, California',lat:37.8715,lng:-122.2730},{label:'Oakland, California',lat:37.8044,lng:-122.2712},{label:'San Francisco, California',lat:37.7749,lng:-122.4194}];
export const POST=endpoint(async request=>{
 await requireSession();const {query}=z.object({query:z.string().trim().min(2).max(150)}).parse(await readJson(request));
 const local=places.filter(p=>p.label.toLowerCase().includes(query.toLowerCase()));if(local.length)return json({items:local});
 const key=process.env.NEXT_PUBLIC_MAPTILER_KEY;if(!key)throw new HttpError(503,'Try Berkeley, Oakland, San Francisco, or use your current location. More locations need the map connection.');
 const response=await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${encodeURIComponent(key)}&limit=5`,{headers:{Origin:appOrigin()},signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('Geocoding unavailable');
 const payload=await response.json();return json({items:(payload.features||[]).map((f:{place_name:string;center:number[]})=>({label:f.place_name,lat:f.center[1],lng:f.center[0]}))});
},true);
