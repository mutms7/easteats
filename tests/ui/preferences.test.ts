import { expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, formatDistance, parsePreferences, parseRadius, radiusInKm, radiusInUnits } from '@/lib/preferences';
import { discoverInputSchema } from '@/lib/contracts';
import { rankRestaurants, defaultTasteProfile } from '@/server/taste';
import { demoRestaurants } from '@/server/demo';
import { refreshPlan } from '@/server/refresh-plan';

it('defaults to metric and recovers from missing or corrupt preferences', () => {
  for (const raw of [null, 'oops', 'null', '{}', '{"units":"bad","radiusKm":0,"variety":"false"}']) expect(parsePreferences(raw)).toEqual(DEFAULT_PREFERENCES);
  const saved = { units: 'imperial', radiusKm: .3218688, variety: false };
  expect(parsePreferences(JSON.stringify(saved))).toEqual(saved);
});
it('converts miles precisely, round trips without changing the area, and formats metric by default', () => {
  expect(parseRadius('0.2', 'imperial')).toBeCloseTo(.3218688, 12);
  expect(parseRadius('0.5', 'imperial')).toBeCloseTo(.804672, 12);
  expect(radiusInKm(radiusInUnits(5, 'imperial'), 'imperial')).toBeCloseTo(5, 12);
  expect(formatDistance(.3218688)).toBe('322 m');
  expect(formatDistance(5)).toBe('5 km'); expect(formatDistance(.804672, 'imperial')).toBe('0.5 mi');
});
it('rejects empty, nonnumeric and out of range custom values', () => {
  for (const raw of ['', ' ', '.', '0', '-1', 'Infinity', 'NaN', '1foo', '51', '.09']) expect(parseRadius(raw, 'metric')).toBeNull();
  expect(parseRadius('32', 'imperial')).toBeNull();
  expect(parseRadius('31.06856', 'imperial')).toBe(50);
  expect(discoverInputSchema.safeParse({ lat: 43.47, lng: -80.54, radiusKm: .1 }).success).toBe(true);
  expect(discoverInputSchema.safeParse({ lat: 43.47, lng: -80.54, radiusKm: .09 }).success).toBe(false);
});
it('keeps a small search centred accurately and filters a wider provider result to the actual circle', () => {
  const input = discoverInputSchema.parse({ lat: 43.471234, lng: -80.543456, radiusKm: parseRadius('.2', 'imperial') });
  expect(refreshPlan([], input).input).toMatchObject({ lat: input.lat, lng: input.lng, radiusKm: .5 });
  const places = [{ ...demoRestaurants[0], id: 'inside', lat: input.lat + .002, lng: input.lng }, { ...demoRestaurants[0], id: 'outside', lat: input.lat + .004, lng: input.lng }];
  expect(rankRestaurants(places, defaultTasteProfile(), input, input.radiusKm).map(row => row.restaurant.id)).toEqual(['inside']);
});

it('starts new searches at 1km while retaining an explicitly saved radius', () => {
 expect(DEFAULT_PREFERENCES.radiusKm).toBe(1);
 expect(discoverInputSchema.parse({lat:43.47,lng:-80.54}).radiusKm).toBe(1);
 expect(parsePreferences('{"radiusKm":5}').radiusKm).toBe(5);
});
