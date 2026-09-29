// Song-Abstimmung überall: jeder Schnitt (planAudit) und jedes andere Ereignis – Effekte, Einblendungen, Farbmomente
// (planSyncAudit) – liegt auf Schlag, halbem Schlag, Bassdrum oder Schnitt; über drei Tempi, alle Einstiege und
// Stil-Mittel. Dazu die Genauigkeit des Beat-Rasters gegen die bekannte Wahrheit der Testsongs.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
const songs = {};
for (const bpm of [96, 124, 150]) { makeStructuredSong(`${OUT}/tk${bpm}.wav`, { bpm }); songs[bpm] = readFileSync(`${OUT}/tk${bpm}.wav`).toString('base64'); }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async (songs) => {
  const all = [], acc = {};
  const base = demoScenes();
  const T0 = new Date(2026, 4, 3, 9, 0).getTime();
  const media = Array.from({ length: 30 }, (_, i) => { const c = base[i % base.length]; return { id: 'p' + i, kind: 'image', name: 'P' + i, canvas: c, w: c.width, h: c.height, time: T0 + i * 9 * 60000, ...scoreImage(c, c.width, c.height), hash: [i * 7919, i * 31], us: i % 5 === 2 }; });
  for (let k = 0; k < 2; k++) media.push({ id: 'v' + k, kind: 'video', name: 'V' + k, w: 1080, h: 1920, duration: 7, time: T0 + k * 2 * 3600e3 + 60000, score: 0.7, sharp: 0.6, color: 0.5, motion: 0.05, luma: 0.45, avg: [120, 120, 110], highlights: [{ t: 3, score: 0.7 }], hits: [[2, 1], [4.5, 0.8]], hash: [k * 31, k * 77], focus: [0.5, 0.45] });
  const S0 = { format: '9:16', look: 'auto', pace: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 3, title: 'Lissabon', subtitle: 'Mai 2026' };
  const CONF = {
    auto: {}, city: { intro: 'city' }, hook: { intro: 'hook' }, rush: { intro: 'rush' }, reveal: { intro: 'reveal' }, countdown: { intro: 'countdown' },
    grid: { intro: 'grid' }, knockout: { intro: 'knockout' }, type: { intro: 'type' }, cinema: { intro: 'cinema' }, shutter: { intro: 'shutter' },
    rewind: { intro: 'hook', pre: 'rewind' }, energisch: { variant: 'energisch', color: 'strobe' }, mv: { mv: 'on', target: 'reel' },
    digicam: { look: 'digicam', color: 'pulse' }, bloom: { color: 'bloom', stack: 'on', echo: 'on' }, film: { format: '16:9', color: 'drop' },
  };
  for (const [bpm, b64] of Object.entries(songs)) {
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const an = await analyzeAudio(await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer));
    // Beat-Raster gegen die Wahrheit (makeStructuredSong: Schläge ab 0,3 s im festen Abstand)
    const B = 60 / +bpm, bt = Array.from(an.beats);
    const err = bt.filter((t) => t > 0.2).map((t) => Math.abs(((t - 0.3) / B - Math.round((t - 0.3) / B)) * B));
    acc[bpm] = { bpm: +an.bpm.toFixed(1), within15: +(err.filter((e) => e <= 0.015).length / err.length * 100).toFixed(1), within25: +(err.filter((e) => e <= 0.025).length / err.length * 100).toFixed(1), max: +(Math.max(...err) * 1000).toFixed(0) };
    for (const [cn, x] of Object.entries(CONF)) {
      let plan;
      try { plan = buildPlan({ an, media, settings: { ...S0, ...x }, overrides: { texts: [], stickers: [] } }); } catch (e) { all.push(`${bpm}/${cn}: Absturz ${e.message}`); continue; }
      for (const it of planAudit(plan, media, an).filter((i) => ['beat', 'drop', 'start', 'schluss'].includes(i.code))) all.push(`${bpm}/${cn} @${it.t}s [${it.code}] ${it.msg}`);
      for (const it of planSyncAudit(plan, an)) all.push(`${bpm}/${cn} @${it.t}s [${it.kind}] ${it.msg}`);
    }
  }
  return { all, acc };
}, songs);
const fails = [...r.all];
for (const [bpm, a] of Object.entries(r.acc)) if (a.within25 < 97 || Math.abs(a.bpm - +bpm) > 1) fails.push(`${bpm} BPM: Raster ${a.within25} % auf ±25 ms (max ${a.max} ms, erkannt ${a.bpm})`);
console.log(fails.length ? `FAIL ${fails.length} Abweichungen` : 'OK takt');
if (fails.length || process.argv.includes('-v')) { console.log(fails.slice(0, 40).join('\n')); console.log(JSON.stringify(r.acc)); }
await b.close();
process.exit(fails.length ? 1 : 0);
