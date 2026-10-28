import {describe,expect,it,vi} from 'vitest';
import type {RestaurantFeatures} from '../../src/lib/contracts.ts';
import {classifyRestaurant,FOOD_TYPES,hasAsianDishEvidence,matchRestaurantSearch,restaurantSearchIntent,restaurantSearchRelevance} from '../../src/lib/food-taxonomy.ts';
import {normalizePlace} from '../../src/server/data/normalize.ts';
import {extractFeatures} from '../../src/server/taste/extraction.ts';

const features=(values:Partial<RestaurantFeatures>={}):RestaurantFeatures=>({foodQuality:null,value:null,service:null,atmosphere:null,cuisines:[],dishes:[],flavors:[],spice:null,fusion:false,reviewCount:1,confidence:.1,evidence:[],updatedAt:'2026-10-28T00:00:00Z',...values});
const restaurant=(name='House Kitchen',cuisines=['Chinese'],extra:Partial<{features:RestaurantFeatures|null;foodTypes:string[];listingCategories:string[]}>={})=>({name,cuisines,features:null,...extra});

describe('separate canonical food and cuisine evidence',()=>{
  it('does not infer noodles or any other food from a cuisine',()=>{
    for(const cuisine of ['Chinese','Korean','Japanese','Vietnamese','Thai','Taiwanese'])expect(classifyRestaurant(restaurant('House Kitchen',[cuisine]))).toEqual({cuisines:[cuisine],foodTypes:[]});
  });
  it('keeps explicit Korean cuisine when the venue serves sushi without inventing Japanese cuisine',()=>{
    expect(classifyRestaurant(restaurant('House Kitchen',['Korean restaurant'],{features:features({dishes:['sushi'],fusion:true})}))).toEqual({cuisines:['Korean','Fusion'],foodTypes:['sushi']});
  });
  it('does not assign the cuisine of a neighboring or compared restaurant from food review prose',()=>{
    const value=restaurant('House Kitchen',['Chinese'],{features:features({evidence:[{id:'r',aspect:'food',text:'Unlike the Thai restaurant next door, these noodles are delicious.',sourceUrl:'https://example.com/r'}]})});
    expect(classifyRestaurant(value)).toEqual({cuisines:['Chinese'],foodTypes:['noodles']});
  });
  it.each([
    ['寿司屋','sushi'],['拉麵館','noodles'],['韓式火鍋','hot-pot'],['饺子馆','dumplings'],['한식 냉면','noodles'],['ร้านอาหาร ผัดไทย','noodles'],['Phở Kitchen','noodles'],['炒飯店','rice'],['烧烤店','bbq']
  ])('recognizes bounded multilingual listing evidence: %s', (name,type)=>{
    expect(classifyRestaurant(restaurant(name,[])).foodTypes).toContain(type);
  });
  it('handles case and plural aliases without partial-word false positives',()=>{
    expect(classifyRestaurant(restaurant('DUMPLINGS and NOODLES',[])).foodTypes).toEqual(expect.arrayContaining(['dumplings','noodles']));
    expect(classifyRestaurant(restaurant('Spice House and Thaisons',[]))).toEqual({cuisines:[],foodTypes:[]});
  });
  it('does not mistake rice noodles for a rice dish or bread for Chinese noodles',()=>{
    expect(classifyRestaurant(restaurant('House Kitchen',[],{features:features({dishes:['rice noodles']})})).foodTypes).toEqual(['noodles']);
    expect(classifyRestaurant(restaurant('面包店',[])).foodTypes).not.toContain('noodles');
  });
  it('uses validated positive food evidence while ignoring service and missing-food claims',()=>{
    const value=restaurant('House Kitchen',['Chinese'],{features:features({dishes:['noodles'],evidence:[{id:'r',aspect:'food',text:'They do not serve noodles. No sushi here.',sourceUrl:'https://example.com/r'},{id:'s',aspect:'service',text:'Noodles next door have faster service.',sourceUrl:'https://example.com/s'}]})});
    expect(classifyRestaurant(value).foodTypes).toEqual([]);expect(hasAsianDishEvidence(value)).toBe(false);
  });
  it('does not turn generic rice, noodles, or dumplings into evidence of an Asian venue',()=>{
    for(const name of ['Rice House','Noodle Bar','Dumpling Kitchen'])expect(hasAsianDishEvidence(restaurant(name,[]))).toBe(false);
    for(const name of ['Pho 99','Udon House','Sushi Cafe','Shabu Shabu'])expect(hasAsianDishEvidence(restaurant(name,[]))).toBe(true);
  });
});

