import { describe, expect, it, vi } from 'vitest';
import { tasteInputSchema, type Restaurant, type RestaurantFeatures, type TasteInput } from '../../src/lib/contracts';
import { TASTE_GOAL_IDS, TASTE_GOAL_OPTIONS, parseTasteGoal } from '../../src/lib/taste-goals';
import { applyTasteGoal, compileTasteProfile, defaultTasteProfile, normalizeWeights, rankRestaurants, DEFAULT_WEIGHTS } from '../../src/server/taste';

const input: TasteInput = { favorites: [{ restaurantId: 'favorite-noodles', name: 'Favorite noodles', city: 'Berkeley', reasons: ['Great food'], notes: 'I like handmade noodles.' }] };
const modelResult = () => {
  const { version: _version, updatedAt: _updatedAt, ...result } = defaultTasteProfile();
  return { ...result, dishes: ['handmade noodles'], interpretation: 'You enjoy handmade noodles.' };
};
const providerResponse = (value = modelResult()) => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(value) }], usage: { input_tokens: 100, output_tokens: 80 } }));
const origin = { lat: 37.87, lng: -122.27 };
const place = (id: string, foodQuality: number, service: number, atmosphere: number): Restaurant => {
  const features: RestaurantFeatures = { foodQuality, service, atmosphere, value: .5, cuisines: [], dishes: [], flavors: [], spice: null, fusion: false, confidence: .8, reviewCount: 40, evidence: [], updatedAt: '2026-10-28T12:00:00Z' };
  return { id, name: id, address: 'Fixture address', city: 'Berkeley', ...origin, cuisines: [], priceLevel: 2, googleRating: 4, reviewCount: 40, sourceUrl: `https://www.google.com/maps/?q=${id}`, imageUrl: null, websiteUrl: null, hours: [], isClosed: false, fetchedAt: '2026-10-28T12:00:00Z', features };
};

