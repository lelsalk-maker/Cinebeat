// Reisefilm (Gesamtfilm aus allen Orten) und lange Filme: so lang wie der Song, genug Aufnahmen je Menge,
// jeder Ort mit seinem Anteil, Rückblick-Finale (stärkstes Bild jedes Orts in Reisereihenfolge, auf den Schlägen),
// alles stimmig zum Song; Reels bei „Ganzer Song“ bis 3 min, bei „Auto“ bis 90 s.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeLongSong } from './wav.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
makeLongSong(`${OUT}/reise.wav`, { dur: 215 });
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async (b64) => {
  const f = [], info = {};
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const an = await analyzeAudio(await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer));
  const base = demoScenes(), T0 = new Date(2026, 4, 3, 8, 0).getTime();
  const mk = (n, nv, day0, pre) => { const m = []; for (let i = 0; i < n; i++) { const c = base[i % base.length]; m.push({ id: pre + i, kind: 'image', name: 'I' + i, canvas: c, w: 4032, h: 3024, time: T0 + day0 * 86400e3 + i * 6 * 60000, ...scoreImage(c, c.width, c.height), score: 0.35 + ((i * 37 + day0 * 11) % 55) / 100, hash: [i * 7919 + day0, i * 104729] }); } for (let k = 0; k < nv; k++) m.push({ id: pre + 'v' + k, kind: 'video', name: 'V', w: 1920, h: 1080, duration: 12, time: T0 + day0 * 86400e3 + k * 50 * 60000 + 9000, score: 0.62, sharp: 0.6, color: 0.5, motion: 0.05, luma: 0.45, avg: [120, 120, 110], highlights: [{ t: 5, score: 0.7 }], hits: [[3, 1]], hash: [k * 31 + day0, k * 77], focus: [0.5, 0.45] }); return m; };
  const shown = (plan) => { const s = new Set(); for (const c of plan.clips) { if (c.loop || ['rush', 'recap', 'leader', 'rew', 'tease', 'reveal'].includes(c.role)) continue; for (const id of c.split ? c.split.ids : c.stack ? c.stack.ids : c.grid && c.grid.ids ? c.grid.ids : [c.mediaId]) if (id) s.add(id); } return s; };
  // ungleich viele Aufnahmen je Ort (auch ein kleiner Ort bekommt seinen Platz)
  const sizes = [70, 25, 90, 12, 60];
  const chapters = ['Porto', 'Coimbra', 'Lissabon', 'Sintra', 'Algarve'].map((t, k) => ({ title: t, media: mk(sizes[k], 3, k * 2, 'c' + k + '_') }));
  const all = chapters.flatMap((c) => c.media);
  const songLen = an.lastSound - an.firstSound;
  let prev = 0;
  for (const menge of ['auto', 'mehr', 'max']) {
    const st = { format: '16:9', look: 'auto', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 3, title: 'Portugal', menge };
    const plan = buildPlan({ an, media: all, settings: st, overrides: { texts: [], stickers: [] }, chapters });
    const sh = shown(plan);
    const iss = planAudit(plan, all, an).concat(planSyncAudit(plan, an));
    for (const it of iss.slice(0, 5)) f.push(`${menge} @${it.t}s ${it.msg}`);
    if (plan.duration < songLen - 3) f.push(`${menge}: Film ${plan.duration.toFixed(0)} s kürzer als der Song (${songLen.toFixed(0)} s)`);
    if (plan._m.short) f.push(`${menge}: ${plan._m.short} Aufnahmen unter dem Ziel`);
    if (sh.size <= prev) f.push(`${menge}: nicht mehr Aufnahmen als die Stufe davor`);
    if (menge === 'max' && sh.size < all.length) f.push(`max: nur ${sh.size}/${all.length}`);
    prev = sh.size;
    // jeder Ort mit Anteil (auch der kleinste), Kapitel in Reisereihenfolge
    const ch = plan.clips.filter((c) => c.chapter);
    if (ch.map((c) => c.chapter).join() !== chapters.map((c) => c.title).join()) f.push(`${menge}: Kapitel fehlen/Reihenfolge`);
    const per = chapters.map((c) => c.media.filter((m) => sh.has(m.id)).length);
    if (per.some((n) => n < 5)) f.push(`${menge}: ein Ort kaum zu sehen ${per}`);
    // Rückblick: je Ort ein Bild, in Reisereihenfolge, jeder Schnitt auf einem Schlag
    const rc = plan.clips.filter((c) => c.recap);
    const order = rc.map((c) => chapters.findIndex((x) => x.media.some((m) => m.id === c.mediaId)));
    if (rc.length < chapters.length || order.some((o, k) => k && o < order[k - 1]) || new Set(order).size < chapters.length) f.push(`${menge}: Rückblick ${order}`);
    const bts = Array.from(an.beats).map((x) => x - plan.win.start);
    if (rc.some((c) => !bts.some((x) => Math.abs(x - c.start) < 0.02))) f.push(`${menge}: Rückblick neben dem Schlag`);
    info[menge] = { D: +plan.duration.toFixed(0), shown: sh.size, per: per.join('/'), recap: rc.length };
  }
  // Reels: „Ganzer Song“ bis 3 min, „Auto“ bis 90 s
  const media = mk(200, 10, 0, 'r');
  for (const [len, lo, hi] of [['full', 170, 180.5], ['auto', 60, 90.5]]) {
    const plan = buildPlan({ an, media, settings: { format: '9:16', target: 'reel', look: 'auto', pace: 'auto', intro: 'auto', outro: 'auto', length: len, songStart: 'auto', frame: 'auto', seed: 3, title: 'Porto' }, overrides: { texts: [], stickers: [] } });
    if (!(plan.duration >= lo && plan.duration <= hi)) f.push(`Reel ${len}: ${plan.duration.toFixed(0)} s`);
    info['reel-' + len] = +plan.duration.toFixed(0);
  }
  return { f, info };
}, readFileSync(`${OUT}/reise.wav`).toString('base64'));
if (process.argv.includes('-v')) console.log(JSON.stringify(r.info));
console.log(r.f.length ? 'FAIL ' + r.f.length + '\n' + r.f.join('\n') : 'OK reisefilm');
await b.close();
process.exit(r.f.length ? 1 : 0);
