// Videos laufen wirklich: in jeder Darstellung (eigene Einstellung, Split-Screen, Wand des Kino-Rollladens,
// Karussell-Clip) zeigt jedes Video im Export fortlaufende Quellbilder im richtigen Tempo – kein Standbild, kein
// Hängen – und in der Vorschau läuft es beim Abspielen in Echtzeit mit.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/vplay.wav`, { bpm: 124 });
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async (b64) => {
  const fails = [], out = {};
  // Quellvideos (VP9 in MP4, 25 fps), jedes Bild anders gefärbt, mit wanderndem Block
  const makeVid = async (VW, VH, secs, hue0) => {
    const fps = 25, NF = fps * secs;
    const mux = new Mp4Muxer({ video: { codec: 'vp9', width: VW, height: VH, fps }, audio: null });
    let err = null;
    const enc = new VideoEncoder({ output: (c, m) => mux.addVideoChunk(c, m), error: (e) => { err = e; } });
    enc.configure({ codec: 'vp09.00.40.08', width: VW, height: VH, bitrate: 2e6, framerate: fps });
    const vc = new OffscreenCanvas(VW, VH), vx = vc.getContext('2d');
    for (let n = 0; n < NF; n++) {
      vx.fillStyle = `hsl(${hue0 + n * 5},60%,45%)`; vx.fillRect(0, 0, VW, VH);
      vx.fillStyle = '#fff'; vx.fillRect((n * 11) % VW, VH * 0.4, VW * 0.12, VW * 0.12);
      const f = new VideoFrame(vc, { timestamp: Math.round((n * 1e6) / fps), duration: Math.round(1e6 / fps) });
      enc.encode(f, { keyFrame: n % 25 === 0 }); f.close();
    }
    await enc.flush(); enc.close();
    if (err) throw err;
    const file = mux.finalize();
    const url = URL.createObjectURL(file);
    const v = makeVideoEl(); v.src = url; await waitEvent(v, ['loadedmetadata'], ['error'], 5000);
    const sv = await scoreVideo(v, v.duration);
    return { url, file, duration: v.duration, sv };
  };
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u8.buffer);
  const an = await analyzeAudio(buf);
  const T0 = new Date(2026, 4, 3, 9, 0).getTime();
  const vids = [];
  for (let k = 0; k < 3; k++) {
    const portrait = k !== 1;
    const v = await makeVid(portrait ? 240 : 426, portrait ? 426 : 240, 6 + k * 2, k * 90);
    vids.push({ id: 'v' + k, kind: 'video', name: 'V' + k, url: v.url, file: v.file, w: portrait ? 240 : 426, h: portrait ? 426 : 240, duration: v.duration, time: T0 + k * 40 * 60000 + 60000, poster: null, ...v.sv, score: 0.95 - k * 0.01 });
  }
  const base = demoScenes();
  const imgs = Array.from({ length: 12 }, (_, i) => { const c = base[i % base.length]; return { id: 'p' + i, kind: 'image', name: 'P' + i, canvas: c, w: c.width, h: c.height, time: T0 + i * 12 * 60000, ...scoreImage(c, c.width, c.height), hash: [i * 7919, i * 31] }; });
  const media = [...imgs, ...vids];
  const W = 144, H = 256, FPS = 15;

  // Export Bild für Bild: je Video und Darstellung die gezeigte Quellzeit protokollieren
  const exportCheck = async (name, plan, size) => {
    const eng = new Engine(document.getElementById('c'));
    eng.setProject({ plan, media, audioBuffer: buf, size });
    const log = new Map();
    const orig = eng.drawAt.bind(eng);
    eng.drawAt = (t, mode) => {
      orig(t, mode);
      for (const s of eng.slots.values()) {
        const c = s.clip;
        if (!(t >= c.visStart + 0.02 && t < c.visEnd - 0.02) || !s.ready) continue;
        const add = (key, src, want, frozen) => { if (!log.has(key)) log.set(key, []); log.get(key).push({ t, src, want, frozen }); };
        if (s.panels) s.panels.forEach((pn, k) => { if (pn && pn.video && t >= c.split.reveal[k]) add(`${name} ${c.split.orient || 'split'}#${c.i}.${k}`, pn.video.currentTime, panelTime(c, k, t), c.freezeAt != null && t >= c.freezeAt); });
        else if (media[c.mediaIndex] && media[c.mediaIndex].kind === 'video' && !c.grid) add(`${name} ${c.rush ? 'rush' : c.burst ? 'burst' : 'clip'}#${c.i}`, s.fr ? s.fr.drawnTs / 1e6 : s.video ? s.video.currentTime : NaN, srcTimeOf(c, t), c.freezeAt != null && t >= c.freezeAt);
      }
    };
    const support = await Engine.exportSupport(size, FPS, false);
    await eng.exportOffline({ size, fps: FPS, withAudio: false, support });
    const res = [];
    for (const [key, arr] of log) {
      const moving = arr.filter((x) => !x.frozen);
      if (moving.length < 3) continue;
      const span = moving[moving.length - 1].src - moving[0].src, want = moving[moving.length - 1].want - moving[0].want;
      const err = Math.max(...moving.map((x) => Math.abs(x.src - x.want)));
      const back = moving.some((x, i) => i && x.src < moving[i - 1].src - 0.01);
      res.push(`${key}: ${moving.length} Bilder, Quelle ${span.toFixed(2)}/${want.toFixed(2)} s, max. Abweichung ${(err * 1000).toFixed(0)} ms`);
      if (want > 0.3 && span < want * 0.9) fails.push(`${key}: Video steht (${span.toFixed(2)} statt ${want.toFixed(2)} s)`);
      if (err > 1.5 / FPS + 0.04) fails.push(`${key}: falsches Bild (${(err * 1000).toFixed(0)} ms daneben)`);
      if (back) fails.push(`${key}: springt zurück`);
    }
    return res;
  };

  const S = { format: '9:16', look: 'natur', pace: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 4, title: 'Lissabon' };
  // 1. Story mit Kino-Rollladen: Videos in der Wand und als eigene Einstellungen
  const pA = buildPlan({ an, media, settings: { ...S, intro: 'shutter' }, overrides: { texts: [], stickers: [] } });
  const wallV = pA.clips[0].split ? pA.clips[0].split.ids.filter((id) => id[0] === 'v').length : 0;
  out.story = { intro: pA.intro, wallVideos: wallV, vclips: pA.clips.filter((c) => c.vid).length };
  if (pA.intro !== 'shutter' || !wallV) fails.push('Story: keine Videos in der Wand');
  out.storyLog = await exportCheck('Story', pA, { w: W, h: H });
  // 2. Film 16:9 mit Split-Screens (Hochkant-Videos nebeneinander)
  const pB = buildPlan({ an, media, settings: { ...S, format: '16:9', intro: 'hook', split: 'more' }, overrides: { texts: [], stickers: [] } });
  out.film = { vsplit: pB.clips.filter((c) => c.split && c.split.ids.some((id) => id[0] === 'v')).length, vclips: pB.clips.filter((c) => c.vid).length };
  out.filmLog = await exportCheck('Film', pB, { w: 256, h: 144 });
  // 3. Karussell-Clip mit Video
  const car = planCarousel({ an, media });
  const cs = car.slides.find((x) => x.kind === 'clip' && x.videoId);
  if (!cs) fails.push('Karussell: kein Video-Clip');
  else {
    const cp = carouselClipPlan(cs, { an, media, settings: { ...S, format: '4:5' }, corr: car.corr });
    // lückenlos: zu jeder Zeit liegt eine Aufnahme im Bild, das Video läuft über den ganzen Clip
    for (let t = 0.02; t < cp.duration - 0.02; t += 0.1) if (!cp.clips.some((c) => c.visStart <= t && c.visEnd > t && media[c.mediaIndex])) { fails.push(`Karussell: Lücke bei ${t.toFixed(2)} s`); break; }
    const vc = cp.clips.find((c) => c.vid === cs.videoId);
    if (!vc || vc.visEnd - vc.visStart < cp.duration - 0.05) fails.push('Karussell: Video läuft nicht über den ganzen Clip');
    out.carLog = await exportCheck('Karussell', cp, { w: 144, h: 180 });
    // Foto-Sequenz ebenso lückenlos
    const imgs2 = media.filter((m) => m.kind === 'image').slice(0, 3).map((m) => m.id);
    const mp = carouselClipPlan({ kind: 'clip', ids: imgs2, videoId: null, start: cs.start, len: cs.len }, { an, media, settings: { ...S, format: '4:5' }, corr: car.corr });
    if (mp.clips.length !== 3 || mp.clips.some((c, k) => k && Math.abs(c.start - mp.clips[k - 1].end) > 1e-6) || Math.abs(mp.clips[2].end - mp.duration) > 1e-6) fails.push('Karussell: Foto-Sequenz nicht lückenlos');
  }
  // jedes Video kam irgendwo wirklich laufend vor
  const all = [...out.storyLog, ...out.filmLog, ...(out.carLog || [])].join('\n');
  if (!/wall#0/.test(all)) fails.push('Wand-Videos nicht protokolliert');

  // 4. Vorschau in Echtzeit: Videos laufen beim Abspielen mit
  const eng = new Engine(document.getElementById('c'));
  eng.setProject({ plan: pA, media, audioBuffer: buf, size: { w: W, h: H } });
  const vc = pA.clips.find((c) => c.vid);
  const samples = [];
  await eng.play(Math.max(0, vc.visStart - 0.2));
  const t0 = performance.now();
  while (performance.now() - t0 < 2500) {
    await new Promise((res) => setTimeout(res, 100));
    const t = eng.clock ? eng.clock() : eng.t;
    for (const s of eng.slots.values()) if (s.clip === vc && s.video && t > vc.visStart + 0.1 && t < vc.visEnd) samples.push([performance.now(), s.video.currentTime, s.video.paused]);
  }
  eng.pause();
  if (samples.length < 5) fails.push('Vorschau: Video-Einstellung nicht erreicht');
  else {
    const dt = (samples[samples.length - 1][0] - samples[0][0]) / 1000, dv = samples[samples.length - 1][1] - samples[0][1];
    out.preview = { dt: +dt.toFixed(2), dv: +dv.toFixed(2), paused: samples.filter((x) => x[2]).length };
    if (!(dv > dt * 0.6)) fails.push(`Vorschau: Video läuft nicht mit (${dv.toFixed(2)} s in ${dt.toFixed(2)} s)`);
  }
  // Wand in der Vorschau: Videos in den Feldern laufen beim Abspielen mit
  const wall = pA.clips[0];
  const wk = wall.split.ids.findIndex((id) => id[0] === 'v');
  const ws = [];
  await eng.play(wall.split.reveal[wk] + 0.05);
  const w0 = performance.now();
  while (performance.now() - w0 < 1500) {
    await new Promise((res) => setTimeout(res, 100));
    for (const s of eng.slots.values()) if (s.clip === wall && s.panels && s.panels[wk] && s.panels[wk].video) ws.push([performance.now(), s.panels[wk].video.currentTime]);
  }
  eng.pause();
  if (ws.length < 5) fails.push('Vorschau: Wand nicht erreicht');
  else {
    const dt = (ws[ws.length - 1][0] - ws[0][0]) / 1000, dv = ws[ws.length - 1][1] - ws[0][1];
    out.previewWall = { dt: +dt.toFixed(2), dv: +dv.toFixed(2) };
    if (!(dv > dt * 0.6)) fails.push(`Vorschau: Video in der Wand läuft nicht mit (${dv.toFixed(2)} s in ${dt.toFixed(2)} s)`);
  }
  return { fails, out };
}, readFileSync(`${OUT}/vplay.wav`).toString('base64'));
console.log(r.fails.length ? 'FAIL ' + [...new Set(r.fails)].slice(0, 12).join('; ') : 'OK vplay');
if (r.fails.length || process.argv.includes('-v')) console.log(JSON.stringify(r.out, null, 1));
await b.close();
process.exit(r.fails.length ? 1 : 0);
