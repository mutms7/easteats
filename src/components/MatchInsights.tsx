import type { RankedRestaurant } from '@/lib/contracts';
import { restaurantReviewSignals } from '@/lib/restaurant-insights';

const aspects = [['food', 'Food'], ['value', 'Value'], ['service', 'Service'], ['atmosphere', 'Atmosphere'], ['taste', 'Taste fit']] as const;
export default function MatchInsights({ item }: { item: RankedRestaurant; expanded?: boolean }) {
  const signals = item.scoreBreakdown ?? restaurantReviewSignals(item.restaurant);
  return <div className="score-circles" role="group" aria-label="Restaurant review scores">{aspects.map(([key, label]) => {
    const raw = signals[key]; const score = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : null;
    return <div className="score-circle-item" role="img" key={key} aria-label={`${label}: ${score === null ? 'Unknown' : `${score} out of 100`}`}><span className="score-circle-label">{label}</span><span className={`score-circle${score === null ? ' is-unknown' : ''}`} aria-hidden="true">{score === null ? '--' : score}</span><span className="score-circle-unit">{score === null ? 'Unknown' : 'out of 100'}</span></div>;
  })}</div>;
}
