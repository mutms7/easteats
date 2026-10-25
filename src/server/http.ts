import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { appOrigin } from './config';
export class HttpError extends Error { constructor(public status:number, message:string, public code='REQUEST_FAILED') { super(message); } }
export function checkOrigin(request:Request) {
  const origin=request.headers.get('origin');
  if (origin && origin !== appOrigin()) throw new HttpError(403,'This request came from another website.','ORIGIN_REJECTED');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403,'This request came from another website.');
}
export function json(body:unknown,status=200) { return NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}}); }
export function endpoint(fn:(request:Request,context?:unknown)=>Promise<Response>,mutation=false) {
  return async (request:Request,context?:unknown) => {
    try { if(mutation) checkOrigin(request); return await fn(request,context); }
    catch(error) {
      if(error instanceof ZodError) return json({error:error.issues[0]?.message||'Check your answers.',code:'VALIDATION'},400);
      if(error instanceof HttpError) return json({error:error.message,code:error.code},error.status);
      console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
      return json({error:'We couldn’t complete that request. Your answers are still here. Try again.',code:'UNAVAILABLE'},503);
    }
  };
}
export async function readJson(request:Request) {
  const body=await request.text();
  if(body.length>20000) throw new HttpError(413,'That request is too large.');
  try { return JSON.parse(body); } catch { throw new HttpError(400,'Please send a valid request.'); }
}
