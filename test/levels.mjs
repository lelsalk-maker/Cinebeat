// Zwei Bedienebenen (Regie/Werkbank) und Varianten-Vergleich im Vollbild
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.APP || 'http://127.0.0.1:8123/index.html');
await page.waitForSelector('.place');
await page.click('.place');
await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 120000 });
const fails = [];
const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; }, sel);
if (await vis('#tabbtn-cut')) fails.push('Regie zeigt Schnitt-Reiter');
await page.click('#levelChips [data-level="bench"]');
await page.waitForTimeout(300);
if (!(await vis('#benchDock .clip'))) fails.push('Werkbank ohne Zeitleiste');
if (!(await vis('#tabbtn-cut'))) fails.push('Werkbank ohne Schnitt-Reiter');
// laufende Einstellung wird markiert
await page.evaluate(async () => { const E = CineBeat.engine, c = CineBeat.S.plan.clips[2]; await E.renderStill((c.start + c.end) / 2); });
await page.waitForTimeout(200);
const now = await page.evaluate(() => { const el = document.querySelector('#clipRow .clip.now'); return el ? +el.dataset.clip : -1; });
if (now !== 2) fails.push('Markierung ' + now);
// Ebene bleibt gespeichert
const lv = await page.evaluate(() => localStorage.getItem('cinebeat-level'));
if (lv !== 'bench') fails.push('Ebene nicht gespeichert');
// Vergleich: Wechsel, Abbrechen stellt zurück, Übernehmen behält
await page.click('#compareBtn');
await page.waitForTimeout(800);
if (!(await vis('#cmpStage #monitor'))) fails.push('Monitor nicht im Vergleich');
const cards = await page.evaluate(() => Array.from(document.querySelectorAll('#cmpCards small')).map((e) => e.textContent));
if (cards.length !== 3) fails.push('Karten ' + cards.length);
await page.click('#cmpCards [data-var="ruhig"]');
await page.waitForTimeout(500);
await page.click('#cmpClose');
await page.waitForTimeout(500);
let v = await page.evaluate(() => [CineBeat.S.ctx.rec.settings.variant, !!document.querySelector('.stage #monitor')]);
if (v[0] !== 'ausgewogen' || !v[1]) fails.push('Abbrechen ' + v);
await page.click('#compareBtn');
await page.waitForTimeout(800);
// Wischen nach links ⇒ energischer
const box = await page.locator('#cmpStage').boundingBox();
await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2); await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(500);
v = await page.evaluate(() => CineBeat.S.ctx.rec.settings.variant);
if (v !== 'energisch') fails.push('Wischen ' + v);
await page.click('#cmpTake');
await page.waitForTimeout(500);
v = await page.evaluate(() => CineBeat.S.ctx.rec.settings.variant);
if (v !== 'energisch') fails.push('Übernehmen ' + v);
await page.click('#levelChips [data-level="regie"]');
await page.waitForTimeout(200);
if (await vis('#benchDock .clip')) fails.push('Regie zeigt Werkbank-Zeitleiste');
if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
console.log(fails.length ? 'FAIL ' + fails.join('; ') : 'OK levels');
await b.close();
process.exit(fails.length ? 1 : 0);
