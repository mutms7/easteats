import { requireSession } from '@/server/session';
import { endpoint, json } from '@/server/http';

export const PUT = endpoint(async () => {
  const s = await requireSession();
  if (!s.demo) {
    const { error } = await s.client!.auth.updateUser({ data: { east_eats_tutorial_completed: true } });
    if (error) throw error;
  }
  return json({ completed: true });
}, true);
