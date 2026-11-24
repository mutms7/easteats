// Local preview with the real sign-in (Google and email) from the Vercel-pulled .env.production.local.
// Paid providers are blanked so browsing locally can't start Apify scrapes or Anthropic calls.
// Never prints a value.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const port = process.argv[2] || '3310';
const wanted = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'NEXT_PUBLIC_MAPTILER_KEY'];
const env = { ...process.env };
for (const line of readFileSync('.env.production.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match || !wanted.includes(match[1])) continue;
  env[match[1]] = match[2].replace(/^"(.*)"$/, '$1').replace(/\\n$/, '');
}
const missing = wanted.slice(0, 2).filter(name => !env[name]);
if (missing.length) { console.error(`Missing ${missing.join(', ')} in .env.production.local (run vercel env pull).`); process.exit(1); }
Object.assign(env, { APP_URL: `http://127.0.0.1:${port}`, EAST_EATS_DEMO: 'false', NEXT_TELEMETRY_DISABLED: '1', APIFY_TOKEN: '', ANTHROPIC_API_KEY: '' });
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', port], { env, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 0));
