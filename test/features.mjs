// Neue Regie-Funktionen in der Oberfläche: Vorspann + Einstieg kombiniert, „Im Film“-Mehrfachauswahl, Digicam, Filmstreifen, Titelbild.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const URL_ = process.env.APP || 'http://127.0.0.1:8123/index.html';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [], fails = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(URL_);
await page.waitForSelector('.place', { timeout: 30000 });
await page.click('.place');
const idle = () => page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
const settle = async () => { await page.waitForTimeout(700); await idle(); };
await idle();
await page.click('[data-tab="style"]');
await page.click('#preChips [data-v="countdown"]'); await settle();
await page.click('#introChips [data-v="grid"]'); await settle();
let info = await page.evaluate(() => { const p = CineBeat.S.plan; return { pre: p.clips.filter((c) => c.pre).length, grid: p.clips.findIndex((c) => c.grid), leader: p.overlays.filter((o) => o.type === 'leader').length }; });
console.log('Countdown + Raster:', info);
if (info.pre !== 3 || info.grid !== 3 || info.leader !== 1) fails.push('Vorspann+Raster');
// Countdown-Vorspann ist beim Countdown-Einstieg gesperrt
await page.click('#introChips [data-v="countdown"]'); await settle();
if (!(await page.evaluate(() => document.querySelector('#preChips [data-v="countdown"]').disabled))) fails.push('Countdown doppelt nicht gesperrt');
await page.click('#preChips [data-v="rewind"]'); await settle();
info = await page.evaluate(() => { const p = CineBeat.S.plan; return { roles: p.clips.slice(0, 9).map((c) => c.role), rew: p.overlays.some((o) => o.type === 'rewind') }; });
console.log('Rewind + Countdown:', info);
if (!info.rew || info.roles[0] !== 'tease' || !info.roles.includes('leader')) fails.push('Rewind+Countdown');
await page.click('#preChips [data-v="off"]');
await page.click('#introChips [data-v="auto"]'); await settle();
// Im Film: mehrere gleichzeitig
for (const k of ['morph', 'burst', 'ramp']) { await page.click(`#fxChips [data-fx="${k}"]`); await settle(); }
info = await page.evaluate(() => { const s = CineBeat.S.ctx.rec.settings; const p = CineBeat.S.plan; return { morph: s.morph, burst: s.burst, ramp: s.ramp, pressed: [...document.querySelectorAll('#fxChips [aria-pressed="true"]')].map((b) => b.dataset.fx), bursts: p.clips.filter((c) => c.burst).length, morphs: p.clips.filter((c) => c.tin && c.tin.type >= 10).length, hint: document.getElementById('fxHint').textContent }; });
console.log('Im Film:', info);
if (info.morph !== 'on' || info.burst !== 'drop' || info.ramp !== 'drop' || info.pressed.length < 4) fails.push('Mehrfachauswahl');
await page.click('#fxChips [data-fx="morph"]'); await settle();
if (await page.evaluate(() => CineBeat.S.ctx.rec.settings.morph) !== 'off') fails.push('abwählen');
// Digicam mit Datumsstempel, Filmstreifen-Ende
await page.click('#lookGrid [data-v="digicam"]'); await settle();
await page.click('#outroChips [data-v="strip"]'); await settle();
info = await page.evaluate(() => { const p = CineBeat.S.plan; return { stamps: p.overlays.filter((o) => o.type === 'datestamp').map((o) => o.text), strip: !!p.clips[p.clips.length - 1].strip, stampPressed: document.querySelector('#fxChips [data-fx="stamp"]').getAttribute('aria-pressed') }; });
console.log('Digicam/Strip:', info);
if (!info.stamps.length || !info.strip || info.stampPressed !== 'true') fails.push('Digicam/Strip');
await page.evaluate(() => { CineBeat.engine.renderStill(CineBeat.S.plan.duration - 1.2); });
await page.waitForTimeout(1500);
await page.locator('#monitor').screenshot({ path: `${OUT}/feat_strip.png` });
// Titelbild
await page.click('#exportBtn');
await page.waitForSelector('#coverExport');
await page.click('#coverExport');
await page.waitForSelector('#coverResult img', { timeout: 60000 });
info = await page.evaluate(async () => { const img = document.querySelector('#coverResult img'); await img.decode(); return { w: img.naturalWidth, h: img.naturalHeight, canvas: [CineBeat.engine.canvas.width, CineBeat.engine.canvas.height] }; });
console.log('Titelbild:', info);
if (info.w !== 1080 || info.h !== 1920) fails.push('Titelbildgröße');
await page.locator('#coverResult img').screenshot({ path: `${OUT}/feat_cover.png` });
if (info.canvas[0] >= 1080) fails.push('Vorschau nicht zurückgesetzt');
console.log('Fehler:', [...fails, ...errs].length ? [...fails, ...errs].join(' | ') : 'keine');
await browser.close();
process.exit(fails.length + errs.length ? 1 : 0);
