import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refresh page-navigation sessions before any parallel account requests begin.
// API routes still verify their own user; this never authorizes a request.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const client = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(values) {
      for (const { name, value } of values) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of values) response.cookies.set(name, value, options);
    },
  } });
  await client.auth.getUser();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/', '/about', '/privacy', '/delete-account'] };
