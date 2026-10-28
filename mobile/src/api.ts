import { supabase } from './auth';
import { apiOrigin } from './policies';
export const API_ORIGIN = apiOrigin(process.env.EXPO_PUBLIC_API_ORIGIN);
export async function api<T>(path: string, body?: unknown, method?: string, signal?: AbortSignal): Promise<T> {
  if (!path.startsWith('/api/')) throw new Error('Unrecognized app API path.');
  if (!supabase) throw new Error('Mobile sign-in is waiting for configuration.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Please sign in again.');
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'), signal,
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const dataText = await response.text();
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(dataText) as Record<string, unknown>; } catch { throw new Error('The server response could not be read. Please try again.'); }
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'The request did not finish. Please try again.');
  return payload as T;
}
