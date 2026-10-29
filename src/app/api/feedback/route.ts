import { requireSession } from '@/server/session';
import { endpoint, json, readJson } from '@/server/http';
import { demoFeedbackState, feedbackInputSchema, loadFeedback, saveRestaurantFeedback } from '@/server/restaurant-feedback';

export const GET = endpoint(async () => {
  const session = await requireSession();
  return json({ items: session.demo ? demoFeedbackState.items() : await loadFeedback(session.client!, session.user.id) });
});

export const PUT = endpoint(async request => {
  const session = await requireSession();
  const input = feedbackInputSchema.parse(await readJson(request));
  if (session.demo) { demoFeedbackState.update(input); return json({ items: demoFeedbackState.items() }); }
  await saveRestaurantFeedback(session.client!, input);
  return json({ items: await loadFeedback(session.client!, session.user.id) });
}, true);
