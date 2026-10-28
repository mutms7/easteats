import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { api } from './api';
import { AreaPicker } from './AreaPicker';
import { Button, s, T } from './ui';
import type { SavedLocation } from './types';
export function HomeAddress({ value, onChange, onUseCurrent, locating }: { value: SavedLocation | null; onChange: (value: SavedLocation | null) => void; onUseCurrent: () => void; locating: boolean }) {
  const [editing, setEditing] = useState(!value); const [candidate, setCandidate] = useState<SavedLocation | null>(null);
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState(''); const pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function save(next: SavedLocation | null) {
    if (pending.current) return; pending.current = true; setBusy(true); setStatus('');
    const controller = new AbortController(); request.current = controller;
    try {
      const data = await api<{ homeAddress: SavedLocation | null }>('/api/location', { homeAddress: next }, 'PUT', controller.signal);
      if (controller.signal.aborted) return;
      onChange(data.homeAddress); setCandidate(null); setEditing(!data.homeAddress); setStatus(data.homeAddress ? 'Home address saved.' : 'Home address cleared.');
    } catch (error) { if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Home address could not be saved. Please retry.'); }
    finally { pending.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  return <View style={s.card}><T accessibilityRole="header" style={s.sectionTitle}>Home address (optional)</T><T style={s.small}>Save a starting point for nearby searches. It is private account data and is not sent to the taste interpreter.</T>{value && <><T style={{ fontWeight: '700' }}>{value.label}</T><Button title="Change home address" secondary disabled={busy} onPress={() => { setEditing(true); setCandidate(null); }} /><Button title="Clear home address" secondary disabled={busy} onPress={() => { void save(null); }} /></>}{editing && <><AreaPicker key={value?.label ?? 'new'} title="Choose home address" fieldLabel="Home address" showGPS={false} onQueryChange={() => setCandidate(null)} onChoose={(point, label) => setCandidate({ lat: point.lat, lng: point.lng, label })} />{candidate && <T style={s.small}>Selected: {candidate.label}</T>}<Button title={busy ? 'Saving address...' : 'Save home address'} secondary disabled={!candidate || busy} onPress={() => { if (candidate) void save(candidate); }} /></>}<Button title={locating ? 'Finding your location...' : 'Use my current location'} secondary disabled={locating} onPress={onUseCurrent} /><T style={s.small}>Current location is used for this visit. Your saved home stays as it is.</T>{status && <T accessibilityLiveRegion="polite" style={s.small}>{status}</T>}</View>;
}
