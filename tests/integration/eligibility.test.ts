import {it,expect} from 'vitest';
import {isEastAsianRestaurant} from '@/lib/eligibility';
import {demoRestaurants} from '@/server/demo';
it('requires East Asian evidence rather than assuming every search hit qualifies',()=>{const r=demoRestaurants[0];expect(isEastAsianRestaurant(r)).toBe(true);expect(isEastAsianRestaurant({...r,cuisines:['Indian restaurant'],features:null})).toBe(false);expect(isEastAsianRestaurant({...r,cuisines:['Fusion'],features:{...r.features!,cuisines:['Japanese']}})).toBe(true);});
