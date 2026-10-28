import type {Restaurant} from './contracts.ts';

// Product groups, kept separate from cultural/regional cuisine labels.
// Google Places also distinguishes dish-based types (sushi, ramen, barbecue)
// from cuisines. Neither a cuisine nor a search-result membership proves a dish.
export const FOOD_TYPES = [
  {id:'sushi',label:'Sushi'}, {id:'noodles',label:'Noodles'}, {id:'hot-pot',label:'Hot pot'},
  {id:'rice',label:'Rice'}, {id:'dumplings',label:'Dumplings'}, {id:'bbq',label:'BBQ'},
  {id:'fried-chicken',label:'Fried chicken'}, {id:'seafood',label:'Seafood'},
  {id:'soup',label:'Soup'}, {id:'desserts',label:'Desserts'}, {id:'bubble-tea',label:'Bubble tea'}
] as const;
export type FoodType = typeof FOOD_TYPES[number]['id'];
export const CUISINES = ['Chinese','Korean','Japanese','Vietnamese','Thai','Taiwanese','Mongolian','Tibetan','Fusion'] as const;
type Definition = {id:string;aliases:string[];foodType?:FoodType;cuisine?:string};
const cuisineDefinitions:Definition[] = [
  {id:'Chinese',aliases:['chinese','cantonese','sichuan','szechuan','hunan','hakka','shanghainese','shaanxi','uyghur','hong kong','中餐','中式','中国菜','中國菜','川菜','粤菜','粵菜','중식']},
  {id:'Korean',aliases:['korean','korea','한국','한식','韩国','韓國','韓式','韩式']},
  {id:'Japanese',aliases:['japanese','japan','日本料理','日本食','和食','日式','일식']},
  {id:'Vietnamese',aliases:['vietnamese','viet','vietnam','越南','베트남','việt']},
  {id:'Thai',aliases:['thai','thailand','泰式','泰国','泰國','タイ料理','อาหารไทย']},
  {id:'Taiwanese',aliases:['taiwanese','taiwan','台灣','台湾','臺灣','台式','臺式']},
  {id:'Mongolian',aliases:['mongolian','mongolia','蒙古']},
  {id:'Tibetan',aliases:['tibetan','tibet','西藏','藏餐']},
  {id:'Fusion',aliases:['fusion','퓨전','創作料理','创作料理']}
];
const foodDefinitions:Definition[] = [
  {id:'sushi',aliases:['sushi','makis','maki','nigiri','寿司','壽司','すし','스시','초밥'],cuisine:'Japanese'},
  {id:'noodles',aliases:['noodle','noodles','vermicelli','lo mein','chow mein','chow fun','lamian','japchae','laksa','拉面','拉麵','米粉','河粉','炒面','炒麵','面馆','麵館','국수','ก๋วยเตี๋ยว']},
  {id:'hot-pot',aliases:['hot pot','hot pots','hotpot','hotpots','shabu shabu','huo guo','huoguo','sukiyaki','火锅','火鍋','しゃぶしゃぶ','샤브샤브']},
  {id:'rice',aliases:['rice','fried rice','rice bowl','rice bowls','donburi','bibimbap','onigiri','congee','粥','炒飯','炒饭','丼','비빔밥','주먹밥']},
  {id:'dumplings',aliases:['dumpling','dumplings','gyoza','jiaozi','wonton','wontons','mandu','momo','momos','xiao long bao','xiaolongbao','dim sum','饺子','餃子','小笼包','小籠包','点心','點心','만두']},
  {id:'bbq',aliases:['bbq','barbecue','barbeque','barbecued','grill','grilled','yakiniku','yakitori','bulgogi','烧烤','燒烤','烤肉','焼肉','焼き鳥','불고기','바비큐']},
  {id:'fried-chicken',aliases:['fried chicken','karaage','chikin','唐揚げ','炸鸡','炸雞','치킨']},
  {id:'seafood',aliases:['seafood','海鲜','海鮮','해산물']},
  {id:'soup',aliases:['soup','soups','汤','湯','국밥']},
  {id:'desserts',aliases:['dessert','desserts','ice cream','bingsu','kakigori','mochi','甜品','甜点','甜點','빙수']},
  {id:'bubble-tea',aliases:['bubble tea','boba','milk tea','珍珠奶茶','奶茶','버블티']}
];
// Specific dishes are additional constraints: ramen is noodles, but pho is not ramen.
const dishDefinitions:Definition[] = [
  {id:'ramen',aliases:['ramen','ramens','ラーメン'],foodType:'noodles',cuisine:'Japanese'},
  {id:'pho',aliases:['pho','phở','越南河粉'],foodType:'noodles',cuisine:'Vietnamese'},
  {id:'udon',aliases:['udon','うどん','乌冬','烏冬','우동'],foodType:'noodles',cuisine:'Japanese'},
  {id:'soba',aliases:['soba','そば','蕎麦'],foodType:'noodles',cuisine:'Japanese'},
  {id:'ramyeon',aliases:['ramyeon','ramyun','라면'],foodType:'noodles',cuisine:'Korean'},
  {id:'naengmyeon',aliases:['naengmyeon','냉면'],foodType:'noodles',cuisine:'Korean'},
  {id:'pad-thai',aliases:['pad thai','phat thai','ผัดไทย'],foodType:'noodles',cuisine:'Thai'},
  {id:'bibimbap',aliases:['bibimbap','비빔밥'],foodType:'rice',cuisine:'Korean'},
  {id:'gyoza',aliases:['gyoza','餃子'],foodType:'dumplings'},
  {id:'dim-sum',aliases:['dim sum','点心','點心'],foodType:'dumplings',cuisine:'Chinese'},
  {id:'bulgogi',aliases:['bulgogi','불고기'],foodType:'bbq',cuisine:'Korean'}
];
const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/([\p{L}])([0-9])/gu,'$1 $2').replace(/([0-9])([\p{L}])/gu,'$1 $2').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const nonLatin=(value:string)=>/[^a-z0-9 ]/.test(value);
const contains=(text:string,phrase:string)=>nonLatin(phrase)?text.includes(phrase):` ${text} `.includes(` ${phrase} `);
const forms=(definition:Definition)=>[...new Set([definition.id,...definition.aliases].map(normalize))];
const allDefinitions=[...cuisineDefinitions,...foodDefinitions,...dishDefinitions];
const oneEdit=(left:string,right:string)=>{
  if(left===right)return true;
  if(Math.abs(left.length-right.length)>1)return false;
  if(left.length===right.length){const differences=[...left].map((letter,index)=>letter===right[index]?-1:index).filter(index=>index>=0);if(differences.length===2&&differences[1]===differences[0]+1&&left[differences[0]]===right[differences[1]]&&left[differences[1]]===right[differences[0]])return true;}
  let i=0,j=0,edits=0;
  while(i<left.length&&j<right.length){if(left[i]===right[j]){i++;j++;continue;}if(++edits>1)return false;if(left.length>=right.length)i++;if(right.length>=left.length)j++;}
  return edits+(left.length-i)+(right.length-j)<=1;
};
function correctQuery(query:string){
  const known=[...new Set(allDefinitions.flatMap(forms).filter(word=>/^[a-z]{4,}$/.test(word)))];
  return normalize(query).split(' ').map(word=>{
    if(word.length<4||!/^[a-z]+$/.test(word)||known.includes(word))return word;
    const matches=known.filter(alias=>oneEdit(word,alias));
    const ids=new Set(matches.flatMap(alias=>allDefinitions.filter(def=>forms(def).includes(alias)).map(def=>def.foodType??def.id)));
    return ids.size===1?matches[0]:word;
  }).join(' ');
}
function scan(text:string,definitions:Definition[]){return definitions.filter(def=>forms(def).some(alias=>contains(text,alias)));}

