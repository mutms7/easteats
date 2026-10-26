import { describe, expect, it } from 'vitest';
import { locationBounds, mapLocations } from '../../src/components/RestaurantMap';
import type { RankedRestaurant, Restaurant } from '../../src/lib/contracts';

function place(id: string, lat: number, lng: number): RankedRestaurant {
  const restaurant: Restaurant = { id, name: id, address: 'Fixture only', city: 'Test city', lat, lng, cuisines: [], priceLevel: null, googleRating: null, reviewCount: 0, sourceUrl: 'https://example.test/', imageUrl: null, websiteUrl: null, hours: [], isClosed: false, fetchedAt: '2026-10-25T00:00:00.000Z', features: null };
  return { restaurant, score: 50, distanceKm: 1, confidence: 0, explanation: 'Test fixture' };
}
describe('all matching restaurant map locations', () => {
  it('keeps every valid returned place and fits the complete coordinate extent', () => {
    const points = mapLocations([place('north', 43.53, -80.52), place('west', 43.51, -80.56), place('east', 43.49, -80.48)]);
    expect(points.map(point => point.id)).toEqual(['north', 'west', 'east']);
    expect(locationBounds(points)).toEqual([[-80.56, 43.49], [-80.48, 43.53]]);
  });
  it('ignores invalid coordinates and duplicate records without losing zero coordinates', () => {
    const points = mapLocations([place('zero', 0, 0), place('zero', 0, 0), place('bad-lat', 91, 5), place('bad-lng', 3, Number.NaN)]);
    expect(points.map(point => point.id)).toEqual(['zero']);
    expect(locationBounds(points)).toEqual([[0, 0], [0, 0]]);
    expect(locationBounds([])).toBeNull();
  });
});
