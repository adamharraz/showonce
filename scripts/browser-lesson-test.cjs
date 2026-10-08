/* Integration test with an isolated, explicitly marked model fixture, not live AI. */
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/Adam Harraz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const fs = require("fs");
let browser;
(async () => {
  fs.mkdirSync("artifacts/ui", { recursive: true });
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["camera", "microphone"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto("http://127.0.0.1:8001");
  if (response.headers()["x-showonce-test-fixture"] !== "true")
    throw new Error("Refusing to test against an unmarked model server");
  await page.getByRole("button", { name: /instructor/i }).click();
  await page
    .getByRole("button", { name: "Demonstration studio", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /18\+/ }).check();
  await page
    .getByRole("button", { name: "Start demonstration", exact: true })
    .click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /Finish & review/i }).click();
  await page.getByRole("heading", { name: "Make the lesson yours." }).waitFor();
  if (
    await page
      .getByRole("button", { name: "Publish lesson", exact: true })
      .isEnabled()
  )
    throw new Error("Unreviewed lesson was publishable");
  await page
    .locator(".question textarea")
    .fill("Instructor confirmed the fixture setting.");
  await page
    .getByRole("checkbox", { name: /I reviewed the instructions/ })
    .check();
  await page.screenshot({
    path: "artifacts/ui/review-test-fixture.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Publish lesson", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Test-generated lesson", exact: true })
    .waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export lesson", exact: true })
    .click();
  const download = await downloadPromise;
  await download.saveAs("artifacts/ui/lesson-test-fixture.zip");
  await page
    .getByRole("button", { name: "Start guided practice", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /18\+/ }).check();
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await page.waitForTimeout(2500);
  await page
    .getByRole("button", { name: "Finish practice", exact: true })
    .click();
  await page.getByText("Visible checkpoint met", { exact: true }).waitFor();
  await page.screenshot({
    path: "artifacts/ui/practice-test-fixture.png",
    fullPage: true,
  });
  fs.writeFileSync(
    "artifacts/ui/lesson-flow-test.json",
    JSON.stringify(
      {
        pageErrors: errors,
        note: "Test-only model fixture and synthetic camera. Verifies UI integration, not model accuracy or latency.",
      },
      null,
      2,
    ),
  );
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Review, clarification, publishing, export and practice UI passed with test-only fixtures.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => await browser?.close());
