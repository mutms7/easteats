// Email account rules shared by the website and the native app. Dependency-free so Metro can bundle it.

export const PASSWORD_MIN = 8;
// Supabase hashes with bcrypt, which rejects anything past 72 bytes, so emoji and CJK count extra.
export const PASSWORD_MAX_BYTES = 72;
export const EMAIL_MAX = 254;

export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
export function emailProblem(value: string): string | null {
  const email = normalizeEmail(value);
  if (email.length > EMAIL_MAX) return 'Use an email under 254 characters.';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : 'Enter a valid email address.';
}
export function passwordProblem(value: string): string | null {
  if (value.length < PASSWORD_MIN) return `Use a password with at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) return 'That password is too long. Use 72 characters or fewer, or fewer emoji and non-Latin characters.';
  return null;
}

export type AuthMode = 'signup' | 'signin' | 'reset' | 'update';
export type AuthFailure = { status: number; code: string; message: string };
// Maps Supabase Auth errors to stable messages. Provider details never reach the person.
// Reset never mentions whether an account exists, so it can't be used to look up emails.
export function authFailure(error: { code?: string; status?: number }, mode: AuthMode): AuthFailure {
  const code = error.code ?? '';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error.status === 429) return { status: 429, code: 'RATE_LIMITED', message: 'Too many attempts. Wait a minute, then try again.' };
  if (mode !== 'signin' && code === 'weak_password') return { status: 400, code: 'WEAK_PASSWORD', message: 'Choose a stronger password, ideally a few words or a mix of letters, numbers and symbols.' };
  if (code === 'email_address_invalid') return { status: 400, code: 'VALIDATION', message: 'Enter a valid email address.' };
  if (code === 'signup_disabled' || code === 'email_provider_disabled') return { status: 403, code: 'PROVIDER_DISABLED', message: 'Email accounts aren’t available right now. Continue with Google instead.' };
  if (mode === 'signup' && code === 'user_already_exists') return { status: 409, code: 'ACCOUNT_EXISTS', message: 'That email may already have an account. Try signing in instead.' };
  if (mode === 'signin' && code === 'email_not_confirmed') return { status: 403, code: 'EMAIL_NOT_CONFIRMED', message: 'Confirm your email first. The link is in the message we sent you.' };
  if (mode === 'signin' && (code === 'invalid_credentials' || error.status === 400)) return { status: 401, code: 'INVALID_CREDENTIALS', message: 'That email and password don’t match an account.' };
  if (mode === 'update' && code === 'same_password') return { status: 400, code: 'SAME_PASSWORD', message: 'Choose a password you haven’t used for this account.' };
  if (mode === 'update' && (code === 'reauthentication_needed' || code === 'session_expired' || error.status === 401)) return { status: 403, code: 'RESET_EXPIRED', message: 'This reset link has expired. Request a new one to set your password.' };
  return { status: 503, code: 'UNAVAILABLE', message: 'We couldn’t reach account sign-in. Please try again.' };
}

// Supabase only applies its per-email send limit to emails that have an account, so a reset that hits
// it must look exactly like a sent link. Otherwise asking twice would reveal who's registered.
export function resetLooksSent(error: { code?: string } | null) { return !error || error.code === 'over_email_send_rate_limit'; }

// Starting another sign-in in the same browser or app replaces the saved PKCE verifier, so the emailed link stops working.
const LINK_TIP = 'Open it before signing in another way here, or the link won’t work.';
export function resetSentMessage(email: string, place: 'browser' | 'app') {
  return `If an account uses ${normalizeEmail(email)}, we sent a link to reset its password. ${LINK_TIP.replace('Open it', place === 'app' ? 'Open it on this phone' : 'Open it in this browser')}`;
}
export function confirmSentMessage(email: string, place: 'browser' | 'app') {
  return `If ${normalizeEmail(email)} is new to East Eats, we sent a confirmation link there. ${LINK_TIP.replace('Open it', place === 'app' ? 'Open it on this phone' : 'Open it in this browser')} Already have an account? Sign in instead.`;
}
export const LINK_FAILED_MESSAGE = 'Sign-in did not finish. Please try again. Email links only work where they were requested, and only until you start another sign-in there. If you just confirmed your email, your account is ready, so sign in with your password. If you were resetting your password, request a new link.';
