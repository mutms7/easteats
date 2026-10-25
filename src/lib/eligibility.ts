import type {Restaurant} from './contracts';
const eastAsian=['chinese','taiwanese','japanese','korean','mongolian','tibetan','cantonese','sichuan','szechuan','hunan','shaanxi','shanghainese','hong kong','uyghur'];
export function isEastAsianRestaurant(restaurant:Restaurant){
 const tags=[...restaurant.cuisines,...(restaurant.features?.cuisines||[])].map(c=>c.toLowerCase());
 return tags.some(tag=>eastAsian.some(cuisine=>tag.includes(cuisine)));
}
