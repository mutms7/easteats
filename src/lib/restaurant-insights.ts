import type { Restaurant } from './contracts.ts';

export type ReviewSignalBreakdown = { food: number | null; value: number | null; service: number | null; atmosphere: number | null; taste: number | null };
export type ReviewAspect = 'food' | 'value' | 'service' | 'atmosphere' | 'fusion';

/** These are derived review signals, not measurements or match probabilities. */
export function reviewEvidence(restaurant: Restaurant, aspect: ReviewAspect) {
  return restaurant.features?.evidence.filter(item => item.aspect === aspect && item.text.trim().length > 0 && /^https?:\/\//i.test(item.sourceUrl)) ?? [];
}

export function hasReviewConfidence(restaurant: Restaurant): boolean {
  const confidence = restaurant.features?.confidence;
  return typeof confidence === 'number' && Number.isFinite(confidence) && confidence > 0;
}

const displaySignal = (value: number | null | undefined): number | null => typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 100) : null;

/** Unknown evidence stays null, even if a legacy record has a numeric feature. */
export function restaurantReviewSignals(restaurant: Restaurant, taste: number | null = null): ReviewSignalBreakdown {
  if (!restaurant.features || !hasReviewConfidence(restaurant)) return { food: null, value: null, service: null, atmosphere: null, taste: null };
  return {
    food: reviewEvidence(restaurant, 'food').length ? displaySignal(restaurant.features.foodQuality) : null,
    value: reviewEvidence(restaurant, 'value').length ? displaySignal(restaurant.features.value) : null,
    service: reviewEvidence(restaurant, 'service').length ? displaySignal(restaurant.features.service) : null,
    atmosphere: reviewEvidence(restaurant, 'atmosphere').length ? displaySignal(restaurant.features.atmosphere) : null,
    taste: reviewEvidence(restaurant, 'food').length || reviewEvidence(restaurant, 'fusion').length ? displaySignal(taste) : null,
  };
}
