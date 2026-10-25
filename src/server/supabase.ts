import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { configured } from './config';
export async function userClient() {
  if (!configured()) throw new Error('Account setup is incomplete.');
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: (values) => { for (const {name,value,options} of values) store.set(name,value,options); } }
  });
}
export function adminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!configured() || !secret) throw new Error('Background service setup is incomplete.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {auth: {persistSession:false,autoRefreshToken:false}});
}
