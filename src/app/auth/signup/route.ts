import { confirmSentMessage } from '@/lib/account-rules';
import { appOrigin } from '@/server/config';
import { authFailure, rememberReturn, requireJsonRequest, safeDestination, signUpSchema } from '@/server/email-auth';
import { endpoint, json, readJson } from '@/server/http';
import { userClient } from '@/server/supabase';

export const POST = endpoint(async request => {
  requireJsonRequest(request);
  const input = signUpSchema.parse(await readJson(request));
  const next = safeDestination(input.next);
  const client = await userClient();
  const { data, error } = await client.auth.signUp({ email: input.email, password: input.password, options: { data: { full_name: input.name }, emailRedirectTo: `${appOrigin()}/auth/callback` } });
  if (error) authFailure(error, 'signup');
  // Projects without email confirmation return a session right away and the cookies are already set.
  if (data.session) return json({ status: 'signed-in', destination: next });
  await rememberReturn(next);
  // With "Confirm email" on (required for East Eats), Supabase returns the same shape for a new
  // email and an already-registered one, so this message doesn't reveal who has an account.
  return json({ status: 'confirm-email', message: confirmSentMessage(input.email, 'browser') });
}, true);
