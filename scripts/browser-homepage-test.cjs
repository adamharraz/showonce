/* Public entry and routing checks. No AI or media sessions are started. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/muham/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    fs.mkdirSync('artifacts/ui', {recursive:true});
    const context = await browser.newContext({viewport:{width:1440,height:1000}, reducedMotion:'reduce'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:8001/');
    await page.getByRole('heading', {level:1, name:/Turn your demonstration/}).waitFor();
    await page.getByRole('button',{name:'Explore ShowOnce',exact:true}).click();
    await page.getByRole('link',{name:'Evidence & Testing',exact:true}).click();
    await page.getByRole('heading',{name:'Early feedback. Clear next steps.',exact:true}).waitFor();
    for (const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,`Evidence overflow at ${width}`);
      await page.screenshot({path:`artifacts/ui/evidence-${width}.png`,fullPage:true});
    }
    assert.equal(await page.locator('.evidence-metrics article').count(),3);
    await page.getByRole('link',{name:'Back to homepage',exact:true}).click();
    await page.locator('.home-features').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('.home-features img')].every(i => i.complete && i.naturalWidth > 0));
    await page.evaluate(() => scrollTo(0,0));
    for (const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}`);
      assert.equal(await page.locator('.home-features img').evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0)), true);
      await page.screenshot({path:`artifacts/ui/homepage-${width}.png`,fullPage:true});
    }
    await page.getByRole('link',{name:'How it works',exact:true}).click();
    assert.equal(new URL(page.url()).hash, '#how-it-works');
    await page.getByRole('link',{name:'Back to top ↑',exact:true}).click();
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement?.tagName === 'A'));
    await page.getByRole('link',{name:'Open ShowOnce',exact:true}).first().click();
    const continueButton = page.getByRole('button',{name:'Continue to ShowOnce',exact:true});
    assert.equal(await continueButton.isEnabled(),false);
    await page.getByRole('checkbox',{name:/I am 18/}).check();
    await continueButton.click();
    await page.getByRole('button',{name:'Practise a task',exact:true}).click();
    await page.getByRole('heading',{name:'Lessons',exact:true}).waitFor();
    await page.reload();
    await page.getByRole('heading',{name:'Lessons',exact:true}).waitFor();
    await page.goto('http://127.0.0.1:8001/welcome');
    await page.getByRole('link',{name:'Open ShowOnce',exact:true}).first().click();
    await page.getByRole('heading',{name:'Lessons',exact:true}).waitFor();
    await page.goBack();
    await page.getByRole('heading',{name:/Turn your demonstration/}).waitFor();
    // New visitors retain a direct coach URL through consent and login.
    const fresh = await browser.newContext({viewport:{width:1440,height:1000}});
    const direct = await fresh.newPage();
    await direct.goto('http://127.0.0.1:8001/coach');
    await direct.getByRole('checkbox',{name:/I am 18/}).check();
    await direct.getByRole('button',{name:'Continue to ShowOnce',exact:true}).click();
    await direct.getByRole('button',{name:'Teach a task',exact:true}).click();
    await direct.getByRole('heading',{name:'Get live help',exact:true}).waitFor();
    assert.equal(new URL(direct.url()).pathname,'/coach');
    await direct.getByRole('button',{name:'Sign out',exact:true}).click();
    await direct.getByRole('heading',{name:/Turn your demonstration/}).waitFor();
    await direct.getByRole('link',{name:'Open ShowOnce',exact:true}).first().click();
    assert.equal(await direct.getByRole('button',{name:'Continue to ShowOnce',exact:true}).isEnabled(),false);
    // The public page remains useful when app configuration fails.
    const offline = await browser.newContext();
    await offline.route('**/api/config', route => route.abort());
    const unavailable = await offline.newPage();
    await unavailable.goto('http://127.0.0.1:8001/');
    await unavailable.getByRole('heading',{name:/Turn your demonstration/}).waitFor();
    await unavailable.getByRole('link',{name:'Open ShowOnce',exact:true}).first().click();
    await unavailable.getByRole('button',{name:'Try again',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('Homepage layouts, entry, returning session, Back, deep-link, sign-out and unavailable configuration passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