// Only positive serving evidence classifies food. Poor taste is still evidence of
// the dish, but absence, comparisons and hypothetical requests are not.
export function positiveFoodText(value:string):string {
  return value.replace(/\b(?:unlike|compared (?:to|with))\b[^,]*,\s*/giu,'').split(/[.!?;]|\b(?:but|however|whereas)\b/iu).filter(clause=>{
    const text=normalize(clause);
    return !/\b(?:no|without|never|wish|wished|elsewhere|instead|used to)\b/.test(text)
      && !/\b(?:not|don t|doesn t|didn t|isn t|aren t|wasn t|weren t|stopped|stop|next door|other restaurant)\b/.test(text);
  }).join(' ');
}
export function hasPositiveFoodMention(quote:string,tag:string):boolean{return contains(normalize(positiveFoodText(quote)),normalize(tag));}

type ClassifiedInput=Pick<Restaurant,'name'|'cuisines'|'features'> & {foodTypes?:string[];listingCategories?:string[]};
function validatedTags(restaurant:ClassifiedInput,tags:string[]){
  const features=restaurant.features;
  const evidence=(features?.evidence??[]).filter(item=>item.aspect==='food'||item.aspect==='fusion').map(item=>positiveFoodText(item.text));
  return tags.filter(tag=>!features?.evidence.length||evidence.some(quote=>contains(normalize(quote),normalize(tag))));
}
function cuisineSources(restaurant:ClassifiedInput){
  return normalize([restaurant.name,...restaurant.cuisines,...(restaurant.listingCategories??[]),...validatedTags(restaurant,restaurant.features?.cuisines??[])].join(' '));
}
function sources(restaurant:ClassifiedInput){
  const features=restaurant.features;
  const evidence=(features?.evidence??[]).filter(item=>item.aspect==='food'||item.aspect==='fusion').map(item=>positiveFoodText(item.text));
  const tags=validatedTags(restaurant,[...(features?.cuisines??[]),...(features?.dishes??[])]);
  return normalize([restaurant.name,...restaurant.cuisines,...(restaurant.listingCategories??[]),...tags,...evidence].join(' '));
}
export function classifyRestaurant(restaurant:ClassifiedInput):{cuisines:string[];foodTypes:FoodType[]} {
  let text=sources(restaurant);
  // Rice noodles and rice-paper rolls do not establish a rice-dish offering.
  text=text.replace(/\brice (?=noodles?\b|paper\b)/g,'');
  const foods=scan(text,foodDefinitions),dishes=scan(text,dishDefinitions);
  const cuisines=new Set(scan(cuisineSources(restaurant),cuisineDefinitions).map(def=>def.id));
  if(restaurant.features?.fusion)cuisines.add('Fusion');
  const foodTypes=new Set<FoodType>(foods.map(def=>def.id as FoodType));
  for(const def of dishes)if(def.foodType)foodTypes.add(def.foodType);
  for(const id of [...(restaurant.foodTypes??[]),...(restaurant.features?.foodTypes??[])])if(FOOD_TYPES.some(type=>type.id===id))foodTypes.add(id as FoodType);
  return {cuisines:[...cuisines],foodTypes:[...foodTypes]};
}
export function hasAsianDishEvidence(restaurant:ClassifiedInput):boolean {
  const text=sources(restaurant);
  return scan(text,dishDefinitions).length>0||scan(text,foodDefinitions).some(def=>def.id==='sushi'||def.id==='bubble-tea')
    ||['gyoza','jiaozi','mandu','xiaolongbao','xiao long bao','shabu shabu','yakiniku','yakitori','karaage','bingsu','kakigori','lamian','japchae','寿司','壽司','拉面','拉麵','火锅','火鍋','饺子','餃子','小笼包','小籠包','냉면','국수'].some(alias=>contains(text,normalize(alias)));
}

