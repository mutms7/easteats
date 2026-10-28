import {test,expect} from '@playwright/test';
test('login gate protects data and rejects cross-site writes @smoke',async({request})=>{
 expect((await request.get('/api/saved')).status()).toBe(401);
 expect((await request.post('/api/taste',{headers:{origin:'https://other.example'},data:{}})).status()).toBe(403);
});
test('phone journey: questionnaire, discovery, saved places, details, reload and logout @smoke',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.getByRole('link',{name:/Continue with Google/})).toBeVisible();
 await expect(page.getByRole('heading',{name:/Where do you/})).toHaveCount(0);
 await page.getByRole('button',{name:'Try the demo'}).click();
 await expect(page.getByRole('heading',{name:/Where do you.*love eating/})).toBeVisible();
 await page.getByRole('textbox',{name:'Restaurant name'}).fill('Little Bowl');await page.getByRole('button',{name:'Find restaurant',exact:true}).click();
 await page.getByRole('button',{name:'Add favorite',exact:true}).click();
 await page.getByRole('button',{name:'Great value',exact:true}).click();
 await page.reload();await expect(page.getByRole('group',{name:'Little Bowl Workshop'})).toBeVisible();
 await page.getByRole('button',{name:'Find my next meal'}).click();
 await expect(page.getByRole('heading',{name:'Your answers are saved.'})).toBeVisible();
 await page.getByRole('button',{name:'Let’s find somewhere'}).click();await page.getByRole('button',{name:'Berkeley',exact:true}).click();
 await expect(page.getByRole('heading',{name:'What sounds good?'})).toBeVisible();await expect(page.getByRole('button',{name:'Little Bowl Workshop',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Save Little Bowl Workshop',exact:true}).click();
 await page.getByRole('button',{name:/^Saved \(1\)$/}).click();await expect(page.getByRole('heading',{name:'Your saved spots.'})).toBeVisible();
 await page.getByRole('button',{name:'Little Bowl Workshop',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Explore',exact:true}).click();await page.getByRole('button',{name:'Fusion finds',exact:true}).click();
 await expect(page.getByRole('button',{name:'Miso Meets Masa',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Little Bowl Workshop',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('link',{name:/Continue with Google/})).toBeVisible();
});
