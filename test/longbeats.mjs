// Beat-Genauigkeit über ganze Songs (3 Minuten): jeder Beat, jeder Taktanfang, jeder Schnitt im Plan.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeLongSong } from './wav.mjs';
import { readFileSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const cases = [
  { name: '123.4 BPM, Drift ±1,5 %', bpm: 123.4, drift: 0.015 },
  { name: '97.3 BPM, Drift ±2 %', bpm: 97.3, drift: 0.02, offset: 1.21 },
  { name: '140 BPM konstant', bpm: 140, drift: 0 },
  { name: '84.6 BPM, Drift ±1 %', bpm: 84.6, drift: 0.01, breakBars: [20, 28] },
];
let bad = 0;
for (const c of cases) {
  const f = `${OUT}/long_${c.bpm}.wav`;
  const truth = makeLongSong(f, c);
  truth.brk = c.breakBars || [40, 48];
  const r = await p.evaluate(async ({ b64, truth }) => {
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(u.buffer);
    const t0 = performance.now();
    const an = await analyzeAudio(buf);
    const ms = performance.now() - t0;
    const near = (list, t) => { let m = 9; for (const x of list) if (Math.abs(x - t) < Math.abs(m)) m = x - t; return m; };
    const beats = Array.from(an.beats), bars = an.barStart;
    const be = truth.beats.map((t) => near(beats, t));
    const de = truth.downs.map((t) => near(bars, t));
    // Plan über den ganzen Song: jeder Schnitt auf einem echten Beat?
    const media = demoScenes().map((c2, i) => ({ id: 'd' + i, kind: 'image', name: 'B' + i, canvas: c2, w: c2.width, h: c2.height, time: i, ...scoreImage(c2, c2.width, c2.height) }));
    const plan = buildPlan({ an, media, settings: { format: '9:16', look: 'auto', pace: 'auto', intro: 'hook', outro: 'auto', length: 'full', songStart: 'auto', frame: 'auto', split: 'off', seed: 1 }, overrides: { texts: [], stickers: [] } });
    const ws = plan.win.start;
    const cutErr = plan.clips.slice(1).filter((cl) => !cl.loop).map((cl) => near(truth.beats, cl.start + ws));
    const q = (arr, p2) => { const s = arr.map(Math.abs).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p2 * s.length))]; };
    // Beats mit Schlagzeug (außerhalb des Breaks) müssen auf wenige Millisekunden genau sitzen
    const brk = truth.brk;
    const drumErr = be.filter((_, k) => k < brk[0] * 4 || k >= brk[1] * 4);
    return { drumP95: q(drumErr, 0.95), bpm: an.bpm, ms: Math.round(ms), beatHit: be.filter((e) => Math.abs(e) < 0.025).length / be.length, beatP95: q(be, 0.95), beatLate: q(be.slice(-100), 0.95), barHit: de.filter((e) => Math.abs(e) < 0.03).length / de.length, cuts: cutErr.length, cutMax: q(cutErr, 1), D: plan.duration };
  }, { b64: readFileSync(f).toString('base64'), truth });
  // Schlagzeug-Beats ≤ 10 ms; im Break ohne Schlagzeug (keine scharfen Anschläge) höchstens ein gutes Videobild (45 ms)
  const ok = r.drumP95 < 0.01 && r.beatHit > 0.94 && r.barHit > 0.93 && r.cutMax < 0.045;
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'FEHLER'} ${c.name}: erkannt ${r.bpm.toFixed(2)} | Beats ${(r.beatHit * 100).toFixed(1)} % (Schlagzeug 95 %: ${(r.drumP95 * 1000).toFixed(1)} ms, alle 95 %: ${(r.beatP95 * 1000).toFixed(1)} ms, letzte 100: ${(r.beatLate * 1000).toFixed(1)} ms) | Takte ${(r.barHit * 100).toFixed(1)} % | ${r.cuts} Schnitte, max ${(r.cutMax * 1000).toFixed(1)} ms | Film ${r.D.toFixed(0)} s | Analyse ${r.ms} ms`);
}
await b.close();
process.exit(bad ? 1 : 0);
