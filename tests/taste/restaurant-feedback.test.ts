import { describe, expect, it } from 'vitest';
import type { DiscoverInput, FeedbackItem, RankedRestaurant, Restaurant, RestaurantFeatures } from '../../src/lib/contracts';
import { applyRestaurantFeedback, demoFeedbackState, feedbackInputSchema, mealInputSchema } from '../../src/server/restaurant-feedback';
import { demoRestaurants } from '../../src/server/demo';

const sourceUrl = 'https://www.google.com/maps/?q=fixture';
const feature = (dish = 'handmade noodles'): RestaurantFeatures => ({ foodQuality: .8, value: .7, service: .7, atmosphere: .7, cuisines: ['Chinese'], dishes: [dish], flavors: ['chili'], spice: .7, fusion: false, reviewCount: 24, confidence: .8, evidence: [{ id: 'review', aspect: 'food', text: `${dish} with chili are made here.`, sourceUrl }], updatedAt: '2026-10-28T00:00:00Z' });
const restaurant = (id: string, features: RestaurantFeatures | null = null): Restaurant => ({ id, name: id, address: 'Fixture address', city: 'Waterloo', lat: 43.47, lng: -80.54, cuisines: ['Chinese'], priceLevel: 2, googleRating: 4, reviewCount: 100, sourceUrl, imageUrl: null, websiteUrl: null, hours: [], isClosed: false, fetchedAt: '2026-10-28T00:00:00Z', features });
const ranked = (id: string, score = 60, features: RestaurantFeatures | null = null): RankedRestaurant => ({ restaurant: restaurant(id, features), score, confidence: features?.confidence ?? 0, distanceKm: 1, explanation: 'Fixture', scoreBreakdown: { food: null, value: null, service: null, atmosphere: null, taste: null } });
const vote = (restaurant: Restaurant, sentiment: FeedbackItem['sentiment'], reason: FeedbackItem['reason'] = 'food'): FeedbackItem => ({ restaurantId: restaurant.id, restaurant, sentiment, reason, note: null, updatedAt: '2026-10-28T00:00:00Z' });

describe('restaurant feedback ranking', () => {
  it('moves exact dislikes down and applies a modest exact-like bonus', () => {
    const a = ranked('a', 70), b = ranked('b', 65), c = ranked('c', 64);
    const results = applyRestaurantFeedback([a, b, c], [vote(a.restaurant, 'dislike'), vote(c.restaurant, 'like')]);
    expect(results.map(item => item.restaurant.id)).toEqual(['c', 'b', 'a']);
    expect(results.find(item => item.restaurant.id === 'a')?.score).toBe(50);
    expect(results.find(item => item.restaurant.id === 'c')?.score).toBe(68);
  });
  it('reapplying or repeating the same opinion cannot compound scores', () => {
    const items = [ranked('a'), ranked('b')], feedback = [vote(items[0].restaurant, 'like')];
    const once = applyRestaurantFeedback(items, feedback);
    expect(applyRestaurantFeedback(once, [...feedback, ...feedback])).toEqual(once);
    expect(applyRestaurantFeedback(once, []).find(item => item.restaurant.id === 'a')?.score).toBe(60);
    expect(applyRestaurantFeedback(once, []).find(item => item.restaurant.id === 'a')?.feedbackAdjustment).toBe(0);
  });
  it('neutral is not a positive or negative preference', () => {
    const item = ranked('a', 61.234);
    const result = applyRestaurantFeedback([item], [vote(item.restaurant, 'neutral')])[0];
    expect(result.score).toBe(item.score); expect(result.feedbackAdjustment).toBe(0);
  });
  it('keeps search relevance ahead of personal restaurant opinions', () => {
    const direct = ranked('Sushi House', 60), incidental = ranked('Noodle Kitchen', 95, feature('sushi'));
    direct.restaurant.cuisines = ['Sushi restaurant']; direct.restaurant.listingCategories = ['Sushi restaurant'];
    incidental.restaurant.cuisines = ['Chinese restaurant']; incidental.restaurant.listingCategories = ['Chinese restaurant'];
    const input: DiscoverInput = { lat: 43.47, lng: -80.54, radiusKm: 5, mode: 'for-you', query: 'sushi', cuisine: '' };
    const results = applyRestaurantFeedback([incidental, direct], [vote(direct.restaurant, 'dislike'), vote(incidental.restaurant, 'like')], input);
    expect(results[0].restaurant.id).toBe('Sushi House');
  });
  it('uses smaller evidence-dependent dish and flavor affinity, never a cuisine blacklist', () => {
    const rated = restaurant('rated', feature()), related = ranked('related', 60, feature()), sameCuisineOnly = ranked('same-cuisine-only', 60);
    const disliked = applyRestaurantFeedback([related, sameCuisineOnly], [vote(rated, 'dislike')]);
    expect(disliked.find(item => item.restaurant.id === 'related')!.feedbackAdjustment).toBeLessThan(0);
    expect(disliked.find(item => item.restaurant.id === 'related')!.feedbackAdjustment).toBeGreaterThan(-3);
    expect(disliked.find(item => item.restaurant.id === 'same-cuisine-only')!.feedbackAdjustment).toBe(0);
    expect(applyRestaurantFeedback([related], [vote(rated, 'like')])[0].feedbackAdjustment).toBeGreaterThan(0);
  });
  it('does not infer a disliked dish from a service complaint or an unsupported tag', () => {
    const related = ranked('related', 60, feature()), rated = restaurant('rated', feature());
    expect(applyRestaurantFeedback([related], [vote(rated, 'dislike', 'service')])[0].feedbackAdjustment).toBe(0);
    rated.features!.evidence = [];
    expect(applyRestaurantFeedback([related], [vote(rated, 'dislike')])[0].feedbackAdjustment).toBe(0);
  });
  it('keeps every change bounded and never fabricates review score bars', () => {
    const item = ranked('related', 98, feature());
    const feedback = Array.from({ length: 100 }, (_, index) => vote(restaurant(`liked-${index}`, feature()), 'like'));
    const result = applyRestaurantFeedback([item], feedback)[0];
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.feedbackAdjustment).toBeLessThanOrEqual(3);
    expect(result.scoreBreakdown).toBe(item.scoreBreakdown);
    expect(result.restaurant.features).toBe(item.restaurant.features);
    const unknown = ranked('unknown');
    expect(applyRestaurantFeedback([unknown], [vote(unknown.restaurant, 'like')])[0].scoreBreakdown).toEqual(unknown.scoreBreakdown);
  });
});

