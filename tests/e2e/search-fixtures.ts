import type { Page } from '@playwright/test';
import type { DiscoverInput, FeedbackItem, MealCheckin, RankedRestaurant, SavedLocation, SavedSearch, TasteInput } from '../../src/lib/contracts';
export async function openAdjustSearch(page: Page) {
  const panel = page.locator('.search-adjust');
  if (await panel.getAttribute('open') === null) await panel.locator('summary').click();
}
export const fixtureHome: SavedLocation = { label: 'Fixture home, Waterloo, ON', lat: 43.52, lng: -80.52 };
export const fixtureProfile = { version: 1, weights: { food: .35, taste: .3, value: .15, proximity: .1, service: .05, atmosphere: .05 }, cuisines: ['Korean'], dishes: ['Noodles'], flavors: [], spicePreference: null, fusionPreference: null, interpretation: 'Fixture profile.', updatedAt: '2026-10-28T00:00:00Z' };
export const fixtureAnswers: TasteInput = { favorites: [{ restaurantId: 'fixture-favorite', name: 'Fixture favorite', city: 'Waterloo', reasons: ['Food'], notes: '' }], goal: 'balanced' };
export function fixturePlace(id = 'fixture-noodles', name = 'Fixture Noodle House'): RankedRestaurant {
  return { restaurant: { id, name, address: 'Fixture restaurant address', city: 'Waterloo', lat: 43.521, lng: -80.52, cuisines: ['Korean'], foodTypes: ['noodles'], priceLevel: 2, googleRating: 3.5, reviewCount: 50, sourceUrl: 'https://example.test/place', imageUrl: null, websiteUrl: null, hours: [], isClosed: false, fetchedAt: '2026-10-28T00:00:00Z', features: null }, score: 60, distanceKm: 1, confidence: 0, explanation: 'This prose should not be displayed.', matchReasons: ['This reason should not be displayed.'], scoreBreakdown: { food: 83, value: 0, service: null, atmosphere: null, taste: null } };
}
export function fixtureSearch(id = '11111111-1111-4111-8111-111111111111', title = 'Fixture noodle night', items = [fixturePlace()]): SavedSearch {
  return { id, title, areaLabel: fixtureHome.label, input: { ...fixtureHome, radiusKm: 5, mode: 'for-you', query: '', cuisine: '', maxPrice: 4 }, items, resultCount: items.length, createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z', lastOpenedAt: '2026-10-28T00:00:00Z' };
}
export async function searchFixtures(page: Page, initial: SavedSearch[] = [fixtureSearch()], completed = true) {
  const state = { history: initial, home: fixtureHome as SavedLocation | null, ready: completed, discover: [] as DiscoverInput[], feedback: [] as FeedbackItem[], feedbackWrites: [] as Record<string, unknown>[], meal: null as MealCheckin | null, meals: [] as Record<string, unknown>[], locations: [] as unknown[], tastes: [] as TasteInput[], historyReads: 0, opened: [] as string[] };
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'fixture-search-user' }, configured: true, demo: false, dataMode: 'live', profile: state.ready ? fixtureProfile : null, answers: fixtureAnswers, homeAddress: state.home } }));
  await page.route('**/api/saved', route => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/searches', route => { state.historyReads += 1; return route.fulfill({ json: { items: state.history.map(({ input: _input, items: _items, ...summary }) => summary) } }); });
  await page.route('**/api/searches/*', route => {
    const id = route.request().url().split('/').pop()!; state.opened.push(id);
    const saved = state.history.find(item => item.id === id);
    if (!saved) return route.fulfill({ status: 404, json: { error: 'Fixture search missing.' } });
    const items = [...saved.items].sort((a, b) => {
      const value = (id: string) => state.feedback.find(item => item.restaurantId === id)?.sentiment === 'like' ? 1 : state.feedback.find(item => item.restaurantId === id)?.sentiment === 'dislike' ? -1 : 0;
      return value(b.restaurant.id) - value(a.restaurant.id);
    });
    return route.fulfill({ json: { search: { ...saved, items } } });
  });
  await page.route('**/api/feedback', route => {
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON(); state.feedbackWrites.push(input);
      const restaurant = state.history.flatMap(search => search.items).find(item => item.restaurant.id === input.restaurantId)?.restaurant ?? fixturePlace().restaurant;
      state.feedback = state.feedback.filter(item => item.restaurantId !== input.restaurantId);
      if (input.sentiment) state.feedback.push({ restaurantId: input.restaurantId, sentiment: input.sentiment, restaurant, updatedAt: '2026-10-28T00:00:00Z' });
      if (input.answerMeal) state.meal = null;
    }
    return route.fulfill({ json: { items: state.feedback } });
  });
  await page.route('**/api/meal', route => {
    if (route.request().method() === 'PUT') { const input = route.request().postDataJSON(); state.meals.push(input); const restaurant = state.history.flatMap(search => search.items).find(item => item.restaurant.id === input.restaurantId)!.restaurant; state.meal = { restaurantId: input.restaurantId, restaurant, searchId: input.searchId ?? null, chosenAt: '2026-10-28T00:00:00Z' }; }
    return route.fulfill({ json: { pendingMeal: state.meal } });
  });
  await page.route('**/api/location', route => { const input = route.request().postDataJSON(); state.locations.push(input); state.home = input.homeAddress; return route.fulfill({ json: { homeAddress: state.home } }); });
  await page.route('**/api/geocode', route => route.fulfill({ json: { items: [fixtureHome] } }));
  await page.route('**/api/taste', route => { state.tastes.push(route.request().postDataJSON()); state.ready = true; return route.fulfill({ json: { profile: { ...fixtureProfile, version: 2 }, personalized: true } }); });
  await page.route('**/api/discover', route => {
    const input = route.request().postDataJSON() as DiscoverInput; state.discover.push(input);
    const id = input.savedSearchId ?? input.searchId!;
    const existing = state.history.find(item => item.id === id);
    const search: SavedSearch = { ...fixtureSearch(id, existing?.title ?? `Fixture ${input.query || 'nearby'} search`), input, areaLabel: input.areaLabel ?? fixtureHome.label };
    state.history = [search, ...state.history.filter(item => item.id !== id)];
    const { input: _input, items: _items, ...savedSearch } = search;
    return route.fulfill({ json: { items: search.items, savedSearch, job: null, profileVersion: 1, dataMode: 'live', refreshing: false } });
  });
  return state;
}
