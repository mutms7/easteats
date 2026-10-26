import {it,expect} from 'vitest';
import {isEastAsianRestaurant,isAsianFusionRestaurant} from '@/lib/eligibility';
import {demoRestaurants} from '@/server/demo';
it('requires East Asian evidence rather than assuming every search hit qualifies',()=>{const r=demoRestaurants[0];expect(isEastAsianRestaurant(r)).toBe(true);expect(isEastAsianRestaurant({...r,cuisines:['Indian restaurant'],features:null})).toBe(false);expect(isEastAsianRestaurant({...r,cuisines:['Fusion'],features:{...r.features!,cuisines:['Japanese']}})).toBe(true);});
it('shows sourced Asian fusion and Vietnamese places before model enrichment',()=>{const r=demoRestaurants[0];expect(isEastAsianRestaurant({...r,cuisines:['Vietnamese restaurant'],features:null})).toBe(true);expect(isAsianFusionRestaurant({...r,cuisines:['Asian fusion restaurant'],features:null})).toBe(true);expect(isEastAsianRestaurant({...r,cuisines:['Italian restaurant'],features:null})).toBe(false);});
