import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { feedbackReasonSchema, feedbackSentimentSchema, restaurantSchema, type DiscoverInput, type FeedbackItem, type MealCheckin, type RankedRestaurant, type Restaurant } from '@/lib/contracts';
import { restaurantSearchRelevance } from '@/lib/food-taxonomy';
import { hasReviewConfidence, reviewEvidence } from '@/lib/restaurant-insights';
import { HttpError } from './http';
import { demoRestaurants } from './demo';

export const feedbackInputSchema = z.object({
  restaurantId: z.string().trim().min(1).max(300),
  sentiment: feedbackSentimentSchema.nullable(),
  reason: feedbackReasonSchema.optional(),
  note: z.string().trim().max(500).optional(),
  answerMeal: z.boolean().optional(),
}).strict().refine(input => !input.answerMeal || input.sentiment !== null, { message: 'Choose like, neutral, or dislike to answer a meal check-in.' });
export const mealInputSchema = z.object({ restaurantId: z.string().trim().min(1).max(300), searchId: z.string().uuid().optional() }).strict();

const feedbackRowsSchema = z.array(z.object({ place_id: z.string(), sentiment: feedbackSentimentSchema, reason: feedbackReasonSchema.nullable(), note: z.string().nullable(), updated_at: z.string() }));

async function restaurantRecords(client: SupabaseClient, ids: string[]): Promise<Map<string, Restaurant>> {
  const records = new Map<string, Restaurant>();
  // Keep ID lists short enough for PostgREST query URLs, including long place IDs.
  for (let offset = 0; offset < ids.length; offset += 20) {
    const batch = ids.slice(offset, offset + 20);
    const [{ data: places, error }, { data: features, error: featureError }] = await Promise.all([
      client.from('restaurants').select('id,record').in('id', batch),
      client.from('restaurant_features').select('place_id,features').in('place_id', batch),
    ]);
    if (error) throw error;
    if (featureError) throw featureError;
    const byPlace = new Map((features ?? []).map(row => [row.place_id as string, row.features]));
    for (const row of places ?? []) {
      const restaurant = restaurantSchema.parse({ ...row.record, features: byPlace.get(row.id) ?? row.record.features ?? null });
      records.set(restaurant.id, restaurant);
    }
  }
  return records;
}

export async function loadFeedback(client: SupabaseClient, userId: string): Promise<FeedbackItem[]> {
  const rows: z.infer<typeof feedbackRowsSchema> = [];
  // PostgREST defaults to a row cap. Page explicitly so older dislikes aren't lost.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('restaurant_feedback').select('place_id,sentiment,reason,note,updated_at').eq('user_id', userId).order('place_id').range(offset, offset + 499);
    if (error) throw error;
    const page = feedbackRowsSchema.parse(data ?? []);
    rows.push(...page);
    if (page.length < 500) break;
  }
  const places = await restaurantRecords(client, rows.map(row => row.place_id));
  return rows.flatMap(row => {
    const restaurant = places.get(row.place_id);
    // A restaurant deleted between reads must not become a fabricated liked place.
    return restaurant ? [{ restaurantId: row.place_id, sentiment: row.sentiment, reason: row.reason, note: row.note, updatedAt: row.updated_at, restaurant }] : [];
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.restaurantId.localeCompare(b.restaurantId));
}

export async function loadPendingMeal(client: SupabaseClient, userId: string): Promise<MealCheckin | null> {
  const { data, error } = await client.from('meal_checkins').select('place_id,search_id,chosen_at').eq('user_id', userId).is('answered_at', null).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const restaurant = (await restaurantRecords(client, [data.place_id])).get(data.place_id);
  return restaurant ? { restaurantId: data.place_id, restaurant, searchId: data.search_id ?? null, chosenAt: data.chosen_at } : null;
}

async function requireRestaurant(client: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await client.from('restaurants').select('id').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'That restaurant is no longer available.', 'RESTAURANT_NOT_FOUND');
}

function rpcError(error: { code?: string } | null) {
  if (!error) return;
  if (['P0002', '42501', '23503'].includes(error.code ?? '')) throw new HttpError(404, 'That restaurant or saved search is not available.', 'NOT_FOUND');
  throw error;
}

export async function saveRestaurantFeedback(client: SupabaseClient, input: z.infer<typeof feedbackInputSchema>): Promise<void> {
  await requireRestaurant(client, input.restaurantId);
  const { error } = await client.rpc('set_restaurant_feedback', { p_place_id: input.restaurantId, p_sentiment: input.sentiment, p_reason: input.reason ?? null, p_note: input.note || null, p_answer_meal: input.answerMeal ?? false });
  rpcError(error);
}

export async function chooseMeal(client: SupabaseClient, input: z.infer<typeof mealInputSchema>): Promise<void> {
  await requireRestaurant(client, input.restaurantId);
  const { error } = await client.rpc('choose_meal', { p_place_id: input.restaurantId, p_search_id: input.searchId ?? null });
  rpcError(error);
}

