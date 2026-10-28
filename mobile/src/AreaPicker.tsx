import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Location from 'expo-location';
import { api } from './api';
import { Button, Field, s, T, Title } from './ui';
import type { Location as Point } from './types';
type Area = Point & { label: string; primaryText?: string; secondaryText?: string; kind?: string };
export function AreaPicker({ onChoose }: { onChoose: (point: Point, label: string) => void }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Area[]>([]);
  const [state, setState] = useState('');
  const [gps, setGps] = useState(false);
  const operation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current += 1; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setItems([]);
    if (query.trim().length < 3) { setState('Enter at least three characters.'); return; }
    setState('Looking up addresses...');
    const timer = setTimeout(() => {
      api<{ items: Area[] }>('/api/geocode', { query: query.trim() }, undefined, controller.signal).then(data => { if (!controller.signal.aborted) { setItems(data.items); setState(data.items.length ? 'Choose the full address below.' : 'No addresses found. Try adding the city or postal code.'); } }).catch(error => { if (!controller.signal.aborted) setState(error.message); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  function choose(value: Area) { operation.current += 1; onChoose(value, value.label); }
  async function locate() {
    const id = ++operation.current; setGps(true); setState('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!mounted.current || operation.current !== id) return;
      if (permission.status !== 'granted') { setState('Location permission was not granted. Enter an address instead.'); return; }
      const value = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (mounted.current && operation.current === id) onChoose({ lat: value.coords.latitude, lng: value.coords.longitude }, 'Near you');
    } catch { if (mounted.current && operation.current === id) setState('Could not find your location. Enter an address instead.'); }
    finally { if (mounted.current && operation.current === id) setGps(false); }
  }
  return <View style={{ gap: 18 }}><Title>Where are we eating?</Title><T style={s.subtitle}>Enter a street address, campus, neighborhood, or city.</T><Button title={gps ? 'Finding your location...' : 'Use my location'} disabled={gps} onPress={() => { void locate(); }} /><Field label="Address or area" value={query} onChangeText={setQuery} placeholder="200 University Ave W, Waterloo" autoComplete="street-address" /><T accessibilityLiveRegion="polite" style={s.small}>{state}</T>{state === 'Looking up addresses...' && <ActivityIndicator color="#E12D12" />}{items.map((item, index) => <View key={`${item.label}-${index}`} style={s.card}><T style={{ fontWeight: '700' }}>{item.primaryText ?? item.label}</T>{item.secondaryText && <T style={s.small}>{item.secondaryText}</T>}{item.kind === 'street' && <T style={s.small}>Street location, approximate</T>}<Button title={`Choose ${item.label}`} secondary onPress={() => choose(item)} /></View>)}</View>;
}
