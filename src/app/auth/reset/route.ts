import { resetLooksSent, resetSentMessage } from '@/lib/account-rules';
import { appOrigin } from '@/server/config';
import { authFailure, requireJsonRequest, resetSchema } from '@/server/email-auth';
import { endpoint, json, readJson } from '@/server/http';
import { userClient } from '@/server/supabase';

// Sends a password reset link. Supabase answers the same way for unknown emails, and so does this
// route, so it can't be used to check who has an account.
export const POST = endpoint(async request => {
  requireJsonRequest(request);
  const input = resetSchema.parse(await readJson(request));
  const client = await userClient();
  // The PKCE verifier saved here marks the link as a recovery, so only this browser can use it.
  const { error } = await client.auth.resetPasswordForEmail(input.email, { redirectTo: `${appOrigin()}/auth/callback` });
  if (!resetLooksSent(error)) authFailure(error!, 'reset');
  return json({ status: 'reset-sent', message: resetSentMessage(input.email, 'browser') });
}, true);
