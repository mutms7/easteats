import { authFailure, endRecovery, newPasswordSchema, recoveryUser, requireJsonRequest } from '@/server/email-auth';
import { endpoint, HttpError, json, readJson } from '@/server/http';
import { requireSession } from '@/server/session';

// Sets a new password after a reset link. Only works for the account that opened the link in this
// browser within the last 15 minutes, and signs out every other session once it succeeds.
// GET tells the reset page whether that window is still open, so it can offer a new link instead.
export const GET = endpoint(async () => {
  const current = await requireSession();
  return json({ active: !current.demo && (await recoveryUser()) === current.user.id });
});
export const POST = endpoint(async request => {
  requireJsonRequest(request);
  const input = newPasswordSchema.parse(await readJson(request));
  const current = await requireSession();
  if (current.demo || !current.client) throw new HttpError(403, 'Demo accounts don’t have a password.', 'DEMO_ACCOUNT');
  if ((await recoveryUser()) !== current.user.id) throw new HttpError(403, 'This reset link has expired. Request a new one to set your password.', 'RESET_EXPIRED');
  const { error } = await current.client.auth.updateUser({ password: input.password });
  if (error) authFailure(error, 'update');
  await endRecovery();
  // Anyone who knew the old password loses access. This is best effort: the new password is already set.
  const { error: revokeError } = await current.client.auth.signOut({ scope: 'others' });
  if (revokeError) console.error('Password reset: other sessions not revoked');
  return json({ status: 'password-updated' });
}, true);
