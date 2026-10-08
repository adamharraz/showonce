/* Local UI smoke test. Fake camera frames test transport, not model accuracy. */
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/Adam Harraz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const fs = require("fs");
let activeBrowser;

(async () => {
  fs.mkdirSync("artifacts/ui", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  activeBrowser = browser;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["camera", "microphone"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8000");
  await page.getByRole("button", { name: /instructor/i }).click();
  await page.getByRole("heading", { name: "Show it once." }).waitFor();
  await page.screenshot({
    path: "artifacts/ui/library-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Demonstration studio", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/ui/studio-desktop.png",
    fullPage: true,
  });
  await page.getByRole("checkbox", { name: /18\+/ }).check();
  await page.getByRole("button", { name: /start demonstration/i }).click();
  await page.waitForTimeout(3500);
  const frameCount = await page.locator(".capture-meta").innerText();
  await page.getByRole("button", { name: /pause/i, exact: true }).click();
  await page.waitForTimeout(250);
  await page.screenshot({
    path: "artifacts/ui/capture-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /finish/i, exact: true }).click();
  await page.getByText(/No AI observations/i).waitFor();
  await page
    .getByRole("button", { name: "Lesson library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Demonstration studio", exact: true })
    .click();
  await page.getByRole("button", { name: /Phone camera/ }).click();
  await page.getByRole("checkbox", { name: /18\+/ }).check();
  await page.getByRole("button", { name: /start demonstration/i }).click();
  const phoneLink = await page.locator(".phone-stage a").getAttribute("href");
  const phone = await context.newPage();
  await phone.goto(phoneLink);
  await phone.getByRole("checkbox", { name: /18\+/ }).check();
  await phone.getByRole("button", { name: "Connect camera" }).click();
  await phone.getByText("Camera connected", { exact: false }).waitFor();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /pause/i, exact: true }).click();
  await phone.getByText("paused. Control", { exact: false }).waitFor();
  await phone.screenshot({
    path: "artifacts/ui/paired-phone.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /finish/i, exact: true }).click();
  await page.getByText(/No AI observations/i).waitFor();
  await phone.close();
  await page
    .getByRole("button", { name: "Lesson library", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "artifacts/ui/library-mobile.png",
    fullPage: true,
  });
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  const report = {
    pageErrors: errors,
    horizontalOverflow,
    frameCount,
    note: "Synthetic camera; no Gemini calls, accuracy or live latency validation.",
  };
  fs.writeFileSync("artifacts/ui/smoke.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await browser.close();
  if (errors.length || horizontalOverflow) process.exitCode = 1;
})().catch(async (e) => {
  console.error(e);
  await activeBrowser?.close();
  process.exitCode = 1;
});
