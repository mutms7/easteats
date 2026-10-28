export const AUTH_REDIRECT = 'easteats://auth/callback';
export function callbackCode(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'easteats:' || url.hostname !== 'auth' || url.pathname !== '/callback' || url.username || url.password || url.port || url.hash) throw new Error('The sign-in return address was not recognized.');
  if (url.searchParams.has('error')) throw new Error('Sign-in did not finish. Please try again.');
  const code = url.searchParams.get('code');
  if (!code || code.length > 4096) throw new Error('Sign-in did not return a valid code.');
  return code;
}
export function apiOrigin(raw: string | undefined): string {
  const url = new URL(raw || 'https://easteats.vercel.app');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('The app API address must be an HTTPS origin.');
  return url.origin;
}
export function safeHttps(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined; } catch { return undefined; }
}
export function activeJob(status: string | undefined): boolean { return status === 'queued' || status === 'running'; }
export function mergePlaces<T extends { restaurant: { id: string } }>(current: T[], incoming: T[], complete: boolean, preferIncomingOrder = false): T[] {
  const fresh = new Map(incoming.map(item => [item.restaurant.id, item]));
  if (preferIncomingOrder) return [...incoming, ...(complete ? [] : current.filter(item => !fresh.has(item.restaurant.id)))];
  const known = new Set(current.map(item => item.restaurant.id));
  return [...current.filter(item => !complete || fresh.has(item.restaurant.id)).map(item => fresh.get(item.restaurant.id) ?? item), ...incoming.filter(item => !known.has(item.restaurant.id))];
}
