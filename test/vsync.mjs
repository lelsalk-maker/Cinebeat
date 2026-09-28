// Videoschnitt auf den Takt: Aktionsmomente werden erkannt und landen im Film auf Schlag/Snare/Bassdrum
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/vsync.wav`, { bpm: 120 });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const wav = readFileSync(`${OUT}/vsync.wav`).toString('base64');
const r = await p.evaluate(async (b64) => {
  const fails = [];
  // Video 12 s, 30 fps: ruhige Fläche, bei 2.3 / 5.1 / 7.7 / 10.2 s springt ein großer Block plötzlich los
  const fps = 30, VW = 320, VH = 568, NF = fps * 12, events = [2.3, 5.1, 7.7, 10.2];
  const mux = new Mp4Muxer({ video: { codec: 'vp9', width: VW, height: VH, fps }, audio: null });
  const enc = new VideoEncoder({ output: (c, m) => mux.addVideoChunk(c, m), error: () => {} });
  enc.configure({ codec: 'vp09.00.40.08', width: VW, height: VH, bitrate: 3e6, framerate: fps });
  const vc = new OffscreenCanvas(VW, VH), vx = vc.getContext('2d');
  for (let n = 0; n < NF; n++) {
    const t = n / fps;
    vx.fillStyle = '#2a4a6a'; vx.fillRect(0, 0, VW, VH);
    vx.fillStyle = '#d8c8a0'; vx.fillRect(40, 400, 240, 60);
    for (const e of events) {
      const u = t - e;
      if (u >= 0 && u < 0.6) { vx.fillStyle = '#fff'; vx.fillRect(20 + u * 400, 60 + u * 300, 180, 180); }
    }
    const f = new VideoFrame(vc, { timestamp: Math.round(n * 1e6 / fps), duration: Math.round(1e6 / fps) });
    enc.encode(f, { keyFrame: n % 30 === 0 }); f.close();
    if (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
  }
  await enc.flush();
  const file = new File([mux.finalize()], 'aktion.mp4', { type: 'video/mp4' });
  const pr = await probeVideoFast(file);
  Object.assign(pr, await analyzeVideoAction(file));
  if (!pr || !pr.hits) return { fails: ['keine Aktionsmomente'], pr: pr && Object.keys(pr) };
  const found = events.map((e) => pr.hits.some(([t]) => Math.abs(t - e) <= 0.034));
  if (found.filter(Boolean).length < 4) fails.push('erkannt ' + JSON.stringify(pr.hits));
  if (pr.hits.length > 6) fails.push('zu viele Momente ' + pr.hits.length);
  // Planung mit echtem Song: Video bekommt einen Platz; seine Momente sollen auf dem Raster liegen
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer);
  const an = await analyzeAudio(buf);
  const scenes = demoScenes().slice(0, 5);
  const media = scenes.map((c, i) => ({ id: 'd' + i, kind: 'image', name: 'B' + i, canvas: c, w: c.width, h: c.height, time: i * 60000, ...scoreImage(c, c.width, c.height) }));
  const vitem = { id: 'v', kind: 'video', name: 'V', url: '', file, w: pr.w, h: pr.h, duration: pr.duration, time: 2.5 * 60000, fav: true, ...pr };
  delete vitem.poster;
  media.splice(3, 0, vitem);
  const s = { format: '9:16', look: 'natur', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', ramp: 'off', seed: 5 };
  const grid = null;
  let synced = 0, onGrid = 0, total = 0, cutMid = 0;
  for (const seed of [5, 6, 7]) {
    const plan = buildPlan({ an, media, settings: { ...s, seed }, overrides: { texts: [], stickers: [] } });
    const G = hitGrid(an, plan.win);
    if (plan.notes.some((n) => /Video auf den Takt/.test(n))) synced++;
    for (const c of plan.clips) {
      if (media[c.mediaIndex] !== vitem || c.split || c.grid || c.rp) continue;
      for (const [h] of pr.hits) {
        const tl = c.visStart + (h - c.srcOffset) / (c.rate || 1);
        if (tl < c.start + 0.06 || tl > c.end + 0.02) continue;
        if (tl > c.end - 0.14) { cutMid++; continue; }
        total++;
        if (G.some((g) => Math.abs(g.t - tl) <= 1 / 30 + 1e-3)) onGrid++;
      }
    }
  }
  if (!synced) fails.push('kein Video synchronisiert');
  if (total && onGrid / total < 0.6) fails.push(`nur ${onGrid}/${total} Momente auf dem Raster`);
  return { fails, hits: pr.hits, synced, onGrid, total, cutMid };
}, wav);
console.log(r.fails.length ? 'FAIL ' + r.fails.join('; ') : 'OK vsync');
if (r.fails.length || process.argv.includes('-v')) console.log(JSON.stringify(r));
await b.close();
process.exit(r.fails.length ? 1 : 0);
