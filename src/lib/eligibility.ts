import type {Restaurant} from './contracts';
import {hasAsianDishEvidence} from './food-taxonomy';
const eastAsian=['chinese','taiwanese','japanese','korean','mongolian','tibetan','cantonese','sichuan','szechuan','hunan','shaanxi','shanghainese','hong kong','uyghur','vietnamese','thai','southeast asian','asian fusion','asian restaurant','ramen','sushi'];
export function isEastAsianRestaurant(restaurant:Restaurant){
 const tags=[...restaurant.cuisines,...(restaurant.listingCategories||[]),...(restaurant.features?.cuisines||[])].map(c=>c.toLowerCase());
 return tags.some(tag=>eastAsian.some(cuisine=>tag.includes(cuisine)))||hasAsianDishEvidence(restaurant);
}
export function isAsianFusionRestaurant(restaurant:Restaurant){
 return restaurant.features?.fusion===true||isEastAsianRestaurant(restaurant)&&restaurant.cuisines.some(tag=>/fusion/i.test(tag));
}
