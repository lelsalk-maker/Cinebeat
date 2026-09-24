// Bild/Ton-Synchronität im fertigen Export: Schnitte (Bild) und Beats (Ton) werden aus der MP4 zurückgemessen.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeSong } from './wav.mjs';
import { readFileSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const truth = makeSong(`${OUT}/sync.wav`, { bpm: 120, dur: 30, offset: 0.4 });
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const res = await p.evaluate(async ({ b64, truth }) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer);
  const an = await analyzeAudio(buf);
  // einfarbige Bilder mit klar verschiedenen Farbtönen
  const hues = [0, 60, 120, 180, 240, 300, 30, 210];
  const media = hues.map((h, i) => { const c = document.createElement('canvas'); c.width = 400; c.height = 700; const x = c.getContext('2d'); x.fillStyle = `hsl(${h},85%,50%)`; x.fillRect(0, 0, 400, 700); x.fillStyle = `hsl(${h},85%,40%)`; for (let k = 0; k < 40; k++) x.fillRect((k * 37) % 400, (k * 53) % 700, 30, 30); return { id: 'c' + i, kind: 'image', name: 'C' + i, canvas: c, w: 400, h: 700, time: i, ...scoreImage(c, 400, 700), score: 0.8 }; });
  const s = { format: '9:16', look: 'natur', pace: 'mittel', intro: 'hook', outro: 'freeze', length: 20, songStart: 'auto', frame: 'full', split: 'off', match: 'off', seed: 1, showTitle: false };
  const clipsOv = {};
  const plan0 = buildPlan({ an, media, settings: s, overrides: { texts: [], stickers: [] } });
  plan0.clips.forEach((c) => { clipsOv[c.i] = { trans: 0 }; });
  const plan = buildPlan({ an, media, settings: s, overrides: { texts: [], stickers: [], clips: clipsOv } });
  const W = 180, H = 320, fps = 30;
  const eng = new Engine(document.getElementById('c'));
  eng.setProject({ plan, media, audioBuffer: buf, size: { w: W, h: H } });
  const support = await Engine.exportSupport({ w: W, h: H }, fps, true);
  const out = await eng.exportOffline({ size: { w: W, h: H }, fps, withAudio: true, withSong: true, support });
  // Bild: Farbton jedes Bilds, Schnitt = Wechsel
  const track = await demuxVideo(new File([out.blob], 'o.mp4'));
  const fr = await FrameReader.open(track, 64);
  const hueAt = (cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let r = 0, g = 0, bb = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bb += d[i + 2]; } return Math.atan2(Math.sqrt(3) * (g - bb), 2 * r - g - bb); };
  const frameTimes = track.samples.map((x) => x.cts / 1e6).sort((x, y) => x - y);
  let prevH = null; const vCuts = [];
  for (const t of frameTimes) {
    const cv = await fr.canvasAt(t + 0.001);
    const h = hueAt(cv);
    if (prevH != null) { let d = Math.abs(h - prevH); d = Math.min(d, 2 * Math.PI - d); if (d > 0.35) vCuts.push(t); }
    prevH = h;
  }
  fr.close();
  const planCuts = plan.clips.slice(1).filter((c) => !c.loop).map((c) => c.start);
  const near = (list, t) => { let m = 9; for (const x of list) if (Math.abs(x - t) < Math.abs(m)) m = x - t; return m; };
  const vErr = planCuts.map((t) => near(vCuts, t));
  // Ton: Kick-Einsätze im Export gegen die Beats des Songs (verschoben um den Songausschnitt)
  const ab = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await out.blob.arrayBuffer());
  const d = ab.getChannelData(0), sr = ab.sampleRate;
  const env = []; const hop = 64;
  for (let i = 0; i + hop < d.length; i += hop) { let e = 0; for (let k = 0; k < hop; k++) e += d[i + k] * d[i + k]; env.push(e); }
  const ons = [];
  for (let i = 4; i < env.length; i++) { const prevE = (env[i - 1] + env[i - 2] + env[i - 3] + env[i - 4]) / 4; if (env[i] > prevE * 8 && env[i] > 1e-3 && (!ons.length || i * hop / sr - ons[ons.length - 1] > 0.2)) ons.push(i * hop / sr); }
  const expBeats = truth.map((t) => t - plan.win.start).filter((t) => t > 0.3 && t < plan.duration - 0.5);
  const aErr = expBeats.map((t) => near(ons, t)).filter((e) => Math.abs(e) < 0.2);
  const stat = (e) => ({ n: e.length, mean: +(e.reduce((x, y) => x + y, 0) / Math.max(1, e.length) * 1000).toFixed(1), max: +(Math.max(0, ...e.map(Math.abs)) * 1000).toFixed(1) });
  return { codec: out.codec, audio: out.audio, cuts: planCuts.length, vCuts: vCuts.length, video: stat(vErr), audioSync: stat(aErr), frameStep: 1000 / fps };
}, { b64: readFileSync(`${OUT}/sync.wav`).toString('base64'), truth });
console.log(JSON.stringify(res));
const ok = res.video.max <= res.frameStep / 2 + 1 && Math.abs(res.audioSync.mean) < 8 && res.audioSync.max < 25;
console.log(ok ? 'Sync: OK' : 'Sync: FEHLER');
await b.close();
process.exit(ok ? 0 : 1);
