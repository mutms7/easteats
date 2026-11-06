'use client';

import { useEffect, useId, useState } from 'react';
import { parseRadius, radiusInKm, radiusInUnits, type DistanceUnits } from '@/lib/preferences';

export default function RadiusControl({ value, units, onChange, onValidityChange, label = 'Distance' }: { value: number; units: DistanceUnits; onChange: (km: number) => void; onValidityChange: (valid: boolean) => void; label?: string }) {
  const id = useId();
  const presets = units === 'metric' ? [.2, .5, 1, 2, 5, 10, 15, 25, 50] : [.2, .5, 1, 3, 5, 10, 20, 30];
  const preset = presets.find(distance => Math.abs(radiusInKm(distance, units) - value) < 1e-8);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const suffix = units === 'metric' ? 'km' : 'mi';
  const raw = draft ?? String(Number(radiusInUnits(value, units).toFixed(6)));
  const invalid = parseRadius(raw, units) === null;
  useEffect(() => { onValidityChange(!invalid); }, [invalid, onValidityChange]);
  return <div className="radius-control"><label htmlFor={id}>{label}</label><select id={id} value={custom || preset === undefined ? 'custom' : String(preset)} onChange={event => {
    const next = event.target.value;
    setDraft(null); setCustom(next === 'custom'); onValidityChange(true);
    if (next !== 'custom') onChange(radiusInKm(Number(next), units));
  }}>{presets.map(distance => <option key={distance} value={distance}>{distance} {suffix}</option>)}<option value="custom">Custom distance</option></select>
    {(custom || preset === undefined) && <div className="custom-radius"><label htmlFor={`${id}-custom`}>Custom distance ({suffix})</label><input id={`${id}-custom`} type="text" inputMode="decimal" value={raw} aria-invalid={invalid} aria-describedby={`${id}-hint`} onChange={event => {
      setDraft(event.target.value); const km = parseRadius(event.target.value, units); onValidityChange(km !== null); if (km !== null) onChange(km);
    }} /><p id={`${id}-hint`} className={invalid ? 'radius-error' : 'small'} role={invalid ? 'alert' : undefined}>{invalid ? 'Enter a distance within the range. ' : ''}{units === 'metric' ? '0.1 to 50 km.' : '0.062138 to 31.06856 mi (0.1 to 50 km).'}</p></div>}
  </div>;
}
