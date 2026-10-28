import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { api } from './api';
import { activeJob } from './policies';
import { Button, Field, s, T, Title } from './ui';
import type { Favorite, RefreshJob, Restaurant, TasteInput } from './types';
import { GOALS } from './taste-options';
export { GOALS } from './taste-options';
const reasons = ['The food itself', 'Regional dishes', 'Great value', 'Spice and bold flavors', 'Atmosphere', 'Friendly service'];
export function validAnswers(value: TasteInput) { return value.favorites.length >= 1 && value.favorites.length <= 5 && value.favorites.every(favorite => favorite.reasons.length > 0 || favorite.notes.trim().length > 0); }
export function Questionnaire({ answers, onChange, onSave, busy, homeEditor }: { answers: TasteInput; onChange: (value: TasteInput) => void; onSave: () => void; busy: boolean; homeEditor?: ReactNode }) {
  const [query, setQuery] = useState(''); const [city, setCity] = useState('');
  const [items, setItems] = useState<Restaurant[]>([]); const [status, setStatus] = useState('');
  const [searching, setSearching] = useState(false); const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function search() {
    if (!query.trim()) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const searchId = Crypto.randomUUID(); const started = Date.now(); const snapshot = { query: query.trim(), city: city.trim(), searchId };
    setItems([]); setSearching(true); setStatus('Searching Google Maps...');
    try {
      while (!controller.signal.aborted) {
        const data = await api<{ items: Restaurant[]; job: RefreshJob | null }>('/api/places/search', snapshot, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setItems(data.items);
        if (!activeJob(data.job?.status)) {
          setStatus(data.job && data.job.status !== 'succeeded' ? 'This search did not finish. You can retry.' : data.items.length ? 'Choose your favorite below.' : 'No places matched. Try adding a city or checking the name.'); return;
        }
        if (Date.now() - started >= 180_000) { setStatus('This search is taking longer than expected. Please retry shortly.'); return; }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error) { if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Search did not finish. Please retry.'); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  }
  function changeFavorite(index: number, patch: Partial<Favorite>) { onChange({ ...answers, favorites: answers.favorites.map((favorite, i) => i === index ? { ...favorite, ...patch } : favorite) }); }
  return <View style={{ gap: 20 }}><Title>Where do you love eating?</Title><T style={s.subtitle}>Add up to five favorites, anywhere. One is enough.</T>
    <View accessibilityRole="radiogroup" accessibilityLabel="What matters most right now?" style={{ gap: 10 }}><T style={s.sectionTitle}>What matters most right now?</T>{GOALS.map(goal => <Pressable key={goal.value} accessibilityRole="radio" accessibilityLabel={goal.label} accessibilityHint={goal.description} accessibilityState={{ checked: answers.goal === goal.value }} onPress={() => onChange({ ...answers, goal: goal.value })} style={[s.card, answers.goal === goal.value && { borderColor: '#E12D12', backgroundColor: '#FFF0EC' }]}><T style={{ fontWeight: '700' }}>{goal.label}</T><T style={s.small}>{goal.description}</T></Pressable>)}</View>
    {homeEditor}
    <Field label="Restaurant name" value={query} onChangeText={setQuery} maxLength={150} placeholder="Pho99" returnKeyType="search" onSubmitEditing={() => { void search(); }} /><Field label="City (optional)" value={city} onChangeText={setCity} maxLength={100} placeholder="Coquitlam" /><Button title="Find restaurant" disabled={searching || !query.trim()} secondary onPress={() => { void search(); }} />{searching && <ActivityIndicator color="#E12D12" />}<T accessibilityLiveRegion="polite" style={s.small}>{status}</T>
    {items.map(item => <View key={item.id} style={s.card}><T style={{ fontWeight: '700' }}>{item.name}</T><T style={s.small}>{item.city} / {item.address}</T><Button title={answers.favorites.some(favorite => favorite.restaurantId === item.id) ? 'Added' : `Add ${item.name}`} secondary disabled={answers.favorites.length >= 5 || answers.favorites.some(favorite => favorite.restaurantId === item.id)} onPress={() => onChange({ ...answers, favorites: [...answers.favorites, { restaurantId: item.id, name: item.name, city: item.city, reasons: [], notes: '' }] })} /></View>)}
    {answers.favorites.map((favorite, index) => <View key={favorite.restaurantId} style={s.card}><T style={s.sectionTitle}>{favorite.name}</T><T style={s.small}>{favorite.city}</T><T>What keeps you coming back?</T>{reasons.map(reason => <Button key={reason} title={reason} secondary selected={favorite.reasons.includes(reason)} onPress={() => changeFavorite(index, { reasons: favorite.reasons.includes(reason) ? favorite.reasons.filter(value => value !== reason) : [...favorite.reasons, reason] })} />)}<Field label={`Tell us more about ${favorite.name} (optional)`} value={favorite.notes} onChangeText={notes => changeFavorite(index, { notes })} multiline maxLength={1500} style={{ minHeight: 100, textAlignVertical: 'top' }} /><Button title={`Remove ${favorite.name}`} secondary onPress={() => onChange({ ...answers, favorites: answers.favorites.filter((_, i) => i !== index) })} /></View>)}
    <Button title={busy ? 'Saving your tastes...' : 'Find my next meal'} disabled={busy || !validAnswers(answers)} onPress={onSave} />
  </View>;
}