describe('meal check-in semantics', () => {
  it('marks only the currently chosen restaurant as answered', () => {
    demoFeedbackState.reset();
    const [first, second] = demoRestaurants;
    demoFeedbackState.choose({ restaurantId: first.id });
    const chosenAt = demoFeedbackState.meal()?.chosenAt;
    demoFeedbackState.choose({ restaurantId: first.id });
    expect(demoFeedbackState.meal()?.chosenAt).toBe(chosenAt);
    demoFeedbackState.update({ restaurantId: second.id, sentiment: 'like', answerMeal: true });
    expect(demoFeedbackState.meal()?.restaurantId).toBe(first.id);
    demoFeedbackState.update({ restaurantId: first.id, sentiment: 'neutral', answerMeal: true });
    expect(demoFeedbackState.meal()).toBeNull();
    expect(demoFeedbackState.items().find(item => item.restaurantId === first.id)?.sentiment).toBe('neutral');
    demoFeedbackState.reset();
  });
  it('keeps a repeated vote idempotent and clears it with null', () => {
    demoFeedbackState.reset();
    const input = { restaurantId: demoRestaurants[0].id, sentiment: 'like' as const, reason: 'food' as const };
    demoFeedbackState.update(input); const first = demoFeedbackState.items()[0];
    demoFeedbackState.update(input); expect(demoFeedbackState.items()).toEqual([first]);
    demoFeedbackState.update({ restaurantId: input.restaurantId, sentiment: null });
    expect(demoFeedbackState.items()).toEqual([]); demoFeedbackState.reset();
  });
  it('rejects malformed, account-targeting, and answer-without-opinion input', () => {
    expect(feedbackInputSchema.safeParse({ restaurantId: 'a', sentiment: null, answerMeal: true }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ restaurantId: 'a', sentiment: 'like', user_id: 'other' }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ restaurantId: 'a', sentiment: 'like', note: 'x'.repeat(501) }).success).toBe(false);
    expect(mealInputSchema.safeParse({ restaurantId: 'a', searchId: 'not-a-uuid' }).success).toBe(false);
    expect(mealInputSchema.safeParse({ restaurantId: 'a', user_id: 'other' }).success).toBe(false);
  });
});
