// Kino-Rollladen: sechs Hochkant-Felder erscheinen (erst schwarzweiß, dann Farbe), drei Züge (unten, oben, ganz) mit
// Geräusch, Schwarz mit Ortstitel, dann öffnet sich das Bild flüssig, der Song baut sich bis zum Einsatz auf.
// Geprüft wird der Plan, das gerenderte Bild (Pixel) und der Ton (Pegel je Abschnitt).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/shutter.wav`, { bpm: 124 });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async (b64) => {
  const fails = [];
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u8.buffer);
  const an = await analyzeAudio(buf);
  const base = demoScenes();
  // farbige Hochkant-Bilder (kräftige Farben, damit Schwarzweiß/Farbe messbar ist)
  const pic = (k, portrait) => { const c = document.createElement('canvas'); c.width = portrait ? 600 : 800; c.height = portrait ? 800 : 600; const x = c.getContext('2d'); x.drawImage(base[k % base.length], 0, 0, c.width, c.height); x.globalCompositeOperation = 'color'; x.fillStyle = `hsl(${(k * 53) % 360},90%,50%)`; x.fillRect(0, 0, c.width, c.height); return c; };
  const T0 = new Date(2026, 4, 3, 9, 0).getTime();
  const media = Array.from({ length: 24 }, (_, i) => { const c = pic(i, i % 3 !== 2); return { id: 'm' + i, kind: 'image', name: 'M' + i, canvas: c, w: c.width, h: c.height, time: T0 + i * 7 * 60000, ...scoreImage(c, c.width, c.height) }; });
  const S = { format: '9:16', look: 'natur', pace: 'auto', intro: 'shutter', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 5, title: 'Lissabon', subtitle: 'Mai 2026' };
  const plan = buildPlan({ an, media, settings: S, overrides: { texts: [], stickers: [] } });
  const out = { intro: plan.intro };
  if (plan.intro !== 'shutter') return { fails: ['Einstieg nicht gewählt: ' + plan.intro], out };
  const wall = plan.clips[0];
  const sp = wall.split;
  if (!sp || sp.orient !== 'wall' || sp.ids.length !== 6) fails.push('Wand mit 6 Feldern fehlt');
  const byId = new Map(media.map((m) => [m.id, m]));
  const port = sp.ids.filter((id) => byId.get(id).h > byId.get(id).w).length;
  if (port < 6) fails.push(`nur ${port} Hochkant-Felder`);
  const beats = Array.from(an.beats).map((x) => x - plan.win.start);
  const onBeat = (t) => beats.some((x) => Math.abs(x - t) < 0.02);
  if (!sp.reveal.slice(1).every(onBeat) || sp.reveal.some((x, k) => k && x <= sp.reveal[k - 1])) fails.push('Felder nicht nacheinander im Takt');
  const mv = sp.shutter.moves;
  if (mv.map((m) => m.side).join() !== 'bottom,top,bottom' || !mv.every((m) => onBeat(m.t))) fails.push('Rollladen-Züge');
  const sh = plan.overlays.find((o) => o.type === 'shutter'), city = plan.overlays.find((o) => o.type === 'city');
  if (!sh || !city) fails.push('Rollladen/Titel fehlt');
  if (city && !(city.start >= sp.shutter.closedAt && city.end > sh.open && city.end < sh.end)) fails.push('Titel nicht auf Schwarz bis ins Öffnen');
  const pulls = plan.sfx.filter((x) => x.kind === 'pull');
  if (pulls.length !== 3 || !plan.sfx.some((x) => x.kind === 'projector')) fails.push('Geräusche');
  // Einsatz: das stärkste Bild auf einer Eins, Song dort voll
  const hook = plan.clips.find((c) => c.role === 'hook');
  const downs = Array.from(an.barStart).map((x) => x - plan.win.start);
  if (!hook || Math.abs(hook.start - sh.end) > 0.05 || !downs.some((x) => Math.abs(x - hook.start) < 0.03)) fails.push('Einsatz nicht auf der Eins');
  const sec = sectionAt(an, plan.win.start + sh.end + 0.05);
  out.entrySection = sec.label;
  if (!['drop', 'chorus'].includes(sec.label)) fails.push('Einsatz nicht auf Refrain/Drop: ' + sec.label);
  const rush = plan.clips.filter((c) => c.rush);
  if (rush.length < 5 || rush[0].start > sh.start + 0.05) fails.push('schnelle Bilder beim Öffnen');
  const iss = planAudit(plan, media, an);
  if (iss.length) fails.push('Stimmigkeit: ' + iss.map((i) => i.code + ' ' + i.msg).join(' | '));
  out.times = { reveal: sp.reveal.map((x) => +x.toFixed(2)), color: +sp.colorAt.toFixed(2), pulls: mv.map((m) => +m.t.toFixed(2)), black: +sh.start.toFixed(2), open: +sh.open.toFixed(2), entry: +sh.end.toFixed(2), D: +plan.duration.toFixed(1) };

  // Bild: Pixel je Phase
  const W = 180, H = 320;
  const eng = new Engine(document.getElementById('c'));
  eng.setProject({ plan, media, audioBuffer: buf, size: { w: W, h: H } });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const shot = async (t) => { await eng.renderStill(t); eng.drawAt(t, 'still'); cx.drawImage(eng.canvas, 0, 0, W, H); return cx.getImageData(0, 0, W, H).data; };
  const stat = (d, y0, y1) => { let L = 0, C = 0, n = 0; for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y += 2) for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4, r = d[i], g = d[i + 1], bb = d[i + 2]; L += (r + g + bb) / 3; C += Math.max(r, g, bb) - Math.min(r, g, bb); n++; } return { L: L / n, C: C / n }; };
  const bw = await shot(sp.reveal[5] + 0.45), col = await shot(sp.colorAt + 0.9);
  const sBw = stat(bw, 0.05, 0.95), sCol = stat(col, 0.05, 0.95);
  out.bw = sBw; out.col = sCol;
  if (!(sBw.C < 6 && sBw.L > 20)) fails.push(`Felder nicht schwarzweiß (${sBw.C.toFixed(1)})`);
  if (!(sCol.C > 25)) fails.push(`keine Farbe (${sCol.C.toFixed(1)})`);
  const p1 = await shot(mv[0].t + mv[0].dur + 0.05), p2 = await shot(mv[1].t + mv[1].dur + 0.05);
  out.p1 = [stat(p1, 0.72, 0.98).L, stat(p1, 0.02, 0.3).L].map((x) => +x.toFixed(1));
  out.p2 = [stat(p2, 0.02, 0.3).L, stat(p2, 0.38, 0.62).L].map((x) => +x.toFixed(1));
  if (!(out.p1[0] < 12 && out.p1[1] > 25)) fails.push('1. Zug: unten nicht zu');
  if (!(out.p2[0] < 12 && out.p2[1] > 25)) fails.push('2. Zug: oben nicht zu');
  const blk = await shot(sp.shutter.closedAt + 0.4);
  const title = await shot(city ? Math.min(sh.open - 0.05, city.start + 1.2) : sh.start + 1);
  out.black = +stat(blk, 0, 1).L.toFixed(1);
  if (out.black > 3) fails.push(`nach dem 3. Zug nicht schwarz (${out.black})`);
  out.title = [+stat(title, 0.02, 0.3).L.toFixed(1), +stat(title, 0.35, 0.65).L.toFixed(1)];
  if (!(out.title[0] < 3 && out.title[1] > 2)) fails.push('Titel nicht auf Schwarz');
  const mid = await shot(sh.open + (sh.end - sh.open) * 0.5);
  out.open = [+stat(mid, 0.0, 0.08).L.toFixed(1), +stat(mid, 0.4, 0.6).L.toFixed(1)];
  if (!(out.open[0] < 8 && out.open[1] > 20)) fails.push('Öffnen: Mitte nicht frei oder Rand nicht schwarz');
  const after = await shot(sh.end + 0.3);
  out.after = [+stat(after, 0.0, 0.1).L.toFixed(1), +stat(after, 0.9, 1).L.toFixed(1)];
  if (!(out.after[0] > 15 && out.after[1] > 15)) fails.push('nach dem Einsatz nicht ganz offen');

  // Ton: still bis zum Öffnen (nur Geräusche), Züge hörbar, Song baut auf, auf dem Einsatz voll
  const au = await eng._renderAudio(22050, true);
  const ch = au.getChannelData(0), sr = au.sampleRate;
  const rms = (a, z) => { let s = 0, n = 0; for (let i = Math.floor(a * sr); i < Math.floor(z * sr); i++) { s += ch[i] * ch[i]; n++; } return Math.sqrt(s / Math.max(1, n)); };
  const u = (sh.end - sh.open) / 6;
  out.audio = { pull: +rms(mv[0].t, mv[0].t + mv[0].dur).toFixed(4), quiet: +rms(sp.shutter.closedAt + 0.3, sh.open - u - 0.05).toFixed(4), rise: +rms(sh.open + 2 * u, sh.open + 3 * u).toFixed(4), full: +rms(sh.end + 0.2, sh.end + 2).toFixed(4) };
  if (!(out.audio.pull > 0.02)) fails.push('Zug nicht hörbar');
  if (!(out.audio.quiet < 0.004)) fails.push('vor dem Öffnen nicht still');
  if (!(out.audio.rise > out.audio.quiet && out.audio.rise < out.audio.full * 0.6)) fails.push('Song baut sich nicht auf');
  if (!(out.audio.full > 0.05)) fails.push('Song auf dem Einsatz nicht voll');
  // gleiches Ergebnis bei jedem Export (fester Zufall)
  const au2 = await eng._renderAudio(22050, true);
  const c2 = au2.getChannelData(0);
  let same = true; for (let i = 0; i < ch.length; i += 97) if (ch[i] !== c2[i]) { same = false; break; }
  if (!same) fails.push('Ton nicht reproduzierbar');
  return { fails, out };
}, readFileSync(`${OUT}/shutter.wav`).toString('base64'));
console.log(r.fails.length ? 'FAIL ' + r.fails.join('; ') : 'OK shutter');
if (r.fails.length || process.argv.includes('-v')) console.log(JSON.stringify(r.out));
await b.close();
process.exit(r.fails.length ? 1 : 0);
