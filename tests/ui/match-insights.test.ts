import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import MatchInsights from '@/components/MatchInsights';
import {demoRestaurants} from '@/server/demo';
import type {RankedRestaurant} from '@/lib/contracts';
const item:RankedRestaurant={restaurant:{...demoRestaurants[0],features:null},score:50,distanceKm:1,confidence:0,explanation:'Nearby',scoreBreakdown:{food:83,value:0,service:null,atmosphere:null,taste:null}};
it('renders supported scores including zero without Unknown placeholders',()=>{
 const html=renderToStaticMarkup(createElement(MatchInsights,{item}));
 expect(html).toContain('Food: 83 out of 100');
 expect(html).toContain('Value: 0 out of 100');
 expect(html).not.toContain('Unknown');
 expect(html).not.toContain('Service');
});
it('distinguishes unavailable analysis from analyzed reviews without score evidence',()=>{
 const empty={...item,scoreBreakdown:{food:null,value:null,service:null,atmosphere:null,taste:null}};
 expect(renderToStaticMarkup(createElement(MatchInsights,{item:empty}))).toContain('Review analysis is not available yet');
 const analyzed={...empty,restaurant:{...empty.restaurant,features:{...demoRestaurants[0].features!,reviewCount:10}}};
 expect(renderToStaticMarkup(createElement(MatchInsights,{item:analyzed}))).toContain('These reviews do not provide enough detail');
});
