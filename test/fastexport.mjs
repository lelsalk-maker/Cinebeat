// Schneller Export: WebCodecs-Dekoder (demux.js) muss dieselben Bilder liefern wie das Spulen im Video-Element.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/struct.wav`, { bpm: 124 });
const W = +(process.env.W || 360), H = +(process.env.H || 640);
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const wav = readFileSync(`${OUT}/struct.wav`).toString('base64');
const res = await p.evaluate(async ({ b64, W, H }) => {
  const fails = [];
  // codecString mit bekannten Konfigurationen
  const hv = new Uint8Array([1, 0x01, 0x60, 0, 0, 0, 0x90, 0, 0, 0, 0, 0, 120]);
  const cs = { avc: codecString('avc1', new Uint8Array([1, 0x64, 0x00, 0x28])), hevc: codecString('hvc1', hv), hevc10: codecString('hvc1', new Uint8Array([1, 0x02, 0x20, 0, 0, 0, 0x90, 0, 0, 0, 0, 0, 153])), vp9: codecString('vp09', new Uint8Array([1, 0, 0, 0, 0, 40, 0x80])) };
  if (cs.avc !== 'avc1.640028') fails.push('avc ' + cs.avc);
  if (cs.hevc !== 'hvc1.1.6.L120.90') fails.push('hevc ' + cs.hevc);
  if (cs.hevc10 !== 'hvc1.2.4.L153.90') fails.push('hevc10 ' + cs.hevc10);
  if (cs.vp9 !== 'vp09.00.40.08') fails.push('vp9 ' + cs.vp9);

  // Quellvideo: 25 fps, 6 s, VP9 in MP4 (eigener Muxer), Bildnummer groß im Bild
  const fpsSrc = 25, VW = 640, VH = 360, NF = fpsSrc * 6;
  const mux = new Mp4Muxer({ video: { codec: 'vp9', width: VW, height: VH, fps: fpsSrc }, audio: null });
  let err = null;
  const enc = new VideoEncoder({ output: (c, m) => mux.addVideoChunk(c, m), error: (e) => { err = e; } });
  enc.configure({ codec: 'vp09.00.40.08', width: VW, height: VH, bitrate: 4e6, framerate: fpsSrc });
  const vc = new OffscreenCanvas(VW, VH), vx = vc.getContext('2d');
  for (let n = 0; n < NF; n++) {
    vx.fillStyle = `hsl(${n * 7},60%,45%)`; vx.fillRect(0, 0, VW, VH);
    vx.fillStyle = '#fff'; vx.font = 'bold 150px sans-serif'; vx.fillText(String(n), 40, 250);
    vx.fillRect((n * 13) % VW, 300, 40, 40);
    const f = new VideoFrame(vc, { timestamp: Math.round(n * 1e6 / fpsSrc), duration: Math.round(1e6 / fpsSrc) });
    enc.encode(f, { keyFrame: n % 50 === 0 }); f.close();
  }
  await enc.flush(); enc.close();
  if (err) return { err: String(err) };
  const file = mux.finalize();
  const track = await demuxVideo(file);
  if (!track || track.samples.length !== NF) fails.push('demux ' + (track && track.samples.length));
  const vurl = URL.createObjectURL(file);

  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer);
  const an = await analyzeAudio(buf);
  const scenes = demoScenes().slice(0, 3);
  const media = scenes.map((c, i) => ({ id: 'd' + i, kind: 'image', name: 'Bild ' + i, canvas: c, w: c.width, h: c.height, time: i, ...scoreImage(c, c.width, c.height) }));
  const vv = makeVideoEl(); vv.src = vurl; await waitEvent(vv, ['loadedmetadata'], ['error'], 5000);
  const sv = await scoreVideo(vv, vv.duration);
  const vitem = { id: 'v0', kind: 'video', name: 'Video', url: vurl, file, w: VW, h: VH, duration: vv.duration, time: 1.5, poster: null, fav: true, ...sv };
  media.splice(1, 0, vitem);
  const s = { format: '9:16', look: 'natur', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'off', burst: 'off', seed: 3 };
  const plan = buildPlan({ an, media, settings: s, overrides: { texts: [], stickers: [] } });
  const vclips = plan.clips.filter((c) => media[c.mediaIndex] === vitem && !c.split && !c.grid);
  if (!vclips.length) return { err: 'kein Videoclip im Plan', fails };
  const fps = 30;
  const support = await Engine.exportSupport({ w: W, h: H }, fps, false);
  const run = async (withFile) => {
    const m2 = media.map((m) => (m === vitem && !withFile ? { ...m, file: null } : m));
    const eng = new Engine(document.getElementById('c'));
    eng.setProject({ plan, media: m2, audioBuffer: buf, size: { w: W, h: H } });
    const shots = new Map();
    const c2 = new OffscreenCanvas(W, H), x2 = c2.getContext('2d', { willReadFrequently: true });
    const orig = eng.drawAt.bind(eng);
    let fast = 0;
    eng.drawAt = (t, mode) => {
      orig(t, mode);
      for (const sl of eng.slots.values()) if (sl.fr) fast++;
      const inV = vclips.some((c) => t >= c.visStart && t < c.visEnd);
      const n = Math.round(t * fps);
      if (inV && n % 4 === 0) { x2.drawImage(eng.canvas, 0, 0); shots.set(n, x2.getImageData(0, 0, W, H).data); }
    };
    const t0 = performance.now();
    await eng.exportOffline({ size: { w: W, h: H }, fps, withAudio: false, support });
    const secs = (performance.now() - t0) / 1000;
    eng.releaseAll();
    return { shots, secs, fast };
  };
  const slow = await run(false);
  const fast = await run(true);
  if (!fast.fast) fails.push('schneller Pfad nicht benutzt');
  if (slow.fast) fails.push('langsamer Pfad benutzte Dekoder');
  let minP = 99, worst = -1, n = 0;
  for (const [k, a] of slow.shots) {
    const bb = fast.shots.get(k); if (!bb) continue;
    let se = 0; for (let i = 0; i < a.length; i += 4) { for (let j = 0; j < 3; j++) { const d = a[i + j] - bb[i + j]; se += d * d; } }
    const mse = se / (a.length * 0.75); const psnr = mse ? 10 * Math.log10(255 * 255 / mse) : 99;
    n++; if (psnr < minP) { minP = psnr; worst = k; }
  }
  if (!n) fails.push('keine Vergleichsbilder');
  if (minP < 38) fails.push(`Abweichung PSNR ${minP.toFixed(1)} dB bei Bild ${worst}`);
  return { cs, compared: n, minPsnr: +minP.toFixed(1), worst, slowSecs: +slow.secs.toFixed(2), fastSecs: +fast.secs.toFixed(2), fails, clips: vclips.map((c) => [c.visStart.toFixed(2), c.visEnd.toFixed(2), c.rate]) };
}, { b64: wav, W, H });
console.log(JSON.stringify(res, null, 1));
await b.close();
process.exit(res.err || (res.fails && res.fails.length) ? 1 : 0);
