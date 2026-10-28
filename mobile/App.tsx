import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as Crypto from 'expo-crypto';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { Session } from '@supabase/supabase-js';
import { api, API_ORIGIN } from './src/api';
import { configured, completeSignIn, observeAppAuth, secureStorage, signInApple, signInGoogle, supabase } from './src/auth';
import { activeJob, mergePlaces } from './src/policies';
import { AreaPicker } from './src/AreaPicker';
import { NativeMap } from './src/NativeMap';
import { GOALS, Questionnaire, validAnswers } from './src/Questionnaire';
import { RestaurantCard } from './src/RestaurantCard';
import { brand, Button, Field, s, T, Title } from './src/ui';
import type { DiscoverInput, DiscoverResponse, Location, RankedRestaurant, Restaurant, TasteInput, TasteProfile } from './src/types';

type Stage = 'taste' | 'interpretation' | 'location' | 'explore' | 'saved' | 'account';
type Intent = { input: DiscoverInput; label: string };
type Account = { profile: TasteProfile | null; answers: TasteInput | null; personalized?: boolean; warning?: string };
const emptyAnswers = (): TasteInput => ({ favorites: [], goal: 'balanced' });
const storageKey = (userId: string, part: string) => `east-eats.${userId}.${part}`;

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Jakarta: require('./assets/PlusJakartaSans.ttf') });
  const [auth, setAuth] = useState<Session | null>(null); const [booting, setBooting] = useState(true);
  const [stage, setStage] = useState<Stage>('taste'); const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [answers, setAnswers] = useState<TasteInput>(emptyAnswers); const [draftReady, setDraftReady] = useState(false);
  const [busy, setBusy] = useState(''); const [message, setMessage] = useState('');
  const [intent, setIntent] = useState<Intent | null>(null); const [items, setItems] = useState<RankedRestaurant[]>([]);
  const [searchState, setSearchState] = useState(''); const [saved, setSaved] = useState<Restaurant[]>([]);
  const [offlineSaved, setOfflineSaved] = useState(false); const [showMap, setShowMap] = useState(false);
  const [query, setQuery] = useState(''); const [radius, setRadius] = useState(5); const [mode, setMode] = useState<'for-you' | 'fusion'>('for-you');
  const [correction, setCorrection] = useState(''); const [appleAvailable, setAppleAvailable] = useState(false);
  const action = useRef(false); const accountOperation = useRef(0); const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const userId = auth?.user.id;

  async function perform(name: string, task: () => Promise<void>) {
    if (action.current) return; action.current = true; setBusy(name); setMessage('');
    try { await task(); } catch (error) { setMessage(error instanceof Error ? error.message : 'That did not finish. Please try again.'); }
    finally { action.current = false; setBusy(''); }
  }
  useEffect(() => {
    if (!supabase) { setBooting(false); return; }
    let mounted = true;
    const removeState = observeAppAuth();
    void supabase.auth.getSession().then(({ data, error }) => { if (!mounted) return; if (error) setMessage('Stored sign-in could not be restored. Please sign in again.'); setAuth(data.session); if (!data.session) setBooting(false); }).catch(() => { if (mounted) { setMessage('Could not restore sign-in. Please try again.'); setBooting(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (mounted) { setAuth(session); if (!session) setBooting(false); } });
    const handle = (url: string | null | undefined) => { if (url?.startsWith('easteats://auth/callback')) void completeSignIn(url).catch(() => { if (mounted) setMessage('Sign-in did not finish. Please start again.'); }); };
    void Linking.getInitialURL().then(handle);
    const links = Linking.addEventListener('url', event => handle(event.url));
    if (Platform.OS === 'ios' && process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED === 'true') void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    return () => { mounted = false; subscription.unsubscribe(); links.remove(); removeState(); };
  }, []);

  useEffect(() => {
    const operation = ++accountOperation.current; let cancelled = false;
    setDraftReady(false); setItems([]); setIntent(null); setSaved([]); setProfile(null); setAnswers(emptyAnswers()); setMessage('');
    if (!userId) return;
    setBooting(true);
    void (async () => {
      try {
        const data = await api<Account>('/api/session');
        const raw = await secureStorage.getItem(storageKey(userId, 'taste'));
        let draft: TasteInput | null = null;
        if (raw) { try { const value = JSON.parse(raw) as TasteInput; if (Array.isArray(value.favorites) && value.favorites.length <= 5 && value.favorites.every(favorite => typeof favorite.name === 'string' && typeof favorite.notes === 'string' && Array.isArray(favorite.reasons))) draft = { favorites: value.favorites, goal: GOALS.some(goal => goal.value === value.goal) ? value.goal : 'balanced' }; } catch { /* Use server answers when a draft cannot be read. */ } }
        if (cancelled || operation !== accountOperation.current) return;
        setAnswers(draft ?? data.answers ?? emptyAnswers()); setProfile(data.profile); setDraftReady(true); setStage(data.profile ? 'location' : 'taste'); if (data.warning) setMessage(data.warning);
        try { const places = await api<{ items: Restaurant[] }>('/api/saved'); if (cancelled) return; setSaved(places.items); setOfflineSaved(false); void secureStorage.setItem(storageKey(userId, 'saved'), JSON.stringify(places.items)).catch(() => {}); }
        catch { const cached = await secureStorage.getItem(storageKey(userId, 'saved')); if (!cancelled && cached) { const data = JSON.parse(cached) as Restaurant[]; if (Array.isArray(data)) { setSaved(data); setOfflineSaved(true); } } }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Could not load your account.');
          try {
            const raw = await secureStorage.getItem(storageKey(userId, 'saved'));
            const cached = raw ? JSON.parse(raw) as Restaurant[] : null;
            if (!cancelled && Array.isArray(cached)) { setSaved(cached); setOfflineSaved(true); setStage('saved'); }
          } catch { /* Keep the account error if an offline snapshot is unavailable. */ }
        }
      }
      finally { if (!cancelled) setBooting(false); }
    })();
    return () => { cancelled = true; };
  }, [userId]);
  useEffect(() => { if (userId && draftReady) void secureStorage.setItem(storageKey(userId, 'taste'), JSON.stringify(answers)).catch(() => {}); }, [userId, answers, draftReady]);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [stage]);

  function discover(point: Location, label: string, next = { radius, query, mode }) {
    setItems([]); setSearchState('Searching Google Maps...');
    setIntent({ input: { ...point, radiusKm: next.radius, query: next.query.trim(), mode: next.mode, cuisine: '', maxPrice: 4, searchId: Crypto.randomUUID() }, label }); setStage('explore');
  }
  useEffect(() => {
    if (!intent || !userId) return;
    const controller = new AbortController(); const started = Date.now();
    void (async () => {
      try {
        while (!controller.signal.aborted) {
          // Keep the same UUID throughout polling. Only an explicit search
          // creates a new source run, which protects the scraping budget.
          const data = await api<DiscoverResponse>('/api/discover', intent.input, undefined, controller.signal);
          if (controller.signal.aborted) return;
          setItems(current => mergePlaces(current, data.items, data.job?.status === 'succeeded'));
          if (data.warning) setMessage(data.warning);
          const placesPending = activeJob(data.job?.status), reviewsPending = activeJob(data.enrichmentJob?.status);
          if (!placesPending && !reviewsPending) {
            const stopped = (data.job && data.job.status !== 'succeeded') || (!data.job && data.dataMode === 'live' && data.warning);
            setSearchState(stopped ? 'The live search did not finish. Any places already found are still here.' : data.items.length ? 'Places are ready.' : 'No matching places found. Try a wider distance or another area.'); return;
          }
          setSearchState(placesPending ? 'Searching Google Maps... Places appear as they arrive.' : 'Places are ready. Checking food details in the background.');
          if (Date.now() - started > 300_000) { setSearchState('The search is taking longer than expected. Refresh results to retry.'); return; }
          await new Promise(resolve => setTimeout(resolve, 3000));
          while (AppState.currentState !== 'active' && !controller.signal.aborted) await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) { if (!controller.signal.aborted) setSearchState(error instanceof Error ? error.message : 'The search did not finish. Please retry.'); }
    })();
    return () => controller.abort();
  }, [intent, userId]);

  async function saveTaste() {
    if (!validAnswers(answers)) throw new Error('Choose a favorite and tell us why you like it.');
    const response = await api<{ profile: TasteProfile; warning?: string }>('/api/taste', { ...answers, ...(correction.trim() ? { correction: correction.trim() } : {}) });
    setProfile(response.profile); setCorrection(''); setMessage(response.warning ?? ''); setStage('interpretation');
  }
  async function toggleSaved(restaurant: Restaurant) {
    const exists = saved.some(place => place.id === restaurant.id);
    await api(`/api/saved/${encodeURIComponent(restaurant.id)}`, undefined, exists ? 'DELETE' : 'PUT');
    const next = exists ? saved.filter(place => place.id !== restaurant.id) : [...saved, restaurant];
    setSaved(next); setOfflineSaved(false);
    if (userId) void secureStorage.setItem(storageKey(userId, 'saved'), JSON.stringify(next)).catch(() => {});
  }
  async function signOut() {
    const { error } = await supabase!.auth.signOut({ scope: 'local' }); if (error) throw new Error('Sign-out did not finish. Please retry.');
    if (userId) await Promise.all(['taste', 'saved'].map(part => secureStorage.removeItem(storageKey(userId, part))));
    setAuth(null); setAnswers(emptyAnswers()); setIntent(null); setSaved([]); setProfile(null);
  }
  function deleteAccount() {
    Alert.alert('Delete your East Eats account?', 'This permanently deletes your taste profile and saved places. This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete account', style: 'destructive', onPress: () => { void perform('delete', async () => { const result = await api<{ deleted: boolean }>('/api/account', { confirmation: 'DELETE' }, 'DELETE'); if (result.deleted !== true) throw new Error('Account deletion was not confirmed. Please retry.'); await supabase!.auth.signOut({ scope: 'local' }); if (userId) await Promise.all(['taste', 'saved'].map(part => secureStorage.removeItem(storageKey(userId, part)))); setAuth(null); }); } }]);
  }
  const card = (restaurant: Restaurant, rank?: RankedRestaurant) => <RestaurantCard key={restaurant.id} restaurant={restaurant} rank={rank} saved={saved.some(place => place.id === restaurant.id)} busy={Boolean(busy)} onSave={() => { void perform('saved', () => toggleSaved(restaurant)); }} />;

  return <SafeAreaProvider><SafeAreaView style={s.safe}><StatusBar style="dark" /><View style={s.header}><T style={s.wordmark}>east eats.</T>{auth && <Button title="Account" secondary onPress={() => setStage('account')} />}</View><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView ref={scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
    {message && <View style={s.notice}><T accessibilityRole="alert" style={{ fontSize: 14 }}>{message}</T><Button title="Dismiss" secondary onPress={() => setMessage('')} /></View>}
    {(!fontsLoaded && !fontError) || booting ? <ActivityIndicator color={brand} accessibilityLabel="Loading East Eats" /> : !auth ? <View style={{ gap: 22 }}><Title>Find your kind of good.</Title><T style={s.subtitle}>East Asian food picked for your taste. Start with the places you already love.</T><Button title={busy ? 'Opening sign-in...' : 'Continue with Google'} secondary disabled={!configured || Boolean(busy)} onPress={() => { void perform('login', signInGoogle); }} />{appleAvailable && <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={25} style={{ width: '100%', height: 50 }} onPress={() => { void perform('login', signInApple); }} />}{!configured && <T style={s.small}>This development build needs the public Supabase URL and publishable key before sign-in is available.</T>}<Button title="Privacy policy" secondary onPress={() => { void Linking.openURL(`${API_ORIGIN}/privacy`); }} /></View> : <>
    {stage === 'taste' && <Questionnaire answers={answers} onChange={setAnswers} onSave={() => { void perform('taste', saveTaste); }} busy={Boolean(busy)} />}
    {stage === 'interpretation' && profile && <View style={{ gap: 20 }}><Title>Here is what we are hearing.</Title><T style={s.small}>Right now: {GOALS.find(goal => goal.value === answers.goal)?.label ?? 'A bit of everything'}</T><View style={s.card}><T>{profile.interpretation}</T></View><Field label="Anything we missed?" multiline value={correction} onChangeText={setCorrection} maxLength={1500} /><Button title="Update my tastes" secondary disabled={Boolean(busy)} onPress={() => { void perform('taste', saveTaste); }} /><Button title="Find somewhere" onPress={() => { if (intent) discover(intent.input, intent.label); else setStage('location'); }} /><Button title="Edit my favorites" secondary onPress={() => setStage('taste')} /></View>}
    {stage === 'location' && <AreaPicker onChoose={(point, label) => discover(point, label)} />}
    {stage === 'explore' && intent && <View style={{ gap: 18 }}><T style={s.small}>Picked for you / {intent.label}</T><Title>What sounds good?</Title><Button title="Change area" secondary onPress={() => setStage('location')} /><Field label="Dishes or restaurant names" value={query} onChangeText={setQuery} maxLength={150} onSubmitEditing={() => discover(intent.input, intent.label)} /><Button title="Search" onPress={() => discover(intent.input, intent.label)} /><View style={s.wrap}>{[2, 5, 15].map(value => <Button key={value} title={`${value} km`} secondary selected={radius === value} onPress={() => { setRadius(value); discover(intent.input, intent.label, { radius: value, mode, query }); }} />)}</View><View style={s.row}>{(['for-you', 'fusion'] as const).map(value => <View key={value} style={{ flex: 1 }}><Button title={value === 'for-you' ? 'For you' : 'Fusion finds'} secondary selected={mode === value} onPress={() => { setMode(value); discover(intent.input, intent.label, { radius, query, mode: value }); }} /></View>)}</View><T accessibilityLiveRegion="polite" style={s.small}>{searchState}</T><Button title={showMap ? 'Hide map' : 'Show map'} secondary onPress={() => setShowMap(!showMap)} />{showMap && <NativeMap center={intent.input} items={items} />}{items.map(item => card(item.restaurant, item))}<Button title="Refresh results" secondary onPress={() => discover(intent.input, intent.label)} /></View>}
    {stage === 'saved' && <View style={{ gap: 18 }}><Title>Your saved spots.</Title>{offlineSaved && <T style={s.small}>Showing your saved offline copy. Details may have changed.</T>}{saved.length ? saved.map(place => card(place)) : <T>Save a restaurant while exploring and it will be waiting here.</T>}</View>}
    {stage === 'account' && <View style={{ gap: 18 }}><Title>Your account.</Title><T>{auth.user.email}</T><Button title="Privacy policy" secondary onPress={() => { void Linking.openURL(`${API_ORIGIN}/privacy`); }} /><Button title="Account deletion information" secondary onPress={() => { void Linking.openURL(`${API_ORIGIN}/delete-account`); }} /><Button title="Sign out" secondary disabled={Boolean(busy)} onPress={() => { void perform('logout', signOut); }} /><Button title="Delete account" destructive disabled={Boolean(busy)} onPress={deleteAccount} /></View>}
    </>}
  </ScrollView></KeyboardAvoidingView>{auth && !booting && <View style={s.tabs}>{(['explore', 'saved', 'taste'] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: stage === tab }} onPress={() => setStage(tab === 'explore' ? profile ? intent ? 'explore' : 'location' : 'taste' : tab)} style={[s.tab, stage === tab && { backgroundColor: '#FFF0EC' }]}><T style={[s.tabText, stage === tab && { color: '#B4210B' }]}>{tab === 'explore' ? 'Explore' : tab === 'saved' ? 'Saved' : 'Taste'}</T></Pressable>)}</View>}</SafeAreaView></SafeAreaProvider>;
}
