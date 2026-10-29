import { requireSession } from '@/server/session';
import { endpoint, json, readJson } from '@/server/http';
import { chooseMeal, demoFeedbackState, loadPendingMeal, mealInputSchema } from '@/server/restaurant-feedback';

export const GET = endpoint(async () => {
  const session = await requireSession();
  return json({ pendingMeal: session.demo ? demoFeedbackState.meal() : await loadPendingMeal(session.client!, session.user.id) });
});

export const PUT = endpoint(async request => {
  const session = await requireSession();
  const input = mealInputSchema.parse(await readJson(request));
  if (session.demo) { demoFeedbackState.choose(input); return json({ pendingMeal: demoFeedbackState.meal() }); }
  await chooseMeal(session.client!, input);
  return json({ pendingMeal: await loadPendingMeal(session.client!, session.user.id) });
}, true);
