export interface ApifyRun { id: string; actId: string; status: string; defaultDatasetId: string; usageTotalUsd?: number; }
export interface ScrapeInput { query?: string; city?: string; lat?: number; lng?: number; radiusKm?: number; urls?: string[]; maxPlaces?: number; maxReviews?: number; mode?: 'for-you' | 'fusion'; }

export function buildActorInput(input: ScrapeInput): Record<string, unknown> {
  const common = { maxCrawledPlacesPerSearch: Math.max(1, Math.min(40, input.maxPlaces ?? 20)), maxReviews: Math.max(0, Math.min(40, input.maxReviews ?? 40)), reviewsSort: 'newest', scrapeReviewsPersonalData: false, scrapePlaceDetailPage: true, maxImages: 0, language: 'en' };
  if (input.urls?.length) {
    for (const value of input.urls) { const u = new URL(value); if (u.protocol !== 'https:' || !['www.google.com','google.com','maps.google.com'].includes(u.hostname)) throw new Error('Only Google Maps place URLs are accepted'); }
    return { ...common, startUrls: input.urls.slice(0, 20).map(url => ({ url })) };
  }
  const query = input.query?.trim() || (input.mode === 'fusion' ? 'East Asian fusion restaurant' : 'East Asian restaurant');
  if (query.length > 200) throw new Error('Search query is too long');
  if (input.city?.trim()) return { ...common, searchStringsArray: [query], locationQuery: input.city.trim().slice(0, 150) };
  if (input.query?.trim() && input.lat === undefined && input.lng === undefined) return { ...common, searchStringsArray: [query] };
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || Math.abs(input.lat!) > 90 || Math.abs(input.lng!) > 180) throw new Error('A city or valid coordinates are required');
  const lat = input.lat!, lng = input.lng!, radius = Math.max(.5, Math.min(50, input.radiusKm ?? 5));
  const dLat = radius / 111.32, dLng = radius / (111.32 * Math.max(.01, Math.cos(lat * Math.PI / 180)));
  const left = Math.max(-180, lng - dLng), right = Math.min(180, lng + dLng), bottom = Math.max(-90, lat - dLat), top = Math.min(90, lat + dLat);
  return { ...common, searchStringsArray: [query], customGeolocation: { type: 'Polygon', coordinates: [[[left,bottom],[right,bottom],[right,top],[left,top],[left,bottom]]] } };
}

export class ApifyClient {
  constructor(private readonly token: string, private readonly request: typeof fetch = fetch) { if (!token) throw new Error('APIFY_TOKEN is required'); }
  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.request(`https://api.apify.com/v2/${path}`, { ...init, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...init?.headers }, signal: AbortSignal.timeout(25_000) });
    if (!res.ok) throw new Error(`Apify request failed (${res.status})`);
    return await res.json() as T;
  }
  async start(input: ScrapeInput, maxTotalChargeUsd = 1, webhookUrl?: string, webhookSecret?: string): Promise<ApifyRun> {
    if (!(maxTotalChargeUsd > 0 && maxTotalChargeUsd <= 5)) throw new Error('Run cap must be between zero and five dollars');
    const query = new URLSearchParams({ maxTotalChargeUsd: String(maxTotalChargeUsd), timeout: '300', restartOnError: 'false' });
    if (webhookUrl) { const u = new URL(webhookUrl); if (u.protocol !== 'https:') throw new Error('Webhook requires HTTPS'); query.set('webhooks', btoa(JSON.stringify([{ eventTypes: ['ACTOR.RUN.SUCCEEDED','ACTOR.RUN.FAILED','ACTOR.RUN.TIMED_OUT','ACTOR.RUN.ABORTED'], requestUrl: u.href, ...(webhookSecret ? { headersTemplate: JSON.stringify({ 'x-webhook-secret': webhookSecret }) } : {}) }]))); }
    const result = await this.api<{ data: ApifyRun }>(`acts/compass~crawler-google-places/runs?${query}`, { method: 'POST', body: JSON.stringify(buildActorInput(input)) });
    if (!result.data?.id || !result.data.defaultDatasetId) throw new Error('Apify returned an invalid run');
    return result.data;
  }
  async getRun(id: string): Promise<ApifyRun> { return (await this.api<{ data: ApifyRun }>(`actor-runs/${encodeURIComponent(id)}`)).data; }
  async dataset(id: string, offset = 0, limit = 20): Promise<unknown[]> { const rows = await this.api<unknown>(`datasets/${encodeURIComponent(id)}/items?clean=true&format=json&offset=${offset}&limit=${Math.min(40, Math.max(1, limit))}`); if (!Array.isArray(rows)) throw new Error('Invalid dataset response'); return rows; }
}