const ignoredQueryWords=new Set('a an and the of for with in near me nearby restaurant restaurants food foods place places shop shops best good great authentic delicious tasty spicy handmade eat eats cuisine cuisines serving find asian east southeast'.split(' '));
export function restaurantSearchIntent(query:string){
  let remaining=correctQuery(query);
  const cuisines=scan(remaining,cuisineDefinitions).map(def=>def.id);
  const foods=scan(remaining,foodDefinitions).map(def=>def.id as FoodType);
  const dishes=scan(remaining,dishDefinitions);
  for(const def of dishes)if(def.foodType)foods.push(def.foodType);
  for(const alias of [...new Set(allDefinitions.flatMap(forms))].sort((a,b)=>b.length-a.length)){
    if(!contains(remaining,alias))continue;
    remaining=nonLatin(alias)?remaining.split(alias).join(' '):` ${remaining} `.split(` ${alias} `).join(' ').trim();
  }
  const nameTokens=remaining.split(/\s+/).filter(word=>word&&!ignoredQueryWords.has(word));
  return {kind:(cuisines.length||foods.length||dishes.length)?nameTokens.length?'mixed':'food':nameTokens.length?'name':'browse',cuisines:[...new Set(cuisines)],foodTypes:[...new Set(foods)],dishes:dishes.map(def=>def.id),nameTokens} as const;
}
export function matchRestaurantSearch(restaurant:ClassifiedInput,input:{query?:string;cuisine?:string;foodType?:string}):boolean {
  const classification=classifyRestaurant(restaurant),intent=restaurantSearchIntent(input.query??'');
  const explicitCuisine=restaurantSearchIntent(input.cuisine??'');
  const explicitFood=restaurantSearchIntent(input.foodType??'');
  const cuisines=[...intent.cuisines,...explicitCuisine.cuisines];
  const foodTypes=[...intent.foodTypes,...explicitFood.foodTypes];
  if(!cuisines.every(cuisine=>classification.cuisines.includes(cuisine))||!foodTypes.every(type=>classification.foodTypes.includes(type)))return false;
  const text=sources(restaurant),foundDishes=scan(text,dishDefinitions).map(def=>def.id);
  if(![...intent.dishes,...explicitFood.dishes].every(dish=>foundDishes.includes(dish)))return false;
  if(input.cuisine&&!explicitCuisine.cuisines.length&&!contains(text,normalize(input.cuisine)))return false;
  if(input.foodType&&!explicitFood.foodTypes.length&&!contains(text,normalize(input.foodType)))return false;
  const name=normalize(restaurant.name);
  return intent.nameTokens.every(token=>contains(intent.kind==='mixed'&&!/^\d+$/.test(token)?text:name,token));
}

/** Relevance tiers only, never a food-quality score or a Google rating boost. */
export function restaurantSearchRelevance(restaurant:ClassifiedInput,input:{query?:string;cuisine?:string;foodType?:string}):number {
  if(!matchRestaurantSearch(restaurant,input))return 0;
  const intent=restaurantSearchIntent(input.query??''),explicitFood=restaurantSearchIntent(input.foodType??'');
  if(intent.nameTokens.length&&normalize(input.query??'')===normalize(restaurant.name))return 3;
  const foodTypes=[...intent.foodTypes,...explicitFood.foodTypes],dishes=[...intent.dishes,...explicitFood.dishes];
  if(!foodTypes.length&&!dishes.length)return intent.kind==='name'?2:0;
  // Persisted foodTypes can be derived from reviews. Strip those and features
  // to distinguish an actual listing match from an incidental review mention.
  const listing={name:restaurant.name,cuisines:restaurant.cuisines,listingCategories:restaurant.listingCategories,features:null};
  const classified=classifyRestaurant(listing),listedDishes=scan(sources(listing),dishDefinitions).map(def=>def.id);
  return foodTypes.every(type=>classified.foodTypes.includes(type))&&dishes.every(dish=>listedDishes.includes(dish))?2:1;
}
