// Querfotos in der Story (9:16): „Gedreht“ zeigt das ganze Foto um 90° im Uhrzeigersinn gedreht (Himmel rechts),
// „Split-Screen“ legt Querfotos paarweise übereinander, je Foto lässt sich das Drehen ein- oder ausschalten.
// Dazu Schwarzweiß je Aufnahme: „Nie“ bleibt farbig (auch im Schwarzweiß-Look), „Immer“ ist schwarzweiß.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const OUT = (process.env.OUT || '/tmp/cinebeat-test') + '/quer';
mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/s.wav`, { bpm: 120 });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const fails = [];
p.on('pageerror', (e) => fails.push('pageerror ' + e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async (b64) => {
  const f = [], info = {};
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer);
  const an = await analyzeAudio(buf);
  const T0 = new Date(2026, 4, 3, 9, 0).getTime();
  // Querfotos: oben blauer Himmel, unten grüne Wiese (mit Struktur, damit die Bewertung sie als gut erkennt)
  const land = (k) => { const c = document.createElement('canvas'); c.width = 1200; c.height = 800; const x = c.getContext('2d'); x.fillStyle = `hsl(${205 + k * 3},75%,55%)`; x.fillRect(0, 0, 1200, 400); x.fillStyle = `hsl(${110 + k * 3},60%,35%)`; x.fillRect(0, 400, 1200, 400); for (let j = 0; j < 40; j++) { x.fillStyle = `rgba(255,255,255,${0.15 + (j % 3) * 0.05})`; x.fillRect((j * 97 + k * 31) % 1200, 400 + (j * 53) % 380, 24, 10); } return c; };
  const port = (k) => { const c = document.createElement('canvas'); c.width = 800; c.height = 1200; const x = c.getContext('2d'); x.fillStyle = `hsl(${20 + k * 40},70%,50%)`; x.fillRect(0, 0, 800, 1200); for (let j = 0; j < 30; j++) { x.fillStyle = `hsla(${j * 23},80%,60%,.8)`; x.beginPath(); x.arc((j * 131) % 800, (j * 77) % 1200, 30, 0, 7); x.fill(); } return c; };
  const media = [];
  for (let i = 0; i < 12; i++) { const c = i % 3 === 2 ? port(i) : land(i); media.push({ id: 'm' + i, kind: 'image', name: 'M' + i, canvas: c, w: c.width, h: c.height, time: T0 + i * 4 * 60000, ...scoreImage(c, c.width, c.height), hash: [i * 7919, i * 104729] }); }
  const S0 = { format: '9:16', look: 'natur', pace: 'auto', intro: 'hook', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'auto', seed: 3, target: 'story' };
  const view = (st) => media.map((m) => (rotates(m, st) ? rotView(m) : m));
  const plan = (st, list) => buildPlan({ an, media: list, settings: st, overrides: { texts: [], stickers: [] } });
  // 1. Gedreht: jedes Querfoto als gedrehte Ansicht (Hochkant), nie im Split-Screen, alle im Film
  {
    const st = { ...S0, quer: 'drehen' }, list = view(st), P = plan(st, list);
    const rot = P.clips.filter((c) => list[c.mediaIndex] && list[c.mediaIndex].rot90);
    info.drehen = { rot: new Set(rot.map((c) => c.mediaId)).size, splits: P.clips.filter((c) => c.split).length, band: P.band && P.band[1] < 1 ? 1 : 0 };
    if (info.drehen.rot !== 8) f.push(`Gedreht: ${info.drehen.rot} von 8 Querfotos gedreht`);
    if (info.drehen.band) f.push('Gedreht: trotzdem Kinoband');
    // Bild: rechts Himmel (blau), links Wiese (grün)
    const W = 90, H = 160;
    const eng = new Engine(document.getElementById('c'));
    eng.setProject({ plan: P, media: list, audioBuffer: buf, size: { w: W, h: H } });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const c0 = rot.find((c) => c.end - c.start > 1 && !c.burst && c.i > 0) || rot[0];
    const t = (c0.start + c0.end) / 2;
    await eng.renderStill(t); eng.drawAt(t, 'still'); cx.drawImage(eng.canvas, 0, 0, W, H);
    const d = cx.getImageData(0, 0, W, H).data;
    const avg = (x0, x1) => { let r = 0, g = 0, bl = 0, n = 0; for (let y = 30; y < H - 30; y += 3) for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x += 3) { const i = (y * W + x) * 4; r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++; } return [r / n, g / n, bl / n].map(Math.round); };
    const right = avg(0.7, 0.95), left = avg(0.05, 0.3);
    info.drehen.right = right; info.drehen.left = left;
    if (!(right[2] > right[1] + 15 && left[1] > left[2] + 10)) f.push(`Gedreht: Himmel nicht rechts (rechts ${right}, links ${left})`);
    eng.releaseAll();
  }
  // 2. je Foto: „Nicht drehen“ hat Vorrang vor der Einstellung, „Gedreht“ gilt auch bei Auto
  {
    media[0].rot = false; media[1].rot = undefined;
    const st = { ...S0, quer: 'drehen' };
    const l1 = view(st);
    if (l1[0].rot90 || !l1[1].rot90) f.push('je Foto: Nicht drehen wirkt nicht');
    media[0].rot = true;
    const l2 = view({ ...S0, quer: 'auto' });
    if (!l2[0].rot90 || l2[1].rot90) f.push('je Foto: Gedreht bei Auto wirkt nicht');
    media[0].rot = undefined;
    // im 16:9-Film wird nie gedreht
    if (view({ ...S0, format: '16:9', quer: 'drehen' }).some((m) => m.rot90)) f.push('16:9: gedreht');
  }
  // 3. Split-Screen: kein Querfoto steht allein, wenn ein querformatiger Nachbar folgt; alle im Film
  {
    const st = { ...S0, quer: 'split' }, P = plan(st, media);
    const inSplit = new Set(P.clips.filter((c) => c.split).flatMap((c) => c.split.ids));
    const alone = P.clips.filter((c) => !c.split && !c.burst && c.role !== 'hook' && !c.loop && media[c.mediaIndex] && media[c.mediaIndex].w > media[c.mediaIndex].h && media[c.mediaIndex].kind === 'image');
    info.split = { inSplit: inSplit.size, alone: alone.map((c) => c.mediaId).join(',') };
    if (inSplit.size < 6) f.push(`Split-Screen: nur ${inSplit.size} Querfotos im Split`);
    const shown = new Set(P.clips.flatMap((c) => (c.split ? c.split.ids : [c.mediaId])));
    if (media.some((m) => !shown.has(m.id))) f.push('Split-Screen: Aufnahmen fehlen');
    for (const it of planAudit(P, media, an).slice(0, 3)) f.push(`Split-Screen @${it.t} ${it.msg}`);
  }
  // 4. Schwarzweiß je Aufnahme: „Nie“ bleibt im Noir-Look farbig, „Immer“ ist im natürlichen Look grau
  {
    const W = 90, H = 160;
    const chroma = async (st, list, id) => {
      const P = plan(st, list);
      const c = P.clips.find((x) => x.mediaId === id && !x.split && !x.burst && x.end - x.start > 1 && x.i > 0) || P.clips.find((x) => x.mediaId === id && !x.split);
      if (!c) return null;
      const eng = new Engine(document.getElementById('c'));
      eng.setProject({ plan: P, media: list, audioBuffer: buf, size: { w: W, h: H } });
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      const t = (c.start + c.end) / 2;
      await eng.renderStill(t); eng.drawAt(t, 'still'); cx.drawImage(eng.canvas, 0, 0, W, H);
      const d = cx.getImageData(0, 0, W, H).data;
      let C = 0, n = 0; for (let i = 0; i < d.length; i += 16) { C += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); n++; }
      eng.releaseAll();
      return C / n;
    };
    const id = 'm4';
    const m = media.find((x) => x.id === id);
    const stN = { ...S0, look: 'noir', quer: 'split', split: 'off' };
    const noirAuto = await chroma({ ...stN, quer: 'auto' }, media, id);
    m.bw = false;
    const noirKeep = await chroma({ ...stN, quer: 'auto' }, media, id);
    m.bw = true;
    const natForce = await chroma({ ...S0, quer: 'auto', split: 'off' }, media, id);
    m.bw = undefined;
    const natAuto = await chroma({ ...S0, quer: 'auto', split: 'off' }, media, id);
    info.bw = { noirAuto, noirKeep, natForce, natAuto };
    if (!(noirAuto < 8 && noirKeep > noirAuto + 20)) f.push(`Schwarzweiß „Nie“ bleibt nicht farbig (${JSON.stringify(info.bw)})`);
    if (!(natForce < 8 && natAuto > natForce + 20)) f.push(`Schwarzweiß „Immer“ nicht grau (${JSON.stringify(info.bw)})`);
  }
  return { f, info };
}, readFileSync(`${OUT}/s.wav`).toString('base64'));
fails.push(...r.f);
if (process.argv.includes('-v')) console.log(JSON.stringify(r.info));
await b.close();
console.log(fails.length ? `FAIL ${fails.length}\n` + fails.join('\n') : 'OK quer');
process.exit(fails.length ? 1 : 0);
