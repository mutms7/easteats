'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';

export type EmailMode = 'closed' | 'signup' | 'signin' | 'forgot';
type Result = { status?: 'signed-in' | 'confirm-email' | 'reset-sent'; destination?: string; message?: string; error?: string; code?: string };

// The password input with a show/hide toggle, shared by sign-up, sign-in and the reset page.
export function PasswordField({ id, label = 'Password', value, onChange, autoComplete, inputRef, describedBy, invalid }: { id: string; label?: string; value: string; onChange: (value: string) => void; autoComplete: 'new-password' | 'current-password'; inputRef?: RefObject<HTMLInputElement | null>; describedBy?: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return <div className="email-field"><label htmlFor={id}>{label}</label>
    <span className="password-field"><input ref={inputRef} id={id} name="password" type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} required minLength={autoComplete === 'new-password' ? 8 : 1} maxLength={72} aria-invalid={invalid || undefined} aria-describedby={describedBy || undefined} /><button type="button" className="text-button password-toggle" aria-label={show ? 'Hide password' : 'Show password'} aria-controls={id} onClick={() => setShow(current => !current)}>{show ? 'Hide' : 'Show'}</button></span>
  </div>;
}

const ENDPOINT = { signup: '/auth/signup', signin: '/auth/password', forgot: '/auth/reset' } as const;
const HEADING = { signup: 'Create your account', signin: 'Sign in with email', forgot: 'Reset your password' } as const;
const SUBMIT = { signup: ['Create account', 'Creating account…'], signin: ['Sign in', 'Signing in…'], forgot: ['Send reset link', 'Sending link…'] } as const;

// Email and password sign-up, an alternative to Google. New accounts continue to the same
// favorite restaurant questionnaire because the app boots from the fresh session afterwards.
export default function EmailAccount({ mode, onModeChange, onSignedIn, next = '/', focusKey = 0, openMode = 'signup', allowSignup = true }: { mode: EmailMode; onModeChange: (mode: EmailMode) => void; onSignedIn: (destination: string) => void | Promise<void>; next?: '/' | '/delete-account'; focusKey?: number; openMode?: 'signup' | 'signin'; allowSignup?: boolean }) {
  const id = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ message: string; after: 'confirm' | 'reset' } | null>(null);
  const pending = useRef(false);
  const firstField = useRef<HTMLInputElement>(null);
  const emailField = useRef<HTMLInputElement>(null);
  const passwordField = useRef<HTMLInputElement>(null);
  const sentMessage = useRef<HTMLDivElement>(null);
  const [errorFocus, setErrorFocus] = useState<{ field: 'email' | 'password'; tick: number } | null>(null);
  // After a failed attempt the fieldset re-enables, so return focus to the field that needs fixing.
  useEffect(() => { if (errorFocus) (errorFocus.field === 'email' ? emailField : passwordField).current?.focus(); }, [errorFocus]);
  useEffect(() => { if (sent) sentMessage.current?.focus(); }, [sent]);
  const [focusTick, setFocusTick] = useState(0);
  // Move focus into the form when someone opens it or switches mode, so keyboard and screen reader users land on the first field.
  useEffect(() => { if ((focusKey || focusTick) && mode !== 'closed') (mode === 'signup' ? firstField : emailField).current?.focus(); }, [focusKey, focusTick, mode]);

  function switchTo(value: EmailMode) { setError(''); setSent(null); setPassword(''); onModeChange(value); setFocusTick(tick => tick + 1); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || mode === 'closed') return;
    pending.current = true; setBusy(true); setError(''); setSent(null);
    try {
      const body = mode === 'signup' ? { name: name.trim(), email: email.trim(), password, next } : mode === 'signin' ? { email: email.trim(), password, next } : { email: email.trim() };
      const response = await fetch(ENDPOINT[mode], { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({})) as Result;
      if (!response.ok) {
        if (data.code === 'ACCOUNT_EXISTS') { setPassword(''); onModeChange('signin'); }
        throw new Error(data.error ?? 'That didn’t go through. Please try again.');
      }
      setPassword('');
      if (data.status === 'confirm-email' || data.status === 'reset-sent') { setSent({ message: data.message ?? 'Check your email for a link.', after: data.status === 'reset-sent' ? 'reset' : 'confirm' }); return; }
      await onSignedIn(data.destination === '/delete-account' ? '/delete-account' : '/');
    } catch (e) { const message = e instanceof Error ? e.message : 'That didn’t go through. Please try again.'; setError(message); setErrorFocus(current => ({ field: mode === 'forgot' || /valid email|email under/i.test(message) ? 'email' : 'password', tick: (current?.tick ?? 0) + 1 })); }
    finally { pending.current = false; setBusy(false); }
  }

  if (mode === 'closed') return <button type="button" className="button email-open" onClick={() => switchTo(openMode)}>{openMode === 'signup' ? 'Sign up with email' : 'Sign in with email'}</button>;
  const signup = mode === 'signup';
  const emailError = Boolean(error) && errorFocus?.field === 'email';
  const passwordError = Boolean(error) && errorFocus?.field === 'password';
  return <section className="email-account" aria-labelledby={`${id}-heading`}>
    <div className="email-divider" aria-hidden="true"><span>or use email</span></div>
    <h2 id={`${id}-heading`} className="email-heading">{HEADING[mode]}</h2>
    {mode === 'forgot' && !sent && <p className="small email-help-intro">Enter the email you signed up with and we’ll send you a link to choose a new password.</p>}
    {sent ? <div className="email-sent" role="status" tabIndex={-1} ref={sentMessage}><p>{sent.message}</p><button type="button" className="text-button" onClick={() => switchTo('signin')}>{sent.after === 'confirm' ? 'I’ve confirmed, sign me in' : 'Back to sign in'}</button></div> :
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        {signup && <div className="email-field"><label htmlFor={`${id}-name`}>Name</label><input ref={firstField} id={`${id}-name`} name="name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required maxLength={100} /></div>}
        <div className="email-field"><label htmlFor={`${id}-email`}>Email</label><input ref={emailField} id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete={signup ? 'email' : 'username'} autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} aria-invalid={emailError || undefined} aria-describedby={emailError ? `${id}-error` : undefined} /></div>
        {mode !== 'forgot' && <PasswordField id={`${id}-password`} value={password} onChange={setPassword} autoComplete={signup ? 'new-password' : 'current-password'} inputRef={passwordField} invalid={passwordError} describedBy={[signup ? `${id}-password-help` : '', passwordError ? `${id}-error` : ''].filter(Boolean).join(' ')} />}
        {signup && <p className="small email-help" id={`${id}-password-help`}>At least 8 characters.</p>}
        {mode === 'signin' && <p className="email-forgot"><button type="button" className="text-button" onClick={() => switchTo('forgot')}>Forgot password?</button></p>}
        {error && <p className="message error" role="alert" id={`${id}-error`}>{error}</p>}
        <button className="button primary email-submit" type="submit">{SUBMIT[mode][busy ? 1 : 0]}</button>
      </fieldset>
    </form>}
    {mode === 'forgot' ? !sent && <p className="email-switch small">Remembered it? <button type="button" className="text-button" onClick={() => switchTo('signin')}>Back to sign in</button></p>
      : allowSignup && <p className="email-switch small">{signup ? 'Already have an account? ' : 'New to East Eats? '}<button type="button" className="text-button" onClick={() => switchTo(signup ? 'signin' : 'signup')}>{signup ? 'Sign in' : 'Create an account'}</button></p>}
  </section>;
}
