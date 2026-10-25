import type { Restaurant, Review } from '../../lib/contracts.ts';

const obj = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' ? v as Record<string, unknown> : {};
const text = (v: unknown, max = 500): string => typeof v === 'string' ? v.trim().slice(0, max) : '';
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const url = (v: unknown): string | null => { try { const u = new URL(text(v, 3000)); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(16); };

/** Pick a minimal business record. Reviewer names, profiles, photos and IDs never survive. */
export function normalizePlace(raw: unknown): { restaurant: Restaurant; reviews: Review[] } | null {
  const p = obj(raw), loc = obj(p.location);
  const id = text(p.placeId, 300), name = text(p.title ?? p.name, 200);
  const lat = num(loc.lat), lng = num(loc.lng);
  if (!id || !name || lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const sourceUrl = url(p.url) ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(id)}`;
  const cats = Array.isArray(p.categories) ? p.categories.map(c => text(c, 100)).filter(Boolean) : [];
  if (text(p.categoryName)) cats.push(text(p.categoryName, 100));
  const cuisines = [...new Set(cats.filter(c => /chinese|japanese|korean|taiwan|mongolian|canton|sichuan|szechuan|shangha|hunan|hakka|ramen|sushi|izakaya|dim sum|dumpling|fusion/i.test(c)))];
  const price = text(p.price, 50);
  const priceLevel = /^[$£€¥]{1,4}$/.test(price) ? price.length : null;
  const totalScore = num(p.totalScore), count = num(p.reviewsCount);
  const hours = Array.isArray(p.openingHours) ? p.openingHours.map(h => { const o = obj(h); return text(typeof h === 'string' ? h : `${text(o.day, 30)}: ${text(o.hours, 150)}`, 200); }).filter(Boolean).slice(0, 14) : [];
  const reviews: Review[] = [];
  const seen = new Set<string>();
  for (const v of Array.isArray(p.reviews) ? p.reviews.slice(0, 40) : []) {
    const r = obj(v), body = text(r.text ?? r.textTranslated, 4000);
    if (!body) continue;
    const date = text(r.publishedAtDate ?? r.publishedAt, 100);
    const reviewId = text(r.reviewId, 300) || `${id}:${hash(`${body}|${date}`)}`;
    if (seen.has(reviewId)) continue;
    seen.add(reviewId);
    const stars = num(r.stars);
    reviews.push({ id: reviewId, text: body, stars: stars !== null && stars >= 0 && stars <= 5 ? stars : null, publishedAt: date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null, sourceUrl: url(r.reviewUrl) ?? sourceUrl });
  }
  return { restaurant: { id, name, address: text(p.address, 500), city: text(p.city, 150), lat, lng, cuisines, priceLevel, googleRating: totalScore !== null && totalScore >= 0 && totalScore <= 5 ? totalScore : null, reviewCount: count === null ? reviews.length : Math.max(0, Math.floor(count)), sourceUrl, imageUrl: url(p.imageUrl) ?? (Array.isArray(p.imageUrls) ? url(p.imageUrls[0]) : null), websiteUrl: url(p.website), hours, isClosed: p.permanentlyClosed === true || p.temporarilyClosed === true, fetchedAt: new Date().toISOString(), features: null }, reviews };
}

export function needsRefresh(fetchedAt: string | null, ttlMs: number, now = Date.now()): boolean {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return true;
  const at = fetchedAt ? Date.parse(fetchedAt) : NaN;
  return !Number.isFinite(at) || at > now + 60_000 || now - at >= ttlMs;
}

export const FRESHNESS = { discovery: 24 * 60 * 60 * 1000, details: 6 * 60 * 60 * 1000, features: 7 * 24 * 60 * 60 * 1000 } as const;
export function refreshKey(input: { kind: string; lat?: number; lng?: number; radiusKm?: number; query?: string; city?: string; placeId?: string }): string {
  return JSON.stringify([input.kind, input.placeId ?? '', input.lat?.toFixed(2) ?? '', input.lng?.toFixed(2) ?? '', input.radiusKm === undefined ? '' : Math.round(input.radiusKm), input.query?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '', input.city?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '']);
}