describe('query intent and AND relevance constraints',()=>{
  it('requires Korean AND noodles instead of trusting a sourced result',()=>{
    const rice=restaurant('Seoul Kitchen',['Korean'],{features:features({dishes:['bibimbap']})});
    const chinese=restaurant('Noodle House',['Chinese']);
    const korean=restaurant('Seoul Noodle Kitchen',['Korean']);
    expect(matchRestaurantSearch(rice,{query:'Korean noodles'})).toBe(false);
    expect(matchRestaurantSearch(chinese,{query:'Korean noodles'})).toBe(false);
    expect(matchRestaurantSearch(korean,{query:'Korean noodles'})).toBe(true);
  });
  it('matches generic noodles across subtypes but never substitutes pho or rice for ramen',()=>{
    const ramen=restaurant('House Kitchen',['Japanese'],{listingCategories:['Ramen restaurant']});
    const pho=restaurant('House Kitchen',['Vietnamese'],{features:features({dishes:['pho']})});
    const rice=restaurant('House Kitchen',['Japanese'],{features:features({dishes:['rice bowls']})});
    for(const value of [ramen,pho])expect(matchRestaurantSearch(value,{query:'noodles'})).toBe(true);
    expect(matchRestaurantSearch(ramen,{query:'ramen'})).toBe(true);
    expect(matchRestaurantSearch(pho,{query:'ramen'})).toBe(false);expect(matchRestaurantSearch(rice,{query:'ramen'})).toBe(false);
  });
  it('requires all explicit filter and query facets, including multiple food groups',()=>{
    const noodles=restaurant('Noodle Kitchen',['Japanese'],{features:features({dishes:['gyoza']})});
    expect(matchRestaurantSearch(noodles,{query:'noodles dumplings',cuisine:'Japanese',foodType:'noodles'})).toBe(true);
    expect(matchRestaurantSearch(noodles,{query:'noodles dumplings',cuisine:'Korean'})).toBe(false);
    expect(matchRestaurantSearch(noodles,{query:'noodles',foodType:'rice'})).toBe(false);
  });
  it('keeps specific multiword dishes intact instead of treating part of them as a business name',()=>{
    expect(restaurantSearchIntent('pad thai')).toMatchObject({kind:'food',dishes:['pad-thai'],nameTokens:[]});
    expect(matchRestaurantSearch(restaurant('House Kitchen',['Thai'],{features:features({dishes:['pad thai']})}),{query:'pad thai'})).toBe(true);
  });
  it('corrects one bounded food/cuisine typo or adjacent swap only in the query',()=>{
    const value=restaurant('Seoul Noodle Kitchen',['Korean']);
    expect(matchRestaurantSearch(value,{query:'koren noodels'})).toBe(true);
    expect(matchRestaurantSearch(restaurant('Susi House',[]),{query:'sushi'})).toBe(false);
    expect(matchRestaurantSearch(value,{query:'kozzan nozxxxx'})).toBe(false);
  });
  it('handles name searches and mixed name/dish intent without requiring the whole query phrase',()=>{
    const value=restaurant('Kinton Ramen',['Japanese']);
    expect(restaurantSearchIntent('Kinton ramen')).toMatchObject({kind:'mixed',nameTokens:['kinton'],dishes:['ramen']});
    expect(matchRestaurantSearch(value,{query:'Kinton ramen'})).toBe(true);
    expect(matchRestaurantSearch(restaurant('Other Ramen',['Japanese']),{query:'Kinton ramen'})).toBe(false);
    expect(matchRestaurantSearch(restaurant('Pho 99',['Vietnamese']),{query:'Pho99'})).toBe(true);
  });
  it('matches food modifiers in positive dish evidence while keeping numeric brand tokens in the name',()=>{
    const beef=restaurant('Little Bowl',['Chinese'],{features:features({dishes:['beef noodles']})});
    const chicken=restaurant('Little Bowl',['Chinese'],{features:features({dishes:['chicken rice']})});
    expect(matchRestaurantSearch(beef,{query:'beef noodles'})).toBe(true);
    expect(matchRestaurantSearch(chicken,{query:'chicken rice'})).toBe(true);
    expect(matchRestaurantSearch(chicken,{query:'beef noodles'})).toBe(false);
    expect(matchRestaurantSearch(restaurant('Pho House',['Vietnamese'],{features:features({dishes:['pho 99']})}),{query:'Pho99'})).toBe(false);
    const negative=restaurant('Little Bowl',['Chinese'],{features:features({evidence:[{id:'r',aspect:'food',text:'No beef noodles here. The chicken rice is delicious.',sourceUrl:'https://example.com/r'}]})});
    expect(matchRestaurantSearch(negative,{query:'beef noodles'})).toBe(false);
  });
});

