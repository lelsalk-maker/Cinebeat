// Einlesen im Hintergrund-Thread: gleiche Bewertung wie im Hauptthread, schneller, Protokoll-Eintrag
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.APP || 'http://127.0.0.1:8123/index.html');
await page.waitForSelector('.place');
const r = await page.evaluate(async () => {
  const mk = async (lm) => {
    const files = [];
    for (let i = 0; i < 8; i++) {
      const c = new OffscreenCanvas(i % 2 ? 3000 : 4000, i % 2 ? 4000 : 3000), x = c.getContext('2d');
      x.fillStyle = `hsl(${i * 45},60%,${30 + i * 5}%)`; x.fillRect(0, 0, c.width, c.height);
      for (let k = 0; k < 200; k++) { x.fillStyle = `hsla(${(k * 37) % 360},60%,50%,.6)`; x.fillRect((k * 131) % c.width, (k * 97) % c.height, 140, 90); }
      files.push(new File([await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })], `W_${i}.jpg`, { type: 'image/jpeg', lastModified: lm + i }));
    }
    return files;
  };
  const W = CineBeat.scoreWorkers;
  let t = performance.now();
  const a = await CineBeat.ingestFiles(await mk(1e12));
  const tw = performance.now() - t, used = W.used;
  W.off = true; W.pool = null;
  t = performance.now();
  const m = await CineBeat.ingestFiles(await mk(2e12));
  const tm = performance.now() - t;
  const keys = ['score', 'sharp', 'expo', 'color', 'luma', 'horizon', 'sky', 'people', 'iso', 'skinFrac', 'w', 'h'];
  const diff = [];
  a.items.forEach((x, i) => {
    const y = m.items[i];
    for (const k of keys) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) diff.push(`${i}.${k}: ${JSON.stringify(x[k])} vs ${JSON.stringify(y[k])}`);
    if (JSON.stringify(x.hash) !== JSON.stringify(y.hash)) diff.push(i + '.hash');
    if (!x.thumb || !x.thumb.startsWith('data:image/jpeg')) diff.push(i + '.thumb');
  });
  const log = CineBeat.perfLog.list().filter((e) => e.kind === 'import');
  return { used, tw: Math.round(tw), tm: Math.round(tm), diff: diff.slice(0, 6), bad: a.bad + m.bad, log: log.length, logWorker: log[log.length - 2] && log[log.length - 2].worker };
});
const fails = [];
if (!r.used) fails.push('Worker nicht benutzt');
if (r.diff.length) fails.push('Abweichung: ' + r.diff.join(' | '));
if (r.bad) fails.push('nicht lesbar: ' + r.bad);
if (r.log < 2 || !r.logWorker) fails.push('Protokoll fehlt');
if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
console.log(JSON.stringify(r));
console.log(fails.length ? 'FAIL ' + fails.join('; ') : 'OK workerscore');
await b.close();
process.exit(fails.length ? 1 : 0);