describe('questionnaire priorities', () => {
  it('keeps old requests valid and rejects unsupported goal values', () => {
    expect(tasteInputSchema.parse(input).goal).toBeUndefined();
    for (const goal of TASTE_GOAL_IDS) expect(tasteInputSchema.parse({ ...input, goal }).goal).toBe(goal);
    expect(tasteInputSchema.safeParse({ ...input, goal: 'low-ratings' }).success).toBe(false);
  });
  it('offers the five agreed labels and safely parses legacy draft values', () => {
    expect(TASTE_GOAL_OPTIONS.map(option => option.label)).toEqual(['Hidden gems', 'Date night', 'Great service', 'Great value', 'A bit of everything']);
    for (const goal of TASTE_GOAL_IDS) expect(parseTasteGoal(goal)).toBe(goal);
    for (const value of [undefined, null, '', 'low-ratings', 'balanced ', {}, []]) expect(parseTasteGoal(value)).toBeUndefined();
  });
  it('preserves exact old normalization when no goal was submitted', () => {
    const weights = { ...DEFAULT_WEIGHTS, food: .7 };
    expect(applyTasteGoal(weights)).toEqual(normalizeWeights(weights));
    for (const goal of TASTE_GOAL_IDS) {
      const blended = applyTasteGoal(weights, goal);
      expect(Object.values(blended).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
      expect(Object.values(blended).every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    }
  });
  it('changes the actual restaurant order for food, date-night, and service priorities', async () => {
    const restaurants = [place('food-first', .95, .2, .2), place('date-night', .75, .75, .95), place('great-service', .8, .95, .35)];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => providerResponse());
    const profiles = await Promise.all(['hidden-gems', 'date-night', 'service'].map(goal => compileTasteProfile({ ...input, goal: parseTasteGoal(goal) }, { apiKey: 'test-only', fetch: fetcher })));
    expect(profiles.map(profile => rankRestaurants(restaurants, profile, origin)[0].restaurant.id)).toEqual(['food-first', 'date-night', 'great-service']);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const profile of profiles) expect(profile.dishes).toEqual(['handmade noodles']);
    restaurants[0].googleRating = 1;
    const first = rankRestaurants(restaurants, profiles[0], origin).map(item => item.restaurant.id);
    restaurants[0].googleRating = 5;
    expect(rankRestaurants(restaurants, profiles[0], origin).map(item => item.restaurant.id)).toEqual(first);
  });
  it('passes the selected priority as data and explains its meaning in the system prompt', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => providerResponse());
    const result = await compileTasteProfile({ ...input, goal: 'date-night' }, { apiKey: 'test-only', fetch: fetcher, version: 3 });
    const request = JSON.parse(fetcher.mock.calls[0][1]?.body as string);
    expect(JSON.parse(request.messages[0].content).untrusted_data.goal).toBe('date-night');
    expect(request.system).toContain('date-night emphasizes food plus atmosphere and service');
    expect(request.system).toContain('50/50');
    expect(request.system).toContain('not a claim that a venue is small, niche, undiscovered, or poorly rated');
    expect(result.interpretation).toContain('For date night');
    expect(result.version).toBe(3);
    expect(request.tools).toBeUndefined();
  });
  it('prioritizes review-backed value without treating cheap prices as proof', async () => {
    const foodFirst = place('food-first', .95, .5, .5);
    foodFirst.features!.value = .45; foodFirst.priceLevel = 1;
    const goodValue = place('review-backed-value', .72, .5, .5);
    goodValue.features!.value = .95; goodValue.priceLevel = 3;
    const cheapOnly = place('cheap-price-only', .72, .5, .5);
    cheapOnly.features!.value = null; cheapOnly.priceLevel = 1;
    const restaurants = [foodFirst, goodValue, cheapOnly];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => providerResponse());
    const foodProfile = await compileTasteProfile({ ...input, goal: 'hidden-gems' }, { apiKey: 'test-only', fetch: fetcher });
    const valueProfile = await compileTasteProfile({ ...input, goal: 'value' }, { apiKey: 'test-only', fetch: fetcher });
    expect(rankRestaurants(restaurants, foodProfile, origin)[0].restaurant.id).toBe('food-first');
    expect(rankRestaurants(restaurants, valueProfile, origin)[0].restaurant.id).toBe('review-backed-value');
    const scores = rankRestaurants(restaurants, valueProfile, origin).map(item => [item.restaurant.id, item.score]);
    goodValue.priceLevel = 1; cheapOnly.priceLevel = 4;
    expect(rankRestaurants(restaurants, valueProfile, origin).map(item => [item.restaurant.id, item.score])).toEqual(scores);
    expect(valueProfile.interpretation).toContain('Review-backed value');
    const request = JSON.parse(fetcher.mock.calls[1][1]?.body as string);
    expect(JSON.parse(request.messages[0].content).untrusted_data.goal).toBe('value');
    expect(request.system).toContain('A low price alone is not evidence of good value');
  });
  it('preserves the old interpretation and weights for callers without a goal', async () => {
    const model = modelResult();
    const result = await compileTasteProfile(input, { apiKey: 'test-only', fetch: vi.fn().mockImplementation(async () => providerResponse(model)) });
    expect(result.weights).toEqual(normalizeWeights(model.weights));
    expect(result.interpretation).toBe(model.interpretation);
  });
  it('bounds the combined explanation without discarding the goal', async () => {
    const model = { ...modelResult(), interpretation: 'A'.repeat(1200) };
    const result = await compileTasteProfile({ ...input, goal: 'service' }, { apiKey: 'test-only', fetch: vi.fn().mockImplementation(async () => providerResponse(model)) });
    expect(result.interpretation).toHaveLength(1200);
    expect(result.interpretation).toMatch(/^Attentive service gets more weight/);
  });
  it('rejects an invalid goal before making a paid call', async () => {
    const fetcher = vi.fn();
    await expect(compileTasteProfile({ ...input, goal: 'low-ratings' as never }, { apiKey: 'test-only', fetch: fetcher })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
