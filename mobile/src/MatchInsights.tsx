import { View } from 'react-native';
import { restaurantReviewSignals } from '../../src/lib/restaurant-insights';
import type { RankedRestaurant } from './types';
import { brand, T } from './ui';
const aspects = [['food', 'Food'], ['value', 'Value'], ['service', 'Service'], ['atmosphere', 'Atmosphere'], ['taste', 'Taste fit']] as const;
export function MatchInsights({ item }: { item: RankedRestaurant }) {
  const signals = item.scoreBreakdown ?? restaurantReviewSignals(item.restaurant);
  const available = aspects.flatMap(([key, label]) => {
    const raw = signals[key];
    return typeof raw === 'number' && Number.isFinite(raw)
      ? [{ key, label, score: Math.max(0, Math.min(100, Math.round(raw))) }] : [];
  });
  if (!available.length) return <T style={{ fontSize: 12, color: '#626262' }}>{item.restaurant.features?.reviewCount
    ? 'These reviews do not provide enough detail for scores yet.'
    : 'Review analysis is not available yet. See the listing for reviews.'}</T>;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }} accessibilityLabel="Restaurant scores">{available.map(({ key, label, score }) =>
    <View key={key} accessible accessibilityLabel={`${label}: ${score} out of 100`} style={{ minWidth: 74, alignItems: 'center', gap: 4 }}>
      <T style={{ fontSize: 12, fontWeight: '700' }}>{label}</T>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: brand, alignItems: 'center', justifyContent: 'center' }}><T style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>{score}</T></View>
      <T style={{ fontSize: 10, lineHeight: 14, color: '#626262' }}>/100</T>
    </View>
  )}</View>;
}
