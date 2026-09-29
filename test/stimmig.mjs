// Stimmigkeit: jeder Schnitt hält die harten Regeln gegenüber dem Song ein – über alle Formate, Längen (auch Reel 90 s),
// Materialmengen und Songtempi. Gibt jede Unstimmigkeit mit Ort und Grund aus.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
const songs = {};
for (const bpm of [96, 124, 150]) { makeStructuredSong(`${OUT}/st${bpm}.wav`, { bpm }); songs[bpm] = readFileSync(`${OUT}/st${bpm}.wav`).toString('base64'); }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async (songs) => {
  const base = demoScenes();
  const variant = (src, f) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.filter = f; x.drawImage(src, 0, 0); return c; };
  const FILTERS = ['none', 'hue-rotate(40deg)', 'hue-rotate(110deg) brightness(0.9)', 'hue-rotate(200deg)', 'brightness(1.15) saturate(1.3)', 'contrast(1.3)', 'hue-rotate(290deg) brightness(0.8)', 'saturate(0.6)'];
  const pics = [];
  for (const f of FILTERS) for (const c of base) pics.push(variant(c, f));
  const T0 = new Date(2026, 4, 3, 9, 0).getTime();
  const mk = (nImg, nVid) => {
    const media = [];
    for (let i = 0; i < nImg; i++) {
      const c = pics[(i * 7) % pics.length];
      // zwei Tage, je Vormittag und Nachmittag
      const t = T0 + Math.floor(i / Math.ceil(nImg / 4)) * 5 * 3600e3 * (i % 2 ? 1 : 1) + (i % Math.ceil(nImg / 4)) * 6 * 60000 + Math.floor(i / Math.ceil(nImg / 2)) * 14 * 3600e3;
      media.push({ id: 'p' + i, kind: 'image', name: 'P' + i, canvas: c, w: i % 5 === 3 ? c.height : c.width, h: i % 5 === 3 ? c.width : c.height, time: t, ...scoreImage(c, c.width, c.height), us: i % 4 === 1 });
    }
    for (let k = 0; k < nVid; k++) {
      const dur = 5 + (k * 3) % 9;
      media.push({ id: 'v' + k, kind: 'video', name: 'V' + k, w: 1920, h: 1080, duration: dur, time: T0 + k * 2.5 * 3600e3 + 90000, score: 0.62, sharp: 0.6, color: 0.5, motion: 0.03 + k * 0.02, luma: 0.45, avg: [120, 120, 110], highlights: [{ t: dur * 0.45, score: 0.7 }], hits: [[dur * 0.3, 1], [dur * 0.62, 0.8]], hash: [k * 31, k * 77], focus: [0.5, 0.45] });
    }
    return media;
  };
  const sets = { wenig: mk(6, 0), mittel: mk(20, 2), viel: mk(60, 5) };
  const CONF = {
    'story-auto': { format: '9:16', target: 'story' }, 'story-15': { format: '9:16', target: 'story', length: 15 }, 'story-30': { format: '9:16', target: 'story', length: 30 },
    'reel-auto': { format: '9:16', target: 'reel' }, 'reel-90': { format: '9:16', target: 'reel', length: 90 },
    beitrag: { format: '4:5' }, film: { format: '16:9' }, energisch: { format: '9:16', variant: 'energisch' }, ruhig: { format: '9:16', variant: 'ruhig' }, musikvideo: { format: '9:16', target: 'reel', mv: 'on' }, 'reel-max': { format: '9:16', target: 'reel', menge: 'max' }, 'story-mehr': { format: '9:16', target: 'story', menge: 'mehr' },
  };
  const S0 = { look: 'auto', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'auto', seed: 7 };
  const res = {}, all = [];
  for (const [bpm, b64] of Object.entries(songs)) {
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const an = await analyzeAudio(await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer));
    for (const [sn, media] of Object.entries(sets)) {
      for (const [cn, x] of Object.entries(CONF)) {
        let plan;
        try { plan = buildPlan({ an, media, settings: { ...S0, ...x }, overrides: { texts: [], stickers: [] } }); } catch (e) { all.push(`${bpm}/${sn}/${cn}: Absturz ${e.message}`); continue; }
        const iss = planAudit(plan, media, an);
        res[`${bpm}/${sn}/${cn}`] = { D: +plan.duration.toFixed(1), n: plan.clips.length, issues: iss.length };
        for (const it of iss) all.push(`${bpm}/${sn}/${cn} @${it.t}s [${it.code}] ${it.msg}`);
      }
    }
  }
  return { res, all };
}, songs);
const byCode = {};
for (const l of r.all) { const c = (l.match(/\[([^\]]+)\]/) || [0, 'x'])[1]; byCode[c] = (byCode[c] || 0) + 1; }
console.log(r.all.length ? `FAIL ${r.all.length} Unstimmigkeiten ${JSON.stringify(byCode)}` : `OK stimmig (${Object.keys(r.res).length} Schnitte geprüft)`);
if (r.all.length) console.log(r.all.slice(0, process.argv.includes('-v') ? 400 : 25).join('\n'));
if (process.argv.includes('-v')) console.log(JSON.stringify(r.res));
await b.close();
process.exit(r.all.length ? 1 : 0);
