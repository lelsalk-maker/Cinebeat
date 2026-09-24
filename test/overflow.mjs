import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForSelector('.place');
await page.click('.place');
await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/ui_poster.png` });
for (const tab of ['material', 'music', 'style', 'cut', 'text']) {
  await page.click(`[data-tab="${tab}"]`);
  await page.waitForTimeout(300);
  console.log(tab, 'Überbreite:', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
}
await page.click('#exportBtn');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/ui_export.png` });
console.log('export', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
await b.close();
