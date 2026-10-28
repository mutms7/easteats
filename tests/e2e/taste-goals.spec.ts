import {test,expect,type Page} from '@playwright/test';

const favorite={restaurantId:'fixture-favorite',name:'Favorite Noodles',city:'Waterloo',reasons:['The food itself'],notes:'I like the chewy noodles.'};
const profile={version:1,weights:{food:.35,taste:.3,value:.15,proximity:.1,service:.05,atmosphere:.05},cuisines:[],dishes:[],flavors:[],spicePreference:null,fusionPreference:null,interpretation:'Fixture preferences',updatedAt:'2026-10-28T00:00:00.000Z'};
async function questionnaire(page:Page,userId:string,goal?:string){
 await page.route('**/api/session',route=>route.fulfill({json:{user:{id:userId},configured:true,demo:false,dataMode:'live',profile:null,answers:{favorites:[favorite],...(goal?{goal}:{})}}}));
 await page.route('**/api/saved',route=>route.fulfill({json:{items:[]}}));
 await page.goto('/');await expect(page.getByRole('group',{name:'What matters most right now?'})).toBeVisible();
}

test('four goals persist through reload, save, correction, and later editing without extra calls',async({page},testInfo)=>{
 await page.setViewportSize({width:375,height:812});
 const submitted:{goal:string;correction?:string;favorites:unknown[]}[]=[];
 await page.route('**/api/taste',route=>{submitted.push(route.request().postDataJSON());return route.fulfill({json:{profile,personalized:true}});});
 await questionnaire(page,'goal-user-a');
 const group=page.getByRole('group',{name:'What matters most right now?'});await expect(group.getByRole('radio')).toHaveCount(4);
 await expect(page.getByRole('radio',{name:'A bit of everything',exact:true})).toBeChecked();
 await page.getByRole('radio',{name:'Date night',exact:true}).check();expect(submitted).toHaveLength(0);
 await page.reload();await expect(page.getByRole('radio',{name:'Date night',exact:true})).toBeChecked();
 await expect(page.getByRole('group',{name:'Favorite Noodles',exact:true})).toBeVisible();
 await group.screenshot({path:testInfo.outputPath('taste-goals-phone.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Find my next meal',exact:true}).click();await expect(page.locator('.taste-goal-summary')).toHaveText('Right now:Date night');
 expect(submitted[0].goal).toBe('date-night');expect(submitted[0].favorites).toEqual([favorite]);
 await page.getByRole('textbox',{name:'Anything we missed?'}).fill('I prefer somewhere quiet.');await page.getByRole('button',{name:'Update my tastes',exact:true}).click();
 await expect.poll(()=>submitted.length).toBe(2);expect(submitted[1]).toMatchObject({goal:'date-night',correction:'I prefer somewhere quiet.'});
 await page.getByRole('button',{name:'Taste',exact:true}).click();await expect(page.getByRole('radio',{name:'Date night',exact:true})).toBeChecked();
 await page.getByRole('radio',{name:'Great service',exact:true}).check();await page.getByRole('button',{name:'Find my next meal',exact:true}).click();
 await expect(page.locator('.taste-goal-summary')).toHaveText('Right now:Great service');expect(submitted.at(-1)?.goal).toBe('service');
});

test('a priority draft is isolated by account and invalid drafts use the saved choice',async({page})=>{
 await questionnaire(page,'goal-user-a');await page.getByRole('radio',{name:'Hidden gems',exact:true}).check();
 await page.route('**/api/session',route=>route.fulfill({json:{user:{id:'goal-user-b'},configured:true,demo:false,dataMode:'live',profile:null,answers:{favorites:[favorite],goal:'service'}}}));
 await page.evaluate(()=>localStorage.setItem('east-eats:taste-goal:goal-user-b','"not-a-goal"'));
 await page.reload();await expect(page.getByRole('radio',{name:'Great service',exact:true})).toBeChecked();
 await page.route('**/api/session',route=>route.fulfill({json:{user:{id:'goal-user-a'},configured:true,demo:false,dataMode:'live',profile:null,answers:{favorites:[favorite]}}}));
 await page.reload();await expect(page.getByRole('radio',{name:'Hidden gems',exact:true})).toBeChecked();
});
