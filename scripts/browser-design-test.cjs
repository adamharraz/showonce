/* UI fixtures test layout and controls; they are not evidence of live AI accuracy. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const fs = require("fs");
const assert = require("node:assert/strict");
let browser;
(async () => {
  fs.mkdirSync("artifacts/ui", { recursive: true });
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [],
    checks = [],
    contrast = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto("http://127.0.0.1:8001");
  assert.equal(response.headers()["x-showonce-test-fixture"], "true");
  async function inspect(name) {
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => {
      const color = (value) => (value.match(/[\d.]+/g) || []).map(Number);
      const composite = (a, b) =>
        a.slice(0, 3).map((x, i) => x * (a[3] ?? 1) + b[i] * (1 - (a[3] ?? 1)));
      const lum = (rgb) =>
        rgb
          .slice(0, 3)
          .map((x) => x / 255)
          .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
          .reduce((a, x, i) => a + x * [0.2126, 0.7152, 0.0722][i], 0);
      const failures = [];
      let checked = 0;
      for (const el of document.querySelectorAll("*")) {
        if (
          !Array.from(el.childNodes).some(
            (n) => n.nodeType === 3 && n.textContent.trim(),
          )
        )
          continue;
        const style = getComputedStyle(el),
          rect = el.getBoundingClientRect();
        if (
          !rect.width ||
          !rect.height ||
          style.visibility === "hidden" ||
          el.closest(":disabled")
        )
          continue;
        if (el.closest("svg,video")) continue;
        let background = [255, 255, 255],
          ancestors = [];
        for (let p = el; p; p = p.parentElement) ancestors.unshift(p);
        for (const p of ancestors)
          background = composite(
            color(getComputedStyle(p).backgroundColor),
            background,
          );
        const foreground = composite(color(style.color), background);
        const a = lum(foreground),
          b = lum(background),
          ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const large =
          parseFloat(style.fontSize) >= 24 ||
          (parseFloat(style.fontSize) >= 18.66 &&
            parseInt(style.fontWeight) >= 700);
        checked++;
        if (ratio < (large ? 3 : 4.5))
          failures.push({
            text: el.textContent.trim().slice(0, 60),
            selector: el.tagName + "." + el.className,
            ratio: Math.round(ratio * 100) / 100,
          });
      }
      return {
        checked,
        failures,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    contrast.push({ name, ...result });
    assert.equal(result.overflow, false, name + " overflow");
    assert.deepEqual(result.failures, [], name + " contrast");
  }
  await inspect("login");
  await page
    .getByRole("button", { name: "Enter as instructor", exact: true })
    .click();
  await page.locator(".lesson-card").first().waitFor();
  await inspect("library");
  checks.push("Instructor login opens saved lesson library.");
  const count = await page.locator(".lesson-card").count();
  await page
    .getByRole("group", { name: "Filter lessons" })
    .getByRole("button", { name: /^Published/ })
    .click();
  assert.equal(await page.locator(".lesson-card").count(), count);
  await page.getByRole("button", { name: /^Drafts/ }).click();
  await page
    .getByRole("heading", { name: "No lessons in this view" })
    .waitFor();
  await page.getByRole("button", { name: /^All lessons/ }).click();
  assert.equal(await page.locator(".lesson-card").count(), count);
  checks.push(
    "Published, Drafts and All filters update the lesson rows and empty state.",
  );
  await page.route("**/api/lessons", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Test service unavailable" }),
    }),
  );
  await page.reload();
  await page.getByText("Test service unavailable", { exact: false }).waitFor();
  await page.unroute("**/api/lessons");
  await page
    .getByRole("button", { name: "Retry loading", exact: true })
    .click();
  await page.locator(".lesson-card").first().waitFor();
  checks.push(
    "Library request failure shows error; Retry loading restores saved lessons.",
  );
  await page.route("**/api/lessons", async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });
  await page.reload();
  await page.getByRole("status").getByText("Loading your lessons…").waitFor();
  await page.locator(".lesson-card").first().waitFor();
  await page.unroute("**/api/lessons");
  checks.push(
    "Pending library request shows a named loading state before data appears.",
  );
  await page
    .getByRole("button", { name: "New demonstration", exact: true })
    .click();
  for (const name of ["Phone camera", "Share screen", "Webcam"]) {
    const source = page.getByRole("button", { name: new RegExp(name) });
    await source.click();
    assert.equal(await source.getAttribute("aria-pressed"), "true");
  }
  checks.push(
    "Camera, phone and screen source controls change selected state.",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Start demonstration", exact: true })
      .isEnabled(),
    false,
  );
  await page.getByRole("checkbox", { name: /18\+/ }).check();
  assert.equal(
    await page
      .getByRole("button", { name: "Start demonstration", exact: true })
      .isEnabled(),
    true,
  );
  await page
    .getByRole("checkbox", { name: /Include natural narration/ })
    .uncheck();
  checks.push("Consent gates capture; narration can be disabled.");
  await inspect("capture-setup");
  await page
    .getByRole("button", { name: "Lesson library", exact: true })
    .click();
  await page.locator(".lesson-card").first().click();
  await page.locator(".read-step").first().waitFor();
  await inspect("published-lesson");
  await page.getByRole("button", { name: /Open draft/ }).click();
  await page
    .getByRole("heading", { name: "Review lesson", exact: true })
    .waitFor();
  await inspect("review");
  await page
    .getByRole("button", { name: /Add an instructor-confirmed step/ })
    .click();
  assert.equal(await page.locator(".review-step").count(), 2);
  const title = page.locator(".review-step-header input");
  const original = await title.first().inputValue();
  await page
    .getByRole("button", { name: "Move step up", exact: true })
    .last()
    .click();
  assert.equal(await title.last().inputValue(), original);
  await page
    .getByRole("button", { name: "Move step down", exact: true })
    .first()
    .click();
  assert.equal(await title.first().inputValue(), original);
  await page
    .getByRole("button", { name: "Delete step", exact: true })
    .last()
    .click();
  assert.equal(await page.locator(".review-step").count(), 1);
  checks.push("Add step, move up/down and delete update the draft in memory.");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Checkpoint description", exact: true })
    .last()
    .fill("Test manual checkpoint");
  await page
    .getByRole("combobox", {
      name: "Checkpoint verification method",
      exact: true,
    })
    .last()
    .selectOption("visual");
  await page
    .getByRole("button", { name: "Remove checkpoint", exact: true })
    .last()
    .click();
  await page
    .getByRole("combobox", { name: "Evidence source" })
    .selectOption("instructor-confirmed");
  checks.push(
    "Checkpoint add, edit, verification mode, removal and evidence provenance respond.",
  );
  await page
    .getByRole("button", { name: "Remove reference", exact: true })
    .click();
  assert.equal(await page.locator(".evidence-row .evidence").count(), 0);
  checks.push(
    "Remove reference clears the selected draft evidence. Changes are not saved by this test.",
  );
  await page
    .getByRole("button", { name: "Lesson library", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Close navigation", exact: true })
      .getAttribute("aria-expanded"),
    "true",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await page.keyboard.press("Tab");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Connection & validation", exact: true })
    .click();
  checks.push(
    "Mobile menu opens with Enter, closes with Escape and navigates to settings.",
  );
  await inspect("mobile-settings");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Enter as student", exact: true })
    .click();
  await page.locator(".lesson-card").first().waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Demonstration studio", exact: true })
      .count(),
    0,
  );
  checks.push(
    "Sign out works; student sign-in hides instructor capture and draft filters.",
  );
  await inspect("student-library");
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "artifacts/ui/design-checks.json",
    JSON.stringify(
      {
        checks,
        contrast,
        pageErrors: errors,
        note: "Isolated test-only model. These checks do not call live Gemini.",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      checks: checks.length,
      contrastScreens: contrast.length,
      pageErrors: errors,
    }),
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => browser?.close());
