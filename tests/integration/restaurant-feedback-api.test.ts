import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), from: vi.fn(), rpc: vi.fn(), calls: [] as { table: string; filters: [string, unknown][] }[] }));
vi.mock('@/server/session', () => ({ requireSession: mocks.session }));
import { GET as feedbackGet, PUT as feedbackPut } from '@/app/api/feedback/route';
import { GET as mealGet, PUT as mealPut } from '@/app/api/meal/route';
import { HttpError } from '@/server/http';
import { demoRestaurants } from '@/server/demo';
import { demoFeedbackState } from '@/server/restaurant-feedback';

const place = demoRestaurants[0];
let feedbackRows: { place_id: string; sentiment: string; reason: string | null; note: string | null; updated_at: string }[];
let pending: { place_id: string; search_id: string | null; chosen_at: string } | null;

beforeEach(() => {
  vi.clearAllMocks(); mocks.calls.length = 0; vi.stubEnv('APP_URL', 'http://localhost:3000');
  feedbackRows = [{ place_id: place.id, sentiment: 'like', reason: 'food', note: null, updated_at: '2026-10-28T00:00:00Z' }]; pending = null;
  mocks.from.mockImplementation((table: string) => {
    const entry = { table, filters: [] as [string, unknown][] }; mocks.calls.push(entry);
    const result = () => ({ data: table === 'restaurant_feedback' ? feedbackRows : table === 'restaurants' ? [{ id: place.id, record: place }] : table === 'restaurant_features' ? [] : pending, error: null });
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn((key, value) => { entry.filters.push([key, value]); return chain; }),
      in: vi.fn(() => chain), order: vi.fn(() => chain), range: vi.fn(() => chain),
      is: vi.fn((key, value) => { entry.filters.push([key, value]); return chain; }),
      maybeSingle: vi.fn(async () => ({ data: table === 'restaurants' ? { id: place.id } : pending, error: null })),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    };
    return chain;
  });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.session.mockResolvedValue({ demo: false, user: { id: 'verified-user' }, client: { from: mocks.from, rpc: mocks.rpc } });
  demoFeedbackState.reset();
});
afterEach(() => { vi.unstubAllEnvs(); demoFeedbackState.reset(); });
const put = (endpoint: typeof feedbackPut, path: string, body: unknown, origin = 'http://localhost:3000') => endpoint(new Request(`http://localhost:3000${path}`, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));

describe('feedback API', () => {
  it('loads feedback only for the verified account and disables response caching', async () => {
    const response = await feedbackGet(new Request('http://localhost:3000/api/feedback'));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ items: [{ restaurantId: place.id, sentiment: 'like', restaurant: { id: place.id } }] });
    expect(mocks.calls.find(call => call.table === 'restaurant_feedback')?.filters).toContainEqual(['user_id', 'verified-user']);
  });
  it('delegates a vote and matching meal answer to one atomic user-scoped RPC', async () => {
    const response = await put(feedbackPut, '/api/feedback', { restaurantId: place.id, sentiment: 'like', reason: 'food', note: '  Great noodles  ', answerMeal: true });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('set_restaurant_feedback', { p_place_id: place.id, p_sentiment: 'like', p_reason: 'food', p_note: 'Great noodles', p_answer_meal: true });
    expect(await response.json()).toHaveProperty('items');
  });
  it('clears a vote with null without marking the meal answered', async () => {
    expect((await put(feedbackPut, '/api/feedback', { restaurantId: place.id, sentiment: null })).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('set_restaurant_feedback', expect.objectContaining({ p_sentiment: null, p_answer_meal: false }));
  });
  it.each([{ restaurantId: place.id, sentiment: 'like', user_id: 'another-account' }, { restaurantId: place.id, sentiment: 'love' }, { restaurantId: place.id, sentiment: null, answerMeal: true }])('rejects invalid or forged payloads before database mutations', async body => {
    expect((await put(feedbackPut, '/api/feedback', body)).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('meal API', () => {
  it('reads only the account current unanswered check-in', async () => {
    pending = { place_id: place.id, search_id: null, chosen_at: '2026-10-28T00:00:00Z' };
    const response = await mealGet(new Request('http://localhost:3000/api/meal'));
    expect(await response.json()).toMatchObject({ pendingMeal: { restaurantId: place.id, restaurant: { id: place.id }, searchId: null } });
    expect(mocks.calls.find(call => call.table === 'meal_checkins')?.filters).toEqual([['user_id', 'verified-user'], ['answered_at', null]]);
  });
  it('passes an optional search ID to the ownership-checked choice RPC', async () => {
    const searchId = '50af1120-c246-4f90-a1e3-cf838796255b';
    const response = await put(mealPut, '/api/meal', { restaurantId: place.id, searchId });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('choose_meal', { p_place_id: place.id, p_search_id: searchId });
  });
  it('does not reveal another account saved search through errors', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'private search owner diagnostic' } });
    const response = await put(mealPut, '/api/meal', { restaurantId: place.id });
    expect(response.status).toBe(404); expect(await response.text()).not.toContain('private search owner');
  });
});

describe('feedback and meal access', () => {
  it('requires verified sign-in on every read and write', async () => {
    mocks.session.mockRejectedValue(new HttpError(401, 'Sign in to continue.'));
    expect((await feedbackGet(new Request('http://localhost:3000/api/feedback'))).status).toBe(401);
    expect((await mealGet(new Request('http://localhost:3000/api/meal'))).status).toBe(401);
    expect((await put(feedbackPut, '/api/feedback', { restaurantId: place.id, sentiment: 'like' })).status).toBe(401);
    expect((await put(mealPut, '/api/meal', { restaurantId: place.id })).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects cross-site writes before reading the account', async () => {
    expect((await put(feedbackPut, '/api/feedback', { restaurantId: place.id, sentiment: 'like' }, 'https://other.example')).status).toBe(403);
    expect((await put(mealPut, '/api/meal', { restaurantId: place.id }, 'https://other.example')).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('keeps explicit fictional demo interactions out of live database clients', async () => {
    mocks.session.mockResolvedValue({ demo: true, user: { id: 'demo' }, client: null });
    expect((await put(mealPut, '/api/meal', { restaurantId: place.id })).status).toBe(200);
    expect((await put(feedbackPut, '/api/feedback', { restaurantId: place.id, sentiment: 'neutral', answerMeal: true })).status).toBe(200);
    expect(await (await mealGet(new Request('http://localhost:3000/api/meal'))).json()).toEqual({ pendingMeal: null });
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
