import type { RankedRestaurant } from '@/lib/contracts';
import { restaurantReviewSignals } from '@/lib/restaurant-insights';

const aspects = [['food', 'Food'], ['value', 'Value'], ['service', 'Service'], ['atmosphere', 'Atmosphere'], ['taste', 'Taste fit']] as const;
export default function MatchInsights({ item }: { item: RankedRestaurant; expanded?: boolean }) {
  const signals = item.scoreBreakdown ?? restaurantReviewSignals(item.restaurant);
  const available = aspects.flatMap(([key, label]) => {
    const raw = signals[key];
    return typeof raw === 'number' && Number.isFinite(raw)
      ? [{ key, label, score: Math.max(0, Math.min(100, Math.round(raw))) }] : [];
  });
  if (!available.length) return <p className="small">{item.restaurant.features?.reviewCount
    ? 'These reviews do not provide enough detail for scores yet.'
    : 'Review analysis is not available yet. See the listing for reviews.'}</p>;
  return <div className="score-circles" role="group" aria-label="Restaurant review scores">{available.map(({key, label, score}) =>
    <div className="score-circle-item" role="img" key={key} aria-label={`${label}: ${score} out of 100`}><span className="score-circle-label">{label}</span><span className="score-circle" aria-hidden="true">{score}</span><span className="score-circle-unit">out of 100</span></div>
  )}</div>;
}
