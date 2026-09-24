// Adaptive Vorschau: bei Ruckeln sinkt die Auflösung, beim Anhalten ist sie wieder voll.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/struct.wav`, { bpm: 124 });
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const wav = readFileSync(`${OUT}/struct.wav`).toString('base64');
const res = await p.evaluate(async (b64) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer);
  const an = await analyzeAudio(buf);
  const media = demoScenes().map((c, i) => ({ id: 'd' + i, kind: 'image', name: 'B' + i, canvas: c, w: c.width, h: c.height, time: i, ...scoreImage(c, c.width, c.height) }));
  const plan = buildPlan({ an, media, settings: { format: '9:16', look: 'auto', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'auto', seed: 2 }, overrides: { texts: [], stickers: [] } });
  const eng = new Engine(document.getElementById('c'));
  // 4K-Vorschau erzwingt in der Software-GPU ein Ruckeln
  eng.setProject({ plan, media, audioBuffer: buf, size: { w: 2160, h: 3840 } });
  const full = eng.canvas.width;
  await eng.play(0);
  // Ruckeln simulieren: jedes zweite Bild dauert lang
  const orig = eng.drawAt.bind(eng); let n = 0;
  eng.drawAt = (t, m) => { orig(t, m); if (m === 'play' && n++ % 2) { const e = performance.now() + 30; while (performance.now() < e); } };
  await new Promise((r) => setTimeout(r, 6000));
  const during = { scale: eng.scale, w: eng.canvas.width, playing: eng.playing, n, dts: eng._dts.map(Math.round).join(','), t: eng.t, ex: eng.exporting, em: eng.exportMode };
  eng.drawAt = orig;
  eng.pause();
  await new Promise((r) => setTimeout(r, 1500));
  return { full, during, after: { scale: eng.scale, w: eng.canvas.width } };
}, wav);
console.log(JSON.stringify(res));
const fails = [];
if (!(res.during.scale < 1 && res.during.w < res.full)) fails.push('Auflösung nicht gesenkt');
if (res.after.scale !== 1 || res.after.w !== res.full) fails.push('Standbild nicht voll');
console.log('Fehler:', fails.length ? fails.join(', ') : 'keine');
await b.close();
process.exit(fails.length ? 1 : 0);
