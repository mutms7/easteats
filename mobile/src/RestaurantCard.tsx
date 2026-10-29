import { useState } from 'react';
import { Image, Linking, Share, View } from 'react-native';
import type { RankedRestaurant, Restaurant, FeedbackSentiment } from './types';
import { safeHttps } from './policies';
import { Button, s, T } from './ui';
import { MatchInsights } from './MatchInsights';
import { classifyRestaurant, FOOD_TYPES } from '../../src/lib/food-taxonomy';

export function RestaurantCard({ restaurant, rank, saved, busy, onSave, sentiment, onFeedback, onChoose, chosen }: { restaurant: Restaurant; rank?: RankedRestaurant; saved: boolean; busy: boolean; onSave: () => void; sentiment?: FeedbackSentiment; onFeedback: (value: FeedbackSentiment|null) => void; onChoose: () => void; chosen?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const tags = classifyRestaurant(restaurant);
  const photo = safeHttps(restaurant.imageUrl);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(restaurant.address)}&destination_place_id=${encodeURIComponent(restaurant.id)}`;
  return <View style={s.card}>
    {photo && !failed ? <Image source={{ uri: photo }} style={s.photo} accessibilityLabel={`Food at ${restaurant.name}`} onError={() => setFailed(true)} /> : <View style={[s.photo, { alignItems: 'center', justifyContent: 'center' }]}><T style={s.small}>Photo unavailable</T></View>}
    <View style={s.wrap}>{[...tags.cuisines, ...tags.foodTypes.map(id => FOOD_TYPES.find(food => food.id === id)?.label ?? id)].map(tag => <T key={tag} style={[s.small, { backgroundColor: '#FFF0EC', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 99, color: '#A5210B' }]}>{tag}</T>)}</View>
    <T accessibilityRole="header" style={s.sectionTitle}>{restaurant.name}</T>
    <T style={s.small}>{restaurant.city} / {restaurant.priceLevel ? '$'.repeat(restaurant.priceLevel) : 'Price unknown'}{rank ? ` / ${rank.distanceKm.toFixed(1)} km` : ''}</T>
    <T>{restaurant.address}</T>
    <MatchInsights item={rank ?? { restaurant, score: 0, distanceKm: 0, confidence: restaurant.features?.confidence ?? 0, explanation: 'A place you saved to explore later.' }} />
    <T style={s.small}>Google: {restaurant.googleRating ?? 'Unrated'}{restaurant.googleRating !== null ? '/5' : ''} / {restaurant.reviewCount} reviews. Checked {new Date(restaurant.fetchedAt).toLocaleDateString()}.</T>
    <View style={s.row}><View style={{ flex: 1 }}><Button title={sentiment === 'like' ? 'Liked' : 'Like'} selected={sentiment === 'like'} disabled={busy} onPress={() => onFeedback(sentiment === 'like' ? null : 'like')} secondary /></View><View style={{ flex: 1 }}><Button title={sentiment === 'dislike' ? 'Disliked' : 'Dislike'} selected={sentiment === 'dislike'} disabled={busy} onPress={() => onFeedback(sentiment === 'dislike' ? null : 'dislike')} secondary /></View></View>
    <Button title={chosen ? 'Chosen for your next meal' : 'Eat here'} selected={chosen} disabled={busy} onPress={onChoose} />
    <Button title={saved ? 'Remove from saved' : 'Save this place'} disabled={busy} onPress={onSave} secondary />
    <View style={s.row}><View style={{ flex: 1 }}><Button title="Directions" secondary onPress={() => { void Linking.openURL(directions); }} /></View><View style={{ flex: 1 }}><Button title="Share" secondary onPress={() => { void Share.share({ message: `${restaurant.name}\n${restaurant.address}\n${safeHttps(restaurant.sourceUrl) ?? directions}` }); }} /></View></View>
    {restaurant.hours.length > 0 && <T style={s.small}>Listed hours: {restaurant.hours.join('; ')}. Confirm before visiting.</T>}
    {!!restaurant.features?.evidence.length && <Button title={showEvidence ? 'Hide review details' : 'Review details'} secondary onPress={() => setShowEvidence(!showEvidence)} />}
    {showEvidence && restaurant.features?.evidence.map(item => <View key={`${item.id}-${item.aspect}`}><T style={[s.small, { fontWeight: '700' }]}>{item.aspect === 'cleanliness' ? 'Reported cleanliness concern' : item.aspect}</T><T style={s.small}>{item.text}</T>{safeHttps(item.sourceUrl) && <Button title="Review source" secondary onPress={() => { void Linking.openURL(item.sourceUrl); }} />}</View>)}
  </View>;
}
