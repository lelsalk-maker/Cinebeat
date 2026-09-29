// Kino-Rollladen: sechs Ausschnitte der stärksten Aufnahmen im Kinoband, alle erst schwarzweiß, dann in derselben
// Folge farbig, drei Züge des Rollladens, kurz Schwarz, Ortsname mit Koordinaten auf Schwarz, dann öffnet sich das
// Bild – jeder Schritt auf den Schlägen, der Song läuft von Anfang an unverändert, kein zweites Mal der Ort unten links.
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
  // die stärksten, die stärkste vorn (nicht chronologisch)
  const str = (m) => (m.score || 0.5) + (m.fav ? 0.25 : 0);
  const best = media.slice().sort((a, c) => str(c) - str(a));
  if (sp.ids[0] !== best[0].id) fails.push('stärkstes Bild nicht vorn');
  // (Beinahe-Doppel werden übersprungen: die sechs stammen aus dem oberen Drittel)
  // (Beinahe-Doppel übersprungen: kein nicht gewähltes Bild, das kein Doppel eines gewählten ist, darf stärker sein)
  const twin = (a, c) => a.hash && c.hash && hamming(a.hash, c.hash) < 10;
  const picked = sp.ids.map((id) => byId.get(id)), weakest = Math.min(...picked.map(str));
  const better = media.filter((m) => !sp.ids.includes(m.id) && str(m) > weakest + 1e-9 && !picked.some((q) => twin(q, m)));
  if (better.length) fails.push('nicht die stärksten Aufnahmen: ' + better.map((m) => m.id).join(','));
  // alle sechs Felder gleich schnell (synchron im halben Takt), mindestens vier in den ersten 1,5 s
  const gaps = sp.reveal.slice(1).map((x, k) => x - sp.reveal[k]);
  if (Math.max(...gaps) - Math.min(...gaps) > 0.03) fails.push('Felder nicht gleichmäßig: ' + gaps.map((x) => x.toFixed(3)));
  if (sp.reveal.filter((x) => x < 1.5).length < 4) fails.push('erste Felder nicht schnell: ' + sp.reveal.map((x) => x.toFixed(2)));
  const hk = hookScore(plan, media, an);
  out.hook = hk.score; out.hookParts = hk.parts.map((q) => q.k + ':' + q.v.toFixed(2)).join(' ');
  if (hk.score < 75) fails.push('Hook-Wertung ' + hk.score);
  const beats = Array.from(an.beats).map((x) => x - plan.win.start);
  const onBeat = (t) => beats.some((x) => Math.abs(x - t) < 0.02);
  const halfBeat = (t) => beats.some((x, i) => beats[i + 1] != null && Math.abs((x + beats[i + 1]) / 2 - t) < 0.02);
  if (!sp.reveal.slice(1).every((x) => onBeat(x) || halfBeat(x)) || sp.reveal.some((x, k) => k && x <= sp.reveal[k - 1])) fails.push('Felder nicht nacheinander im Takt');
  const mv = sp.shutter.moves;
  // alle Felder erst schwarzweiß, dann in derselben Folge farbig – jeder Farbwechsel auf Schlag/halbem Schlag
  if (sp.colorAt.length !== 6 || !sp.colorAt.every((x) => onBeat(x) || halfBeat(x)) || sp.colorAt.some((x, k) => x <= sp.reveal[k] || (k && x <= sp.colorAt[k - 1]))) fails.push('Farbe nicht nacheinander im Takt');
  // drei Züge, jeder auf einem Schlag, je ein Drittel
  if (mv.length !== 3 || !mv.every((m) => onBeat(m.t)) || Math.abs(mv[2].to - 1) > 1e-6) fails.push('Rollladen: nicht drei Züge auf den Schlägen');
  const sh = plan.overlays.find((o) => o.type === 'shutter'), city = plan.overlays.find((o) => o.type === 'city');
  if (!sh || !city) fails.push('Rollladen/Titel fehlt');
  // nach dem dritten Zug kurz Schwarz, dann auf dem Schlag Ortsname; er steht auf Schwarz und geht mit dem Öffnen
  if (city && !(city.start > sp.shutter.closedAt + 0.1 && onBeat(city.start) && city.end > sh.open && city.end <= sh.open + an.beatPeriod * shutterStep(an) + 0.02)) fails.push('Titel nicht auf Schwarz bis zum Öffnen');
  // kein zweites Mal der Ort unten links (Kapitel/Unterzeile)
  if (plan.overlays.some((o) => (o.type === 'chapter' || o.type === 'lower') && o.start < sh.end + 6)) fails.push('Ortsname nach dem Öffnen noch einmal');
  const pulls = plan.sfx.filter((x) => x.kind === 'pull');
  if (pulls.length || !plan.sfx.some((x) => x.kind === 'projector')) fails.push('Rollladen soll still schließen');
  // Ortsname: nach dem Ausschreiben lange genug lesbar (auf Schwarz, bis zum Öffnen)
  if (city && city.end - city.start < Math.min(titleReadTime(city, an.beatPeriod), city.cap - city.start) - 0.01) fails.push('Ortsname zu kurz lesbar');
  out.titleHold = city ? +(city.end - city.start).toFixed(2) : null;
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
  out.times = { reveal: sp.reveal.map((x) => +x.toFixed(2)), color: sp.colorAt.map((x) => +x.toFixed(2)), pulls: mv.map((m) => +m.t.toFixed(2)), black: +sh.start.toFixed(2), open: +sh.open.toFixed(2), entry: +sh.end.toFixed(2), D: +plan.duration.toFixed(1) };

  // Bild: Pixel je Phase
  const W = 180, H = 320;
  const eng = new Engine(document.getElementById('c'));
  eng.setProject({ plan, media, audioBuffer: buf, size: { w: W, h: H } });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const shot = async (t) => { await eng.renderStill(t); eng.drawAt(t, 'still'); cx.drawImage(eng.canvas, 0, 0, W, H); return cx.getImageData(0, 0, W, H).data; };
  const stat = (d, y0, y1, x0 = 0, x1 = 1) => { let L = 0, C = 0, n = 0; for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y += 2) for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x += 2) { const i = (y * W + x) * 4, r = d[i], g = d[i + 1], bb = d[i + 2]; L += (r + g + bb) / 3; C += Math.max(r, g, bb) - Math.min(r, g, bb); n++; } return { L: L / n, C: C / n }; };
  // Kinoband: 2,39 : 1 in der Mitte
  const bh = Math.min(H * 0.9, W / 2.39) / H, b0 = (1 - bh) / 2, b1 = b0 + bh;
  const bw = await shot(Math.min(sp.reveal[5] + 0.35, sp.colorAt[0] - 0.03)), col = await shot(sp.colorAt[5] + 0.3);
  const sFirst = stat(bw, b0 + 0.01, b1 - 0.01, 0.01, 0.15), sBw = stat(bw, b0 + 0.01, b1 - 0.01, 0.01, 0.99), sCol = stat(col, b0 + 0.01, b1 - 0.01, 0.01, 0.99);
  const outside = stat(bw, 0, b0 - 0.02).L + stat(bw, b1 + 0.02, 1).L;
  out.bw = sBw; out.col = sCol; out.first = sFirst; out.outside = +outside.toFixed(1);
  if (outside / 2 > 6) fails.push('Felder nicht nur im Band');
  if (!(sBw.C < 8 && sBw.L > 20)) fails.push(`nicht alle Felder erst schwarzweiß (${sBw.C.toFixed(1)})`);
  if (!(sCol.C > 25)) fails.push(`keine Farbe (${sCol.C.toFixed(1)})`);
  // Bewegung: zwei Bilder desselben Felds kurz nacheinander unterscheiden sich
  const m1 = await shot(sp.reveal[1] + 0.8), m2 = await shot(sp.reveal[1] + 1.3);
  let diff = 0, cnt = 0; for (let y = Math.floor((b0 + 0.02) * H); y < Math.floor((b1 - 0.02) * H); y += 2) for (let x = Math.floor(W / 6) + 2; x < Math.floor(W / 3) - 2; x += 2) { const i = (y * W + x) * 4; diff += Math.abs(m1[i] - m2[i]); cnt++; }
  out.motion = +(diff / cnt).toFixed(2);
  if (out.motion < 1.5) fails.push('keine Bewegung im Feld');
  // nach jedem Zug: oben und unten ein weiteres Sechstel des Bands schwarz, die Mitte noch Bild; nach dem dritten schwarz
  const six = bh / 6;
  const p1 = await shot(mv[0].t + mv[0].dur + 0.05), p2 = await shot(mv[1].t + mv[1].dur + 0.05);
  out.p1 = [stat(p1, b0 + 0.005, b0 + six - 0.01).L, stat(p1, b1 - six + 0.01, b1 - 0.005).L, stat(p1, b0 + six + 0.02, b1 - six - 0.02).L].map((x) => +x.toFixed(1));
  out.p2 = [stat(p2, b0 + six + 0.005, b0 + 2 * six - 0.01).L, stat(p2, b1 - 2 * six + 0.01, b1 - six - 0.005).L, stat(p2, b0 + 2 * six + 0.02, b1 - 2 * six - 0.02).L].map((x) => +x.toFixed(1));
  if (!(out.p1[0] < 8 && out.p1[1] < 8 && out.p1[2] > 25)) fails.push('1. Zug: oben/unten nicht zu');
  if (!(out.p2[0] < 8 && out.p2[1] < 8 && out.p2[2] > 25)) fails.push('2. Zug: oben/unten nicht weiter zu');
  const blk = await shot((sp.shutter.closedAt + (city ? city.start : sh.start)) / 2);
  const title = await shot(city ? Math.min(sh.open - 0.05, city.start + 1.2) : sh.start + 1);
  out.black = +stat(blk, 0, 1).L.toFixed(1);
  if (out.black > 5) fails.push(`nach dem dritten Zug nicht schwarz (${out.black})`);
  out.title = [+stat(title, 0.02, 0.3).L.toFixed(1), +stat(title, 0.35, 0.65).L.toFixed(1)];
  if (!(out.title[0] < 3 && out.title[1] > 2)) fails.push('Titel nicht auf Schwarz');
  const mid = await shot(sh.open + (sh.end - sh.open) * 0.5);
  out.open = [+stat(mid, 0.0, 0.08).L.toFixed(1), +stat(mid, 0.4, 0.6).L.toFixed(1)];
  if (!(out.open[0] < 8 && out.open[1] > 20)) fails.push('Öffnen: Mitte nicht frei oder Rand nicht schwarz');
  // das Öffnen ist farbig (kein zweites Schwarzweiß bis zum Einsatz)
  const opC = await shot(sh.open + (sh.end - sh.open) * 0.6);
  out.openColor = +stat(opC, 0.4, 0.6).C.toFixed(1);
  if (!(out.openColor > 15) || (plan.colorFx || []).some((f) => f.start < sh.end)) fails.push('Öffnen nicht farbig');
  const after = await shot(sh.end + 0.3);
  out.after = [+stat(after, 0.0, 0.1).L.toFixed(1), +stat(after, 0.9, 1).L.toFixed(1)];
  if (!(out.after[0] > 15 && out.after[1] > 15)) fails.push('nach dem Einsatz nicht ganz offen');

  // Ortsname mit Koordinaten und Kilometern: nach dem Erscheinen steht jede Textzeile ruhig (kein Hoch-Runter)
  {
    const trip = { idx: 1, all: false, stops: [{ name: 'Porto', pos: [41.15, -8.61] }, { name: 'Lissabon', pos: [38.7223, -9.1393], legKm: 313 }] };
    const pg = buildPlan({ an, media, settings: { ...S, km: 'total' }, overrides: { texts: [], stickers: [] }, trip });
    const cg = pg.overlays.find((o) => o.type === 'city'), sg = pg.overlays.find((o) => o.type === 'shutter');
    const e2 = new Engine(document.getElementById('c'));
    const W2 = 360, H2 = 640, c2 = document.createElement('canvas'); c2.width = W2; c2.height = H2;
    const x2 = c2.getContext('2d', { willReadFrequently: true });
    e2.setProject({ plan: pg, media, audioBuffer: buf, size: { w: W2, h: H2 } });
    const tops = [];
    for (let t = cg.start + 1.2; t < Math.min(sg.open, cg.end) - 0.9; t += 1 / 30) {
      await e2.renderStill(t); e2.drawAt(t, 'still'); x2.drawImage(e2.canvas, 0, 0, W2, H2);
      const d = x2.getImageData(0, 0, W2, H2).data;
      // Schwerpunkt der Helligkeit je Textzeile (unabhängig vom Ein-/Ausblenden)
      const prof = []; for (let y = 0; y < H2; y++) { let s2 = 0; for (let x = 0; x < W2; x++) s2 += d[(y * W2 + x) * 4]; prof.push(s2 / W2); }
      const lines = []; let y0 = -1;
      for (let y = 0; y <= H2; y++) { const on = y < H2 && prof[y] > 3; if (on && y0 < 0) y0 = y; if (!on && y0 >= 0) { let m = 0, w = 0; for (let k = y0; k < y; k++) { m += k * prof[k]; w += prof[k]; } lines.push(Math.round(m / w)); y0 = -1; } }
      tops.push(lines.join(','));
    }
    // erlaubt: neue Zeile (Kilometer) kommt hinzu; nicht erlaubt: eine Zeile verschiebt sich
    // jede Zeile, die schon steht (Titel, Datum, Koordinaten), bleibt auf ±1 px; die Kilometer kommen darunter hinzu
    const base = tops[0].split(',').map(Number);
    const moved = tops.some((r) => { const x = r.split(',').map(Number); return base.some((b0, i) => x[i] == null || Math.abs(x[i] - b0) > 1); });
    out.geoRows = [tops[0], tops[tops.length - 1]];
    if (moved || !cg.geo) fails.push('Koordinaten/Kilometer bewegen sich: ' + [...new Set(tops)].join(' | '));
    e2.releaseAll && e2.releaseAll();
  }

  // Ton: der Song läuft von Anfang an unverändert, auf dem Einsatz voll
  const au = await eng._renderAudio(22050, true);
  const ch = au.getChannelData(0), sr = au.sampleRate;
  const rms = (a, z) => { let s = 0, n = 0; for (let i = Math.floor(a * sr); i < Math.floor(z * sr); i++) { s += ch[i] * ch[i]; n++; } return Math.sqrt(s / Math.max(1, n)); };
  const wallT = [0.3, mv[0].t - 0.05], fullT = [sh.end + 0.2, sh.end + 2];
  out.audio = { wall: +rms(...wallT).toFixed(4), full: +rms(...fullT).toFixed(4) };
  // Song von Anfang an unverändert (wie mit der Instagram-Musik): kein Dämpfen, kein Lautstärke-Aufbau
  if (!(out.audio.wall > out.audio.full * 0.12)) fails.push('Musik trägt am Anfang nicht');
  if (!(out.audio.full > 0.05)) fails.push('Song auf dem Einsatz nicht voll');
  // gleiches Ergebnis bei jedem Export (fester Zufall)
  const au2 = await eng._renderAudio(22050, true);
  const c2 = au2.getChannelData(0);
  let same = true; for (let i = 0; i < ch.length; i += 97) if (ch[i] !== c2[i]) { same = false; out.diffAt = +(i / sr).toFixed(3); out.diffV = [ch[i], c2[i]]; break; }
  if (!same) fails.push('Ton nicht reproduzierbar');
  return { fails, out };
}, readFileSync(`${OUT}/shutter.wav`).toString('base64'));
console.log(r.fails.length ? 'FAIL ' + r.fails.join('; ') : 'OK shutter');
if (r.fails.length || process.argv.includes('-v')) console.log(JSON.stringify(r.out));
await b.close();
process.exit(r.fails.length ? 1 : 0);
