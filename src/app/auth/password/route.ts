import { authFailure, requireJsonRequest, safeDestination, signInSchema } from '@/server/email-auth';
import { endpoint, json, readJson } from '@/server/http';
import { userClient } from '@/server/supabase';

// Signs in an account created with email and password. Supabase rotates the session on every sign-in.
export const POST = endpoint(async request => {
  requireJsonRequest(request);
  const input = signInSchema.parse(await readJson(request));
  const client = await userClient();
  const { data, error } = await client.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error) authFailure(error, 'signin');
  if (!data.session) throw new Error('Sign-in returned no session');
  return json({ status: 'signed-in', destination: safeDestination(input.next) });
}, true);
