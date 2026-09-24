// Neustart mitten in der Arbeit (wie wenn iOS die App im Hintergrund verwirft): Ort, Tab und Position bleiben.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL_ = process.env.APP || 'http://127.0.0.1:8123/index.html';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL_);
await page.waitForSelector('.place', { timeout: 30000 });
await page.click('.place');
const idle = () => page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
await idle();
await page.click('[data-tab="music"]');
await page.evaluate(() => { CineBeat.engine.t = 4.2; });
// App geht in den Hintergrund (Speicher wird freigegeben), dann Neustart
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
const trimmed = await page.evaluate(() => CineBeat.engine.slots.size === 0 && CineBeat.engine.imgCache.size === 0);
await page.reload();
await idle();
const st = await page.evaluate(() => ({ edit: !document.getElementById('viewEdit').hidden, tab: CineBeat.S.tab, t: CineBeat.engine.t, kind: CineBeat.S.ctx && CineBeat.S.ctx.kind }));
console.log('Nach Neustart:', st, '| Speicher freigegeben:', trimmed);
// Zurück zur Übersicht: danach startet die App wieder auf der Übersicht
await page.click('#backBtn');
await page.waitForSelector('.place');
await page.reload();
await page.waitForSelector('.place', { timeout: 30000 });
await page.waitForTimeout(800);
const home = await page.evaluate(() => !document.getElementById('viewTrip').hidden && !CineBeat.S.ctx);
console.log('Nach Zurück + Neustart auf Übersicht:', home);
const ok = st.edit && st.tab === 'music' && Math.abs(st.t - 4.2) < 0.05 && trimmed && home && !errs.length;
console.log('Fehler:', ok ? 'keine' : JSON.stringify(errs));
await b.close();
process.exit(ok ? 0 : 1);
