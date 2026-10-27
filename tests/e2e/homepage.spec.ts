import {test,expect,type Page} from '@playwright/test';

async function home(page:Page){
 await page.route('**/api/session',route=>route.fulfill({json:{user:null,configured:true,demo:false,dataMode:'live',profile:null,answers:null}}));
 await page.goto('/');
 await expect(page.getByRole('link',{name:'Continue with Google',exact:true})).toBeVisible();
}

for(const viewport of [{width:375,height:667},{width:390,height:844},{width:1440,height:900}]){
 test(`sign-in stays unobstructed on the first screen at ${viewport.width}x${viewport.height}`,async({page},testInfo)=>{
  await page.setViewportSize(viewport);await home(page);
  const google=page.getByRole('link',{name:'Continue with Google',exact:true});
  await expect(google).toHaveAttribute('href','/auth/login');
  await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();
  expect(await google.evaluate(element=>{
   const box=element.getBoundingClientRect();const top=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
   return box.top>=0&&box.bottom<=window.innerHeight&&!!top&&element.contains(top);
  })).toBe(true);
  const photo=page.getByAltText('Ramen with sliced pork, a soft-boiled egg, scallions, and chili on a wooden table');
  await expect(photo).toHaveAttribute('src',/ramen-home/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(viewport.width!==390)await page.screenshot({path:testInfo.outputPath('homepage.png'),fullPage:false});
 });
}

async function seek(page:Page,value:number){
 const slider=page.getByRole('slider',{name:'Demo progress'});
 const box=await slider.boundingBox();if(!box)throw new Error('Demo progress is not visible.');
 await slider.click({position:{x:8+(box.width-16)*value/28000,y:box.height/2}});
}

test('the ad pauses, seeks through the product story, ends on account creation, and never calls paid APIs',async({page},testInfo)=>{
 await page.setViewportSize({width:1440,height:1000});
 const paid:string[]=[];
 await page.route(/\/api\/(discover|taste|geocode|places\/search)(?:\?|$)/,route=>{paid.push(route.request().url());return route.fulfill({json:{}});});
 page.on('request',request=>{if(/api\.(apify|anthropic|maptiler)\.com/.test(request.url()))paid.push(request.url());});
 await home(page);await page.clock.install();
 const demo=page.getByRole('region',{name:'East Eats product demo'});
 await demo.scrollIntoViewIfNeeded();await expect(demo).toHaveAttribute('data-running','true');
 await page.clock.runFor(1300);await page.getByRole('button',{name:'Pause demo',exact:true}).click();
 await expect(demo).toHaveAttribute('data-running','false');
 const slider=page.getByRole('slider',{name:'Demo progress'});const paused=await slider.inputValue();
 await page.clock.runFor(1200);expect(await slider.inputValue()).toBe(paused);
 await page.screenshot({path:testInfo.outputPath('ad-opening.png'),fullPage:false});
 let claimAnchor:{x:number;y:number}|null=null;
 for(const [time,scene] of [[3300,'wordmark'],[5600,'reviews'],[7300,'reviews'],[9900,'reviews'],[14800,'favorites'],[18500,'tastes'],[23300,'nearby']] as const){
  await seek(page,time);await expect(demo).toHaveAttribute('data-scene',scene);await expect(demo).toHaveAttribute('data-running','false');
  if(time===5600){claimAnchor=await demo.locator('.hd-the-best').boundingBox();await expect(demo.getByRole('img',{name:'The best East Asian restaurants don\u2019t have the best reviews.'})).toBeVisible();}
  if(time===7300)await expect(demo.locator('.hd-dont')).toHaveText('DON\u2019T HAVE');
  if(time===9900){const after=await demo.locator('.hd-the-best').boundingBox();expect(after?.x).toBeCloseTo(claimAnchor!.x,0);expect(after?.y).toBeCloseTo(claimAnchor!.y,0);}
  await demo.locator('.hd-stage').screenshot({path:testInfo.outputPath(`ad-${time}.png`)});
 }
 await slider.focus();await slider.press('End');await expect(demo).toHaveAttribute('data-complete','true');
 const account=demo.getByRole('link',{name:'Create your account'});await expect(account).toBeVisible();await expect(account).toHaveAttribute('href','/auth/login');
 await expect(demo.locator('.hd-final h3>span')).toHaveCSS('color','rgb(225, 45, 18)');
 await expect(demo.locator('.hd-final h3')).toContainText('we\u2019ll tell you');
 await expect(demo.locator('.hd-final h3')).toContainText('you\u2019ll love.');
 expect(await demo.textContent()).not.toMatch(/[\u00c2\u00c3\u00e2]/u);
 await demo.locator('.hd-stage').screenshot({path:testInfo.outputPath('ad-final.png')});
 expect(paid).toEqual([]);
 await page.getByRole('button',{name:'Replay demo',exact:true}).click();await expect(demo).toHaveAttribute('data-scene','wordmark');await expect(demo).toHaveAttribute('data-complete','false');
 await page.clock.runFor(700);await page.evaluate(()=>window.scrollTo(0,0));await expect(demo).toHaveAttribute('data-running','false');
 const offscreen=await slider.inputValue();await page.clock.runFor(1200);expect(await slider.inputValue()).toBe(offscreen);
 await demo.scrollIntoViewIfNeeded();await seek(page,27300);await page.getByRole('button',{name:'Play demo',exact:true}).click();
 await page.clock.runFor(1400);await expect(demo).toHaveAttribute('data-complete','true');await expect(demo).toHaveAttribute('data-running','false');
 expect(await slider.inputValue()).toBe('28000');expect(paid).toEqual([]);
});

test('the phone ad stays readable and reduced motion skips automatic animation',async({page},testInfo)=>{
 await page.setViewportSize({width:375,height:667});await page.emulateMedia({reducedMotion:'reduce'});await home(page);
 const demo=page.getByRole('region',{name:'East Eats product demo'});await demo.scrollIntoViewIfNeeded();
 await expect(demo).toHaveAttribute('data-reduced-motion','true');await expect(demo).toHaveAttribute('data-running','false');
 await expect(demo.getByRole('link',{name:'Create your account'})).toBeVisible();
 await expect(page.getByRole('slider',{name:'Demo progress'})).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await demo.screenshot({path:testInfo.outputPath('ad-phone-reduced-motion.png')});
 await page.emulateMedia({reducedMotion:'no-preference'});await seek(page,7300);
 await expect(demo).toHaveAttribute('data-scene','reviews');await demo.locator('.hd-stage').screenshot({path:testInfo.outputPath('ad-phone-reviews.png')});
 await seek(page,14800);await demo.locator('.hd-stage').screenshot({path:testInfo.outputPath('ad-phone-favorite.png')});
 await seek(page,23300);await demo.locator('.hd-stage').screenshot({path:testInfo.outputPath('ad-phone-nearby.png')});
});
