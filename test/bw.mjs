// Schwarzweiß → Farbe zum Lied: Farbe kommt auf dem stärksten Einsatz zurück (auf einem Schnitt), das Schwarzweiß beginnt
// mit dem Aufbau davor (2–8 Takte, auf Schnitt oder Takt-Eins), läuft über keinen Höhepunkt und gleitet ohne Flackern hinein.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong, makeSong } from './wav.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
const songs = [];
for (const bpm of [96, 124, 140]) { const f = `${OUT}/bw_s${bpm}.wav`; makeStructuredSong(f, { bpm, crash: bpm === 140 }); songs.push(['struktur ' + bpm, readFileSync(f).toString('base64')]); }
makeSong(`${OUT}/bw_flat.wav`, { bpm: 110, dur: 30 });
songs.push(['gleichförmig', readFileSync(`${OUT}/bw_flat.wav`).toString('base64')]);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const res = await p.evaluate(async (songs) => {
  const fails = [], out = {};
  const base = demoScenes(), T0 = Date.UTC(2026, 4, 1, 10);
  const media = [];
  for (let k = 0; k < 24; k++) { const c = base[k % base.length]; media.push({ id: 'm' + k, kind: 'image', name: 'B' + k, canvas: c, w: c.width, h: c.height, time: T0 + k * 60000, ...scoreImage(c, c.width, c.height), hash: [k * 7919, k * 104729], avg: [(k * 37) % 255, (k * 91) % 255, (k * 53) % 255] }); }
  const eng = new Engine(document.getElementById('c'));
  for (const [name, b64] of songs) {
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const an = await analyzeAudio(await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer));
    const flat = name === 'gleichförmig';
    for (const [len, color] of [['full', 'drop'], ['full', 'auto'], [20, 'auto'], ['full', 'strobe'], ['full', 'bloom'], [30, 'drop']]) {
      const S = { format: '9:16', look: 'natur', pace: 'auto', intro: 'hook', outro: 'auto', length: len, songStart: 'auto', frame: 'auto', split: 'off', seed: 7, target: 'reel', color, echo: 'off', stack: 'off', mini: 'off', effekte: 'kreativ' };
      let pl;
      try { pl = buildPlan({ an, media, settings: S, overrides: { texts: [], stickers: [] } }); } catch (e) { fails.push(`${name} ${len}/${color}: ${e.message}`); continue; }
      const key = `${name} ${len}/${color}`;
      const w0 = pl.win.start, bar = pl.beatDur * 4, D = pl.duration;
      const cuts = pl.clips.map((c) => c.start);
      const downs = (an.barStart || []).map((x) => x - w0);
      const onCut = (t) => cuts.some((x) => Math.abs(x - t) < 0.045);
      const onBar = (t) => downs.some((x) => Math.abs(x - t) < 0.045);
      const secs = (an.sections || []).map((x) => ({ ...x, rel: x.start - w0 }));
      const peak = (x) => x && (x.label === 'drop' || x.label === 'chorus');
      const secAt = (t) => secs.find((x) => t >= x.rel - 0.02 && t < x.end - w0);
      out[key] = pl.colorFx.map((f) => `${f.mode} ${f.start.toFixed(2)}→${f.hit.toFixed(2)} (${((f.hit - f.start) / bar).toFixed(1)} T)`).join(', ') || '–';
      // Song mit Drops: bei ausdrücklichem Wunsch muss es einen Farbmoment geben
      const cands = secs.filter((x, k) => peak(x) && !peak(secs[k - 1]) && x.rel > 2 && x.rel < D - bar);
      if (!flat && color !== 'auto' && cands.length && !pl.colorFx.length) fails.push(`${key}: kein Farbmoment trotz Drop`);
      for (const f of pl.colorFx) {
        if (!onCut(f.hit)) fails.push(`${key}: Farbe kommt nicht auf einem Schnitt (${f.hit.toFixed(2)})`);
        const atDrop = cands.some((x) => Math.abs(x.rel - f.hit) < 0.05);
        const atRise = (an.rises || []).some((r) => Math.abs(r.end - w0 - f.hit) < 0.3) || (an.impacts || []).some((x) => Math.abs(x.t - w0 - f.hit) < 0.05);
        if (!atDrop && !atRise && !(color !== 'auto' && onBar(f.hit))) fails.push(`${key}: Farbe nicht auf einem Einsatz (${f.hit.toFixed(2)})`);
        if (flat && color === 'auto') fails.push(`${key}: Farbmoment ohne Drop im Song`);
        if (!(onCut(f.start) || onBar(f.start))) fails.push(`${key}: Schwarzweiß beginnt neben Schnitt und Takt (${f.start.toFixed(2)})`);
        const bars = (f.hit - f.start) / bar;
        // Aufblende: das Schwarzweiß gehört zum Einstieg und endet mit ihm
        // (Aufblende oder Film beginnt im Aufbau: dann reicht ein Takt Schwarzweiß bis zum Einsatz)
        if (!pl.clips.some((c) => c.reveal && c.start <= f.start + 0.05) && bars < (f.start < 0.05 ? 0.9 : 1.9) || bars > 8.1) fails.push(`${key}: Schwarzweiß ${bars.toFixed(1)} Takte`);
        if (cands.some((x) => x.rel > f.start + 0.05 && x.rel < f.hit - 0.05)) fails.push(`${key}: Schwarzweiß läuft über einen Einsatz`);
        if (cands.length && peak(secAt(f.start + 0.05)) && f.start > 0.1) fails.push(`${key}: Schwarzweiß beginnt in einem Höhepunkt`);
        // Aufbau: gibt es einen Riser bis zum Einsatz, beginnt das Schwarzweiß spätestens einen Takt nach seinem Anfang
        const r = (an.rises || []).find((x) => Math.abs(x.end - w0 - f.hit) < 0.3);
        if (r && r.start - w0 > 0 && f.start > r.start - w0 + bar * 1.1 && f.hit - (r.start - w0) <= bar * 8.1) fails.push(`${key}: Schwarzweiß setzt erst spät im Aufbau ein`);
        // stärkster Einsatz: bei einem Farbmoment kein deutlich wuchtigerer Drop im Ausschnitt
        if (pl.colorFx.length === 1 && atDrop) {
          // Wucht = Energiesprung + Steigerung davor (ein Aufbau macht den Einsatz größer)
          const punch = (x) => { const k = secs.indexOf(x); const r = (an.rises || []).find((y) => Math.abs(y.end - x.start) < 0.3); return (x.energy || 0) - ((secs[k - 1] || {}).energy || 0) + (r ? r.gain * 0.6 : 0); };
          const mine = cands.find((x) => Math.abs(x.rel - f.hit) < 0.05);
          if (cands.some((x) => x !== mine && x.rel > f.hit + 0.1 && punch(x) > punch(mine) + 0.12 && x.rel - bar * 2 > 0)) fails.push(`${key}: ein stärkerer Drop bleibt ohne Farbmoment`);
        }
      }
      // Engine: Farbanteil gleitet hinein (kein Sprung außer auf einem Schnitt), bleibt bis zum Einsatz unten, ist danach voll
      eng.setProject({ plan: pl, media, audioBuffer: null, size: { w: 180, h: 320 } });
      for (const f of pl.colorFx) {
        if (f.mode === 'strobe' || f.mode === 'pulse' || f.mode === 'steps') continue;
        const pOf = (t) => { const c = eng.colorState(t, null); return c ? c[1] : 1; };
        let last = pOf(f.start - 1 / 30), jump = 0;
        for (let t = f.start; t < f.hit - 0.02; t += 1 / 30) {
          const v = pOf(t);
          if (v > last + 1e-3) fails.push(`${key}: Farbe kommt vor dem Einsatz zurück (${t.toFixed(2)})`);
          if (!onCut(f.start)) jump = Math.max(jump, last - v);
          last = v;
        }
        if (jump > 0.2) fails.push(`${key}: Farbe springt mitten in der Einstellung weg (${jump.toFixed(2)})`);
        if (pOf(f.hit - 0.05) > 0.02) fails.push(`${key}: vor dem Einsatz nicht schwarzweiß`);
        const after = f.mode === 'drop' ? pOf(f.hit + 0.02) : pOf(f.end + 0.02);
        if (after < 0.99) fails.push(`${key}: nach dem Einsatz nicht wieder farbig (${after.toFixed(2)})`);
      }
    }
  }
  return { out, fails };
}, songs);
console.log(JSON.stringify(res.out, null, 1));
console.log('Fehler:', res.fails.length ? res.fails.join(' | ') : 'keine');
await b.close();
if (res.fails.length) process.exit(1);
