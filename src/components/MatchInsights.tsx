import type { RankedRestaurant } from '@/lib/contracts';
import { restaurantReviewSignals } from '@/lib/restaurant-insights';

const aspects = [['food', 'Food'], ['value', 'Value'], ['service', 'Service'], ['atmosphere', 'Atmosphere'], ['taste', 'Taste fit']] as const;
export default function MatchInsights({ item, expanded = false }: { item: RankedRestaurant; expanded?: boolean }) {
  const signals = item.scoreBreakdown ?? restaurantReviewSignals(item.restaurant);
  const analyzed = item.restaurant.features?.reviewCount ?? 0;
  const hasSignals = Object.values(signals).some(value => typeof value === 'number' && Number.isFinite(value));
  return <div className="match-insights"><h3>Why this place</h3>{item.matchReasons?.length ? <ul className="match-reasons">{item.matchReasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : <p>{item.explanation}</p>}
    <details className="review-signals" open={expanded || undefined}><summary>{hasSignals ? "Review signals" : "Review insights pending"}</summary><p className="signals-context">{analyzed ? `${analyzed} reviews analyzed. ${item.confidence < .35 ? "Limited evidence." : item.confidence < .7 ? "Some evidence available." : "More evidence available."}` : "No reviews analyzed yet. Detailed food insights will appear after source reviews are processed."} These signals are separate from Google stars.</p>{hasSignals && <div className="signal-list">{aspects.map(([key, label]) => {
      const raw = signals[key]; const known = typeof raw === 'number' && Number.isFinite(raw); const score = known ? Math.max(0, Math.min(100, Math.round(raw))) : null;
      return <div className="signal-row" key={key}><span>{label}</span>{score === null ? <><span className="signal-track is-unknown" aria-hidden="true" /><span className="signal-value">Unknown</span></> : <><span className="signal-track" role="meter" aria-label={`${label} review signal`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}><span style={{ width: `${score}%` }} /></span><span className="signal-value">{score}/100</span></>}</div>;
    })}</div>}</details>
  </div>;
}
