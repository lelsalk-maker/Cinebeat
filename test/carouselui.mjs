// Karussell in der App: Beitrag 4:5 → Export → „Als Karussell“: Fotos als JPEG 4:5 (im Test 216 × 270), Clips als MP4 in Slide-Folge,
// Clips 3–6 s mit Ton; danach zeigt die Vorschau wieder den Film.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const URL_ = process.env.APP || 'http://127.0.0.1:8123/index.html';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })).newPage();
const errs = [], fails = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(URL_);
await page.waitForSelector('.place', { timeout: 30000 });
await page.click('.place');
const idle = () => page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
await idle();
// ohne Beitrag-Format kein Karussell-Knopf
await page.click('#exportBtn');
await page.waitForSelector('#coverExport');
if (await page.$('#carouselExport')) fails.push('Karussell außerhalb von 4:5');
await page.evaluate(() => CineBeat.closeSheet ? CineBeat.closeSheet() : document.getElementById('sheetBackdrop').click());
await page.waitForTimeout(400);
await page.click('[data-tab="style"]');
await page.click('#fmtChips [data-v="4:5"]');
await page.waitForTimeout(700); await idle();
const D0 = await page.evaluate(() => { CineBeat.S.sizeOverride = { w: 216, h: 270 }; return CineBeat.S.plan.duration; });
await page.click('#exportBtn');
await page.waitForSelector('#carouselExport');
await page.click('#carouselExport');
await page.waitForSelector('.car-grid li', { timeout: 300000 });
await page.waitForTimeout(500);
const info = await page.evaluate(async () => {
  const lis = [...document.querySelectorAll('.car-grid li')];
  const out = [];
  for (const li of lis) {
    const img = li.querySelector('img'), v = li.querySelector('video');
    if (img) { await img.decode(); out.push({ k: 'img', w: img.naturalWidth, h: img.naturalHeight }); }
    else {
      if (v.readyState < 1) await new Promise((r) => { v.onloadedmetadata = r; setTimeout(r, 5000); });
      out.push({ k: 'vid', w: v.videoWidth, h: v.videoHeight, d: +v.duration.toFixed(2) });
    }
  }
  return { slides: out, hint: document.querySelector('#expResult .hint').textContent, D: CineBeat.S.plan.duration, fmt: CineBeat.S.ctx.rec.settings.format };
});
console.log(JSON.stringify(info));
const n = info.slides.length;
if (n < 6 || n > 10) fails.push(`${n} Slides`);
if (!info.slides[0] || info.slides[0].k !== 'img') fails.push('Slide 1 kein Foto');
for (const s of info.slides) {
  if (s.w !== 216 || s.h !== 270) fails.push(`Größe ${s.w}×${s.h}`);
  if (s.k === 'vid' && (s.d < 2.9 || s.d > 6.2)) fails.push(`Clip ${s.d} s`);
}
if (!info.slides.some((s) => s.k === 'vid')) fails.push('keine Clips');
for (let i = 1; i < n; i++) if (info.slides[i].k === 'vid' && info.slides[i - 1].k === 'vid') fails.push('Clips nebeneinander');
if (Math.abs(info.D - D0) > 0.01 || info.fmt !== '4:5') fails.push('Film danach verändert');
await page.screenshot({ path: `${OUT}/carousel_result.png` });
if (errs.length) fails.push(...errs.slice(0, 3));
console.log(fails.length ? 'FAIL ' + fails.join('; ') : 'OK carouselui');
await browser.close();
process.exit(fails.length ? 1 : 0);
