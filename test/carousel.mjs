// Karussell-Beitrag: beste Fotos einzeln, dazwischen 3–6-s-Clips im Takt; Song läuft von Clip zu Clip weiter,
// ein Look und ein Farbabgleich; jeder Clip besteht den Stimmigkeits-Prüfer.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/car.wav`, { bpm: 124 });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async (b64) => {
  const fails = [];
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const an = await analyzeAudio(await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer));
  const base = demoScenes();
  const variant = (src, f) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.filter = f; x.drawImage(src, 0, 0); return c; };
  const FILTERS = ['none', 'hue-rotate(40deg)', 'hue-rotate(110deg) brightness(0.9)', 'hue-rotate(200deg)', 'brightness(1.15) saturate(1.3)', 'contrast(1.3)'];
  const pics = [];
  for (const f of FILTERS) for (const c of base) pics.push(variant(c, f));
  const T0 = new Date(2026, 4, 3, 9, 0).getTime();
  const mk = (nImg, nVid) => {
    const media = [];
    for (let i = 0; i < nImg; i++) {
      const c = pics[(i * 7) % pics.length];
      const t = T0 + Math.floor(i / Math.ceil(nImg / 4)) * 6 * 3600e3 + (i % Math.ceil(nImg / 4)) * 5 * 60000;
      media.push({ id: 'p' + i, kind: 'image', name: 'P' + i, canvas: c, w: c.width, h: c.height, time: t, ...scoreImage(c, c.width, c.height), us: i % 4 === 1 });
    }
    for (let k = 0; k < nVid; k++) {
      const dur = 6 + k * 2;
      media.push({ id: 'v' + k, kind: 'video', name: 'V' + k, w: 1080, h: 1920, duration: dur, time: T0 + k * 6 * 3600e3 + 120000, score: 0.62, sharp: 0.6, color: 0.5, motion: 0.05, luma: 0.45, avg: [120, 120, 110], highlights: [{ t: dur * 0.45, score: 0.7 }], hits: [[dur * 0.3, 1], [dur * 0.62, 0.8]], hash: [k * 31, k * 77], focus: [0.5, 0.45] });
    }
    return media;
  };
  const S0 = { look: 'auto', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'auto', seed: 3, format: '4:5' };
  const bars = Array.from(an.barStart);
  const out = {};
  for (const [name, media] of [['viel', mk(40, 3)], ['fotos', mk(24, 0)], ['wenig', mk(5, 1)]]) {
    const byId = new Map(media.map((m) => [m.id, m]));
    const car = planCarousel({ an, media, settings: S0 });
    const sl = car.slides;
    out[name] = sl.map((s) => (s.kind === 'photo' ? s.id : `[${s.ids.join('+')} ${s.start.toFixed(2)}+${s.len.toFixed(2)}]`)).join(' ');
    const n = media.length;
    if (n >= 6 && (sl.length < 6 || sl.length > 10)) fails.push(`${name}: ${sl.length} Slides`);
    if (!sl.length || sl[0].kind !== 'photo') fails.push(`${name}: Titel ist kein Foto`);
    const photos = sl.filter((s) => s.kind === 'photo').map((s) => byId.get(s.id));
    const best = Math.max(...photos.map((m) => m.score || 0));
    // Titel: das stärkste Foto – oder ein als „Wir“ markiertes, das fast so stark ist (Wir bekommen den besonderen Platz)
    if (photos[0] && (photos[0].score || 0) < best - (photos[0].us === true ? 0.2 : 1e-9) && !photos.some((m) => m.fav)) fails.push(`${name}: Titel nicht das stärkste Foto`);
    // nichts doppelt
    const all = sl.flatMap((s) => (s.kind === 'photo' ? [s.id] : s.ids));
    if (new Set(all).size !== all.length) fails.push(`${name}: Aufnahme doppelt`);
    // Clips nie nebeneinander, nie vorn
    for (let i = 1; i < sl.length; i++) if (sl[i].kind === 'clip' && sl[i - 1].kind === 'clip') fails.push(`${name}: Clips nebeneinander`);
    // Tagesblöcke in Folge (ohne Titelbild)
    const seq = sl.slice(1).map((s) => dayBlock(byId.get(s.kind === 'photo' ? s.id : s.ids[0])));
    const order = [...new Set(media.slice().sort((a, b) => a.time - b.time).map(dayBlock))];
    for (let i = 1; i < seq.length; i++) if (order.indexOf(seq[i]) < order.indexOf(seq[i - 1])) fails.push(`${name}: Tagesblöcke vertauscht`);
    // Clips: 3–6 s, auf Takten, Song läuft weiter
    const cl = sl.filter((s) => s.kind === 'clip');
    if (name !== 'wenig' && !cl.length) fails.push(`${name}: keine Clips`);
    for (let k = 0; k < cl.length; k++) {
      const c = cl[k];
      if (c.len < 2.95 || c.len > 6.05) fails.push(`${name}: Clip ${c.len.toFixed(2)} s`);
      if (!bars.some((x) => Math.abs(x - c.start) < 0.02)) fails.push(`${name}: Clip beginnt nicht auf einer Eins`);
      if (k && Math.abs(c.start - (cl[k - 1].start + cl[k - 1].len)) > 0.06 && c.start > cl[k - 1].start) fails.push(`${name}: Song springt zwischen Clips`);
      const plan = carouselClipPlan(c, { an, media, settings: S0, corr: car.corr });
      if (Math.abs(plan.duration - c.len) > 0.08) fails.push(`${name}: Clip-Plan ${plan.duration.toFixed(2)} statt ${c.len.toFixed(2)}`);
      if (Math.abs(plan.win.start - c.start) > 0.03) fails.push(`${name}: Songausschnitt verschoben`);
      const own = new Set(c.ids);
      if (plan.clips.some((x) => media[x.mediaIndex] && !own.has(media[x.mediaIndex].id))) fails.push(`${name}: fremde Aufnahme im Clip`);
      if (c.videoId && !plan.clips.some((x) => x.vid === c.videoId || x.mediaId === c.videoId)) fails.push(`${name}: Video fehlt im Clip`);
      for (const x of plan.clips) { const m = media[x.mediaIndex]; if (m && car.corr.get(m.id) && JSON.stringify(x.corr) !== JSON.stringify(car.corr.get(m.id))) fails.push(`${name}: Farbabgleich nicht gemeinsam`); }
      const iss = planAudit(plan, media, an).filter((i) => i.code !== 'fehlt' && i.code !== 'laenge');
      for (const i of iss) fails.push(`${name}: Clip ${k + 1} ${i.code} ${i.msg}`);
    }
    // Foto-Slide: ruhiger Ausschnitt, ohne Einblendungen
    const ph = carouselPhotoPlan(sl[0], { an, media, settings: S0, corr: car.corr });
    const pc = ph.clips.find((x) => media[x.mediaIndex] && media[x.mediaIndex].id === sl[0].id);
    if (!pc || JSON.stringify(pc.motion.from) !== JSON.stringify(pc.motion.to)) fails.push(`${name}: Foto bewegt sich`);
    if (ph.overlays.length || ph.fx.length) fails.push(`${name}: Foto mit Einblendung`);
    if (!(ph.stillAt >= 0 && ph.stillAt <= ph.duration)) fails.push(`${name}: Standbild-Zeit`);
    if (!car.notes.some((t) => /Karussell/.test(t))) fails.push(`${name}: keine Notiz`);
  }
  return { fails, out };
}, readFileSync(`${OUT}/car.wav`).toString('base64'));
console.log(r.fails.length ? 'FAIL ' + [...new Set(r.fails)].slice(0, 12).join('; ') : 'OK carousel');
if (r.fails.length || process.argv.includes('-v')) console.log(JSON.stringify(r.out, null, 1));
await b.close();
process.exit(r.fails.length ? 1 : 0);
