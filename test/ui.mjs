import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const URL_ = process.env.APP || 'http://127.0.0.1:8123/index.html';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [], requests = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
page.on('request', (r) => { const u = r.url(); if (!u.startsWith('blob:') && !u.startsWith('data:') && u !== URL_) requests.push(u); });
const shot = (n, full = false) => page.screenshot({ path: `${OUT}/v3ui_${n}.png`, fullPage: full });
await page.goto(URL_);
await page.waitForSelector('.place', { timeout: 30000 });
await page.waitForTimeout(400);
await shot('1_trip', true);
await page.click('.place');
await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
await page.waitForTimeout(1200);
console.log('Demo-Plan:', await page.evaluate(() => { const p = CineBeat.S.plan; return { D: p.duration.toFixed(1), resolved: p.resolved, notes: p.notes }; }));
await shot('2_editor', true);
for (const tab of ['material', 'music', 'cut', 'text']) { await page.click(`[data-tab="${tab}"]`); await page.waitForTimeout(500); await shot('3_' + tab, true); }
// Titel-Varianten
await page.click('[data-tab="text"]'); await page.waitForTimeout(300);
const tv = await page.evaluate(() => Array.from(document.querySelectorAll('#titleChips button')).map((b) => b.textContent));
console.log('Titel-Varianten:', tv);
if (tv.length !== 3) errs.push('Titel-Varianten fehlen');
else {
  await page.click('#titleChips [data-i="2"]'); await page.waitForTimeout(800);
  const nm = await page.evaluate(() => CineBeat.S.ctx.rec.name);
  if (!tv[2].startsWith(nm)) errs.push('Titel-Variante nicht übernommen: ' + nm);
}
// Zeitleiste: gedrückt halten und ziehen
await page.click('[data-tab="cut"]'); await page.waitForTimeout(400);
const tiles = await page.$$('#clipRow .clip');
const b1 = await tiles[3].boundingBox(), b2 = await tiles[1].boundingBox();
const id4 = await page.evaluate(() => CineBeat.S.plan.clips[3].mediaId);
await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2); await page.mouse.down(); await page.waitForTimeout(450);
await page.mouse.move(b2.x + 5, b2.y + b2.height / 2, { steps: 6 }); await page.waitForTimeout(100);
await shot('7_drag');
await page.mouse.up();
await page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 30000 }); await page.waitForTimeout(1200);
const moved = await page.evaluate((id) => ({ moves: CineBeat.S.ctx.rec.overrides.moves, at: CineBeat.S.plan.clips.findIndex((c) => c.mediaId === id), sheet: !document.getElementById('sheet').hidden }), id4);
console.log('Verschoben:', moved);
if (!moved.moves || moved.at > 2 || moved.sheet) errs.push('Ziehen in der Zeitleiste wirkt nicht');
await page.click('#resetCuts'); await page.waitForTimeout(800);
// Gefällt mir nicht
await page.click('#clipRow .clip:nth-child(4)'); await page.waitForTimeout(500);
await page.click('#sheetBody [data-act="again"]'); await page.waitForTimeout(1000);
console.log('Nochmal:', await page.evaluate(() => CineBeat.S.ctx.rec.overrides.clips[3]));
await page.click('#sheetBody [data-act="done"]'); await page.waitForTimeout(400);
// Varianten
await page.click('[data-tab="style"]');
await page.click('#variantChips [data-v="energisch"]'); await page.waitForTimeout(1500);
console.log('Variante:', await page.evaluate(() => ({ v: CineBeat.S.ctx.rec.settings.variant, pace: CineBeat.S.plan.resolved.pace, intro: CineBeat.S.plan.intro })));
await shot('8_variant', true);
await page.click('#variantChips [data-v="ausgewogen"]'); await page.waitForTimeout(800);
await page.click('#mvBtn'); await page.waitForTimeout(1500);
const mvs = await page.evaluate(() => ({ mv: CineBeat.S.ctx.rec.settings.mv, pressed: document.getElementById('mvBtn').getAttribute('aria-checked'), layers: CineBeat.S.plan.resolved.layers, color: CineBeat.S.plan.resolved.color }));
console.log('Musikvideo:', mvs);
if (mvs.mv !== 'on' || mvs.pressed !== 'true' || mvs.layers !== 'on') errs.push('Musikvideo-Schalter wirkt nicht');
await shot('9_mv');
await page.click('#mvBtn'); await page.waitForTimeout(800);
await page.click('[data-tab="style"]');
await page.click('#fmtChips [data-v="16:9"]');
await page.waitForTimeout(1500);
await shot('4_film');
await page.click('#fmtChips [data-v="9:16"]');
await page.click('#frameChips [data-v="band"]');
await page.waitForTimeout(1500);
await shot('5_band');
await page.click('#undoBtn'); await page.waitForTimeout(800);
console.log('Undo frame ->', await page.evaluate(() => CineBeat.S.ctx.rec.settings.frame));
// neuer leerer Ort
await page.click('#backBtn'); await page.waitForSelector('.place');
await page.click('#addPlace');
await page.waitForFunction(() => CineBeat.S.ctx && CineBeat.S.plan !== undefined && document.getElementById('busy').hidden, null, { timeout: 60000 });
await page.waitForTimeout(800);
console.log('Leerer Ort: emptyStage sichtbar =', await page.evaluate(() => !document.getElementById('emptyStage').hidden));
await shot('6_empty');
await page.click('#exportBtn').catch(() => {});
console.log('Überbreite:', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
console.log('Externe Anfragen:', requests.length ? requests : 'keine');
console.log('Fehler:', errs.length ? errs.join('\n') : 'keine');
await browser.close();
