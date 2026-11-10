const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
// Test-only API fixtures verify UI integration, not live AI or circuit accuracy.
const base = process.env.BASE_URL || "http://127.0.0.1:5173";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  require("node:fs").mkdirSync("artifacts/ui", { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("showonce-token", "test-only");
    } catch {}
  });
  const lesson = {
    id: "led-test",
    owner_id: "test",
    version: 1,
    draft: {
      title: "LED circuit",
      summary: "Test fixture",
      materials: ["LED", "ESP32"],
      steps: [],
    },
  };
  await context.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      path === "/api/config"
        ? {
            local_login: true,
            demo_mode: false,
            ai_configured: false,
            free_tier_confirmed: false,
          }
        : path === "/api/me"
          ? { id: "test", role: "student" }
          : path === "/api/lessons"
            ? [
                {
                  id: "led-test",
                  title: "LED circuit",
                  step_count: 0,
                  latest_version: 1,
                  owned: false,
                  summary: "Test fixture",
                },
              ]
            : path.includes("/versions/")
              ? lesson
              : [];
    return route.fulfill({ json: body });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error(m.text());
  });
  await page.goto(`${base}/lesson/led-test`);
  await page.getByRole("button", { name: "Explore in 3D" }).click();
  await page
    .getByRole("heading", { name: "Electronics lab", exact: true })
    .waitFor();
  const course = page.frameLocator(
    'iframe[title="Arduino interactive course and simulator"]',
  );
  await course.locator("html:not(.is-loading)").waitFor({ timeout: 60000 });
  await course.locator("#board-canvas").waitFor();
  assert.equal(await course.locator("#lesson-list > *").count(), 16);
  await course.locator('li[data-id="blink"]').click();
  await course.getByRole("button", { name: "Run sketch", exact: true }).click();
  await course
    .locator('.code-card[data-state="running"]')
    .waitFor({ timeout: 30000 });
  await course.locator(".btn-run").click();
  await course.locator('.code-card[data-state="idle"]').waitFor();
  await course.getByRole("tab", { name: "Pinout", exact: true }).click();
  await course.locator('[data-view="reset"]').click();
  const child = page
    .frames()
    .find((f) => f.url().includes("/arduino-reference/"));
  assert.equal(
    await child.evaluate(() => {
      try {
        return !!parent.document;
      } catch {
        return false;
      }
    }),
    false,
    "reference cannot access parent",
  );
  assert.equal(
    await child.evaluate(() => {
      try {
        return !!sessionStorage.getItem("showonce-token");
      } catch {
        return false;
      }
    }),
    false,
    "reference cannot read login token",
  );
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: "artifacts/ui/course-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: "artifacts/ui/course-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Circuit basics", exact: true })
    .click();
  await page.locator("canvas").waitFor();
  await page.getByRole("button", { name: "Resistor", exact: true }).click();
  await page.getByRole("heading", { name: "Resistor", exact: true }).waitFor();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Play blink preview" }).click();
  await page.getByRole("button", { name: "Stop preview" }).waitFor();
  await page.getByRole("button", { name: "Reset view" }).click();
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: "artifacts/ui/lab-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "mobile overflow",
  );
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: "artifacts/ui/lab-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue your lesson" }).click();
  await page
    .getByRole("heading", { name: "LED circuit", exact: true })
    .waitFor();
  await page.goto(`${base}/lab/electronics?lesson=led-test`);
  await page.getByRole("button", { name: "Back to your lesson" }).waitFor();
  const fallback = await context.newPage();
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return String(type).includes("webgl")
        ? null
        : original.call(this, type, ...args);
    };
  });
  await fallback.goto(`${base}/lab/electronics`);
  await fallback
    .getByRole("button", { name: "Circuit basics", exact: true })
    .click();
  await fallback
    .getByRole("heading", { name: "Use the circuit path below" })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 16-lesson reference loads; blink run/stop, pinout, reset, opaque-origin isolation, desktop/mobile, basics, lesson return and fallback; no page errors.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
