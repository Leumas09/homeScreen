// Accessibilité (axe-core, WCAG 2.1 AA) de toutes les vues, de jour et de nuit, après connexion.
// Usage : NODE_PATH=<dossier avec @axe-core/playwright> node e2e/a11y.cjs
const { chromium } = require("playwright");
const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const { default: AxeBuilder } = require("@axe-core/playwright");
const views = ["weather", "beach", "sea", "sky", "overhead", "fire", "news", "track", "settings"];
(async () => {
  const browser = await launch();
  let total = 0;
  for (const [base, at] of [["http://localhost:8100", "2026-11-14T03:00:00Z"], ["http://localhost:8101", "2026-11-14T11:30:00Z"]]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${base}/login`);
    const login = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    total += login.violations.length;
    if (login.violations.length) console.log("login", login.violations.map((v) => v.id));
    await page.fill("#pw", "test-family-password");
    await page.click("button[type=submit]");
    await page.waitForURL(`${base}/`);
    for (const v of views) {
      // Le flux temps réel reste ouvert : on attend le chargement, puis l'arrivée des données.
      await page.goto(`${base}/?at=${at}#${v}`, { waitUntil: "load" });
      await page.waitForTimeout(900);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      total += r.violations.length;
      if (r.violations.length) console.log(at.slice(11, 16), v, r.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0].target} ${x.nodes[0].failureSummary.split("\n")[1] ?? ""}`.slice(0, 220)));
    }
    await ctx.close();
  }
  await browser.close();
  console.log(total ? `${total} violation(s)` : "0 violation on login + 9 views, day and night");
})();
