import { describe, expect, it } from 'vitest';
import { parseDraft, safeExternalUrl, toggleReason, validFavorites } from '../../src/components/ui-helpers';
const favorite = { restaurantId: 'a', name: 'Noodle Field', city: 'Berkeley', reasons: [], notes: '' };
describe('questionnaire behavior', () => {
  it('requires a reason before a favorite can complete onboarding', () => {
    expect(validFavorites([favorite])).toBe(false);
    expect(validFavorites([toggleReason(favorite, 'Great value')])).toBe(true);
    expect(validFavorites([{ ...favorite, notes: 'Springy noodles' }])).toBe(true);
  });
  it('toggles a reason without duplicates or changing other favorites', () => {
    const next = toggleReason(favorite, 'Great value');
    expect(next.reasons).toEqual(['Great value']);
    expect(toggleReason(next, 'Great value').reasons).toEqual([]);
    expect(favorite.reasons).toEqual([]);
  });
  it('restores unfinished draft answers but rejects corrupt or oversized data', () => {
    expect(parseDraft(JSON.stringify([favorite]))).toEqual([favorite]);
    expect(parseDraft('broken')).toBeNull();
    expect(parseDraft(JSON.stringify(Array(6).fill(favorite)))).toBeNull();
    expect(parseDraft(JSON.stringify([{ ...favorite, notes: 7 }]))).toBeNull();
  });
});
describe('external source links', () => {
  it('rejects executable or malformed URLs', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeExternalUrl('data:text/html,no')).toBeUndefined();
    expect(safeExternalUrl('https://maps.google.com/')).toBe('https://maps.google.com/');
  });
});
