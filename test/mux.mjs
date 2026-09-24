import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/blank.html');
await p.addScriptTag({ url: '/src/js/mp4mux.js' });
const r = await p.evaluate(async () => {
  const W = 360, H = 640, fps = 30, N = 90;
  const mux = new Mp4Muxer({ video: { codec: 'vp9', width: W, height: H, fps }, audio: { codec: 'opus', sampleRate: 48000, channels: 2 } });
  const enc = new VideoEncoder({ output: (c, m) => mux.addVideoChunk(c, m), error: (e) => { throw e; } });
  enc.configure({ codec: 'vp09.00.40.08', width: W, height: H, bitrate: 4e6, framerate: fps });
  const cv = new OffscreenCanvas(W, H); const x = cv.getContext('2d');
  for (let i = 0; i < N; i++) {
    x.fillStyle = `hsl(${i * 4},80%,50%)`; x.fillRect(0, 0, W, H); x.fillStyle = '#fff'; x.font = '80px sans-serif'; x.fillText(String(i), 40, 200);
    const f = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    enc.encode(f, { keyFrame: i % 60 === 0 }); f.close();
  }
  await enc.flush();
  const aenc = new AudioEncoder({ output: (c, m) => mux.addAudioChunk(c, m), error: (e) => { throw e; } });
  aenc.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 });
  const sr = 48000, total = sr * 3;
  for (let o = 0; o < total; o += 960) {
    const d = new Float32Array(960 * 2);
    for (let i = 0; i < 960; i++) { const t = (o + i) / sr; const v = (Math.floor(t) % 2 === 0 ? 0.5 : 0) * Math.sin(2 * Math.PI * 440 * t); d[i] = v; d[960 + i] = v; }
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: 960, numberOfChannels: 2, timestamp: Math.round(o * 1e6 / sr), data: d });
    aenc.encode(ad); ad.close();
  }
  await aenc.flush();
  const blob = mux.finalize();
  const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(blob); document.body.appendChild(v);
  const ok = await new Promise((res) => { v.onloadedmetadata = () => res(true); v.onerror = () => res('ERR ' + (v.error && v.error.message)); });
  if (ok !== true) return ok;
  const c = document.createElement('canvas'); c.width = 36; c.height = 64; const cx = c.getContext('2d');
  const hues = [];
  for (const t of [0.02, 1.0, 2.0, 2.95]) { v.currentTime = t; await new Promise((r) => (v.onseeked = r)); cx.drawImage(v, 0, 0, 36, 64); const d = cx.getImageData(2, 60, 1, 1).data; hues.push(`${t}:${d[0]},${d[1]},${d[2]}`); }
  const audio = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await blob.arrayBuffer());
  const ch = audio.getChannelData(0); let e0 = 0, e1 = 0; for (let i = 0; i < 48000; i++) e0 += ch[i] * ch[i]; for (let i = 48000; i < 96000; i++) e1 += ch[i] * ch[i];
  return { size: blob.size, dur: v.duration, w: v.videoWidth, h: v.videoHeight, hues, audioDur: audio.duration.toFixed(3), rmsSec0: Math.sqrt(e0 / 48000).toFixed(3), rmsSec1: Math.sqrt(e1 / 48000).toFixed(3) };
});
console.log(r);
await b.close();
