import { locationSchema, tasteProfileSchema, type Location, type RankedRestaurant, type Restaurant, type TasteProfile } from '../../lib/contracts.ts';
import { normalizeWeights } from './profile.ts';
import { TasteError } from './claude.ts';
import { hasReviewConfidence, restaurantReviewSignals, reviewEvidence, type ReviewAspect } from '../../lib/restaurant-insights.ts';

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

function excerpt(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  const points = Array.from(compact);
  if (points.length <= 150) return compact;
  const prefix = points.slice(0, 147).join('');
  const boundary = prefix.lastIndexOf(' ');
  return `${boundary > 100 ? prefix.slice(0, boundary) : prefix}...`;
}

/** Display taste signals only when a stated preference has review-backed data. */
function reviewTasteSignal(restaurant: Restaurant, profile: TasteProfile): number | null {
  const features = restaurant.features;
  if (!features || !hasReviewConfidence(restaurant)) return null;
  const food = reviewEvidence(restaurant, 'food');
  const groundedTags = (tags: string[]) => tags.some(tag => food.some(item => tagMatch(tag, item.text)));
  const comparable = profile.cuisines.length && groundedTags(features.cuisines)
    || profile.dishes.length && groundedTags(features.dishes)
    || profile.flavors.length && groundedTags(features.flavors)
    || profile.spicePreference !== null && features.spice !== null && food.some(item => /spic|chili|chilli|heat|mild|hot|pepper|fiery/i.test(item.text))
    || profile.fusionPreference !== null && reviewEvidence(restaurant, 'fusion').length > 0;
  // Listing categories remain useful for sorting, but aren't review evidence.
  return comparable ? tasteMatch({ ...restaurant, cuisines: [] }, profile) : null;
}

function insightsFor(restaurant: Restaurant, profile: TasteProfile, distance: number) {
  const features = restaurant.features;
  const signals = restaurantReviewSignals(restaurant, reviewTasteSignal(restaurant, profile));
  const food = hasReviewConfidence(restaurant) ? reviewEvidence(restaurant, 'food') : [];
  const reasons: string[] = [];
  const usedQuotes = new Set<string>();
  const addReason = (reason: string, quote?: string) => {
    if (!reasons.includes(reason) && (!quote || !usedQuotes.has(quote))) {
      reasons.push(reason);
      if (quote) usedQuotes.add(quote);
    }
  };
  const addMatchedTag = (preferences: string[], candidates: string[], kind: 'dishes' | 'flavors' | 'cuisines') => {
    const tag = matches(preferences, candidates).find(value => food.some(item => tagMatch(value, item.text)));
    const source = tag ? food.find(item => tagMatch(tag, item.text)) : undefined;
    const preference = kind === 'dishes' ? 'dishes you enjoy' : kind === 'flavors' ? 'your flavor preferences' : 'your cuisine preferences';
    if (tag && source) addReason(`Review evidence mentions ${tag}, matching ${preference}: "${excerpt(source.text)}"`, source.text);
  };
  addMatchedTag(profile.dishes, features?.dishes ?? [], 'dishes');
  addMatchedTag(profile.flavors, features?.flavors ?? [], 'flavors');
  if (reasons.length < 2) addMatchedTag(profile.cuisines, features?.cuisines ?? [], 'cuisines');
  const fusion = hasReviewConfidence(restaurant) ? reviewEvidence(restaurant, 'fusion')[0] : undefined;
  if (reasons.length < 2 && profile.fusionPreference !== null && profile.fusionPreference > .5 && features?.fusion && fusion) addReason(`Your interest in fusion overlaps with review evidence: "${excerpt(fusion.text)}"`, fusion.text);
  const cuisine = matches(profile.cuisines, restaurant.cuisines)[0];
  if (reasons.length < 2 && cuisine) addReason(`Listed as ${cuisine}, matching your cuisine preferences.`);
  const aspects = (['food', 'value', 'service', 'atmosphere'] as const)
    .filter(aspect => signals[aspect] !== null && profile.weights[aspect] > 0)
    .sort((a, b) => profile.weights[b] - profile.weights[a]);
  for (const aspect of aspects) {
    if (reasons.length >= 3) break;
    const source = reviewEvidence(restaurant, aspect as ReviewAspect).find(item => !usedQuotes.has(item.text));
    if (source) addReason(`${aspect[0].toUpperCase()}${aspect.slice(1)} review: "${excerpt(source.text)}"`, source.text);
  }
  return {
    matchReasons: reasons,
    scoreBreakdown: signals,
    explanation: reasons[0] ?? `${distance.toFixed(1)} km away. There is limited evidence for a personal taste match.`,
  };
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
    return [{ restaurant, score: Math.round(score * 100) / 100, distanceKm: Math.round(distance * 1000) / 1000, ...insightsFor(restaurant, parsedProfile.data, distance), confidence: bounded(features?.confidence ?? 0) }];
  }).sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm || (a.restaurant.id < b.restaurant.id ? -1 : a.restaurant.id > b.restaurant.id ? 1 : 0));
}
