import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/blank.html');
await p.addScriptTag({ url: '/src/js/score.js' });
console.log(await p.evaluate(() => {
  const mk = (fn) => { const c = document.createElement('canvas'); c.width = 1200; c.height = 800; const x = c.getContext('2d'); fn(x); return c; };
  const scene = (x) => { const g = x.createLinearGradient(0, 0, 1200, 800); g.addColorStop(0, '#1e6fa8'); g.addColorStop(1, '#f2a33a'); x.fillStyle = g; x.fillRect(0, 0, 1200, 800); for (let i = 0; i < 60; i++) { x.fillStyle = `hsl(${i * 37 % 360},70%,${30 + i % 40}%)`; x.fillRect((i * 97) % 1100, (i * 53) % 700, 40 + i % 60, 30 + i % 50); } x.fillStyle = '#fff'; x.font = 'bold 90px sans-serif'; x.fillText('Lissabon', 300, 420); };
  const sharp = mk(scene);
  const blur = mk((x) => { x.filter = 'blur(6px)'; scene(x); });
  const dark = mk((x) => { scene(x); x.fillStyle = 'rgba(0,0,0,0.85)'; x.fillRect(0, 0, 1200, 800); });
  const gray = mk((x) => { scene(x); x.globalCompositeOperation = 'saturation'; x.fillStyle = '#888'; x.fillRect(0, 0, 1200, 800); });
  const near = mk((x) => { scene(x); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, 0, 1200, 800); });
  const other = mk((x) => { x.fillStyle = '#2d5'; x.fillRect(0, 0, 1200, 800); x.fillStyle = '#123'; x.beginPath(); x.arc(300, 400, 250, 0, 7); x.fill(); });
  const out = {};
  const S = {};
  for (const [k, c] of Object.entries({ sharp, blur, dark, gray, near, other })) { S[k] = scoreImage(c, 1200, 800); out[k] = `score ${S[k].score.toFixed(2)} (sharp ${S[k].sharp.toFixed(2)} expo ${S[k].expo.toFixed(2)} color ${S[k].color.toFixed(2)})`; }
  out.hamming_near = hamming(S.sharp.hash, S.near.hash); out.hamming_blur = hamming(S.sharp.hash, S.blur.hash); out.hamming_other = hamming(S.sharp.hash, S.other.hash);
  const items = Object.entries(S).map(([k, s], i) => ({ id: k, kind: 'image', time: i * 1000, ...s }));
  markDuplicates(items);
  out.dups = items.filter((m) => m.dupOf).map((m) => m.id + '→' + m.dupOf).join(', ');
  return out;
}));
await b.close();
