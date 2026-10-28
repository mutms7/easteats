import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { callbackCode, apiOrigin, safeHttps, mergePlaces, activeJob } from '../src/policies.ts';

describe('native sign-in boundary', () => {
  it('accepts only the exact code callback and never accepts implicit tokens', () => {
    assert.equal(callbackCode('easteats://auth/callback?code=pkce-code'), 'pkce-code');
    for (const url of ['https://evil.example/auth/callback?code=a', 'easteats://evil/callback?code=a', 'easteats://auth/other?code=a', 'easteats://auth/callback#access_token=token', 'easteats://auth/callback?error=failed', 'easteats://user@auth/callback?code=a']) assert.throws(() => callbackCode(url));
  });
  it('restricts authenticated requests to a configured HTTPS origin', () => {
    assert.equal(apiOrigin(undefined), 'https://easteats.vercel.app');
    assert.equal(apiOrigin('https://easteats.vercel.app/'), 'https://easteats.vercel.app');
    for (const origin of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?token=abc']) assert.throws(() => apiOrigin(origin));
    assert.equal(safeHttps('javascript:alert(1)'), undefined);
    assert.equal(safeHttps('https://example.com/photo.jpg'), 'https://example.com/photo.jpg');
  });
});
describe('progressive discovery', () => {
  const place = (id: string, title = id) => ({ restaurant: { id }, title });
  it('appends every matching place as it arrives without jumping the existing order', () => {
    const result = mergePlaces([place('a')], [place('b'), place('a', 'updated'), place('c')], false);
    assert.deepEqual(result.map(item => item.restaurant.id), ['a', 'b', 'c']);
    assert.equal(result[0].title, 'updated');
  });
  it('keeps old cached rows during partial search and prunes them at source completion', () => {
    assert.deepEqual(mergePlaces([place('old')], [place('new')], false).map(item => item.restaurant.id), ['old', 'new']);
    assert.deepEqual(mergePlaces([place('old')], [place('new')], true).map(item => item.restaurant.id), ['new']);
  });
  it('honors explicit-search relevance for a late specialist while retaining partial cached rows below it', () => {
    const current = [place('broad'), place('old-cache')];
    const incoming = [place('specialist'), place('broad', 'fresh')];
    const partial = mergePlaces(current, incoming, false, true);
    assert.deepEqual(partial.map(item => item.restaurant.id), ['specialist', 'broad', 'old-cache']);
    assert.equal(partial[1].title, 'fresh');
    assert.deepEqual(mergePlaces(partial, incoming, true, true).map(item => item.restaurant.id), ['specialist', 'broad']);
  });
  it('does not treat completed or failed work as pending', () => {
    assert.equal(activeJob('queued'), true); assert.equal(activeJob('running'), true);
    for (const status of ['succeeded', 'failed', 'budget_limited', 'uncertain', undefined]) assert.equal(activeJob(status), false);
  });
});

import { GOALS } from '../src/taste-options.ts';
import { TASTE_GOAL_OPTIONS } from '../../src/lib/taste-goals.ts';
it('keeps native dining priorities aligned with the shared API/web choices', () => { assert.deepEqual(GOALS, TASTE_GOAL_OPTIONS); });
