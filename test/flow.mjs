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
  // 6. Einstiegs-Elemente im Film: Raster im Refrain, Countdown vor dem Drop (auf den drei Beats davor)
  const pg = buildPlan({ an, media, settings: { ...S0, midGrid: 'on', midCount: 'drop', length: 'full' }, overrides: { texts: [], stickers: [] } });
  const gm = pg.clips.find((c) => c.gridMid);
  const ci = pg.overlays.find((o) => o.type === 'countin');
  if (!gm || !gm.grid || !gm.grid.ids || !pg.clips[gm.i + 1].afterGrid) fails.push('Raster im Film fehlt');
  if (!ci || ci.marks.length !== 3) fails.push('Countdown vor dem Drop fehlt');
  else {
    const bs = pg.beats;
    if (ci.marks.some((m) => !bs.some((x) => Math.abs(x - m) < 0.005))) fails.push('Countdown nicht auf den Beats');
  }
  // 7. Story/Reel und Kapazität: keine Doppelungen, zu viele Aufnahmen werden benannt, Story höchstens 60 s
  const many = [];
  for (let k = 0; k < 70; k++) { const src = base[k % base.length]; many.push({ ...media[k % media.length], id: 'n' + k, time: T0 + k * 30000, hash: [k * 7919, k * 104729], avg: [(k * 37) % 255, (k * 91) % 255, (k * 53) % 255], canvas: src }); }
  const ps = buildPlan({ an, media: many, settings: { ...S0, length: 'auto' }, overrides: { texts: [], stickers: [] } });
  const pReel = buildPlan({ an, media: many, settings: { ...S0, length: 'auto', target: 'reel' }, overrides: { texts: [], stickers: [] } });
  const repOf = (pl) => pl.capacity.repeats;
  if (ps.duration > 60.5) fails.push('Story länger als 60 s');
  if (!ps.capacity.droppedIds.length || !ps.notes.some((n) => /passen nicht mehr/.test(n))) fails.push('zu viele Aufnahmen nicht benannt');
  if (repOf(ps) || repOf(pReel)) fails.push('Doppelungen');
  if (pReel.duration <= ps.duration) fails.push('Reel nicht länger als Story');
  const few = buildPlan({ an, media: media.slice(0, 6), settings: { ...S0, length: 'auto' }, overrides: { texts: [], stickers: [] } });
  if (repOf(few) || few.capacity.droppedIds.length) fails.push('wenig Material: Doppelung oder weggelassen');
  // 8. Videos laufen fast ganz; zu lange werden gemeldet; Ausschnitt wird genutzt
  const vShort = { id: 'vs', kind: 'video', name: 'Kurz', url: '', w: 1080, h: 1920, duration: 5.2, time: T0 + 150000, score: 0.8, highlights: [{ t: 2, score: 1 }], avg: [90, 120, 140], luma: 0.45, motion: 0.01 };
  const vLong = { id: 'vl', kind: 'video', name: 'Lang', url: '', w: 1080, h: 1920, duration: 24, time: T0 + 250000, score: 0.8, highlights: [{ t: 15, score: 1 }], avg: [140, 90, 60], luma: 0.5, motion: 0.08 };
  const pv = buildPlan({ an, media: [...media.slice(0, 8), vShort, vLong], settings: { ...S0, length: 'auto' }, overrides: { texts: [], stickers: [] } });
  const cs = pv.clips.find((c) => c.mediaId === 'vs'), cl = pv.clips.find((c) => c.mediaId === 'vl');
  const played = (c, m) => (c ? Math.min(c.freezeAt != null ? c.freezeAt : c.visEnd, c.visEnd) - c.visStart : 0) * (c ? c.rate || 1 : 1) / m.duration;
  if (!cs || played(cs, vShort) < 0.8) fails.push(`kurzes Video nur ${(played(cs, vShort) * 100).toFixed(0)} % gespielt`);
  if (!pv.capacity.tooLong.some((v) => v.id === 'vl') || !pv.notes.some((n) => /Ausschnitt/.test(n))) fails.push('zu langes Video nicht gemeldet');
  const vTrim = { ...vLong, trim: [10, 17] };
  const pt = buildPlan({ an, media: [...media.slice(0, 8), vShort, vTrim], settings: { ...S0, length: 'auto' }, overrides: { texts: [], stickers: [] } });
  const ct = pt.clips.find((c) => c.mediaId === 'vl');
  if (!ct || ct.srcOffset < 9.99 || srcTimeOf(ct, ct.visEnd - 0.01) > 17.01) fails.push('Ausschnitt nicht eingehalten');
  if (pt.capacity.tooLong.length) fails.push('Ausschnitt gilt noch als zu lang');
  return { story: +ps.duration.toFixed(1), reel: +pReel.duration.toFixed(1), storyDropped: ps.capacity.droppedIds.length, fit: ps.capacity.imgFit, shortPlayed: +(played(cs, vShort) * 100).toFixed(0), trimClip: ct ? [+ct.srcOffset.toFixed(2), +srcTimeOf(ct, ct.visEnd - 0.01).toFixed(2)] : null, midGrid: gm ? +gm.start.toFixed(2) : null, countIn: ci ? ci.marks.map((m) => +m.toFixed(2)) : null, order: ids.join(' '), matches: mc.length, continued: cont, morphs: morphs.map((c) => TR_NAMES[c.tin.type]), ramps: ramps.map((c) => c.rp.map((q) => q[1]).join('→')), pre: preClips.map((c) => c.pre).join(','), notes: plan.notes.filter((n) => /Match/.test(n)), fails };
}, wav);
console.log(JSON.stringify(res, null, 1));
if (!res.matches || res.continued !== res.matches) res.fails.push('Match-Cut-Bewegung');
if (!res.ramps.length) res.fails.push('keine Speed-Ramp');
console.log('Fehler:', res.fails.length ? res.fails.join(', ') : 'keine');
await b.close();
process.exit(res.fails.length ? 1 : 0);
