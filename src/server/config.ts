export function configured() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); }
export function demoEnabled() { return process.env.EAST_EATS_DEMO === 'true' && process.env.NODE_ENV !== 'production'; }
export function appOrigin() { return new URL(process.env.APP_URL || 'http://localhost:3000').origin; }
export const DEMO_USER = '00000000-0000-4000-8000-000000000001';
