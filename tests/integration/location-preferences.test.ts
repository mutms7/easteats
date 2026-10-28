import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ session: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), upsert: vi.fn(), delete: vi.fn() }));
vi.mock('@/server/session', () => ({ requireSession: mock.session }));
import { GET, PUT } from '@/app/api/location/route';
import { HttpError } from '@/server/http';
const home = { lat: 43.4723, lng: -80.5449, label: '200 University Ave W, Waterloo' };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('APP_URL', 'http://localhost:3000');
  const chain = { select: mock.select, eq: mock.eq, maybeSingle: mock.maybeSingle, upsert: mock.upsert, delete: mock.delete };
  mock.from.mockReturnValue(chain); mock.select.mockReturnValue(chain); mock.eq.mockReturnValue(chain); mock.delete.mockReturnValue(chain);
  mock.maybeSingle.mockResolvedValue({ data: { home_address: home }, error: null });
  mock.upsert.mockResolvedValue({ error: null });
  // DELETE queries are thenable in supabase-js, unlike the fixture chain.
  Object.assign(chain, { then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) });
  mock.session.mockResolvedValue({ demo: false, user: { id: 'current-user' }, client: { from: mock.from } });
});
afterEach(() => vi.unstubAllEnvs());
const save = (body: unknown, origin = 'http://localhost:3000') => PUT(new Request('http://localhost:3000/api/location', { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));

it('reads only the current account and never permits shared response caching', async () => {
  const response = await GET(new Request('http://localhost:3000/api/location'));
  expect(await response.json()).toEqual({ homeAddress: home });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mock.from).toHaveBeenCalledWith('location_preferences'); expect(mock.eq).toHaveBeenCalledWith('user_id', 'current-user');
});
it('saves only an explicitly chosen address under the verified account', async () => {
  expect(await (await save({ homeAddress: home })).json()).toEqual({ homeAddress: home });
  expect(mock.upsert).toHaveBeenCalledWith({ user_id: 'current-user', home_address: home }, { onConflict: 'user_id' });
});
it('clears the verified account address without touching another account', async () => {
  expect(await (await save({ homeAddress: null })).json()).toEqual({ homeAddress: null });
  expect(mock.delete).toHaveBeenCalledOnce(); expect(mock.eq).toHaveBeenCalledWith('user_id', 'current-user');
});
it.each([{ homeAddress: { ...home, lat: 91 } }, { homeAddress: { ...home, label: '' } }, { homeAddress: { ...home, user_id: 'other-user' } }, { homeAddress: home, user_id: 'other-user' }, {}])('rejects invalid or account-targeting input before writes: %j', async body => {
  expect((await save(body)).status).toBe(400); expect(mock.upsert).not.toHaveBeenCalled(); expect(mock.delete).not.toHaveBeenCalled();
});
it('requires sign-in for address reads and saves', async () => {
  mock.session.mockRejectedValue(new HttpError(401, 'Sign in to continue.'));
  expect((await GET(new Request('http://localhost:3000/api/location'))).status).toBe(401);
  expect((await save({ homeAddress: home })).status).toBe(401); expect(mock.from).not.toHaveBeenCalled();
});
it('rejects cross-site mutations before reading the account', async () => {
  expect((await save({ homeAddress: home }, 'https://other.example')).status).toBe(403);
  expect(mock.session).not.toHaveBeenCalled(); expect(mock.from).not.toHaveBeenCalled();
});
it('reports a failed save without claiming the address persisted', async () => {
  mock.upsert.mockResolvedValue({ error: new Error('private diagnostic') });
  const response = await save({ homeAddress: home }); expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private diagnostic');
});
