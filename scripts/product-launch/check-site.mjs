import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const base=process.env.SITE_URL || 'http://127.0.0.1:7645/';
const browser=await chromium.launch({headless:true,channel:'msedge'});
const results=[];
try{
 for(const width of [1440,390,768]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('h1').count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
  await page.getByRole('button',{name:'影像章节',exact:true}).click();
  await page.locator('#showcase-image').evaluate(image=>image.decode());
  assert.match(await page.locator('#showcase-image').getAttribute('src'),/video.webp$/);
  await page.getByRole('button',{name:'版本资料',exact:true}).click();
  await page.locator('#showcase-image').evaluate(image=>image.decode());
  await page.locator('.feature-table summary').nth(2).click();
  assert.ok(await page.locator('.feature-table details').nth(2).evaluate(el=>el.open));
  await page.locator('.feature-table summary').nth(2).click();
  const media=await page.locator('img').evaluateAll(images=>images.map(image=>({src:image.getAttribute('src'),width:image.naturalWidth})));
  // Ensure lazy images are decoded before taking the page overview.
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>{image.loading='eager';return image.decode();})));
  await page.evaluate(()=>document.querySelectorAll('.reveal').forEach(element=>element.classList.add('visible')));
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:`artifacts/product-launch/website-${width}.png`,fullPage:true});
  await page.screenshot({path:`artifacts/product-launch/website-${width}-hero.png`});
  assert.equal(errors.length,0,errors.join('\n'));
  results.push({width,noHorizontalOverflow:true,images:media.length,screenshotSwitch:true,accordion:true,errors});
  await page.close();
 }
 await writeFile('artifacts/product-launch/site-verification.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
}finally{await browser.close();}
