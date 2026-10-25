import {cookies} from 'next/headers';
import {demoEnabled} from '@/server/config';
import {endpoint,HttpError,json} from '@/server/http';
export const POST=endpoint(async()=>{if(!demoEnabled())throw new HttpError(404,'Demo isn’t enabled.');(await cookies()).set('east-eats-demo','fixture',{httpOnly:true,sameSite:'lax',path:'/',maxAge:3600});return json({ok:true});},true);
