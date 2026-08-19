import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: 10.749717, longitude: 106.728654 },
  permissions: ["geolocation"],
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const voiceLabel = await page.getByRole("button", { name: /Giọng/ }).innerText();
console.log("VOICE_FOOTER", voiceLabel);
await page.screenshot({ path: "/workspace/screenshots/voice-off.png" });
await page.getByRole("button", { name: /Giọng/ }).click();
await page.waitForTimeout(200);
console.log("VOICE_ON", await page.getByRole("button", { name: /Giọng/ }).innerText());
await page.getByRole("button", { name: /Giọng/ }).click();
await page.waitForTimeout(150);
console.log("VOICE_OFF_AGAIN", await page.getByRole("button", { name: /Giọng/ }).innerText());

await page.getByRole("button", { name: "BẬT GPS THEO DÕI" }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: "/workspace/screenshots/map-follow-1.png" });
await context.setGeolocation({ latitude: 10.7532, longitude: 106.7311 });
await page.waitForTimeout(2000);
await page.screenshot({ path: "/workspace/screenshots/map-follow-2.png" });
const body = await page.locator("body").innerText();
console.log("HAS_VOICE_OFF", /Giọng: TẮT/.test(body));
console.log("SNIP", body.replace(/\n/g, " | ").slice(0, 280));
await browser.close();
console.log("done");
