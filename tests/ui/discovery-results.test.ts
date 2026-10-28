import { describe, expect, it } from 'vitest';
import { mergeDiscoveryResults } from '../../src/components/ui-helpers';
import type { DiscoverResponse, RankedRestaurant, Restaurant } from '../../src/lib/contracts';

function item(id: string, explanation = 'Initial fixture'): RankedRestaurant {
  const restaurant: Restaurant = { id, name: id, address: 'Fixture address', city: 'Fixture city', lat: 43.52, lng: -80.52, cuisines: [], priceLevel: null, googleRating: null, reviewCount: 0, sourceUrl: 'https://example.test/', imageUrl: null, websiteUrl: null, hours: [], isClosed: false, fetchedAt: '2026-10-25T00:00:00.000Z', features: null };
  return { restaurant, score: 50, distanceKm: 1, confidence: 0, explanation };
}
const response = (items: RankedRestaurant[]): DiscoverResponse => ({ items, job: null, profileVersion: 1, dataMode: 'demo', refreshing: false });

describe('progressive discovery results', () => {
  it('appends every new place and refreshes metadata without changing existing order', () => {
    const next = mergeDiscoveryResults(response([item('first')]), response([item('new-one'), item('new-two'), item('first', 'Updated evidence')]));
    expect(next.applied.items.map(place => place.restaurant.id)).toEqual(['first', 'new-one', 'new-two']);
    expect(next.applied.items[0].explanation).toBe('Updated evidence');
    expect(next.pending).toBeNull();
  });
  it('offers an existing-place reorder while still adding newly discovered places', () => {
    const incoming = response([item('second'), item('third'), item('first')]);
    const next = mergeDiscoveryResults(response([item('first'), item('second')]), incoming);
    expect(next.applied.items.map(place => place.restaurant.id)).toEqual(['first', 'second', 'third']);
    expect(next.pending).toBe(incoming);
  });
  it('applies the first available results directly for a new or empty intent', () => {
    const incoming = response([item('new-area')]);
    expect(mergeDiscoveryResults(null, incoming)).toEqual({ applied: incoming, pending: null });
    expect(mergeDiscoveryResults(response([]), incoming)).toEqual({ applied: incoming, pending: null });
  });
  it('keeps cached places during partial discovery but prunes missing IDs when the source completes', () => {
    const current = response([item('removed'), item('still-open')]);
    const job = { id: 'fixture-job', kind: 'discovery' as const, createdAt: '2026-10-25T00:00:00.000Z' };
    const partial = { ...response([item('still-open'), item('new')]), job: { ...job, status: 'running' as const } };
    const complete = { ...partial, job: { ...job, status: 'succeeded' as const } };
    expect(mergeDiscoveryResults(current, partial).applied.items.map(place => place.restaurant.id)).toEqual(['removed', 'still-open', 'new']);
    expect(mergeDiscoveryResults(current, complete).applied.items.map(place => place.restaurant.id)).toEqual(['still-open', 'new']);
  });
  it('promotes a late specialist immediately for an explicit search and puts partial cache misses last', () => {
    const current = response([item('broad-review'), item('cached-missing')]);
    const incoming = response([item('noodle-specialist'), item('broad-review', 'Fresh review')]);
    const next = mergeDiscoveryResults(current, incoming, true);
    expect(next.applied.items.map(place => place.restaurant.id)).toEqual(['noodle-specialist', 'broad-review', 'cached-missing']);
    expect(next.applied.items[1].explanation).toBe('Fresh review');
    expect(next.pending).toBeNull();
    const complete = { ...incoming, job: { id: 'fixture', kind: 'discovery' as const, status: 'succeeded' as const, createdAt: '2026-10-28T00:00:00Z' } };
    expect(mergeDiscoveryResults(next.applied, complete, true).applied.items.map(place => place.restaurant.id)).toEqual(['noodle-specialist', 'broad-review']);
  });
});
