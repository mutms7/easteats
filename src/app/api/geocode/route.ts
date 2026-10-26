import {requireSession} from '@/server/session';
import {endpoint,HttpError,json,readJson} from '@/server/http';
import {appOrigin} from '@/server/config';
import {demoAreas,geocodeInputSchema,GeocodingError,rankAreas,searchLocations} from '@/server/geocoding';
export const POST=endpoint(async request=>{
 const auth=await requireSession();
 const input=geocodeInputSchema.parse(await readJson(request));
 if(auth.demo)return json({items:rankAreas(input.query,demoAreas.filter(place=>place.label.toLowerCase().includes(input.query.toLowerCase())))});
 try{return json({items:await searchLocations(input,{key:process.env.NEXT_PUBLIC_MAPTILER_KEY??'',origin:appOrigin(),signal:request.signal})});}
 catch(error){if(error instanceof GeocodingError)throw new HttpError(error.status,error.message,error.code);throw error;}
},true);
