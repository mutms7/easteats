import { headers } from 'next/headers';
import { z } from 'zod';
import { requireSession } from '@/server/session';
import { adminClient } from '@/server/supabase';
import { endpoint, HttpError, json, readJson } from '@/server/http';
import { accountDetails } from '@/server/account';
import { appOrigin } from '@/server/config';

export const PUT = endpoint(async request => {
  const current = await requireSession();
  if (current.demo || !current.client) throw new HttpError(403, 'Account details are read-only in the demo.', 'DEMO_ACCOUNT');
  const input = z.object({ name: z.string().trim().min(1, 'Enter your name.').max(100), email: z.email().max(254) }).strict().parse(await readJson(request));
  const emailChanged = input.email !== current.user.email;
  const { data, error } = await current.client.auth.updateUser({ data: { full_name: input.name }, ...(emailChanged ? { email: input.email } : {}) }, { emailRedirectTo: `${appOrigin()}/auth/callback` });
  if (error || !data.user) throw new HttpError(503, 'Account details could not be saved. Check your email address and try again.');
  const user = accountDetails(data.user);
  return json({ user, message: user.pendingEmail ? `Name saved. Check the confirmation emails to finish changing your email to ${user.pendingEmail}.` : 'Account details saved.' });
}, true);

export const DELETE = endpoint(async request => {
  const current = await requireSession();
  if (current.demo || !current.client) throw new HttpError(403, 'Demo accounts cannot be deleted.', 'DEMO_ACCOUNT');
  z.object({ confirmation: z.literal('DELETE') }).parse(await readJson(request));
  const admin = adminClient();
  const authorization = (await headers()).get('authorization');
  // Revoke refresh sessions before deletion. The verified current account is
  // the only deletion target, regardless of any extra fields in the request.
  const revoked = authorization
    ? await admin.auth.admin.signOut(authorization.replace(/^Bearer[ \t]+/i, ''), 'global')
    : await current.client.auth.signOut({ scope: 'global' });
  if (revoked.error) throw new HttpError(503, 'We could not end your sessions. Your account has not been deleted. Please sign in and try again.');
  const result = await admin.auth.admin.deleteUser(current.user.id);
  if (result.error) throw new HttpError(503, 'Your account could not be deleted. Please sign in and try again.');
  return json({ deleted: true });
}, true);
