// Alle Aufnahmen im Film, streng chronologisch, Videos verdrängen keine Fotos, bei Bedarf mehrere Videos gleichzeitig.
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
  const fails = [], out = {};
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const an = await analyzeAudio(await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer));
  const base = demoScenes();
  const T0 = Date.UTC(2026, 6, 1, 8);
  let seq = 0;
  // Reisetag: Fotos (quer und hochkant gemischt, dazwischen Serienbilder) und Videos im Wechsel
  const make = (nImg, vids, opt = {}) => {
    const list = [];
    let t = T0;
    const vAt = new Set(vids.map((_, k) => Math.round(((k + 0.5) * nImg) / vids.length)));
    let vk = 0;
    for (let k = 0; k < nImg; k++) {
      if (vAt.has(k) && vk < vids.length) {
        const d = vids[vk++];
        list.push({ id: 'v' + seq++, kind: 'video', name: 'V', url: '', w: opt.vLand ? 1920 : 1080, h: opt.vLand ? 1080 : 1920, duration: d, time: (t += opt.vGap || 240000), score: 0.7, highlights: [{ t: d * 0.5, score: 1 }], avg: [120, 100, 90], luma: 0.45, motion: 0.05 });
      }
      const c = base[k % base.length];
      const land = k % 3 !== 0;
      const burst = k % 7 === 3;
      t += burst ? 4000 : 150000 + (k % 5) * 60000;
      list.push({ id: 'i' + seq++, kind: 'image', name: 'B', canvas: c, w: land ? 4000 : 3000, h: land ? 3000 : 4000, time: t, ...scoreImage(c, c.width, c.height), score: 0.3 + ((k * 37) % 60) / 100, hash: [k * 7919, k * 104729], avg: [(k * 37) % 255, (k * 91) % 255, (k * 53) % 255], dupOf: burst ? 'x' : undefined });
    }
    return list;
  };
  const S0 = { format: '9:16', look: 'natur', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'auto', seed: 4 };
  const plan = (media, st) => buildPlan({ an, media, settings: { ...S0, ...st }, overrides: { texts: [], stickers: [] } });
  // Reihenfolge der Aufnahmen im Film (ohne Vorschau-Rollen wie Countdown, Aufblende, Bilderflut, Rewind)
  const preview = (c) => c.role === 'leader' || c.role === 'reveal' || c.role === 'rew' || c.role === 'tease' || c.role === 'rush' || c.replay || c.loop || c.strip || (c.grid && !c.gridMid);
  const sequence = (pl, media) => {
    const byId = new Map(media.map((m) => [m.id, m]));
    const ids = [];
    for (const c of pl.clips) {
      if (preview(c)) continue;
      const list = c.split ? c.split.ids : c.stack ? c.stack.ids : c.gridMid && c.grid && c.grid.ids ? c.grid.ids.filter((x, k) => k !== c.grid.target) : [c.mediaId];
      for (const id of list) if (id && !ids.includes(id)) ids.push(id);
    }
    return ids.map((id) => byId.get(id)).filter(Boolean);
  };
  const inversions = (seq) => { let n = 0; for (let i = 2; i < seq.length; i++) if (seq[i].time < seq[i - 1].time - 3 * 60000 && seq[i].dupOf == null && seq[i - 1].dupOf == null) n++; return n; };
  const check = (name, media, st, expectAll = true) => {
    const pl = plan(media, st);
    const sq = sequence(pl, media);
    const imgs = media.filter((m) => m.kind === 'image'), vids = media.filter((m) => m.kind === 'video');
    const usedImg = new Set(sq.filter((m) => m.kind === 'image').map((m) => m.id)), usedV = new Set(sq.filter((m) => m.kind === 'video').map((m) => m.id));
    const vT = pl.clips.filter((c) => c.vid || (c.split && c.split.ids.some((id) => id.startsWith('v')))).reduce((a, c) => a + c.end - c.start, 0);
    const minShot = Math.min(...pl.clips.filter((c) => !c.burst && !c.pre && !c.leader && !c.rush && !c.miniRew && !c.reveal).map((c) => c.end - c.start));
    // Songdynamik: ruhige Teile ruhiger geschnitten als Drop/Refrain (Fotos, ohne Videos, Serien und Einstiege)
    const plainC = pl.clips.filter((c) => !c.vid && !c.burst && !c.pre && !c.leader && !c.rush && !c.miniRew && !c.reveal && !c.grid && !c.stack && !c.strip && c.i > 0 && c.i < pl.clips.length - 1);
    const avgOf = (l) => l.reduce((a, c) => a + c.end - c.start, 0) / Math.max(1, l.length);
    const calmC = plainC.filter((c) => ['intro', 'verse', 'break', 'outro'].includes(c.label)), peakC = plainC.filter((c) => c.label === 'drop' || c.label === 'chorus');
    const dyn = calmC.length >= 2 && peakC.length >= 2 ? avgOf(calmC) / avgOf(peakC) : null;
    const burstCalm = pl.clips.filter((c) => c.burst && ['intro', 'verse', 'break', 'outro'].includes(c.label)).length;
    out[name] = { dyn: dyn && +dyn.toFixed(2), calm: +avgOf(calmC).toFixed(2), peak: +avgOf(peakC).toFixed(2), burstCalm, D: +pl.duration.toFixed(1), level: pl._m.level, img: `${usedImg.size}/${imgs.length}`, vid: `${usedV.size}/${vids.length}`, videoShare: +(vT / pl.duration).toFixed(2), inversions: inversions(sq), repeats: pl.capacity.repeats, packed: pl.capacity.packed, minShot: +minShot.toFixed(2), intro: pl.intro };
    if (expectAll && usedImg.size < imgs.length) fails.push(`${name}: ${imgs.length - usedImg.size} Fotos fehlen`);
    if (expectAll && usedV.size < vids.length) fails.push(`${name}: Video fehlt`);
    if (dyn != null && dyn < 1.3) fails.push(`${name}: Songdynamik verloren (ruhig ${avgOf(calmC).toFixed(2)} s / Drop ${avgOf(peakC).toFixed(2)} s)`);
    if (burstCalm) fails.push(`${name}: Foto-Serie im ruhigen Teil`);
    // der erste Schlag eines Drops nach einem ruhigen Teil ist ein Schnitt (kein Video läuft darüber hinweg)
    const hits = (pl.sections || []).filter((x, k, arr) => (x.label === 'drop' || x.label === 'chorus') && arr[k - 1] && arr[k - 1].label !== 'drop' && arr[k - 1].label !== 'chorus' && x.start > 1 && x.start < pl.duration - 1);
    const overrun = hits.filter((h) => pl.clips.some((c) => c.vid && c.start < h.start - 0.05 && c.end > h.start + 0.05));
    out[name].dropOverrun = overrun.length;
    if (overrun.length) out[name].ov = overrun.map((h) => { const c = pl.clips.find((x) => x.vid && x.start < h.start - 0.05 && x.end > h.start + 0.05); const m = media.find((x) => x.id === c.vid); return `drop ${h.start.toFixed(2)} clip ${c.start.toFixed(2)}-${c.end.toFixed(2)} dur ${m.duration} ${c.label}`; }).join('; ');
    if (inversions(sq)) { fails.push(`${name}: nicht chronologisch (${inversions(sq)})`); const at = []; for (let i = 2; i < sq.length; i++) if (sq[i].time < sq[i - 1].time - 3 * 60000 && sq[i].dupOf == null && sq[i - 1].dupOf == null) at.push(`${i}:${sq[i - 1].id}(${sq[i - 1].kind[0]})>${sq[i].id}(${sq[i].kind[0]})`); out[name + '_inv'] = at.join(' ') + ' | ' + sq.slice(0, 8).map((m) => m.id).join(','); }
    if (pl.capacity.repeats) fails.push(`${name}: Doppelungen`);
    if (!pl.clips.every((c, i) => c.i === i)) fails.push(`${name}: Clip-Nummern`);
    return pl;
  };
  const trip = make(40, [8, 12, 6, 15, 9, 20]);
  for (const [name, st] of [['story', { target: 'story' }], ['reel', { target: 'reel' }], ['film', { format: '16:9' }]]) check(name, trip, st);
  // feste, sehr kurze Länge: so viel wie sinnvoll geht, der Rest wird benannt
  const p30 = check('story 30 s', trip, { target: 'story', length: 30 }, false);
  const miss30 = p30.capacity.droppedIds.length;
  if (miss30 > 8 || (miss30 && !p30.notes.some((n) => /passen nicht mehr/.test(n)))) fails.push('story 30 s: zu viel weggelassen oder nicht benannt');
  for (const intro of ['reveal', 'grid', 'countdown', 'rush', 'knockout', 'split', 'city']) check('intro ' + intro, trip, { target: 'reel', intro, title: 'Big Sur' });
  // viele Fotos in einer Story: verdichtet, aber vollständig
  const many = make(110, [7, 10, 5]);
  const pm = check('story 110 Fotos', many, { target: 'story' });
  if (pm.duration > 60.5) fails.push('Story länger als 60 s');
  // viele Videos: die Fotos bleiben alle drin, Videos teilen sich bei Bedarf den Bildschirm
  const vheavy = make(24, [14, 16, 12, 18, 15, 13, 17, 11], { vLand: true, vGap: 60000 });
  const pv = check('story viele Videos', vheavy, { target: 'story' });
  if (pv.clips.filter((c) => c.vid || (c.split && c.split.ids.some((id) => id.startsWith('v')))).reduce((a, c) => a + c.end - c.start, 0) > pv.duration * 0.72) fails.push('Videos verdrängen die Fotos');
  // Beste Auswahl: schwächste Fotos fallen weg, Reihenfolge bleibt
  const pb = check('beste Auswahl', many, { target: 'story', allMedia: 'off' }, false);
  const dropped = pb.capacity.droppedIds.map((id) => many.find((m) => m.id === id)).filter((m) => m.kind === 'image');
  const kept = many.filter((m) => m.kind === 'image' && !pb.capacity.droppedIds.includes(m.id) && !m.dupOf);
  const avg = (l) => l.reduce((a, m) => a + m.score, 0) / Math.max(1, l.length);
  out.bestClips = pb.clips.map((c) => `${c.start.toFixed(1)}-${c.end.toFixed(1)} ${c.label}${c.vid ? ' V' : ''}${c.split ? ' S' : ''}${c.burst ? ' B' : ''} ${c.role}`).join(' | ');
  out.best = { dropped: dropped.length, avgDropped: +avg(dropped).toFixed(2), avgKept: +avg(kept).toFixed(2) };
  if (!dropped.length || avg(dropped) >= avg(kept)) fails.push('Beste Auswahl lässt nicht die schwächsten weg');
  return { out, fails };
}, wav);
console.log(JSON.stringify(res.out, null, 1));
console.log('Fehler:', res.fails.length ? res.fails.join(' | ') : 'keine');
await b.close();
