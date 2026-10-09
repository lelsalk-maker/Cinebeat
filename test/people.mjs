// Menschen und Einstellungsgrößen ohne Modelldatei: Gesichter (verschiedene Hauttöne, nah und halbnah, ein echtes Foto)
// werden gefunden; Sand, Holz, Terrakotta, Abendhimmel und eine Orange nicht. Einstellungsgröße: Landschaft = Totale,
// Porträt = Nah, zwei Personen = Halbnah. Anordnung: im Moment von weit nach nah, Totale zuerst, nie drei gleiche.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, existsSync } from 'node:fs';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const real = '/usr/local/go1.25.1/src/image/testdata/video-001.jpeg';
const realB64 = existsSync(real) ? readFileSync(real).toString('base64') : null;
const r = await p.evaluate(async (realB64) => {
  let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const noise = (ctx, w, h, amt) => { const d = ctx.getImageData(0, 0, w, h); for (let i = 0; i < d.data.length; i += 4) { const n = (rnd() - 0.5) * amt; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } ctx.putImageData(d, 0, 0); };
  const face = (ctx, cx, cy, fw, skin, hair = '#2a1d16') => {
    const fh = fw * 1.3;
    ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(cx, cy - fh * 0.12, fw * 0.58, fh * 0.6, 0, Math.PI, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(cx, cy, fw / 2, fh / 2, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = 'rgba(40,25,20,0.9)';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * fw * 0.2, cy - fh * 0.1, fw * 0.09, fh * 0.045, 0, 0, 2 * Math.PI); ctx.fill(); ctx.fillRect(cx + s * fw * 0.2 - fw * 0.12, cy - fh * 0.2, fw * 0.24, fh * 0.03); }
    ctx.fillStyle = 'rgba(120,40,40,0.8)'; ctx.fillRect(cx - fw * 0.15, cy + fh * 0.22, fw * 0.3, fh * 0.04);
  };
  const out = {};
  const run = (name, c) => { const s = scoreImage(c, c.width, c.height); out[name] = { faces: s.faceBox.length, fh: s.faceBox.length ? +Math.max(...s.faceBox.map((x) => x[3])).toFixed(2) : 0, size: shotSize({ ...s, kind: 'image', w: c.width, h: c.height }), people: +peopleIn(s).toFixed(2) }; };
  const skins = { hell: '#efc7a8', mittel: '#c99470', dunkel: '#7a4f3a' };
  // Nah-Porträts in drei Hauttönen vor unscharfem Grün
  for (const [k, skin] of Object.entries(skins)) {
    const c = cv(1080, 1440), x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 1440); gr.addColorStop(0, '#5d7f4c'); gr.addColorStop(1, '#2f4a2a'); x.fillStyle = gr; x.fillRect(0, 0, 1080, 1440);
    x.fillStyle = '#34507a'; x.fillRect(250, 1050, 580, 400);
    face(x, 540, 640, 480, skin);
    x.fillStyle = skin; x.fillRect(470, 920, 140, 140);
    noise(x, 1080, 1440, 10); run('nah-' + k, c);
  }
  // Halbnah: zwei Personen vor einer Wand
  {
    const c = cv(1440, 1080), x = c.getContext('2d');
    x.fillStyle = '#c9c4b8'; x.fillRect(0, 0, 1440, 1080);
    for (const [cx, skin, shirt] of [[480, skins.hell, '#2b4c7e'], [960, skins.mittel, '#7e2b2b']]) { x.fillStyle = shirt; x.fillRect(cx - 200, 560, 400, 520); face(x, cx, 420, 170, skin); }
    noise(x, 1440, 1080, 8); run('halbnah-zwei', c);
  }
  // Totale: Landschaft mit Himmel, Bergen und Wiese
  {
    const c = cv(1440, 1080), x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, 500); sky.addColorStop(0, '#5b8fd6'); sky.addColorStop(1, '#a9c8ee'); x.fillStyle = sky; x.fillRect(0, 0, 1440, 520);
    x.fillStyle = '#4e5a6b'; x.beginPath(); x.moveTo(0, 520); for (let k = 0; k <= 12; k++) x.lineTo(k * 120, 380 + (k % 2) * 110); x.lineTo(1440, 520); x.fill();
    x.fillStyle = '#6b8f3e'; x.fillRect(0, 520, 1440, 560);
    noise(x, 1440, 1080, 14); run('totale', c);
  }
  // keine Menschen: Sandstrand, Holztisch, Terrakotta-Wand, Abendhimmel, Orange auf Tisch
  {
    const c = cv(1440, 1080), x = c.getContext('2d');
    x.fillStyle = '#9cc3e6'; x.fillRect(0, 0, 1440, 360); x.fillStyle = '#2f7fa8'; x.fillRect(0, 360, 1440, 140); x.fillStyle = '#e3c39a'; x.fillRect(0, 500, 1440, 580);
    noise(x, 1440, 1080, 18); run('sand', c);
  }
  {
    const c = cv(1440, 1080), x = c.getContext('2d');
    x.fillStyle = '#b07a4f'; x.fillRect(0, 0, 1440, 1080);
    for (let k = 0; k < 160; k++) { x.strokeStyle = `rgba(90,50,25,${0.2 + rnd() * 0.4})`; x.lineWidth = 2 + rnd() * 5; x.beginPath(); const y = rnd() * 1080; x.moveTo(0, y); x.bezierCurveTo(480, y + 30 * (rnd() - 0.5), 960, y + 30 * (rnd() - 0.5), 1440, y + 20 * (rnd() - 0.5)); x.stroke(); }
    noise(x, 1440, 1080, 10); run('holz', c);
  }
  {
    const c = cv(1080, 1440), x = c.getContext('2d');
    x.fillStyle = '#c8714e'; x.fillRect(0, 0, 1080, 1440);
    x.fillStyle = '#3a2a22'; x.fillRect(380, 500, 120, 180); x.fillRect(600, 500, 120, 180);
    noise(x, 1080, 1440, 12); run('terrakotta', c);
  }
  {
    const c = cv(1440, 1080), x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 1080); gr.addColorStop(0, '#41306b'); gr.addColorStop(0.55, '#e2875a'); gr.addColorStop(0.7, '#f3c08a'); gr.addColorStop(0.71, '#1d2433'); gr.addColorStop(1, '#10141d'); x.fillStyle = gr; x.fillRect(0, 0, 1440, 1080);
    noise(x, 1440, 1080, 8); run('abendhimmel', c);
  }
  {
    const c = cv(1440, 1080), x = c.getContext('2d');
    x.fillStyle = '#e8e4dc'; x.fillRect(0, 0, 1440, 1080);
    x.fillStyle = '#ef8a2a'; x.beginPath(); x.arc(720, 540, 260, 0, 2 * Math.PI); x.fill();
    x.fillStyle = '#4c7a2a'; x.beginPath(); x.ellipse(760, 290, 50, 20, 0.4, 0, 2 * Math.PI); x.fill();
    noise(x, 1440, 1080, 10); run('orange', c);
  }
  // Lichterkreise (Bokeh): überlappende Kreise wirken wie Augen – kein Gesicht
  { const c = demoScenes()[2]; run('bokeh', c); }
  if (realB64) {
    const img = new Image(); img.src = 'data:image/jpeg;base64,' + realB64; await img.decode();
    const c = cv(img.width * 4, img.height * 4); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); run('echtes-foto', c);
  }
  return out;
}, realB64);
// Szenen-Grammatik: sechs Szenen mit je einer Totale, Halbnahen und Nahaufnahme in zufälliger Aufnahmefolge
const g = await p.evaluate(async () => {
  let seed = 5; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const base = demoScenes(), T0 = Date.UTC(2026, 4, 1, 8);
  const media = [];
  const kinds = [{ horizon: 0.42, sky: 0.5, faceBox: [] }, { faceBox: [[0.4, 0.3, 0.12, 0.16]] }, { faceBox: [[0.3, 0.2, 0.35, 0.45]] }];
  for (let sc = 0; sc < 6; sc++) {
    const order = [0, 1, 2].sort(() => rnd() - 0.5);
    order.forEach((kd, j) => {
      const i = sc * 3 + j, c = base[i % base.length];
      media.push({ id: 'g' + i, kind: 'image', name: 'G' + i, canvas: c, w: 4000, h: 3000, time: T0 + Math.floor(sc / 3) * 864e5 + (sc % 3) * 2 * 36e5 + j * 60000, ...scoreImage(c, c.width, c.height), ...kinds[kd], vis: 4, score: 0.6 + rnd() * 0.1, hash: [i * 7919 + 1, i * 104729 + 3], avg: [100 + sc * 20, 120, 140 - sc * 10] });
    });
  }
  const byId = new Map(media.map((m) => [m.id, m]));
  const an = await (async () => { const s = await beatSong(beatRecipe('sommer', {}, { seed: 3, form: 'reel' })); return s.an; })();
  const out = {};
  for (const order of ['tageszeit', 'lied']) {
    const pl = buildPlan({ an, media: media.map((m) => ({ ...m })), settings: { format: '9:16', target: 'reel', look: 'natur', pace: 'auto', intro: 'hook', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 5, order, effekte: 'schlicht' }, overrides: { texts: [], stickers: [] } });
    const seq = pl.clips.filter((c) => c.mediaId && !c.split && !c.burst && !c.flash && !c.rush && !c.stack && !c.grid && !c.loop && byId.get(c.mediaId)).map((c) => byId.get(c.mediaId));
    const sizes = seq.map((m) => shotSize(m));
    let tri = 0, up = 0, same = 0, pairs = 0, starts = 0, wideStart = 0;
    for (let i = 2; i < sizes.length; i++) if (sizes[i] === sizes[i - 1] && sizes[i - 1] === sizes[i - 2]) tri++;
    const scene = (m) => Math.floor(+m.id.slice(1) / 3);
    for (let i = 1; i < seq.length; i++) {
      if (scene(seq[i]) === scene(seq[i - 1])) { pairs++; if (sizes[i] > sizes[i - 1]) up++; if (sizes[i] === sizes[i - 1]) same++; }
      else { starts++; if (sizes[i] === 0) wideStart++; }
    }
    out[order] = { sizes: sizes.join(''), tri, up, same, pairs, starts, wideStart };
  }
  return out;
});
console.log('Szenen-Grammatik:', JSON.stringify(g));
const fails = [];
for (const [o, x] of Object.entries(g)) {
  if (x.tri) fails.push(`${o}: drei gleiche Einstellungsgrößen hintereinander (${x.tri})`);
  if (x.pairs && x.up < x.pairs * 0.5) fails.push(`${o}: in der Szene selten von weit nach nah (${x.up}/${x.pairs})`);
  if (x.starts && x.wideStart < x.starts * 0.5) fails.push(`${o}: Szenen beginnen selten mit einer Totale (${x.wideStart}/${x.starts})`);
}
for (const [k, v] of Object.entries(r)) console.log(k.padEnd(14), JSON.stringify(v));
for (const k of ['nah-hell', 'nah-mittel', 'nah-dunkel']) { if (!r[k].faces) fails.push(`${k}: Gesicht fehlt`); else if (r[k].size !== 2) fails.push(`${k}: nicht Nah (${r[k].size})`); }
if (r['halbnah-zwei'].faces < 2 || r['halbnah-zwei'].size !== 1) fails.push(`zwei Personen: ${r['halbnah-zwei'].faces} Gesichter, Größe ${r['halbnah-zwei'].size}`);
if (r.totale.faces || r.totale.size !== 0) fails.push(`Totale: ${r.totale.faces} Gesichter, Größe ${r.totale.size}`);
for (const k of ['sand', 'holz', 'terrakotta', 'abendhimmel', 'orange', 'bokeh']) if (r[k].faces) fails.push(`${k}: falsches Gesicht`);
// (das echte Foto ist nur 150 px breit: ein Treffer ist schön, aber kein Muss – ein falscher Treffer wäre schlimmer)
if (r['echtes-foto'] && r['echtes-foto'].faces > 2) fails.push('echtes Foto: zu viele Gesichter');
console.log('Fehler:', fails.length ? fails.join(' | ') : 'keine');
await b.close();
process.exit(fails.length ? 1 : 0);
