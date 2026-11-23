import { cookies } from 'next/headers';
import { z } from 'zod';
import { authFailure as describeFailure, emailProblem, EMAIL_MAX, normalizeEmail, passwordProblem, type AuthMode } from '@/lib/account-rules';
import { appOrigin, configured } from './config';
import { HttpError } from './http';

// Email and password accounts live in Supabase Auth, the same user table as Google sign-in.
// Passwords are only ever forwarded to Supabase; they're never logged, stored, or echoed back.
// The rules themselves live in src/lib/account-rules.ts so the native app enforces the same ones.
const email = z.string().max(EMAIL_MAX + 20, 'Use an email under 254 characters.').transform(normalizeEmail).superRefine((value, context) => { const problem = emailProblem(value); if (problem) context.addIssue({ code: 'custom', message: problem }); });
const newPassword = z.string().superRefine((value, context) => { const problem = passwordProblem(value); if (problem) context.addIssue({ code: 'custom', message: problem }); });
const destination = z.enum(['/', '/delete-account']).catch('/');
export const signUpSchema = z.object({ name: z.string().trim().min(1, 'Add your name.').max(100, 'Use a name under 100 characters.'), email, password: newPassword, next: destination.optional() }).strict();
export const signInSchema = z.object({ email, password: z.string().min(1, 'Enter your password.').max(72, 'That email and password don’t match an account.'), next: destination.optional() }).strict();
export const resetSchema = z.object({ email }).strict();
export const newPasswordSchema = z.object({ password: newPassword }).strict();

export function safeDestination(value: unknown) { return value === '/delete-account' ? '/delete-account' : '/'; }

// A JSON content type can't be sent by a plain cross-site HTML form without a CORS preflight,
// so this closes login CSRF even when a browser omits the Origin header.
export function requireJsonRequest(request: Request) {
  if (!configured()) throw new HttpError(503, 'Account setup is incomplete.', 'UNAVAILABLE');
  const type = request.headers.get('content-type') ?? '';
  if (!/^application\/json(\s*;|$)/i.test(type)) throw new HttpError(415, 'Please send a valid request.', 'UNSUPPORTED_MEDIA');
}

const cookieBase = () => ({ httpOnly: true, secure: appOrigin().startsWith('https:'), sameSite: 'lax' as const, path: '/' });
// Remembers where to return after an emailed confirmation link, matching the Google flow.
export async function rememberReturn(next: string) { (await cookies()).set('east-eats-return-to', safeDestination(next), { ...cookieBase(), maxAge: 3600 }); }

// Set only by the callback after this browser's own recovery link is exchanged. The website only
// changes a password inside this window, so someone at a signed-in browser can't use East Eats to
// replace it. It isn't a defence against stolen session tokens, which can call Supabase directly;
// Supabase's "Secure password change" setting is what covers that.
export const RECOVERY_COOKIE = 'east-eats-recovery';
export async function startRecovery(userId: string) { (await cookies()).set(RECOVERY_COOKIE, userId, { ...cookieBase(), maxAge: 900 }); }
export async function recoveryUser() { return (await cookies()).get(RECOVERY_COOKIE)?.value ?? null; }
export async function endRecovery() { (await cookies()).delete(RECOVERY_COOKIE); }

export function authFailure(error: { code?: string; status?: number }, mode: AuthMode): never {
  const failure = describeFailure(error, mode);
  throw new HttpError(failure.status, failure.message, failure.code);
}
