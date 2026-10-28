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
// Each mobile request gets a fresh public-key client scoped to its verified user.
// Never persist tokens or share this client between requests.
export function bearerClient(accessToken: string) {
  if (!configured()) throw new Error('Account setup is incomplete.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}
export function adminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!configured() || !secret) throw new Error('Background service setup is incomplete.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {auth: {persistSession:false,autoRefreshToken:false}});
}
