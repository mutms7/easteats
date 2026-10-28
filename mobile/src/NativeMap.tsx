import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Camera, Map, ViewAnnotation, type CameraRef } from '@maplibre/maplibre-react-native';
import type { Location, RankedRestaurant } from './types';
import { s, T } from './ui';
export function NativeMap({ center, items }: { center: Location; items: RankedRestaurant[] }) {
  const camera = useRef<CameraRef>(null);
  const [failed, setFailed] = useState(false); const [selected, setSelected] = useState('');
  const key = process.env.EXPO_PUBLIC_MAPTILER_KEY;
  const fitKey = items.map(item => `${item.restaurant.id}:${item.restaurant.lat},${item.restaurant.lng}`).join(';');
  function fit() {
    if (!items.length) return;
    const lat = items.map(item => item.restaurant.lat);
    const lng = items.map(item => { let value = item.restaurant.lng; while (value - center.lng > 180) value -= 360; while (value - center.lng < -180) value += 360; return value; });
    camera.current?.fitBounds([Math.min(...lng) - .002, Math.max(-85, Math.min(...lat) - .002), Math.max(...lng) + .002, Math.min(85, Math.max(...lat) + .002)], { padding: { top: 40, right: 40, bottom: 40, left: 40 }, duration: 0 });
  }
  useEffect(() => { fit(); }, [fitKey]);
  if (!key || failed) return <View style={s.card}><T>Map unavailable.</T><T style={s.small}>{failed ? 'Map tiles could not load.' : 'The MapTiler public key is not configured in this build.'} All matching places remain in the list below.</T></View>;
  return <View style={{ gap: 8 }}><View style={{ height: 310, width: '100%', borderRadius: 18, overflow: 'hidden' }}><Map mapStyle={`https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`} onDidFinishLoadingStyle={fit} onDidFailLoadingMap={() => setFailed(true)} accessibilityLabel={`Map showing ${items.length} matching restaurants`}>
    <Camera ref={camera} initialViewState={{ center: [center.lng, center.lat], zoom: 12 }} />
    {items.map((item, index) => <ViewAnnotation key={item.restaurant.id} id={item.restaurant.id} lngLat={[item.restaurant.lng, item.restaurant.lat]} title={item.restaurant.name} onPress={() => setSelected(`${item.restaurant.name}, ${item.restaurant.address}`)}><View accessibilityLabel={item.restaurant.name} style={{ backgroundColor: '#E12D12', width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'white' }}><T style={{ color: 'white', fontSize: 13, fontWeight: '800' }}>{index + 1}</T></View></ViewAnnotation>)}
  </Map></View><T style={s.small}>{items.length} matching places on the map. Names and addresses are also listed below.</T>{selected && <T style={s.small}>{selected}</T>}</View>;
}
