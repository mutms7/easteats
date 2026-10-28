import {test,expect,type Page} from '@playwright/test';

async function home(page:Page){
 await page.clock.install();
 await page.route('**/api/session',route=>route.fulfill({json:{user:null,configured:true,demo:false,dataMode:'live',profile:null,answers:null}}));
 await page.goto('/');
 await expect(page.getByRole('link',{name:'Continue with Google',exact:true})).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
}
async function advanceTo(page:Page,target:number){
 const elapsed=await page.getByRole('region',{name:'East Eats product demo'}).evaluate(element=>-parseFloat((element as HTMLElement).style.getPropertyValue('--demo-delay'))||0);
 await page.clock.runFor(Math.max(0,target-elapsed));
}

for(const viewport of [{width:375,height:667},{width:390,height:844},{width:1440,height:900}]){
 test(`animation opens above unobstructed sign-in at ${viewport.width}x${viewport.height}`,async({page},testInfo)=>{
  await page.setViewportSize(viewport);await home(page);
  const demo=page.getByRole('region',{name:'East Eats product demo'});
  await expect(demo).toHaveAttribute('data-running','true');await page.clock.runFor(1200);
  const google=page.getByRole('link',{name:'Continue with Google',exact:true});
  expect(await google.evaluate(element=>{const box=element.getBoundingClientRect();const top=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return box.top>=0&&box.bottom<=innerHeight&&!!top&&element.contains(top);})).toBe(true);
  const animationBox=await demo.boundingBox(),signInBox=await google.boundingBox();
  expect(animationBox!.y+animationBox!.height).toBeLessThan(signInBox!.y);expect(animationBox!.y).toBeGreaterThanOrEqual(0);
  await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();
  await expect(demo.getByRole('button')).toHaveCount(0);await expect(demo.getByRole('slider')).toHaveCount(0);
  for(const text of ['See what makes it yours','A little taste of East Eats.','28 seconds / Silent','Read the demo','Illustrative demo'])await expect(page.getByText(text,{exact:true})).toHaveCount(0);
  await expect(demo.locator('.hd-stage')).toHaveCSS('border-top-width','0px');await expect(demo.locator('.hd-stage')).toHaveCSS('border-radius','0px');
  await expect(page.getByAltText('Ramen with sliced pork, a soft-boiled egg, scallions, and chili on a wooden table')).toHaveAttribute('src',/ramen-home/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('homepage.png'),fullPage:false});
 });
}

test('the italic train has constant speed, stars fall to three and a half, and playback makes no paid calls',async({page},testInfo)=>{
 test.setTimeout(60000);await page.setViewportSize({width:1440,height:900});
 const paid:string[]=[];
 await page.route(/\/api\/(discover|taste|geocode|places\/search)(?:\?|$)/,route=>{paid.push(route.request().url());return route.fulfill({json:{}});});
 page.on('request',request=>{if(/api\.(apify|anthropic|maptiler)\.com/.test(request.url()))paid.push(request.url());});
 await home(page);const demo=page.getByRole('region',{name:'East Eats product demo'});
 await advanceTo(page,3300);await demo.locator('.hd-stage').screenshot({path:testInfo.outputPath('brand.png')});
 await advanceTo(page,5600);await expect(demo).toHaveAttribute('data-scene','reviews');
 const anchor=await demo.locator('.hd-the-best').boundingBox();
 const starScale=()=>demo.locator('.hd-star-fill').evaluate(element=>new DOMMatrix(getComputedStyle(element).transform).a);
 expect(await starScale()).toBeCloseTo(1,3);await demo.locator('.hd-stage').screenshot({path:testInfo.outputPath('five-stars.png')});
 const train=demo.locator('.hd-dont');await expect(train).toHaveText('DON\u2019T HAVE');await expect(train).toHaveCSS('font-style','italic');
 const sample=()=>train.evaluate(element=>{const matrix=new DOMMatrix(getComputedStyle(element).transform);const section=element.closest('section') as HTMLElement;return{x:matrix.e,scale:matrix.a,time:-parseFloat(section.style.getPropertyValue('--demo-delay'))};});
 await advanceTo(page,7000);const a=await sample();await page.clock.runFor(400);const b=await sample();await page.clock.runFor(400);const c=await sample();
 expect(a.scale).toBe(1);expect(b.scale).toBe(1);expect(c.scale).toBe(1);
 const firstSpeed=(a.x-b.x)/(b.time-a.time),secondSpeed=(b.x-c.x)/(c.time-b.time);
 expect(firstSpeed).toBeGreaterThan(0);expect(firstSpeed).toBeCloseTo(secondSpeed,2);
 await demo.locator('.hd-stage').screenshot({path:testInfo.outputPath('train.png')});
 await advanceTo(page,7900);expect(await starScale()).toBeCloseTo(1,3);
 await advanceTo(page,8600);expect(await starScale()).toBeLessThan(1);expect(await starScale()).toBeGreaterThan(.7);
 await advanceTo(page,9900);expect(await starScale()).toBeCloseTo(.7,3);
 const after=await demo.locator('.hd-the-best').boundingBox();expect(after!.x).toBeCloseTo(anchor!.x,0);expect(after!.y).toBeCloseTo(anchor!.y,0);
 await demo.locator('.hd-stage').screenshot({path:testInfo.outputPath('three-and-half-stars.png')});
 for(const [time,scene] of [[14800,'favorites'],[18500,'tastes'],[23300,'nearby']] as const){await advanceTo(page,time);await expect(demo).toHaveAttribute('data-scene',scene);await demo.locator('.hd-stage').screenshot({path:testInfo.outputPath(`scene-${scene}.png`)});}
 await advanceTo(page,28100);await expect(demo).toHaveAttribute('data-complete','true');await expect(demo).toHaveAttribute('data-running','false');
 await expect(demo.getByRole('link',{name:'Create your account'})).toHaveAttribute('href','/auth/login');
 await expect(demo.locator('.hd-final h3>span')).toHaveCSS('color','rgb(225, 45, 18)');
 expect(await demo.textContent()).not.toMatch(/[\u00c2\u00c3\u00e2]/u);expect(paid).toEqual([]);
 await demo.locator('.hd-stage').screenshot({path:testInfo.outputPath('final.png')});
 const replay=demo.getByRole('button',{name:'Replay demo'});await expect(replay).toBeVisible();
 await replay.click();await expect(demo).toHaveAttribute('data-scene','wordmark');await expect(demo).toHaveAttribute('data-running','true');
 await expect(replay).toHaveCount(0);await page.clock.runFor(1200);await expect(demo).toHaveAttribute('data-complete','false');
 expect(paid).toEqual([]);
});