describe('scraper and extraction persistence',()=>{
  it('persists source categories, food types and Vietnamese/Thai cuisines with no inferred cuisine',()=>{
    const value=normalizePlace({placeId:'id',title:'House Kitchen',location:{lat:43,lng:-80},categories:['Vietnamese restaurant','Thai restaurant','Noodle shop','Ramen restaurant']})!.restaurant;
    expect(value.cuisines).toEqual(['Vietnamese','Thai']);expect(value.foodTypes).toEqual(['noodles']);expect(value.listingCategories).toContain('Ramen restaurant');
    expect(matchRestaurantSearch(value,{query:'ramen'})).toBe(true);
    expect(classifyRestaurant({...value,foodTypes:undefined}).foodTypes).toEqual(['noodles']);
    expect(FOOD_TYPES.map(type=>type.id)).not.toContain('ramen');
  });
  it('derives persisted food types from validated extraction and drops literal negative tags',async()=>{
    const text='They do not serve noodles. The sushi is excellent.';
    const output={observations:[],cuisines:[],dishes:[{reviewId:'r',quote:'They do not serve noodles.',value:'noodles'},{reviewId:'r',quote:'The sushi is excellent.',value:'sushi'}],flavors:[],spice:[],fusion:[]};
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(output)}],usage:{input_tokens:100,output_tokens:100}}));
    const result=await extractFeatures([{id:'r',text,sourceUrl:'https://example.com/r',stars:4,publishedAt:null}],{apiKey:'test-only',fetch:fetcher});
    expect(result.dishes).toEqual(['sushi']);expect(result.foodTypes).toEqual(['sushi']);expect(result.cuisines).toEqual([]);
  });
});

describe('search relevance tiers',()=>{
  it('prefers source-listed noodles to an incidental review mention without treating stored review tags as listing evidence',()=>{
    const named=restaurant('Noodle Dynasty',['Chinese']);
    const category=restaurant('Little Bowl',['Chinese'],{listingCategories:['Noodle shop']});
    const review=restaurant('Little Bowl',['Chinese'],{foodTypes:['noodles'],features:features({dishes:['noodles']})});
    expect(restaurantSearchRelevance(named,{query:'noodles'})).toBe(2);
    expect(restaurantSearchRelevance(category,{foodType:'noodles'})).toBe(2);
    expect(restaurantSearchRelevance(review,{query:'noodles'})).toBe(1);
  });
  it('requires the specific subtype in the listing before prioritizing it as a listed ramen match',()=>{
    const value=restaurant('Noodle Kitchen',['Japanese'],{features:features({dishes:['ramen']})});
    expect(restaurantSearchRelevance(value,{query:'ramen'})).toBe(1);
    expect(restaurantSearchRelevance({...value,listingCategories:['Ramen restaurant']},{query:'ramen'})).toBe(2);
  });
  it('prioritizes exact brand names while leaving cuisine-only and browse searches neutral',()=>{
    expect(restaurantSearchRelevance(restaurant('Pho99',['Vietnamese']),{query:'Pho 99'})).toBe(3);
    expect(restaurantSearchRelevance(restaurant('Pho99 Kitchen',['Vietnamese']),{query:'Pho99'})).toBe(2);
    expect(restaurantSearchRelevance(restaurant('Noodle Kitchen',['Chinese']),{query:'Chinese'})).toBe(0);
    expect(restaurantSearchRelevance(restaurant('Noodle Kitchen',['Chinese']),{query:'',cuisine:'Chinese'})).toBe(0);
    expect(restaurantSearchRelevance(restaurant('Noodle Kitchen',['Chinese']),{})).toBe(0);
  });
});
