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
    sessionStorage.setItem("showonce-token", "test-only");
    sessionStorage.setItem("showonce-entry-consent-v1", "accepted");
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
  await page.goto(`${base}/lesson/led-test`);
  await page.getByRole("button", { name: "Explore in 3D" }).click();
  await page
    .getByRole("heading", { name: "Electronics lab", exact: true })
    .waitFor();
  await page.locator("canvas").waitFor();
  await page.getByRole("button", { name: "Resistor", exact: true }).click();
  await page.getByRole("heading", { name: "Resistor", exact: true }).waitFor();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Play blink preview" }).click();
  await page.getByRole("button", { name: "Stop preview" }).waitFor();
  await page.getByRole("button", { name: "Reset view" }).click();
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
    .getByRole("heading", { name: "Use the circuit path below" })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: lesson link, component selection, stages, animation controls, reset, mobile overflow, return, deep link and WebGL fallback; no page errors.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
