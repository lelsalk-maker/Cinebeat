// Ressourcen auf dem Handy: Bildrate der Vorschau, Vorschau-Auflösung, Speicherbudget, verkleinertes Dekodieren,
// Audio schläft, kein Stau beim Scrubben. Mit großen Kamerafotos (12 MP) wie vom iPhone.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL_ = process.env.APP || 'http://127.0.0.1:8123/index.html';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL_);
await page.waitForSelector('.place');
const idle = () => page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 120000 });
await page.click('.place'); await idle();
const r = await page.evaluate(async () => {
  const E = CineBeat.engine, S = CineBeat.S;
  // 8 Kamerafotos mit 4000 × 3000
  const files = [];
  for (let i = 0; i < 8; i++) {
    const c = new OffscreenCanvas(4000, 3000), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 4000, 3000); g.addColorStop(0, `hsl(${i * 45},70%,40%)`); g.addColorStop(1, `hsl(${i * 45 + 60},70%,65%)`);
    x.fillStyle = g; x.fillRect(0, 0, 4000, 3000);
    for (let k = 0; k < 300; k++) { x.fillStyle = `hsla(${(k * 37) % 360},60%,50%,.5)`; x.fillRect((k * 131) % 4000, (k * 97) % 3000, 120, 90); }
    files.push(new File([await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })], `IMG_${i}.jpg`, { type: 'image/jpeg', lastModified: Date.now() - (8 - i) * 60000 }));
  }
  const t0 = performance.now();
  await CineBeat.addFiles(files);
  const importMs = performance.now() - t0;
  await new Promise((res) => { const w = () => (document.getElementById('busy').hidden ? res() : setTimeout(w, 100)); w(); });
  await CineBeat.rebuild();
  // Abspielen: gezeichnete Bilder pro Sekunde
  let draws = 0; const orig = E.drawAt.bind(E); E.drawAt = (t, m) => { if (m === 'play') draws++; return orig(t, m); };
  await E.play(0);
  await new Promise((res) => setTimeout(res, 4000));
  const fps = draws / 4;
  const playW = E.canvas.width;
  let px = 0, bitmaps = 0, canv = 0;
  for (const v of E.imgCache.values()) if (v && v.width) { px += v.width * v.height; if (typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap) bitmaps++; else canv++; }
  E.pause();
  const stillW = E.canvas.width;
  await new Promise((res) => setTimeout(res, 2600));
  const acState = E.ac && E.ac.state;
  // Scrubben: wie viele Standbilder laufen gleichzeitig?
  let inFlight = 0, maxFlight = 0, calls = 0; const rs = E.renderStill.bind(E);
  E.renderStill = async (t) => { calls++; inFlight++; maxFlight = Math.max(maxFlight, inFlight); try { return await rs(t); } finally { inFlight--; } };
  const strip = document.getElementById('strip'), rc = strip.getBoundingClientRect();
  strip.dispatchEvent(new PointerEvent('pointerdown', { clientX: rc.left + 2, clientY: rc.top + 5, pointerId: 1, bubbles: true }));
  for (let i = 0; i < 60; i++) { strip.dispatchEvent(new PointerEvent('pointermove', { clientX: rc.left + (i / 60) * rc.width, clientY: rc.top + 5, pointerId: 1, bubbles: true })); await new Promise((res) => setTimeout(res, 16)); }
  strip.dispatchEvent(new PointerEvent('pointerup', { clientX: rc.right - 2, clientY: rc.top + 5, pointerId: 1, bubbles: true }));
  await new Promise((res) => setTimeout(res, 1500));
  // Grafikkarte weg und wieder da (wie unter Speicherdruck auf iOS): Bild muss zurückkommen
  const gl = E.r.gl, ext = gl.getExtension('WEBGL_lose_context');
  let restored = null;
  if (ext) {
    ext.loseContext();
    await new Promise((res) => setTimeout(res, 300));
    ext.restoreContext();
    await new Promise((res) => setTimeout(res, 1500));
    await E.renderStill(2);
    E.drawAt(2, 'still');
    const px = new Uint8Array(4); gl.readPixels(Math.floor(E.canvas.width / 2), Math.floor(E.canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    restored = !E.r.lost && px[0] + px[1] + px[2] > 30;
  }
  return { restored, importMs: Math.round(importMs), media: S.ctx.media.length, previewSize: [E.size.w, E.size.h], fps, playW, stillW, cachePx: px, bitmaps, canv, acState, scrubCalls: calls, maxFlight };
});
console.log(JSON.stringify(r));
const fails = [];
if (r.fps > 31.5) fails.push('mehr als 30 Bilder/s');
if (Math.min(...r.previewSize) > 720) fails.push('Vorschau zu groß');
if (r.cachePx > 12e6 * 1.5) fails.push('Bildspeicher über Budget');
if (!r.bitmaps) fails.push('verkleinertes Dekodieren greift nicht');
if (r.acState !== 'suspended') fails.push('Audio schläft nicht');
if (r.maxFlight > 1) fails.push('Stau beim Scrubben');
if (r.restored === false) fails.push('Bild nach Grafik-Neustart nicht zurück');
if (errs.length) fails.push(...errs);
console.log('Fehler:', fails.length ? fails.join(' | ') : 'keine');
await b.close();
process.exit(fails.length ? 1 : 0);
