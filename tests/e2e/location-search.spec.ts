import {test,expect,type Page} from '@playwright/test';

const profile={version:1,weights:{food:.35,taste:.3,value:.15,proximity:.1,service:.05,atmosphere:.05},cuisines:[],dishes:[],flavors:[],spicePreference:null,fusionPreference:null,interpretation:'Browser fixture',updatedAt:'2026-10-26T00:00:00.000Z'};
const address={id:'fixture-waterloo-address',label:'200 University Avenue West, Waterloo, Ontario, Canada',primaryText:'200 University Avenue West',secondaryText:'Waterloo, Ontario, Canada',kind:'address',lat:43.4726,lng:-80.5421};
const second={id:'fixture-coquitlam-address',label:'2991 Lougheed Highway, Coquitlam, British Columbia, Canada',primaryText:'2991 Lougheed Highway',secondaryText:'Coquitlam, British Columbia, Canada',kind:'address',lat:49.2782,lng:-122.7997};

async function locationStage(page:Page){
 await page.route('**/api/session',route=>route.fulfill({json:{user:{id:'fixture-location-user'},configured:true,demo:false,dataMode:'live',profile,answers:{favorites:[{restaurantId:'fixture-favorite',name:'Favorite',city:'',reasons:['Food'],notes:''}]}}}));
 await page.route('**/api/saved',route=>route.fulfill({json:{items:[]}}));
 await page.goto('/');
 await expect(page.getByRole('combobox',{name:'Address or area'})).toBeVisible();
 await page.clock.install();
}

test('address suggestions debounce, support keyboard selection, and use fresh searches when changing location @smoke',async({page},testInfo)=>{
 const geocodes:{query:string;proximity?:{lat:number;lng:number}}[]=[];
 const discoveries:{searchId:string;lat:number;lng:number}[]=[];
 await page.route('**/api/geocode',route=>{const input=route.request().postDataJSON();geocodes.push(input);return route.fulfill({json:{items:[input.query.includes('2991')?second:address]}});});
 await page.route('**/api/discover',route=>{discoveries.push(route.request().postDataJSON());return route.fulfill({json:{items:[],job:null,refreshing:false,searchPhase:'complete',profileVersion:1,dataMode:'live'}});});
 await locationStage(page);
 const field=page.getByRole('combobox',{name:'Address or area'});
 await field.fill('20');await page.clock.fastForward(500);expect(geocodes).toHaveLength(0);
 await field.fill('200 University');await page.clock.fastForward(100);await field.fill('200 University Ave W Waterloo');
 await page.clock.fastForward(350);await expect(page.getByRole('option',{name:address.label,exact:true})).toBeVisible();
 expect(geocodes).toHaveLength(1);expect(geocodes[0].query).toBe('200 University Ave W Waterloo');expect(discoveries).toHaveLength(0);
 await expect(field).toHaveAttribute('aria-expanded','true');
 await page.screenshot({path:testInfo.outputPath('location-desktop.png'),fullPage:true});
 await field.press('ArrowDown');await expect(page.getByRole('option')).toHaveAttribute('aria-selected','true');
 await field.press('Enter');await expect(page.getByRole('heading',{name:'What sounds good?'})).toBeVisible();
 expect(discoveries).toHaveLength(1);expect(discoveries[0]).toMatchObject({lat:address.lat,lng:address.lng});expect(discoveries[0].searchId).toMatch(/^[0-9a-f-]{36}$/);
 await page.getByRole('button',{name:'Change area',exact:true}).first().click();
 await field.fill('2991 Lougheed Hwy Coquitlam');await page.clock.fastForward(350);
 await page.getByRole('option',{name:second.label,exact:true}).click();await expect(page.getByRole('heading',{name:'What sounds good?'})).toBeVisible();
 expect(geocodes.at(-1)?.proximity).toEqual({lat:address.lat,lng:address.lng});
 expect(discoveries).toHaveLength(2);expect(discoveries[1]).toMatchObject({lat:second.lat,lng:second.lng});expect(discoveries[1].searchId).not.toBe(discoveries[0].searchId);
});

test('out-of-order suggestions cannot replace the latest address, and Escape and clear dismiss them',async({page})=>{
 let oldStarted=false;let releaseOld:()=>void=()=>{};
 await page.route('**/api/geocode',async route=>{
  if(route.request().postDataJSON().query==='old address'){oldStarted=true;await new Promise<void>(resolve=>{releaseOld=resolve;});await route.fulfill({json:{items:[address]}}).catch(()=>{});}
  else await route.fulfill({json:{items:[second]}});
 });
 await locationStage(page);const field=page.getByRole('combobox',{name:'Address or area'});
 await field.fill('old address');await page.clock.fastForward(350);await expect.poll(()=>oldStarted).toBe(true);
 await field.fill('2991 Lougheed');await page.clock.fastForward(350);await expect(page.getByRole('option',{name:second.label,exact:true})).toBeVisible();
 releaseOld();await page.clock.fastForward(1000);await expect(page.getByRole('option')).toHaveCount(1);await expect(page.getByRole('option')).toHaveAccessibleName(second.label);
 await field.press('Escape');await expect(field).toHaveAttribute('aria-expanded','false');await expect(page.getByRole('option')).toHaveCount(0);
 await expect(field).not.toHaveAttribute('aria-controls',/.+/);
 await page.getByRole('button',{name:'Clear location',exact:true}).click();await expect(field).toHaveValue('');await expect(field).toBeFocused();
});

