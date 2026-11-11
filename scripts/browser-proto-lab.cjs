// Real browser regression for project import; no model calls or saved user data.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://127.0.0.1:8017';

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    page.setDefaultTimeout(20000);
    await page.goto(base + '/proto-lab/');
    await page.waitForFunction(() => window.__protoLab?.S.doc && document.querySelector('#loader').classList.contains('done'));
    await page.locator('[data-add="esp32"]').click();
    await page.locator('[data-add="led"]').click();
    const original = await page.evaluate(() => JSON.parse(JSON.stringify(window.__protoLab.S.doc)));
    const invalid = { items: [{ uid: 'invalid_1', type: 'unknown-component', x: 0, y: 0, rot: 0, props: {} }] };
    await page.locator('#file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Could not open:'));
    assert.deepEqual(await page.evaluate(() => window.__protoLab.S.doc), original, 'rejected imports must preserve the current design');
    await page.locator('#undo').click();
    assert.deepEqual(await page.evaluate(() => window.__protoLab.S.doc.items.map(item => item.type)), ['esp32'], 'rejected imports must preserve Undo');
    const download = page.waitForEvent('download');
    await page.locator('#save').click();
    const saved = await download;
    await page.locator('#new').click();
    await page.locator('#file').setInputFiles(await saved.path());
    await page.waitForFunction(() => window.__protoLab.S.doc.items.length === 1);
    assert.equal(await page.evaluate(() => window.__protoLab.S.doc.items[0].type), 'esp32');
    console.log('PASS: rejected import preserves design and Undo; valid JSON saves and reopens.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
