import { headers } from 'next/headers';
import { z } from 'zod';
import { requireSession } from '@/server/session';
import { adminClient } from '@/server/supabase';
import { endpoint, HttpError, json, readJson } from '@/server/http';

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
