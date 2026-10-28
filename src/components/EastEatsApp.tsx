'use client';

import dynamic from 'next/dynamic';
import FieldGuideHero from './FieldGuideHero';
import LocationSearch from './LocationSearch';
import HomeAddress from './HomeAddress';
import MatchInsights from './MatchInsights';
import { classifyRestaurant, CUISINES, FOOD_TYPES } from '@/lib/food-taxonomy';
import HomepageDemo from './HomepageDemo';
import SiteFooter from './SiteFooter';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { DiscoverInput, DiscoverResponse, Favorite, Location, RankedRestaurant, RefreshJob, Restaurant, SavedLocation, TasteInput, TasteProfile } from '@/lib/contracts';
import { parseTasteGoal, TASTE_GOAL_OPTIONS, type TasteGoal } from '@/lib/taste-goals';
import { authNotice, distanceLabel, favoriteFromRestaurant, goalDraftKey, mergeDiscoveryResults, parseDraft, parseGoalDraft, priceLabel, REASONS, safeExternalUrl, toggleReason, validFavorites } from './ui-helpers';

const RestaurantMap = dynamic(() => import('./RestaurantMap'), { ssr: false, loading: () => <div className="empty">Loading map…</div> });
type Session = { user: { id: string; email?: string } | null; configured: boolean; demo: boolean; dataMode: 'live' | 'demo'; profile: TasteProfile | null; answers: TasteInput | null; personalized?:boolean; warning?:string; homeAddress?: SavedLocation | null };
type Stage = 'loading' | 'login' | 'questionnaire' | 'interpretation' | 'location' | 'explore' | 'saved';
type FavoriteSearch = { id: number; searchId: string; query: string; city: string; startedAt: number; phase: 'searching' | 'complete' | 'stopped' };
type FavoriteSearchJob = { search: FavoriteSearch; job: RefreshJob };
type DiscoveryIntent = { id: string; input: DiscoverInput & { searchId: string }; startedAt: number };
type DiscoveryPayload = DiscoverResponse & { searchPhase?: 'places' | 'reviews' | 'complete'; enrichmentJob?: RefreshJob | null };
type DiscoveryJob = { job: RefreshJob; intent: DiscoveryIntent; phase: 'places' | 'reviews' };
const BAY_AREAS = [{ label: 'Berkeley', lat: 37.8715, lng: -122.273 }, { label: 'Oakland', lat: 37.8044, lng: -122.2712 }, { label: 'San Francisco', lat: 37.7749, lng: -122.4194 }];

async function request<T>(url: string, body?: unknown, method?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: method ?? (body === undefined ? 'GET' : 'POST'), credentials: 'same-origin', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { throw new Error('The response could not be read. Please try again.'); }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'That did not finish. Please try again.');
  return data as T;
}

