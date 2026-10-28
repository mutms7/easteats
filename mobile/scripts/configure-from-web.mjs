import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
// Copy only three explicitly public variables. Server credentials never enter
// this process output or the native env file.
const values = {};
for (const name of ['.env', '.env.local']) {
  try { Object.assign(values, parseEnv(await readFile(new URL(`../../${name}`, import.meta.url), 'utf8'))); } catch { /* Either web env filename is optional. */ }
}
const mapping = {
  EXPO_PUBLIC_SUPABASE_URL: values.NEXT_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_MAPTILER_KEY: values.NEXT_PUBLIC_MAPTILER_KEY,
};
if (!mapping.EXPO_PUBLIC_SUPABASE_URL || !mapping.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) throw new Error('A public Supabase URL and publishable key are required in the local web env.');
let existing = '';
try { existing = await readFile(new URL('../.env', import.meta.url), 'utf8'); } catch { /* First-time setup. */ }
if (existing.trim()) throw new Error('mobile/.env already exists. Edit it directly to preserve your EAS settings.');
const lines = Object.entries({ EXPO_PUBLIC_API_ORIGIN: 'https://easteats.vercel.app', ...mapping, EXPO_PUBLIC_APPLE_AUTH_ENABLED: 'false' }).filter(([, value]) => value).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
await writeFile(new URL('../.env', import.meta.url), `${lines.join('\n')}\n`, { encoding: 'utf8', flag: 'wx' });
console.log('Created mobile/.env with public app configuration only. No secret values printed.');
