'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Location } from '@/lib/contracts';

export type LocationSuggestion = Location & {
  label: string;
  id?: string;
  primaryText?: string;
  secondaryText?: string;
  kind?: 'address' | 'street' | 'landmark' | 'area';
};
type Status = 'idle' | 'waiting' | 'loading' | 'ready' | 'error';

function Pin({ kind }: { kind?: LocationSuggestion['kind'] }) {
  return kind === 'address'
    ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 10 8-6 8 6v10h-6v-6h-4v6H4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
    : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.7" /></svg>;
}

function kindLabel(kind: LocationSuggestion['kind']): string {
  if (kind === 'address') return 'Address';
  if (kind === 'street') return 'Street';
  if (kind === 'landmark') return 'Place';
  if (kind === 'area') return 'Area';
  return 'Location';
}

export default function LocationSearch({ proximity, onSelect, onQueryChange, label = 'Address or area', hint = 'Street address, intersection, neighborhood, or city.' }: { proximity?: Location | null; onSelect: (location: LocationSuggestion) => void; onQueryChange?: () => void; label?: string; hint?: string }) {
  const id = useId();
  const inputId = `location-input-${id}`;
  const listId = `location-options-${id}`;
  const hintId = `location-hint-${id}`;
  const statusId = `location-status-${id}`;
  const container = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const version = useRef(0);
  const queryRef = useRef('');
  const selectedLabel = useRef<string | null>(null);
  const mounted = useRef(true);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<LocationSuggestion[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const cancel = useCallback(() => {
    version.current += 1;
    inFlight.current?.abort(); inFlight.current = null;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const lookup = useCallback(async (value: string) => {
    if (value.length < 3 || queryRef.current.trim() !== value) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const requestVersion = ++version.current;
    setStatus('loading'); setError(''); setActive(-1);
    try {
      const response = await fetch('/api/geocode', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: value, ...(proximity ? { proximity: { lat: proximity.lat, lng: proximity.lng } } : {}) }),
        signal: controller.signal,
      });
      const body = await response.json() as { items?: unknown; error?: unknown };
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Location search did not finish. Try again.');
      if (!Array.isArray(body.items)) throw new Error('Location results could not be read. Try again.');
      const suggestions = body.items.filter((item): item is LocationSuggestion => !!item && typeof item === 'object' && typeof item.label === 'string' && item.label.trim().length > 0 && Number.isFinite(item.lat) && Number.isFinite(item.lng) && Math.abs(item.lat) <= 90 && Math.abs(item.lng) <= 180).slice(0, 8);
      if (!mounted.current || controller.signal.aborted || version.current !== requestVersion || queryRef.current.trim() !== value) return;
      setItems(suggestions); setStatus('ready');
    } catch (e) {
      if (!mounted.current || controller.signal.aborted || version.current !== requestVersion) return;
      setItems([]); setStatus('error'); setError(e instanceof Error ? e.message : 'Location search did not finish. Try again.');
    }
  }, [proximity?.lat, proximity?.lng]);

  useEffect(() => {
    mounted.current = true;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) { setOpen(false); setActive(-1); }
    };
    document.addEventListener('pointerdown', outside);
    return () => { mounted.current = false; cancel(); document.removeEventListener('pointerdown', outside); };
  }, [cancel]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 3 || selectedLabel.current === query) return;
    timer.current = setTimeout(() => { void lookup(value); }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, lookup]);

  useEffect(() => {
    if (active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  function change(value: string) {
    onQueryChange?.();
    cancel(); queryRef.current = value; selectedLabel.current = null;
    setQuery(value); setItems([]); setActive(-1); setError('');
    setStatus(value.trim().length >= 3 ? 'waiting' : 'idle'); setOpen(value.trim().length >= 3);
  }
  function choose(item: LocationSuggestion) {
    cancel(); selectedLabel.current = item.label; queryRef.current = item.label;
    setQuery(item.label); setOpen(false); setActive(-1); setStatus('idle'); setError('');
    onSelect(item);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 3) { setStatus('error'); setError('Enter at least three characters to find an address or area.'); input.current?.focus(); return; }
    if (timer.current) clearTimeout(timer.current);
    setOpen(true); input.current?.focus(); void lookup(query.trim());
  }
  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { if (open) event.preventDefault(); setOpen(false); setActive(-1); return; }
    if (event.key === 'ArrowDown' && items.length) { event.preventDefault(); setOpen(true); setActive(index => open ? Math.min(index + 1, items.length - 1) : 0); return; }
    if (event.key === 'ArrowUp' && items.length) { event.preventDefault(); setOpen(true); setActive(index => open && index > 0 ? index - 1 : items.length - 1); return; }
    if (event.key === 'Enter' && open && active >= 0 && items[active]) { event.preventDefault(); choose(items[active]); }
  }

  const expanded = open && query.trim().length >= 3;
  const progress = status === 'waiting' || status === 'loading';
  const announcement = progress ? 'Finding matching addresses…' : status === 'ready' ? items.length ? `${items.length} matching locations. Choose one, or use the arrow keys and Enter.` : 'No matching locations. Try adding a city, postal code, or nearby intersection.' : '';
  return <form ref={container} className="location-search" onSubmit={submit}>
    <label htmlFor={inputId}>{label}</label>
    <p className="location-search-hint" id={hintId}>{hint}</p>
    <div className="location-search-row"><div className={`location-input-shell ${expanded ? 'is-open' : ''}`}>
      <span className="location-input-icon"><Pin /></span>
      <input ref={input} id={inputId} role="combobox" type="text" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" maxLength={150} value={query} aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? listId : undefined} aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined} aria-describedby={`${hintId} ${statusId}`} aria-busy={progress} onKeyDown={navigate} onChange={event => change(event.target.value)} onFocus={() => { if (query.trim().length >= 3 && selectedLabel.current !== query) setOpen(true); }} onClick={() => { if (query.trim().length >= 3 && selectedLabel.current !== query) setOpen(true); }} onBlur={event => { if (event.relatedTarget instanceof Node && !container.current?.contains(event.relatedTarget)) { setOpen(false); setActive(-1); } }} placeholder="123 King St N, Waterloo" />
      {query && <button className="location-clear" type="button" aria-label="Clear location" onMouseDown={event => event.preventDefault()} onClick={() => { change(''); input.current?.focus(); }}>×</button>}
      {expanded && <div className="location-suggestions"><ul id={listId} role="listbox" aria-label="Matching locations">{items.map((item, index) => {
        const parts = item.label.split(',').map(part => part.trim());
        const primary = typeof item.primaryText === 'string' && item.primaryText.trim() ? item.primaryText : parts[0];
        const secondary = typeof item.secondaryText === 'string' && item.secondaryText.trim() ? item.secondaryText : parts.slice(1).join(', ');
        const kind = kindLabel(item.kind);
        return <li id={`${listId}-${index}`} key={`${item.id ?? `${item.lat},${item.lng}`}-${index}`} role="option" tabIndex={-1} aria-label={item.label} aria-description={item.kind === 'street' ? 'Street-level location, not a specific building.' : item.kind === 'area' ? 'Area center, not a specific building.' : kind} aria-selected={active === index} onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}><span className="location-option-icon"><Pin kind={item.kind} /></span><span className="location-option-copy"><strong>{primary}</strong>{secondary && <span>{secondary}</span>}<span className="location-kind">{kind}{item.kind === 'street' ? ' · Street-level location' : item.kind === 'area' ? ' · Area center' : ''}</span></span></li>;
      })}</ul>{(progress || status === 'ready' && !items.length || status === 'error') && <div className="location-dropdown-feedback">{status === 'error' ? 'Location search is unavailable. Your address is still here; try Find area again.' : progress ? <><span className="location-loading-dot" aria-hidden="true" />Finding matching addresses…</> : 'No matches yet. Add a city or postal code and try again.'}</div>}</div>}
    </div><button className="button location-submit" type="submit" disabled={status === 'loading'}>{status === 'loading' ? 'Finding…' : 'Find area'}</button></div>
    <p id={statusId} className={`location-search-status ${status === 'error' ? 'is-error' : ''}`} role={status === 'error' ? 'alert' : 'status'} aria-live={status === 'error' ? 'assertive' : 'polite'} aria-atomic="true">{status === 'error' ? error : announcement}</p>
  </form>;
}
