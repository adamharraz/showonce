/* Read-only public-page checks: no model calls or media capture. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/muham/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('fs');
const topics = [ ['problem','The Problem'], ['solution','Our Solution'], ['value','Why ShowOnce'], ['ai','How AI Works'], ['evidence','Evidence & Testing'], ['impact','Impact & Next Steps'] ];
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    fs.mkdirSync('artifacts/ui',{recursive:true});
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    // All explanation pages must work when configuration is unavailable.
    await context.route('**/api/config',r=>r.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8001/welcome');
    for (const [index,[slug,label]] of topics.entries()) {
      const button = page.getByRole('button',{name:'Explore ShowOnce',exact:true});
      await button.focus();
      await page.keyboard.press('Enter');
      assert.equal(await button.getAttribute('aria-expanded'),'true');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.activeElement.textContent),'The Problem');
      await page.keyboard.press('Escape');
      assert.equal(await button.getAttribute('aria-expanded'),'false');
      assert.equal(await button.evaluate(e=>e===document.activeElement),true);
      await button.click();
      await page.locator('#explore-topics').getByRole('link',{name:label,exact:true}).click();
      assert.equal(new URL(page.url()).pathname,`/about/${slug}`);
      await page.getByRole('heading',{level:1}).waitFor();
      await page.reload();
      await page.getByRole('heading',{level:1}).waitFor();
      assert.equal(await page.title(),`${label} | ShowOnce`);
      await button.click();
      assert.equal(await page.locator('#explore-topics [aria-current="page"]').textContent(),label);
      await page.keyboard.press('Escape');
      const pager=page.getByRole('navigation',{name:'Explanation topics'});
      assert.equal(await pager.getByRole('link').count(),index===0||index===topics.length-1?1:2);
      if(index>0) assert.equal(await pager.getByRole('link',{name:/Previous topic/}).getAttribute('href'),`/about/${topics[index-1][0]}`);
      if(index<topics.length-1) assert.equal(await pager.getByRole('link',{name:/Next topic/}).getAttribute('href'),`/about/${topics[index+1][0]}`);
      for (const width of [1440,768,390,320]) {
        await page.setViewportSize({width,height:1000});
        await page.evaluate(()=>document.fonts.ready);
        for(const img of await page.locator('main img').all()) { await img.scrollIntoViewIfNeeded(); await img.evaluate(i=>i.decode()); }
        await page.evaluate(()=>scrollTo(0,0));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${slug} overflow ${width}`);
        await button.click();
        assert.equal(await page.locator('#explore-topics a').count(),6);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${slug} menu overflow ${width}`);
        if(width===320) await page.screenshot({path:`artifacts/ui/about-${slug}-menu-320.png`});
        await page.keyboard.press('Escape');
        if(width===1440||width===320) await page.screenshot({path:`artifacts/ui/about-${slug}-${width}.png`,fullPage:true});
      }
      await page.getByRole('link',{name:'Open ShowOnce',exact:true}).first().click();
      assert.equal(new URL(page.url()).pathname,'/enter');
      await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
      await page.goBack();
      await page.getByRole('heading',{level:1}).waitFor();
      assert.equal(new URL(page.url()).pathname,`/about/${slug}`);
      await page.getByRole('link',{name:'How it works',exact:true}).click();
      assert.equal(new URL(page.url()).hash,'#how-it-works');
      await page.waitForFunction(()=>{
        const section=document.getElementById('how-it-works');
        if(!section) return false;
        const offset=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)+parseFloat(getComputedStyle(section).scrollMarginTop);
        return Math.abs(section.getBoundingClientRect().top-offset)<2;
      });
    }
    assert.deepEqual(errors,[]);
    console.log('Six public pages: navigation, keyboard/Escape, current topic, refresh/Back, app entry, unavailable backend, and 24 responsive layouts passed.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
