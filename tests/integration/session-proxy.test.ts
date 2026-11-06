import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ factory: vi.fn(), getUser: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.factory }));
import { proxy } from '@/proxy';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
});
afterEach(() => vi.unstubAllEnvs());

it('forwards refreshed credentials to both the page request and browser with cookie protections intact', async () => {
  mocks.factory.mockImplementation((_url, _key, options) => ({ auth: { getUser: async () => {
    mocks.getUser();
    expect(options.cookies.getAll()).toContainEqual(expect.objectContaining({ name: 'session', value: 'old-token' }));
    options.cookies.setAll([{ name: 'session', value: 'new-token', options: { path: '/', httpOnly: true, sameSite: 'lax', secure: true } }]);
    return { data: { user: { id: 'verified-user' } }, error: null };
  } } }));
  const request = new NextRequest('https://easteats.example/', { headers: { cookie: 'session=old-token' } });
  const response = await proxy(request);
  expect(mocks.getUser).toHaveBeenCalledOnce();
  expect(request.cookies.get('session')?.value).toBe('new-token');
  expect(response.headers.get('x-middleware-request-cookie')).toContain('session=new-token');
  expect(response.cookies.get('session')).toMatchObject({ value: 'new-token', httpOnly: true, sameSite: 'lax', secure: true });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('keeps public pages reachable without configured account credentials', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  const response = await proxy(new NextRequest('https://easteats.example/privacy'));
  expect(response.status).toBe(200); expect(mocks.factory).not.toHaveBeenCalled();
});
