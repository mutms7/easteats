import { createHash } from 'node:crypto';
import type { DiscoverInput, RankedRestaurant } from '../../lib/contracts.ts';
import { restaurantSearchRelevance } from '../../lib/food-taxonomy.ts';

/** Rotate only near-equal matches. Evidence scores and all other positions stay intact. */
export function exploreRecommendations(items: RankedRestaurant[], input: DiscoverInput, disliked: ReadonlySet<string> = new Set(), relevance?: ReadonlyMap<string, number>): RankedRestaurant[] {
  if (!input.searchId || input.variety === false || items.length < 2) return items;
  const leader = items[0];
  const tierFor = (item: RankedRestaurant) => relevance?.get(item.restaurant.id) ?? restaurantSearchRelevance(item.restaurant, input);
  const tier = tierFor(leader);
  const candidates: RankedRestaurant[] = [];
  for (const item of items) {
    if (item.score >= leader.score - 5 && !disliked.has(item.restaurant.id) && tierFor(item) === tier) candidates.push(item);
    if (candidates.length === 5) break;
  }
  if (candidates.length < 2) return items;
  // Exponential races sample without replacement with softmax weights (temperature 3).
  // Hashing each stable place ID makes polling and saved-search replays reproducible.
  const ordered = candidates.map(item => {
    const hash = createHash('sha256').update(`${input.searchId}:${item.restaurant.id}`).digest().readUInt32BE(0);
    const uniform = (hash + 1) / (0x100000000 + 1);
    const weight = Math.exp((item.score - leader.score) / 3);
    return { item, key: -Math.log(uniform) / weight };
  }).sort((a, b) => a.key - b.key || a.item.restaurant.id.localeCompare(b.item.restaurant.id));
  const ids = new Set(candidates.map(item => item.restaurant.id));
  let index = 0;
  return items.map(item => ids.has(item.restaurant.id) ? ordered[index++].item : item);
}
