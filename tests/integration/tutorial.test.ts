import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), updateUser: vi.fn() }));
vi.mock('@/server/session', () => ({ requireSession: mocks.session }));
import { PUT } from '@/app/api/tutorial/route';
import { HttpError } from '@/server/http';

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('APP_URL', 'https://easteats.example');
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.session.mockResolvedValue({ user: { id: 'verified-user' }, demo: false, client: { auth: { updateUser: mocks.updateUser } } });
});
afterEach(() => vi.unstubAllEnvs());
const finish = (origin = 'https://easteats.example') => PUT(new Request('https://easteats.example/api/tutorial', { method: 'PUT', headers: { Origin: origin } }));

it('records tutorial completion only through the authenticated user and prevents response caching', async () => {
  const response = await finish();
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ completed: true });
  expect(mocks.updateUser).toHaveBeenCalledExactlyOnceWith({ data: { east_eats_tutorial_completed: true } });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('requires sign-in and rejects cross-site completion before account access', async () => {
  expect((await finish('https://other.example')).status).toBe(403);
  expect(mocks.session).not.toHaveBeenCalled();
  mocks.session.mockRejectedValue(new HttpError(401, 'Sign in to continue.'));
  expect((await finish()).status).toBe(401); expect(mocks.updateUser).not.toHaveBeenCalled();
});
it('reports a failed completion without claiming the preference was saved or exposing provider details', async () => {
  mocks.updateUser.mockResolvedValue({ error: new Error('private provider diagnostic') });
  const response = await finish(); expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private provider diagnostic');
});
it('lets demo users finish without changing any real account', async () => {
  mocks.session.mockResolvedValue({ user: { id: 'demo-user' }, demo: true, client: null });
  expect((await finish()).status).toBe(200); expect(mocks.updateUser).not.toHaveBeenCalled();
});
