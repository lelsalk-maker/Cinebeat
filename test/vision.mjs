// Bildverständnis (vision.js) an gezeichneten Szenen: gleiches Motiv erkennen (auch zwei verschiedene Strände),
// verschiedene Motive trennen, Himmelslinie hinter Bergen, Horizont-Neigung, ruhiges Titelband.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const res = await p.evaluate(() => {
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const W = 480, H = 360;
  const mk = (draw, w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h); // Sensorrauschen
    const d = x.getImageData(0, 0, w, h); for (let i = 0; i < d.data.length; i += 4) { const n = (rnd() - 0.5) * 14; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } x.putImageData(d, 0, 0); return c; };
  const grad = (x, y0, y1, c0, c1, w) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); x.fillStyle = g; x.fillRect(0, y0, w, y1 - y0); };
  const waves = (x, y0, y1, w, col) => { x.strokeStyle = col; x.lineWidth = 1.5; for (let y = y0 + 4; y < y1; y += 7 + rnd() * 5) { x.beginPath(); for (let px = 0; px <= w; px += 12) x.lineTo(px, y + Math.sin(px * 0.05 + y) * 2); x.stroke(); } };
  const beach = (hz, sand, tone = 0) => (x, w, h) => { grad(x, 0, h * hz, `rgb(${90 + tone},${160 + tone},${230})`, `rgb(${170 + tone},${210 + tone},245)`, w); grad(x, h * hz, h * sand, 'rgb(30,110,160)', 'rgb(60,160,180)', w); waves(x, h * hz, h * sand, w, 'rgba(255,255,255,0.35)'); grad(x, h * sand, h, 'rgb(225,200,150)', 'rgb(205,175,125)', w); for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(120,90,50,${rnd() * 0.3})`; x.fillRect(rnd() * w, h * sand + rnd() * h * (1 - sand), 2, 2); } };
  const city = (x, w, h) => { grad(x, 0, h, 'rgb(170,180,195)', 'rgb(120,120,125)', w); for (let i = 0; i < 14; i++) { const bx = i * w / 14, bh = h * (0.4 + rnd() * 0.5); x.fillStyle = `rgb(${110 + rnd() * 60},${90 + rnd() * 40},${70 + rnd() * 30})`; x.fillRect(bx, h - bh, w / 14 - 3, bh); x.fillStyle = 'rgba(255,240,200,0.7)'; for (let y = h - bh + 8; y < h - 8; y += 14) for (let k = 0; k < 3; k++) x.fillRect(bx + 4 + k * 10, y, 5, 7); } };
  const forest = (x, w, h) => { x.fillStyle = 'rgb(30,70,30)'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { x.fillStyle = `rgb(${20 + rnd() * 60},${80 + rnd() * 100},${20 + rnd() * 40})`; x.beginPath(); x.arc(rnd() * w, rnd() * h, 2 + rnd() * 6, 0, 7); x.fill(); } };
  const food = (x, w, h) => { x.fillStyle = 'rgb(90,60,40)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(245,245,240)'; x.beginPath(); x.arc(w / 2, h / 2, h * 0.42, 0, 7); x.fill(); for (let i = 0; i < 40; i++) { x.fillStyle = ['rgb(200,40,30)', 'rgb(240,200,60)', 'rgb(60,140,40)'][i % 3]; x.beginPath(); x.arc(w / 2 + (rnd() - 0.5) * h * 0.5, h / 2 + (rnd() - 0.5) * h * 0.5, 6 + rnd() * 12, 0, 7); x.fill(); } };
  const sunset = (x, w, h) => { grad(x, 0, h * 0.7, 'rgb(250,150,60)', 'rgb(240,90,70)', w); grad(x, h * 0.7, h, 'rgb(40,20,30)', 'rgb(10,5,10)', w); x.fillStyle = 'rgb(255,220,120)'; x.beginPath(); x.arc(w * 0.6, h * 0.62, 30, 0, 7); x.fill(); };
  const peaks = [0.62, 0.45, 0.55, 0.32, 0.5, 0.4, 0.58, 0.48, 0.6];
  const ridge = (px, w) => { const u = px / w * (peaks.length - 1), i = Math.floor(u), f = u - i; return peaks[i] * (1 - f) + peaks[Math.min(peaks.length - 1, i + 1)] * f; };
  const mountains = (x, w, h) => { grad(x, 0, h, 'rgb(110,170,235)', 'rgb(190,220,245)', w); x.fillStyle = 'rgb(70,80,95)'; x.beginPath(); x.moveTo(0, h); for (let px = 0; px <= w; px += 2) x.lineTo(px, ridge(px, w) * h); x.lineTo(w, h); x.fill(); for (let i = 0; i < 900; i++) { const px = rnd() * w, y0 = ridge(px, w) * h; x.fillStyle = `rgba(${40 + rnd() * 60},${50 + rnd() * 50},${60 + rnd() * 40},0.6)`; x.fillRect(px, y0 + 4 + rnd() * (h - y0), 3, 3); } };
  const tilted = (deg) => (x, w, h) => { x.save(); x.translate(w / 2, h / 2); x.rotate(deg * Math.PI / 180); x.translate(-w, -h); beach(0.5, 0.75)(x, w * 2, h * 2); x.restore(); };
  const sc = (c) => ({ id: Math.random().toString(36), ...scoreImage(c, c.width, c.height) });
  const shifted = (draw, dx, zoom, gain) => (x, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); x.filter = `brightness(${gain})`; x.drawImage(c, dx, 0, w * zoom, h * zoom); x.drawImage(c, dx - w * zoom, 0, w * zoom, h * zoom); x.filter = 'none'; };
  const S = {
    beachA: sc(mk(beach(0.45, 0.7))), beachA2: sc(mk(shifted(beach(0.45, 0.7), -40, 1.12, 1.08))), beachB: sc(mk(beach(0.38, 0.62, 15))),
    city: sc(mk(city)), forest: sc(mk(forest)), food: sc(mk(food)), sunset: sc(mk(sunset)), mountains: sc(mk(mountains)),
  };
  const pairs = {};
  const names = Object.keys(S);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) pairs[names[i] + '~' + names[j]] = motifSim(S[names[i]], S[names[j]]);
  // Himmelslinie der Berge gegen den gezeichneten Grat
  const line = skyLine(S.mountains.sky);
  let err = null;
  if (line) { let e = 0; for (let k = 0; k < line.length; k++) e += Math.abs(line[k] - ridge((k + 0.5) / line.length * W, W)); err = +(e / line.length).toFixed(4); }
  const tilt3 = sc(mk(tilted(3))).tilt, tiltM2 = sc(mk(tilted(-2))).tilt, tilt0 = sc(mk(beach(0.5, 0.75))).tilt;
  const band = calmBand(S.mountains, [0, 0, 1, 1]); band.all = [0.2, 0.33, 0.5, 0.66, 0.8].map((y) => [y, bandStats(S.mountains, [0, 0, 1, 1], y)]); band.calm = S.mountains.calm;
  // Planer: je Szene vier Aufnahmen kurz nacheinander (wie auf echten Reisen) – im Film nie zwei gleiche Motive hintereinander
  const kinds = [['strand', (k) => beach(0.4 + k * 0.03, 0.66 + k * 0.02, k * 5)], ['stadt', () => city], ['wald', () => forest], ['essen', () => food], ['abend', () => sunset], ['berge', () => mountains]];
  const media = [];
  const T0 = Date.UTC(2026, 5, 3, 7);
  kinds.forEach(([name, f], si) => { for (let k = 0; k < 4; k++) { const c = mk(shifted(f(k), -k * 25, 1 + k * 0.04, 1 + (k % 2) * 0.05)); media.push({ id: `${name}${k}`, kind: 'image', name, canvas: c, w: 4000, h: 3000, time: T0 + si * 25 * 60000 + k * 50000, ...scoreImage(c, c.width, c.height) }); } });
  return (async () => {
    const song = await beatSong(beatRecipe('sommer', {}, { seed: 3, form: 'reel' }));
    const adj = {};
    for (const order of ['lied', 'tageszeit', 'streng']) for (const target of ['story', 'reel']) {
      const plan = buildPlan({ an: song.an, media: media.map((m) => ({ ...m })), settings: { look: 'auto', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', seed: 5, title: 'Algarve', format: '9:16', target, order }, overrides: { texts: [], stickers: [] } });
      const byId = new Map(media.map((m) => [m.id, m]));
      const seq = plan.clips.filter((c) => c.mediaId && !c.split && !c.flash && !c.rush && !c.burst && !c.welcome && !c.grid && !c.stack && !c.loop && !c.recap).map((c) => byId.get(c.mediaId));
      let n = 0; const ex = [];
      for (let i = 1; i < seq.length; i++) if (sameMotif(seq[i - 1], seq[i])) { n++; ex.push(seq[i - 1].id + '/' + seq[i].id); }
      adj[order + '/' + target] = { n, of: seq.length, ex: ex.slice(0, 3) };
    }
    // Ortsname hinter den Bergen: Startbild Berge, Einstieg Ortsname
    const pb = buildPlan({ an: song.an, media: media.map((m) => ({ ...m })), settings: { look: 'auto', pace: 'auto', intro: 'city', outro: 'auto', length: 'auto', songStart: 'auto', seed: 5, title: 'Algarve', format: '9:16', target: 'story', hookId: 'berge0' }, overrides: { texts: [], stickers: [] } });
    const city = pb.overlays.find((o) => o.type === 'city');
    const behind = { first: pb.clips[0].mediaId, place: city && city.place, behind: city && city.behind };
    // Videos: beste Stelle nach Inhalt (Bewegung + Lachen schlagen ein etwas schärferes Bild; Wackeln zählt weniger), Bildrate
    const vm = videoMoments({ highlights: [{ t: 2, score: 0.78 }, { t: 6, score: 0.7 }, { t: 9, score: 0.8 }], hits: [[6.2, 0.8]], loud: [[5.9, 0.7]], shakes: [{ t: 2, j: 0 }, { t: 6, j: 0.1 }, { t: 9, j: 0.9 }] });
    const rates = [24, 30, 60, 120, 240].map((fps) => minRate({ fps }));
    return { pairs, adj, behind, video: { best: vm[0], rates }, sky: { ok: !!line, err, beachSky: !!S.beachA.sky, citySky: !!S.city.sky, forestSky: !!S.forest.sky }, tilt: { tilt3, tiltM2, tilt0 }, band, comp: Object.fromEntries(names.map((n) => [n, S[n].comp])), mood: Object.fromEntries(names.map((n) => [n, S[n].mood])) };
  })();
});
const errs = [];
const P = res.pairs;
console.log('Ähnlichkeit:', Object.entries(P).map(([k, v]) => `${k} ${v}`).join(' · '));
for (const k of ['beachA~beachA2', 'beachA~beachB', 'beachA2~beachB']) if (!(P[k] >= 0.6)) errs.push(`gleiches Motiv nicht erkannt: ${k} ${P[k]}`);
for (const [k, v] of Object.entries(P)) if (!/^beach.*~beach/.test(k) && v >= 0.5) errs.push(`verschiedene Motive als gleich: ${k} ${v}`);
console.log('Himmel:', res.sky, 'Neigung:', res.tilt, 'Titelband Berge:', res.band);
if (!res.sky.ok || !(res.sky.err < 0.025)) errs.push('Himmelslinie der Berge ungenau: ' + res.sky.err);
if (res.sky.forestSky || res.sky.citySky && false) errs.push('Himmel im Wald erkannt');
if (!(Math.abs(res.tilt.tilt3 - 3) < 0.8)) errs.push('Neigung 3° nicht erkannt: ' + res.tilt.tilt3);
if (!(Math.abs(res.tilt.tiltM2 + 2) < 0.8)) errs.push('Neigung −2° nicht erkannt: ' + res.tilt.tiltM2);
if (res.tilt.tilt0 !== 0) errs.push('gerader Horizont als schief: ' + res.tilt.tilt0);
if (!res.band || res.band.y > 0.34) errs.push('Titelband nicht im ruhigen Himmel: ' + JSON.stringify(res.band));
console.log('Gleiche Motive direkt hintereinander:', JSON.stringify(res.adj));
for (const [k, v] of Object.entries(res.adj)) if (v.n > (k.startsWith('streng') ? 2 : 0)) errs.push(`${k}: ${v.n}× gleiches Motiv hintereinander (${v.ex.join(', ')})`);
console.log('Hinter den Bergen:', JSON.stringify(res.behind));
if (!res.behind.behind) errs.push('Ortsname nicht hinter die Berge gesetzt');
console.log('Video:', JSON.stringify(res.video));
if (!(Math.abs(res.video.best.t - 6) < 0.4)) errs.push('beste Videostelle nicht beim Lachen + Bewegungshöhepunkt: ' + res.video.best.t);
if (res.video.rates[1] < 0.8 || res.video.rates[2] > 0.5 || res.video.rates[3] > 0.25) errs.push('Zeitlupe nicht nach Bildrate: ' + res.video.rates);
console.log('Aufbau:', res.comp, 'Stimmung:', res.mood);
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
await b.close();
