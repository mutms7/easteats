import { authFailure, confirmSentMessage, emailProblem, normalizeEmail, passwordProblem, resetLooksSent, resetSentMessage, type AuthMode } from '../../src/lib/account-rules.ts';

// Email account actions for the native app. The Supabase client is passed in, so this file has no
// Expo imports and runs under the plain Node test runner. Rules and messages match the website.
type AuthError = { code?: string; status?: number } | null;
export type EmailAuthClient = {
  signUp(input: { email: string; password: string; options: { emailRedirectTo: string; data: { full_name: string } } }): Promise<{ data: { session: unknown | null }; error: AuthError }>;
  signInWithPassword(input: { email: string; password: string }): Promise<{ data: { session: unknown | null }; error: AuthError }>;
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{ error: AuthError }>;
  updateUser(input: { password: string }): Promise<{ error: AuthError }>;
  signOut(options: { scope: 'others' }): Promise<{ error: AuthError }>;
};
export type EmailResult = { status: 'signed-in' } | { status: 'sent'; message: string };
// Carries the stable code (for example ACCOUNT_EXISTS) so the screen can react, like the website does.
export class EmailAuthError extends Error { code: string; constructor(message: string, code = 'VALIDATION') { super(message); this.code = code; } }

function check(problem: string | null) { if (problem) throw new EmailAuthError(problem); }
function fail(error: NonNullable<AuthError>, mode: AuthMode): never { const failure = authFailure(error, mode); throw new EmailAuthError(failure.message, failure.code); }

export async function signUpWithEmail(client: EmailAuthClient, redirect: string, input: { name: string; email: string; password: string }): Promise<EmailResult> {
  const name = input.name.trim();
  if (!name) throw new EmailAuthError('Add your name.');
  if (name.length > 100) throw new EmailAuthError('Use a name under 100 characters.');
  check(emailProblem(input.email)); check(passwordProblem(input.password));
  const email = normalizeEmail(input.email);
  // The confirmation link opens the app's PKCE callback, so it only finishes on this phone.
  const { data, error } = await client.signUp({ email, password: input.password, options: { emailRedirectTo: redirect, data: { full_name: name } } });
  if (error) fail(error, 'signup');
  if (data.session) return { status: 'signed-in' };
  return { status: 'sent', message: confirmSentMessage(email, 'app') };
}

export async function signInWithEmail(client: EmailAuthClient, input: { email: string; password: string }): Promise<EmailResult> {
  check(emailProblem(input.email));
  if (!input.password) throw new EmailAuthError('Enter your password.');
  const { data, error } = await client.signInWithPassword({ email: normalizeEmail(input.email), password: input.password });
  if (error) fail(error, 'signin');
  if (!data.session) throw new EmailAuthError('We couldn’t reach account sign-in. Please try again.', 'UNAVAILABLE');
  return { status: 'signed-in' };
}

// Same answer whether or not the email has an account, so it can't be used to look people up.
export async function requestPasswordReset(client: EmailAuthClient, redirect: string, rawEmail: string): Promise<EmailResult> {
  check(emailProblem(rawEmail));
  const { error } = await client.resetPasswordForEmail(normalizeEmail(rawEmail), { redirectTo: redirect });
  if (!resetLooksSent(error)) fail(error!, 'reset');
  return { status: 'sent', message: resetSentMessage(rawEmail, 'app') };
}

// Only reachable after Supabase reports a PASSWORD_RECOVERY sign-in from this phone's own reset link.
export async function setNewPassword(client: EmailAuthClient, password: string) {
  check(passwordProblem(password));
  const { error } = await client.updateUser({ password });
  if (error) fail(error, 'update');
  // Best effort: the new password is already saved even if other sessions can't be revoked right now.
  await client.signOut({ scope: 'others' }).catch(() => undefined);
}
