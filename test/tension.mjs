// Spannungskurve und Akzent-Hierarchie: Anstiege vor dem Drop werden gemessen (nicht aus dem Abschnittsnamen geraten),
// ein flacher Aufbau hetzt den Schnitt nicht, Einsätze und Becken sind Treffer, Schnitte liegen bevorzugt auf harten
// Schlägen, Zoom-Stöße nur auf treffenden Schlägen und im Budget (Schlicht: keine).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const fails = [];
const cases = [['ramp', {}], ['flach', { flatBuild: true }], ['becken', { crash: true }], ['langsam', { bpm: 96 }], ['schnell', { bpm: 150, crash: true }]];
for (const [name, o] of cases) {
  const truth = makeStructuredSong(`${OUT}/tension-${name}.wav`, o);
  const wav = readFileSync(`${OUT}/tension-${name}.wav`).toString('base64');
  const drop1 = truth.bounds.find((x) => x.name === 'drop').t, build = truth.bounds.find((x) => x.name === 'build').t;
  const r = await p.evaluate(async ([b64, drop1, build]) => {
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const an = await analyzeAudio(await new OfflineAudioContext(1, 1, 44100).decodeAudioData(u.buffer));
    const win = { start: 0, end: an.duration };
    // mittlere Einstellungslänge im ersten und im letzten Drittel des Aufbaus
    const lens = (segs, a, z) => { const g = segs.filter((x) => x.end > a + 0.05 && x.start < z - 0.05).map((x) => x.end - x.start); return g.length ? g.reduce((s, v) => s + v, 0) / g.length : 0; };
    const segs = planCuts(an, win, 'mittel', 1, 1);
    const third = (drop1 - build) / 3;
    const early = lens(segs, build, build + third), late = lens(segs, drop1 - third, drop1);
    // Akzente: mittlere Akzentstärke an den Schnitten mit und ohne Akzentwissen
    const accAt = (t) => accentAt(an, t);
    const noAcc = { ...an, accent: undefined, impacts: [] };
    const mean = (sg) => { const v = sg.slice(1).map((x) => accAt(x.start)); return v.reduce((s, x) => s + x, 0) / Math.max(1, v.length); };
    const segs0 = planCuts(noAcc, win, 'mittel', 1, 1);
    return {
      n: an.beats.length, nAcc: an.accent.length, nT: an.tension.length,
      rises: an.rises.map((x) => ({ s: +x.start.toFixed(2), e: +x.end.toFixed(2), g: x.gain })),
      impacts: an.impacts.map((x) => ({ t: +x.t.toFixed(2), crash: x.crash, v: x.v })),
      early: +early.toFixed(2), late: +late.toFixed(2), accCut: +mean(segs).toFixed(3), accCut0: +mean(segs0).toFixed(3),
    };
  }, [wav, drop1, build]);
  const tag = `${name}:`;
  console.log(tag, 'Anstiege', JSON.stringify(r.rises), '· Treffer', r.impacts.map((x) => x.t + (x.crash ? 'B' : '')).join(' '), `· Aufbau ${r.early}→${r.late} s · Akzent an Schnitten ${r.accCut0}→${r.accCut}`);
  if (r.nAcc !== r.n || r.nT !== r.n) fails.push(`${tag} Länge der Akzente`);
  const toDrop = r.rises.find((x) => Math.abs(x.e - drop1) < 0.08);
  if (o.flatBuild) {
    if (r.rises.some((x) => x.e > build && x.s < drop1)) fails.push(`${tag} flacher Aufbau als Anstieg erkannt`);
    if (r.late < r.early * 0.8) fails.push(`${tag} flacher Aufbau gehetzt ${r.early}→${r.late}`);
  } else {
    if (!toDrop) fails.push(`${tag} Anstieg vor dem Drop fehlt`);
    if (!(r.late < r.early * 0.7)) fails.push(`${tag} Schnitt beschleunigt nicht im Anstieg ${r.early}→${r.late}`);
  }
  const hit = r.impacts.find((x) => Math.abs(x.t - drop1) < 0.08);
  if (!hit) fails.push(`${tag} Drop-Einsatz kein Treffer`);
  if (o.crash && !(hit && hit.crash)) fails.push(`${tag} Becken nicht erkannt`);
  if (!o.crash && r.impacts.filter((x) => x.crash).length > 3) fails.push(`${tag} zu viele Becken ohne Becken`);
  if (r.accCut < r.accCut0) fails.push(`${tag} Schnitte nicht auf den harten Schlägen ${r.accCut0}→${r.accCut}`);
}
// Akzente zwischen den Einsen (synkopierte Treffer) ziehen den Schnitt an
{
  const r = await p.evaluate(() => {
    const beats = Array.from({ length: 96 }, (_, i) => i * 0.5), bars = beats.filter((_, i) => i % 4 === 0);
    const hits = beats.map((_, i) => i).filter((i) => i % 8 === 6);
    const accent = Float32Array.from(beats, (_, i) => (hits.includes(i) ? 0.95 : i % 4 === 0 ? 0.5 : 0.3));
    const base = { bpm: 120, beatPeriod: 0.5, beats: Float64Array.from(beats), barStart: Float64Array.from(bars), phrasePhase: 0, energy: beats.map(() => 0.6), sections: [{ start: 0, end: 48, label: 'chorus' }], vocal: beats.map(() => 0) };
    const win = { start: 0, end: 47 };
    const onHit = (segs) => segs.slice(1).filter((g) => hits.some((i) => Math.abs(beats[i] - g.start) < 0.01)).length;
    return { without: onHit(planCuts(base, win, 'mittel', 1, 1)), with: onHit(planCuts({ ...base, accent }, win, 'mittel', 1, 1)), n: hits.length };
  });
  console.log(`Synkopen-Treffer mit Schnitt: ohne Akzente ${r.without}/${r.n} · mit ${r.with}/${r.n}`);
  if (r.with < Math.max(r.without + 3, r.n * 0.5)) fails.push('Akzente ziehen den Schnitt nicht an');
}
// Zoom-Stöße im ganzen Plan: nur auf treffenden Schlägen, im Budget; Schlicht ganz ohne
{
  const wav = readFileSync(`${OUT}/tension-becken.wav`).toString('base64');
  const r = await p.evaluate(async (b64) => {
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const an = await analyzeAudio(await new OfflineAudioContext(1, 1, 44100).decodeAudioData(u.buffer));
    const base = demoScenes(), T0 = Date.UTC(2026, 4, 1, 10);
    const media = []; for (let k = 0; k < 24; k++) { const c = base[k % base.length]; media.push({ id: 'm' + k, kind: 'image', name: 'B' + k, canvas: c, w: c.width, h: c.height, time: T0 + k * 60000, ...scoreImage(c, c.width, c.height), hash: [k * 7919, k * 104729], avg: [(k * 37) % 255, (k * 91) % 255, (k * 53) % 255] }); }
    const S0 = { format: '9:16', look: 'natur', pace: 'auto', intro: 'hook', outro: 'auto', length: 'full', songStart: 'start', frame: 'auto', split: 'off', seed: 5, target: 'reel' };
    const out = {};
    for (const eff of ['schlicht', 'dezent', 'kreativ']) {
      const pl = buildPlan({ an, media, settings: { ...S0, effekte: eff }, overrides: { texts: [], stickers: [] } });
      const pun = pl.fx.filter((f) => (f.type === 'punch' || f.type === 'flash') && !f.tap);
      const weak = pun.filter((f) => f.type === 'punch' && !pl.clips.some((c) => c.sectionChange && Math.abs(c.start - f.start) < 0.02) && accentAt(an, pl.win.start + f.start) < 0.45 && Math.abs(f.start - pl.D) > 1 && f.start > 0.05);
      let crowd = 0; for (const f of pun) if (pun.filter((g) => Math.abs(g.start - f.start) < 5).length > 3) crowd++;
      out[eff] = { punches: pl.fx.filter((f) => f.type === 'punch').length, accent: pl.fx.filter((f) => f.accent).length, weak: weak.map((f) => +f.start.toFixed(2)), crowd };
    }
    return out;
  }, wav);
  console.log('Effekte:', JSON.stringify(r));
  if (r.schlicht.punches) fails.push('Schlicht mit Zoom-Stößen');
  if (r.dezent.weak.length || r.kreativ.weak.length) fails.push('Zoom-Stoß auf schwachem Schlag ' + JSON.stringify([r.dezent.weak, r.kreativ.weak]));
  if (r.dezent.crowd || r.kreativ.crowd) fails.push('Effekt-Budget überschritten');
}
// Beat-Studio: Akzente/Spannung auf die Schläge der Komposition übertragen
{
  const r = await p.evaluate(async () => {
    const out = [];
    for (const style of ['sommer', 'gipfel', 'drift']) {
      if (!BEAT_STYLES[style]) continue;
      const s = await beatSong(beatRecipe(style, {}, { seed: 3, form: 'reel' }));
      out.push({ style, ok: s.an.accent.length === s.an.beats.length && s.an.tension.length === s.an.beats.length, rises: s.an.rises.length, drops: s.an.sections.filter((x) => x.label === 'drop').length });
    }
    return out;
  });
  console.log('Beat-Studio:', JSON.stringify(r));
  if (!r.length || r.some((x) => !x.ok)) fails.push('Beat-Studio: Akzente passen nicht zu den Schlägen');
}
console.log('Fehler:', fails.length ? fails.join(' | ') : 'keine');
await b.close();
process.exit(fails.length ? 1 : 0);
