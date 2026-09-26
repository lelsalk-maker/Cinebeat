// Ruckler-Detektor: rendert jedes Bild (30 fps) und sucht Sprünge innerhalb einer Einstellung,
// die weder ein Schnitt noch ein gewollter Effekt sind (Bewegungsstopps, Aufblitzen, springende Ebenen).
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
const CONF = JSON.parse(process.env.JCONF || '[["story",{}],["musikvideo",{"mv":"on","variant":"energisch"}],["film",{"format":"16:9","variant":"ruhig"}]]');
const res = await p.evaluate(async ({ b64, CONF }) => {
  const fails = [], out = {};
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer);
  const an = await analyzeAudio(buf);
  const base = demoScenes();
  const media = base.concat(base).map((c, i) => ({ id: 'd' + i, kind: 'image', name: 'B', canvas: c, w: c.width, h: c.height, time: Date.UTC(2026, 4, 10, 9) + i * 240000, ...scoreImage(c, c.width, c.height), hash: [i * 7919, i], avg: [(i * 37) % 255, (i * 91) % 255, (i * 53) % 255] }));
  for (const [name, st] of CONF) {
    const plan = buildPlan({ an, media, settings: { format: '9:16', look: 'natur', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'auto', seed: 5, title: 'Lissabon', subtitle: 'Mai 2026', ...st }, overrides: { texts: [], stickers: [] } });
    const fmt = FORMATS[plan.resolved.format];
    const W = fmt.w > fmt.h ? 256 : 144, H = Math.round(W * fmt.h / fmt.w);
    const eng = new Engine(document.getElementById('c'));
    eng.setProject({ plan, media, audioBuffer: buf, size: { w: W, h: H } });
    const g = document.createElement('canvas'); g.width = 48; g.height = Math.round(48 * H / W);
    const x = g.getContext('2d', { willReadFrequently: true });
    const fps = 30, N = Math.floor(plan.duration * fps);
    const diffs = []; let prev = null;
    for (let n = 0; n < N; n++) {
      const t = (n + 0.5) / fps;
      await eng.renderStill(t);
      x.drawImage(eng.canvas, 0, 0, g.width, g.height);
      const d = x.getImageData(0, 0, g.width, g.height).data;
      const lum = new Float32Array(d.length / 4);
      for (let i = 0; i < lum.length; i++) lum[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
      if (prev) { let s = 0; for (let i = 0; i < lum.length; i++) s += Math.abs(lum[i] - prev[i]); diffs.push(s / lum.length); } else diffs.push(0);
      prev = lum;
    }
    // erwartete Änderungen: Schnitte, Übergänge, Effekte, Farbwechsel, Einblendungen, Echo, Ebenen
    const ev = [];
    for (const c of plan.clips) { ev.push([c.start - (c.tin ? c.tin.dur / 2 : 0) - 0.04, c.start + (c.tin ? c.tin.dur / 2 : 0) + 0.04]); if (c.echo) ev.push([c.start, c.start + c.echo.dur + 0.05]); if (c.freezeAt != null) ev.push([c.freezeAt - 0.05, c.freezeAt + 0.3]); if (c.burst || c.rush || c.miniRew || c.split || c.grid || c.stack || c.strip) ev.push([c.start - 0.05, c.end + 0.05]); }
    for (const f of plan.fx) if (f.type !== 'dim' && f.type !== 'blur') ev.push([f.start - 0.05, Math.min(f.end, f.start + 0.6) + 0.05]); else ev.push([f.end - (f.fadeOut || 0) - 0.05, f.end + 0.05]);
    for (const f of plan.fx) if (f.type === 'mirror' || f.type === 'black' || f.type === 'dim') ev.push([f.end - 0.1, f.end + 0.1]);
    for (const f of plan.fx) if (f.type === 'black') ev.push([f.start - 0.05, f.end + 0.1]);
    for (const f of plan.colorFx || []) { ev.push([f.start - 0.05, f.start + 0.4]); ev.push([f.hit - 0.05, f.hit + (f.dur || 0) + 0.1]); for (const s of f.steps || []) ev.push([s - 0.05, s + 0.12]); }
    for (const o of plan.overlays) { ev.push([o.start - 0.05, o.start + 1.6]); ev.push([o.end - 1.0, o.end + 0.1]); }
    // gewollte Akzente im Takt (Bassdrum-Impuls, pulsierende Mehrfachbelichtung): erlaubt, aber mit begrenzter Stärke
    const zonesB = [];
    if (plan.accent) zonesB.push(...plan.accent.zones);
    for (const c of plan.clips) if (c.layer && c.layer.pulse) zonesB.push([c.start, c.end]);
    const beatAcc = (t) => zonesB.some(([a, z]) => t >= a && t < z) && plan.beats.some((bt) => t - bt >= -0.02 && t - bt < 0.1);
    let accMax = 0;
    for (let n = 1; n < diffs.length; n++) { const t = (n + 0.5) / fps; if (beatAcc(t) && !ev.some(([a, z]) => t >= a && t <= z) && diffs[n] > accMax) { accMax = diffs[n]; out._accT = [name, t, clipIndexAt(plan.clips, t)]; } }
    const expected = (t) => beatAcc(t) || ev.some(([a, z]) => t >= a && t <= z);
    const flagged = [];
    for (let n = 3; n < diffs.length - 3; n++) {
      const t = (n + 0.5) / fps;
      if (expected(t)) continue;
      const loc = [diffs[n - 3], diffs[n - 2], diffs[n - 1], diffs[n + 1], diffs[n + 2], diffs[n + 3]].sort((a, b2) => a - b2);
      const med = (loc[2] + loc[3]) / 2;
      if (diffs[n] > Math.max(1.2, med * 3.2)) flagged.push({ t: +t.toFixed(2), d: +diffs[n].toFixed(2), med: +med.toFixed(2), clip: clipIndexAt(plan.clips, t) });
    }
    // Stillstand mitten in einer Fahrt (Bewegung setzt aus, obwohl die Einstellung weiterläuft)
    const stalls = [];
    for (const c of plan.clips) {
      if (plan.fx.some((f) => f.type === 'black' && f.end > c.start && f.start < c.end)) continue;
      if (c.freezeAt != null || c.split || c.grid || c.stack || c.strip || c.contain) continue;
      const a = Math.ceil((c.start + 0.15) * fps), z = Math.floor((c.end - 0.15) * fps);
      let run = 0;
      for (let n = a; n <= z && n < diffs.length; n++) { if (diffs[n] < 0.02) run++; else run = 0; if (run === 6) stalls.push({ clip: c.i, t: +((n + 0.5) / fps).toFixed(2) }); }
    }
    const inShot = diffs.filter((_, n) => !expected((n + 0.5) / fps));
    out[name] = { N, flagged: flagged.slice(0, 12), nFlag: flagged.length, stalls: stalls.slice(0, 8), accMax: +accMax.toFixed(2), meanMotion: +(inShot.reduce((a, v) => a + v, 0) / Math.max(1, inShot.length)).toFixed(2) };
    if (flagged.length) fails.push(`${name}: ${flagged.length} Sprünge`);
    if (stalls.length) fails.push(`${name}: ${stalls.length} Stillstände`);
    if (accMax > 7) fails.push(`${name}: Akzente im Takt zu hart (${accMax.toFixed(1)})`);
    eng.releaseAll();
  }
  return { out, fails };
}, { b64: wav, CONF });
console.log(JSON.stringify(res.out, null, 1));
console.log('Fehler:', res.fails.length ? res.fails.join(' | ') : 'keine');
await b.close();
