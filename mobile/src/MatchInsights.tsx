import { View } from 'react-native';
import { restaurantReviewSignals } from '../../src/lib/restaurant-insights';
import type { RankedRestaurant } from './types';
import { brand, T } from './ui';
const aspects = [['food', 'Food'], ['value', 'Value'], ['service', 'Service'], ['atmosphere', 'Atmosphere'], ['taste', 'Taste fit']] as const;
export function MatchInsights({ item }: { item: RankedRestaurant }) {
  const signals = item.scoreBreakdown ?? restaurantReviewSignals(item.restaurant);
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }} accessibilityLabel="Restaurant scores">{aspects.map(([key, label]) => {
    const raw = signals[key], score = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : null;
    return <View key={key} accessible accessibilityLabel={`${label}: ${score === null ? 'Unknown' : `${score} out of 100`}`} style={{ minWidth: 74, alignItems: 'center', gap: 4 }}>
      <T style={{ fontSize: 12, fontWeight: '700' }}>{label}</T>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: score === null ? '#F1F1F1' : brand, alignItems: 'center', justifyContent: 'center' }}><T style={{ color: score === null ? '#626262' : '#FFFFFF', fontSize: 14, fontWeight: '800' }}>{score === null ? '?' : score}</T></View>
      <T style={{ fontSize: 10, lineHeight: 14, color: '#626262' }}>{score === null ? 'Unknown' : '/100'}</T>
    </View>;
  })}</View>;
}
