import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as Crypto from 'expo-crypto';
import * as DeviceLocation from 'expo-location';
import { CUISINES, FOOD_TYPES } from '../src/lib/food-taxonomy';
import { HomeAddress } from './src/HomeAddress';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { Session } from '@supabase/supabase-js';
import { api, API_ORIGIN } from './src/api';
import { configured, completeSignIn, observeAppAuth, secureStorage, signInApple, signInGoogle, supabase } from './src/auth';
import { activeJob, mergePlaces } from './src/policies';
import { AreaPicker } from './src/AreaPicker';
import { NativeMap } from './src/NativeMap';
import { GOALS, Questionnaire, validAnswers } from './src/Questionnaire';
import { RestaurantCard } from './src/RestaurantCard';
import { SearchOptions } from './src/SearchOptions';
import { brand, Button, Field, s, T, Title } from './src/ui';
import type { DiscoverInput, DiscoverResponse, Location, RankedRestaurant, Restaurant, SavedLocation, TasteInput, TasteProfile, SavedSearch, SavedSearchSummary, FeedbackItem, FeedbackSentiment, MealCheckin } from './src/types';

type Stage = 'taste' | 'interpretation' | 'location' | 'explore' | 'saved' | 'account';
type Intent = { input: DiscoverInput; label: string };
type Account = { profile: TasteProfile | null; answers: TasteInput | null; personalized?: boolean; warning?: string; homeAddress?: SavedLocation | null };
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
  const [homeAddress, setHomeAddress] = useState<SavedLocation | null>(null);
  const [visitLocation, setVisitLocation] = useState<SavedLocation | null>(null);
  const locationChoice = useRef<'home' | 'manual' | 'gps' | null>(null);
  const locationOperation = useRef(0); const stageRef = useRef(stage); stageRef.current = stage;
  const [cuisine, setCuisine] = useState(''); const [foodType, setFoodType] = useState('');
  const [correction, setCorrection] = useState(''); const [appleAvailable, setAppleAvailable] = useState(false);
  const [history, setHistory] = useState<SavedSearchSummary[]>([]); const [activeSearch, setActiveSearch] = useState<SavedSearchSummary|null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]); const [pendingMeal, setPendingMeal] = useState<MealCheckin|null>(null);
  const [chosenPlace, setChosenPlace] = useState(''); const [allHistory, setAllHistory] = useState(false);
  const [adjustingSearch, setAdjustingSearch] = useState(false);
  const searchOperation = useRef(0);
  const appliedInput = useRef<DiscoverInput|null>(null);
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
    setDraftReady(false); setItems([]); setIntent(null); setSaved([]); setProfile(null); setAnswers(emptyAnswers()); setMessage(''); setHomeAddress(null); setVisitLocation(null); locationChoice.current = null; locationOperation.current += 1;
    setHistory([]); setActiveSearch(null); setFeedback([]); setPendingMeal(null); setChosenPlace(''); searchOperation.current += 1;
    if (!userId) return;
    setBooting(true);
    void (async () => {
      try {
        const data = await api<Account>('/api/session');
        const raw = await secureStorage.getItem(storageKey(userId, 'taste'));
        let draft: TasteInput | null = null;
        if (raw) { try { const value = JSON.parse(raw) as TasteInput; if (Array.isArray(value.favorites) && value.favorites.length <= 5 && value.favorites.every(favorite => typeof favorite.name === 'string' && typeof favorite.notes === 'string' && Array.isArray(favorite.reasons))) draft = { favorites: value.favorites, goal: GOALS.some(goal => goal.value === value.goal) ? value.goal : 'balanced' }; } catch { /* Use server answers when a draft cannot be read. */ } }
        if (cancelled || operation !== accountOperation.current) return;
        setAnswers(draft ?? data.answers ?? emptyAnswers()); setProfile(data.profile); setDraftReady(true);
        const home = data.homeAddress ?? null; setHomeAddress(home); setVisitLocation(home); locationChoice.current = home ? 'home' : null;
        if (data.profile) {
          const [searches, votes, meal] = await Promise.all([
            api<{items:SavedSearchSummary[]}>('/api/searches'),
            api<{items:FeedbackItem[]}>('/api/feedback').catch(()=>({items:[]})),
            api<{pendingMeal:MealCheckin|null}>('/api/meal').catch(()=>({pendingMeal:null})),
          ]);
          if (cancelled || operation !== accountOperation.current) return;
          setHistory(searches.items); setFeedback(votes.items); setPendingMeal(meal.pendingMeal); setChosenPlace(meal.pendingMeal?.restaurantId ?? '');
          if (searches.items.length) {
            const previous=await api<{search:SavedSearch}>(`/api/searches/${encodeURIComponent(searches.items[0].id)}`);
            if (cancelled || operation !== accountOperation.current) return;
            restoreSearch(previous.search);
          } else setStage('location');
        } else setStage('taste');
        if (data.warning) setMessage(data.warning);
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
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); locationOperation.current += 1; }, [stage]);

  function updateHome(value: SavedLocation | null) {
    setHomeAddress(value);
    if (locationChoice.current !== 'manual' && locationChoice.current !== 'gps') { setVisitLocation(value); locationChoice.current = value ? 'home' : null; }
  }
  async function useCurrent() {
    const operation = ++locationOperation.current; const from = stageRef.current;
    const isCurrent = () => operation === locationOperation.current && stageRef.current === from;
    const permission = await DeviceLocation.requestForegroundPermissionsAsync();
    if (!isCurrent()) return;
    if (permission.status !== 'granted') throw new Error('Location permission was not granted. You can enter an address instead.');
    const position = await DeviceLocation.getCurrentPositionAsync({ accuracy: DeviceLocation.Accuracy.Balanced });
    if (!isCurrent()) return;
    locationChoice.current = 'gps'; setVisitLocation({ lat: position.coords.latitude, lng: position.coords.longitude, label: 'Near you' });
    setMessage('Current location is ready for your next search. Your saved home has not changed.');
  }
  function returnToExplore() {
    if (!profile) { setStage('taste'); return; }
    setStage(activeSearch || intent ? 'explore' : 'location');
  }
  function restoreSearch(search:SavedSearch) {
    setAdjustingSearch(false);
    appliedInput.current=search.input;
    setIntent(null); setActiveSearch(search); setItems(search.items); setQuery(search.input.query); setRadius(search.input.radiusKm); setCuisine(search.input.cuisine); setFoodType(search.input.foodType ?? ''); setMode('for-you');
    setVisitLocation({lat:search.input.lat,lng:search.input.lng,label:search.areaLabel}); locationChoice.current='manual';
    setSearchState('Saved results. Opening this list does not start a new search.'); setStage('explore');
  }
  async function openSearch(id:string) {
    const operation=++searchOperation.current, account=accountOperation.current; setIntent(null);
    const result=await api<{search:SavedSearch}>(`/api/searches/${encodeURIComponent(id)}`);
    if(operation!==searchOperation.current || account!==accountOperation.current)return;
    restoreSearch(result.search); setHistory(current=>[result.search,...current.filter(item=>item.id!==id)]); setAllHistory(false);
  }
  function newSearch() {
    setAdjustingSearch(false);
    appliedInput.current=null;
    searchOperation.current+=1; setIntent(null); setActiveSearch(null); setItems([]); setQuery(''); setCuisine(''); setFoodType(''); setRadius(5); setMode('for-you'); setSearchState('');
    setVisitLocation(homeAddress); locationChoice.current=homeAddress?'home':null; setStage('location');
  }
  function discover(point: Location, label: string, patch: Partial<{ radius: number; query: string; mode: 'for-you' | 'fusion'; cuisine: string; foodType: string }> = {}, refresh=false) {
    setAdjustingSearch(false);
    const next = { radius, query, mode, cuisine, foodType, ...patch };
    searchOperation.current+=1; if(!refresh)setActiveSearch(null);
    setItems([]); setSearchState('Searching Google Maps...'); setVisitLocation({ lat: point.lat, lng: point.lng, label });
    const input:DiscoverInput={lat:point.lat,lng:point.lng,areaLabel:label,...(refresh&&activeSearch?{savedSearchId:activeSearch.id}:{}),radiusKm:next.radius,query:next.query.trim(),mode:'for-you',cuisine:next.cuisine,foodType:next.foodType,maxPrice:4,searchId:Crypto.randomUUID()};
    appliedInput.current=input; setIntent({ input, label }); setStage('explore');
  }
  useEffect(() => {
    if (!intent || !userId) return;
    const controller = new AbortController(); const started = Date.now(); let titleTimer:ReturnType<typeof setTimeout>|undefined;
    void (async () => {
      try {
        while (!controller.signal.aborted) {
          // Keep the same UUID throughout polling. Only an explicit search
          // creates a new source run, which protects the scraping budget.
          const data = await api<DiscoverResponse>('/api/discover', intent.input, undefined, controller.signal);
          if (controller.signal.aborted) return;
          const preferRelevance = Boolean(intent.input.query.trim() || intent.input.foodType || intent.input.cuisine);
          setItems(current => mergePlaces(current, data.items, data.job?.status === 'succeeded', preferRelevance));
          if(data.savedSearch){setActiveSearch(data.savedSearch);setHistory(current=>[data.savedSearch!,...current.filter(item=>item.id!==data.savedSearch!.id)]);}
          if (data.warning) setMessage(data.warning);
          const placesPending = activeJob(data.job?.status), reviewsPending = activeJob(data.enrichmentJob?.status);
          if (!placesPending && !reviewsPending) {
            const stopped = (data.job && data.job.status !== 'succeeded') || (!data.job && data.dataMode === 'live' && data.warning);
            setSearchState(stopped ? 'The live search did not finish. Any places already found are still here.' : data.items.length ? 'Places are ready.' : 'No matching places found. Try a wider distance or another area.');
            if(data.savedSearch)titleTimer=setTimeout(()=>{if(controller.signal.aborted)return;void api<{items:SavedSearchSummary[]}>('/api/searches').then(value=>{if(controller.signal.aborted)return;setHistory(value.items);setActiveSearch(current=>value.items.find(item=>item.id===current?.id)??current);}).catch(()=>{});},10000);
            return;
          }
          setSearchState(placesPending ? 'Searching Google Maps... Places appear as they arrive.' : 'Places are ready. Checking food details in the background.');
          if (Date.now() - started > 300_000) { setSearchState('The search is taking longer than expected. Refresh results to retry.'); return; }
          await new Promise(resolve => setTimeout(resolve, 3000));
          while (AppState.currentState !== 'active' && !controller.signal.aborted) await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) { if (!controller.signal.aborted) setSearchState(error instanceof Error ? error.message : 'The search did not finish. Please retry.'); }
    })();
    return () => { controller.abort(); if(titleTimer)clearTimeout(titleTimer); };
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
  async function ratePlace(restaurantId:string,sentiment:FeedbackSentiment|null,answerMeal=false) {
    const operation=searchOperation.current, account=accountOperation.current;
    const result=await api<{items:FeedbackItem[]}>('/api/feedback',{restaurantId,sentiment,...(answerMeal?{answerMeal:true}:{})},'PUT');
    if(account!==accountOperation.current)return;
    setFeedback(result.items); if(answerMeal){setPendingMeal(null);setChosenPlace('');}
    if(activeSearch){
      const fresh=await api<{search:SavedSearch}>(`/api/searches/${encodeURIComponent(activeSearch.id)}`);
      if(operation===searchOperation.current&&account===accountOperation.current){setItems(fresh.search.items);setActiveSearch(fresh.search);}
    }
  }
  async function choosePlace(restaurantId:string) {
    const account=accountOperation.current;
    await api('/api/meal',{restaurantId,...(activeSearch?{searchId:activeSearch.id}:{})},'PUT');
    if(account!==accountOperation.current)return;
    setChosenPlace(restaurantId); setMessage('Meal chosen. We will ask how it was next time you visit.');
  }
  async function signOut() {
    const { error } = await supabase!.auth.signOut({ scope: 'local' }); if (error) throw new Error('Sign-out did not finish. Please retry.');
    if (userId) await Promise.all(['taste', 'saved'].map(part => secureStorage.removeItem(storageKey(userId, part))));
    setAuth(null); setAnswers(emptyAnswers()); setHomeAddress(null); setVisitLocation(null); locationChoice.current = null; setIntent(null); setSaved([]); setProfile(null);
  }
  function deleteAccount() {
    Alert.alert('Delete your East Eats account?', 'This permanently deletes your taste profile and saved places. This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete account', style: 'destructive', onPress: () => { void perform('delete', async () => { const result = await api<{ deleted: boolean }>('/api/account', { confirmation: 'DELETE' }, 'DELETE'); if (result.deleted !== true) throw new Error('Account deletion was not confirmed. Please retry.'); await supabase!.auth.signOut({ scope: 'local' }); if (userId) await Promise.all(['taste', 'saved'].map(part => secureStorage.removeItem(storageKey(userId, part)))); setAuth(null); }); } }]);
  }
  const card = (restaurant: Restaurant, rank?: RankedRestaurant) => <RestaurantCard key={restaurant.id} restaurant={restaurant} rank={rank} saved={saved.some(place => place.id === restaurant.id)} busy={Boolean(busy)} onSave={() => { void perform('saved', () => toggleSaved(restaurant)); }} sentiment={feedback.find(vote=>vote.restaurantId===restaurant.id)?.sentiment} onFeedback={value=>{void perform('feedback',()=>ratePlace(restaurant.id,value));}} onChoose={()=>{void perform('meal',()=>choosePlace(restaurant.id));}} chosen={chosenPlace===restaurant.id} />;

  return <SafeAreaProvider><SafeAreaView style={s.safe}><StatusBar style="dark" /><View style={s.header}><T style={s.wordmark}>east eats.</T>{auth && <Button title="Account" secondary onPress={() => setStage('account')} />}</View><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView ref={scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
    {message && <View style={s.notice}><T accessibilityRole="alert" style={{ fontSize: 14 }}>{message}</T><Button title="Dismiss" secondary onPress={() => setMessage('')} /></View>}
    {(!fontsLoaded && !fontError) || booting ? <ActivityIndicator color={brand} accessibilityLabel="Loading East Eats" /> : !auth ? <View style={{ gap: 22 }}><Title>Find your kind of good.</Title><T style={s.subtitle}>East Asian food picked for your taste. Start with the places you already love.</T><Button title={busy ? 'Opening sign-in...' : 'Continue with Google'} secondary disabled={!configured || Boolean(busy)} onPress={() => { void perform('login', signInGoogle); }} />{appleAvailable && <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={25} style={{ width: '100%', height: 50 }} onPress={() => { void perform('login', signInApple); }} />}{!configured && <T style={s.small}>This development build needs the public Supabase URL and publishable key before sign-in is available.</T>}<Button title="Privacy policy" secondary onPress={() => { void Linking.openURL(`${API_ORIGIN}/privacy`); }} /></View> : <>
    {pendingMeal && <View style={s.card}><T accessibilityRole="header" style={s.sectionTitle}>How was {pendingMeal.restaurant.name}?</T><T style={s.small}>Your opinion helps pick the next meal.</T><View style={s.wrap}>{(['like','neutral','dislike'] as const).map(value=><Button key={value} title={value==='like'?'Liked it':value==='neutral'?'It was okay':'Disliked it'} disabled={Boolean(busy)} secondary onPress={()=>{void perform('opinion',()=>ratePlace(pendingMeal.restaurantId,value,true));}} />)}</View><Button title="Not yet" secondary onPress={()=>setPendingMeal(null)} /></View>}
    {profile && <View style={{gap:10}}><View style={[s.row,{justifyContent:'space-between'}]}><T style={s.label}>Your searches</T><Button title="New search" secondary disabled={Boolean(busy)} onPress={newSearch} /></View><ScrollView horizontal contentContainerStyle={{gap:8}}>{history.slice(0,4).map(search=><Button key={search.id} title={search.title} selected={activeSearch?.id===search.id} disabled={Boolean(busy)} secondary onPress={()=>{void perform('history',()=>openSearch(search.id));}} />)}</ScrollView>{history.length>4&&<Button title={allHistory?'Hide history':'All searches'} secondary onPress={()=>setAllHistory(!allHistory)} />}{allHistory&&history.map(search=><Button key={search.id} title={search.title+' · '+search.resultCount+' places'} disabled={Boolean(busy)} secondary onPress={()=>{void perform('history',()=>openSearch(search.id));}} />)}</View>}
    {stage === 'taste' && <Questionnaire answers={answers} onChange={setAnswers} onSave={() => { void perform('taste', saveTaste); }} busy={Boolean(busy)} homeEditor={<HomeAddress key={userId} value={homeAddress} onChange={updateHome} onUseCurrent={() => { void perform('location', useCurrent); }} locating={busy === 'location'} />} />}
    {stage === 'interpretation' && profile && <View style={{ gap: 20 }}><Title>Here is what we are hearing.</Title><T style={s.small}>Right now: {GOALS.find(goal => goal.value === answers.goal)?.label ?? 'A bit of everything'}</T><View style={s.card}><T>{profile.interpretation}</T></View><Field label="Anything we missed?" multiline value={correction} onChangeText={setCorrection} maxLength={1500} /><Button title="Update my tastes" secondary disabled={Boolean(busy)} onPress={() => { void perform('taste', saveTaste); }} /><Button title="Find somewhere" onPress={returnToExplore} /><Button title="Edit my favorites" secondary onPress={() => setStage('taste')} /></View>}
    {stage === 'location' && <><SearchOptions query={query} cuisine={cuisine} foodType={foodType} radius={radius} onQuery={setQuery} onCuisine={setCuisine} onFoodType={setFoodType} onRadius={setRadius} /><AreaPicker key={homeAddress?.label ?? 'none'} initialValue={homeAddress?.label ?? ''} onChoose={(point,label)=>{locationChoice.current=label==='Near you'?'gps':'manual';setVisitLocation({...point,label});}} />{homeAddress && <Button title="Use saved home" secondary onPress={()=>{locationChoice.current='home';setVisitLocation(homeAddress);}} />}{visitLocation&&<T style={s.small}>Search near {visitLocation.label}</T>}<Button title="Start search" disabled={!visitLocation||Boolean(busy)} onPress={()=>{if(visitLocation)discover(visitLocation,visitLocation.label);}} /></>}
    {stage === 'explore' && (activeSearch || intent) && <View style={{gap:18}}>
      <T style={s.small}>{activeSearch?.areaLabel ?? visitLocation?.label ?? 'Nearby'}</T><Title>{activeSearch?.title ?? 'Finding your next meal.'}</Title>
      <T style={s.small}>{items.length} {items.length===1?'place':'places'} / {searchState}</T>
      <View style={s.wrap}><Button title="Adjust search" secondary onPress={()=>setAdjustingSearch(!adjustingSearch)} /><Button title="Refresh this search" secondary disabled={Boolean(busy)} onPress={()=>{if(visitLocation){const applied=appliedInput.current;discover(visitLocation,visitLocation.label,applied?{query:applied.query,cuisine:applied.cuisine,foodType:applied.foodType??'',radius:applied.radiusKm}:{},true);}}} /></View>
      {adjustingSearch&&<View style={s.card}><T style={s.small}>Run these options to create a new list. Changing options alone doesn't start a search.</T><SearchOptions query={query} cuisine={cuisine} foodType={foodType} radius={radius} onQuery={setQuery} onCuisine={setCuisine} onFoodType={setFoodType} onRadius={setRadius} /><Button title="Search with these options" onPress={()=>{if(visitLocation)discover(visitLocation,visitLocation.label);}} /><Button title="Change area" secondary onPress={()=>setStage('location')} /></View>}
      <Button title={showMap?'Hide map':'Show map'} secondary onPress={()=>setShowMap(!showMap)} />{showMap&&visitLocation&&<NativeMap center={visitLocation} items={items} />}
      {items.map(item=>card(item.restaurant,item))}
    </View>}
    {stage === 'saved' && <View style={{ gap: 18 }}><Title>Your places.</Title><T accessibilityRole="header" style={s.sectionTitle}>Liked places</T>{feedback.filter(vote=>vote.sentiment==='like').length?feedback.filter(vote=>vote.sentiment==='like').map(vote=>card(vote.restaurant)):<T style={s.small}>Tap Like on a place to keep it here.</T>}<T accessibilityRole="header" style={s.sectionTitle}>Saved bookmarks</T>{offlineSaved && <T style={s.small}>Showing your saved offline copy. Details may have changed.</T>}{saved.length ? saved.map(place => card(place)) : <T>Save a restaurant while exploring and it will be waiting here.</T>}</View>}
    {stage === 'account' && <View style={{ gap: 18 }}><Title>Your account.</Title><HomeAddress key={userId} value={homeAddress} onChange={updateHome} onUseCurrent={() => { void perform('location', useCurrent); }} locating={busy === 'location'} /><T>{auth.user.email}</T><Button title="Privacy policy" secondary onPress={() => { void Linking.openURL(`${API_ORIGIN}/privacy`); }} /><Button title="Account deletion information" secondary onPress={() => { void Linking.openURL(`${API_ORIGIN}/delete-account`); }} /><Button title="Sign out" secondary disabled={Boolean(busy)} onPress={() => { void perform('logout', signOut); }} /><Button title="Delete account" destructive disabled={Boolean(busy)} onPress={deleteAccount} /></View>}
    </>}
  </ScrollView></KeyboardAvoidingView>{auth && !booting && <View style={s.tabs}>{(['explore', 'saved', 'taste'] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: stage === tab }} onPress={() => { if (tab === 'explore') returnToExplore(); else setStage(tab); }} style={[s.tab, stage === tab && { backgroundColor: '#FFF0EC' }]}><T style={[s.tabText, stage === tab && { color: '#B4210B' }]}>{tab === 'explore' ? 'Explore' : tab === 'saved' ? 'Saved' : 'Taste'}</T></Pressable>)}</View>}</SafeAreaView></SafeAreaProvider>;
}
