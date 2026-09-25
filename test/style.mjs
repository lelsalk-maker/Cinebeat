// Stil-Mittel: Schlagzeug-Erkennung, Schwarzweiß → Farbe, Echo, Polaroid-Stapel, Mini-Rewind, Drift, Parallax, Kapitel-Knockout, Auto-Stil.
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
const res = await p.evaluate(async (b64) => {
  const fails = [];
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const an = await analyzeAudio(await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer));
  // 1. Schlagzeug: im Drop Bassdrum auf den Beats, Snare auf 2 und 4; in der Strophe liegt das Raster auf der Bassdrum
  const drop = an.sections.find((s) => s.label === 'drop'), verse = an.sections.find((s) => s.label === 'verse');
  const inS = (arr, s) => Array.from(arr).filter((t) => t >= s.start && t < s.end);
  const onBeat = (arr) => arr.filter((t) => an.beats.some((x) => Math.abs(x - t) < 0.02)).length;
  const kd = inS(an.kicks, drop), sd = inS(an.snares, drop), kv = inS(an.kicks, verse);
  if (kd.length < 28 || onBeat(kd) < kd.length - 1) fails.push(`Bassdrum im Drop ${kd.length}`);
  if (sd.length < 14 || sd.length > 18) fails.push(`Snare im Drop ${sd.length}`);
  if (kv.length && onBeat(kv) < kv.length) fails.push('Strophe: Raster neben der Bassdrum');
  const base = demoScenes();
  const T0 = Date.UTC(2026, 4, 1, 10);
  const media = []; for (let k = 0; k < 24; k++) { const c = base[k % base.length]; media.push({ id: 'm' + k, kind: 'image', name: 'B' + k, canvas: c, w: c.width, h: c.height, time: T0 + k * 60000, ...scoreImage(c, c.width, c.height), hash: [k * 7919, k * 104729], avg: [(k * 37) % 255, (k * 91) % 255, (k * 53) % 255] }); }
  const S0 = { format: '9:16', look: 'natur', pace: 'auto', intro: 'hook', outro: 'auto', length: 'full', songStart: 'start', frame: 'auto', split: 'off', seed: 5, target: 'reel' };
  const plan = (x) => buildPlan({ an, media, settings: { ...S0, ...x }, overrides: { texts: [], stickers: [] } });
  const out = {};
  // 2. Schwarzweiß → Farbe
  for (const mode of ['drop', 'steps', 'bloom', 'sweep', 'pop']) {
    const pl = plan({ color: mode, echo: 'off', stack: 'off', mini: 'off' });
    const f = pl.colorFx;
    out['color_' + mode] = f.map((x) => `${x.start.toFixed(1)}→${x.hit.toFixed(1)}`).join(' ');
    if (!f.length) { fails.push('Farbmoment fehlt: ' + mode); continue; }
    const secAt = (t) => pl.sections.find((s) => t >= s.start - 0.02 && t < s.end);
    if (!f.every((x) => ['drop', 'chorus'].includes(secAt(x.hit + 0.05).label))) fails.push('Farbe nicht auf dem Drop: ' + mode);
    if (!f.every((x) => x.hit - x.start >= pl.beatDur * 3.5)) fails.push('zu kurz schwarzweiß: ' + mode);
    if (mode === 'steps' && f[0].steps.length !== 3) fails.push('Beat für Beat: ' + f[0].steps.length);
  }
  // 3. Echo, Stapel, Mini-Rewind, Drift, Schlagzeug, Parallax zusammen
  const pa = plan({ color: 'off', echo: 'on', stack: 'on', mini: 'on', drift: 'on', accent: 'kicksnare', parallax: 'on' });
  const echoes = pa.clips.filter((c) => c.echo), stacks = pa.clips.filter((c) => c.stack), minis = pa.clips.filter((c) => c.miniRew), drifts = pa.clips.filter((c) => c.tin && c.tin.type === TR.DRIFT);
  out.all = { echoes: echoes.map((c) => c.start.toFixed(1)), stack: stacks.map((c) => `${c.start.toFixed(1)}-${c.end.toFixed(1)} ${c.stack.ids.length}`), mini: minis.map((c) => c.start.toFixed(2)), drifts: drifts.length, repeats: pa.capacity.repeats, dropped: pa.capacity.droppedIds.length, parallax: pa.parallax, zones: pa.accent && pa.accent.zones.length };
  if (!echoes.length || echoes.some((c) => !['drop', 'chorus'].includes(c.label) || !pa.clips[c.echo.from])) fails.push('Echo');
  if (stacks.length !== 1 || stacks[0].stack.ids.length < 3 || !stacks[0].stack.items || ['drop', 'chorus'].includes(stacks[0].label)) fails.push('Polaroid-Stapel');
  const stackIds = stacks.length ? stacks[0].stack.ids : [];
  if (stackIds.some((id) => pa.clips.some((c) => c.mediaId === id && !c.stack))) fails.push('Stapel-Bild doppelt');
  if (minis.length < 2) fails.push('Mini-Rewind fehlt');
  else {
    const hit = pa.clips[minis[minis.length - 1].i + 1];
    if (!hit.replay || !['drop', 'chorus'].includes(hit.label)) fails.push('Mini-Rewind: Einsatz ohne besten Moment');
  }
  if (!drifts.length || drifts.some((c) => !isCalmLabel(c.label))) fails.push('Drift');
  if (pa.capacity.repeats) fails.push('Doppelungen mit Stil-Mitteln');
  if (!pa.accent || !pa.accent.snare || pa.parallax !== 1) fails.push('Schlagzeug/Parallax');
  // 4. Auto-Stil: sparsam, abgestimmt
  const auto = plan({});
  const r = auto.resolved;
  out.auto = { color: r.color, echo: r.echo, stack: r.stack, mini: r.mini, drift: r.drift, parallax: r.parallax, accent: r.accent, note: auto.notes.find((n) => /^Stil:/.test(n)) };
  const moments = ['echo', 'stack', 'mini'].filter((k) => r[k] === 'on').length + (r.color !== 'off' ? 1 : 0);
  if (moments < 1 || moments > 3) fails.push('Auto-Stil: ' + moments + ' Momente');
  const shortA = buildPlan({ an, media: media.slice(0, 8), settings: { ...S0, length: 15, target: 'story' }, overrides: { texts: [], stickers: [] } }).resolved;
  const mShort = ['echo', 'stack', 'mini'].filter((k) => shortA[k] === 'on').length + (shortA.color !== 'off' ? 1 : 0);
  if (mShort > 1) fails.push('kurzer Film überladen');
  // 5. Kapitel: Zoom durch den Namen jedes Ortes
  const chapters = [{ title: 'Porto', media: media.slice(0, 8) }, { title: 'Lissabon', media: media.slice(8, 16) }, { title: 'Algarve', media: media.slice(16) }];
  const pc = buildPlan({ an, media, chapters, settings: { ...S0, format: '16:9', intro: 'cinema', chapKnock: 'auto', title: 'Portugal' }, overrides: { texts: [], stickers: [] } });
  const kn = pc.overlays.filter((o) => o.type === 'knockout');
  out.chapters = kn.map((o) => `${o.text}@${o.start.toFixed(1)} zoom ${o.zoomStart.toFixed(1)}-${o.end.toFixed(1)}`);
  if (kn.length !== 2) fails.push('Kapitel-Knockout ' + kn.length);
  for (const o of kn) { const c = pc.clips.find((x) => Math.abs(x.start - o.start) < 0.01); if (!c || c.end < o.end + 0.25 || o.zoomStart - o.start < 1.7) fails.push('Kapitel-Einstellung zu kurz'); }
  // 5b. Bilderflut: viele Bilder in einem Takt, immer schneller, dann Ruhe, im Drop wieder schneller
  const pr = plan({ intro: 'rush', color: 'off', echo: 'off', stack: 'off', mini: 'off', length: 'auto', songStart: 'auto', target: 'story' });
  const rc = pr.clips.filter((c) => c.rush);
  const hk = pr.clips[rc.length];
  const bursts = pr.clips.filter((c) => c.burst);
  const lens = rc.map((c) => c.end - c.start);
  out.rush = { n: rc.length, lens: lens.map((x) => x.toFixed(2)).join(' '), hook: hk && `${hk.role} ${(hk.end - hk.start).toFixed(1)} s`, burstAt: bursts.length ? bursts[0].start.toFixed(1) : null, repeats: pr.capacity.repeats };
  if (rc.length < 10) fails.push('Bilderflut zu kurz');
  if (lens[lens.length - 1] > lens[0] - 0.01) fails.push('Bilderflut wird nicht schneller');
  if (!hk || hk.role !== 'hook' || hk.end - hk.start < pr.beatDur * 3.5) fails.push('nach der Flut keine Ruhe');
  if (rc.some((c) => media[c.mediaIndex].kind !== 'image')) fails.push('Video in der Bilderflut');
  if (!pr.beats.some((b) => Math.abs(b - hk.start) < 0.02)) fails.push('stärkstes Bild nicht auf dem Beat');
  if (pr.capacity.repeats) fails.push('Bilderflut zählt als Doppelung');
  for (const pl of [pa, pc, pr, auto]) if (!pl.clips.every((c, i) => c.i === i)) fails.push('Clip-Nummern');

  // 6. Standbilder der Momente (Engine)
  const shots = {};
  const eng = new Engine(document.getElementById('c'));
  const still = async (pl, list, t, name) => {
    eng.setProject({ plan: pl, media: list, audioBuffer: null, size: { w: 360, h: 640 } });
    await eng.renderStill(t);
    shots[name] = eng.canvas.toDataURL('image/png');
  };
  const st0 = stacks[0];
  if (st0) { await still(pa, media, st0.stack.times[1] - 0.12, 'stack_fall'); await still(pa, media, st0.end - 0.1, 'stack_end'); }
  if (echoes[0]) await still(pa, media, echoes[0].start + 0.05, 'echo');
  if (minis[1]) await still(pa, media, minis[1].start + 0.05, 'mini');
  if (drifts[0]) await still(pa, media, drifts[0].start, 'drift');
  for (const mode of ['bloom', 'sweep', 'pop']) {
    const pl = plan({ color: mode, echo: 'off', stack: 'off', mini: 'off' });
    const f = pl.colorFx[0];
    await still(pl, media, mode === 'pop' ? f.hit - 0.5 : f.hit + f.dur * 0.45, 'color_' + mode);
  }
  const plBw = plan({ color: 'drop', echo: 'off', stack: 'off', mini: 'off' });
  await still(plBw, media, plBw.colorFx[0].hit - 0.4, 'color_bw');
  if (rc[9]) await still(pr, media, (rc[9].start + rc[9].end) / 2, 'rush');
  const k0 = kn[0];
  if (k0) { await still(pc, media, k0.start + 1.2, 'chapter_knock'); await still(pc, media, (k0.zoomStart + k0.end) / 2, 'chapter_zoom'); }
  return { out, fails, shots };
}, wav);
const fs = await import('node:fs');
for (const [k, v] of Object.entries(res.shots || {})) fs.writeFileSync(`${OUT}/style_${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
console.log(JSON.stringify(res.out, null, 1));
console.log('Fehler:', res.fails.length ? res.fails.join(' | ') : 'keine');
await b.close();
