'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Location, SavedLocation } from '@/lib/contracts';
import LocationSearch from './LocationSearch';

export default function HomeAddress({ value, onChange, proximity, locating = false }: { locating?: boolean; proximity?: Location | null; value: SavedLocation | null; onChange: (value: SavedLocation | null) => void }) {
  const heading = useId();
  const [editing, setEditing] = useState(!value); const [candidate, setCandidate] = useState<SavedLocation | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null); const pending = useRef(false);
  useEffect(() => () => request.current?.abort(), []);
  async function save(next: SavedLocation | null) {
    if (pending.current) return; pending.current = true;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/location', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ homeAddress: next }), signal: controller.signal });
      const data = await response.json() as { homeAddress?: SavedLocation | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Home address could not be saved. Please retry.');
      if (controller.signal.aborted) return;
      onChange(data.homeAddress ?? null); setCandidate(null); setEditing(!data.homeAddress); setMessage(data.homeAddress ? 'Home address saved.' : 'Home address cleared.');
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Home address could not be saved. Please retry.'); }
    finally { pending.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="home-address" aria-labelledby={heading}><h2 id={heading}>Home address <span>(optional)</span></h2><p className="small">Where should each new search start? Save your home address here. You can change it anytime in Account.</p>
    {value && <div className="home-address-saved"><span className="home-address-label">Saved home</span><p>{value.label}</p><div className="inline-actions"><button className="button" type="button" disabled={busy} onClick={() => { setEditing(true); setCandidate(null); setMessage(''); }}>Change home address</button><button className="text-button" type="button" disabled={busy} onClick={() => { void save(null); }}>Clear home address</button></div></div>}
    {editing && <><LocationSearch disabled={locating} key={value?.label ?? 'new'} proximity={proximity ?? value} label="Home address" hint="Choose the full address you want to save. This does not start a restaurant search." onQueryChange={() => setCandidate(null)} onSelect={area => { setCandidate({ lat: area.lat, lng: area.lng, label: area.label }); setError(''); }} />{candidate && <p className="small home-address-candidate">Selected: {candidate.label}</p>}<div className="inline-actions"><button className="button" type="button" disabled={!candidate || busy} onClick={() => { if (candidate) void save(candidate); }}>{busy ? 'Saving address...' : 'Save home address'}</button>{value && <button className="text-button" type="button" disabled={busy} onClick={() => { setEditing(false); setCandidate(null); }}>Cancel address change</button>}</div></>}
    {error && <p className="home-address-error" role="alert">{error}</p>}{message && <p className="small" role="status">{message}</p>}
  </section>;
}
