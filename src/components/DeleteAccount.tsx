'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { goalDraftKey } from './ui-helpers';

export default function DeleteAccount() {
  const [user, setUser] = useState<{id:string;email?:string}|null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/session', { credentials:'same-origin', signal:controller.signal }).then(async response => { if (!response.ok) throw new Error('We could not check your sign-in. Refresh and try again.'); return response.json(); }).then(data => setUser(data.user)).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'We could not check your sign-in.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function remove(event:FormEvent) {
    event.preventDefault(); if (!user || !confirmed || busy) return;
    setBusy(true);setError('');
    try {
      const response = await fetch('/api/account',{method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE'})});
      const data = await response.json();
      if (!response.ok || data.deleted !== true) throw new Error(data.error || 'Your account could not be deleted. Please try again.');
      try { localStorage.removeItem(`east-eats:taste:${user.id}`); localStorage.removeItem(goalDraftKey(user.id)); } catch { /* The server deletion has already completed. */ }
      setDeleted(true);setUser(null);
    } catch(cause) { setError(cause instanceof Error ? cause.message : 'Your account could not be deleted.'); }
    finally { setBusy(false); }
  }
  if (deleted) return <div role="status"><h2>Your account is deleted.</h2><p>Your profile, favorite notes, home address, and saved places have been removed.</p><Link href="/" className="button">Back to EastEats</Link></div>;
  return <>
    {loading && <p role="status">Checking your sign-in...</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !user && <p><Link href="/auth/login?next=/delete-account" className="button primary">Sign in to delete your account</Link></p>}
    {user && <form onSubmit={remove}>
      <p>Signed in{user.email ? ` as ${user.email}` : ''}.</p>
      <label className="account-delete-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I understand this permanently removes my EastEats account, preferences, home address, and saved places.</span></label>
      <button className="button primary" type="submit" disabled={!confirmed || busy}>{busy ? 'Deleting account...' : 'Delete my account'}</button>
    </form>}
  </>;
}
