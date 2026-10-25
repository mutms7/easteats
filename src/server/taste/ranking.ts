import { locationSchema, tasteProfileSchema, type Location, type RankedRestaurant, type Restaurant, type TasteProfile } from '../../lib/contracts.ts';
import { normalizeWeights } from './profile.ts';
import { TasteError } from './claude.ts';

const canonical = (value: string) => value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tagMatch = (preference: string, candidate: string) => {
  const a = canonical(preference), b = canonical(candidate);
  return Boolean(a && b && (a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `)));
};
const matches = (preferences: string[], candidates: string[]) => preferences.filter(preference => candidates.some(candidate => tagMatch(preference, candidate)));
const bounded = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? .5 : Math.max(0, Math.min(1, value));

export function distanceKm(a: Location, b: Location): number {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const sinLat = Math.sin(rad(b.lat - a.lat) / 2), sinLng = Math.sin(rad(b.lng - a.lng) / 2);
  const haversine = sinLat * sinLat + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * sinLng * sinLng;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, haversine))));
}

function tasteMatch(restaurant: Restaurant, profile: TasteProfile): number {
  const features = restaurant.features;
  const confidence = bounded(features?.confidence ?? 0);
  const parts: number[] = [];
  const addTags = (preferences: string[], candidates: string[], certainty: number) => {
    if (preferences.length) parts.push(candidates.length ? .5 + (matches(preferences, candidates).length / preferences.length - .5) * certainty : .5);
  };
  addTags(profile.cuisines, [...restaurant.cuisines, ...(features?.cuisines ?? [])], restaurant.cuisines.length ? 1 : confidence);
  addTags(profile.dishes, features?.dishes ?? [], confidence);
  addTags(profile.flavors, features?.flavors ?? [], confidence);
  if (profile.spicePreference !== null) parts.push(features?.spice === null || features?.spice === undefined ? .5 : .5 + (1 - Math.abs(profile.spicePreference - features.spice) - .5) * confidence);
  if (profile.fusionPreference !== null) {
    const hasFusionEvidence = features?.evidence.some(item => item.aspect === 'fusion');
    parts.push(hasFusionEvidence ? .5 + (1 - Math.abs(profile.fusionPreference - (features?.fusion ? 1 : 0)) - .5) * confidence : .5);
  }
  return parts.length ? parts.reduce((sum, value) => sum + value, 0) / parts.length : .5;
}

function explanationFor(restaurant: Restaurant, profile: TasteProfile, distance: number): string {
  const features = restaurant.features;
  const foodEvidence = features?.evidence.filter(item => item.aspect === 'food') ?? [];
  const grounded = (tag: string) => foodEvidence.some(item => tagMatch(tag, item.text));
  const dish = matches(profile.dishes, features?.dishes ?? []).find(grounded);
  if (dish) return `Review evidence mentions ${dish}, matching dishes you enjoy.`;
  const flavor = matches(profile.flavors, features?.flavors ?? []).find(grounded);
  if (flavor) return `Review evidence mentions ${flavor}, matching your flavor preferences.`;
  if (profile.fusionPreference !== null && profile.fusionPreference > .5 && features?.fusion && features.evidence.some(item => item.aspect === 'fusion')) return 'Review evidence describes fusion dishes, matching your interest in unexpected combinations.';
  const cuisine = matches(profile.cuisines, restaurant.cuisines)[0];
  if (cuisine) return `Listed as ${cuisine}, matching your cuisine preferences.`;
  if (features?.foodQuality !== null && features?.foodQuality !== undefined && features.foodQuality > .6 && foodEvidence.length && features.confidence >= .25) return 'Food-focused review evidence is positive; check the field notes to see whether it fits your tastes.';
  return `${distance.toFixed(1)} km away. There is limited evidence for a personal taste match.`;
}

export function rankRestaurants(restaurants: Restaurant[], profile: TasteProfile, location: Location, radiusKm = 5): RankedRestaurant[] {
  const parsedProfile = tasteProfileSchema.safeParse(profile);
  const parsedLocation = locationSchema.safeParse(location);
  if (!parsedProfile.success || !parsedLocation.success || !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) throw new TasteError('INVALID_INPUT', 'Ranking needs a valid taste profile, location, and radius up to 50 km.');
  const weights = normalizeWeights(parsedProfile.data.weights);
  const unique = new Map<string, Restaurant>();
  for (const restaurant of restaurants) if (!unique.has(restaurant.id)) unique.set(restaurant.id, restaurant);
  return [...unique.values()].flatMap(restaurant => {
    if (restaurant.isClosed || !locationSchema.safeParse({ lat: restaurant.lat, lng: restaurant.lng }).success) return [];
    const distance = distanceKm(location, restaurant);
    if (distance > radiusKm) return [];
    const features = restaurant.features;
    const score = 100 * (
      weights.food * bounded(features?.foodQuality)
      + weights.taste * tasteMatch(restaurant, parsedProfile.data)
      + weights.value * bounded(features?.value)
      + weights.proximity * Math.max(0, 1 - distance / radiusKm)
      + weights.service * bounded(features?.service)
      + weights.atmosphere * bounded(features?.atmosphere)
    );
    return [{ restaurant, score: Math.round(score * 100) / 100, distanceKm: Math.round(distance * 1000) / 1000, explanation: explanationFor(restaurant, parsedProfile.data, distance), confidence: bounded(features?.confidence ?? 0) }];
  }).sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm || (a.restaurant.id < b.restaurant.id ? -1 : a.restaurant.id > b.restaurant.id ? 1 : 0));
}
