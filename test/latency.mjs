import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8123/manifest.webmanifest'); await page.setContent('<body></body>');
for (const kind of ['2d', 'webgl']) {
const r = await page.evaluate(async (kind) => {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; document.body.appendChild(cv);
  const g = kind === '2d' ? cv.getContext('2d') : cv.getContext('webgl', { preserveDrawingBuffer: true });
  const paint = (w) => { if (kind === '2d') { g.fillStyle = w ? '#fff' : '#000'; g.fillRect(0, 0, 64, 64); } else { g.clearColor(w, w, w, 1); g.clear(g.COLOR_BUFFER_BIT); } };
  const ac = new AudioContext(); await ac.resume();
  const dest = ac.createMediaStreamDestination();
  const ms = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(ms, { mimeType: 'video/webm' }); const ch = []; rec.ondataavailable = (e) => ch.push(e.data);
  const t0 = ac.currentTime + 0.5;
  for (let k = 0; k < 6; k++) { const o = ac.createOscillator(), gg = ac.createGain(); o.frequency.value = 1000; gg.gain.setValueAtTime(0, 0); gg.gain.setValueAtTime(1, t0 + k); gg.gain.setValueAtTime(0, t0 + k + 0.1); o.connect(gg).connect(dest); o.start(); o.stop(t0 + 7); }
  rec.start();
  const lat = { base: ac.baseLatency, out: ac.outputLatency };
  await new Promise((res) => { const loop = () => { const t = ac.currentTime - t0; paint(t >= 0 && (t % 1) < 0.1 ? 1 : 0); if (t < 6.3) requestAnimationFrame(loop); else res(); }; loop(); });
  rec.stop(); await new Promise((r) => (rec.onstop = r));
  const blob = new Blob(ch, { type: 'video/webm' });
  const audio = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(await blob.arrayBuffer());
  const d = audio.getChannelData(0); const aOn = []; let on = false;
  for (let i = 0; i < d.length; i += 48) { const a = Math.abs(d[i]) > 0.1 || Math.abs(d[i + 12]) > 0.1 || Math.abs(d[i + 24]) > 0.1; if (a && !on) aOn.push(i / audio.sampleRate); on = a; }
  const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(blob); document.body.appendChild(v);
  await new Promise((r) => (v.onloadedmetadata = r));
  const c2 = document.createElement('canvas'); c2.width = 8; c2.height = 8; const x = c2.getContext('2d'); const vOn = []; let von = false;
  await new Promise((resolve) => { const cb = (n, md) => { x.drawImage(v, 0, 0, 8, 8); const w = x.getImageData(0, 0, 1, 1).data[0] > 128; if (w && !von) vOn.push(md.mediaTime); von = w; if (!v.ended) v.requestVideoFrameCallback(cb); }; v.requestVideoFrameCallback(cb); v.onended = () => setTimeout(resolve, 100); v.play(); });
  return { lat, audio: aOn.map((t) => t.toFixed(3)).join(' '), video: vOn.map((t) => t.toFixed(3)).join(' ') };
}, kind);
console.log(kind, r);
}
await browser.close();
