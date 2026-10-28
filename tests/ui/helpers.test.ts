import { describe, expect, it } from 'vitest';
import { authNotice, goalDraftKey, parseDraft, parseGoalDraft, safeExternalUrl, toggleReason, validFavorites } from '../../src/components/ui-helpers';
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
  it('restores only known dining goals without changing legacy favorite drafts', () => {
    for (const goal of ['hidden-gems', 'date-night', 'service', 'balanced']) expect(parseGoalDraft(JSON.stringify(goal))).toBe(goal);
    for (const raw of [null, 'broken', '"unknown"', '{}', '[]', 'null', '12']) expect(parseGoalDraft(raw)).toBeUndefined();
    expect(parseDraft(JSON.stringify([favorite]))).toEqual([favorite]);
  });
  it('keeps each user goal separate from favorites and other users', () => {
    expect(goalDraftKey('user-a')).not.toBe(goalDraftKey('user-b'));
    expect(goalDraftKey('a:b')).not.toBe(goalDraftKey('a%3Ab'));
    expect(goalDraftKey('user-a')).not.toBe('east-eats:taste:user-a');
  });
});
describe('external source links', () => {
  it('rejects executable or malformed URLs', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeExternalUrl('data:text/html,no')).toBeUndefined();
    expect(safeExternalUrl('https://maps.google.com/')).toBe('https://maps.google.com/');
  });
});
describe('sign-in feedback', () => {
  it('explains callback failures and setup without reflecting untrusted query text', () => {
    expect(authNotice('?auth=failed')).toContain('Sign-in did not finish');
    expect(authNotice('?auth=setup')).toContain('waiting for setup');
    expect(authNotice('?error=untrusted-content')).not.toContain('untrusted-content');
    expect(authNotice('?auth=unknown')).toBe('');
  });
});
