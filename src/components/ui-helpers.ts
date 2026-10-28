import { tasteInputSchema, type DiscoverResponse, type Favorite, type RankedRestaurant, type Restaurant } from '@/lib/contracts';
import { parseTasteGoal, type TasteGoal } from '@/lib/taste-goals';

export function goalDraftKey(userId: string): string { return `east-eats:taste-goal:${encodeURIComponent(userId)}`; }
export function parseGoalDraft(raw: string | null): TasteGoal | undefined {
  if (!raw) return undefined;
  try { return parseTasteGoal(JSON.parse(raw) as unknown); } catch { return undefined; }
}

export const REASONS = ['The food itself', 'Regional dishes', 'Great value', 'Spice and bold flavors', 'Atmosphere', 'Friendly service'] as const;
export function authNotice(search: string): string {
  const params = new URLSearchParams(search);
  if (params.get('auth') === 'setup') return 'Google sign-in is waiting for setup. Please try again after it is connected.';
  if (params.get('auth') === 'failed' || params.has('error')) return 'Sign-in did not finish. Please try again.';
  return '';
}
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
export function priceLabel(price: number | null, priceText?: string | null): string { return priceText || (price ? '
export function distanceLabel(km: number): string { return `${(km * 0.621371).toFixed(1)} mi`; }
export function safeExternalUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined; } catch { return undefined; }
}
export function fitLabel(item: RankedRestaurant): string {
  if (item.confidence < 0.35) return 'Still getting to know this spot';
  return item.score >= 65 ? 'Strong fit' : 'Worth exploring';
}

/** Browse stays stable; an explicit search immediately follows source relevance. */
export function mergeDiscoveryResults(current: DiscoverResponse | null, incoming: DiscoverResponse, preferIncomingOrder = false): { applied: DiscoverResponse; pending: DiscoverResponse | null } {
  if (!current?.items.length) return { applied: incoming, pending: null };
  const currentIds = new Set(current.items.map(item => item.restaurant.id));
  const incomingById = new Map(incoming.items.map(item => [item.restaurant.id, item]));
  if (preferIncomingOrder) {
    const missing = incoming.job?.status === 'succeeded' ? [] : current.items.filter(item => !incomingById.has(item.restaurant.id));
    return { applied: { ...incoming, items: [...incoming.items, ...missing] }, pending: null };
  }
  const existingOrder = current.items.filter(item => incomingById.has(item.restaurant.id)).map(item => item.restaurant.id);
  const rankedExistingOrder = incoming.items.filter(item => currentIds.has(item.restaurant.id)).map(item => item.restaurant.id);
  const orderChanged = existingOrder.some((id, index) => id !== rankedExistingOrder[index]);
  // Partial pages must not erase cached places. A completed source snapshot is
  // authoritative, so removed, closed, or no-longer-matching places leave now.
  const retained = incoming.job?.status === 'succeeded'
    ? current.items.filter(item => incomingById.has(item.restaurant.id))
    : current.items;
  const items = [
    ...retained.map(item => incomingById.get(item.restaurant.id) ?? item),
    ...incoming.items.filter(item => !currentIds.has(item.restaurant.id)),
  ];
  return { applied: { ...incoming, items }, pending: orderChanged ? incoming : null };
}
.repeat(price) : 'See menu for prices'); }
export function distanceLabel(km: number): string { return `${(km * 0.621371).toFixed(1)} mi`; }
export function safeExternalUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined; } catch { return undefined; }
}
export function fitLabel(item: RankedRestaurant): string {
  if (item.confidence < 0.35) return 'Still getting to know this spot';
  return item.score >= 65 ? 'Strong fit' : 'Worth exploring';
}

/** Browse stays stable; an explicit search immediately follows source relevance. */
export function mergeDiscoveryResults(current: DiscoverResponse | null, incoming: DiscoverResponse, preferIncomingOrder = false): { applied: DiscoverResponse; pending: DiscoverResponse | null } {
  if (!current?.items.length) return { applied: incoming, pending: null };
  const currentIds = new Set(current.items.map(item => item.restaurant.id));
  const incomingById = new Map(incoming.items.map(item => [item.restaurant.id, item]));
  if (preferIncomingOrder) {
    const missing = incoming.job?.status === 'succeeded' ? [] : current.items.filter(item => !incomingById.has(item.restaurant.id));
    return { applied: { ...incoming, items: [...incoming.items, ...missing] }, pending: null };
  }
  const existingOrder = current.items.filter(item => incomingById.has(item.restaurant.id)).map(item => item.restaurant.id);
  const rankedExistingOrder = incoming.items.filter(item => currentIds.has(item.restaurant.id)).map(item => item.restaurant.id);
  const orderChanged = existingOrder.some((id, index) => id !== rankedExistingOrder[index]);
  // Partial pages must not erase cached places. A completed source snapshot is
  // authoritative, so removed, closed, or no-longer-matching places leave now.
  const retained = incoming.job?.status === 'succeeded'
    ? current.items.filter(item => incomingById.has(item.restaurant.id))
    : current.items;
  const items = [
    ...retained.map(item => incomingById.get(item.restaurant.id) ?? item),
    ...incoming.items.filter(item => !currentIds.has(item.restaurant.id)),
  ];
  return { applied: { ...incoming, items }, pending: orderChanged ? incoming : null };
}
