/* Real API records and synthetic captured references, never fabricated product data. */
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
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto("http://127.0.0.1:8001");
  assert.equal(response.headers()["x-showonce-test-fixture"], "true");
  await page
    .getByRole("button", { name: "Enter as instructor", exact: true })
    .click();
  await page.locator(".lesson-card").first().waitFor();
  const count = await page.locator(".lesson-card").count();
  await page
    .getByRole("searchbox", { name: "Search lessons" })
    .fill("no matching lesson xyz");
  await page
    .getByRole("heading", { name: "No lessons in this view" })
    .waitFor();
  assert.equal(await page.locator(".lesson-card").count(), 0);
  await page.getByRole("searchbox", { name: "Search lessons" }).fill("");
  assert.equal(await page.locator(".lesson-card").count(), count);
  await page
    .getByRole("group", { name: "Task type" })
    .getByRole("button", { name: "On screen", exact: true })
    .click();
  assert.equal(await page.locator(".lesson-card").count(), 0);
  await page
    .getByRole("group", { name: "Task type" })
    .getByRole("button", { name: "Physical tasks", exact: true })
    .click();
  assert.equal(await page.locator(".lesson-card").count(), count);
  await page
    .getByRole("group", { name: "Task type" })
    .getByRole("button", { name: "All tasks", exact: true })
    .click();
  await page.locator(".lesson-thumbnail img").first().waitFor();
  assert.equal(
    await page
      .locator(".lesson-thumbnail img")
      .first()
      .evaluate((img) => img.naturalWidth > 0),
    true,
  );
  const layouts = [];
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false);
    layouts.push({ width, overflow });
    await page.screenshot({
      path: `artifacts/ui/demonstrations-library-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Open lesson", exact: true }).click();
  await page
    .getByRole("button", { name: "Start guided practice", exact: true })
    .waitFor();
  const token = await page.evaluate(() =>
    sessionStorage.getItem("showonce-token"),
  );
  const headers = { Authorization: "Bearer " + token };
  const lessons = await (
    await page.request.get("http://127.0.0.1:8001/api/lessons", { headers })
  ).json();
  const lesson = lessons.find((l) => l.latest_version);
  const created = await page.request.post(
    "http://127.0.0.1:8001/api/sessions",
    {
      headers,
      data: {
        mode: "practice",
        source: "camera",
        lesson_id: lesson.id,
        version: lesson.latest_version,
      },
    },
  );
  assert.equal(created.status(), 201);
  const session = await created.json();
  try {
    await page.goto("http://127.0.0.1:8001/");
    await page
      .getByRole("button", { name: "Resume practice", exact: true })
      .waitFor();
    await page.screenshot({
      path: "artifacts/ui/demonstrations-resume-1440.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Resume practice", exact: true })
      .click();
    await page
      .getByRole("heading", { name: session.title, exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).pathname, "/practice/" + session.id);
  } finally {
    await page.request.post(
      `http://127.0.0.1:8001/api/sessions/${session.id}/finish`,
      { headers },
    );
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "artifacts/ui/demonstrations-checks.json",
    JSON.stringify(
      {
        search: true,
        taskFilters: true,
        authenticatedPreviews: true,
        featureNavigation: true,
        resumeNavigation: true,
        layouts,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Search, task filters, authenticated previews and featured lesson navigation passed.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => await browser?.close());
