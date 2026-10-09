// Farb- und Belichtungsangleichung „nur aufwerten“: ein flaues Bild bekommt Kontrast, ein gutes bleibt fast gleich,
// nichts brennt neu aus oder säuft ab (je Kanal gemessen), gesättigte Farben (roter Abendhimmel) werden nicht
// abgeschnitten, Hauttöne werden nur sanft verschoben. Gerechnet wie im Shader (Tonwerte → Gamma → Kanal-Verstärkung).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async () => {
  let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const mk = (draw, post) => { const c = document.createElement('canvas'); c.width = 480; c.height = 360; const x = c.getContext('2d'); draw(x); if (post) { const d = x.getImageData(0, 0, 480, 360); for (let i = 0; i < d.data.length; i += 4) for (let k = 0; k < 3; k++) d.data[i + k] = post(d.data[i + k], k); x.putImageData(d, 0, 0); } return c; };
  const scene = (x) => { const gr = x.createLinearGradient(0, 0, 0, 360); gr.addColorStop(0, '#6a9ad8'); gr.addColorStop(0.5, '#d9e6f2'); gr.addColorStop(0.51, '#3f6b2e'); gr.addColorStop(1, '#16220f'); x.fillStyle = gr; x.fillRect(0, 0, 480, 360); for (let k = 0; k < 30; k++) { x.fillStyle = `hsl(${rnd() * 360},50%,${15 + rnd() * 70}%)`; x.fillRect(rnd() * 460, 180 + rnd() * 170, 20 + rnd() * 50, 10 + rnd() * 40); } x.fillStyle = '#0a0a0a'; x.fillRect(20, 300, 60, 40); x.fillStyle = '#fbfbfb'; x.fillRect(400, 30, 40, 30); };
  const imgs = {
    gut: mk(scene),
    flau: mk(scene, (v) => 70 + v * 0.55),
    dunkel: mk((x) => { x.fillStyle = '#0d0f16'; x.fillRect(0, 0, 480, 360); for (let k = 0; k < 14; k++) { x.fillStyle = '#ffe9b0'; x.beginPath(); x.arc(rnd() * 480, 100 + rnd() * 200, 4 + rnd() * 6, 0, 7); x.fill(); } x.fillStyle = '#2a2f40'; x.fillRect(0, 280, 480, 80); }),
    abendrot: mk((x) => { const gr = x.createLinearGradient(0, 0, 0, 360); gr.addColorStop(0, '#5a1e2e'); gr.addColorStop(0.55, '#ff4a12'); gr.addColorStop(0.7, '#ffb000'); gr.addColorStop(0.71, '#141016'); gr.addColorStop(1, '#09080c'); x.fillStyle = gr; x.fillRect(0, 0, 480, 360); }),
    gegenlicht: mk((x) => { x.fillStyle = '#e8eef5'; x.fillRect(0, 0, 480, 360); x.fillStyle = '#5c5048'; x.fillRect(120, 90, 240, 270); }, (v) => 40 + v * 0.8),
  };
  const out = {};
  const lumaStats = (px) => { const L = []; let clip = 0; for (let i = 0; i < px.length; i += 4) { L.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]); for (let k = 0; k < 3; k++) if (px[i + k] <= 0.5 || px[i + k] >= 254.5) { clip++; break; } } L.sort((a, b) => a - b); const q = (f) => L[Math.floor(f * (L.length - 1))]; return { contrast: (q(0.95) - q(0.05)) / 255, mid: q(0.5) / 255, clip: clip / (px.length / 4) }; };
  for (const [k, c] of Object.entries(imgs)) {
    const m = { id: k, kind: 'image', w: 480, h: 360, time: Date.UTC(2026, 4, 1) + Object.keys(out).length * 864e5, ...scoreImage(c, 480, 360) };
    const cm = colorMatch([m]).corr.get(k);
    const px = c.getContext('2d').getImageData(0, 0, 480, 360).data;
    const after = new Uint8ClampedArray(px.length);
    const [gr, gg, gb, gam, bp = 0, wp = 1] = cm, gain = [gr, gg, gb];
    for (let i = 0; i < px.length; i += 4) for (let ch = 0; ch < 3; ch++) { let v = px[i + ch] / 255; v = Math.max(0, Math.min(1, (v - bp) / Math.max(0.5, wp - bp))); v = Math.pow(v, gam) * gain[ch]; after[i + ch] = Math.round(Math.min(1, v) * 255); }
    const a = lumaStats(px), z = lumaStats(after);
    out[k] = { corr: cm, lv: m.lv, contrast: [+a.contrast.toFixed(3), +z.contrast.toFixed(3)], mid: [+a.mid.toFixed(3), +z.mid.toFixed(3)], clip: [+a.clip.toFixed(4), +z.clip.toFixed(4)] };
  }
  return out;
});
const fails = [];
for (const [k, x] of Object.entries(r)) {
  console.log(k.padEnd(11), JSON.stringify(x));
  if (x.clip[1] - x.clip[0] > 0.012) fails.push(`${k}: neu ausgefressen/abgesoffen ${x.clip[0]} → ${x.clip[1]}`);
  if (x.contrast[1] < x.contrast[0] * 0.97) fails.push(`${k}: Kontrast verloren ${x.contrast[0]} → ${x.contrast[1]}`);
}
if (!(r.flau.contrast[1] > r.flau.contrast[0] * 1.1)) fails.push(`flau: kein Kontrastgewinn ${r.flau.contrast}`);
if (Math.abs(r.gut.contrast[1] - r.gut.contrast[0]) > r.gut.contrast[0] * 0.06) fails.push(`gut: verändert ${r.gut.contrast}`);
if (r.abendrot.corr[5] < 0.99) fails.push(`abendrot: Weißpunkt verschoben ${r.abendrot.corr[5]} (gesättigte Farbe würde abgeschnitten)`);
if (r.dunkel.corr[5] < 0.99) fails.push(`dunkel: Lichter gestreckt ${r.dunkel.corr[5]}`);
console.log('Fehler:', fails.length ? fails.join(' | ') : 'keine');
await b.close();
process.exit(fails.length ? 1 : 0);
