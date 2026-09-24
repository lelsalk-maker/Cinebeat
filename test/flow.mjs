// Planer: bewusste Reihenfolge, Match-Cuts mit durchlaufender Bewegung, Speed-Ramp, Vorspann-Kombinationen.
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
  const base = demoScenes();
  const variant = (src, f) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.filter = f; x.drawImage(src, 0, 0); return c; };
  // Paare mit gleichem Aufbau, aber anderer Farbe (Match-Kandidaten) + Doppel (fast gleich)
  const scenes = [...base, variant(base[1], 'hue-rotate(150deg) brightness(0.85)'), variant(base[4], 'hue-rotate(200deg)'), variant(base[0], 'brightness(1.02)'), variant(base[2], 'hue-rotate(90deg)')];
  const T0 = Date.UTC(2026, 4, 1, 10);
  const media = scenes.map((c, i) => ({ id: 'm' + i, kind: 'image', name: 'B' + i, canvas: c, w: c.width, h: c.height, time: T0 + i * 60000, ...scoreImage(c, c.width, c.height) }));
  const S0 = { format: '9:16', look: 'auto', pace: 'auto', intro: 'hook', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'off', seed: 5 };
  // 1. Reihenfolge: nie zwei Beinahe-Doppel direkt hintereinander, ähnliche Aufbauten rücken zusammen
  const ord = flowOrder(orderChrono(media), true);
  const ids = ord.map((m) => m.id);
  const adj = (a, b2) => Math.abs(ids.indexOf(a) - ids.indexOf(b2)) === 1;
  if (adj('m0', 'm8')) fails.push('Doppel nebeneinander');
  if (ids.length !== media.length || new Set(ids).size !== media.length) fails.push('Reihenfolge verliert Bilder');
  // 2. Match-Cuts
  const plan = buildPlan({ an, media, settings: S0, overrides: { texts: [], stickers: [] } });
  const mc = plan.clips.filter((c) => c.matchCut);
  let cont = 0;
  for (const c of mc) { const pc = plan.clips[c.i - 1]; if (pc.motion && c.motion && Math.abs(pc.motion.to.s - c.motion.from.s) < 1e-6 && Math.abs(pc.motion.to.x - c.motion.from.x) < 1e-6) cont++; }
  const planOff = buildPlan({ an, media, settings: { ...S0, match: 'off' }, overrides: { texts: [], stickers: [] } });
  if (planOff.clips.some((c) => c.matchCut)) fails.push('Match-Cuts trotz aus');
  // 3. Bild aus Bild nie im Drop
  const pm = buildPlan({ an, media, settings: { ...S0, morph: 'on' }, overrides: { texts: [], stickers: [] } });
  const morphs = pm.clips.filter((c) => c.tin && c.tin.type >= 10);
  if (morphs.some((c) => (c.label === 'drop' || c.label === 'chorus') && c.sectionChange)) fails.push('Bild aus Bild im Drop');
  // 4. Speed-Ramp: Tempo-Kurve, Quellzeit steigt stetig und bleibt im Video
  const vid = { id: 'v', kind: 'video', name: 'V', url: '', w: 1280, h: 720, duration: 30, time: T0 + 30000, score: 0.9, fav: true, highlights: [{ t: 10, score: 1 }], avg: [120, 100, 90], luma: 0.4 };
  const pr = buildPlan({ an, media: [...media.slice(0, 5), vid, vid && { ...vid, id: 'v2', time: T0 + 90000 }], settings: { ...S0, ramp: 'drop', length: 30 }, overrides: { texts: [], stickers: [] } });
  const ramps = pr.clips.filter((c) => c.rp);
  for (const c of ramps) {
    let prev = -1;
    for (let t = c.visStart; t <= c.visEnd; t += 0.02) { const st = srcTimeOf(c, t); if (st < prev - 1e-9 || st > 30) fails.push('Ramp-Quellzeit'); prev = st; }
  }
  // 5. Vorspann: Schnitte liegen auf den Beats, Einstieg danach
  const pp = buildPlan({ an, media, settings: { ...S0, pre: 'rewind', intro: 'knockout', title: 'Porto' }, overrides: { texts: [], stickers: [] } });
  const preClips = pp.clips.filter((c) => c.pre);
  const knock = pp.overlays.find((o) => o.type === 'knockout');
  const preEnd = preClips.length ? preClips[preClips.length - 1].end : 0;
  if (!preClips.length || !knock || knock.start < preEnd - 0.01) fails.push('Vorspann vor Knockout');
  return { order: ids.join(' '), matches: mc.length, continued: cont, morphs: morphs.map((c) => TR_NAMES[c.tin.type]), ramps: ramps.map((c) => c.rp.map((q) => q[1]).join('→')), pre: preClips.map((c) => c.pre).join(','), notes: plan.notes.filter((n) => /Match/.test(n)), fails };
}, wav);
console.log(JSON.stringify(res, null, 1));
if (!res.matches || res.continued !== res.matches) res.fails.push('Match-Cut-Bewegung');
if (!res.ramps.length) res.fails.push('keine Speed-Ramp');
console.log('Fehler:', res.fails.length ? res.fails.join(', ') : 'keine');
await b.close();
process.exit(res.fails.length ? 1 : 0);
