import { tasteInputSchema, type Favorite, type RankedRestaurant, type Restaurant } from '@/lib/contracts';

export const REASONS = ['The food itself', 'Regional dishes', 'Great value', 'Spice and bold flavors', 'Atmosphere', 'Friendly service'] as const;
export function toggleReason(favorite: Favorite, reason: string): Favorite {
  return { ...favorite, reasons: favorite.reasons.includes(reason) ? favorite.reasons.filter(value => value !== reason) : [...favorite.reasons, reason] };
}
export function favoriteFromRestaurant(restaurant: Restaurant): Favorite {
  return { restaurantId: restaurant.id, name: restaurant.name, city: restaurant.city, reasons: [], notes: '' };
}
export function validFavorites(favorites: Favorite[]): boolean {
  return tasteInputSchema.safeParse({ favorites }).success;
}
export function parseDraft(raw: string | null): Favorite[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 5) return null;
    if (!value.every(item => item && typeof item === 'object' && typeof item.restaurantId === 'string' && typeof item.name === 'string' && typeof item.city === 'string' && typeof item.notes === 'string' && item.notes.length <= 1500 && Array.isArray(item.reasons) && item.reasons.length <= 10 && item.reasons.every((reason: unknown) => typeof reason === 'string'))) return null;
    return value as Favorite[];
  } catch { return null; }
}
export function priceLabel(price: number | null): string { return price ? '$'.repeat(price) : 'Price unknown'; }
export function distanceLabel(km: number): string { return `${(km * 0.621371).toFixed(1)} mi`; }
export function safeExternalUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined; } catch { return undefined; }
}
export function fitLabel(item: RankedRestaurant): string {
  if (item.confidence < 0.35) return 'Still getting to know this spot';
  return item.score >= 65 ? 'Strong fit' : 'Worth exploring';
}
