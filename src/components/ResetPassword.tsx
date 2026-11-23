'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { PasswordField } from './EmailAccount';

// The page a reset link lands on. The server only accepts the change for the account that opened
// its own reset link in this browser in the last 15 minutes.
export default function ResetPassword() {
  const [state, setState] = useState<'checking' | 'ready' | 'signed-out' | 'expired' | 'done'>('checking');
  const [leaving, setLeaving] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const done = useRef<HTMLDivElement>(null);
  const [errorTick, setErrorTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/session', { credentials: 'same-origin', signal: controller.signal }).then(response => response.ok ? response.json() : Promise.reject(new Error('session'))).then(async data => { if (!data.user) { setState('signed-out'); return; } setEmail(data.user.email ?? ''); const recovery = await fetch('/auth/update-password', { credentials: 'same-origin', signal: controller.signal }).then(response => response.ok ? response.json() : { active: false }); setState(recovery.active ? 'ready' : 'expired'); }).catch(() => { if (!controller.signal.aborted) setState('signed-out'); });
    return () => controller.abort();
  }, []);
  useEffect(() => { if (state === 'ready') field.current?.focus(); if (state === 'done') done.current?.focus(); }, [state]);
  useEffect(() => { if (errorTick) field.current?.focus(); }, [errorTick]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/auth/update-password', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await response.json().catch(() => ({})) as { status?: string; error?: string; code?: string };
      if (response.status === 403 && data.code === 'RESET_EXPIRED') { setState('expired'); return; }
      if (!response.ok || data.status !== 'password-updated') throw new Error(data.error ?? 'Your password wasn’t changed. Please try again.');
      setPassword(''); setState('done');
    } catch (e) { setError(e instanceof Error ? e.message : 'Your password wasn’t changed. Please try again.'); setErrorTick(tick => tick + 1); }
    finally { setBusy(false); }
  }
  if (state === 'checking') return <p role="status">Checking your reset link…</p>;
  if (state === 'expired') return <div><p>This reset link has expired. To get a new one, sign out here and use Forgot password on the sign-in screen.</p><p><button type="button" className="button primary" disabled={leaving} onClick={async () => { setLeaving(true); try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }); } finally { window.location.assign('/'); } }}>{leaving ? 'Signing out…' : 'Sign out and request a new link'}</button></p></div>;
  if (state === 'signed-out') return <div><p>This reset link has expired, or it was opened in a different browser from the one that asked for it.</p><p><Link className="button primary" href="/">Request a new link</Link></p></div>;
  if (state === 'done') return <div role="status" tabIndex={-1} ref={done} className="reset-done"><p>Your password is changed, and any other devices using the old one have been signed out.</p><p><Link className="button primary" href="/">Continue to East Eats</Link></p></div>;
  return <form onSubmit={submit} className="email-account reset-form"><fieldset disabled={busy}>
    {email && <p>Choose a new password for {email}.</p>}
    <input type="email" name="email" autoComplete="username" value={email} readOnly className="sr-only" tabIndex={-1} aria-hidden="true" />
    <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" inputRef={field} invalid={Boolean(error)} describedBy={['new-password-help', error ? 'new-password-error' : ''].filter(Boolean).join(' ')} />
    <p className="small email-help" id="new-password-help">At least 8 characters.</p>
    {error && <p className="message error" role="alert" id="new-password-error">{error}</p>}
    <button className="button primary email-submit" type="submit">{busy ? 'Saving password…' : 'Save new password'}</button>
  </fieldset></form>;
}
