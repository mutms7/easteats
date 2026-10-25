import { cookies } from 'next/headers';
import { DEMO_USER, demoEnabled, configured } from './config';
import { userClient } from './supabase';
import { HttpError } from './http';
export async function session() {
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
