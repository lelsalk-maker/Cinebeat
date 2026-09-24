// Bildschärfe im Export: detailreiches 12-MP-Querfoto als JPEG → Story 1080×1920.
// Vergleicht die Schärfe (Laplace-Energie) des gerenderten Bilds mit einer idealen Verkleinerung des Originals.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 600, height: 900 } });
await page.goto('http://127.0.0.1:8124/test/pipeline.html');
const res = await page.evaluate(async () => {
  // Testfoto 4032×3024 mit feinen Linien und Schrift
  const W = 4032, H = 3024, src = document.createElement('canvas'); src.width = W; src.height = H;
  const x = src.getContext('2d');
  x.fillStyle = '#6d8aa8'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < W; i += 12) { x.fillStyle = i % 24 ? '#20303f' : '#f2ead8'; x.fillRect(i, 0, 3, H); }
  x.fillStyle = '#f2ead8'; x.font = 'bold 90px sans-serif';
  for (let y = 150; y < H; y += 180) x.fillText('Lissabon Alfama 38.7° N · feine Details 0123456789', 60 + (y % 360), y);
  const blob = await new Promise((r) => src.toBlob(r, 'image/jpeg', 0.95));
  const url = URL.createObjectURL(blob);
  const item = { id: 'q', kind: 'image', name: 'q', url, w: W, h: H, time: 1, score: 1, focus: [0.5, 0.5], luma: 0.45, avg: [110, 130, 150] };
  const size = { w: 1080, h: 1920 };
  const c = document.getElementById('c');
  const eng = new Engine(c);
  const t = 0.02;
  const plan = { duration: 4, win: { start: 0, end: 4 }, clips: [{ i: 0, start: 0, end: 4, visStart: 0, visEnd: 4, mediaIndex: 0, mediaId: 'q', motion: { from: { s: 1, x: 0, y: 0 }, to: { s: 1, x: 0, y: 0 } }, corr: [1, 1, 1], tin: { type: 0, dur: 0 }, tout: { type: 0, dur: 0 } }], fx: [], overlays: [], look: 'natur', band: [0, 1], beats: [], downs: [], beatEnergy: [], beatDur: 0.5, voice: [], font: 'klassisch', motion: 'ken' };
  eng.setProject({ plan, media: [item], audioBuffer: null, size });
  await eng.renderStill(t);
  const read = (cv) => { const y = document.createElement('canvas'); y.width = 1080; y.height = 1920; const g = y.getContext('2d'); g.drawImage(cv, 0, 0, 1080, 1920); return g.getImageData(0, 0, 1080, 1920).data; };
  const rendered = read(c);
  // Referenz: mittiger Cover-Ausschnitt des Originals, einmal ideal verkleinert
  const ref = document.createElement('canvas'); ref.width = 1080; ref.height = 1920;
  const rg = ref.getContext('2d'); rg.imageSmoothingQuality = 'high';
  const cw = H * 1080 / 1920;
  const img = new Image(); img.src = url; await img.decode();
  rg.drawImage(img, (W - cw) / 2, 0, cw, H, 0, 0, 1080, 1920);
  const refd = rg.getImageData(0, 0, 1080, 1920).data;
  const lap = (d) => { let e = 0, n = 0; for (let yy = 400; yy < 1500; yy += 2) for (let xx = 100; xx < 980; xx += 2) { const i = (yy * 1080 + xx) * 4; const v = (k) => d[k] + d[k + 1] + d[k + 2]; const l = 4 * v(i) - v(i - 4) - v(i + 4) - v(i - 4320) - v(i + 4320); e += l * l; n++; } return e / n; };
  return { rendered: lap(rendered), reference: lap(refd), png: c.toDataURL('image/png') };
});
console.log('Schärfe gerendert / ideal:', (res.rendered / res.reference * 100).toFixed(1) + ' %');
const buf = Buffer.from(res.png.split(',')[1], 'base64');
(await import('node:fs')).writeFileSync(`${OUT}/quality.png`, buf);
await b.close();