function Bowl({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 120 100" fill="none" aria-hidden="true"><path d="M18 47h84c-3 26-18 37-42 37S21 73 18 47Z" fill="currentColor"/><path d="M25 57h70M40 88h40" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/><path d="M42 14c-12 12 10 14 0 25m21-29c-12 12 10 14 0 25m20-18c-12 12 10 14 0 25" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/></svg>;
}

function RestaurantPhoto({ restaurant }: { restaurant: Restaurant }) {
  const [failed, setFailed] = useState(false);
  const image = safeExternalUrl(restaurant.imageUrl);
  return image && !failed ? <img className="restaurant-photo" src={image} alt={`Food at ${restaurant.name}`} loading="lazy" onError={() => setFailed(true)} /> : <div className="restaurant-photo photo-fallback"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M9 14h8l3-4h8l3 4h8v23H9z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><circle cx="24" cy="25" r="7" stroke="currentColor" strokeWidth="2"/></svg><span>Photo unavailable</span></div>;
}

function RestaurantTags({ restaurant }: { restaurant: Restaurant }) {
  const tags = classifyRestaurant(restaurant);
  return <div className="restaurant-tags" aria-label="Cuisine and food types">{tags.cuisines.map(cuisine => <span key={`c-${cuisine}`}>{cuisine}</span>)}{tags.foodTypes.map(id => <span className="food-tag" key={`f-${id}`}>{FOOD_TYPES.find(food => food.id === id)?.label ?? id}</span>)}</div>;
}

function Details({ item, saved, saving, onSave, onClose }: { item: RankedRestaurant; saved: boolean; saving: boolean; onSave: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const r = item.restaurant;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, textarea, select') ?? []);
      if (!nodes.length) { event.preventDefault(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, [onClose]);
  return <div className="dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title" tabIndex={-1} ref={dialog}>
    <button className="button close-dialog" onClick={onClose} aria-label="Close restaurant details">Close ×</button>
    <RestaurantPhoto restaurant={r} /><div className="detail-content"><p className="eyebrow">{r.cuisines.join(' · ') || 'Cuisine details pending'} · {r.city}</p><h2 id="detail-title">{r.name}</h2><p>{r.address}</p>
    <div className="inline-actions"><button className="button primary" onClick={onSave} aria-pressed={saved} disabled={saving}>{saving ? 'Saving…' : saved ? 'Saved' : 'Save this place'}</button><a className="button" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.address)}&destination_place_id=${encodeURIComponent(r.id)}`} target="_blank" rel="noreferrer">Get directions ↗</a></div>
    <section className="field-note"><MatchInsights item={item} expanded /></section>
    <div className="details-grid"><section><h3>Dishes to explore</h3><p>{r.features?.dishes.length ? r.features.dishes.join(', ') : 'We do not have enough dish information yet.'}</p></section><section><h3>Listed hours</h3>{r.hours.length ? <ul>{r.hours.map((hour, index) => <li key={index}>{hour}</li>)}</ul> : <p>Hours are unavailable. Check with the restaurant before visiting.</p>}<p className="small">Details checked {new Date(r.fetchedAt).toLocaleDateString()}. Hours can change.</p></section></div>
    <section><h3>What the reviews say</h3>{r.features?.evidence.length ? r.features.evidence.map(evidence => <blockquote key={`${evidence.id}-${evidence.aspect}`} className={evidence.aspect === 'cleanliness' ? 'concern' : ''}><span className="eyebrow">{evidence.aspect === 'cleanliness' ? 'Reported cleanliness concern' : evidence.aspect}</span><p>{evidence.text}</p>{safeExternalUrl(evidence.sourceUrl) && <a href={safeExternalUrl(evidence.sourceUrl)} target="_blank" rel="noreferrer">Review source ↗</a>}</blockquote>) : <p>There is not enough review evidence to explain this place yet.</p>}</section>
    <p className="small">Google rating: {r.googleRating ?? 'Unavailable'}{r.googleRating !== null ? '/5' : ''} · {r.reviewCount} reviews. Your recommendation order uses your tastes and food evidence.</p>
    {safeExternalUrl(r.sourceUrl) && <a href={safeExternalUrl(r.sourceUrl)} target="_blank" rel="noreferrer">View the Google Maps listing ↗</a>}
    </div></div></div>;
}

export default function EastEatsApp() {
  const [stage, setStage] = useState<Stage>('loading');
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const locationOperation = useRef(0);
  const [session, setSession] = useState<Session | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [goal, setGoal] = useState<TasteGoal>('balanced');
  const [draftReady, setDraftReady] = useState(false);
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [personalized, setPersonalized] = useState(true);
  const [correction, setCorrection] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [searchName, setSearchName] = useState('');
  const [searchCity, setSearchCity] = useState('');
  const [searchResults, setSearchResults] = useState<Restaurant[] | null>(null);
  const [favoriteSearch, setFavoriteSearch] = useState<FavoriteSearch | null>(null);
  const [favoriteJob, setFavoriteJob] = useState<FavoriteSearchJob | null>(null);
  const favoriteSearchId = useRef(0);
  const favoriteRequest = useRef<AbortController | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [areaLabel, setAreaLabel] = useState('Nearby');
  const [homeAddress, setHomeAddress] = useState<SavedLocation | null>(null);
  const locationChoice = useRef<'home' | 'manual' | 'gps' | null>(null);
  const [filters, setFilters] = useState({ radiusKm: 5, mode: 'for-you' as 'for-you' | 'fusion', cuisine: '', foodType: '', query: '', maxPrice: 4 });
  const [queryDraft, setQueryDraft] = useState('');
  const [results, setResults] = useState<DiscoverResponse | null>(null);
  const [pendingResults, setPendingResults] = useState<DiscoverResponse | null>(null);
  const [discoveryIntent, setDiscoveryIntent] = useState<DiscoveryIntent | null>(null);
  const activeDiscovery = useRef<DiscoveryIntent | null>(null);
  const [discoveryJob, setDiscoveryJob] = useState<DiscoveryJob | null>(null);
  const [discoveryPhase, setDiscoveryPhase] = useState<'idle' | 'places' | 'reviews' | 'complete' | 'stopped'>('idle');
  const appliedResults = useRef<DiscoverResponse | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<Restaurant[]>([]);
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const savingRef = useRef(new Set<string>());
  const [selected, setSelected] = useState<RankedRestaurant | null>(null);
  const mounted = useRef(true);
  const bootVersion = useRef(0);

  const boot = useCallback(async () => {
    const version = ++bootVersion.current;
    setError('');
    try {
      const data = await request<Session>('/api/session');
      if (!mounted.current || version !== bootVersion.current) return;
      setSession(data); setProfile(data.profile); setPersonalized(data.personalized ?? true); if(data.warning)setNotice(data.warning);
      let draft: Favorite[] | null = null;
      let goalDraft: TasteGoal | undefined;
      if (data.user) {
        try {
          draft = parseDraft(localStorage.getItem(`east-eats:taste:${data.user.id}`));
          goalDraft = parseGoalDraft(localStorage.getItem(goalDraftKey(data.user.id)));
        } catch { /* Saved answers still work when browser storage is unavailable. */ }
      }
      setGoal(goalDraft ?? parseTasteGoal(data.answers?.goal) ?? 'balanced');
      setFavorites(draft ?? data.answers?.favorites ?? []); setDraftReady(true);
      const home = data.user ? data.homeAddress ?? null : null;
      setHomeAddress(home); locationChoice.current = home ? 'home' : null;
      setLocation(home); setAreaLabel(home?.label ?? 'Nearby');
      if (data.user && data.profile && home) { beginDiscovery(home); setStage('explore'); }
      else setStage(!data.user ? 'login' : data.profile ? 'location' : 'questionnaire');
      if (data.user) request<{ items: Restaurant[] }>('/api/saved').then(saved => { if (mounted.current && version === bootVersion.current) setSavedPlaces(saved.items); }).catch(() => {});
    } catch (e) { if (mounted.current && version === bootVersion.current) { setError(e instanceof Error ? e.message : 'Could not load the app.'); setStage('login'); } }
  }, []);
  useEffect(() => {
    mounted.current = true; void boot();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const signInNotice = authNotice(window.location.search);
    if (signInNotice) setNotice(signInNotice);
    return () => { mounted.current = false; bootVersion.current += 1; favoriteRequest.current?.abort(); };
  }, [boot]);
  useEffect(() => { if (draftReady && session?.user) { try { localStorage.setItem(`east-eats:taste:${session.user.id}`, JSON.stringify(favorites)); } catch { /* A private browsing storage limit must not block the questionnaire. */ } } }, [favorites, draftReady, session?.user]);
  useEffect(() => { if (draftReady && session?.user) { try { localStorage.setItem(goalDraftKey(session.user.id), JSON.stringify(goal)); } catch { /* A preference can still be saved to the account without local storage. */ } } }, [goal, draftReady, session?.user]);
  useEffect(() => {
    locationOperation.current += 1; setBusy(current => current === 'location' ? '' : current);
  }, [stage]);

  const discover = useCallback(async (intent: DiscoveryIntent, offerUpdate = false, signal?: AbortSignal) => {
    const data = await request<DiscoveryPayload>('/api/discover', intent.input, undefined, signal);
    if (signal?.aborted || activeDiscovery.current?.id !== intent.id) return;
    // Every new place reaches both views. Browse stays stable; explicit food,
    // cuisine, and text searches immediately follow fresh relevance tiers.
    const preferRelevance = Boolean(intent.input.query.trim() || intent.input.foodType || intent.input.cuisine);
    const next = offerUpdate ? mergeDiscoveryResults(appliedResults.current, data, preferRelevance) : { applied: data, pending: null };
    appliedResults.current = next.applied; setResults(next.applied); setPendingResults(next.pending);
    const businessPending = data.job && ['queued', 'running'].includes(data.job.status);
    const reviewPending = data.enrichmentJob && ['queued', 'running'].includes(data.enrichmentJob.status);
    const nextJob = businessPending ? data.job : reviewPending ? data.enrichmentJob : null;
    if (nextJob) {
      const phase = businessPending ? 'places' : 'reviews';
      setDiscoveryPhase(phase); setDiscoveryJob({ job: nextJob, intent, phase });
    } else {
      setDiscoveryJob(null);
      const failed = (data.job && ['failed', 'uncertain', 'budget_limited'].includes(data.job.status))
        || (data.dataMode === 'live' && !data.job && Boolean(data.warning));
      setDiscoveryPhase(failed ? 'stopped' : 'complete');
      if (failed && !data.warning) setNotice('The live search did not finish. You can keep browsing any saved results.');
    }
    if (data.job?.status === 'budget_limited') setNotice('We are showing saved results while live searches are paused.');
    if (data.warning) setNotice(data.warning);
  }, []);
  useEffect(() => {
    if (stage !== 'explore' || !discoveryIntent || !profile) return;
    const controller = new AbortController();
    setDiscoveryJob(null); setBusy('discover'); setError('');
    discover(discoveryIntent, false, controller.signal).catch(e => {
      if (!controller.signal.aborted && activeDiscovery.current?.id === discoveryIntent.id) {
        setDiscoveryPhase('stopped'); setError(e instanceof Error ? e.message : 'Could not find nearby places.');
      }
    }).finally(() => { if (!controller.signal.aborted && activeDiscovery.current?.id === discoveryIntent.id) setBusy(''); });
    return () => controller.abort();
  }, [stage, discover, discoveryIntent, profile?.version]);

  const searchFavorites = useCallback(async () => {
    if (!searchName.trim()) return;
    favoriteRequest.current?.abort();
    const controller = new AbortController();
    favoriteRequest.current = controller;
    const search: FavoriteSearch = { id: ++favoriteSearchId.current, searchId: crypto.randomUUID(), query: searchName.trim(), city: searchCity.trim(), startedAt: Date.now(), phase: 'searching' };
    setFavoriteSearch(search); setFavoriteJob(null); setSearchResults(null);
    setBusy('search'); setError(''); setNotice('');
    try {
      const data = await request<{ items: Restaurant[]; job: RefreshJob | null }>('/api/places/search', { query: search.query, city: search.city, searchId: search.searchId }, undefined, controller.signal);
      if (controller.signal.aborted || search.id !== favoriteSearchId.current) return;
      setSearchResults(data.items);
      if (data.job && ['queued', 'running'].includes(data.job.status)) setFavoriteJob({ job: data.job, search });
      else if (data.job && data.job.status !== 'succeeded') {
        setFavoriteSearch({ ...search, phase: 'stopped' });
        setNotice(data.job.status === 'budget_limited' ? 'Live search is paused. Try a restaurant already in the list, or retry later.' : 'The live search could not finish. Please try again.');
      } else setFavoriteSearch({ ...search, phase: 'complete' });
    } catch (e) {
      if (!controller.signal.aborted && search.id === favoriteSearchId.current) {
        setFavoriteSearch({ ...search, phase: 'stopped' });
        setError(e instanceof Error ? e.message : 'Restaurant search did not finish.');
      }
    } finally { if (search.id === favoriteSearchId.current) setBusy(''); }
  }, [searchName, searchCity]);
  // Poll the submitted query, never the current text-field drafts. Each new
  // submitted search invalidates every response and timer from its predecessor.
  useEffect(() => {
    if (!favoriteJob || stage !== 'questionnaire') return;
    const current = favoriteJob;
    const controller = new AbortController();
    let cancelled = false, polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const isCurrent = () => !cancelled && current.search.id === favoriteSearchId.current;
    const stop = (message: string) => {
      if (!isCurrent()) return;
      setFavoriteSearch({ ...current.search, phase: 'stopped' }); setFavoriteJob(null); setNotice(message);
    };
    const timeoutMessage = 'This search is taking longer than expected. Your results will be saved. Try the same search again shortly.';
    const deadline = setTimeout(() => { stop(timeoutMessage); controller.abort(); }, Math.max(0, 180_000 - (Date.now() - current.search.startedAt)));
    const updateResults = async (finished: boolean): Promise<'continue' | 'moved' | 'complete'> => {
      const data = await request<{ items: Restaurant[]; job: RefreshJob | null }>('/api/places/search', { query: current.search.query, city: current.search.city, searchId: current.search.searchId }, undefined, controller.signal);
      if (!isCurrent()) return 'complete';
      setSearchResults(data.items);
      if (data.job && ['queued', 'running'].includes(data.job.status)) {
        if (data.job.id !== current.job.id) { setFavoriteJob({ search: current.search, job: data.job }); return 'moved'; }
        return 'continue';
      }
      if (finished) {
        if (data.job && data.job.status !== 'succeeded') { stop('The live search could not finish. Please try again.'); return 'complete'; }
        setFavoriteSearch({ ...current.search, phase: 'complete' }); setFavoriteJob(null); return 'complete';
      }
      return 'continue';
    };
    const poll = async () => {
      if (!isCurrent()) return;
      if (Date.now() - current.search.startedAt >= 180_000) { stop(timeoutMessage); return; }
      try {
        const data = await request<{ job: RefreshJob }>(`/api/jobs/${encodeURIComponent(current.job.id)}`, undefined, undefined, controller.signal);
        if (!isCurrent()) return;
        if (data.job.status === 'succeeded') { if (await updateResults(true) !== 'continue') return; }
        else if (!['queued', 'running'].includes(data.job.status)) {
          stop(data.job.status === 'budget_limited' ? 'Live search is paused. Your existing results are still available.' : 'The live search could not finish. Please try again.'); return;
        } else {
          polls += 1;
          if (polls % 3 === 0 && await updateResults(false) !== 'continue') return;
        }
        if (isCurrent()) timer = setTimeout(poll, 3000);
      } catch { if (isCurrent() && !controller.signal.aborted) stop('We could not check the live search. Please try again.'); }
    };
    timer = setTimeout(poll, 3000);
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); clearTimeout(deadline); };
  }, [favoriteJob?.job.id, favoriteJob?.search.id, stage]);
  useEffect(() => {
    if (!discoveryJob || stage !== 'explore') return;
    const current = discoveryJob;
    const controller = new AbortController();
    let cancelled = false, polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const isCurrent = () => !cancelled && activeDiscovery.current?.id === current.intent.id;
    const stop = (message: string) => {
      if (!isCurrent()) return;
      setDiscoveryJob(null); setDiscoveryPhase('stopped'); setNotice(message);
    };
    const timeoutMs = current.phase === 'places' ? 600_000 : 1_200_000;
    const timeoutMessage = current.phase === 'places' ? 'This area search is taking longer than expected. You can keep browsing any results already found.' : 'Food details are still being checked. You can keep browsing the places we found.';
    const deadline = setTimeout(() => { stop(timeoutMessage); controller.abort(); }, Math.max(0, timeoutMs - (Date.now() - current.intent.startedAt)));
    const poll = async () => {
      if (!isCurrent()) return;
      try {
        const data = await request<{ job: RefreshJob }>(`/api/jobs/${encodeURIComponent(current.job.id)}`, undefined, undefined, controller.signal);
        if (!isCurrent()) return;
        if (data.job.status === 'succeeded') { await discover(current.intent, true, controller.signal); return; }
        if (!['queued', 'running'].includes(data.job.status)) {
          stop(data.job.status === 'budget_limited' ? 'Live searches are paused. You can keep browsing saved results.' : 'The live search did not finish. Any places already found are still available.'); return;
        }
        polls += 1;
        if (polls % 3 === 0) await discover(current.intent, true, controller.signal);
        if (isCurrent()) timer = setTimeout(poll, 3000);
      } catch { if (isCurrent() && !controller.signal.aborted) stop('We could not check the live search. You can keep browsing your results.'); }
    };
    timer = setTimeout(poll, 3000);
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); clearTimeout(deadline); };
  }, [discoveryJob?.job.id, discoveryJob?.intent.id, discoveryJob?.phase, stage, discover]);

  async function submitTaste(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!validFavorites(favorites)) { setError('Choose at least one favorite and tell us what you like about each one.'); return; }
    setBusy('taste');
    try {
      const data = await request<{ profile: TasteProfile; personalized: boolean; warning?: string }>('/api/taste', { favorites, goal, ...(correction.trim() ? { correction: correction.trim() } : {}) });
      setProfile(data.profile); setPersonalized(data.personalized); setNotice(data.warning ?? ''); setCorrection(''); setStage('interpretation');
    } catch (e) { setError(e instanceof Error ? e.message : 'Your answers are still here. Please try again.'); } finally { setBusy(''); }
  }
  function beginDiscovery(value: Location, nextFilters = filters) {
    const id = crypto.randomUUID();
    const intent: DiscoveryIntent = { id, input: { ...value, ...nextFilters, searchId: id }, startedAt: Date.now() };
    activeDiscovery.current = intent; setDiscoveryIntent(intent); setDiscoveryJob(null); setDiscoveryPhase('places');
    appliedResults.current = null; setResults(null); setPendingResults(null); setNotice('');
  }
  function updateFilters(patch: Partial<typeof filters>) {
    const next = { ...filters, ...patch }; setFilters(next);
    if (location) beginDiscovery(location, next);
  }
  function updateHome(value: SavedLocation | null) {
    setHomeAddress(value);
    setSession(current => current ? { ...current, homeAddress: value } : current);
    if (locationChoice.current !== 'manual' && locationChoice.current !== 'gps') {
      locationChoice.current = value ? 'home' : null; setLocation(value); setAreaLabel(value?.label ?? 'Nearby');
    }
  }
  function returnToExplore() {
    if (!location) { setStage('location'); return; }
    const active = activeDiscovery.current?.input;
    if (!active || active.lat !== location.lat || active.lng !== location.lng) beginDiscovery(location);
    setStage('explore');
  }
  function chooseLocation(value: Location, label: string, source: 'manual' | 'gps' | 'home' = 'manual') { locationOperation.current += 1; locationChoice.current = source; setBusy(current => current === 'location' ? '' : current); setLocation(value); setAreaLabel(label); setError(''); beginDiscovery(value); setStage('explore'); }
  function locate() {
    setError('');
    if (!navigator.geolocation) { setError('This browser cannot find your location. Enter an address or area below.'); return; }
    const operation = ++locationOperation.current;
    const fromStage = stageRef.current;
    const isCurrent = () => mounted.current && locationOperation.current === operation && stageRef.current === fromStage;
    setBusy('location');
    navigator.geolocation.getCurrentPosition(position => {
      if (!isCurrent()) return;
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      setBusy('');
      if (fromStage === 'questionnaire') { locationChoice.current = 'gps'; setLocation(point); setAreaLabel('Near you'); setNotice('Current location is ready for your next search. Your saved home has not changed.'); }
      else chooseLocation(point, 'Near you', 'gps');
    }, () => { if (!isCurrent()) return; setBusy(''); setError('We could not use your location. Enter an address or area below.'); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }
  async function toggleSaved(restaurant: Restaurant) {
    if (savingRef.current.has(restaurant.id)) return;
    savingRef.current.add(restaurant.id); setSavingIds([...savingRef.current]);
    setError('');
    const isSaved = savedPlaces.some(place => place.id === restaurant.id);
    try { await request(`/api/saved/${encodeURIComponent(restaurant.id)}`, undefined, isSaved ? 'DELETE' : 'PUT'); setSavedPlaces(places => isSaved ? places.filter(place => place.id !== restaurant.id) : places.some(place => place.id === restaurant.id) ? places : [...places, restaurant]); setNotice(isSaved ? `${restaurant.name} removed from Saved.` : `${restaurant.name} saved.`); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this place.'); } finally { savingRef.current.delete(restaurant.id); setSavingIds([...savingRef.current]); }
  }
  async function logout() {
    locationOperation.current += 1;
    favoriteSearchId.current += 1; favoriteRequest.current?.abort(); setFavoriteJob(null); setFavoriteSearch(null); setSearchResults(null);
    setBusy('logout'); setError('');
    try { await request('/auth/logout', {}, 'POST'); setSession(null); setProfile(null); setFavorites([]); setGoal('balanced'); setHomeAddress(null); locationChoice.current = null; setDraftReady(false); setResults(null); setSavedPlaces([]); setLocation(null); activeDiscovery.current = null; setDiscoveryIntent(null); setDiscoveryJob(null); setDiscoveryPhase('idle'); appliedResults.current = null; setStage('login'); await boot(); } catch (e) { setError(e instanceof Error ? e.message : 'Sign-out did not finish.'); } finally { setBusy(''); }
  }
  const closeDetails = useCallback(() => setSelected(null), []);

  return <div className="app-shell" data-stage={stage}>
    <a href="#main" className="skip-link">Skip to content</a>
    <header className="site-header"><a className="wordmark" href="/" aria-label="East Eats home">east eats<span className="wordmark-dot">.</span></a><span className="header-note">find food you’ll love</span>{stage === 'login' && <a className="button header-signin" href="/auth/login" aria-disabled={!session?.configured} onClick={event => { if (!session?.configured) event.preventDefault(); }}>Sign in</a>}{session?.user && <button className="text-button" onClick={logout} disabled={busy === 'logout'}>{busy === 'logout' ? 'Signing out…' : 'Sign out'}</button>}</header>
    {session?.dataMode === 'demo' && session.user && <div className="demo-banner">Demo mode · Fictional restaurants and sample recommendations. No live scraping.</div>}
    <main id="main" className={stage === 'login' ? 'main-login' : stage === 'explore' || stage === 'saved' ? 'main-wide' : 'main-narrow'}>
      {error && <div className="message error" role="alert">{error}<button className="text-button" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {notice && <div className="message" role="status">{notice}<button className="text-button" onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></div>}
      {stage === 'loading' && <div className="empty" role="status"><Bowl className="loading-bowl" /><p>Getting the table ready…</p></div>}
      {stage === 'login' && <FieldGuideHero demo={<HomepageDemo configured={Boolean(session?.configured)} />}><a className={`button login-button ${!session?.configured ? 'disabled' : ''}`} href='/auth/login' onClick={event => { if (!session?.configured) event.preventDefault(); }} aria-disabled={!session?.configured}><img src="/google-g.png" width="20" height="20" alt="" aria-hidden="true" />Continue with Google</a>{!session?.configured && <p className="small">Google sign-in is waiting for setup. Your account and recommendations will be available once it’s connected.</p>}{session?.demo && <button className="button" disabled={Boolean(busy)} onClick={async () => { setBusy('demo'); setError(''); try { await request('/api/demo/start', {}); await boot(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the demo.'); } finally { setBusy(''); } }}>{busy === 'demo' ? 'Opening demo…' : 'Try the demo'}</button>}{!session && <button className="button" onClick={() => { setStage('loading'); void boot(); }}>Retry connection</button>}</FieldGuideHero>}

      {stage === 'questionnaire' && <section><p className="eyebrow">Your taste, in good company</p><h1>Where do you<br />love eating?</h1><p className="lede">Add up to five favorites, anywhere. Three gives us a good start. One is enough.</p>
        <fieldset className="taste-goal-fieldset" aria-describedby="taste-goal-help"><legend>What matters most right now?</legend><p id="taste-goal-help" className="small">Pick one. You can change it anytime in Taste.</p><div className="taste-goal-options">{TASTE_GOAL_OPTIONS.map(option => <label className={`taste-goal-card${goal === option.value ? ' is-selected' : ''}`} key={option.value}><input type="radio" name="taste-goal" value={option.value} checked={goal === option.value} onChange={() => setGoal(option.value)} aria-labelledby={`taste-goal-label-${option.value}`} aria-describedby={`taste-goal-${option.value}`} /><span><strong id={`taste-goal-label-${option.value}`}>{option.label}</strong><span id={`taste-goal-${option.value}`}>{option.description}</span></span></label>)}</div></fieldset>
        <HomeAddress key={session?.user?.id} value={homeAddress} onChange={updateHome} onUseCurrent={locate} locating={busy === 'location'} />
        <form className="search-form" onSubmit={event => { event.preventDefault(); void searchFavorites(); }}><label>Restaurant name<input value={searchName} onChange={event => setSearchName(event.target.value)} maxLength={150} required placeholder="A favorite noodle shop…" /></label><label>City <span className="muted">(optional)</span><input value={searchCity} onChange={event => setSearchCity(event.target.value)} maxLength={100} placeholder="Any city" /></label><button className="button" disabled={busy === 'search'}>{busy === 'search' ? 'Searching…' : 'Find restaurant'}</button></form>
        {favoriteSearch?.phase === 'searching' && <p role="status" className="small">Searching Google Maps… <span>We’re checking {favoriteSearch.query}{favoriteSearch.city ? ` in ${favoriteSearch.city}` : ''}. Results appear here as they arrive.</span></p>}
        {searchResults !== null && <div className="search-results" aria-live="polite"><h2 className="small-heading">Search results{favoriteSearch ? ` for ${favoriteSearch.query}` : ''}</h2>{searchResults.length === 0 ? favoriteSearch?.phase === 'complete' ? <p>No places matched this search. Try adding a city or checking the restaurant name.</p> : favoriteSearch?.phase === 'stopped' ? <p>The search has not finished. Please try again.</p> : null : searchResults.map(restaurant => <div className="search-result" key={restaurant.id}><div><strong>{restaurant.name}</strong><span className="small">{restaurant.city} · {restaurant.cuisines.join(', ')}</span></div><button className="button" disabled={favorites.length >= 5 || favorites.some(favorite => favorite.restaurantId === restaurant.id)} onClick={() => setFavorites(current => [...current, favoriteFromRestaurant(restaurant)])}>{favorites.some(favorite => favorite.restaurantId === restaurant.id) ? 'Added' : 'Add favorite'}</button></div>)}</div>}
        <form onSubmit={submitTaste}><div className="favorites-list">{favorites.map((favorite, index) => <fieldset className="favorite-card" key={favorite.restaurantId}><legend>{favorite.name}</legend><div className="favorite-top"><p className="small">{favorite.city}</p><button type="button" className="text-button" onClick={() => setFavorites(current => current.filter(value => value.restaurantId !== favorite.restaurantId))} aria-label={`Remove ${favorite.name}`}>Remove</button></div><p>What keeps you coming back?</p><div className="reason-options">{REASONS.map(reason => <button className="chip" type="button" key={reason} aria-pressed={favorite.reasons.includes(reason)} onClick={() => setFavorites(current => current.map((value, i) => i === index ? toggleReason(value, reason) : value))}>{reason}</button>)}</div><label htmlFor={`notes-${index}`}>Tell us more <span className="muted">(optional)</span></label><textarea id={`notes-${index}`} value={favorite.notes} maxLength={1500} onChange={event => setFavorites(current => current.map((value, i) => i === index ? { ...value, notes: event.target.value } : value))} placeholder="The noodles have a great chew, and I don’t mind a rushed ordering experience." rows={3} /></fieldset>)}</div><div className="inline-actions"><button className="button primary" disabled={busy === 'taste' || !validFavorites(favorites)}>{busy === 'taste' ? 'Getting to know your tastes…' : 'Find my next meal'}</button>{profile && <button className="button" type="button" onClick={returnToExplore}>Back to exploring</button>}</div>{favorites.length > 0 && !validFavorites(favorites) && <p className="small">Choose a reason or write a note for each favorite to continue.</p>}</form></section>}

      {stage === 'interpretation' && profile && <section><p className="eyebrow">Your taste profile</p><h1>{personalized ? 'Here’s what we’re hearing.' : 'Your answers are saved.'}</h1><p className="taste-goal-summary"><span>Right now:</span><strong>{TASTE_GOAL_OPTIONS.find(option => option.value === goal)?.label}</strong></p><div className="field-note interpretation"><p>{personalized ? profile.interpretation : 'Your priority is applied. We could not finish learning from your favorites yet. You can retry or start exploring.'}</p></div><form onSubmit={submitTaste}><label htmlFor="correction">Anything we missed?</label><textarea id="correction" rows={3} maxLength={1500} value={correction} onChange={event => setCorrection(event.target.value)} placeholder="Actually, I prefer mild food and I’d travel farther for great dumplings." /><div className="inline-actions"><button className="button" disabled={busy === 'taste'}>{busy === 'taste' ? 'Updating…' : personalized ? 'Update my tastes' : 'Retry personalization'}</button><button className="button primary" type="button" onClick={returnToExplore}>Let’s find somewhere</button></div></form><button className="text-button" onClick={() => setStage('questionnaire')}>Edit my favorites</button></section>}

      {stage === 'location' && <section><p className="eyebrow">Let’s look around</p><h1>Where are<br />we eating?</h1><p className="lede">Find food near a street address, campus, neighborhood, or city.</p><button className="button primary" onClick={locate} disabled={busy === 'location'}>{busy === 'location' ? 'Finding your location…' : 'Use my location'}</button><p className="small">Choose your current location, or enter an address below.</p>{session?.dataMode === 'demo' && <div className="city-shortcuts">{BAY_AREAS.map(area => <button key={area.label} className="button" onClick={() => chooseLocation(area, area.label)}>{area.label}</button>)}</div>}<LocationSearch key={homeAddress?.label ?? "no-home"} proximity={location} initialValue={homeAddress?.label ?? ""} clearInitialOnFocus onSelect={area => chooseLocation(area, area.label)} />{homeAddress && <button className="button home-area-shortcut" onClick={() => chooseLocation(homeAddress, homeAddress.label, 'home')}>Search near saved home</button>}{location && <button className="text-button" onClick={() => setStage('explore')}>Back to results</button>}</section>}

      {stage === 'explore' && <section><div className="explore-heading"><div><p className="eyebrow">Picked for you · {areaLabel}</p><h1>What sounds good?</h1></div><button className="button" onClick={() => setStage('location')}>Change area</button></div><div className="discover-toolbar"><div className="tabs" aria-label="Discovery type"><button aria-pressed={filters.mode === 'for-you'} onClick={() => updateFilters({ mode: 'for-you' })}>For you</button><button aria-pressed={filters.mode === 'fusion'} onClick={() => updateFilters({ mode: 'fusion' })}>Fusion finds</button></div><button className="button mobile-map-toggle" onClick={() => setShowMap(!showMap)} aria-pressed={showMap}>{showMap ? 'Show list' : 'Show map'}</button></div>
        <form className="discovery-search" onSubmit={event => { event.preventDefault(); updateFilters({ query: queryDraft.trim() }); }}><label htmlFor="food-search" className="sr-only">Search dishes or restaurant names</label><input id="food-search" value={queryDraft} onChange={event => setQueryDraft(event.target.value)} maxLength={150} placeholder="Noodles, dumplings, a restaurant name…" /><button className="button">Search</button></form><p className="small area-search-help">Looking for a street, campus, or city? <button className="text-button" onClick={() => setStage('location')}>Change area</button></p><div className="filters"><label>Distance<select value={filters.radiusKm} onChange={event => updateFilters({ radiusKm: Number(event.target.value) })}><option value="2">About 1 mile</option><option value="5">About 3 miles</option><option value="15">About 9 miles</option><option value="50">About 30 miles</option></select></label><label>Price<select value={filters.maxPrice} onChange={event => updateFilters({ maxPrice: Number(event.target.value) })}><option value="4">Any price</option><option value="1">$</option><option value="2">Up to $$</option><option value="3">Up to $$$</option></select></label><label>Cuisine<select value={filters.cuisine} onChange={event => updateFilters({ cuisine: event.target.value })}><option value="">All cuisines</option>{CUISINES.map(cuisine => <option value={cuisine} key={cuisine}>{cuisine}</option>)}</select></label><label>Food type<select value={filters.foodType} onChange={event => updateFilters({ foodType: event.target.value })}><option value="">Any food</option>{FOOD_TYPES.map(food => <option value={food.id} key={food.id}>{food.label}</option>)}</select></label></div>
        {discoveryPhase === 'places' && <p className="refresh-status" role="status">Searching Google Maps for places in {areaLabel}… Results and map pins appear as they arrive.</p>}{discoveryPhase === 'reviews' && <p className="refresh-status" role="status">Places are ready. We’re checking food details to improve your recommendations.</p>}{pendingResults && <button className="button refresh-button" onClick={() => { appliedResults.current = pendingResults; setResults(pendingResults); setPendingResults(null); }}>Fresh details are ready. Update results</button>}
        <div className={`discovery-grid ${showMap ? 'show-map' : ''}`}><div className="restaurant-list" aria-busy={busy === 'discover'}>{busy === 'discover' && !results && <div className="empty" role="status">Finding your next spot…</div>}{results?.items.length === 0 && discoveryPhase === 'complete' && <div className="empty"><Bowl /><h2>No matching places found</h2><p>Try a wider distance, a different cuisine, or change the area.</p></div>}{results?.items.map((item, index) => <article className="restaurant-card" key={item.restaurant.id}><div className="card-photo"><RestaurantPhoto restaurant={item.restaurant} /><span className="list-position" aria-label={`Recommendation ${index + 1}`}>{index + 1}</span></div><div className="card-content"><RestaurantTags restaurant={item.restaurant} /><button className="restaurant-title" onClick={() => setSelected(item)}>{item.restaurant.name}</button><p className="small">{item.restaurant.city} · {priceLabel(item.restaurant.priceLevel, item.restaurant.priceText)} · {distanceLabel(item.distanceKm)}</p><div className="field-note"><MatchInsights item={item} /></div><div className="card-footer"><span className="small card-source"><span>Google: {item.restaurant.googleRating ?? 'unrated'}{item.restaurant.googleRating !== null ? '/5' : ''}</span><span>Checked {new Date(item.restaurant.fetchedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></span><button className="button save-button" aria-label={`${savedPlaces.some(place => place.id === item.restaurant.id) ? 'Unsave' : 'Save'} ${item.restaurant.name}`} aria-pressed={savedPlaces.some(place => place.id === item.restaurant.id)} onClick={() => void toggleSaved(item.restaurant)}>{savedPlaces.some(place => place.id === item.restaurant.id) ? 'Saved' : 'Save'}</button></div></div></article>)}</div><aside className="map-column" aria-label="Map view">{location && <RestaurantMap items={results?.items ?? []} center={location} selectedId={selected?.restaurant.id} searching={discoveryPhase === 'places'} onSelect={setSelected} onSearchArea={area => chooseLocation(area, 'Selected map area')} />}</aside></div></section>}

      {stage === 'saved' && <section><p className="eyebrow">For another day</p><h1>Your saved spots.</h1>{savedPlaces.length === 0 ? <div className="empty"><Bowl /><h2>A good meal to look forward to</h2><p>Save a restaurant while exploring, and it’ll be waiting here.</p><button className="button primary" onClick={returnToExplore}>Find somewhere to eat</button></div> : <div className="saved-grid">{savedPlaces.map(restaurant => <article className="saved-card" key={restaurant.id}><RestaurantPhoto restaurant={restaurant} /><div className="card-content"><p className="eyebrow">{restaurant.city}</p><button className="restaurant-title" onClick={() => setSelected({ restaurant, score: 0, distanceKm: 0, confidence: restaurant.features?.confidence ?? 0, explanation: 'A place you saved to explore later.' })}>{restaurant.name}</button><RestaurantTags restaurant={restaurant} /><p>{priceLabel(restaurant.priceLevel, restaurant.priceText)}</p><button className="button" onClick={() => void toggleSaved(restaurant)}>Remove from Saved</button></div></article>)}</div>}</section>}
    </main>
    {session?.user && profile && stage !== 'loading' && stage !== 'login' && stage !== 'location' && <nav className="bottom-nav" aria-label="Main navigation"><button aria-current={stage === 'explore' ? 'page' : undefined} onClick={returnToExplore}>Explore</button><button aria-current={stage === 'saved' ? 'page' : undefined} onClick={() => setStage('saved')}>Saved{savedPlaces.length ? ` (${savedPlaces.length})` : ''}</button><button aria-current={stage === 'questionnaire' || stage === 'interpretation' ? 'page' : undefined} onClick={() => setStage('questionnaire')}>Taste</button></nav>}
    <SiteFooter />
    {selected && <Details item={selected} saved={savedPlaces.some(place => place.id === selected.restaurant.id)} saving={savingIds.includes(selected.restaurant.id)} onSave={() => void toggleSaved(selected.restaurant)} onClose={closeDetails} />}
  </div>;
}
