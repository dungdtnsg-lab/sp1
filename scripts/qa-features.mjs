import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: 10.7508, longitude: 106.7291 },
  permissions: ["geolocation"],
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.screenshot({ path: "/workspace/screenshots/feat-home.png" });

await page.getByRole("button", { name: /Log/ }).click();
await page.waitForTimeout(500);
const xem = page.getByRole("button", { name: "Xem lại" }).first();
console.log("HAS_REPLAY", await xem.count());
await page.screenshot({ path: "/workspace/screenshots/feat-export.png" });
await xem.click();
await page.waitForTimeout(1800);
await page.screenshot({ path: "/workspace/screenshots/feat-replay.png" });
const replayBanner = await page.locator("text=/Xem lại/").first().innerText().catch(() => "");
console.log("REPLAY_BANNER", replayBanner);

await page.getByRole("button", { name: /Log/ }).click().catch(() => {});
await page.waitForTimeout(200);
// back if still on map
const voice = page.getByTitle("Giọng đọc tốc độ");
console.log("HAS_VOICE", await voice.count());

await page.getByRole("button", { name: /Current Track/ }).click();
await page.waitForTimeout(300);
const closeReplay = page.getByTitle("Đóng");
if (await closeReplay.count()) await closeReplay.click();
await page.waitForTimeout(300);

await page.getByRole("button", { name: "BẬT GPS THEO DÕI" }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: "/workspace/screenshots/feat-gps-cam.png" });
const body = await page.locator("body").innerText();
console.log("HAS_CAMERA_UI", /CAMERA/.test(body));
console.log("BODY_SNIP", body.replace(/\n/g, " | ").slice(0, 500));

await browser.close();
console.log("QA features done");
