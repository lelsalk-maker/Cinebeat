// Videos laufen wirklich: jedes Video bekommt einen Platz, der beste Moment liegt auf dem Schlag,
// ein Video, das (wie auf dem iPhone) erst nach dem Anspielen Daten lädt, wird trotzdem abgespielt.
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
  const fails = [], out = {};
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer);
  const an = await analyzeAudio(buf);
  const base = demoScenes();
  const T0 = Date.UTC(2026, 4, 1, 10);
  const imgs = []; for (let k = 0; k < 14; k++) { const c = base[k % base.length]; imgs.push({ id: 'i' + k, kind: 'image', name: 'B' + k, canvas: c, w: c.width, h: c.height, time: T0 + k * 120000, ...scoreImage(c, c.width, c.height), hash: [k * 7919, k * 104729], avg: [(k * 37) % 255, (k * 91) % 255, (k * 53) % 255] }); }
  const durs = [3.2, 6.5, 9, 14, 21, 5, 11, 7.5];
  const vids = durs.map((d, k) => ({ id: 'v' + k, kind: 'video', name: 'V' + k, url: '', w: k % 2 ? 1920 : 1080, h: k % 2 ? 1080 : 1920, duration: d, time: T0 + (k * 3 + 1) * 120000 + 30000, score: 0.7, highlights: [{ t: d * 0.55, score: 1 }], avg: [100 + k * 10, 90, 80], luma: 0.45, motion: k % 3 ? 0.03 : 0.09 }));
  const media = [...imgs, ...vids];
  const beatNear = (pl, t) => pl.beats.reduce((m, x) => Math.min(m, Math.abs(x - t)), Infinity);
  for (const [name, st] of [['story', { target: 'story' }], ['reel', { target: 'reel' }], ['film', { format: '16:9' }], ['story 30 s', { target: 'story', length: 30 }]]) {
    const pl = buildPlan({ an, media, settings: { format: '9:16', look: 'natur', pace: 'auto', intro: 'hook', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'off', seed: 3, ...st }, overrides: { texts: [], stickers: [] } });
    const vc = pl.clips.filter((c) => c.mediaIndex >= 0 && media[c.mediaIndex].kind === 'video' && !c.loop);
    const shortV = vc.filter((c) => c.end - c.start < 1.5 && !c.pre && !c.reveal);
    const frozen = vc.filter((c) => c.freezeAt != null && c.freezeAt - c.visStart < (c.visEnd - c.visStart) * 0.6);
    const shown = new Set(vc.map((c) => media[c.mediaIndex].id));
    const dropped = pl.capacity.droppedIds.filter((id) => id.startsWith('v'));
    let onBeat = 0, withHl = 0;
    for (const c of vc) {
      const m = media[c.mediaIndex];
      const h = m.highlights[0].t;
      const tFilm = c.visStart + (h - c.srcOffset) / (c.rate || 1);
      // nur wo der Ausschnitt Spielraum hat (läuft das Video ganz, liegt sein Anfang fest)
      const slack = (m.duration - (c.visEnd - c.visStart) * (c.rate || 1));
      if (slack > 0.4 && tFilm > c.start + 0.2 && tFilm < c.end - 0.3) { withHl++; if (beatNear(pl, tFilm) < 0.03) onBeat++; }
    }
    const played = vc.map((c) => Math.min(c.freezeAt != null ? c.freezeAt : c.visEnd, c.visEnd) - c.visStart);
    out[name + '_d'] = vc.map((c) => `${media[c.mediaIndex].id}${c.vid ? 'S' : ''} ${c.start.toFixed(1)}-${c.end.toFixed(1)} r${(c.rate || 1).toFixed(2)} off${c.srcOffset.toFixed(1)} fz${c.freezeAt != null ? c.freezeAt.toFixed(1) : '-'} ${c.label} ${c.role}`);
    out[name] = { D: +pl.duration.toFixed(1), videos: `${shown.size}/${vids.length}`, dropped, slots: vc.filter((c) => c.vid).length, minPlay: +Math.min(...played).toFixed(2), onBeat: `${onBeat}/${withHl}`, short: shortV.length, frozen: frozen.length };
    if (!pl.clips.every((c, i) => c.i === i)) fails.push(`${name}: Clip-Nummern`);
    if (shortV.length) fails.push(`${name}: Video auf kurzer Einstellung`);
    if (frozen.length) fails.push(`${name}: Video steht still`);
    if (shown.size + dropped.length < vids.length) fails.push(`${name}: Video verschwunden`);
    if (name !== 'story 30 s' && shown.size < vids.length) fails.push(`${name}: nicht alle Videos im Film`);
    if (withHl && onBeat < withHl * 0.75) fails.push(`${name}: bester Moment nicht auf dem Schlag`);
    if (Math.min(...played) < 1.9) fails.push(`${name}: Video zu kurz gespielt`);
  }
  // iPhone-Verhalten: Video lädt erst nach play() – darf nicht als Standbild enden
  const vcnv = document.createElement('canvas'); vcnv.width = 320; vcnv.height = 180; const vx = vcnv.getContext('2d');
  const rec = new MediaRecorder(vcnv.captureStream(30), { mimeType: 'video/webm' }); const ch = []; rec.ondataavailable = (e) => ch.push(e.data);
  const done = new Promise((r) => (rec.onstop = r)); rec.start(); const t0 = performance.now();
  await new Promise((res) => { const f = () => { const t = (performance.now() - t0) / 1000; vx.fillStyle = `hsl(${t * 120},70%,50%)`; vx.fillRect(0, 0, 320, 180); if (t < 3) requestAnimationFrame(f); else { rec.stop(); res(); } }; f(); });
  await done;
  const blob = await fixWebmDuration(new Blob(ch, { type: 'video/webm' }), 3000);
  const url = URL.createObjectURL(blob);
  const v = makeVideoEl();
  v.preload = 'none';
  const ok = await loadVideoSrc(v, url);
  const seekOk = await seekVideo(v, 1.5);
  out.lazy = { ok, ready: v.readyState, seekOk, at: +v.currentTime.toFixed(2) };
  if (!ok || v.readyState < 2 || Math.abs(v.currentTime - 1.5) > 0.1) fails.push('Video mit spätem Laden bleibt ohne Bild');
  return { out, fails };
}, wav);
console.log(JSON.stringify(res.out, null, 1));
console.log('Fehler:', res.fails.length ? res.fails.join(' | ') : 'keine');
await b.close();
