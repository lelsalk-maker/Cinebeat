import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('file:///home/user/cinebeat/docs/CineBeat.html');
await page.waitForSelector('.place');
await page.click('.place');
await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
await page.click('#exportBtn');
await page.click('#startExport');
const t0 = Date.now();
await page.waitForFunction(() => !document.getElementById('expResult')?.hidden || (!CineBeat.S.exporting && document.getElementById('toast').classList.contains('err')), null, { timeout: 1500000, polling: 3000 });
const info = await page.evaluate(async () => {
  const v = document.querySelector('#expResult video'); if (!v) return { err: document.getElementById('toast').textContent };
  await new Promise((r) => { if (v.readyState >= 1) r(); else v.onloadedmetadata = r; });
  const c = document.createElement('canvas'); c.width = 270; c.height = 480; const x = c.getContext('2d');
  const shots = [];
  for (const t of [0.3, 2, 4, 6, 8, 10, 11.8]) { if (t > v.duration) continue; v.currentTime = t; await new Promise((r) => (v.onseeked = r)); x.drawImage(v, 0, 0, 270, 480); shots.push(c.toDataURL('image/jpeg', 0.85)); }
  return { meta: document.querySelector('#expResult .hint').textContent, dur: v.duration, w: v.videoWidth, h: v.videoHeight, shots };
});
console.log('Dauer', ((Date.now() - t0) / 1000).toFixed(0), 's', { ...info, shots: info.shots && info.shots.length });
if (info.shots) {
  const p2 = await b.newPage({ viewport: { width: 1400, height: 520 } });
  await p2.setContent(`<body style="margin:0;background:#111;display:flex;gap:6px;padding:6px">${info.shots.map((s) => `<img src="${s}" style="height:480px">`).join('')}</body>`);
  await p2.screenshot({ path: `${OUT}/full_export.png` });
}
await page.screenshot({ path: `${OUT}/full_export_ui.png` });
console.log('Fehler:', errs.join('\n') || 'keine');
await b.close();
