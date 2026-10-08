// Dur/Moll: songKey an allen Beat-Studio-Stilen gegen die Wahrheit der Komposition (Moll, Phrygisch = Moll, Dorisch zählt
// nicht). Unsichere Fälle (null) sind erlaubt, falsche nur selten.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const res = await p.evaluate(async () => {
  const out = [];
  for (const style of Object.keys(BEAT_STYLES)) {
    const { buffer, truth } = await renderBeat(beatRecipe(style, {}, { seed: 7, form: 'story' }));
    const d = buffer.getChannelData(0);
    const k = songKey(d, buffer.sampleRate);
    out.push({ style, mode: truth.mode, minor: k.minor, conf: k.conf });
  }
  return out;
});
let right = 0, wrong = 0, open = 0;
const errs = [];
for (const r of res) {
  if (r.mode === 'dorian') continue;
  const want = /minor|phrygian/.test(r.mode);
  if (r.minor == null) open++; else if (r.minor === want) right++; else { wrong++; errs.push(`${r.style} (${r.mode}) als ${r.minor ? 'Moll' : 'Dur'}`); }
}
console.log('Tonart:', res.map((r) => `${r.style}:${r.mode}→${r.minor == null ? '?' : r.minor ? 'moll' : 'dur'}(${r.conf})`).join(' '));
console.log(`richtig ${right}, unsicher ${open}, falsch ${wrong}`);
const fails = [];
if (wrong > 1) fails.push('zu oft falsch: ' + errs.join(', '));
if (right < 6) fails.push('zu selten erkannt: ' + right);
console.log('Fehler:', fails.length ? fails.join(' | ') : 'keine');
await b.close();
// Gesangszeilen: Schnitte nicht mitten ins Wort
{
  const b2 = await chromium.launch();
  const p2 = await b2.newPage();
  await p2.goto('http://127.0.0.1:8124/test/pipeline.html');
  const r = await p2.evaluate(() => {
    const beats = Array.from({ length: 72 }, (_, i) => i * 0.5), bars = beats.filter((_, i) => i % 4 === 0);
    const base = { bpm: 120, beatPeriod: 0.5, beats: Float64Array.from(beats), barStart: Float64Array.from(bars), phrasePhase: 0, energy: beats.map(() => 0.5), sections: [{ start: 0, end: 16, label: 'verse' }, { start: 16, end: 36, label: 'chorus' }], vocal: beats.map(() => 0.6) };
    const lines = [[2, 5.5], [6.5, 10], [12, 15.5], [16.5, 20], [22, 25.5], [26.5, 30]];
    // (auf der Eins eines Takts darf geschnitten werden; dazwischen nicht)
    const inside = (segs) => segs.slice(1).filter((g) => g.start < 16 && Math.abs(g.start / 2 - Math.round(g.start / 2)) > 0.01 && lines.some(([a, e]) => g.start > a + 0.2 && g.start < e - 0.15)).length;
    const win = { start: 0, end: 34 };
    const without = planCuts(base, win, 'mittel', 1, 1);
    const withL = planCuts({ ...base, vocalLines: lines }, win, 'mittel', 1, 1);
    return { without: inside(without), with: inside(withL), n: withL.length, n0: without.length };
  });
  console.log('Schnitte mitten in Gesangszeilen (Strophe): ohne Zeilenwissen', r.without, '/', r.n0, '· mit', r.with, '/', r.n);
  if (r.with > 1) console.log('Fehler: Schnitte mitten ins Wort');
  await b2.close();
}