test('clicking the demo does not pause it; keyboard and reduced-motion controls still work',async({page},testInfo)=>{
 await page.setViewportSize({width:375,height:667});await home(page);
 const demo=page.getByRole('region',{name:'East Eats product demo'});
 await demo.focus();await expect(demo).toHaveAttribute('data-running','true');
 await demo.click({position:{x:20,y:20}});await expect(demo).toHaveAttribute('data-running','true');
 await demo.press('Escape');await expect(demo).toHaveAttribute('data-running','false');const paused=await demo.getAttribute('data-time');await page.clock.runFor(700);expect(await demo.getAttribute('data-time')).toBe(paused);
 await demo.press('Enter');await expect(demo).toHaveAttribute('data-running','true');
 for(const [time,name] of [[5600,'stars'],[7400,'train'],[9900,'reviews'],[14800,'favorites'],[23300,'nearby']] as const){
  await advanceTo(page,time);
  if(name==='favorites')expect(await demo.locator('.hd-favorites').evaluate(scene=>{const stage=scene.parentElement!.getBoundingClientRect();return ['.hd-demo-title','.hd-search-card'].every(selector=>{const box=scene.querySelector(selector)!.getBoundingClientRect();return box.top>=stage.top&&box.bottom<=stage.bottom;});})).toBe(true);
  await demo.locator('.hd-stage').screenshot({path:testInfo.outputPath(`phone-${name}.png`)});
 }
 await demo.press('Escape');await expect(demo).toHaveAttribute('data-running','false');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(demo).toHaveAttribute('data-reduced-motion','true');await expect(demo).toHaveAttribute('data-scene','final');
 await expect(demo.getByRole('link',{name:'Create your account'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await demo.locator('.hd-stage').screenshot({path:testInfo.outputPath('phone-final.png')});
});

for(const viewport of [{width:375,height:812},{width:1440,height:1000}]){
 test(`the footer opens William's About page at ${viewport.width}px`,async({page},testInfo)=>{
  await page.setViewportSize(viewport);await home(page);
  const footer=page.getByRole('contentinfo');
  await expect(footer).toContainText('EastEats \u00a9 2026');await expect(footer).toContainText('Created by William Chenyin');
  await footer.getByRole('link',{name:'About',exact:true}).click();await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('heading',{level:1,name:/I just want a really/})).toBeVisible();
  await expect(page.getByText('A note from William Chenyin',{exact:true})).toBeVisible();
  await expect(page.getByText(/Say a noodle shop has 3.5 stars/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('about.png'),fullPage:true});
  await expect(page.getByRole('link',{name:'Find my next meal',exact:false})).toHaveAttribute('href','/');
  await expect(page.getByRole('contentinfo').getByRole('link',{name:'About',exact:true})).toHaveAttribute('aria-current','page');
 });
}
