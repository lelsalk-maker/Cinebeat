// Look „Diner“: amerikanische Farbdias der 50er–70er, modern entwickelt. Gemessen an einer Farbtafel gegen „Natürlich“:
// Rot tiefer und satter, Gelb zu Senf, Blau/Türkis kräftig, Grau warm (Gelb-Rot-Braun-Stich), Schwarz warm angehoben,
// Haut bleibt ruhig (nicht grell orange).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/diner.wav`, { bpm: 124 });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async (b64) => {
  const fails = [];
  if (!LOOKS.diner || LOOKS.diner.label !== 'Diner' || !LOOKS.diner.grade.retro) return { fails: ['Look fehlt'] };
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u8.buffer);
  const an = await analyzeAudio(buf);
  const ch = document.createElement('canvas'); ch.width = 600; ch.height = 800; const x = ch.getContext('2d');
  const cols = { red: '#d62b2b', orange: '#e8742a', yellow: '#e6c229', green: '#3f9a3a', teal: '#2fb3a8', blue: '#2f6fd1', pink: '#e05ca8', skinL: '#e0b49a', skinD: '#b07a5a' };
  Object.values(cols).forEach((c, i) => { x.fillStyle = c; x.fillRect((i % 3) * 200, Math.floor(i / 3) * 200, 200, 200); });
  x.fillStyle = '#808080'; x.fillRect(0, 600, 300, 200); x.fillStyle = '#0a0a0a'; x.fillRect(300, 600, 300, 200);
  const media = [{ id: 'a', kind: 'image', name: 'A', canvas: ch, w: 600, h: 800, time: 1, ...scoreImage(ch, 600, 800) }];
  const W = 300, H = 400;
  const shot = async (look) => {
    const plan = buildPlan({ an, media, settings: { format: '4:5', look, pace: 'auto', intro: 'hook', outro: 'freeze', length: 10, songStart: 'start', frame: 'auto', seed: 1 }, overrides: { texts: [], stickers: [] } });
    plan.overlays = []; plan.fx = []; plan.colorFx = null;
    for (const c of plan.clips) { c.motion = { from: { s: 1, x: 0, y: 0 }, to: { s: 1, x: 0, y: 0 } }; c.contain = false; }
    const eng = new Engine(document.getElementById('c'));
    eng.setProject({ plan, media, audioBuffer: buf, size: { w: W, h: H } });
    await eng.renderStill(3); eng.drawAt(3, 'still');
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(eng.canvas, 0, 0);
    const d = cx.getImageData(0, 0, W, H).data;
    // Mittelwert eines Felds (Innenbereich, Rand und Vignette gemieden)
    const patch = (i) => { const px = (i % 3) * W / 3, py = Math.floor(i / 3) * H / 4; let r = 0, g = 0, bb = 0, n = 0; for (let y = py + H / 16; y < py + H / 4 - H / 16; y += 2) for (let xx = px + W / 12; xx < px + W / 3 - W / 12; xx += 2) { const k = (Math.floor(y) * W + Math.floor(xx)) * 4; r += d[k]; g += d[k + 1]; bb += d[k + 2]; n++; } return [r / n, g / n, bb / n]; };
    const band = (x0, x1) => { let r = 0, g = 0, bb = 0, n = 0; for (let y = Math.floor(H * 0.8); y < H * 0.95; y += 2) for (let xx = Math.floor(x0 * W); xx < x1 * W; xx += 2) { const k = (y * W + xx) * 4; r += d[k]; g += d[k + 1]; bb += d[k + 2]; n++; } return [r / n, g / n, bb / n]; };
    const out = {};
    Object.keys(cols).forEach((k, i) => { out[k] = patch(i); });
    out.gray = band(0.1, 0.4); out.black = band(0.6, 0.9);
    return out;
  };
  const hsv = ([r, g, bb]) => { r /= 255; g /= 255; bb /= 255; const mx = Math.max(r, g, bb), mn = Math.min(r, g, bb), dd = mx - mn; let h = 0; if (dd) { if (mx === r) h = ((g - bb) / dd) % 6; else if (mx === g) h = (bb - r) / dd + 2; else h = (r - g) / dd + 4; } return [((h * 60) + 360) % 360, mx ? dd / mx : 0, mx]; };
  const N = await shot('natur'), Dn = await shot('diner');
  const f = (a) => a.map((v) => +v.toFixed(2));
  const out = {};
  for (const k of Object.keys(N)) out[k] = { natur: f(hsv(N[k])), diner: f(hsv(Dn[k])) };
  const hs = (k, look) => hsv((look === 'd' ? Dn : N)[k]);
  if (!(hs('red', 'd')[1] >= hs('red', 'n')[1] && hs('red', 'd')[2] <= hs('red', 'n')[2] + 0.02)) fails.push('Rot nicht tiefer/satter');
  if (!(hs('yellow', 'd')[0] < hs('yellow', 'n')[0] - 2 && hs('yellow', 'd')[0] > 35)) fails.push('Gelb nicht zu Senf');
  if (!(hs('blue', 'd')[1] > hs('blue', 'n')[1] + 0.03)) fails.push('Blau nicht kräftiger');
  if (!(hs('pink', 'd')[1] > hs('pink', 'n')[1])) fails.push('Pink nicht kräftiger');
  const g = Dn.gray, k0 = Dn.black;
  if (!(g[0] > g[2] + 12 && g[1] > g[2] + 4)) fails.push('Grau ohne warmen Stich');
  if (!(k0[0] > k0[2] + 3 && k0[0] > N.black[0])) fails.push('Schwarz nicht warm angehoben');
  if (!(hs('skinD', 'd')[1] < hs('skinD', 'n')[1] * 1.35 + 0.05)) fails.push('Haut zu grell');
  return { fails, out };
}, readFileSync(`${OUT}/diner.wav`).toString('base64'));
console.log(r.fails.length ? 'FAIL ' + r.fails.join('; ') : 'OK diner');
if (r.fails.length || process.argv.includes('-v')) console.log(JSON.stringify(r.out));
await b.close();
process.exit(r.fails.length ? 1 : 0);
