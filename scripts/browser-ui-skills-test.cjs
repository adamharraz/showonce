/* Targeted keyboard, pointer and reduced-motion verification; not a screen-reader audit. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require("node:assert/strict");
const fs = require("node:fs");
let browser;
(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto("http://127.0.0.1:8001");
  assert.equal(response.headers()["x-showonce-test-fixture"], "true");
  await page
    .getByRole("button", { name: "Enter as instructor", exact: true })
    .click();
  await page.locator(".lesson-card").first().waitFor();
  assert.equal(await page.title(), "Your lessons | ShowOnce");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "main-content",
  );
  const row = page.locator(".lesson-card").first();
  assert.match(await row.getAttribute("href"), /^\/lesson\//);
  const popupPromise = page.context().waitForEvent("page");
  await row.click({ modifiers: ["Control"] });
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert.match(new URL(popup.url()).pathname, /^\/lesson\//);
  await popup.close();
  const search = page.getByRole("searchbox", { name: "Search lessons" });
  await search.fill("nothing matches this phrase");
  await page
    .getByRole("status")
    .filter({ hasText: "0 lessons shown" })
    .waitFor();
  await search.fill("");
  await page
    .getByRole("button", { name: "Demonstration studio", exact: true })
    .click();
  assert.equal(await page.title(), "Demonstration studio | ShowOnce");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "main-content",
  );
  const start = page.getByRole("button", {
    name: "Start demonstration",
    exact: true,
  });
  assert.equal(await start.isDisabled(), true);
  assert.equal(
    await start.evaluate((el) => getComputedStyle(el).scale),
    "none",
  );
  await page
    .getByRole("button", { name: "Lesson library", exact: true })
    .click();
  await page.getByRole("link", { name: "Open lesson", exact: true }).waitFor();
  const action = page.getByRole("link", { name: "Open lesson", exact: true });
  await action.scrollIntoViewIfNeeded();
  const bounds = await action.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(200);
  assert.equal(
    await action.evaluate((el) => getComputedStyle(el).scale),
    "0.96",
  );
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(200);
  assert.equal(
    await action.evaluate((el) => getComputedStyle(el).scale),
    "none",
  );
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  await menu.focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(
      () => document.activeElement.closest("#main-navigation") !== null,
    ),
    true,
  );
  assert.equal(
    await page
      .locator(".sidebar")
      .evaluate((el) => getComputedStyle(el).overscrollBehavior),
    "contain",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await menu.evaluate((el) => el === document.activeElement),
    true,
  );
  await page.screenshot({
    path: "artifacts/ui/ui-skills-mobile.png",
    fullPage: false,
  });
  for (const button of await page.locator(".lesson-filters button").all()) {
    assert.equal(
      await button.evaluate((el) => el.getBoundingClientRect().height >= 44),
      true,
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/ui/ui-skills-desktop.png",
    fullPage: false,
  });
  const touchContext = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const touch = await touchContext.newPage();
  await touch.goto("http://127.0.0.1:8001");
  await touch
    .getByRole("button", { name: "Enter as instructor", exact: true })
    .tap();
  await touch.locator(".lesson-card").first().waitFor();
  assert.equal(
    await touch.evaluate(() => matchMedia("(hover: hover)").matches),
    false,
  );
  const card = touch.locator(".lesson-card").first();
  const baseBackground = await card.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await card.hover();
  assert.equal(
    await card.evaluate((el) => getComputedStyle(el).backgroundColor),
    baseBackground,
  );
  assert.equal(
    await touch
      .getByRole("searchbox")
      .evaluate((el) => getComputedStyle(el).fontSize),
    "16px",
  );
  await touchContext.close();
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "artifacts/ui/ui-skills-checks.json",
    JSON.stringify(
      {
        nativeLinkNewTab: true,
        routeTitleAndFocus: true,
        resultAnnouncement: true,
        menuFocusRestoration: true,
        touchHoverGuard: true,
        touchTargetSizes: true,
        pressedScale: true,
        reducedMotion: true,
        disabledMotion: true,
        pageErrors: errors,
        notVerified: [
          "Manual screen-reader walkthrough",
          "Browser animation-panel replay at 10% speed",
          "Complete WCAG audit",
        ],
      },
      null,
      2,
    ),
  );
  console.log("UI Skills keyboard, touch, links and motion checks passed.");
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => await browser?.close());
