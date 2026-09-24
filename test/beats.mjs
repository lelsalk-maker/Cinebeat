import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeSong } from './wav.mjs';
import { readFileSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
for (const c of [{ bpm: 128, offset: 0.37 }, { bpm: 92, offset: 0.61 }, { bpm: 140, offset: 0.12 }, { bpm: 110, offset: 1.9, intro: 6 }, { bpm: 75, offset: 0.25 }]) {
  const f = `${OUT}/song_${c.bpm}.wav`;
  const truth = makeSong(f, { ...c, dur: 40 });
  const r = await p.evaluate(async (b64) => {
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const an = await analyzeAudio(await new OfflineAudioContext(1, 1, 44100).decodeAudioData(u.buffer));
    return { bpm: an.bpm, beats: Array.from(an.beats) };
  }, readFileSync(f).toString('base64'));
  const tr = truth.filter((t) => t > (c.intro || 0) + 0.5);
  const errs = tr.map((t) => { let m = 1; for (const u of r.beats) if (Math.abs(u - t) < Math.abs(m)) m = u - t; return m; }).filter((e) => Math.abs(e) < 0.05);
  console.log(`BPM ${c.bpm}: erkannt ${r.bpm.toFixed(2)} | Treffer ${(errs.length / tr.length * 100).toFixed(0)}% | Abweichung ${(errs.reduce((a, b) => a + b, 0) / errs.length * 1000).toFixed(1)} ms`);
}
await b.close();
