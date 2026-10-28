import { View } from 'react-native';
import { restaurantReviewSignals } from '../../src/lib/restaurant-insights';
import type { RankedRestaurant } from './types';
import { s, T } from './ui';
const aspects = [['food', 'Food'], ['value', 'Value'], ['service', 'Service'], ['atmosphere', 'Atmosphere'], ['taste', 'Taste fit']] as const;
export function MatchInsights({ item }: { item: RankedRestaurant }) {
  const signals = item.scoreBreakdown ?? restaurantReviewSignals(item.restaurant);
  return <View style={{ backgroundColor: '#F7F7F7', padding: 14, borderRadius: 12, gap: 12 }}><T style={{ fontWeight: '700', fontSize: 15 }}>Why this place</T>{item.matchReasons?.length ? item.matchReasons.map(reason => <T key={reason} style={{ fontSize: 14, lineHeight: 22 }}>{reason}</T>) : <T style={{ fontSize: 14, lineHeight: 22 }}>{item.explanation}</T>}<T style={{ fontWeight: '700', fontSize: 14 }}>Review signals</T><T style={s.small}>{item.restaurant.features?.reviewCount ?? 0} reviews analyzed. {item.confidence < .35 ? 'Limited evidence.' : 'Some evidence available.'} Read-only signals, not Google stars.</T>{aspects.map(([key, label]) => {
    const raw = signals[key]; const known = typeof raw === 'number' && Number.isFinite(raw); const score = known ? Math.max(0, Math.min(100, Math.round(raw))) : null;
    return <View key={key} accessible accessibilityLabel={`${label}: ${score === null ? 'Unknown' : `${score} out of 100`}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><T style={{ width: 78, fontSize: 12 }}>{label}</T><View style={{ height: 5, flex: 1, backgroundColor: score === null ? 'transparent' : '#DEDEDE', borderRadius: 9, borderTopWidth: score === null ? 2 : 0, borderColor: '#D4D4D4', borderStyle: 'dashed' }}>{score !== null && <View style={{ width: `${score}%`, height: '100%', backgroundColor: '#E12D12', borderRadius: 9 }} />}</View><T style={[s.small, { width: 60, textAlign: 'right' }]}>{score === null ? 'Unknown' : `${score}/100`}</T></View>;
  })}</View>;
}
