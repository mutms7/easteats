'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

export type AccountUser = { id: string; email?: string; name?: string; pendingEmail?: string | null };

export default function AccountDetails({ user, demo, onChange }: { user: AccountUser; demo: boolean; onChange: (user: AccountUser) => void }) {
  const [name, setName] = useState(user.name ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch('/api/account', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), email: email.trim() }), signal: controller.signal });
      const data = await response.json() as { user?: AccountUser; message?: string; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error ?? 'Account details could not be saved. Please retry.');
      if (controller.signal.aborted) return;
      onChange(data.user); setName(data.user.name ?? ''); setEmail(data.user.email ?? ''); setMessage(data.message ?? 'Account details saved.');
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Account details could not be saved. Please retry.'); }
    finally { pending.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="account-details" aria-labelledby="account-details-heading"><h2 id="account-details-heading">Personal details</h2>
    <form onSubmit={save}><fieldset disabled={busy || demo}><label htmlFor="account-name">Name<input id="account-name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required maxLength={100} /></label><label htmlFor="account-email">Email<input id="account-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} aria-describedby="account-email-help" /></label><p className="small" id="account-email-help">Email changes need confirmation. Your Google sign-in stays linked to your Google account.</p><button className="button primary" type="submit">{busy ? 'Saving details…' : 'Save account details'}</button></fieldset></form>
    {demo && <p className="small">Account details are read-only in the demo.</p>}
    {user.pendingEmail && <p className="small">Waiting for email confirmation: {user.pendingEmail}</p>}
    {error && <p className="home-address-error" role="alert">{error}</p>}{message && <p className="small" role="status">{message}</p>}
  </section>;
}
