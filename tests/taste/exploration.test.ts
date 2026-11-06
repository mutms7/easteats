import { expect, it } from 'vitest';
import { applyRestaurantFeedback } from '@/server/restaurant-feedback';
import { demoRestaurants } from '@/server/demo';
import type { DiscoverInput, RankedRestaurant } from '@/lib/contracts';

const input: DiscoverInput = { lat: 43.47, lng: -80.54, radiusKm: 5, mode: 'for-you', query: '', cuisine: '', searchId: '11111111-1111-4111-8111-111111111111' };
const item = (id: string, score: number): RankedRestaurant => ({ restaurant: { ...demoRestaurants[0], id }, score, distanceKm: 1, explanation: 'Fixture', confidence: .9 });
const candidates = [item('a', 85), item('b', 84), item('c', 82), item('d', 61)];
it('varies close matches across seeds, favors stronger matches and never promotes a distant score', () => {
  const wins = { a: 0, b: 0, c: 0 };
  for (let seed = 0; seed < 200; seed++) {
    const result = applyRestaurantFeedback(candidates, [], { ...input, searchId: String(seed) });
    wins[result[0].restaurant.id as keyof typeof wins]++;
    expect(result[3].restaurant.id).toBe('d');
    for (const row of result) expect(row.score).toBe(candidates.find(candidate => candidate.restaurant.id === row.restaurant.id)!.score);
  }
  expect(wins.a).toBeGreaterThan(wins.b); expect(wins.b).toBeGreaterThan(wins.c); expect(wins.c).toBeGreaterThan(15);
});
it('replays a saved or polled search identically including score ties, without compounding feedback', () => {
  const tied = [item('z', 85), item('a', 85), item('b', 85), item('c', 85), item('d', 85), item('e', 85)];
  const feedback = [{ restaurantId: 'a', restaurant: tied[1].restaurant, sentiment: 'like' as const, updatedAt: '2026-11-02T00:00:00Z' }];
  const once = applyRestaurantFeedback(tied, feedback, input);
  expect(applyRestaurantFeedback(once, feedback, input)).toEqual(once);
  expect(applyRestaurantFeedback([...tied].reverse(), feedback, input)).toEqual(once);
});
it('honors opt-out and legacy searches without a seed', () => {
  expect(applyRestaurantFeedback(candidates, [], { ...input, variety: false }).map(row => row.restaurant.id)).toEqual(['a', 'b', 'c', 'd']);
  expect(applyRestaurantFeedback(candidates, [], { ...input, searchId: undefined }).map(row => row.restaurant.id)).toEqual(['a', 'b', 'c', 'd']);
});
it('limits exploration to five candidates, the leader relevance tier and a five point gap', () => {
  const places = Array.from({ length: 8 }, (_, index) => item(String(index), 85 - index / 10));
  for (let seed = 0; seed < 10; seed++) {
    const rows = applyRestaurantFeedback(places, [], { ...input, searchId: String(seed) });
    expect(rows.slice(5).map(row => row.restaurant.id)).toEqual(['5', '6', '7']);
  }
  const listed = item('listed', 60), incidental = item('incidental', 95);
  listed.restaurant = { ...listed.restaurant, name: 'Noodle House', cuisines: ['Chinese'], listingCategories: ['Noodle shop'] };
  incidental.restaurant = { ...incidental.restaurant, name: 'Kitchen', cuisines: ['Chinese'], listingCategories: ['Chinese restaurant'] };
  for (let seed = 0; seed < 10; seed++) expect(applyRestaurantFeedback([incidental, listed], [], { ...input, query: 'noodles', searchId: String(seed) })[0].restaurant.id).toBe('listed');
});
it('keeps dislikes out of random promotion even when adjusted scores remain competitive', () => {
  const places = [item('a', 85), item('disliked', 104), item('b', 83)];
  const feedback = [{ restaurantId: 'disliked', restaurant: places[1].restaurant, sentiment: 'dislike' as const, updatedAt: '2026-11-02T00:00:00Z' }];
  for (let seed = 0; seed < 20; seed++) {
    const rows = applyRestaurantFeedback(places, feedback, { ...input, searchId: String(seed) });
    expect(rows.findIndex(row => row.restaurant.id === 'disliked')).toBe(2);
    expect(rows.find(row => row.restaurant.id === 'a')!.restaurant.features).toBe(places[0].restaurant.features);
  }
});
