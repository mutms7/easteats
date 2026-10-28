import { cookies, headers } from 'next/headers';
import { DEMO_USER, demoEnabled, configured } from './config';
import { bearerClient, userClient } from './supabase';
import { HttpError } from './http';
export async function session() {
  const authorization=(await headers()).get('authorization');
  // An explicit credential always takes priority over cookies, including demo.
  if (authorization !== null) {
    const match=/^Bearer[ \t]+([A-Za-z0-9._~+\/-]+=*)$/i.exec(authorization);
    if (!match || match[1].length > 16384) throw new HttpError(401,'Your sign-in expired. Sign in again.','SIGN_IN_REQUIRED');
    if (!configured()) throw new HttpError(503,'Account setup is incomplete.','UNAVAILABLE');
    const client=bearerClient(match[1]);
    const {data,error}=await client.auth.getUser(match[1]);
    if (error || !data.user) throw new HttpError(401,'Your sign-in expired. Sign in again.','SIGN_IN_REQUIRED');
    return {user:data.user,demo:false,client};
  }
  if (demoEnabled() && (await cookies()).get('east-eats-demo')?.value === 'fixture') return {user:{id:DEMO_USER,email:'demo@example.invalid'},demo:true,client:null};
  if (!configured()) return {user:null,demo:false,client:null};
  const client=await userClient();
  const {data,error}=await client.auth.getUser();
  return {user: error ? null : data.user,demo:false,client};
}
export async function requireSession() {
  const value=await session();
  if(!value.user) throw new HttpError(401,'Sign in to continue.','SIGN_IN_REQUIRED');
  return {...value,user:value.user};
}
