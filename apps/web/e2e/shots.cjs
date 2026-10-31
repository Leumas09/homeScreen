// Captures aux trois formats, de jour et de nuit, heure figée par ?at=
const { chromium } = require("playwright");
const base = process.argv[2] || "http://localhost:4173";
const out = process.argv[3] || "shots";
const sizes = { phone: [390, 844], tablet: [1280, 800], desktop: [1600, 1000] };
const times = { day: "2026-11-14T03:00:00Z", night: "2026-11-14T11:30:00Z" };
(async () => {
  const browser = await chromium.launch();
  for (const [s, [w, h]] of Object.entries(sizes)) for (const [t, at] of Object.entries(times)) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/?at=${at}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/${s}-${t}.png`, fullPage: false });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    console.log(s, t, errors.length ? `ERRORS ${errors}` : "ok", overflow ? "HORIZONTAL OVERFLOW" : "");
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${base}/?at=${times.day}#track`, { waitUntil: "networkidle" });
  await page.click("text=Track record");
  await page.screenshot({ path: `${out}/tablet-track.png`, fullPage: true });
  await browser.close();
})();
// Vue marée
(async () => {
  const browser = await chromium.launch();
  for (const [s, [w, h]] of [["tablet", [1280, 800]], ["phone", [390, 844]]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`${base}/?at=2026-11-14T03:00:00Z#tide`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${s}-tide.png` });
    await page.close();
  }
  await browser.close();
})();