test('submit does not silently choose an address and failed searches can be retried',async({page})=>{
 let fail=true;let empty=true;let discoveries=0;
 await page.route('**/api/geocode',route=>route.fulfill(fail?{status:503,json:{error:'Address search is temporarily unavailable. Please try again.'}}:{json:{items:empty?[]:[address,second]}}));
 await page.route('**/api/discover',route=>{discoveries++;return route.fulfill({json:{items:[],job:null,refreshing:false,profileVersion:1,dataMode:'live'}});});
 await locationStage(page);const field=page.getByRole('combobox',{name:'Address or area'});
 await field.fill('200 University');await field.press('Enter');
 await expect(page.getByText('Address search is temporarily unavailable. Please try again.',{exact:true})).toBeVisible();
 fail=false;await page.getByRole('button',{name:'Find area',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'No matching locations.'})).toBeVisible();await expect(field).toHaveValue('200 University');
 empty=false;await page.getByRole('button',{name:'Find area',exact:true}).click();await expect(page.getByRole('option')).toHaveCount(2);
 expect(discoveries).toBe(0);await expect(page.getByRole('heading',{name:/Where are.*we eating/})).toBeVisible();
 await field.press('ArrowDown');await field.press('ArrowDown');await field.press('ArrowUp');await field.press('Enter');
 await expect(page.getByRole('heading',{name:'What sounds good?'})).toBeVisible();expect(discoveries).toBe(1);
});

test('a phone can tap a full address without horizontal overflow',async({page},testInfo)=>{
 await page.setViewportSize({width:375,height:812});
 await page.route('**/api/geocode',route=>route.fulfill({json:{items:[address]}}));
 await page.route('**/api/discover',route=>route.fulfill({json:{items:[],job:null,refreshing:false,profileVersion:1,dataMode:'live'}}));
 await locationStage(page);await page.getByRole('combobox',{name:'Address or area'}).fill('200 University Ave W Waterloo');await page.clock.fastForward(350);
 const option=page.getByRole('option',{name:address.label,exact:true});await expect(option).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 const box=await option.boundingBox();expect(box?.height).toBeGreaterThanOrEqual(44);
 await page.screenshot({path:testInfo.outputPath('location-phone.png'),fullPage:true});
 await option.click();await expect(page.getByRole('heading',{name:'What sounds good?'})).toBeVisible();
});

for(const outcome of ['success','error'] as const){
 test(`a late GPS ${outcome} cannot replace a chosen address or start another restaurant search`,async({page})=>{
  await page.addInitScript(()=>{
   const fixture=window as unknown as {gpsSuccess?:PositionCallback;gpsError?:PositionErrorCallback};
   Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success:PositionCallback,error:PositionErrorCallback){fixture.gpsSuccess=success;fixture.gpsError=error;}}});
  });
  const discoveries:{lat:number;lng:number}[]=[];
  await page.route('**/api/geocode',route=>route.fulfill({json:{items:[address]}}));
  await page.route('**/api/discover',route=>{discoveries.push(route.request().postDataJSON());return route.fulfill({json:{items:[],job:null,refreshing:false,profileVersion:1,dataMode:'live'}});});
  await locationStage(page);await page.getByRole('button',{name:'Use my location',exact:true}).click();
  await page.getByRole('combobox',{name:'Address or area'}).fill('200 University Waterloo');await page.clock.fastForward(350);
  await page.getByRole('option',{name:address.label,exact:true}).click();await expect(page.getByRole('heading',{name:'What sounds good?'})).toBeVisible();
  await page.evaluate(result=>{
   const fixture=window as unknown as {gpsSuccess?:PositionCallback;gpsError?:PositionErrorCallback};
   if(result==='success')fixture.gpsSuccess?.({coords:{latitude:49.28,longitude:-122.8}} as GeolocationPosition);
   else fixture.gpsError?.({code:1,message:'Permission denied'} as GeolocationPositionError);
  },outcome);
  await page.clock.fastForward(1000);
  expect(discoveries).toHaveLength(1);expect(discoveries[0]).toMatchObject({lat:address.lat,lng:address.lng});
  await expect(page.getByText(/We could not use your location/)).toHaveCount(0);
 });
}
