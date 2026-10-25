import {requireSession} from '@/server/session';
import {endpoint,HttpError,json} from '@/server/http';
export const GET=endpoint(async(request)=>{
 const s=await requireSession();const id=new URL(request.url).pathname.split('/').pop();
 if(s.demo)throw new HttpError(404,'That refresh couldn’t be found.');
 const {data,error}=await s.client!.rpc('get_refresh_job',{p_id:id});if(error)throw error;if(!data)throw new HttpError(404,'That refresh couldn’t be found.');return json({job:data});
});
