// Bildinhalt und Regie-Analyse: Horizont, Menschen, Motivbereich, Kameraschwenk in Videos, Szenen, Gesang/Energie im Schnitt.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/struct.wav`, { bpm: 124 });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const wav = readFileSync(`${OUT}/struct.wav`).toString('base64');
const res = await p.evaluate(async (b64) => {
  const fails = [], out = {};
  const cv = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
  // Horizont bei 40 %: Himmel oben, Meer/Land unten
  const land = cv(640, 480, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h * 0.4); g.addColorStop(0, '#6aa7e8'); g.addColorStop(1, '#bfe0ff'); x.fillStyle = g; x.fillRect(0, 0, w, h * 0.4); x.fillStyle = '#284a3a'; x.fillRect(0, h * 0.4, w, h * 0.6); for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(20,40,30,${0.2 + (k % 5) * 0.1})`; x.fillRect((k * 97) % w, h * 0.45 + ((k * 53) % (h * 0.5)), 30, 12); } });
  const sl = scoreImage(land, 640, 480);
  out.landscape = { horizon: sl.horizon, sky: sl.sky, people: sl.people };
  if (sl.horizon == null || Math.abs(sl.horizon - 0.4) > 0.06) fails.push('Horizont nicht erkannt');
  if (!(sl.sky > 0.5)) fails.push('Himmel nicht erkannt');
  // Person rechts im Bild: Hautfarbene Fläche (Gesicht + Arme) vor neutralem Hintergrund
  const pers = cv(480, 640, (x, w, h) => { x.fillStyle = '#7a8088'; x.fillRect(0, 0, w, h); x.fillStyle = '#d9a07e'; x.beginPath(); x.ellipse(w * 0.7, h * 0.3, w * 0.08, h * 0.07, 0, 0, 7); x.fill(); x.fillStyle = '#2b3a55'; x.fillRect(w * 0.6, h * 0.38, w * 0.2, h * 0.35); x.fillStyle = '#d9a07e'; x.fillRect(w * 0.56, h * 0.42, w * 0.04, h * 0.18); });
  const sp = scoreImage(pers, 480, 640);
  out.person = { people: sp.people, focus: sp.focus, subject: sp.subject };
  if (!(sp.people > 0.25) || sp.focus[0] < 0.58) fails.push('Person nicht als Motiv erkannt');
  // Motiv bleibt im Ausschnitt: großes Motiv → kein enger Zoom
  const mo = imageMotion(() => 0.3, { w: 1000, h: 1000, focus: [0.5, 0.5], subject: [0.5, 0.5, 0.9, 0.9] }, 1, 3, 'normal', null, null);
  out.fit = [mo.m.from.s, mo.m.to.s];
  if (Math.max(mo.m.from.s, mo.m.to.s) > 1.07) fails.push('Motiv würde angeschnitten');
  // Kameraschwenk: Inhalt wandert nach links
  const a = new Float32Array(160 * 90), bb = new Float32Array(160 * 90);
  for (let y = 0; y < 90; y++) for (let x = 0; x < 160; x++) { const v = Math.sin(x * 0.3) * 60 + Math.cos(y * 0.25) * 40 + ((x * 7 + y * 13) % 17) * 3; a[y * 160 + x] = v; bb[y * 160 + x] = Math.sin((x + 3) * 0.3) * 60 + Math.cos(y * 0.25) * 40 + (((x + 3) * 7 + y * 13) % 17) * 3; }
  const pan = panShift(a, bb, 160, 90);
  out.pan = pan.map((v) => +v.toFixed(3));
  if (!(pan[0] < 0)) fails.push('Schwenk-Richtung falsch');
  // Szenen: Pause > 45 min oder anderer Ort
  const T = Date.UTC(2026, 6, 1, 9);
  const list = [{ id: 'a', time: T }, { id: 'b', time: T + 5 * 60000 }, { id: 'c', time: T + 90 * 60000 }, { id: 'd', time: T + 95 * 60000, pos: { lat: 50.08, lon: 14.42 } }, { id: 'e', time: T + 100 * 60000, pos: { lat: 50.1, lon: 14.5 } }];
  const sc = sceneStarts(list);
  out.scenes = [...sc];
  if (!sc.has('c') || !sc.has('e') || sc.has('b')) fails.push('Szenen falsch');
  // Plan: neue Szene beginnt auf einem Taktanfang; Gesang/Energie vorhanden
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const an = await analyzeAudio(await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer));
  if (!an.vocal || an.vocal.length !== an.beats.length) fails.push('Gesangskurve fehlt');
  const base = demoScenes();
  const media = [];
  for (let k = 0; k < 24; k++) { const c = base[k % base.length]; media.push({ id: 'm' + k, kind: 'image', name: 'B', canvas: c, w: c.width, h: c.height, time: T + k * 4 * 60000 + (k >= 8 ? 120 * 60000 : 0) + (k >= 16 ? 120 * 60000 : 0), ...scoreImage(c, c.width, c.height), hash: [k * 7919, k], avg: [(k * 37) % 255, (k * 91) % 255, (k * 53) % 255] }); }
  const pl = buildPlan({ an, media, settings: { format: '9:16', look: 'natur', pace: 'auto', intro: 'hook', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'off', seed: 2, target: 'reel' }, overrides: { texts: [], stickers: [] } });
  const bars = pl.beats.filter((_, i) => pl.downs[i]);
  const starts = pl.clips.filter((c) => c.sceneStart);
  out.sceneClips = starts.map((c) => `${c.start.toFixed(2)} ${c.mediaId} ${bars.some((x) => Math.abs(x - c.start) < 0.04) ? 'Takt' : 'neben'} ${c.tin ? TR_NAMES[c.tin.type] : ''}`);
  if (starts.length < 2) fails.push('Szenenwechsel fehlen');
  if (starts.filter((c) => bars.some((x) => Math.abs(x - c.start) < 0.04)).length < starts.length - 1) fails.push('Szenenwechsel nicht auf dem Takt');
  // Zeitleiste: verschobene Aufnahme landet an der neuen Stelle, der Rest bleibt chronologisch
  const set0 = { format: '9:16', look: 'natur', pace: 'auto', intro: 'hook', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'off', seed: 2, target: 'reel' };
  const idxOf = (plan, id) => plan.clips.findIndex((c) => c.mediaId === id || (c.splitIds || []).includes(id));
  const mv = buildPlan({ an, media, settings: set0, overrides: { texts: [], stickers: [], moves: [{ id: 'm20', before: 'm6' }] } });
  out.moved = [idxOf(mv, 'm5'), idxOf(mv, 'm20'), idxOf(mv, 'm6')];
  if (!(idxOf(mv, 'm20') >= 0 && idxOf(mv, 'm20') < idxOf(mv, 'm6') && idxOf(mv, 'm5') <= idxOf(mv, 'm20'))) fails.push('Verschieben wirkt nicht');
  // „Gefällt mir nicht“: nur diese Einstellung ändert sich
  const k = pl.clips.findIndex((c, i) => i > 3 && !c.vid && !c.split && !c.burst && c.motion && c.motion.to);
  const ag = buildPlan({ an, media, settings: set0, overrides: { texts: [], stickers: [], clips: { [k]: { again: 1 } } } });
  const same = (a, b) => JSON.stringify(a.motion) === JSON.stringify(b.motion);
  out.again = { k, changed: !same(pl.clips[k], ag.clips[k]), others: pl.clips.filter((c, i) => i !== k && ag.clips[i] && !same(c, ag.clips[i])).length };
  if (!out.again.changed || out.again.others > 0) fails.push('Gefällt mir nicht ändert falsch');
  // drei Varianten: ruhig hat längere Einstellungen als energisch
  const avg = (v) => { const q = buildPlan({ an, media, settings: { ...set0, variant: v }, overrides: { texts: [], stickers: [] } }); return q.duration / q.clips.length; };
  out.variants = ['ruhig', 'ausgewogen', 'energisch'].map((v) => +avg(v).toFixed(2));
  if (!(out.variants[0] >= out.variants[1] && out.variants[1] > out.variants[2])) fails.push('Varianten unterscheiden sich nicht');
  // selbst aussortieren: Bildschirmfoto und schwarzes Bild nicht im Film, als Favorit schon
  out.autoOut = [autoOut({ kind: 'image', name: 'Screenshot 2026.png' }), autoOut({ kind: 'image', name: 'x', expo: 0.01, luma: 0.03 }), autoOut({ kind: 'image', name: 'x', expo: 0.01, luma: 0.03, fav: true }), autoOut({ kind: 'image', name: 'x', expo: 0.6, luma: 0.5, sharp: 0.5 })];
  if (!out.autoOut[0] || !out.autoOut[1] || out.autoOut[2] || out.autoOut[3]) fails.push('Aussortieren falsch');
  return { out, fails };
}, wav);
console.log(JSON.stringify(res.out, null, 1));
console.log('Fehler:', res.fails.length ? res.fails.join(' | ') : 'keine');
await b.close();
