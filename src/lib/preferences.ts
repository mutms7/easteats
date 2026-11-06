export type DistanceUnits = 'metric' | 'imperial';
export type SearchPreferences = { units: DistanceUnits; radiusKm: number; variety: boolean };
export const PREFERENCES_KEY = 'east-eats:search-options:v1';
export const DEFAULT_PREFERENCES: SearchPreferences = { units: 'metric', radiusKm: 1, variety: true };
export const KM_PER_MILE = 1.609344;
export const radiusInUnits = (km: number, units: DistanceUnits) => units === 'imperial' ? km / KM_PER_MILE : km;
export const radiusInKm = (value: number, units: DistanceUnits) => units === 'imperial' ? value * KM_PER_MILE : value;
export function parseRadius(raw: string, units: DistanceUnits): number | null {
  if (!/^\d*\.?\d+$/.test(raw.trim())) return null;
  const km = radiusInKm(Number(raw), units);
  return Number.isFinite(km) && km >= .1 - 1e-6 && km <= 50 + 1e-6 ? Math.max(.1, Math.min(50, km)) : null;
}
export function parsePreferences(raw: string | null): SearchPreferences {
  try {
    const value = JSON.parse(raw ?? '{}');
    return {
      units: value?.units === 'imperial' ? 'imperial' : 'metric',
      radiusKm: typeof value?.radiusKm === 'number' && Number.isFinite(value.radiusKm) && value.radiusKm >= .1 && value.radiusKm <= 50 ? value.radiusKm : 1,
      variety: typeof value?.variety === 'boolean' ? value.variety : true,
    };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}
export function formatDistance(km: number, units: DistanceUnits = 'metric'): string {
  return units === 'imperial' ? `${(km / KM_PER_MILE).toFixed(1)} mi` : km < 1 ? `${Math.round(km * 1000)} m` : `${Number(km.toFixed(1))} km`;
}
