import { describe, expect, it } from 'vitest';
import type { Restaurant, RestaurantFeatures } from '../../src/lib/contracts';
import { restaurantReviewSignals } from '../../src/lib/restaurant-insights';
import { defaultTasteProfile, rankRestaurants } from '../../src/server/taste';

const origin = { lat: 43.47, lng: -80.54 };
const sourceUrl = 'https://www.google.com/maps/?cid=fixture';
function restaurant(overrides: Partial<RestaurantFeatures> = {}): Restaurant {
  return { id: 'fixture', name: 'Fixture Noodles', address: 'Fixture address', city: 'Waterloo', ...origin, cuisines: [], priceLevel: 2, googleRating: 4.9, reviewCount: 200, sourceUrl, imageUrl: null, websiteUrl: null, hours: [], isClosed: false, fetchedAt: '2026-10-28T00:00:00Z', features: { foodQuality: .83, value: .7, service: .8, atmosphere: .6, cuisines: [], dishes: [], flavors: [], spice: null, fusion: false, confidence: .8, reviewCount: 24, evidence: [], updatedAt: '2026-10-28T00:00:00Z', ...overrides } };
}
const foodEvidence = { id: 'review-food', aspect: 'food' as const, text: 'The handmade noodles have a lovely chew.', sourceUrl };

describe('grounded restaurant insights', () => {
  it('keeps every display signal unknown without supporting reviews', () => {
    const item = rankRestaurants([restaurant()], defaultTasteProfile(), origin)[0];
    expect(item.scoreBreakdown).toEqual({ food: null, value: null, service: null, atmosphere: null, taste: null });
    expect(item.matchReasons).toEqual([]);
    expect(item.explanation).toContain('limited evidence');
    expect(item.explanation).not.toContain('positive');
  });
  it('reports only sourced aspect signals, preserving an actual zero', () => {
    const place = restaurant({ service: 0, atmosphere: null, dishes: ['handmade noodles'], evidence: [foodEvidence, { id: 'review-value', aspect: 'value', text: 'The portions are generous for the price.', sourceUrl }, { id: 'review-service', aspect: 'service', text: 'Service was very slow.', sourceUrl }] });
    const profile = { ...defaultTasteProfile(), dishes: ['handmade noodles'] };
    const item = rankRestaurants([place], profile, origin)[0];
    expect(item.scoreBreakdown).toEqual({ food: 83, value: 70, service: 0, atmosphere: null, taste: 90 });
    expect(item.matchReasons).toHaveLength(3);
    expect(item.matchReasons?.[0]).toContain('matching dishes you enjoy');
    expect(item.matchReasons?.[0]).toContain(foodEvidence.text);
    expect(item.matchReasons?.some(reason => reason.includes('generous for the price'))).toBe(true);
    expect(item.matchReasons?.some(reason => reason.includes('Service was very slow'))).toBe(true);
  });
  it('does not treat listing categories as review-derived taste scores', () => {
    const place = restaurant({ confidence: 0, cuisines: ['Korean'], evidence: [foodEvidence] });
    place.cuisines = ['Korean restaurant'];
    const item = rankRestaurants([place], { ...defaultTasteProfile(), cuisines: ['Korean'] }, origin)[0];
    expect(item.explanation).toContain('Listed as Korean');
    expect(item.scoreBreakdown).toEqual({ food: null, value: null, service: null, atmosphere: null, taste: null });
  });
  it('explains matched review-derived cuisine and flavor using actual excerpts', () => {
    const place = restaurant({ cuisines: ['Cantonese'], flavors: ['ginger'], evidence: [{ id: 'review-cuisine', aspect: 'food', text: 'Cantonese dishes with plenty of fresh ginger.', sourceUrl }] });
    const profile = { ...defaultTasteProfile(), cuisines: ['Cantonese'], flavors: ['ginger'] };
    const item = rankRestaurants([place], profile, origin)[0];
    expect(item.matchReasons?.some(reason => reason.includes('ginger') && reason.includes('flavor preferences'))).toBe(true);
    expect(item.scoreBreakdown?.taste).toBe(90);
  });
  it('does not expose an unsourced tag as a personal match or taste signal', () => {
    const item = rankRestaurants([restaurant({ dishes: ['dumplings'], flavors: ['chili'], evidence: [foodEvidence] })], { ...defaultTasteProfile(), dishes: ['dumplings'], flavors: ['chili'] }, origin)[0];
    expect(item.scoreBreakdown?.taste).toBeNull();
    expect(item.matchReasons?.some(reason => reason.includes('matching dishes') || reason.includes('flavor preferences'))).toBe(false);
  });
  it('keeps cleanliness comments separate from every food or value signal', () => {
    const item = rankRestaurants([restaurant({ evidence: [{ id: 'review-cleanliness', aspect: 'cleanliness', text: 'The table was dirty.', sourceUrl }] })], defaultTasteProfile(), origin)[0];
    expect(item.scoreBreakdown).toEqual({ food: null, value: null, service: null, atmosphere: null, taste: null });
    expect(item.matchReasons).toEqual([]);
    expect(item.explanation).not.toContain('dirty');
  });
  it('does not invent personalized scores for a user without taste preferences', () => {
    const item = rankRestaurants([restaurant({ evidence: [foodEvidence] })], defaultTasteProfile(), origin)[0];
    expect(item.scoreBreakdown?.food).toBe(83);
    expect(item.scoreBreakdown?.taste).toBeNull();
    expect(item.explanation).toBe(`Food review: "${foodEvidence.text}"`);
  });
  it('makes service and value priorities visible through their source context', () => {
    const place = restaurant({ evidence: [{ id: 'review-value', aspect: 'value', text: 'A generous meal for what we spent.', sourceUrl }, { id: 'review-service', aspect: 'service', text: 'The staff were attentive and welcoming.', sourceUrl }] });
    const profile = defaultTasteProfile(); profile.weights.service = .6; profile.weights.value = .3;
    const item = rankRestaurants([place], profile, origin)[0];
    expect(item.matchReasons?.[0]).toBe('Service review: "The staff were attentive and welcoming."');
    expect(item.matchReasons?.[1]).toBe('Value review: "A generous meal for what we spent."');
  });
  it('leaves numeric ranking behavior unchanged when only display evidence differs', () => {
    const withEvidence = restaurant({ evidence: [foodEvidence] });
    const withoutEvidence = restaurant();
    const profile = defaultTasteProfile();
    expect(rankRestaurants([withEvidence], profile, origin)[0].score).toBe(rankRestaurants([withoutEvidence], profile, origin)[0].score);
  });
  it('keeps invalid numeric features and unlinked snippets unknown in reusable UI signals', () => {
    const place = restaurant({ foodQuality: NaN, evidence: [foodEvidence, { id: 'no-link', aspect: 'value', text: 'Good portions.', sourceUrl: '' }] });
    expect(restaurantReviewSignals(place)).toEqual({ food: null, value: null, service: null, atmosphere: null, taste: null });
  });
});
