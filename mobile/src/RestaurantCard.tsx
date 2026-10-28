import { useState } from 'react';
import { Image, Linking, Share, View } from 'react-native';
import type { RankedRestaurant, Restaurant } from './types';
import { safeHttps } from './policies';
import { Button, s, T } from './ui';

export function RestaurantCard({ restaurant, rank, saved, busy, onSave }: { restaurant: Restaurant; rank?: RankedRestaurant; saved: boolean; busy: boolean; onSave: () => void }) {
  const [failed, setFailed] = useState(false);
  const photo = safeHttps(restaurant.imageUrl);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(restaurant.address)}&destination_place_id=${encodeURIComponent(restaurant.id)}`;
  return <View style={s.card}>
    {photo && !failed ? <Image source={{ uri: photo }} style={s.photo} accessibilityLabel={`Food at ${restaurant.name}`} onError={() => setFailed(true)} /> : <View style={[s.photo, { alignItems: 'center', justifyContent: 'center' }]}><T style={s.small}>Photo unavailable</T></View>}
    <T style={s.small}>{restaurant.cuisines.join(' / ') || 'Cuisine details pending'}</T>
    <T accessibilityRole="header" style={s.sectionTitle}>{restaurant.name}</T>
    <T style={s.small}>{restaurant.city} / {restaurant.priceLevel ? '$'.repeat(restaurant.priceLevel) : 'Price unknown'}{rank ? ` / ${rank.distanceKm.toFixed(1)} km` : ''}</T>
    <T>{restaurant.address}</T>
    {rank && <View style={{ backgroundColor: '#F7F7F7', padding: 13, borderRadius: 12 }}><T style={{ fontWeight: '700', color: '#B4210B', fontSize: 14 }}>Why it fits</T><T style={{ fontSize: 14, lineHeight: 22 }}>{rank.explanation}</T></View>}
    <T style={s.small}>Google: {restaurant.googleRating ?? 'Unrated'}{restaurant.googleRating !== null ? '/5' : ''} / {restaurant.reviewCount} reviews. Checked {new Date(restaurant.fetchedAt).toLocaleDateString()}.</T>
    <Button title={saved ? 'Remove from saved' : 'Save this place'} disabled={busy} onPress={onSave} secondary />
    <View style={s.row}><View style={{ flex: 1 }}><Button title="Directions" secondary onPress={() => { void Linking.openURL(directions); }} /></View><View style={{ flex: 1 }}><Button title="Share" secondary onPress={() => { void Share.share({ message: `${restaurant.name}\n${restaurant.address}\n${safeHttps(restaurant.sourceUrl) ?? directions}` }); }} /></View></View>
    {restaurant.hours.length > 0 && <T style={s.small}>Listed hours: {restaurant.hours.join('; ')}. Confirm before visiting.</T>}
    {restaurant.features?.evidence.map(item => <View key={`${item.id}-${item.aspect}`}><T style={[s.small, { fontWeight: '700' }]}>{item.aspect === 'cleanliness' ? 'Reported cleanliness concern' : item.aspect}</T><T style={s.small}>{item.text}</T>{safeHttps(item.sourceUrl) && <Button title="Review source" secondary onPress={() => { void Linking.openURL(item.sourceUrl); }} />}</View>)}
  </View>;
}
