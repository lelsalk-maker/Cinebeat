// Einstieg „Welcome to…“: „Welcome to…“ steht von Anfang an; dahinter zehn ähnliche Ausschnitte, erst zügig, dann
// allmählich langsamer; das letzte Video läuft weiter, darunter erscheint der Ortsname in Gelb und wechselt die Schrift
// – jeder Schriftwechsel genau im selben Augenblick wie das Bild dahinter (1:1); schwarze Balken schließen in Zügen auf
// den Schlägen, bis es schwarz ist; auf dem Einsatz (Refrain/Drop, auf der Eins) geht es mit einem Video weiter.
// Dazu der ruhigere Kino-Vorhang: nach dem Ortsnamen öffnet er sich gleichmäßig, dahinter ein Bild je Zählzeit.
// Geprüft: Plan (Zeiten, Medien), Stimmigkeit und das gerenderte Bild (Pixel).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const V = process.argv.includes('-v');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async () => {
  const f = [], out = {};
  const song = await beatSong(beatRecipe('sommer', { intro: 'welcome', format: '9:16', target: 'story' }, { seed: 4 }));
  const an = song.an;
  const rng = mulberry32(99);
  const base = demoScenes();
  const T0 = new Date(2026, 4, 3, 9, 0).getTime();
  // farbige Bilder in vier Looks (warm, kühl, grün, dunkel) – ähnliche sollen zusammen ablaufen
  const looks = [[220, 150, 90], [80, 130, 210], [90, 170, 110], [60, 60, 80]];
  const pic = (k) => { const c = document.createElement('canvas'); c.width = 600; c.height = 800; const x = c.getContext('2d'); x.drawImage(base[k % base.length], 0, 0, 600, 800); const L = looks[k % 4]; x.globalAlpha = 0.45; x.fillStyle = `rgb(${L[0]},${L[1]},${L[2]})`; x.fillRect(0, 0, 600, 800); return c; };
  const imgs = Array.from({ length: 24 }, (_, i) => { const c = pic(i), L = looks[i % 4]; return { id: 'm' + i, kind: 'image', name: 'M' + i, canvas: c, w: c.width, h: c.height, time: T0 + i * 7 * 60000, ...scoreImage(c, c.width, c.height), avg: L.map((v) => Math.round(v * 0.7 + 40 + rng() * 10)), luma: [0.6, 0.45, 0.5, 0.25][i % 4], score: 0.4 + rng() * 0.5, hash: [i * 7919 + 1, i * 104729 + 3] }; });
  const vid = (id, k, d, look) => ({ id, kind: 'video', name: id, w: 1080, h: 1920, duration: d, time: T0 + k * 3600e3, score: 0.7, sharp: 0.6, color: 0.6, motion: 0.12, luma: 0.5, avg: looks[look].map((v) => Math.round(v * 0.7 + 40)), highlights: [{ t: d * 0.4, score: 0.8 }], hits: [], hash: [k * 31 + 7, k * 77 + 9], focus: [0.5, 0.45] });
  const media = [...imgs, vid('v0', 1, 12, 0), vid('v1', 2, 9, 0), vid('v2', 3, 15, 1)];
  const S = { format: '9:16', target: 'story', look: 'auto', pace: 'auto', intro: 'welcome', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 5, title: 'Lissabon' };
  const plan = buildPlan({ an, media, settings: S, overrides: { texts: [], stickers: [] } });
  out.intro = plan.intro;
  if (plan.intro !== 'welcome') return { f: ['Einstieg nicht gewählt: ' + plan.intro], out };
  const byId = new Map(media.map((m) => [m.id, m]));
  const bt = Array.from(an.beats).map((x) => x - plan.win.start);
  const grid = []; for (let i = 0; i + 1 < bt.length; i++) grid.push(bt[i], (bt[i] + bt[i + 1]) / 2);
  const on = (t) => t < 0.01 || grid.some((x) => Math.abs(x - t) < 0.005);
  const ov = plan.overlays.find((o) => o.type === 'welcome');
  const rc = plan.clips.filter((c) => c.rush && c.welcome);
  const A = rc.filter((c) => c.welcome === 'a'), last = rc.find((c) => c.welcome === 'last'), cyc = rc.filter((c) => c.welcome === 'cycle');
  if (!ov || !ov.close || !ov.open) f.push('Einblendung fehlt (oder ohne Vorhang)');
  if (A.length < 4 || !last || !ov || cyc.length !== ov.fonts.length) f.push(`Stücke: ${A.length} Ausschnitte, letztes ${!!last}, ${cyc.length} Wechsel`);
  if (A.length && A[0].start > 0.01) f.push('beginnt nicht sofort');
  // erst zügig, dann allmählich langsamer (das letzte läuft durch das Schließen)
  const dA = A.slice(0, -1).map((c) => c.end - c.start);
  if (dA.some((d, k) => k && d < dA[k - 1] - 0.02) || !(dA[dA.length - 1] > dA[0] * 1.4)) f.push('Ausschnitte werden nicht allmählich langsamer: ' + dA.map((d) => d.toFixed(2)).join(','));
  if (rc.some((c) => !on(c.start))) f.push('Bildwechsel neben dem Schlag');
  // ähnliche Ausschnitte: Farbabstand innerhalb kleiner als im ganzen Material
  const cd = (a, c) => Math.hypot(a.avg[0] - c.avg[0], a.avg[1] - c.avg[1], a.avg[2] - c.avg[2]);
  const mean = (list) => { let s = 0, n = 0; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { s += cd(list[i], list[j]); n++; } return n ? s / n : 0; };
  const aM = A.map((c) => byId.get(c.mediaId)), dIn = mean(aM), dAll = mean(media);
  out.similar = [+dIn.toFixed(1), +dAll.toFixed(1)];
  if (!(dIn < dAll * 0.75)) f.push(`Ausschnitte nicht ähnlich genug (${dIn.toFixed(0)} gegenüber ${dAll.toFixed(0)})`);
  if (new Set(A.map((c) => c.mediaId)).size < A.length - 1) f.push('Ausschnitte wiederholen sich');
  if (ov && ov.close) {
    const [c0, c1] = ov.close, [o0, o1] = ov.open, u = an.beatPeriod * shutterStep(an);
    // Ablauf: „Welcome to…“ → Vorhang zu (weich, ≥ 1,2 s) → Schwarz mit „Welcome to <Ort>“ → Vorhang auf → Wechsel
    if (!(c1 - c0 >= Math.min(1.2, u * 2) - 0.01)) f.push(`Vorhang schließt zu schnell (${(c1 - c0).toFixed(2)} s)`);
    if (Math.abs(ov.nameAt - c1) > 0.01 || !on(c1) || !on(c0)) f.push('Ortsname nicht genau auf dem Schwarz / Vorhang nicht auf den Schlägen');
    if (!(o0 > c1 + 0.1 && o1 > o0 + 0.8 && o1 <= ov.fonts[0] + 0.01)) f.push('Vorhang öffnet nicht nach dem Schwarz, vor den Schriftwechseln');
    if (!last || Math.abs(last.start - c1) > 0.01) f.push('hinter dem Schwarz beginnt kein neues Bild');
    const lm = last && byId.get(last.mediaId);
    if (!lm || lm.kind !== 'video') f.push('beim Öffnen kein laufendes Video');
    // nach dem Lied: das Schwarz liegt auf einem Wendepunkt (Abschnitt, Anstieg) oder einer Takt-Eins
    const rel = (x) => x - plan.win.start;
    const turn = (an.sections || []).some((x) => Math.abs(rel(x.start) - c1) < 0.05) || (an.rises || []).some((x) => Math.abs(rel(x.start) - c1) < 0.05) || Array.from(an.barStart).some((x) => Math.abs(rel(x) - c1) < 0.03);
    if (!turn) f.push('Schwarz nicht auf einem Wendepunkt des Lieds');
  }
  // 1:1: jeder Schriftwechsel ist genau ein Bildwechsel; zum Einsatz hin schneller
  if (ov && cyc.length && (ov.fonts.length !== cyc.length || ov.fonts.some((t, k) => Math.abs(t - cyc[k].start) > 1e-6))) f.push('Schrift- und Bildwechsel nicht 1:1');
  if (ov) {
    const iv = ov.fonts.slice(1).map((t, k) => t - ov.fonts[k]).concat([ov.end - ov.fonts[ov.fonts.length - 1]]);
    if (!(iv[iv.length - 1] < iv[0] * 0.7)) f.push('Schriftwechsel werden zum Einsatz nicht schneller: ' + iv.map((x) => x.toFixed(2)).join(','));
  }
  // Einsatz: ein Video, auf der Eins von Refrain/Drop, direkt nach dem Schwarz
  const hook = plan.clips.find((c) => c.role === 'hook');
  const hm = hook && byId.get(hook.mediaId);
  if (!hook || !hm || hm.kind !== 'video') f.push('auf dem Einsatz kein Video');
  if (hook && ov && Math.abs(hook.start - ov.end) > 0.03) f.push('Einsatz nicht direkt nach dem Einstieg');
  const sec = hook ? sectionAt(an, plan.win.start + hook.start + 0.05) : null;
  out.entry = sec && sec.label;
  if (!sec || !['drop', 'chorus'].includes(sec.label)) f.push('Einsatz nicht auf Refrain/Drop: ' + (sec && sec.label));
  const downs = Array.from(an.barStart).map((x) => x - plan.win.start);
  if (hook && !downs.some((x) => Math.abs(x - hook.start) < 0.03)) f.push('Einsatz nicht auf der Eins');
  // kein zweites Mal der Ort unten
  if (plan.overlays.some((o) => (o.type === 'chapter' || o.type === 'lower' || o.type === 'city') && o.start < (ov ? ov.end : 0) + 6)) f.push('Ortsname danach noch einmal');
  const iss = planAudit(plan, media, an);
  if (iss.length) f.push('Stimmigkeit: ' + iss.slice(0, 3).map((i) => `@${i.t} ${i.code} ${i.msg}`).join(' | '));
  out.times = { a: A.map((c) => +c.start.toFixed(2)), last: last && +last.start.toFixed(2), name: ov && +ov.nameAt.toFixed(2), close: ov && ov.close, open: ov && ov.open, fonts: ov && ov.fonts.map((x) => +x.toFixed(2)), end: ov && +ov.end.toFixed(2), D: +plan.duration.toFixed(1) };

  // Bild (nur Fotos, damit die Engine ohne Videodateien rendert)
  const pi = buildPlan({ an, media: imgs, settings: S, overrides: { texts: [], stickers: [] } });
  const ovi = pi.overlays.find((o) => o.type === 'welcome');
  if (!ovi) f.push('Einblendung (nur Fotos) fehlt');
  else {
    const W = 180, H = 320;
    const eng = new Engine(document.getElementById('c'));
    eng.setProject({ plan: pi, media: imgs, audioBuffer: song.buffer, size: { w: W, h: H } });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const shot = async (t) => { await eng.renderStill(t); eng.drawAt(t, 'still'); cx.drawImage(eng.canvas, 0, 0, W, H); return cx.getImageData(0, 0, W, H).data; };
    const count = (d, y0, y1, test) => { let n = 0; for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (test(d[i], d[i + 1], d[i + 2])) n++; } return n; };
    const meanL = (d) => { let s = 0, n = 0; for (let i = 0; i < d.length; i += 16) { s += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; } return s / n; };
    const white = (r, g, b2) => r > 235 && g > 235 && b2 > 235, yellow = (r, g, b2) => r > 200 && g > 165 && b2 < 90 && r - b2 > 140;
    const s0 = await shot(0.08), sN = await shot(ovi.nameAt + 0.45), sO = await shot(ovi.open[1] + 0.05);
    const tEnd = ovi.end - 0.03, sE = await shot(tEnd), sA = await shot(ovi.end + 0.12);
    // auf dem Schwarz: Hintergrund dunkel, Schrift hell; nach dem Öffnen ist das Bild ganz frei (oben und unten)
    const rowL = (d, y) => { let s2 = 0; for (let x = 0; x < W; x++) { const i = (Math.floor(y * H) * W + x) * 4; s2 += (d[i] + d[i + 1] + d[i + 2]) / 3; } return s2 / W; };
    out.px = { white0: count(s0, 0.35, 0.65, white), yellowName: count(sN, 0.45, 0.65, yellow), blackTop: +rowL(sN, 0.1).toFixed(1), openTop: +rowL(sO, 0.04).toFixed(1), endL: +meanL(sE).toFixed(1), afterL: +meanL(sA).toFixed(1) };
    if (out.px.blackTop > 4) f.push('auf dem Namen nicht schwarz');
    if (out.px.openTop < 15) f.push('Vorhang nach dem Öffnen nicht ganz offen');
    // weich: die Kante des Vorhangs bewegt sich Bild für Bild ohne Sprung (höchstens 2,2× so schnell wie im Mittel)
    const edge = (d) => { for (let y = 0; y < H / 2; y++) { let s2 = 0; for (let x = 0; x < W; x += 3) { const i = (y * W + x) * 4; s2 += d[i] + d[i + 1] + d[i + 2]; } if (s2 / (W / 3) / 3 > 6) return y; } return H / 2; };
    for (const [a0, a1, nm] of [[ovi.close[0], ovi.close[1], 'schließt'], [ovi.open[0], ovi.open[1], 'öffnet']]) {
      const ys = [];
      for (let t = a0; t <= a1 + 1e-6; t += 1 / 30) ys.push(edge(await shot(t)));
      const st = ys.slice(1).map((y, k) => Math.abs(y - ys[k]));
      const avg = (H / 2) / Math.max(1, st.length);
      const mono = ys.every((y, k) => !k || (nm === 'schließt' ? y >= ys[k - 1] - 1 : y <= ys[k - 1] + 1));
      if (!mono || Math.max(...st) > avg * 2.2 + 2) f.push(`Vorhang ${nm} ruckelig (Schritte ${st.join(',')})`);
    }
    // Lage: Ausdehnung und Schwerpunkt der weißen bzw. gelben Schrift
    const box = (d, test) => { let x0 = W, x1 = -1, ys = 0, n = 0; for (let y = Math.floor(0.3 * H); y < Math.floor(0.7 * H); y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (test(d[i], d[i + 1], d[i + 2])) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); ys += y; n++; } } return { x0, x1, cx: (x0 + x1) / 2, cy: n ? ys / n : 0, w: x1 - x0 }; };
    const w0 = box(s0, white), w1 = box(sN, white), y1 = box(sN, yellow);
    out.px.box = { w0: [w0.x0, w0.x1, +w0.cy.toFixed(1)], w1: [w1.x0, w1.x1, +w1.cy.toFixed(1)], y1: [y1.x0, y1.x1, +y1.cy.toFixed(1)] };
    if (Math.abs(w0.cx - W / 2) > 4 || Math.abs(w1.cx - W / 2) > 4 || Math.abs(y1.cx - W / 2) > 4) f.push('Schrift nicht mittig: ' + JSON.stringify(out.px.box));
    if (Math.abs(w0.cy - H / 2) > H * 0.03) f.push('„Welcome to…“ allein nicht in der Mitte');
    if (Math.abs((H / 2 - w1.cy) - (y1.cy - H / 2)) > H * 0.035) f.push('Zeilen nicht symmetrisch um die Mitte');
    if (!(w1.w < w0.w - 3)) f.push('die Punkte nach „Welcome to“ verschwinden nicht');
    if (out.px.white0 < 20) f.push('„Welcome to…“ nicht von Anfang an zu sehen');
    if (out.px.yellowName < 20) f.push('Ortsname nicht gelb zu sehen');
    if (out.px.endL < 25) f.push('vor dem Einsatz kein Bild');
    if (out.px.afterL < 25) f.push('nach dem Schwarz kein Bild');
    // Schriftwechsel sichtbar: kurz vor und kurz nach einem Wechsel unterscheidet sich der gelbe Schriftzug
    const k = 4, ta = ovi.fonts[k] - 0.04, tb = ovi.fonts[k] + 0.04;
    const ya = await shot(ta), yb = await shot(tb);
    let diff = 0; for (let y = Math.floor(0.45 * H); y < Math.floor(0.65 * H); y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (yellow(ya[i], ya[i + 1], ya[i + 2]) !== yellow(yb[i], yb[i + 1], yb[i + 2])) diff++; }
    out.px.fontDiff = diff;
    if (diff < 20) f.push('Schriftwechsel nicht sichtbar');
  }

  // Kino-Vorhang: ruhig gleichmäßig öffnen, ein Bild je Zählzeit
  const ps = buildPlan({ an, media: imgs, settings: { ...S, intro: 'shutter' }, overrides: { texts: [], stickers: [] } });
  const sh = ps.overlays.find((o) => o.type === 'shutter');
  if (!sh || sh.steps || !sh.glide) f.push('Vorhang öffnet nicht gleichmäßig');
  else {
    // langsam: über den Aufbau (≥ 6 Zählzeiten bzw. 2,8 s) bis genau auf den Einsatz; dahinter schnell, ein Bild je
    // Zählzeit, auf den letzten beiden im halben Takt
    const u = an.beatPeriod * shutterStep(an);
    const rs = ps.clips.filter((c) => c.rush && c.start > sh.open + 0.01);
    out.shutter = { open: +(sh.end - sh.open).toFixed(2), pieces: rs.map((c) => +(c.end - c.start).toFixed(2)) };
    if (sh.end - 0.02 - sh.open < Math.min(6 * u, 2.8) - 0.05) f.push(`Vorhang öffnet zu schnell (${(sh.end - sh.open).toFixed(2)} s)`);
    const hk = ps.clips.find((c) => c.role === 'hook'), se = hk && sectionAt(an, ps.win.start + hk.start + 0.05);
    if (!hk || Math.abs(hk.start - (sh.end - 0.02)) > 0.03 || !se || !['drop', 'chorus'].includes(se.label)) f.push('Vorhang nicht genau auf dem Einsatz offen');
    if (rs.length < 4 || rs.some((c) => c.end - c.start > u + 0.05)) f.push('Vorhang: dahinter nicht schnell ' + out.shutter.pieces.join(','));
    for (let k = 1; k < rs.length; k++) if (rs[k].mediaId === rs[k - 1].mediaId) { f.push('Vorhang: Bild doppelt hintereinander'); break; }
  }
  return { f, out };
});
if (V) console.log(JSON.stringify(r.out));
await b.close();
console.log(r.f.length ? `FAIL ${r.f.length}\n` + r.f.join('\n') : 'OK welcome');
process.exit(r.f.length ? 1 : 0);
