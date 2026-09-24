// Schnelles Einlesen: probeVideoFast (Dekoder) gegen den Weg über das Videoelement, inkl. gedrehtem Hochkant-Video.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const res = await p.evaluate(async () => {
  const fails = [];
  const make = async (rot) => {
    const fps = 30, VW = 1280, VH = 720, NF = fps * 6;
    const mux = new Mp4Muxer({ video: { codec: 'vp9', width: VW, height: VH, fps }, audio: null });
    const enc = new VideoEncoder({ output: (c, m) => mux.addVideoChunk(c, m), error: () => {} });
    enc.configure({ codec: 'vp09.00.40.08', width: VW, height: VH, bitrate: 6e6, framerate: fps });
    const vc = new OffscreenCanvas(VW, VH), vx = vc.getContext('2d');
    for (let n = 0; n < NF; n++) {
      // in der Mitte scharf und bunt, am Anfang unscharf und dunkel: Highlight muss hinten liegen
      const q = n / NF;
      vx.fillStyle = `hsl(${n * 3},${20 + q * 60}%,${15 + q * 35}%)`; vx.fillRect(0, 0, VW, VH);
      vx.fillStyle = '#ff0'; vx.fillRect(0, 0, 200, 120); // Markierung oben links
      if (q > 0.5) for (let k = 0; k < 40; k++) { vx.fillStyle = k % 2 ? '#fff' : '#036'; vx.fillRect(300 + k * 20, 200, 10, 300); }
      const f = new VideoFrame(vc, { timestamp: Math.round(n * 1e6 / fps) }); enc.encode(f, { keyFrame: n % 30 === 0 }); f.close();
      if (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
    }
    await enc.flush();
    const buf = new Uint8Array(await mux.finalize().arrayBuffer());
    if (rot) {
      for (let i = 0; i < buf.length - 4; i++) if (buf[i] === 0x74 && buf[i + 1] === 0x6b && buf[i + 2] === 0x68 && buf[i + 3] === 0x64) {
        const dv = new DataView(buf.buffer, i + 4 + 40, 36);
        dv.setInt32(0, 0); dv.setInt32(4, 65536); dv.setInt32(12, -65536); dv.setInt32(16, 0);
        break;
      }
    }
    return new File([buf], rot ? 'hoch.mp4' : 'quer.mp4', { type: 'video/mp4' });
  };
  const out = {};
  for (const rot of [0, 90]) {
    const file = await make(rot);
    await probeVideoFast(file); // Aufwärmen (JIT, Dekoder), damit der Zeitvergleich fair ist
    let t0 = performance.now();
    const fast = await probeVideoFast(file);
    const tf = performance.now() - t0;
    if (!fast) { fails.push('fast null ' + rot); continue; }
    const v = makeVideoEl(); v.src = URL.createObjectURL(file); await waitEvent(v, ['loadedmetadata'], ['error'], 5000);
    await scoreVideo(v, v.duration);
    t0 = performance.now();
    const slow = await scoreVideo(v, v.duration);
    const ts = performance.now() - t0;
    // Ausrichtung: gelbe Markierung muss im Vorschaubild an derselben Stelle liegen wie im Videoelement
    await seekVideo(v, 1);
    const c = document.createElement('canvas'); c.width = fast.poster.width; c.height = fast.poster.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(v, 0, 0, c.width, c.height);
    const where = (ctx) => { const d = ctx.getImageData(0, 0, c.width, c.height).data; let sx = 0, sy = 0, n = 0; for (let y = 0; y < c.height; y += 2) for (let xx = 0; xx < c.width; xx += 2) { const i = (y * c.width + xx) * 4; if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] < 80) { sx += xx; sy += y; n++; } } return n ? [+(sx / n / c.width).toFixed(2), +(sy / n / c.height).toFixed(2)] : null; };
    const c2 = document.createElement('canvas'); c2.width = c.width; c2.height = c.height; const x2 = c2.getContext('2d', { willReadFrequently: true }); x2.drawImage(fast.poster, 0, 0);
    const pe = where(x), pf = where(x2);
    const r = { dims: [fast.w, fast.h, v.videoWidth, v.videoHeight], dur: [+fast.duration.toFixed(2), +v.duration.toFixed(2)], bestT: [fast.highlights[0].t.toFixed(2), slow.highlights[0].t.toFixed(2)], score: [fast.score.toFixed(3), slow.score.toFixed(3)], hashDiff: hamming(fast.hash, slow.hash), mark: [pe, pf], ms: [Math.round(tf), Math.round(ts)] };
    out[rot] = r;
    if (fast.w !== v.videoWidth || fast.h !== v.videoHeight) fails.push(`Maße ${rot}`);
    if (Math.abs(fast.duration - v.duration) > 0.1) fails.push(`Dauer ${rot}`);
    if (!pe || !pf || Math.hypot(pe[0] - pf[0], pe[1] - pf[1]) > 0.05) fails.push(`Ausrichtung ${rot}`);
    if (Math.abs(fast.highlights[0].t - slow.highlights[0].t) > 0.8) fails.push(`Highlight ${rot}`);
    if (Math.abs(fast.score - slow.score) > 0.08) fails.push(`Score ${rot}`);
    if (!fast.layout || fast.layout.g.length !== 36) fails.push('layout');
  }
  return { out, fails };
});
console.log(JSON.stringify(res));
await b.close();
process.exit(res.fails.length ? 1 : 0);