const canonical = (value: string) => value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const phraseMatch = (a: string, b: string) => Boolean(a && b && (a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `)));
function supportedTraits(restaurant: Restaurant) {
  if (!restaurant.features || !hasReviewConfidence(restaurant)) return { dishes: [], flavors: [], confidence: 0 };
  const quotes = reviewEvidence(restaurant, 'food').map(item => canonical(item.text));
  const supported = (values: string[]) => [...new Set(values.map(canonical).filter(value => quotes.some(quote => phraseMatch(value, quote))))];
  return { dishes: supported(restaurant.features.dishes), flavors: supported(restaurant.features.flavors), confidence: Math.max(0, Math.min(1, restaurant.features.confidence)) };
}
function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  return a.filter(value => b.some(other => phraseMatch(value, other))).length / a.length;
}
function currentFeedback(feedback: FeedbackItem[]): Map<string, FeedbackItem> {
  const rows = new Map<string, FeedbackItem>();
  for (const item of feedback) {
    const existing = rows.get(item.restaurantId);
    if (!existing || item.updatedAt > existing.updatedAt) rows.set(item.restaurantId, item);
  }
  return rows;
}

/** Recompute from the stored base, so reopening or clearing a vote never compounds it. */
export function applyRestaurantFeedback(items: RankedRestaurant[], feedback: FeedbackItem[], input?: DiscoverInput): RankedRestaurant[] {
  const votes = currentFeedback(feedback);
  const related = [...votes.values()].filter(vote => vote.sentiment !== 'neutral' && (!vote.reason || vote.reason === 'food' || vote.reason === 'overall')).map(vote => ({ vote, traits: supportedTraits(vote.restaurant) }));
  return items.map((item, index) => {
    const vote = votes.get(item.restaurant.id);
    const exact = vote?.sentiment === 'like' ? 4 : vote?.sentiment === 'dislike' ? -20 : 0;
    const traits = supportedTraits(item.restaurant);
    let affinity = 0, evidence = 0;
    for (const source of related) {
      if (source.vote.restaurantId === item.restaurant.id) continue;
      const shared = .7 * overlap(traits.dishes, source.traits.dishes) + .3 * overlap(traits.flavors, source.traits.flavors);
      const support = shared * Math.min(traits.confidence, source.traits.confidence);
      affinity += (source.vote.sentiment === 'like' ? 1 : -1) * support;
      evidence += support;
    }
    const adjustment = exact + 3 * affinity / (2 + evidence);
    const base = Number.isFinite(item.baseScore) ? item.baseScore! : item.score;
    const baseScore = Math.max(0, Math.min(100, Number.isFinite(base) ? base : 50));
    const score = adjustment === 0 ? baseScore : Math.round(Math.max(0, Math.min(100, baseScore + adjustment)) * 100) / 100;
    return { item: { ...item, baseScore, feedbackAdjustment: Math.round((score - baseScore) * 100) / 100, score }, tier: input ? restaurantSearchRelevance(item.restaurant, input) : 0, index };
  }).sort((a, b) => b.tier - a.tier || b.item.score - a.item.score || a.index - b.index).map(row => row.item);
}

// Explicit, process-local fictional demo state. Never passed to a live DB client.
const demoFeedback = new Map<string, FeedbackItem>();
let demoMeal: MealCheckin | null = null;
export const demoFeedbackState = {
  items: () => [...demoFeedback.values()],
  meal: () => demoMeal,
  update(input: z.infer<typeof feedbackInputSchema>) {
    const restaurant = demoRestaurants.find(item => item.id === input.restaurantId);
    if (!restaurant) throw new HttpError(404, 'That demo restaurant is not available.');
    if (input.sentiment === null) demoFeedback.delete(input.restaurantId);
    else {
      const old = demoFeedback.get(input.restaurantId);
      const reason = input.reason ?? null, note = input.note || null;
      if (!old || old.sentiment !== input.sentiment || old.reason !== reason || old.note !== note) demoFeedback.set(input.restaurantId, { restaurantId: input.restaurantId, restaurant, sentiment: input.sentiment, reason, note, updatedAt: new Date().toISOString() });
    }
    if (input.answerMeal && demoMeal?.restaurantId === input.restaurantId) demoMeal = null;
  },
  choose(input: z.infer<typeof mealInputSchema>) {
    const restaurant = demoRestaurants.find(item => item.id === input.restaurantId);
    if (!restaurant) throw new HttpError(404, 'That demo restaurant is not available.');
    if (demoMeal?.restaurantId !== input.restaurantId || demoMeal.searchId !== (input.searchId ?? null)) demoMeal = { restaurantId: input.restaurantId, restaurant, searchId: input.searchId ?? null, chosenAt: new Date().toISOString() };
  },
  reset() { demoFeedback.clear(); demoMeal = null; },
};
