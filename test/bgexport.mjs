// Export nach App-Wechsel: Seite wird versteckt, iOS beendet den Encoder; der Export muss vollständig und lesbar weiterlaufen.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/struct.wav`, { bpm: 124 });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const wav = readFileSync(`${OUT}/struct.wav`).toString('base64');
const res = await p.evaluate(async (b64) => {
  const fails = [];
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer);
  const an = await analyzeAudio(buf);
  const media = demoScenes().slice(0, 6).map((c, i) => ({ id: 'd' + i, kind: 'image', name: 'Bild ' + i, canvas: c, w: c.width, h: c.height, time: i * 60000, ...scoreImage(c, c.width, c.height) }));
  const plan = buildPlan({ an, media, settings: { format: '9:16', look: 'natur', pace: 'auto', intro: 'hook', outro: 'auto', length: 8, songStart: 'auto', frame: 'auto', split: 'off', seed: 3 }, overrides: { texts: [], stickers: [] } });
  const W = 270, H = 480, fps = 30;
  const support = await Engine.exportSupport({ w: W, h: H }, fps, false);
  // App-Wechsel nachstellen: versteckt, Encoder wird beendet, nach kurzer Zeit wieder sichtbar
  let hidden = false, calls = 0;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  const enc0 = VideoEncoder.prototype.encode;
  VideoEncoder.prototype.encode = function (f, o) {
    enc0.call(this, f, o);
    if (++calls === 70) {
      const me = this;
      hidden = true; document.dispatchEvent(new Event('visibilitychange'));
      setTimeout(() => { me.close(); hidden = false; document.dispatchEvent(new Event('visibilitychange')); }, 300);
    }
  };
  const states = [];
  const eng = new Engine(document.getElementById('c'));
  eng.setProject({ plan, media, audioBuffer: buf, size: { w: W, h: H } });
  const r = await eng.exportOffline({ size: { w: W, h: H }, fps, withAudio: false, support, onState: (s, x) => states.push(s + (x != null ? ' ' + x.toFixed(2) : '')) });
  VideoEncoder.prototype.encode = enc0;
  const N = Math.round(plan.duration * fps);
  const track = await demuxVideo(r.blob);
  let decoded = 0, derr = null;
  const dec = new VideoDecoder({ output: (f) => { decoded++; f.close(); }, error: (e) => { derr = String(e); } });
  dec.configure({ codec: track.codec, description: track.description, codedWidth: track.width, codedHeight: track.height });
  for (const s of track.samples) dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.cts, duration: s.dur, data: new Uint8Array(await r.blob.slice(s.off, s.off + s.size).arrayBuffer()) }));
  await dec.flush().catch((e) => { derr = String(e); });
  if (!states.includes('paused') || !states.some((s) => s.startsWith('resumed'))) fails.push('Pause/Fortsetzen nicht erkannt');
  if (track.samples.length !== N) fails.push(`Bilder ${track.samples.length} statt ${N}`);
  if (decoded !== N || derr) fails.push(`dekodiert ${decoded}/${N} ${derr || ''}`);
  return { states, N, samples: track.samples.length, decoded, calls, fails };
}, wav);
console.log(JSON.stringify(res));
console.log('Fehler:', res.fails && res.fails.length ? res.fails.join(' | ') : 'keine');
await b.close();
