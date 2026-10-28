import { z } from 'zod';
import { savedLocationSchema } from '@/lib/contracts';
import { requireSession } from '@/server/session';
import { endpoint, json, readJson } from '@/server/http';
import { readHomeAddress } from '@/server/location-preferences';
import { demoState } from '@/server/demo';

// Demo state is local-only and is never written to a real account.

export const GET = endpoint(async () => {
  const current = await requireSession();
  return json({ homeAddress: current.demo ? demoState.homeAddress ?? null : await readHomeAddress(current.client!, current.user.id) });
});
export const PUT = endpoint(async request => {
  const current = await requireSession();
  const { homeAddress } = z.object({ homeAddress: savedLocationSchema.nullable() }).strict().parse(await readJson(request));
  if (current.demo) { demoState.homeAddress = homeAddress; return json({ homeAddress }); }
  const result = homeAddress
    ? await current.client!.from('location_preferences').upsert({ user_id: current.user.id, home_address: homeAddress }, { onConflict: 'user_id' })
    : await current.client!.from('location_preferences').delete().eq('user_id', current.user.id);
  if (result.error) throw result.error;
  return json({ homeAddress });
}, true);
