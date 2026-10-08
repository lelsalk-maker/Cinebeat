/* Planer · Ein Planungsdurchlauf: Einstieg, Stil-Mittel, chronologische Zuteilung, Übergänge, Effekte */
function planOnce(opts) {
  const { an, media, settings, overrides = {}, chapters = null, trip = null, flight = null } = opts;
  const pool = media.filter((m) => !m.bad && !m.loading);
  // Eigene Eingriffe hängen an der Aufnahme (overrides.media[id]), nicht an der Platznummer – so bleiben sie richtig,
  // wenn sich der Schnitt ändert (ausschließen, verschieben, kürzen). overrides.clips[i] nur noch für ältere Projekte.
  const ovM = overrides.media || {}, ovL = overrides.media ? {} : overrides.clips || {};
  const ovOf = (c) => (c ? ovM[c.baseId || c.mediaId] || ovL[c.i] || null : null);
  const dir = direct(an, pool, settings, chapters, flight);
  const s = dir.rs;
  const win = dir.win;
  const rng = mulberry32((s.seed >>> 0) ^ hashStr(s.title || ''));
  const D = win.end - win.start;
  const beatDur = an.beatPeriod;
  const barDur = beatDur * 4;
  const fmt = FORMATS[s.format] || FORMATS['9:16'];
  const band = bandRect(s.format, s.frame);
  const outAspect = (fmt.w / fmt.h) / band[1];
  const vertical = fmt.h > fmt.w;
  const usable = pool.filter((m) => !m.excluded);
  const intro = s.intro, outro = s.outro;
  // „Alle Aufnahmen verwenden“: jede Aufnahme kommt vor (auch Serienbilder); die Regie verdichtet dafür
  const allOn = allMediaOn(s) && !chapters && !flight;
  // „Mehr“/„So viele wie möglich“: auch Serienbilder (goodMedia mit 'mehr'/'max')
  const gAll = allOn && mengeOf(s) !== 'auto' ? mengeOf(s) : allOn;
  // Chronologischer Durchlauf (Ortsfilme, Reels, Storys): Aufnahmen strikt nach Aufnahmezeit
  const chrono = !chapters && !flight;
  // Reihenfolge „Zum Lied“ (Standard): Aufnahmen nach Songstelle, nicht nach Aufnahmetag
  const lied = (s.order || 'lied') === 'lied' && !flight;
  const level = opts._level || 0;

  // Schnittpunkte, ausbalanciert gegen die Menge des Materials
  // Reisefilm (Kapitel): Videos zeigen ihren besten Moment statt fast ganz zu laufen – so bleibt Zeit für alle Orte
  const fr = chapters && chapters.length ? { ...formatRule(s), vmax: Math.min(formatRule(s).vmax, mengeOf(s) === 'max' ? 3.5 : mengeOf(s) === 'mehr' ? 4.5 : 5.5) } : formatRule(s);
  const shotBase = fr.shot / 1.7;
  // Schnittlänge nach Material: Videos bekommen (fast) ihre ganze Länge, die übrige Zeit teilen sich die Fotos.
  // Viel Material → dichter (nie kürzer als shotMin), wenig Material → ruhiger statt Bilder zu wiederholen.
  const good = goodMedia(usable, gAll);
  const vidT = good.filter((m) => m.kind === 'video').reduce((a, m) => a + videoPlay(m, fr.vmax), 0);
  const imgN = Math.max(1, good.filter((m) => m.kind === 'image').length);
  // Mindestlänge je Einstellung; müssen alle Aufnahmen hinein, darf es bis auf einen Beat dichter werden
  const minShot = flight ? 0 : level >= 1 ? Math.max(0.4, beatDur * 0.9) : fr.shotMin * (settings.pace === 'schnell' ? 0.5 : 0.7);
  // Mindestlänge in ruhigen Songteilen, wenn verdichtet wird: zwei Beats (Break/Intro/Outro), die Dynamik bleibt hörbar und sichtbar
  const calmMin = level >= 1 && level < 4 ? Math.max(0.9, beatDur * 2) : 0;
  const cutVary = s.recut ? (Math.imul((s.seed >>> 0) + 1, 2654435761) ^ Math.imul(s.recut, 40503)) >>> 0 : 0;
  const simpleCut = effectsOf(s) === 'schlicht';
  let segs = planCuts(an, win, s.pace, opts._scale || 1, shotBase, minShot, calmMin, overrides.taps, cutVary, simpleCut);
  let usedScale = opts._scale || 1;
  // erste Schätzung; die Suche in buildPlan gibt die Schnittlänge danach direkt vor
  if (!flight && !opts._scale) {
    const imgTime = Math.max(barDur, D - Math.min(vidT, D * 0.7) - barDur);
    const haveShot = D / Math.max(1, segs.length), wantShot = imgTime / imgN;
    const scale = Math.max(fr.shotMin / fr.shot, Math.min(3, wantShot / haveShot));
    if (Math.abs(scale - 1) > 0.12) { segs = planCuts(an, win, s.pace, scale, shotBase, minShot, calmMin, overrides.taps, cutVary, simpleCut); usedScale = scale; }
  }

  // Flug: Abflug (2 Takte) · Aufnahmen an Bord (je 1 Takt) · Fluganimation (2 Takte) · Landung (Rest)
  let flightRoles = null;
  if (flight) {
    const byIdF = new Map(pool.map((m) => [m.id, m]));
    const extras = (flight.extraIds || []).filter((id) => byIdF.has(id) && !byIdF.get(id).excluded).slice(0, 4);
    const dbs = an.beats.filter((_, i) => downSet(an).has(i)).map((b) => b - win.start).filter((t) => t > 0.3 && t < D - 0.3);
    const at = (k) => (dbs[k - 1] != null ? dbs[k - 1] : k * barDur);
    let ex = extras.slice();
    let bounds;
    for (;;) {
      bounds = [0, at(2)];
      ex.forEach((_, k) => bounds.push(at(3 + k)));
      bounds.push(at(4 + ex.length));
      if (D - bounds[bounds.length - 1] >= Math.max(2.5, barDur) || !ex.length) break;
      ex = ex.slice(0, -1);
    }
    bounds.push(D);
    const ok = bounds.every((b, k) => k === 0 || b > bounds[k - 1] + 0.5);
    if (!ok) { bounds = [0, D * 0.3, D * 0.62, D]; ex = []; }
    segs = bounds.slice(0, -1).map((b, k) => ({ start: b, end: bounds[k + 1], w: 10 }));
    flightRoles = ['takeoff', ...ex.map((id) => 'extra:' + id), 'anim', 'landing'];
  }

  // 9er-Raster: Kacheln werden im Takt farbig, dann Zoom ins Zielbild genau auf einen Beat
  // Vorspann vor dem eigentlichen Einstieg (kombinierbar): Countdown oder Rewind
  // Reststücke kürzer als das hier werden an Nachbarn gehängt (ein Beat bleibt als Schnitt erlaubt)
  const tinySeg = Math.min(0.6, beatDur * 0.9);
  const bStep = beatDur < 0.42 ? 2 : 1;
  const bts0 = an.beats.map((b) => b - win.start).filter((t) => t >= -0.02 && t < D);
  const atB = (k) => (bts0[k] != null ? Math.max(0, bts0[k]) : k * beatDur);
  let pre = null;
  const preMode = !flight && s.pre && s.pre !== 'off' && intro !== 'split' && !(s.pre === 'countdown' && intro === 'countdown') ? s.pre : null;
  if (preMode === 'countdown') {
    const marks = [0, atB(bStep), atB(2 * bStep)], end = atB(3 * bStep);
    pre = { kind: 'countdown', beats: 3 * bStep, end, marks, pieces: marks.map((m, i) => ({ start: m, end: i < 2 ? marks[i + 1] : end, f: { leader: true, pre: 'leader' } })) };
  } else if (preMode === 'rewind') {
    // kurzer Vorgeschmack auf den besten Moment, dann spult der Film im Zeitraffer zurück an den Anfang
    const teaseEnd = atB(2 * bStep), end = atB(4 * bStep);
    const sub = beatDur / 2 >= 0.2 ? beatDur / 2 : beatDur;
    const pieces = [{ start: 0, end: teaseEnd, f: { pre: 'tease' } }];
    // Stücke auf den tatsächlichen Schlägen (bei langsamem Tempo auch den halben dazwischen), nicht im festen Abstand
    const marks = [];
    for (let k = 2 * bStep; k < 4 * bStep; k++) { const a = atB(k), b = atB(k + 1); marks.push(a); if (sub < beatDur * 0.9) marks.push((a + b) / 2); }
    marks.forEach((t0, i) => pieces.push({ start: t0, end: i + 1 < marks.length ? marks[i + 1] : end, f: { pre: 'rew' } }));
    pre = { kind: 'rewind', beats: 4 * bStep, end, teaseEnd, pieces };
  }
  // Kino-Rollladen: sechs Ausschnitte der stärksten Aufnahmen im Kinoband, Lichtschlitz, Schwarz mit Ortstitel, dann öffnet sich das Bild
  let shutter = null;
  if (intro === 'shutter' && !flight) {
    const st = shutterStep(an), u = beatDur * st;
    // Zeit einer (auch halben) Zählzeit auf dem Beat-Raster
    const at = (x) => { const k = x * st, k0 = Math.floor(k + 1e-6), f = k - k0; return f > 1e-6 ? atB(k0) + (atB(k0 + 1) - atB(k0)) * f : atB(k0); };
    // Öffnen wie das Schließen in Zügen auf den Schlägen (15–19), auf dem Einsatz (20) ist das Bild ganz frei
    shutter = { u, at, reveal: SHUTTER.tiles.map((x, k) => (k === 0 ? 0 : at(x))), colorAt: SHUTTER.colors.map(at), pulls: SHUTTER.pulls.map(at), black: at(SHUTTER.black), open: at(SHUTTER.open), end: at(SHUTTER.end), opens: [0, 1, 2, 3, 4].map((k) => at(SHUTTER.open + k)) };
    if (shutter.end > D - Math.max(3, barDur * 2)) shutter = null;
    else pre = { kind: 'shutter', beats: SHUTTER.black * st, end: shutter.black, pieces: [{ start: 0, end: shutter.black, f: { pre: 'wall' } }] };
  }
  // „Welcome to…“: zehn ähnliche Ausschnitte (immer langsamer), das letzte Video läuft weiter, Ortsname in Gelb,
  // zehn Schriften im Wechsel mit den Bildern, Balken schließen auf den Schlägen, auf dem Einsatz ein Video
  let welcome = null;
  if (intro === 'welcome' && !flight && !pre) {
    const st = shutterStep(an), u = beatDur * st;
    const at = (x) => { const k = x * st, k0 = Math.floor(k + 1e-6), f = k - k0; return f > 1e-6 ? atB(k0) + (atB(k0 + 1) - atB(k0)) * f : atB(k0); };
    welcome = { u, at, clips: WELCOME.clips.map((x) => (x ? at(x) : 0)), last: at(WELCOME.last), name: at(WELCOME.name), fonts: WELCOME.fonts.map(at), pulls: WELCOME.pulls.map(at), end: at(WELCOME.end) };
    if (welcome.end > D - Math.max(3, barDur * 2) || s.showTitle === false || !(settings.title || '').trim()) welcome = null;
  }
  if (pre && pre.kind !== 'shutter' && pre.end > D * 0.35) pre = null;
  const pb = pre ? pre.beats : 0;
  const T0 = pre ? pre.end : 0;

  let gridPlan = null;
  if (intro === 'grid') {
    const n = goodMedia(usable, gAll).length >= 9 ? 3 : 2;
    const step = bStep;
    const at = (k) => atB(k + pb);
    const tiles = n * n;
    const times = Array.from({ length: tiles }, (_, k) => (k === 0 ? (pb ? at(0) : Math.min(0.12, at(0))) : at(k * step)));
    const zoomEnd = at(tiles * step);
    if (zoomEnd < D * 0.7) gridPlan = { n, times, zoomStart: times[tiles - 1], zoomEnd };
  }

  // „Durch den Namen“: Ortsname als Fenster ins Bild, dann Zoom durch die Buchstaben auf einen Beat
  let knock = null;
  if (intro === 'knockout') {
    const step = bStep;
    const at = (k) => atB(k + pb);
    knock = { zoomStart: at(5 * step), end: at(6 * step) };
    if (knock.end > D * 0.6) knock = null;
  }

  // Countdown wie ein alter Filmvorspann: 3 · 2 · 1 auf den Beats, darunter wechseln Bilder in Schwarzweiß
  let leader = null;
  if (intro === 'countdown') {
    const step = bStep;
    const at = (k) => atB(k + pb);
    leader = { marks: [pb ? at(0) : 0, at(step), at(2 * step)], end: at(3 * step) };
    // setzt Refrain/Drop kurz danach ein, endet der Countdown genau dort („1“ fällt auf den Einsatz, die „3“ steht länger)
    const dropRel = (an.sections || []).map((x) => x.start - win.start).find((t) => t > leader.end + 0.05 && t <= at(5 * step) + 0.05 && ['drop', 'chorus'].includes(sectionAt(an, win.start + t + 0.02).label));
    if (dropRel != null) {
      let kd = 3 * step;
      while (kd < 5 * step && Math.abs(at(kd) - dropRel) > beatDur * 0.3) kd++;
      if (Math.abs(at(kd) - dropRel) <= beatDur * 0.3) leader = { marks: [pb ? at(0) : 0, at(kd - 2 * step), at(kd - step)], end: at(kd) };
    }
    if (leader.end > D * 0.5 || leader.marks[1] - leader.marks[0] < 0.2) leader = null;
  }

  // Aufblende: ein kurzer, ruhiger Aufbau aus Details, dann öffnet sich auf dem Höhepunkt das stärkste Bild
  let reveal = null;
  if (intro === 'reveal') {
    const nb = revealBeats(an);
    const at = (k) => atB(k + pb);
    reveal = { marks: [pb ? at(0) : 0, at(nb / 2)], end: at(nb) };
    if (reveal.end > D * 0.4 || reveal.end - reveal.marks[0] < 1.6) reveal = null;
  }

  // Bilderflut: ein Takt voller Bilder, immer schneller (halbe, dann Viertel-Beats), auf der Eins steht das stärkste Bild
  let rush = null;
  if (intro === 'rush') {
    const pieces = [];
    for (let k = 0; k < 4; k++) {
      const a = atB(pb + k), z = atB(pb + k + 1);
      const n = k < 2 ? 2 : (z - a) / 4 >= 0.1 ? 4 : 2;
      for (let j = 0; j < n; j++) pieces.push({ start: a + ((z - a) * j) / n, end: a + ((z - a) * (j + 1)) / n, f: { rush: true } });
    }
    if (pb === 0) pieces[0].start = 0;
    rush = { pieces, end: atB(pb + 4) };
    if (rush.end > D * 0.35) rush = null;
  }

  // Kino-Rollladen: hinter dem Schwarz läuft schon das erste Bild; beim Öffnen wechseln die Bilder im Takt,
  // auf den letzten beiden Zählzeiten doppelt so schnell – auf dem Einsatz steht das stärkste Bild
  if (shutter) {
    // (jeder Wechsel auf einem echten Schlag des Songs – nicht mit fester Schlaglänge weitergezählt)
    const pieces = [], at = shutter.at;
    // (ruhig: ein Bild je Zählzeit, eines nach dem anderen, während sich der Vorhang gleichmäßig öffnet)
    const cuts = [shutter.black, at(SHUTTER.open + 1)];
    for (let x = SHUTTER.open + 2; x < SHUTTER.end - 1e-6; x += 1) cuts.push(at(x));
    cuts.push(shutter.end);
    for (let k = 0; k + 1 < cuts.length; k++) pieces.push({ start: cuts[k], end: cuts[k + 1], f: { rush: true } });
    rush = { pieces, end: shutter.end, shutter: true };
  }
  if (welcome) {
    // Ausschnitte (0 … 9), das weiterlaufende letzte Video (10), dann je Schriftwechsel ein Bild (11 …)
    const cuts = [...welcome.clips, welcome.last, ...welcome.fonts, welcome.end];
    const pieces = [];
    for (let k = 0; k + 1 < cuts.length; k++) pieces.push({ start: cuts[k], end: cuts[k + 1], f: { rush: true, welcome: k < 10 ? 'a' : k === 10 ? 'last' : 'cycle' } });
    rush = { pieces, end: welcome.end, welcome: true };
  }

  // Einstieg: Mindestdauer der ersten Einstellung
  let firstMin = knock || leader || reveal || rush || intro === 'grid' ? 0 : intro === 'city' ? Math.min(D * 0.35, Math.max(2.4, barDur * 1.2)) : intro === 'cinema' ? Math.min(D * 0.35, Math.max(3.2, barDur * 1.6)) : intro === 'type' ? Math.min(D * 0.3, Math.max(1.8, barDur)) : intro === 'split' ? Math.min(D * 0.3, Math.max(2.2, barDur)) : Math.min(Math.max(1.3, barDur * 0.95), 2.8, D * 0.3);
  // der erste Drop/Refrain-Einsatz bleibt ein Schnitt: die erste Einstellung reicht höchstens bis dorthin
  // (der Titel steht trotzdem lange genug – die Einblendung läuft über den Schnitt weiter)
  const peak0 = (an.sections || []).find((x) => (x.label === 'drop' || x.label === 'chorus') && x.start - win.start > 1.2);
  if (peak0 && firstMin > peak0.start - win.start - 0.05) firstMin = peak0.start - win.start - 0.05;
  if (!flight && !pre && segs.length > 1 && segs[0].end < firstMin) {
    let k = 0;
    while (k < segs.length - 1 && segs[k].end < firstMin) k++;
    segs = [{ start: 0, end: segs[k].end, w: 0 }, ...segs.slice(k + 1)];
  }
  // Einstiege mit fester Länge: Schnitte genau auf die Beats legen, danach normal weiter
  // Vorspann und Einstieg werden hintereinander gelegt (z. B. Countdown, dann 9er-Raster)
  const forceStart = (pieces, postMin) => {
    const e = pieces[pieces.length - 1].end;
    if (e >= D - 1) return false;
    let k = segs.findIndex((g) => g.end > e + 0.05);
    if (k < 0) k = segs.length - 1;
    while (segs[k].end - e < Math.max(0.9, beatDur * 2, postMin) && k < segs.length - 1) k++;
    const head = pieces.map((p) => ({ start: p.start, end: p.end, w: 0, ...p.f }));
    segs = [...head, { start: e, end: Math.max(segs[k].end, e + 0.3), w: 10 }, ...segs.slice(k + 1)];
    return true;
  };
  const mainPieces = knock ? [{ start: T0, end: knock.end, f: { knock: true } }]
    : leader ? leader.marks.map((m, i) => ({ start: m, end: i < 2 ? leader.marks[i + 1] : leader.end, f: { leader: true } }))
      : gridPlan ? [{ start: T0, end: gridPlan.zoomEnd, f: { gridSeg: true } }]
        : reveal ? reveal.marks.map((m, i) => ({ start: m, end: i < reveal.marks.length - 1 ? reveal.marks[i + 1] : reveal.end, f: { reveal: true } }))
          : rush ? rush.pieces : [];
  if (pre || mainPieces.length) {
    // nach der Aufblende bekommt das Highlight mindestens einen ganzen Takt
    // nach der Aufblende und der Bilderflut bekommt das stärkste Bild einen ganzen Takt Ruhe
    const ok = forceStart([...(pre ? pre.pieces : []), ...mainPieces], reveal || rush ? barDur : mainPieces.length ? 0 : firstMin);
    if (!ok) { pre = null; knock = null; leader = null; gridPlan = null; reveal = null; rush = null; }
  }
  // Foto-Serie im Drop: ein Takt, jeder halbe Beat ein neues Bild
  // Einstiege mit fester Länge enden auf dem Drop: die Foto-Serie darf direkt dort beginnen
  const forced = segs.filter((g) => g.knock || g.leader || g.gridSeg || g.pre || g.reveal || g.rush);
  // nach Raster und „Durch den Namen“ behält das freigelegte Bild seine volle Einstellung
  const lastForced = forced[forced.length - 1];
  const introEnd = !lastForced ? segs[0].end : lastForced.leader ? lastForced.end : (segs[forced.length] || lastForced).end;
  // Bilderflut: nach der Ruhe wird es im Drop wieder schneller (Foto-Serie), aber nicht direkt nach der Flut
  if ((s.burst === 'drop' || rush || level >= 2) && !flight && goodMedia(usable, gAll).length >= 5) {
    const secs = (an.sections || []).map((x) => ({ ...x, rel: x.start - win.start }));
    const isPeak = (x) => x.label === 'drop' || x.label === 'chorus';
    let peak = secs.find((x) => isPeak(x) && x.rel > Math.max(1.2, introEnd - 0.05) && x.rel < D - 3);
    // läuft ein fester Einstieg schon in einen Drop hinein, beginnt die Serie direkt nach ihm
    const atIntro = forced.length ? secs.find((x) => x.rel <= introEnd + 0.05 && x.rel + (x.end - x.start) > introEnd + 1) : null;
    if (rush && peak && peak.rel < introEnd + barDur * 2) peak = secs.find((x) => isPeak(x) && x.rel >= introEnd + barDur * 2 && x.rel < D - 3);
    if (!rush && atIntro && isPeak(atIntro) && (!peak || peak.rel > introEnd + barDur * 2)) peak = { ...atIntro, rel: introEnd };
    // Alle Aufnahmen und viel Material: Foto-Serien in weiteren Refrains/Drops (verdichtet, ohne Bilder wegzulassen)
    const peaksB = peak ? [peak] : [];
    if (level >= 2) for (const x of secs) if (isPeak(x) && x.rel > introEnd + barDur && x.rel < D - 3 && !peaksB.some((y) => Math.abs(y.rel - x.rel) < barDur)) peaksB.push(x);
    // sehr viel Material: Foto-Serien auch zwischendurch, alle zwei Takte eine (Photo-Dump-Stil)
    // (nur in Aufbau, Refrain und Drop – ruhige Teile bleiben ruhig)
    if (level >= 4) for (const b0 of (an.barStart || []).map((x) => x - win.start)) if (b0 > introEnd + barDur && b0 < D - 3 && !isCalmLabel(sectionAt(an, win.start + b0 + 0.02).label) || (b0 > introEnd + barDur && b0 < D - 3 && sectionAt(an, win.start + b0 + 0.02).label === 'build')) if (!peaksB.some((y) => Math.abs(y.rel - b0) < barDur * 2.9)) peaksB.push({ rel: b0 });
    peaksB.sort((x, y) => x.rel - y.rel);
    const styleFlash = s.burst === 'drop' || (rush && !rush.shutter && !rush.welcome);
    // verdichtende Serien nehmen nur so viele Bilder auf, wie auf der Stufe davor fehlten (plus etwas Luft) – sonst
    // blieben für den Rest des Films zu wenige Bilder und einzelne Einstellungen stünden viel zu lang
    let pieceBudget = opts._need != null ? Math.ceil(opts._need * 1.3) + 2 : Infinity;
    for (const [pki, pk] of peaksB.slice(0, level >= 4 ? 40 : level >= 3 ? 6 : level >= 2 ? 3 : 1).entries()) {
      // Bilderflut (Stil-Mittel „Foto-Serie im Drop“): ein Takt, jedes Bild einen Viertelschlag (≈ 0,1 s) – sie zeigt
      // Aufnahmen aus der Nähe, die im Film ohnehin lang zu sehen sind (verbraucht keine). Weitere Serien verdichten
      // bei viel Material und zeigen eigene Aufnahmen im halben Schlag.
      const flash = styleFlash && pki === 0;
      const sub = flash ? (beatDur / 4 >= 0.09 ? beatDur / 4 : beatDur / 2) : beatDur / 2 >= 0.2 ? beatDur / 2 : beatDur;
      // die Serie bleibt in ihrem Songteil (läuft nicht in einen ruhigen Teil hinein)
      const secEnd = sectionAt(an, win.start + pk.rel + 0.02).end - win.start;
      const ds = pk.rel;
      if (!flash && pieceBudget < 3) continue;
      let de = flash ? Math.min(D - 1.2, ds + barDur, Math.max(ds + beatDur * 2, secEnd)) : Math.min(D - 1.2, ds + sub * Math.min(level >= 3 ? 16 : 8, Math.max(4, pieceBudget)), Math.max(ds + sub * 4, secEnd));
      // Schnitte der Serie auf den tatsächlichen Schlägen (und ihren Hälften) – auch wenn das Tempo leicht schwankt
      const bw = Array.from(bts0);
      { let bd = Infinity, bb = de; for (const b of bw) { const d2 = Math.abs(b - de); if (d2 < bd && b > ds + sub * 3) { bd = d2; bb = b; } } if (bd < beatDur * 0.6) de = bb; }
      if (segs.some((g) => (g.burst || g.gridSeg || g.pre || g.reveal || g.leader || g.knock || g.rush) && g.start < de && g.end > ds)) continue;
      const out = [];
      for (const g of segs) {
        if (g.end <= ds + 0.01 || g.start >= de - 0.01) { out.push(g); continue; }
        if (g.start < ds - 0.01) out.push({ ...g, end: ds });
        if (g.end > de + 0.01) out.push({ ...g, start: de });
      }
      const marks = [ds];
      for (let k = 0; k + 1 < bw.length; k++) {
        const a = bw[k], b = bw[k + 1];
        if (a > ds + 0.05 && a < de - 0.05) marks.push(a);
        for (const q of sub < beatDur * 0.3 ? [0.25, 0.5, 0.75] : sub < beatDur * 0.9 ? [0.5] : []) {
          const m = a + (b - a) * q;
          if (m > ds + 0.05 && m < de - 0.05) marks.push(m);
        }
      }
      marks.sort((x, y) => x - y);
      marks.forEach((t0, k) => out.push({ start: t0, end: k + 1 < marks.length ? marks[k + 1] : de, w: 5, burst: true, flash }));
      if (!flash) pieceBudget -= marks.length;
      out.sort((x, y) => x.start - y.start);
      // Reststücke unter 0,6 s an einen normalen Nachbarn hängen
      for (let i = 0; i < out.length; i++) {
        const g = out[i];
        const fixed = (x) => x && (x.burst || x.leader || x.knock || x.gridSeg || x.pre || x.reveal || x.rush);
        if (fixed(g) || g.end - g.start >= tinySeg) continue;
        const prev = out[i - 1], next = out[i + 1];
        if (prev && !fixed(prev)) { prev.end = g.end; out.splice(i--, 1); } else if (next && !fixed(next)) { next.start = g.start; out.splice(i--, 1); }
      }
      segs = out;
    }
  }
  // Einstiegs-Elemente mitten im Film: Raster beim Einsatz eines Refrains, Countdown vor dem Drop
  const secsRel = (an.sections || []).map((x) => ({ ...x, rel: x.start - win.start })).filter((x) => x.rel > 0 && x.rel < D);
  const isPeakSec = (x) => x.label === 'drop' || x.label === 'chorus';
  const beatIdxAt = (t) => { let k = 0; for (let i = 0; i < bts0.length; i++) if (bts0[i] <= t + 0.03) k = i; return k; };
  const special = (g) => g.burst || g.leader || g.knock || g.gridSeg || g.gridMid || g.pre || g.reveal || g.vslot || g.miniRew || g.stackSeg || g.rush;
  let midGrid = null;
  if (s.midGrid === 'on' && !flight && goodMedia(usable, gAll).length >= 5) {
    const busy = (a, b) => segs.some((g) => (g.burst || g.gridSeg || g.pre || g.reveal || g.leader || g.knock) && g.start < b && g.end > a);
    const peaks = secsRel.filter((x) => isPeakSec(x) && x.rel > Math.max(introEnd, barDur) + barDur);
    // ohne weiteren Refrain: Anfang einer Phrase (4 Takte) mitten im Drop/Refrain
    const phase = an.phrasePhase || 0;
    const phrases = (an.barStart || []).map((b, k) => ({ rel: b - win.start, k })).filter((x) => (x.k - phase) % 4 === 0 && x.rel > introEnd + barDur * 2 && isPeakSec(sectionAt(an, win.start + x.rel + 0.02)))
      .map((x) => ({ rel: x.rel, end: x.rel + barDur * 4, start: win.start + x.rel }));
    // bevorzugt der zweite Refrain (der erste gehört oft dem Einstieg oder der Foto-Serie)
    for (const pk of [...(peaks.length > 1 ? [peaks[1], peaks[0], ...peaks.slice(2)] : peaks), ...phrases]) {
      const n = goodMedia(usable, gAll).length >= 9 && pk.end - pk.start >= barDur * 4 ? 3 : 2;
      const step = beatDur < 0.42 ? 2 : 1;
      const k0 = beatIdxAt(pk.rel), tiles = n * n;
      const at = (k) => (bts0[k0 + k] != null ? bts0[k0 + k] : bts0[k0] + k * beatDur);
      const times = Array.from({ length: tiles }, (_, k) => at(k * step));
      const zoomEnd = at(tiles * step);
      if (zoomEnd > D - barDur * 1.5 || busy(times[0] - 0.05, zoomEnd + 0.05)) continue;
      midGrid = { n, times, zoomStart: times[tiles - 1], zoomEnd, start: times[0] };
      break;
    }
    if (midGrid) {
      const a = midGrid.start, z = midGrid.zoomEnd, out = [];
      for (const g of segs) {
        if (g.end <= a + 0.01 || g.start >= z - 0.01) { out.push(g); continue; }
        if (g.start < a - 0.01) out.push({ ...g, end: a });
        if (g.end > z + 0.01) out.push({ ...g, start: z });
      }
      out.push({ start: a, end: z, w: 12, gridMid: midGrid });
      out.sort((x, y) => x.start - y.start);
      // Reststücke unter 0,6 s an einen Nachbarn hängen
      for (let i = 0; i < out.length; i++) {
        const g = out[i];
        if (special(g) || g.end - g.start >= tinySeg) continue;
        const prev = out[i - 1], next = out[i + 1];
        if (prev && !special(prev)) { prev.end = g.end; out.splice(i--, 1); } else if (next && !special(next)) { next.start = g.start; out.splice(i--, 1); }
      }
      segs = out;
    }
  }
  let countIn = null;
  if (s.midCount === 'drop' && !flight) {
    // nicht dort, wo schon ein Countdown, Raster oder Durch-den-Namen auf den Einsatz zuläuft (die Aufblende darf ihn bekommen)
    const taken = (t) => segs.some((g) => (g.pre || g.leader || g.knock || g.gridSeg || g.gridMid) && Math.abs(g.end - t) < 0.3);
    const fixedEnd = segs.filter((g) => g.pre || g.leader || g.knock || g.gridSeg).reduce((m, g) => Math.max(m, g.end), 0);
    const pk = secsRel.find((x) => isPeakSec(x) && x.rel > fixedEnd + beatDur * 3.5 && x.rel > beatDur * 3.5 && x.rel < D - barDur && !taken(x.rel));
    if (pk) {
      const k = beatIdxAt(pk.rel);
      if (k >= 3) countIn = { marks: [bts0[k - 3], bts0[k - 2], bts0[k - 1]], end: bts0[k] };
    }
  }

  // Stil-Mittel mit festem Platz im Song: Mini-Rewind vor einem Drop, Polaroid-Stapel in einem ruhigen Teil
  const insertSegs = (a, z, pieces) => {
    const out = [];
    for (const g of segs) {
      if (g.end <= a + 0.01 || g.start >= z - 0.01) { out.push(g); continue; }
      if (g.start < a - 0.01) out.push({ ...g, end: a });
      if (g.end > z + 0.01) out.push({ ...g, start: z });
    }
    out.push(...pieces);
    out.sort((x, y) => x.start - y.start);
    for (let i = 0; i < out.length; i++) {
      const g = out[i];
      if (special(g) || g.end - g.start >= tinySeg) continue;
      const prev = out[i - 1], next = out[i + 1];
      if (prev && !special(prev)) { prev.end = g.end; out.splice(i--, 1); } else if (next && !special(next)) { next.start = g.start; out.splice(i--, 1); }
    }
    segs = out;
  };
  // Einsätze: Drop/Refrain nach einem ruhigeren Teil, nicht im Einstieg und nicht ganz am Ende
  const hitsRel = secsRel.filter((x) => isPeakSec(x) && x.rel > introEnd + barDur * 1.5 && x.rel < D - barDur * 2 && !isPeakSec(sectionAt(an, x.start - 0.05)) && !(countIn && Math.abs(countIn.end - x.rel) < 0.2)).map((x) => x.rel);
  const overlapsSpecial = (a, z) => segs.some((g) => special(g) && g.start < z - 0.02 && g.end > a + 0.02);
  let miniAt = null;
  if (s.mini === 'on' && !flight && goodMedia(usable, gAll).length >= 6) {
    const colorOn = s.color && s.color !== 'off';
    for (const h of colorOn && hitsRel.length > 1 ? hitsRel.slice(1).concat(hitsRel[0]) : hitsRel) {
      const k = beatIdxAt(h);
      if (k < 2 || Math.abs(bts0[k] - h) > 0.08) continue;
      const a = bts0[k - 2], z = bts0[k];
      if (a < introEnd + barDur * 0.5 || overlapsSpecial(a, z)) continue;
      // jeden der zwei Schläge für sich teilen (halbe Schläge, bei schnellen Songs ganze): die Stücke sitzen genau
      // auf den Unterteilungen, auch wenn das Raster dort leicht atmet
      const pieces = [];
      for (let j = k - 2; j < k; j++) {
        const b0 = bts0[j], b1 = bts0[j + 1], parts = (b1 - b0) / 2 >= 0.2 ? 2 : 1;
        for (let q = 0; q < parts; q++) pieces.push({ start: b0 + ((b1 - b0) * q) / parts, end: b0 + ((b1 - b0) * (q + 1)) / parts, w: 5, miniRew: true });
      }
      insertSegs(a, z, pieces);
      miniAt = { a, z };
      break;
    }
  }
  let stackAt = null;
  if (s.stack === 'on' && !flight && goodMedia(usable, gAll).filter((m) => m.kind === 'image').length >= 6) {
    // Abzüge fallen alle zwei Beats (bei langsamen Songs jeden Beat), danach ein kurzer Moment Ruhe
    const step = beatDur > 0.7 ? 1 : 2;
    const barsRel = (an.barStart || []).map((b) => b - win.start).filter((t) => t > introEnd + barDur * 0.5 && t < D - barDur * 2);
    for (const b0 of barsRel) {
      const sec = sectionAt(an, win.start + b0 + 0.02);
      if (!isCalmLabel(sec.label) || sec.label === 'build') continue;
      const k0 = beatIdxAt(b0);
      const at = (j) => (bts0[k0 + j] != null ? bts0[k0 + j] : b0 + j * beatDur);
      const times = [1, 2, 3, 4].map((j) => at(j * step));
      const end = at(5 * step);
      if (end > D - barDur || win.start + end > sec.end + 0.05 || overlapsSpecial(b0, end)) continue;
      const mid = (sec.start + sec.end) / 2 - win.start;
      const cost = Math.abs((b0 + end) / 2 - mid) / barDur + (hitsRel.some((h) => h > b0 && h - end < barDur) ? 3 : 0);
      if (!stackAt || cost < stackAt.cost) stackAt = { a: b0, z: end, times, cost };
    }
    if (stackAt) insertSegs(stackAt.a, stackAt.z, [{ start: stackAt.a, end: stackAt.z, w: 12, stackSeg: { times: stackAt.times } }]);
  }

  // Videos: eigene, längere Plätze in ruhigen Songteilen (nicht bei Flügen: dort legt die Rolle die Videos fest)
  if (!flight) {
    const all = orderChrono(goodMedia(usable, gAll));
    // das vom Nutzer gewählte Startbild läuft als Einstieg, nicht zusätzlich auf einem eigenen Platz
    const vids = all.filter((m) => m.kind === 'video' && m.id !== settings.hookId);
    // erst nach dem Einstieg und seiner ersten Vollbild-Einstellung (dem Highlight)
    const afterIntro = segs[forced.length] ? segs[forced.length].end : segs[0] ? segs[0].end : 0;
    if (vids.length && !chrono) segs = videoSlots(segs, an, win, vids, all, barDur, afterIntro, D, fr.vmax, s.ramp === 'drop');
  }
  // Ende: letzte Einstellung lang genug für Schlusstitel/Standbild
  const lastMin = outro === 'strip' ? Math.min(D * 0.32, Math.max(3.8, barDur * 2)) : outro === 'credits' ? Math.min(D * 0.3, Math.max(3.4, barDur * 1.5)) : outro === 'freeze' ? Math.min(D * 0.3, Math.max(2.6, barDur)) : outro === 'split' ? Math.min(D * 0.3, Math.max(2.2, barDur)) : 0;
  if (!flight && lastMin && segs.length > 2 && segs[segs.length - 1].end - segs[segs.length - 1].start < lastMin) {
    let k = segs.length - 1;
    while (k > 1 && D - segs[k].start < lastMin) k--;
    segs = [...segs.slice(0, k), { start: segs[k].start, end: D, w: segs[k].w }];
  }
  // Feinabstimmung aus buildPlan: nach dem Einstieg und vor einem langen Schluss, Videoplätze bleiben unberührt
  if (opts._adj && !flight) segs = adjustCuts(segs, an, win, opts._adj, Math.max(beatDur * 0.98, fr.shotMin), forced.length + 1, lastMin ? segs.length - 1 : segs.length);

  const splitN = vertical ? (fmt.h / fmt.w > 1.5 ? 3 : 2) : 3;
  const splitFit = (m) => (vertical ? isLandscape(m) : isPortrait(m));
  // ---------- Chronologischer Durchlauf: Aufnahmen streng nach Aufnahmezeit auf die Schnitte legen ----------
  let chronoInfo = null;
  // „Neu schneiden“: fast gleich gute Aufnahmen tauschen reihum ihren Platz in der Auswahl
  const recutJit = (m) => (s.recut ? ((((hashStr(m.id) ^ Math.imul(s.recut, 2654435761)) >>> 0) % 1000) / 1000) * 0.25 : 0);
  if (chrono) {
    const all0 = orderChrono(goodMedia(usable, gAll));
    // Startbild: das stärkste Foto der ersten Momente (die Reihenfolge verschiebt sich dafür höchstens um wenige Plätze);
    // „Zum Lied“: das stärkste, kräftigste Foto überhaupt – der Einstieg soll packen
    const early = lied ? all0 : all0.slice(0, Math.max(3, Math.ceil(all0.length * 0.15)));
    // („Neu schneiden“: reihum eines der fast gleich starken – außer du hast das Startbild festgelegt)
    const hkVal = (m) => (m.score || 0) + (lied ? 0.25 * mediaEnergy(m) : 0);
    const earlyImg = early.filter((m) => m.kind === 'image').sort((a, b) => hkVal(b) - hkVal(a));
    const hkCand = earlyImg.filter((m) => hkVal(m) >= (earlyImg[0] ? hkVal(earlyImg[0]) : 0) - (lied ? 0.12 : 0.2)).slice(0, 3);
    // („Welcome to…“: auf dem Einsatz geht es direkt mit einem Video weiter – dem stärksten, lebendigsten)
    const hkVid = rush && rush.welcome ? all0.filter((m) => m.kind === 'video' && videoSpan(m) >= 1.5).sort((a, b) => (b.score || 0) + 0.3 * videoLively(b) - (a.score || 0) - 0.3 * videoLively(a))[0] : null;
    const hk = intro === 'split' ? null : (settings.hookId && all0.find((m) => m.id === settings.hookId)) || hkVid || (s.recut && hkCand.length ? hkCand[s.recut % hkCand.length] : earlyImg[0]) || all0[0] || null;
    // innerhalb eines Moments (wenige Minuten) darf ein Bild aus dem vorigen hervorgehen (Match-Cuts, Farbfluss);
    // „Zum Lied“: die Momente stehen dort, wo sie zur Songstelle passen
    const vWant = (v) => userVideoLen(v) || Math.max(Math.min(videoSpan(v) * 0.96, Math.max(2.4, barDur)), videoPlay(v, fr.vmax) * (opts._vf || 1));
    const nPreSeg = segs.filter((g) => g.pre || g.leader || g.reveal || g.rush || g.gridSeg).length;
    const hookEnd = hk && segs[nPreSeg] ? segs[nPreSeg].end : 0;
    const flowed = lied
      ? spreadSimilar(songQueue(all0.filter((m) => m !== hk), { an, win, segs, startAt: hookEnd, want: vWant, us: s.us !== 'off', ramp: s.ramp === 'drop' }))
      : spreadSimilar(flowOrder(all0.filter((m) => m !== hk), s.match !== 'off'));
    // eigene Reihenfolge aus der Zeitleiste geht vor
    let queue = applyMoves(applyOrder(hk ? [hk, ...flowed] : flowed, overrides.order), overrides.moves);
    const pinned = new Set((overrides.moves || []).flatMap((x) => [x.id, x.before]).concat(overrides.order || []).filter(Boolean));
    const chronoCtx = { pinned, s, an, win, fr, level, allOn, intro, outro, rush, reveal, leader, gridPlan, special, splitFit, splitN, barDur, beatDur, isPeakSec, scenes: lied ? new Set() : sceneStarts(all0), vf: opts._vf || 1 };
    let res = layoutChrono(chronoCtx, segs, queue, 0);
    // alle Aufnahmen: fehlen am Ende noch welche, früher etwas mehr zusammenfassen (Split-Screens)
    for (let k = 0; k < 2 && allOn && res.dropped.length; k++) {
      const r2 = layoutChrono(chronoCtx, segs, queue, res.dropped.length * (k + 1));
      if (r2.dropped.length < res.dropped.length) res = r2;
    }
    // „Alle Aufnahmen“: fehlt danach noch ein Foto, teilt es sich den Platz mit seinem zeitlich nächsten Nachbarn
    // (Split-Screen aus zwei Fotos, in Aufnahme-Reihenfolge) – so fällt nichts weg und der Aufbau bleibt
    if (allOn && res.dropped.length && s.split !== 'off') {
      const byQ0 = new Map(queue.map((m) => [m.id, m]));
      const left = [];
      for (const d of res.dropped) {
        if (d.kind !== 'image') { left.push(d); continue; }
        let best = null, bd = Infinity;
        for (const g of res.segs) {
          const w = g.mediaId && !g.splitIds && byQ0.get(g.mediaId);
          if (!w || w.kind !== 'image' || w === hk || special(g) || g.vslot || g.repeat || g.replaySeg || g.end - g.start < beatDur * 1.8) continue;
          if (!lied && dayBlock(w) !== dayBlock(d)) continue;
          // („Zum Lied“: der ähnlichste Partner – gleicher Moment, gleiche Farbe)
          const dt = lied ? Math.abs((w.time || 0) - (d.time || 0)) / 60000 + (w.avg && d.avg ? Math.hypot(w.avg[0] - d.avg[0], w.avg[1] - d.avg[1], w.avg[2] - d.avg[2]) : 60) : Math.abs((w.time || 0) - (d.time || 0));
          if (dt < bd) { bd = dt; best = g; }
        }
        if (!best) { left.push(d); continue; }
        const w = byQ0.get(best.mediaId);
        best.splitIds = (w.time || 0) <= (d.time || 0) ? [w.id, d.id] : [d.id, w.id];
        delete best.mediaId;
      }
      res = { ...res, dropped: left };
    }
    // Passt trotz Verdichten nicht alles hinein, fielen bisher schlicht die letzten weg. Jetzt bleibt der Aufbau des Films
    // (Schnitte, Split-Screens, Tempo) genau so, nur die Aufnahmen tauschen ihre Plätze: eine stärkere, draußen
    // gebliebene übernimmt den Platz der schwächsten aus demselben Tagesabschnitt; Favoriten und das Startbild sind
    // „sicher im Film“ und bekommen notfalls einen Platz aus einem anderen Abschnitt (den zeitlich nächsten).
    if (res.dropped.length) {
      const keepS = (m) => (m.score || 0) + (s.us !== 'off' ? 0.15 * usScore(m) : 0) + (m.fav ? 10 : 0) + recutJit(m);
      const strict = s.order === 'streng';
      const slots = [];
      for (const g of res.segs) {
        if (special(g) && !g.burst) continue;
        if (g.splitIds) g.splitIds.forEach((id, k) => slots.push({ g, k }));
        else if (g.mediaId && !g.vslot && !g.repeat) slots.push({ g, k: -1 });
      }
      const idAt = (sl) => (sl.k < 0 ? sl.g.mediaId : sl.g.splitIds[sl.k]);
      const byQ = new Map(queue.map((m) => [m.id, m]));
      const out = res.dropped.filter((m) => m.kind === 'image').sort((a, b) => keepS(b) - keepS(a));
      const nowOut = [];
      for (const d of out) {
        const must = d.fav || d === hk;
        const fits = (sl) => {
          const w = byQ.get(idAt(sl));
          if (!w || w.kind !== 'image' || w.fav || w === hk || keepS(w) >= keepS(d) - 0.02) return false;
          if (sl.g.splitIds && splitFit(w) !== splitFit(d)) return false;
          if (strict) return Math.abs((w.time || 0) - (d.time || 0)) <= 3 * 60000;
          return must || lied || dayBlock(w) === dayBlock(d);
        };
        const cand = slots.filter(fits);
        if (!cand.length) { nowOut.push(d); continue; }
        // die schwächste; bei Favoriten ohne Platz im eigenen Abschnitt die zeitlich nächste
        const same = lied ? cand : cand.filter((sl) => dayBlock(byQ.get(idAt(sl))) === dayBlock(d));
        const pool = same.length ? same : cand.sort((x, y) => Math.abs((byQ.get(idAt(x)).time || 0) - (d.time || 0)) - Math.abs((byQ.get(idAt(y)).time || 0) - (d.time || 0))).slice(0, 3);
        const sl = pool.reduce((a2, x) => (keepS(byQ.get(idAt(x))) < keepS(byQ.get(idAt(a2))) ? x : a2));
        const w = byQ.get(idAt(sl));
        if (sl.k < 0) sl.g.mediaId = d.id; else sl.g.splitIds[sl.k] = d.id;
        nowOut.push(w);
      }
      res = { ...res, dropped: [...nowOut, ...res.dropped.filter((m) => m.kind !== 'image')] };
    }
    // „Beste Auswahl“: passt nicht alles, fallen die schwächsten Aufnahmen weg (nie das Startbild oder Favoriten)
    for (let k = 0; k < 3 && !allOn && res.dropped.length; k++) {
      // Wir-Vorrang: Aufnahmen von euch fallen zuletzt weg
      const keep = (m) => (m.score || 0) + (s.us !== 'off' ? 0.15 * usScore(m) : 0) + recutJit(m);
      const weak = queue.filter((m) => m !== hk && !m.fav && m.kind === 'image').sort((a, b) => keep(a) - keep(b)).slice(0, res.dropped.length);
      queue = queue.filter((m) => !weak.includes(m));
      res = layoutChrono(chronoCtx, segs, queue, 0);
    }
    segs = res.segs;
    chronoInfo = { hook: hk && queue[0] === hk ? hk : null, queue };
  }


  // Reisefilm-Finale: vor dem Abspann ein Rückblick – das stärkste Bild jedes Orts im Takt nacheinander
  if (chapters && chapters.length >= 2 && outro === 'credits' && D > 40) {
    const cardDur = Math.min(Math.max(1.8, barDur), D * 0.18), blackStart = D - cardDur - 0.9;
    const n = Math.min(10, chapters.length * (chapters.length <= 4 ? 2 : 1)), step = beatDur >= 0.34 ? 1 : 2;
    const bw = Array.from(bts0).filter((b) => b <= blackStart + 0.02);
    let si = bw.length - 1 - n * step;
    // Beginn auf einer vorhandenen Schnittstelle (kein Reststück), möglichst nah am gedachten Einsatz
    if (si > 0) {
      let best = -1, bd = Infinity;
      for (const g of segs) { const k = bw.findIndex((b) => Math.abs(b - g.start) < 0.02); if (k >= 0 && Math.abs(k - si) <= 2 * step && k + n * step < bw.length && Math.abs(k - si) < bd) { bd = Math.abs(k - si); best = k; } }
      if (best >= 0) si = best;
    }
    if (si > 0 && bw[si] > D * 0.6) {
      const marks = Array.from({ length: n + 1 }, (_, k) => bw[si + k * step]);
      const r0 = marks[0], r1 = marks[n];
      if (!segs.some((g) => special(g) && !g.burst && g.start < r1 - 0.01 && g.end > r0 + 0.01)) {
        const out = [];
        for (const g of segs) {
          if (g.end <= r0 + 0.01 || g.start >= r1 - 0.01) { out.push(g); continue; }
          if (g.start < r0 - 0.01) out.push({ ...g, end: r0 });
          if (g.end > r1 + 0.01) out.push({ ...g, start: r1 });
        }
        for (let k = 0; k < n; k++) out.push({ start: marks[k], end: marks[k + 1], w: 5, rush: true, recap: true });
        segs = out.sort((a, b) => a.start - b.start);
      }
    }
  }

  const clips = segs.map((g, i) => {
    const abs = win.start + g.start;
    const sec = sectionAt(an, abs + 0.01);
    return {
      i, start: g.start, end: g.end, label: sec.label, energy: sec.energy, weight: g.w, freezeAt: g.freezeAt, burst: !!g.burst, flash: !!g.flash, leader: !!g.leader, pre: g.pre || null, reveal: !!g.reveal, vid: g.vid || null, gridMid: g.gridMid || null, grid: !!g.gridMid, miniRew: !!g.miniRew, rush: !!g.rush, welcome: g.welcome || null, recap: !!g.recap, stack: g.stackSeg ? { times: g.stackSeg.times, reserved: g.stackIds || null } : null,
      pre_mediaId: g.mediaId || null, sceneStart: !!g.sceneStart, splitIds: g.splitIds || g.vsplitIds || null, gridIds: g.gridIds || null, replaySeg: !!g.replaySeg, repeatSeg: !!g.repeat,
      sectionChange: i > 0 && (an.sections || []).some((x) => Math.abs(x.start - abs) < 0.05),
      mediaId: null, role: 'normal',
    };
  });

  // Split-Screens festlegen (vor der Medienzuteilung, damit Material gezielt gewählt wird)
  const splitClips = [];
  // P: erste Einstellung des eigentlichen Einstiegs (nach dem Vorspann)
  const P = clips.filter((c) => c.pre).length;
  if (gridPlan) clips[P].grid = true;
  if (chrono) {
    // der chronologische Durchlauf hat die Split-Screens schon mit aufeinanderfolgenden Aufnahmen belegt
    for (const c of clips) if (c.splitIds && c.splitIds.length >= 2) splitClips.push(c.i);
  } else {
    if (intro === 'split' && clips.length > 1) splitClips.push(0);
    if (outro === 'split' && clips.length > 2) splitClips.push(clips.length - 1);
  }
  if (s.split !== 'off' && !flight && !chrono) {
    const every = s.split === 'more' ? 3 : 5;
    let since = every;
    for (const c of clips) {
      since++;
      if (c.vid || c.gridMid || c.stack || c.miniRew || (clips[c.i - 1] && (clips[c.i - 1].gridMid || clips[c.i - 1].miniRew)) || c.i <= P + (gridPlan ? 1 : leader ? 3 : reveal ? 2 : 0) || c.i === clips.length - 1 || splitClips.includes(c.i)) continue;
      const peak = c.label === 'drop' || c.label === 'chorus';
      if (peak && c.end - c.start >= Math.max(1.4, beatDur * 3) && (c.sectionChange || since >= every)) { splitClips.push(c.i); since = 0; }
    }
  }

  // Medienauswahl
  const mustIds = new Set([settings.hookId].filter(Boolean));
  const byId = new Map(pool.map((m) => [m.id, m]));
  // Reisefilm: hat ein Ort mehr Einstellungen als Aufnahmen, verschmilzt eine doppelte Einstellung mit ihrem Nachbarn
  // (das Bild steht länger, der Schnitt bleibt auf dem Schlag) – keine Wiederholung. Ein Serienstück, das dabei lang
  // wird, wird wieder eine normale Einstellung (mit Kamerabewegung).
  const mergeDupes = () => {
    const seenC = new Set(), splitObjs = splitClips.map((i) => clips[i]);
    let merged = 0;
    const simple = (x) => x && x.mediaId && !x.flash && !x.split && !x.stack && !x.recap && !x.grid && !x.gridMid && !x.miniRew && !x.absorbed;
    const ext = (x) => x && !x.flash && !x.absorbed && !x.stack && !x.grid && !x.gridMid && !x.miniRew && !x.vsplitIds && (x.mediaId || x.splitIds);
    const fits = (x, len) => { const m = byId.get(x.mediaId); return (x.splitIds && !x.vid) || x.split || (m && (m.kind === 'image' || videoSpan(m) >= len + 0.1)); };
    const grow = (x) => { if (x.burst && x.end - x.start > beatDur * 1.5) x.burst = false; };
    for (let k = 0; k < clips.length; k++) {
      const c = clips[k];
      if (!simple(c)) { if (c.mediaId && !c.recap && !c.flash) seenC.add(c.mediaId); continue; }
      if (seenC.has(c.mediaId) && !c.chapter) {
        let j = k - 1; while (j >= 0 && clips[j].absorbed) j--;
        const pv = clips[j];
        // der Rückblick darf nur den letzten Platz übernehmen (sein letztes Bild wird zum Schlussbild)
        if (ext(pv) && (!pv.recap || k === clips.length - 1) && fits(pv, c.end - pv.start)) { pv.end = c.end; grow(pv); c.absorbed = true; merged++; continue; }
        const nx = clips[k + 1];
        if (ext(nx) && !nx.recap && !nx.chapter && nx.mediaId !== c.mediaId && fits(nx, nx.end - c.start)) { nx.start = c.start; grow(nx); c.absorbed = true; merged++; continue; }
      }
      seenC.add(c.mediaId);
    }
    if (merged) {
      for (let k = clips.length - 1; k >= 0; k--) if (clips[k].absorbed) clips.splice(k, 1);
      clips.forEach((c, k) => { c.i = k; });
      splitClips.length = 0;
      for (const o of splitObjs) if (clips.includes(o)) splitClips.push(o.i);
    }
    return merged;
  };

  let order = [];
  let hook = null;
  if (flightRoles) {
    flightRoles.forEach((r, i) => {
      const c = clips[i];
      if (!c) return;
      c.role = r.startsWith('extra:') ? 'extra' : r;
      c.mediaId = r === 'takeoff' ? flight.takeoffId : r === 'landing' ? flight.landingId : r === 'anim' ? null : r.slice(6);
      if (c.mediaId && !byId.has(c.mediaId)) c.mediaId = null;
      if (r === 'anim') c.flightAnim = true;
    });
    hook = byId.get(flight.takeoffId) || null;
  } else if (chapters && chapters.length) {
    // Anteil je Ort nach Menge des Materials, gedämpft und mit Grundanteil: kein Ort erdrückt die anderen, auch ein
    // kleiner Ort bekommt seinen Moment
    const weights = chapters.map((c) => Math.pow(c.media.length + 15, 0.7));
    const tw = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    const bounds = [0];
    for (let c = 0; c < chapters.length - 1; c++) {
      acc += weights[c];
      const idealT = (acc / tw) * D;
      const prevB = bounds[bounds.length - 1];
      let bi = -1, bw = -Infinity;
      for (let k = prevB + 2; k <= clips.length - 2; k++) {
        if (clips[k].stack || clips[k].miniRew || clips[k - 1].miniRew || clips[k].vid) continue;
        const dt = Math.abs(clips[k].start - idealT);
        if (dt > Math.max(4, barDur * 2)) continue;
        const w = clips[k].weight + (clips[k].sectionChange ? 10 : 0) - dt * 2;
        if (w > bw) { bw = w; bi = k; }
      }
      if (bi < 0) { bi = prevB + 1; let bd = Infinity; for (let k = prevB + 1; k < clips.length - 1; k++) { const d = Math.abs(clips[k].start - idealT); if (d < bd) { bd = d; bi = k; } } }
      bounds.push(Math.max(prevB + 1, Math.min(clips.length - 1, bi)));
    }
    bounds.push(clips.length);
    // „Durch den Namen“ je Kapitel: die erste Einstellung eines Ortes braucht Zeit zum Lesen und für den Zoom
    if (s.chapKnock === 'on') {
      const need = Math.max(3.2, barDur * 1.75);
      const starts = bounds.slice(0, -1).map((b) => clips[b]);
      const splitObjs = splitClips.map((i) => clips[i]);
      for (let c = 1; c < chapters.length; c++) {
        const b = bounds[c];
        let j = b + 1;
        while (clips[b].end - clips[b].start < need && j < bounds[c + 1] - 1) {
          const nx = clips[j];
          if (nx.vid || nx.stack || nx.miniRew || nx.gridMid || splitObjs.includes(nx)) break;
          clips[b].end = nx.end; nx.absorbed = true; j++;
        }
      }
      for (let k = clips.length - 1; k >= 0; k--) if (clips[k].absorbed) clips.splice(k, 1);
      clips.forEach((c, k) => { c.i = k; });
      starts.forEach((c, k) => { bounds[k] = clips.indexOf(c); });
      bounds[bounds.length - 1] = clips.length;
      splitClips.length = 0;
      for (const o of splitObjs) if (clips.includes(o)) splitClips.push(o.i);
    }
    for (let c = 0; c < chapters.length; c++) {
      const idxs = [];
      for (let k = bounds[c]; k < bounds[c + 1]; k++) if (!clips[k].stack && !clips[k].miniRew && !clips[k].recap && !clips[k].flash) idxs.push(k);
      const cnt = idxs.length;
      let chMedia = chapters[c].media;
      const stC = clips.slice(bounds[c], bounds[c + 1]).find((x) => x.stack);
      if (stC) {
        const imgsC = orderChrono(chMedia.filter((m) => m.kind === 'image' && !m.bad && !m.excluded));
        const res = imgsC.length >= cnt + 3 ? imgsC.slice(Math.max(0, Math.round(imgsC.length / 2) - 2)).slice(0, 4) : [];
        stC.stack.reserved = res.map((m) => m.id);
        chMedia = chMedia.filter((m) => !res.includes(m));
      }
      // Videos eines Orts sind seine lebendigsten Momente: sicher im Kapitel, solange sie höchstens 60 % der Plätze brauchen
      const vC = chMedia.filter((m) => m.kind === 'video' && !m.bad && !m.excluded);
      const sel = spreadSimilar(flowOrder(selectMedia(chMedia, cnt, new Set(vC.length <= cnt * 0.6 ? vC.map((m) => m.id) : [])), s.match !== 'off'));
      if (sel.length) assignStream(clips, idxs, sel, byId);
      // Tagesabschnitte des Orts in ihrer Reihenfolge (innerhalb eines Abschnitts bleibt der Bildfluss der Regie);
      // ein Video nur auf einer Einstellung, die lang genug ist
      {
        const cl = idxs.map((k) => clips[k]).filter((x) => x.mediaId && !x.split && !x.burst && !x.grid && !x.stack && !x.gridMid);
        const ms = cl.map((x) => byId.get(x.mediaId)).filter(Boolean);
        if (ms.length === cl.length && ms.length > 2) {
          const blockT = new Map();
          const blk = (m) => (lied ? '' : dayBlock(m) || '');
          for (const m of ms) { const k = blk(m); blockT.set(k, Math.min(blockT.get(k) ?? Infinity, m.time || 0)); }
          const order = ms.map((m, k) => ({ m, k, bt: blockT.get(blk(m)) })).sort((a, b) => a.bt - b.bt || a.k - b.k).map((x) => x.m);
          // Videos zuerst: die lange genug Einstellung, die ihrem Platz in der Reihenfolge am nächsten liegt
          const free = new Set(cl.map((_, j) => j));
          order.forEach((m, r) => {
            if (m.kind !== 'video') return;
            let best = -1, bd = Infinity;
            for (const j of free) { const len = cl[j].end - cl[j].start; const d = Math.abs(j - r) + (len >= 1.5 ? 0 : 1000) - (cl[j].vid ? 0.5 : 0); if (d < bd) { bd = d; best = j; } }
            cl[best].mediaId = m.id; free.delete(best);
          });
          // Fotos der Reihe nach auf die übrigen Einstellungen
          const imgs = order.filter((m) => m.kind !== 'video');
          let q = 0;
          for (let j = 0; j < cl.length; j++) if (free.has(j)) cl[j].mediaId = imgs[q++].id;
        }
      }
      clips[bounds[c]].chapter = chapters[c].title; clips[bounds[c]].chapterNo = c + 1; clips[bounds[c]].role = 'chapter';
      for (let k = bounds[c]; k < bounds[c + 1]; k++) clips[k].chap = c;
    }
    mergeDupes();
    hook = byId.get(clips[0].mediaId) || null;
  } else if (chrono) {
    // Aufnahmen aus dem chronologischen Durchlauf übernehmen
    hook = chronoInfo.hook;
    order = chronoInfo.queue;
    for (const c of clips) c.mediaId = c.splitIds ? c.splitIds[0] : c.pre_mediaId;
    const hookAt = intro === 'split' ? -1 : rush ? P + clips.filter((c) => c.rush).length : reveal ? P + clips.filter((c) => c.reveal).length : leader ? P + 3 : gridPlan ? P + 1 : P;
    if (hook && clips[hookAt]) { clips[hookAt].mediaId = hook.id; clips[hookAt].role = 'hook'; }
    if (leader && hook) {
      // Countdown: darunter blitzen andere Motive auf (Vorgeschmack), danach das Startbild in Farbe
      const others = order.filter((m) => m && m !== hook && m.kind === 'image');
      for (let i = 0; i < 3; i++) if (clips[P + i]) { clips[P + i].mediaId = others.length ? others[(i * 5) % others.length].id : hook.id; clips[P + i].role = 'leader'; }
    }
  } else {
    for (const c of clips) if (c.vid) mustIds.add(c.vid);
    // Polaroid-Stapel: vier Fotos aus der Zeit, in der der Stapel im Film liegt, vorab zurücklegen
    const stackC = clips.find((c) => c.stack);
    let reserved = [];
    if (stackC) {
      const imgsC = orderChrono(goodMedia(usable, gAll).filter((m) => m.kind === 'image' && !mustIds.has(m.id) && m.id !== settings.hookId));
      const top = imgsC.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      const cand = imgsC.filter((m) => m !== top);
      if (cand.length >= 7) { const at = Math.round((stackC.start / D) * (cand.length - 4)); reserved = cand.slice(at, at + 4); }
      stackC.stack.reserved = reserved.map((m) => m.id);
    }
    const chosen = selectMedia(pool.filter((m) => !reserved.includes(m)), clips.filter((c) => !c.flash).length - splitClips.length + 2, mustIds);
    // automatisches Startbild: kein Video, das ohnehin einen eigenen Platz hat (es liefe sonst doppelt oder der Platz bliebe leer)
    const hookCand = chosen.filter((m) => !clips.some((c) => c.vid === m.id));
    hook = settings.hookId && byId.get(settings.hookId) ? byId.get(settings.hookId) : (hookCand.length ? hookCand : chosen).slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
    const rest = spreadSimilar(flowOrder(chosen.filter((m) => m !== hook), s.match !== 'off'));
    // eigene Reihenfolge aus der Zeitleiste gilt auch bei „Beste Auswahl“
    order = applyMoves(applyOrder(hook ? [hook, ...rest] : rest, overrides.order), overrides.moves);
    // zweitbestes Motiv auf den ersten Drop/Refrain
    const dropIdx = clips.findIndex((c) => (c.label === 'drop' || c.label === 'chorus') && c.sectionChange);
    if (dropIdx > 1 && rest.length > 2 && !(overrides.order || []).length && !(overrides.moves || []).length) {
      const best2 = rest.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      const at = order.indexOf(best2);
      if (at > 0) { order.splice(at, 1); order.splice(Math.min(dropIdx, order.length), 0, best2); }
    }
    // Einstellungen, die der Einstieg ohnehin fest belegt (Startbild, Aufblende, Countdown, Vorspann), nicht verteilen:
    // sonst würde ein Bild dort vergeben, gleich überschrieben und fehlte dann im Film
    const hookAt = hook && intro !== 'split' ? (rush ? P + clips.filter((c) => c.rush).length : reveal ? P + clips.filter((c) => c.reveal).length : leader ? P + 3 : gridPlan ? P + 1 : P) : -1;
    const fixedIdx = (c) => c.i === hookAt || c.flash || c.reveal || c.pre || c.miniRew || c.stack || c.rush || (leader && c.i >= P && c.i < P + 3) || (gridPlan && c.i === P);
    const idxs = clips.map((c) => c.i).filter((i) => !(splitClips.includes(i) && i !== 0) && !clips[i].gridMid && !fixedIdx(clips[i]));
    if (order.length) assignStream(clips, idxs, hookAt >= 0 ? order.filter((m) => m !== hook) : order, byId);
    if (hookAt >= 0 && clips[hookAt]) clips[hookAt].mediaId = hook.id;
    if (hook && intro !== 'split' && clips[P] && !clips[P].rush) { clips[P].mediaId = hook.id; clips[P].role = 'hook'; }
    if (rush && hook && clips[hookAt]) clips[hookAt].role = 'hook';
    if (leader && hook && clips[P + 3]) {
      // Nach dem Countdown kommt das stärkste Bild in Farbe; der Vorspann zeigt andere Motive
      const others = order.filter((m) => m && m !== hook);
      for (let i = 0; i < 3; i++) { clips[P + i].mediaId = others.length ? others[i % others.length].id : hook.id; clips[P + i].role = 'leader'; }
      clips[P + 3].mediaId = hook.id; clips[P + 3].role = 'hook';
    }
    if (gridPlan && hook && clips[P + 1]) {
      // Das Zielbild des Rasters läuft nach dem Zoom als erste Vollbild-Einstellung weiter
      const was = clips[P + 1].mediaId;
      clips[P + 1].mediaId = hook.id; clips[P + 1].role = 'hook';
      clips[P].mediaId = was && was !== hook.id ? was : clips[P].mediaId;
    }
  }
  if (reveal) {
    // Aufblende: erst das Detail eines anderen starken Bilds, dann ein Detail des Highlights, dann das Highlight ganz
    const R = clips.filter((c) => c.reveal);
    const hi = clips[P + R.length];
    const hl = hi && byId.get(hi.mediaId) ? byId.get(hi.mediaId) : hook;
    if (hi && hl) { hi.mediaId = hl.id; hi.role = 'hook'; }
    const others = pool.filter((m) => !m.excluded && m !== hl && !m.bad).sort((a, b) => (b.sharp || 0) + (b.color || 0) - (a.sharp || 0) - (a.color || 0));
    R.forEach((c, k) => {
      const m = k === R.length - 1 ? hl : others[k] || hl;
      c.mediaId = m ? m.id : null;
      c.role = 'reveal';
    });
  }
  // Sicherheitsnetz: ein Video mit eigenem Platz, das ein Einstieg überschrieben hat, bekommt die längste freie ruhige Einstellung
  if (!chapters || !chapters.length) {
    for (const c of clips) {
      if (!c.vid || clips.some((x) => x.mediaId === c.vid)) continue;
      const cand = clips.filter((x) => x.i > P + 1 && !x.pre && !x.leader && !x.reveal && !x.grid && !x.burst && !x.stack && !x.miniRew && !splitClips.includes(x.i) && x.role !== 'hook' && !(byId.get(x.mediaId) && byId.get(x.mediaId).kind === 'video'))
        .sort((a, b) => (isCalmLabel(b.label) - isCalmLabel(a.label)) || (b.end - b.start) - (a.end - a.start))[0];
      if (cand) cand.mediaId = c.vid;
    }
  }
  if (pre && P) {
    const main = clips.slice(P).map((c) => byId.get(c.mediaId)).filter(Boolean);
    const first = byId.get(clips[P].mediaId);
    if (pre.kind === 'countdown') {
      const others = main.filter((m) => m !== first && m !== hook);
      for (let i = 0; i < P; i++) { clips[i].mediaId = (others[i % Math.max(1, others.length)] || first || {}).id || null; clips[i].role = 'leader'; }
    } else if (pre.kind === 'shutter' && shutter) {
      // Wand: immer die stärksten Aufnahmen, die stärkste vorn (hält den Blick) – nicht chronologisch.
      // Höchstens drei Videos (sonst ruckelt es auf dem Handy), keine Beinahe-Doppel nebeneinander.
      const strength = (m) => (m.score || 0.5) + (m.fav ? 0.25 : 0) + (m.kind === 'video' ? 0.04 : 0);
      const rank = goodMedia(usable, gAll).slice().sort((a, b) => strength(b) - strength(a));
      const twin = (a, b) => sameMotif(a, b) || (a.hash && b.hash && hamming(a.hash, b.hash) < 10);
      const pick = [];
      for (const m of rank) {
        if (pick.length >= SHUTTER.tiles.length) break;
        if (m.kind === 'video' && pick.filter((x) => x.kind === 'video').length >= 3) continue;
        if (pick.some((x) => twin(x, m))) continue;
        pick.push(m);
      }
      for (const m of rank) if (pick.length < SHUTTER.tiles.length && !pick.includes(m)) pick.push(m);
      const all = pick.length ? pick : (first ? [first] : []);
      while (all.length && all.length < SHUTTER.tiles.length) all.push(all[all.length % Math.max(1, pick.length)]);
      const ids = all.map((m) => m.id);
      // drei Züge auf den Schlägen, je ein Drittel von oben und unten zugleich; jeder Zug kurz und weich aufgesetzt
      const mv = Math.min(0.3, shutter.u * 0.55);
      const moves = shutter.pulls.map((t, k) => ({ t, dur: mv, from: k / 3, to: (k + 1) / 3 }));
      const c = clips[0];
      c.split = { ids, orient: 'wall', reveal: shutter.reveal.slice(0, ids.length), colorAt: shutter.colorAt.slice(0, ids.length), shutter: { moves, closedAt: shutter.pulls[2] + mv } };
      c.mediaId = ids[0];
      c.role = 'wall';
      shutter.moves = moves;
    } else {
      // Vorgeschmack: der spannendste Moment (gern ein Video), danach die Bilder des Films rückwärts
      const cand = main.filter((m) => m !== first && m !== hook);
      const tease = cand.filter((m) => m.kind === 'video').sort((a, b) => (b.score || 0) - (a.score || 0))[0] || cand.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0] || first;
      clips[0].mediaId = tease ? tease.id : null; clips[0].role = 'tease';
      const back = [];
      for (let i = clips.length - 1; i >= P; i--) { const m = byId.get(clips[i].mediaId); if (m && m.kind === 'image' && !back.includes(m) && m !== tease) back.push(m); }
      const n = P - 1;
      for (let i = 0; i < n; i++) {
        const m = back.length ? back[Math.min(back.length - 1, Math.floor((i * back.length) / n))] : tease;
        clips[1 + i].mediaId = m ? m.id : null; clips[1 + i].role = 'rew';
      }
    }
  }

  // Mini-Rewind: die Bilder davor rauschen rückwärts vorbei, auf dem Einsatz steht noch einmal der beste Moment
  const miniC = clips.filter((c) => c.miniRew);
  if (miniC.length) {
    const f = miniC[0].i;
    const back = [];
    for (let j = f - 1; j >= 0 && back.length < miniC.length; j--) {
      const x = clips[j];
      // nur Fotos: ein Video würde hier nur als Standbild vorbeirauschen
      if (x.mediaId && !x.grid && !x.split && !x.stack && !x.strip && !x.flightAnim && byId.get(x.mediaId) && byId.get(x.mediaId).kind === 'image') back.push(x.mediaId);
    }
    miniC.forEach((c, k) => { c.mediaId = back.length ? back[Math.min(k, back.length - 1)] : c.mediaId; c.role = 'rew'; });
    const hit = clips[f + miniC.length];
    const best = [hook, ...pool.filter((m) => m.kind === 'image' && !m.excluded && !m.bad).sort((a, b) => (b.score || 0) - (a.score || 0))].find((m) => m && m.kind === 'image');
    if (hit && best && !hit.vid && !hit.split && !hit.grid && !hit.stack) { hit.mediaId = best.id; hit.replay = true; }
  }

  // Bilderflut: ein Vorgeschmack auf die ganze Reise – Fotos quer durch die Zeit, in ihrer Reihenfolge
  const rushC = clips.filter((c) => c.rush);
  if (rushC.length && rush && rush.welcome) {
    // „Welcome to…“: zehn Ausschnitte, die zueinander passen (ähnliche Farbe und Helligkeit, Videos bevorzugt), eine
    // weiche Kette vom stärksten aus; danach das weiterlaufende Video; zu den Schriftwechseln weitere passende Bilder
    const hookC = clips.find((c) => c.role === 'hook');
    const pool = goodMedia(usable, gAll).filter((m) => !hookC || m.id !== hookC.mediaId);
    const dist = (a, b) => (a.avg && b.avg ? Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) : 60) + 120 * Math.abs((a.luma || 0.45) - (b.luma || 0.45));
    const seed = pool.slice().sort((a, b) => (b.score || 0) + (b.kind === 'video' ? 0.1 : 0) - (a.score || 0) - (a.kind === 'video' ? 0.1 : 0))[0];
    const chain = [], left = pool.filter((m) => m !== seed);
    if (seed) chain.push(seed);
    while (left.length && chain.length < 10) {
      const last = chain[chain.length - 1];
      let bi = 0, bv = Infinity;
      left.forEach((m, k) => { const v = dist(last, m) * 0.6 + dist(seed, m) * 0.4 - (m.kind === 'video' ? 12 : 0); if (v < bv) { bv = v; bi = k; } });
      chain.push(left.splice(bi, 1)[0]);
    }
    const tail = chain[chain.length - 1];
    const lastV = left.filter((m) => m.kind === 'video' && videoSpan(m) >= 1.5).sort((a, b) => dist(tail || a, a) - dist(tail || b, b))[0] || chain.find((m) => m.kind === 'video');
    const rest = left.filter((m) => m !== lastV).sort((a, b) => dist(lastV || seed, a) - dist(lastV || seed, b));
    const cyc = rest.length ? rest : chain;
    let ci = 0;
    rushC.forEach((c, k) => {
      const m = c.welcome === 'a' ? chain[k % Math.max(1, chain.length)] : c.welcome === 'last' ? lastV || chain[0] : cyc[ci++ % Math.max(1, cyc.length)];
      if (m) c.mediaId = m.id;
      c.role = 'rush';
    });
  } else if (rushC.length) {
    const hookC = clips.find((c) => c.role === 'hook');
    const fotos = orderChrono(goodMedia(usable, gAll).filter((m) => m.kind === 'image' && (!hookC || m.id !== hookC.mediaId)));
    const src = fotos.length ? fotos : goodMedia(usable, gAll).filter((m) => m.kind === 'image');
    rushC.forEach((c, k) => {
      const m = src.length ? src[Math.floor((k * src.length) / rushC.length) % src.length] : null;
      c.mediaId = m ? m.id : c.mediaId; c.role = 'rush';
    });
  }

  // Rückblick: je Ort die stärksten Bilder, in der Reihenfolge der Reise
  const recapC = clips.filter((c) => c.recap);
  if (recapC.length && chapters) {
    const per = Math.max(1, Math.round(recapC.length / chapters.length));
    const picks = [];
    for (const ch of chapters) picks.push(...ch.media.filter((m) => m.kind === 'image' && !m.bad && !m.excluded).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, per));
    recapC.forEach((c, k) => { const m = picks[k % Math.max(1, picks.length)]; if (m) { c.mediaId = m.id; c.role = 'recap'; } });
    dir.notes.push(`Finale: Rückblick auf die ganze Reise – ${recapC.length} Bilder, das Stärkste jedes Orts, im Takt nacheinander, dann der Abspann.`);
  }

  // Split-Material zuteilen: bevorzugt passende Ausrichtung, wenig benutzt
  // (im Reisefilm nur Aufnahmen des eigenen Orts – kein Bild springt in ein anderes Kapitel)
  const chapOf = chapters && chapters.length ? new Map(chapters.flatMap((ch, ci) => ch.media.map((m) => [m.id, ci]))) : null;
  const ownChap = (c) => (m) => !chapOf || c.chap == null || chapOf.get(m.id) === c.chap;
  const useCount = new Map();
  for (const c of clips) if (c.mediaId) useCount.set(c.mediaId, (useCount.get(c.mediaId) || 0) + 1);
  for (const si of splitClips.sort((a, b) => a - b)) {
    const c = clips[si];
    // Videos mit eigenem Platz nicht zusätzlich im Split-Screen
    const pool2 = goodMedia(usable, gAll).filter(ownChap(c)).filter((m) => !(m.kind === 'video' && clips.some((x) => x.vid === m.id)));
    const fitting = pool2.filter(splitFit);
    // nur Aufnahmen, die sonst nicht zu sehen sind (sonst wäre es eine Doppelung)
    const unusedFit = fitting.filter((m) => !useCount.get(m.id)), unused = pool2.filter((m) => !useCount.get(m.id));
    const src = (unusedFit.length >= 2 ? unusedFit : unused).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    // chronologisch: die aufeinanderfolgenden Aufnahmen aus dem Durchlauf
    const ids = c.splitIds && c.splitIds.length >= 2 ? c.splitIds.slice() : orderChrono(src.slice(0, splitN)).map((m) => m.id);
    if (c.splitIds) for (const id of ids) useCount.set(id, (useCount.get(id) || 1) - 1);
    if (ids.length < 2) {
      // zu wenig freie Aufnahmen: normale Einstellung mit der am wenigsten gezeigten Aufnahme – im Reisefilm, wenn
      // alle Bilder des Orts schon zu sehen sind, verschmilzt der Platz mit dem Nachbarn (keine Wiederholung)
      const pick = pool2.slice().sort((a, b) => (useCount.get(a.id) || 0) - (useCount.get(b.id) || 0) || (b.score || 0) - (a.score || 0))[0];
      const plainImg = (x) => x && !x.split && !x.splitIds && !x.stack && !x.recap && !x.grid && !x.gridMid && !x.burst && !x.absorbed && byId.get(x.mediaId) && byId.get(x.mediaId).kind === 'image';
      if (chapOf && pick && useCount.get(pick.id)) {
        const pv = clips[si - 1], nx = clips[si + 1];
        if (plainImg(pv)) { pv.end = c.end; c.absorbed = true; continue; }
        if (plainImg(nx) && !nx.chapter) { nx.start = c.start; c.absorbed = true; continue; }
      }
      if (pick) { c.mediaId = pick.id; useCount.set(pick.id, (useCount.get(pick.id) || 0) + 1); }
      continue;
    }
    for (const id of ids) useCount.set(id, (useCount.get(id) || 0) + 1);
    const bts = [];
    for (const b of an.beats) { const t = b - win.start; if (t >= c.start - 0.01 && t < c.end - 0.3) bts.push(t); }
    const reveal = ids.map((_, k) => (bts[k] != null ? bts[k] : c.start + k * beatDur));
    if (si === 0) reveal[0] = -1; // erstes Feld steht vom ersten Bild an, kein schwarzer Start
    c.split = { ids, orient: vertical ? 'stack' : 'row', reveal };
    c.mediaId = ids[0];
    // Split am Anfang: öffnet sich danach nicht, sondern schneidet hart weiter
  }

  if (clips.some((c) => c.absorbed)) {
    const splitObjs = splitClips.map((i) => clips[i]);
    for (let k = clips.length - 1; k >= 0; k--) if (clips[k].absorbed) clips.splice(k, 1);
    clips.forEach((c, k) => { c.i = k; });
    splitClips.length = 0;
    for (const o of splitObjs) if (clips.includes(o)) splitClips.push(o.i);
  }

  // Polaroid-Stapel: nur Aufnahmen, die sonst nicht zu sehen sind; sonst wird es eine normale Einstellung
  for (const c of clips) {
    if (!c.stack) continue;
    // chronologisch vorab zugeteilt: genau diese Fotos (auch wenn eine Vorschau wie die Bilderflut sie schon kurz zeigte)
    const res0 = (c.stack.reserved || []).map((id) => byId.get(id)).filter((m) => m && (chrono || !useCount.get(m.id)));
    const free = res0.length >= 3 ? res0 : goodMedia(usable, gAll).filter(ownChap(c)).filter((m) => m.kind === 'image' && !useCount.get(m.id)).sort((a, b) => (b.score || 0) - (a.score || 0));
    if (free.length < 3) {
      c.stack = null;
      const pick = goodMedia(usable, gAll).filter(ownChap(c)).filter((m) => m.kind === 'image').sort((a, b) => (useCount.get(a.id) || 0) - (useCount.get(b.id) || 0) || (b.score || 0) - (a.score || 0))[0];
      // Reisefilm: sind alle Bilder des Orts schon zu sehen, verschmilzt der Platz mit dem Nachbarn (keine Wiederholung)
      if (chapOf && pick && useCount.get(pick.id)) {
        const plainImg = (x) => x && !x.split && !x.stack && !x.recap && !x.grid && !x.gridMid && !x.absorbed && byId.get(x.mediaId) && byId.get(x.mediaId).kind === 'image';
        const pv = clips[c.i - 1], nx = clips[c.i + 1];
        if (plainImg(pv)) { pv.end = c.end; c.absorbed = true; continue; }
        if (plainImg(nx) && !nx.chapter) { nx.start = c.start; c.absorbed = true; continue; }
      }
      if (pick) { c.mediaId = pick.id; useCount.set(pick.id, (useCount.get(pick.id) || 0) + 1); }
      continue;
    }
    // vorab zugeteilt: in der Reihenfolge des Schnitts (enthält sie eine eigene Verschiebung, gilt deine Reihenfolge)
    const ids = (res0.length >= 3 ? free.slice(0, 4) : orderChrono(free.slice(0, 4))).map((m) => m.id);
    for (const id of ids) useCount.set(id, 1);
    c.stack = {
      ids, times: c.stack.times.slice(0, ids.length), fall: Math.min(0.34, beatDur * 0.8),
      rots: ids.map((_, k) => (k % 2 ? 1 : -1) * (0.025 + 0.05 * rng())),
      offs: ids.map(() => [(rng() - 0.5) * 0.12, (rng() - 0.5) * 0.07]),
    };
    c.mediaId = ids[ids.length - 1];
    c.role = 'stack';
    dir.notes.push(`Polaroid-Stapel bei ${fmtMS(c.start)}: ${ids.length} Fotos fallen im Takt als Abzüge übereinander.`);
  }

  if (clips.some((c) => c.absorbed)) {
    const splitObjs = splitClips.map((i) => clips[i]);
    for (let k = clips.length - 1; k >= 0; k--) if (clips[k].absorbed) clips.splice(k, 1);
    clips.forEach((c, k) => { c.i = k; });
    splitClips.length = 0;
    for (const o of splitObjs) if (clips.includes(o)) splitClips.push(o.i);
  }
  {
    const sz = [0, 0, 0];
    for (const c of clips) { const m = byId.get(c.mediaId); if (m && m.kind === 'image' && !c.burst && !c.rush) sz[shotSize(m)]++; }
    if (sz.filter(Boolean).length >= 2 && sz[0] + sz[1] + sz[2] >= 6) dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `Einstellungsgrößen im Wechsel: ${sz[0]} Totalen, ${sz[1]} halbnah, ${sz[2]} Details; neue Szenen beginnen möglichst mit einer Totale.`);
  }
  const splitDone = clips.filter((c) => c.split).length;
  if (splitDone) dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `${splitDone} Split-Screen${splitDone > 1 ? 's' : ''}: ${vertical ? 'Queraufnahmen erscheinen übereinander' : 'Hochkant-Aufnahmen erscheinen nebeneinander'}, Bild für Bild im Takt.`);

  // Nutzer-Overrides
  for (const c of clips) {
    const o = ovL[c.i];
    if (o && o.mediaId && byId.has(o.mediaId) && !byId.get(o.mediaId).excluded) { c.mediaId = o.mediaId; delete c.split; }
  }
  // „Gefällt mir nicht“ bei „Beste Auswahl“: ein anderes, noch ungenutztes Foto aus derselben Zeit
  if (!allOn) {
    const used = new Set(clips.map((c) => c.mediaId));
    for (const c of clips) {
      const o = ovOf(c);
      if (!o || !o.again || o.mediaId || c.split || c.grid || c.burst || c.stack || c.rush) continue;
      const cur = byId.get(c.mediaId);
      if (!cur || cur.kind !== 'image') continue;
      const alts = goodMedia(usable, false).filter((m) => m.kind === 'image' && !used.has(m.id))
        .sort((a, b) => Math.abs((a.time || 0) - (cur.time || 0)) - Math.abs((b.time || 0) - (cur.time || 0))).slice(0, 3);
      const alt = alts[(o.again - 1) % Math.max(1, alts.length)];
      if (alt) { used.delete(c.mediaId); c.baseId = c.mediaId; c.mediaId = alt.id; used.add(alt.id); c.again = true; }
    }
  }

  // Raster füllen (Einstieg und im Film): Zielbild in der Mitte (bzw. zuletzt), die übrigen nach Qualität und Nähe, Fotos bevorzugt
  const fillGrid = (gi, gp, intro) => {
    const c0 = clips[gi], next = clips[gi + 1];
    if (!c0 || !next) return;
    const target = byId.get(next.mediaId);
    const tiles = gp.n * gp.n;
    const pool2 = goodMedia(usable, gAll).filter((m) => m !== target && (m.kind === 'image' || m.poster));
    const tt = target && target.time ? target.time : 0;
    const others = c0.gridIds && c0.gridIds.length ? c0.gridIds.map((id) => byId.get(id)).filter(Boolean).slice(0, tiles - 1)
      : pool2.sort((a, b) => (a.kind === 'image' ? 0 : 1) - (b.kind === 'image' ? 0 : 1) || (intro ? (b.score || 0) - (a.score || 0) : Math.abs((a.time || 0) - tt) - Math.abs((b.time || 0) - tt))).slice(0, tiles - 1);
    const center = gp.n === 3 ? 4 : 3;
    const cells = orderChrono(others).map((m) => m.id);
    cells.splice(center, 0, target ? target.id : null);
    while (cells.length < tiles) cells.push(cells[cells.length % Math.max(1, cells.length)] || null);
    // Reihenfolge des Einfärbens: zufällig verteilt, Zielbild zuletzt
    const orderIdx = Array.from({ length: tiles }, (_, k) => k).filter((k) => k !== center);
    for (let k = orderIdx.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [orderIdx[k], orderIdx[j]] = [orderIdx[j], orderIdx[k]]; }
    orderIdx.push(center);
    const colorAt = new Array(tiles);
    orderIdx.forEach((cell, k) => { colorAt[cell] = gp.times[k]; });
    c0.grid = { n: gp.n, ids: cells, colorAt, target: center, zoomStart: gp.zoomStart, zoomEnd: gp.zoomEnd };
    c0.mediaId = target ? target.id : c0.mediaId;
    next.afterGrid = true;
    const where = intro ? 'Einstieg' : `${SEC_DE[next.label] || 'Refrain'} bei ${fmtMS(c0.start)}`;
    dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `${where} im ${gp.n === 3 ? '9er' : '4er'}-Raster: die Bilder werden Beat für Beat farbig, dann zoomt der Film ins ${gp.n === 3 ? 'mittlere' : 'letzte'} Bild${intro && Math.abs(next.start - gp.zoomEnd) < 0.01 && next.label !== c0.label ? ` und landet genau auf dem ${SEC_DE[next.label] || 'Einsatz'}` : ''}.`);
  };
  if (gridPlan && clips.length > 1) fillGrid(P, gridPlan, true);
  for (const c of clips) if (c.gridMid) fillGrid(c.i, c.gridMid, false);

  // Film-Strip-Ende: das letzte Bild wird zum Negativ auf einem Filmstreifen, der rückwärts durch den Film läuft
  if (outro === 'strip' && !flight && clips.length > 3) {
    const lastC = clips[clips.length - 1];
    const ids = [];
    for (let i = clips.length - 2; i >= 0 && ids.length < 10; i--) {
      const c = clips[i];
      for (const id of c.split ? c.split.ids : [c.mediaId]) if (id && !ids.includes(id) && byId.has(id)) ids.push(id);
    }
    if (ids.length >= 3) { lastC.strip = { ids }; lastC.mediaId = ids[0]; }
  }

  // Anordnung: nach Tageszeit (Standard) ordnet die Regie innerhalb jedes Tagesblocks frei wie ein Cutter,
  // streng chronologisch nur der Wir-Tausch mit nahen Nachbarn
  const usOn = !flight && s.us !== 'off';
  const byTime = s.order !== 'streng' && !flight;
  // verschobene Aufnahmen und ihr Ziel bleiben, wo die Zeitleiste sie hingelegt hat
  const userMoved = new Set((overrides.moves || []).flatMap((x) => [x.id, x.before]).concat(overrides.order || []).filter(Boolean));
  const nUs = usOn ? clips.filter((c) => isUs(byId.get(c.mediaId))).length : 0;
  if (byTime) {
    const ar = arrangeBlocks(clips, { byId, ovOf, moved: userMoved, us: usOn, aspect: outAspect, vary: s.recut ? ((s.seed >>> 0) ^ (s.recut * 2654435761)) >>> 0 : 0, lied, energyAt: lied ? songEnergyAt(an, win) : null });
    // weiche Szenenübergänge bleiben auf ihren Taktanfängen (musikalische Stelle, nicht die Aufnahme)
    if (ar.moved && lied) dir.notes.push(`Reihenfolge zum Lied: ${ar.moved} Aufnahmen so gesetzt, dass die Bildenergie der Songstelle folgt${usOn && nUs ? ', ihr die ruhigen Passagen tragt' : ''}, starke Bilder auf Einsätze und lange Plätze kommen, Momente beieinander bleiben und Nachbarn weich ineinander übergehen – unabhängig vom Aufnahmetag.`);
    else if (ar.moved) {
      dir.notes.push(`Reihenfolge nach Tageszeit: in ${ar.blocks} ${ar.blocks === 1 ? 'Tagesblock' : 'Tagesblöcken'} (Morgen & Mittag bzw. Nachmittag & Abend) ${ar.moved} Aufnahmen so gesetzt, dass${usOn && nUs ? ' ihr die ruhigen Passagen tragt, Natur und Dinge die schnellen,' : ''} Totalen und starke Bilder lange Plätze bekommen, die Bildenergie zur Songstelle passt und nie zwei ähnliche Bilder aufeinander folgen. Die Tage bleiben in ihrer Reihenfolge.`);
    }
  } else if (usOn) {
    const mv = usPolish(clips, { byId, ovOf, moved: userMoved });
    if (nUs) dir.notes.push(`Wir-Vorrang: ${nUs} ${nUs === 1 ? 'Aufnahme' : 'Aufnahmen'} von euch${mv ? ` tragen die ruhigen Passagen (${mv}× mit einem nahen Nachbarn getauscht), Natur und Dinge die schnellen` : ' stehen schon in den ruhigen Passagen'}; ihr bekommt mehr Standzeit und das Schlussbild.`);
  }

  // Feinschliff wie ein Cutter: Standzeit nach Bildinhalt, stärkstes Bild auf den Einsatz und ans Ende
  if (!flight && s.cutter !== 'off') {
    const cp = cutterPolish(clips, { an, win, byId, beatDur, ovOf, moved: userMoved, us: usOn, blocks: lied ? 'moment' : byTime, taps: (overrides.taps || []).map((t) => t - win.start) });
    if (cp.retimed || cp.hero) dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `Feinschliff: ${[cp.retimed ? `${cp.retimed} Schnitte um ein bis zwei Beats verschoben, damit Totalen und starke Bilder wirken und Details knapp bleiben` : '', cp.hero ? `${cp.hero}× das stärkste Bild aus der Nähe auf den Einsatz bzw. ans Ende gesetzt` : ''].filter(Boolean).join('; ')}.`);
  }

  // Wir-Vorrang zum Schluss: eure Fotos auf die langen Plätze in ihrer Nähe
  if (usOn && !flight) {
    const ul = usLength(clips, { byId, ovOf, moved: userMoved, blocks: lied ? 'moment' : byTime, beatDur, beats: Array.from(an.beats).map((x) => x - win.start), taps: (overrides.taps || []).map((t) => t - win.start) });
    if (ul) dir.notes.push(`Wir-Vorrang: ${ul}× euer Foto auf den längeren Platz in seiner Nähe gesetzt.`);
  }

  // Bilderflut füllen: die Aufnahmen, die gleich danach (und davor) lang im Film stehen – ein Blitz-Vorgeschmack auf
  // den Drop. Keine Aufnahme wird dafür verbraucht; nie zweimal dasselbe Bild direkt hintereinander.
  for (let k = 0; k < clips.length; k++) {
    if (!clips[k].flash) continue;
    let e = k; while (e + 1 < clips.length && clips[e + 1].flash) e++;
    const run = clips.slice(k, e + 1), ids = [];
    // aus demselben Tagesabschnitt wie die Einstellung danach (die Geschichte springt nicht)
    const anchor = byId.get((clips[e + 1] || clips[k - 1] || {}).mediaId);
    const blk = anchor && byTime && !lied ? dayBlock(anchor) : null;
    const take = (c) => {
      if (!c || c.flash || c.grid || c.gridMid || c.recap || c.leader || c.pre) return;
      for (const id of c.split ? c.split.ids : c.stack ? c.stack.ids : [c.mediaId]) { const m = byId.get(id); if (m && m.kind === 'image' && !ids.includes(id) && (blk == null || dayBlock(m) === blk)) ids.push(id); }
    };
    for (let d = 1; ids.length < run.length && d < 40; d++) take(clips[e + d]);
    for (let d = 1; ids.length < run.length && d < 40; d++) take(clips[k - d]);
    if (ids.length < 2) for (const m of goodMedia(usable, gAll)) if (m.kind === 'image' && ids.length < run.length && !ids.includes(m.id)) ids.push(m.id);
    run.forEach((c, j) => { const id = ids[j % Math.max(1, ids.length)]; if (id) { c.mediaId = id; c.reuse = true; } });
    if (ids.length) dir.notes.push(`Bilderflut bei ${fmtMS(run[0].start)}: ${run.length} Bilder im Viertelschlag – ein Vorgeschmack auf das, was gleich lang zu sehen ist.`);
    k = e;
  }

  // Mindestlängen nachschleifen: eine schlichte Einstellung in einem ruhigen Teil (Intro, Strophe, Break, Outro) kürzer als
  // zwei Schläge oder ein Video kürzer als 1,2 s bekommt Zeit von Nachbarn – notfalls über eine Kette schlichter Einstellungen
  // (jede Grenze rückt um dieselben ganzen Schläge). Keine Aufnahme geht verloren; Abschnittswechsel, Tipps und Stil-Mittel bleiben.
  if (!flight) {
    const calmL = (c) => c.label === 'intro' || c.label === 'verse' || c.label === 'break' || c.label === 'outro';
    const fixedC = (c) => !c || c.burst || c.rush || c.leader || c.pre || c.miniRew || c.reveal || c.grid || c.gridMid || c.split || c.loop || c.flightAnim || c.stack || c.role === 'hook' || c.replay;
    const tapSet = (overrides.taps || []).map((t) => t - win.start);
    const bRel = Array.from(an.beats).map((b) => b - win.start);
    const locked = (t) => tapSet.some((x) => Math.abs(x - t) < 0.05) || clips.some((c) => c.sectionChange && Math.abs(c.start - t) < 0.05);
    const minOf = (c) => (c.vid ? Math.min(videoSpan(byId.get(c.vid) || {}) || 1.2, Math.max(1.2, beatDur * 2)) : calmL(c) && level < 4 ? beatDur * 2 : beatDur);
    const beatIdx = (t) => { let k = 0, d = Infinity; bRel.forEach((b, i) => { const x = Math.abs(b - t); if (x < d) { d = x; k = i; } }); return k; };
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      if (fixedC(c) || !(c.vid || calmL(c))) continue;
      const want = minOf(c) * 0.95;
      if (c.end - c.start >= want) continue;
      const beatsNeed = Math.max(1, Math.ceil((want - (c.end - c.start)) / beatDur - 0.05));
      let done = false;
      for (const dir of [1, -1]) {
        // Kette in Richtung dir bis zu einer Einstellung mit genug Reserve
        const chain = [];
        for (let k = i + dir; k >= 0 && k < clips.length; k += dir) {
          const n = clips[k];
          const edge = dir > 0 ? n.start : n.end;
          if (fixedC(n) || locked(edge)) break;
          chain.push(n);
          if (n.end - n.start - beatsNeed * beatDur >= minOf(n) - 0.02) break;
          if (chain.length >= 3) { chain.length = 0; break; }
        }
        const last = chain[chain.length - 1];
        if (!last || last.end - last.start - beatsNeed * beatDur < minOf(last) - 0.02) continue;
        // alle Grenzen zwischen c und last um beatsNeed Schläge verschieben (auf echten Schlägen)
        const seq = [c, ...chain];
        for (let q = 0; q < seq.length - 1; q++) {
          const a = dir > 0 ? seq[q] : seq[q + 1], b = dir > 0 ? seq[q + 1] : seq[q];
          const bi = beatIdx(a.end) + dir * beatsNeed;
          if (bi < 0 || bi >= bRel.length) { done = false; break; }
          a.end = bRel[bi]; b.start = bRel[bi];
          done = true;
        }
        if (done) break;
      }
    }
  }

  // Nie zwei gleiche Motive direkt hintereinander (Bildverständnis: Motiv-Fingerabdruck)
  if (!flight) {
    const tw = separateTwins(clips, { byId, ovOf, moved: userMoved, blocks: lied ? 'moment' : byTime });
    if (tw) dir.notes.push(`Abwechslung: ${tw}× ein gleiches Motiv (gleicher Strand, Platz oder Serie) von seinem Nachbarn getrennt.`);
  }

  // Übergänge: aus dem Songaufbau und aus dem, was das vorige Bild zeigt
  let matches = 0, morphs = 0, lastTr = -1, mvSoft = 0;
  for (let i = 1; i < clips.length; i++) {
    const A = clips[i - 1], B = clips[i];
    const stopEnd = (an.stops || []).some((x) => Math.abs(x.end - (win.start + B.start)) < 0.06);
    let tr = chooseTransition({
      labelA: A.label, labelB: B.label, sectionChange: B.sectionChange, weight: B.weight,
      peak: B.label === 'drop' || B.label === 'chorus', pace: s.pace, beatDur,
      lenA: A.end - A.start, lenB: B.end - B.start, stopEnd, simple: effectsOf(s) === 'schlicht',
    }, rng);
    const fixedCut = A.split || B.split || A.grid || A.flightAnim || B.flightAnim || A.burst || B.burst || A.leader || A.pre || B.pre || A.reveal || A.miniRew || B.miniRew || A.stack || B.stack || A.rush || B.rush;
    if (!fixedCut && B.role !== 'chapter') tr = refineTransition(tr, shotRelation(byId.get(A.mediaId), byId.get(B.mediaId)), {
      B, A, beatDur, s, peak: B.label === 'drop' || B.label === 'chorus', rng, morphCount: morphs,
    });
    // aus einem Video in einem ruhigen Teil nicht hart heraus: weich ausblenden
    const mA = byId.get(A.mediaId);
    if (!fixedCut && mA && mA.kind === 'video' && tr.type === TR.CUT && !tr.punch && !tr.match && isCalmLabel(B.label)) tr = { type: TR.DISSOLVE, dur: Math.min(beatDur, 0.45 * (A.end - A.start), 0.45 * (B.end - B.start)), punch: false };
    // Abwechslung ohne Unruhe: derselbe Effekt nie zweimal hintereinander, sondern ein Verwandter aus seiner Familie
    if (tr.type !== TR.CUT && tr.type === lastTr && !fixedCut && effectsOf(s) !== 'schlicht') {
      const fam = [[TR.DISSOLVE, TR.LUMA, TR.LEAK], [TR.WHIP, TR.PUSH, TR.ZOOM], [TR.MORPH, TR.INK, TR.DOUBLE], [TR.DIP, TR.DISSOLVE], [TR.DRIFT, TR.DISSOLVE]].find((f) => f.includes(tr.type));
      if (fam) tr = { ...tr, type: fam[(fam.indexOf(tr.type) + 1) % fam.length] };
    }
    // Drift: in ruhigen Teilen gleitet die Kamera manchmal ohne Halt ins nächste Bild – statt einer Blende oder eines weichen Schnitts
    if (s.drift === 'on' && !fixedCut && B.role !== 'chapter' && !tr.match && isCalmLabel(B.label) && !B.sectionChange && lastTr !== TR.DRIFT && !A.vid && !B.vid) {
      const soft = tr.type === TR.DISSOLVE || tr.type === TR.LUMA || (tr.type === TR.CUT && !tr.punch && rng() < 0.35);
      const dur = Math.min(Math.max(0.4, beatDur * 1.1), 0.45 * (A.end - A.start), 0.45 * (B.end - B.start));
      if (soft && dur >= 0.35 && rng() < 0.6) tr = { type: TR.DRIFT, dur, punch: false };
    }

    // Musikvideo: in ruhigen Teilen geht jede zweite weiche Blende als Doppelbelichtung ineinander über
    if (s.mv === 'on' && !fixedCut && isCalmLabel(B.label) && (tr.type === TR.DISSOLVE || tr.type === TR.LUMA || tr.type === TR.DRIFT) && (mvSoft++ % 2 === 0)) {
      const d = Math.min(beatDur * 1.5, 0.45 * (A.end - A.start), 0.45 * (B.end - B.start));
      if (d >= 0.35) tr = { type: TR.DOUBLE, dur: d, punch: false };
    }
    if (tr.type !== TR.CUT) lastTr = tr.type;
    if (tr.match) { B.matchCut = true; matches++; }
    if (tr.type === TR.MORPH || tr.type === TR.INK || tr.type === TR.DOUBLE) morphs++;
    // „Gefällt mir nicht“: ein anderer, zum Songteil passender Übergang
    const again = (ovOf(B) && ovOf(B).again) || 0;
    if (again && !fixedCut && B.role !== 'chapter') {
      const fam = isCalmLabel(B.label) ? [TR.DISSOLVE, TR.LUMA, TR.LEAK, TR.CUT, TR.DRIFT] : [TR.CUT, TR.WHIP, TR.PUSH, TR.ZOOM];
      const opts = fam.filter((x) => x !== tr.type && (x !== TR.DRIFT || (!A.vid && !B.vid)));
      const type = opts[(again - 1) % opts.length];
      const beats = type === TR.CUT ? 0 : isCalmLabel(B.label) ? 1 : 0.5;
      const dur = Math.min(beatDur * beats, 0.45 * (A.end - A.start), 0.45 * (B.end - B.start));
      tr = { type: dur < 0.1 ? TR.CUT : type, dur: dur < 0.1 ? 0 : dur, punch: type === TR.CUT && !isCalmLabel(B.label) };
    }
    if (fixedCut) tr = { type: TR.CUT, dur: 0, punch: false };
    // Szenenwechsel (anderer Ort/Tageszeit): im Drop ein harter Schnitt mit Impuls, in ruhigen Teilen eine Lichtblende
    else if (B.sceneStart && B.role !== 'chapter' && !tr.match && !B.vid && !A.vid) {
      tr = isCalmLabel(B.label) ? { type: TR.LUMA, dur: Math.min(beatDur * 1.2, 0.45 * (A.end - A.start), 0.45 * (B.end - B.start)), punch: false } : { type: TR.CUT, dur: 0, punch: true };
    }
    // in den Polaroid-Stapel weich hinein; nach dem Mini-Rewind hart auf den Einsatz
    if (B.stack && !A.split && !A.grid && !A.burst) tr = { type: TR.DISSOLVE, dur: Math.min(beatDur, 0.45 * (A.end - A.start), 0.4 * (B.end - B.start)), punch: false };
    if ((A.miniRew && !B.miniRew) || (A.rush && !B.rush)) tr = { type: TR.CUT, dur: 0, punch: true };
    // Aufblende: die Details gehen weich ineinander über, auf dem Höhepunkt ein harter Schnitt
    if (A.reveal && B.reveal) tr = { type: TR.DISSOLVE, dur: Math.min(beatDur * 1.5, 0.45 * (A.end - A.start)), punch: false };
    else if (A.reveal) tr = { type: TR.CUT, dur: 0, punch: true };
    if (B.strip) tr = { type: TR.DISSOLVE, dur: Math.min(0.35, 0.45 * (A.end - A.start)), punch: false };
    if (B.role === 'chapter') tr = { type: TR.DIP, dur: Math.min(beatDur * 1.5, 0.45 * (A.end - A.start), 0.45 * (B.end - B.start)), punch: false };
    const o = ovOf(B);
    if (o && o.trans != null) {
      const beats = o.trans === TR.MORPH || o.trans === TR.INK || o.trans === TR.DOUBLE ? 1.5 : o.trans === TR.DISSOLVE || o.trans === TR.LUMA || o.trans === TR.DIP || o.trans === TR.LEAK ? 1 : 0.5;
      const dur = o.trans === TR.CUT ? 0 : Math.min(beatDur * beats, 0.45 * (A.end - A.start), 0.45 * (B.end - B.start));
      tr = { type: dur < 0.1 ? TR.CUT : o.trans, dur: dur < 0.1 ? 0 : dur, punch: false };
    }
    B.tin = { type: tr.type, dur: tr.dur };
    B.punch = tr.punch;
    A.tout = B.tin;
  }
  if (matches) dir.notes.push(`${matches} Match-Cut${matches === 1 ? '' : 's'}: Bilder mit ähnlichem Aufbau schneiden unsichtbar ineinander, die Kamerabewegung läuft weiter.`);
  if (morphs) dir.notes.push(`${morphs} ${morphs === 1 ? 'Übergang' : 'Übergänge'} „Bild aus Bild“: das nächste Motiv wächst aus dem vorigen heraus.`);
  if (clips.length) {
    clips[0].tin = { type: TR.CUT, dur: 0 };
    clips[clips.length - 1].tout = { type: TR.CUT, dur: 0 };
  }

  // Loop-Ende: letzter Wischer läuft ins erste Bild
  let loopClip = null;
  // mit Vorspann läuft der Loop in die erste Einstellung des Films (nicht in den Vorspann)
  const loopTo = clips[P] && !clips[P].grid ? clips[P] : null;
  if (outro === 'loop' && clips.length > P + 1 && loopTo && !loopTo.split) {
    const last = clips[clips.length - 1];
    const L = Math.min(beatDur * 0.5, (last.end - last.start) * 0.45);
    last.tout = { type: TR.WHIP, dur: L };
    loopClip = { ...loopTo, i: clips.length, pre: null, leader: false, start: D, end: D + 1, tin: last.tout, tout: { type: TR.CUT, dur: 0 }, loop: true, punch: false };
  }

  // Bester Moment eines Videos auf einen Schlag: Versatz so wählen, dass er auf einen Beat im Clip fällt,
  // bevorzugt auf eine Eins; nur wenn das den Ausschnitt kaum verschiebt
  const barsRelV = (an.barStart || []).map((b) => b - win.start);
  // Aktionsmomente der Videos auf Schlag, Snare und Bassdrum (wie ein Cutter, der Bewegung auf die Musik schneidet)
  const grid = hitGrid(an, win);
  let vSynced = 0, vHits = 0;
  const trySync = (m, c, tIn, off0, hi, rate, best) => {
    if (c.rp || !m.hits || !m.hits.length) return null;
    const r = syncVideoOffset(m, c, { tIn, off0, hi, rate, grid, best });
    if (r) { vSynced++; vHits += r.hits; }
    return r;
  };
  const onBeatOffset = (h, off0, hi, c, rate) => {
    let bestOff = off0, bestCost = Infinity;
    for (const b of bts0) {
      if (b < c.start + 0.25 || b > c.end - 0.35) continue;
      const o = h - (b - c.visStart) * rate;
      if (o < -1e-3 || o > hi + 1e-3) continue;
      const cost = Math.abs(o - off0) / Math.max(0.6, c.end - c.start) + (barsRelV.some((x) => Math.abs(x - b) < 0.03) ? 0 : 0.3);
      if (cost < bestCost) { bestCost = cost; bestOff = Math.max(0, Math.min(hi, o)); }
    }
    return bestOff;
  };

  // Bewegung im Video weiterführen: ein Foto neben einem Video fährt in dessen Schwenk-Richtung
  // (Inhalt wandert nach links = Kamera schwenkt nach rechts)
  const panHint = (c) => {
    const vPrev = byId.get(clips[c.i - 1] && clips[c.i - 1].mediaId), vNext = byId.get(clips[c.i + 1] && clips[c.i + 1].mediaId);
    const p = vPrev && vPrev.kind === 'video' && vPrev.pans && vPrev.pans.length ? vPrev.pans[vPrev.pans.length - 1] : vNext && vNext.kind === 'video' && vNext.pans && vNext.pans.length ? vNext.pans[0] : null;
    if (!p || Math.max(Math.abs(p.x), Math.abs(p.y)) < 0.04) return null;
    return Math.abs(p.x) >= Math.abs(p.y) ? (p.x < 0 ? 'right' : 'left') : (p.y < 0 ? 'down' : 'up');
  };

  // Quellen, Tempo, Bewegung, Farbangleichung
  const voice = [];
  const videoCursor = new Map();
  let prevDir = null;
  // Kameratempo aus dem Song: Energie je Beat, über gut einen Takt geglättet und auf den Film normiert.
  // Strophe ruhig, Refrain etwas zügiger – ohne Sprünge an den Schnitten.
  const bRel = [], bEn = [];
  for (let i = 0; i < an.beats.length; i++) { const t = an.beats[i] - win.start; if (t >= -barDur * 2 && t <= D + barDur * 2) { bRel.push(t); bEn.push(an.energy[i] || 0); } }
  const eSm = bRel.map((b) => { let sm = 0, n = 0; for (let k = 0; k < bRel.length; k++) if (Math.abs(bRel[k] - b) <= barDur * 1.25) { sm += bEn[k]; n++; } return n ? sm / n : 0; });
  const eLo = Math.min(...eSm, 1), eHi = Math.max(...eSm, 0);
  const amtK = ({ soft: 0.72, medium: 1, strong: 1.35 }[s.motionAmt] || 1) * (s.pace === 'ruhig' ? 0.9 : s.pace === 'schnell' ? 1.08 : 1);
  const tempoAt = (t) => {
    if (!bRel.length) return amtK;
    let k = 0; while (k < bRel.length - 1 && bRel[k + 1] <= t) k++;
    const k2 = Math.min(bRel.length - 1, k + 1), f = bRel[k2] > bRel[k] ? Math.max(0, Math.min(1, (t - bRel[k]) / (bRel[k2] - bRel[k]))) : 0;
    const e = eSm[k] + (eSm[k2] - eSm[k]) * f;
    return amtK * (0.78 + 0.5 * (eHi > eLo ? (e - eLo) / (eHi - eLo) : 0.5));
  };
  const all = loopClip ? clips.concat([loopClip]) : clips;
  for (const c of all) {
    c.visStart = c.start - (c.tin ? c.tin.dur / 2 : 0);
    c.visEnd = c.end + (c.tout ? c.tout.dur / 2 : 0);
    if (c.loop) continue;
    if (loopClip && c === clips[clips.length - 1]) c.visEnd = c.end;
    const m = byId.get(c.mediaId);
    c.mediaIndex = m ? media.indexOf(m) : -1;
    c.corr = m ? dir.corr.get(m.id) || [1, 1, 1] : [1, 1, 1];
    if (c.strip) {
      c.strip.items = c.strip.ids.map((id) => { const mm = byId.get(id); return { mediaIndex: media.indexOf(mm), focus: mm && mm.focus }; });
      c.motion = { from: { s: 1, x: 0, y: 0 }, to: { s: 1, x: 0, y: 0 } };
      c.srcOffset = 0; c.rate = 1; c.contain = false;
      continue;
    }
    if (c.stack) {
      c.stack.items = c.stack.ids.map((id) => { const mm = byId.get(id); return { mediaIndex: media.indexOf(mm), focus: mm && mm.focus }; });
      c.motion = { from: { s: 1, x: 0, y: 0 }, to: { s: 1, x: 0, y: 0 } };
      c.srcOffset = 0; c.rate = 1; c.contain = false;
      continue;
    }
    if (c.grid && !c.grid.ids) c.grid = false;
    if (c.grid) {
      c.grid.items = c.grid.ids.map((id) => {
        const mm = byId.get(id);
        return { mediaIndex: mm ? media.indexOf(mm) : -1, corr: dir.corr.get(id) || [1, 1, 1], focus: mm && mm.focus };
      });
      c.motion = { from: { s: 1, x: 0, y: 0 }, to: { s: 1, x: 0, y: 0 } };
      c.srcOffset = 0; c.rate = 1; c.contain = false;
      continue;
    }
    if (c.split) {
      c.split.items = c.split.ids.map((id, k) => {
        const mm = byId.get(id);
        const panelDur = c.visEnd - c.split.reveal[k];
        let off = 0, rate = 1;
        if (mm && mm.kind === 'video') {
          const hl = (mm.highlights || []).map((h) => h.t);
          const center = hl.length ? hl[0] : (mm.duration || 2) * 0.4;
          off = Math.max(0, Math.min(center - panelDur / 2, Math.max(0, (mm.duration || 0) - panelDur)));
          if ((mm.duration || 0) < panelDur) rate = Math.max(0.5, (mm.duration || 1) / panelDur);
        }
        return { mediaIndex: media.indexOf(mm), srcOffset: off, rate, corr: dir.corr.get(id) || [1, 1, 1], focus: mm && mm.focus };
      });
      c.motion = { from: { s: 1, x: 0, y: 0 }, to: { s: 1.035, x: 0, y: 0 } };
      c.srcOffset = 0; c.rate = 1; c.contain = false;
      continue;
    }
    if (!m) continue;
    const visDur = c.visEnd - c.visStart;
    const srcAspect = m.w && m.h ? m.w / m.h : outAspect;
    // Tempo und Ausschnitt gelten für die eigene Einstellung des Videos (nicht für Splits oder Stücke im Einstieg)
    const o = (!c.split && !c.rush && !c.leader && !c.pre && ovOf(c)) || {};
    if (m.kind === 'video') {
      // gewählter Ausschnitt: Beginn und spielbare Länge
      const tIn = m.trim && m.trim[1] > m.trim[0] ? Math.max(0, m.trim[0]) : 0;
      const vd = Math.max(0.1, videoSpan(m) || visDur);
      let rate = 1;
      const withSound = m.sound > 0 && m.audio;
      if (o.speed) rate = o.speed;
      else if (withSound) rate = 1; // Originalton: kein Zeitlupen-Effekt, damit Ton und Bild zusammenpassen
      else if (c.vid) rate = vd >= visDur ? 1 : Math.max(0.8, vd / visDur); // eigener Platz: in Echtzeit, fast ganz
      else if (c.label === 'break' && vd >= visDur * 0.5) rate = 0.5;
      else if ((c.label === 'intro' || c.label === 'outro' || s.pace === 'ruhig' || c.i === 0) && vd >= visDur * 0.75) rate = 0.75;
      let needS = visDur * rate;
      if (vd < needS) { rate = Math.max(0.5, vd / visDur); needS = visDur * rate; }
      // Speed-Ramp: ins Drop hinein beschleunigen, auf dem Drop in Zeitlupe abbremsen
      // ein Video, das auf seinem Platz ganz läuft, bleibt in Echtzeit; ist es länger, darf die Ramp wirken
      const fullPlay = c.vid && vd <= visDur * 1.15;
      const nextC = clips[c.i + 1];
      const rampOut = s.ramp === 'drop' && !o.speed && !withSound && !fullPlay && nextC && nextC.sectionChange && (nextC.label === 'drop' || nextC.label === 'chorus') && visDur > 0.8;
      const rampIn = s.ramp === 'drop' && !o.speed && !withSound && !fullPlay && c.sectionChange && (c.label === 'drop' || c.label === 'chorus') && visDur > 0.8;
      if (rampOut || rampIn) {
        const pts = rampOut
          ? [[c.visStart, 1], [c.visStart + visDur * 0.45, 1], [c.visEnd, 2.6]]
          : [[c.visStart, 0.35], [c.visStart + visDur * 0.55, 0.35], [c.visEnd, 1]];
        const need = rampIntegral(pts, c.visEnd);
        if (vd >= need + 0.05) { c.rp = pts; rate = 1; needS = need; }
      }
      let off;
      if (o.srcOffset != null) off = o.srcOffset - tIn;
      else if (c.vid) {
        // läuft (fast) ganz: Anfang so, dass der beste Moment sicher drin ist – und genau auf einem starken Schlag liegt
        const hl = (m.highlights || []).map((h) => h.t - tIn).filter((t) => t >= 0 && t <= vd);
        const best = hl.length ? hl[0] : vd * 0.4;
        off = Math.min(Math.max(0, best - needS * 0.4), Math.max(0, vd - needS));
        const sy = trySync(m, c, tIn, off, Math.max(0, vd - needS), rate, hl.length ? best : null);
        if (sy) off = sy.off;
        else if (!c.rp && hl.length) off = onBeatOffset(best, off, Math.max(0, vd - needS), c, rate);
      }
      else if (c.role === 'takeoff') off = vd - needS - Math.min(1, vd * 0.05); // Abheben liegt meist gegen Ende
      else if (c.role === 'landing') off = Math.min(0.5, vd * 0.05);
      else {
        const hl = (m.highlights || []).map((h) => h.t);
        const used = videoCursor.get(m.id) || 0;
        const hlIn = hl.map((t) => t - tIn).filter((t) => t >= 0 && t <= vd);
        const center = hlIn.length ? hlIn[used % hlIn.length] : vd * 0.4;
        off = center - needS / 2;
        const sy = trySync(m, c, tIn, Math.max(0, Math.min(off, Math.max(0, vd - needS))), Math.max(0, vd - needS), rate, hlIn.length ? center : null);
        if (sy) off = sy.off;
        else if (!c.rp && hlIn.length) off = onBeatOffset(center, Math.max(0, Math.min(off, Math.max(0, vd - needS))), Math.max(0, vd - needS), c, rate);
        videoCursor.set(m.id, used + 1);
      }
      c.srcOffset = tIn + Math.max(0, Math.min(off, Math.max(0, vd - needS)));
      c.rate = rate;
      // kürzer als der Platz (auch nach leichter Verlangsamung): das letzte Bild bleibt stehen statt schwarz zu werden
      if (c.vid && vd / rate < visDur - 0.05) c.freezeAt = c.visStart + vd / rate - 0.04;
      if (withSound && Math.abs(rate - 1) < 0.01 && !c.rp) {
        const t1 = Math.min(c.freezeAt != null ? c.freezeAt : c.visEnd, c.visStart + (vd - (c.srcOffset - tIn)));
        if (t1 - c.visStart > 0.15) voice.push({ mediaIndex: media.indexOf(m), mediaId: m.id, t0: Math.max(0, c.visStart), t1: Math.min(D, t1), src: c.srcOffset + Math.max(0, -c.visStart), gain: m.sound });
      }
      const fitFrac = srcAspect > outAspect ? outAspect / srcAspect : srcAspect / outAspect;
      c.contain = fitFrac < 0.5;
      // Videos bewegen sich selbst: nur ein leises Heranfahren im gemeinsamen Kameratempo (im Refrain noch leiser)
      const vt = tempoAt((c.visStart + c.visEnd) / 2), vLen = Math.max(0.3, c.visEnd - c.visStart);
      const push = Math.min(0.06, 2 * 0.0125 * vt * (c.label === 'drop' || c.label === 'chorus' ? 0.35 : 0.6) * vLen);
      c.motion = c.contain ? { from: { s: 0.93, x: 0, y: 0 }, to: { s: 0.93 + push * 0.8, x: 0, y: 0 } } : { from: { s: 1, x: 0, y: 0 }, to: { s: 1 + push, x: 0, y: 0 } };
    } else {
      c.srcOffset = 0; c.rate = 1; c.contain = false;
      // Ausrichtung passt nicht zum Format (Querfoto in 9:16, Hochformat im Film): ganz zeigen statt mehr als die Hälfte abzuschneiden
      const fitFrac = srcAspect > outAspect ? outAspect / srcAspect : srcAspect / outAspect;
      const framed = fitFrac < 0.5 && !c.burst && !c.reveal && !c.pre && !(clips[c.i - 1] && clips[c.i - 1].reveal);
      const role = c.label === 'drop' || c.label === 'chorus' ? 'burst' : 'normal';
      // „Gefällt mir nicht“: eigene Zufallsfolge je Versuch, die Richtung wechselt reihum
      const ag = (ovOf(c) && ovOf(c).again) || 0;
      // (die gemeinsame Zufallsfolge läuft trotzdem gleich weiter, damit sich die übrigen Einstellungen nicht ändern)
      const tempo = tempoAt((c.visStart + c.visEnd) / 2);
      const mo0 = imageMotion(rng, m, outAspect, visDur, role, prevDir, panHint(c), tempo);
      let mo = mo0;
      if (ag) {
        const r2 = mulberry32(((s.seed >>> 0) ^ (c.i * 977)) >>> 0);
        const cands = [];
        for (const h of ['left', 'right', 'down', 'up', null, 'in', 'out']) {
          const q = imageMotion(r2, m, outAspect, visDur, role, h === 'in' || h === 'out' ? (h === 'in' ? 'out' : 'in') : null, h === 'in' || h === 'out' ? null : h, tempo);
          if (q.dir !== mo0.dir && !cands.some((x) => x.dir === q.dir)) cands.push(q);
        }
        if (cands.length) mo = cands[(ag - 1) % cands.length];
      }
      // (der Nachbar richtet sich weiter nach der ursprünglichen Richtung – er bleibt, wie er war)
      prevDir = mo0.dir;
      c.motion = mo.m;
      c.dir = mo.dir;
      // Tempo-Rampe im Foto: in einen Drop/Refrain hinein beschleunigen, auf dem Einsatz schwungvoll auslaufen
      const nx = clips[c.i + 1];
      if (nx && nx.sectionChange && !isCalmLabel(nx.label) && isCalmLabel(c.label)) { c.ease = 'in'; mo.m.to.s += 0.035; }
      else if (c.sectionChange && !isCalmLabel(c.label)) c.ease = 'out';
      // neu gewürfelt: die ursprüngliche Bewegung bleibt Maßstab für den Tempo-Abgleich der Nachbarn
      if (ag) {
        const m0 = JSON.parse(JSON.stringify(mo0.m));
        if (c.ease === 'in') m0.to.s += 0.035;
        c._m0 = framed ? { from: { s: 0.93, x: 0, y: 0 }, to: { s: 0.93 + Math.min(0.07, 2 * 0.0125 * tempo * 0.75 * visDur), x: 0, y: 0 } } : m0;
      }
      // (bei „Gefällt mir nicht“ abwechselnd bildfüllend mit Fahrt oder gerahmt mit umgekehrter Richtung)
      if (framed && ag % 2 === 0) {
        // schwebt knapp innerhalb des Rahmens und wächst langsam: nichts vom Bild geht verloren
        c.contain = true;
        // gleiches Tempo wie die übrigen Fahrten (Rahmenkanten bewegen sich mit dem Kameratempo)
        const dz = Math.min(0.07, 2 * 0.0125 * tempo * 0.75 * visDur);
        c.motion = ag ? { from: { s: 0.93 + dz, x: 0, y: 0 }, to: { s: 0.93, x: 0, y: 0 } } : { from: { s: 0.93, x: 0, y: 0 }, to: { s: 0.93 + dz, x: 0, y: 0 } };
      }
      let pc = c.matchCut ? clips[c.i - 1] : null;
      // gerahmte Bilder haben keinen Ausschnitt, an den die Bewegung anschließen könnte
      if (pc && (framed || pc.contain)) { c.matchCut = false; pc = null; }
      if (pc && pc.motion && media[pc.mediaIndex] && media[pc.mediaIndex].kind === 'image') {
        // Match-Cut: gleicher Ausschnitt wie am Ende des vorigen Bilds, die Kamerabewegung läuft weiter
        // gleiche Geschwindigkeit wie im vorigen Bild: Weg im Verhältnis der Dauer
        const f = pc.motion.from, to = pc.motion.to, k = Math.max(0.3, visDur / Math.max(0.2, pc.visEnd - pc.visStart));
        // wie weit die Fahrt im Bild noch weitergehen kann (Bildrand, kein Zoom unter 1)
        let kMax = Infinity;
        for (const key of ['x', 'y']) { const d = to[key] - f[key]; if (d > 1e-6) kMax = Math.min(kMax, (1 - to[key]) / d); else if (d < -1e-6) kMax = Math.min(kMax, (-1 - to[key]) / d); }
        { const d = to.s - f.s; if (d < -1e-6) kMax = Math.min(kMax, (1 - to.s) / d); }
        const kB = Math.min(k, kMax);
        // gleiche Geschwindigkeit ist der Sinn des Match-Cuts: reicht der Platz nicht, fährt schon das vorige Bild
        // entsprechend ruhiger (sein Endpunkt bleibt, also bleibt der Anschluss); bliebe fast kein Weg, normaler Schnitt
        if (kB < k * 0.35) c.matchCut = false;
        else {
          if (kB < k) scaleMotion(pc.motion, kB / k);
          const f2 = pc.motion.from;
          c.motion = { from: { ...to }, to: { s: Math.max(1, to.s + (to.s - f2.s) * k), x: Math.max(-1, Math.min(1, to.x + (to.x - f2.x) * k)), y: Math.max(-1, Math.min(1, to.y + (to.y - f2.y) * k)) } };
          c.dir = pc.dir;
          prevDir = pc.dir;
        }
      }
    }
    if (c.reveal || (c.role === 'hook' && clips[c.i - 1] && clips[c.i - 1].reveal)) {
      // Aufblende: enger Ausschnitt um das Motiv, langsame Fahrt hinein; das Highlight springt danach
      // aus demselben Motiv auf das ganze Bild auf
      const f = m.focus || [0.5, 0.45];
      const pos = (v, sc) => Math.max(-1, Math.min(1, ((v - 0.5) * 2) / Math.max(0.05, 1 - 1 / sc)));
      if (c.reveal) {
        const s0 = byId.get(clips[c.i + 1] && clips[c.i + 1].mediaId) === m ? 1.7 : 1.45;
        c.motion = { from: { s: s0, x: pos(f[0], s0), y: pos(f[1], s0) }, to: { s: s0 * 1.07, x: pos(f[0], s0 * 1.07), y: pos(f[1], s0 * 1.07) } };
        if (m.kind === 'video') { c.rate = Math.min(c.rate || 1, 0.5); c.motion = { from: { s: 1.25, x: 0, y: 0 }, to: { s: 1.32, x: 0, y: 0 } }; }
      } else {
        c.motion = { from: { s: 1.22, x: pos(f[0], 1.22), y: pos(f[1], 1.22) }, to: { s: 1.02, x: 0, y: 0 } };
        c.revealHit = true;
      }
      c.contain = false;
    }
    if (c.rush && c.welcome) {
      // „Welcome to…“: leichte, ruhige Bewegung; Videos laufen (das letzte länger und mit langsamem Heranfahren)
      const sg = c.i % 2 ? 1 : -1;
      c.motion = c.welcome === 'last' ? { from: { s: 1.0, x: 0, y: 0 }, to: { s: 1.08, x: 0, y: 0 } } : { from: { s: 1.07, x: 0.05 * sg, y: 0 }, to: { s: 1.0, x: -0.03 * sg, y: 0 } };
      c.contain = false;
    } else if (c.rush) {
      // jedes Bild der Flut setzt mit einem kleinen Zoom-Impuls ein, abwechselnd leicht versetzt
      const sg = c.i % 2 ? 1 : -1;
      c.motion = { from: { s: 1.12, x: 0.12 * sg, y: 0 }, to: { s: 1.03, x: 0.12 * sg, y: 0 } };
      c.contain = false;
      if (m.kind === 'video') c.freezeAt = c.visStart;
    }
    if (c.pre === 'rew' || c.miniRew) {
      // Zurückspulen: jedes Bild zieht sich schnell zusammen und rutscht gegen die Laufrichtung
      const sg = c.i % 2 ? 1 : -1;
      c.motion = { from: { s: 1.16, x: 0.35 * sg, y: 0 }, to: { s: 1.0, x: -0.35 * sg, y: 0 } };
      if (m.kind === 'video') c.freezeAt = c.visStart;
    }
    if (c.tout && c.tout.type === TR.WHIP) c.tout.dirSign = c.dir === 'left' ? -1 : 1;
    // Drift: gleitet in die Richtung weiter, in die die Kamera schon fährt
    if (c.tout && c.tout.type === TR.DRIFT && c.motion) { const dx = c.motion.to.x - c.motion.from.x; c.tout.dirSign = Math.abs(dx) > 0.02 ? Math.sign(dx) : c.dir === 'left' ? -1 : 1; }
  }
  if (vSynced) dir.notes.push(`Video auf den Takt: in ${vSynced} ${vSynced === 1 ? 'Einstellung' : 'Einstellungen'} landen ${vHits} Bewegungsmomente (Sprung, Welle, Schwenk) genau auf Schlag, Snare oder Bassdrum; kein Schnitt reißt eine Bewegung ab.`);
  // Match-Cuts, die ihr Tempo nicht halten konnten, sind normale Schnitte geworden: Notiz an die tatsächliche Zahl anpassen
  {
    const mcN = clips.filter((c) => c.matchCut).length;
    const ni = dir.notes.findIndex((n) => /Match-Cut/.test(n));
    if (ni >= 0 && mcN !== matches) {
      if (!mcN) dir.notes.splice(ni, 1);
      else dir.notes[ni] = `${mcN} Match-Cut${mcN === 1 ? '' : 's'}: Bilder mit ähnlichem Aufbau schneiden unsichtbar ineinander, die Kamerabewegung läuft im selben Tempo weiter.`;
    }
  }
  // nach dem Raster-Zoom: gleiches Bild, gleicher (zentrierter) Ausschnitt, dann sanfte Fahrt
  for (const c of clips) {
    if (!c.afterGrid || !c.motion) continue;
    const to = c.motion.to;
    c.motion = { from: { s: 1, x: 0, y: 0 }, to: { s: Math.max(1.04, to.s || 1), x: (to.x || 0) * 0.5, y: (to.y || 0) * 0.5 } };
    c.contain = false;
  }
  // Tempo-Abgleich: eine Fahrt, die deutlich schneller ist als beide Nachbarn, wird auf deren Tempo gebracht –
  // die Kamera wirkt wie eine durchgehende Bewegung statt wie einzelne Anläufe
  {
    const plainM = (c) => c && c.motion && !(c.split || c.grid || c.burst || c.rush || c.stack || c.strip || c.miniRew || c.pre || c.reveal || c.revealHit || c.leader || c.flightAnim || c.loop) && media[c.mediaIndex] && media[c.mediaIndex].kind === 'image';
    const sp = clips.map((c) => (plainM(c) ? motionSpeed(c.motion, media[c.mediaIndex], outAspect, Math.max(0.25, c.visEnd - c.visStart)) : null));
    const sp0 = clips.map((c, i) => (c._m0 && sp[i] != null ? motionSpeed(c._m0, media[c.mediaIndex], outAspect, Math.max(0.25, c.visEnd - c.visStart)) : sp[i]));
    for (let i = 0; i < clips.length; i++) {
      if (sp[i] == null || clips[i].matchCut) continue;
      // ein neu gewürfeltes Bild („Gefällt mir nicht“) zählt für seine Nachbarn mit der ursprünglichen Fahrt (sp0): dort ändert sich nichts
      const nb = [sp0[i - 1], sp0[i + 1]].filter((v, k) => v != null && !(k === 0 ? clips[i].sectionChange : clips[i + 1] && clips[i + 1].sectionChange));
      if (!nb.length) continue;
      const lim = Math.max(...nb) * 1.3;
      if (sp[i] > lim && lim > 0.002) { scaleMotion(clips[i].motion, lim / sp[i]); sp[i] = lim; if (!clips[i]._m0) sp0[i] = lim; }
    }
    // zweiter Durchgang, Paar für Paar: keine Fahrt mehr als 1,8× so schnell wie die direkt davor oder danach
    // (nur bremsen, nie beschleunigen; nicht über einen Songteil-Wechsel, einen Match-Cut oder ein neu gewürfeltes Bild)
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < clips.length; i++) {
        const a = sp[i - 1], b = sp[i];
        if (a == null || b == null || clips[i].sectionChange || clips[i].matchCut || (ovOf(clips[i]) || {}).again || (ovOf(clips[i - 1]) || {}).again) continue;
        if (b > a * 1.8 && a > 0.002) { scaleMotion(clips[i].motion, (a * 1.8) / b); sp[i] = a * 1.8; }
        else if (a > b * 1.8 && b > 0.002 && !clips[i - 1].matchCut) { scaleMotion(clips[i - 1].motion, (b * 1.8) / a); sp[i - 1] = b * 1.8; }
        else if (a > b * 1.8 && b > 0.002 && clips[i].motion) {
          // davor läuft eine Match-Cut-Fahrt durch (darf nicht bremsen): dann fährt dieses Bild maßvoll schneller an,
          // höchstens 1,7× und nur so weit, wie der Ausschnitt reicht
          const mo = clips[i].motion;
          let k = Math.min(1.7, a / (b * 1.8));
          const ok = (kk) => { const fs = mo.to.s + (mo.from.s - mo.to.s) * kk, fx = mo.to.x + ((mo.from.x || 0) - mo.to.x) * kk, fy = (mo.to.y || 0) + ((mo.from.y || 0) - (mo.to.y || 0)) * kk; return fs >= 1 && Math.abs(fx) <= 1 && Math.abs(fy) <= 1; };
          while (k > 1.05 && !ok(k)) k -= 0.1;
          if (k > 1.05) { scaleMotion(mo, k); sp[i] = b * k; }
        }
      }
    }
    for (const c of clips) delete c._m0;
  }
  if (loopClip) {
    const c0 = loopTo;
    const L = loopClip.tin.dur;
    Object.assign(loopClip, {
      visStart: D - L, visEnd: D + 0.001, mediaIndex: c0.mediaIndex, contain: c0.contain, rate: c0.rate || 1, corr: c0.corr,
      srcOffset: Math.max(0, (c0.srcOffset || 0) - L * (c0.rate || 1)),
      motion: { from: { ...(c0.motion ? c0.motion.from : { s: 1, x: 0, y: 0 }) }, to: { ...(c0.motion ? c0.motion.from : { s: 1, x: 0, y: 0 }) } },
    });
  }

  // Effekte & Einblendungen
  const fx = [];
  { const rc = clips.find((c) => c.recap); if (rc) fx.push({ type: 'flash', start: rc.start, end: rc.start + 0.2, amp: 0.25 }); }
  // im Takt mitgetippt: Akzent (kurzer Zoom-Stoß) genau auf dem Schlag
  const tapsRel = (overrides.taps || []).map((t) => t - win.start).filter((t) => t > 0.1 && t < D - 0.1);
  for (const t of tapsRel) fx.push({ type: 'punch', start: t, end: t + 0.42, amp: 0.85, tap: true });
  if (tapsRel.length) {
    const cut = tapsRel.filter((t) => clips.some((c) => Math.abs(c.start - t) < 0.02)).length, rest = tapsRel.length - cut;
    dir.notes.push(`Mitgetippt: ${tapsRel.length} ${tapsRel.length === 1 ? 'Moment' : 'Momente'} von dir – ${cut ? `${cut}× genau auf dem Schlag geschnitten, mit kurzem Zoom-Stoß` : ''}${cut && rest ? '; ' : ''}${rest ? `${rest}× im Vorspann oder in einem durchlaufenden Video: dort nur der Zoom-Stoß, damit Titel und Video nicht zerreißen` : ''}.`);
  }
  const overlays = [];
  const sfx = [];
  // Nichts ist fest: Titel, Kapitel und Statistik lassen sich einzeln ausschalten
  const title = s.showTitle === false ? '' : (settings.title || '').trim();
  const subtitle = s.showTitle === false ? '' : (settings.subtitle || '').trim();
  // Unter dem Ortsnamen: Koordinaten, die in die gefahrenen Kilometer wechseln (nur auf Wunsch)
  const kmMode = ['coords', 'leg', 'total'].includes(s.km) ? s.km : 'off';
  const geoFor = (idx) => {
    const st = kmMode !== 'off' && trip && trip.stops ? trip.stops[idx] : null;
    if (!st) return null;
    let tot = 0;
    for (let i = 1; i <= idx; i++) tot += trip.stops[i].legKm || 0;
    const leg = st.legKm || 0;
    const km = kmMode === 'leg' ? leg : kmMode === 'total' ? tot : 0;
    const g = { lat: st.pos ? st.pos[0] : null, lon: st.pos ? st.pos[1] : null, km: km > 5 ? km : null, kmFrom: kmMode === 'total' ? Math.max(0, tot - leg) : 0, mode: kmMode };
    return g.lat == null && g.km == null ? null : g;
  };
  const geo = trip && !trip.all ? geoFor(trip.idx) : null;
  const beatsRel = [], downs = [], beatEnergy = [];
  for (let i = 0; i < an.beats.length; i++) {
    const t = an.beats[i] - win.start;
    if (t >= -0.01 && t <= D + 0.01) { beatsRel.push(t); downs.push(downSet(an).has(i)); beatEnergy.push(an.energy[i]); }
  }
  const beatsIn = (a, b) => beatsRel.filter((t) => t >= a - 0.01 && t < b);
  // Titel lange genug zum Lesen (Ortsname, Datum, Koordinaten), aber dezent: etwa zwei Takte, mindestens 3,4 s
  const tEnd = T0 + Math.min(D * 0.45, Math.max(3.4, barDur * 2));

  // Aufblende: gedämpft, leicht entsättigt, Schärfe zieht an; auf dem Höhepunkt Licht und Farbe
  if (reveal) {
    const R = clips.filter((c) => c.reveal);
    R.forEach((c, k) => {
      const last = k === R.length - 1;
      fx.push({ type: 'focus', start: c.start, end: c.end, amp: last ? 0.35 : 0.6 });
      fx.push({ type: 'dim', start: c.start, end: c.end, amp: last ? 0.2 : 0.34, fadeIn: k === 0 ? Math.min(0.6, beatDur) : 0 });
    });
    fx.push({ type: 'desat', start: R[0].start, end: reveal.end, amp: 0.5 });
    fx.push({ type: 'flash', start: reveal.end, end: reveal.end + 0.28, amp: 0.24 });
    fx.push({ type: 'punch', start: reveal.end, end: reveal.end + 0.5, amp: 0.8 });
    if (title) overlays.push({ type: 'reveal', text: title, sub: subtitle, geo, start: R[0].start + Math.min(0.5, beatDur), end: reveal.end - 0.04 });
  }

  // Countdown vor dem Drop: 3 · 2 · 1 auf den letzten drei Beats, dann Licht auf dem Einsatz
  if (countIn) {
    // eine Einblendung, die in den Countdown hineinliefe (z. B. der Aufblende-Titel), endet vorher
    for (const o of overlays) if (o.start < countIn.marks[0] && o.end > countIn.marks[0]) o.end = Math.max(o.start + 0.5, countIn.marks[0] - 0.05);
    overlays.push({ type: 'countin', marks: countIn.marks, start: countIn.marks[0] - 0.05, end: countIn.end });
    fx.push({ type: 'flash', start: countIn.end, end: countIn.end + 0.22, amp: 0.22 });
    fx.push({ type: 'punch', start: countIn.end, end: countIn.end + 0.45, amp: 0.7 });
    dir.notes.push(`Countdown vor dem ${SEC_DE[sectionAt(an, win.start + countIn.end + 0.02).label] || 'Drop'}: 3 · 2 · 1 auf den letzten Beats.`);
  }

  // Schlagzeug im Film: Bassdrum und Snare relativ zum Film
  const kicksRel = Array.from(an.kicks || []).map((t) => t - win.start).filter((t) => t >= 0 && t < D);
  const snaresRel = Array.from(an.snares || []).map((t) => t - win.start).filter((t) => t >= 0 && t < D);
  const fixedEndAll = clips.filter((c) => c.pre || c.leader || c.reveal || c.grid && !c.gridMid).reduce((m, c) => Math.max(m, c.end), 0);

  // Schwarzweiß → Farbe: vor dem Einsatz schwarzweiß, auf dem Einsatz kehrt die Farbe zurück
  const colorFx = [];
  const colorMode = s.color && s.color !== 'off' && !flight ? s.color : null;
  if (colorMode) {
    // Einsätze nach einem ruhigeren Teil; schwarzweiß darf schon ab dem Filmanfang sein (nicht während eines festen Einstiegs)
    const colHits = secsRel.filter((x) => isPeakSec(x) && x.rel > fixedEndAll + barDur * 0.9 && x.rel < D - barDur && !isPeakSec(sectionAt(an, x.start - 0.05))).map((x) => x.rel);
    let hs = colHits.slice(0, s.colorAuto ? 1 : 2);
    // Aufblende: der Aufbau bleibt schwarzweiß, auf dem Höhepunkt kehrt mit dem Bild die Farbe zurück
    const revHit = reveal && clips.some((c) => c.reveal) ? reveal.end : null;
    if (revHit != null && (!hs.length || s.colorAuto)) hs = [revHit, ...hs.slice(0, s.colorAuto ? 0 : 1)];
    if (!hs.length) {
      // kein Drop nach ruhigem Teil im Ausschnitt: ein Taktanfang gut zwei Takte nach dem Einstieg
      const b = (an.barStart || []).map((x) => x - win.start).find((x) => x > fixedEndAll + barDur * 2 && x < D - barDur * 2);
      if (b != null) hs = [b];
    }
    // Stroboskop: in den zwei Takten vor dem Einsatz wechseln Farbe und Schwarzweiß, erst alle zwei Beats, dann jeden Beat,
    // zuletzt auf halben Beats; direkt vor dem Einsatz ist das Bild schwarzweiß
    const strobeFlips = (h) => {
      const b2 = h - barDur * 2, b1 = h - barDur, b0 = h - beatDur * 2 - 0.02;
      const out = [];
      beatsRel.forEach((b, k) => {
        if (b < b2 - 0.02 || b >= h - 0.02) return;
        if (b < b1 - 0.02) { if (k % 2 === 0) out.push(b); } else out.push(b);
        if (b >= b0) out.push(b + beatDur / 2);
      });
      const fl = out.filter((x) => x < h - 0.04).sort((a, b) => a - b);
      if (fl.length % 2) fl.shift();
      return fl;
    };
    // Farbe auf dem Schlag: Bassdrums (sonst Beats) in den zwei Takten vor dem Einsatz
    const pulseHits = (h) => {
      const k = kicksRel.filter((x) => x > h - barDur * 2 + 0.02 && x < h - 0.05);
      return k.length >= 4 ? k : beatsRel.filter((x) => x > h - barDur * 2 + 0.02 && x < h - 0.05);
    };
    const colSteps = (h) => (colorMode === 'steps' ? beatsRel.filter((b) => b > h - barDur + 0.02 && b < h - 0.02) : colorMode === 'strobe' ? strobeFlips(h) : colorMode === 'pulse' ? pulseHits(h) : []);
    const popOf = { drop: 0.42, steps: 0.4, strobe: 0.42, pulse: 0.42, bloom: 0.25, sweep: 0.25, pop: 0.3 };
    for (const h of hs) {
      // der Kino-Rollladen hat sein Schwarzweiß → Farbe schon in den Feldern: das Öffnen bleibt farbig
      if (shutter && pre && pre.kind === 'shutter' && h < shutter.end + 0.1) continue;
      if (h === revHit) {
        const r0 = clips.find((c) => c.reveal);
        const d0 = colorMode === 'bloom' ? Math.min(beatDur * 2, 1.1) : colorMode === 'sweep' ? Math.min(beatDur * 1.5, 0.85) : 0;
        colorFx.push({ mode: colorMode, start: r0.start, hit: h, dur: d0, end: h + Math.max(d0, 0.05), steps: colSteps(h), decay: beatDur * 0.45, popAmp: popOf[colorMode], popDur: beatDur * 1.5 });
        continue;
      }
      const before = clips.filter((c) => c.start >= Math.max(fixedEndAll, h - barDur * 4) - 0.05 && c.start <= h - barDur * 0.9 + 0.05 && !c.grid);
      let start = before.length ? before[0].start : Math.max(fixedEndAll, h - barDur * 2);
      if (colorMode === 'strobe' || colorMode === 'pulse') start = Math.max(fixedEndAll, Math.min(start, h - barDur * 2));
      if (h - start < barDur * 0.85) continue;
      const dur = colorMode === 'bloom' ? Math.min(beatDur * 2, 1.1) : colorMode === 'sweep' ? Math.min(beatDur * 1.5, 0.85) : 0;
      colorFx.push({ mode: colorMode, start, hit: h, dur, end: h + Math.max(dur, 0.05), steps: colSteps(h), decay: beatDur * 0.45, popAmp: popOf[colorMode], popDur: beatDur * 1.5 });
      if (colorMode === 'drop' || colorMode === 'steps' || colorMode === 'pop') fx.push({ type: 'flash', start: h, end: h + 0.2, amp: 0.18 });
      fx.push({ type: 'punch', start: h, end: h + 0.45, amp: colorMode === 'drop' ? 0.6 : 0.35 });
    }
    if (!colorFx.length && s.colorAuto) s.color = 'off';
    if (colorFx.length) {
      const NAMES = { strobe: 'wechseln Farbe und Schwarzweiß im Takt, immer schneller, bis die Farbe auf dem Einsatz bleibt', pulse: 'blitzt die Farbe auf jeder Bassdrum auf und bleibt auf dem Einsatz', drop: 'kehrt die Farbe schlagartig zurück', steps: 'kehrt die Farbe Beat für Beat zurück', bloom: 'breitet sich die Farbe vom Motiv aus', sweep: 'läuft die Farbe als Welle durchs Bild', pop: 'bleiben nur kräftige Farben, dann kommt alles zurück' };
      dir.notes.push(`Schwarzweiß → Farbe: vor dem Einsatz bei ${colorFx.map((f) => fmtMS(f.hit)).join(' und ')} ist das Bild schwarzweiß, auf dem Schlag ${NAMES[colorMode]}.`);
    }
  }

  // Echo: auf starken Schlägen im Drop blitzt das vorige Bild kurz halbtransparent auf
  if (s.echo === 'on' && !flight) {
    let lastE = -Infinity, n = 0;
    const maxN = D < 30 ? 3 : 5;
    const busyC = (c) => c.grid || c.split || c.strip || c.stack || c.burst || c.miniRew || c.pre || c.leader || c.reveal || c.flightAnim || c.loop;
    const downs0 = (an.barStart || []).map((b) => b - win.start);
    for (const c of clips) {
      const prev = clips[c.i - 1];
      if (!prev || n >= maxN || busyC(c) || busyC(prev) || c.label !== 'drop' && c.label !== 'chorus') continue;
      if (c.tin && c.tin.dur > 0 || c.end - c.start < beatDur || c.start - lastE < barDur * 2 - 0.05) continue;
      if (!downs0.some((b) => Math.abs(b - c.start) < 0.04)) continue;
      if (kicksRel.length && !kicksRel.some((k) => Math.abs(k - c.start) < 0.05)) continue;
      if (colorFx.some((f) => Math.abs(f.hit - c.start) < 0.05)) continue;
      c.echo = { from: prev.i, dur: Math.min(0.42, beatDur * 0.85, (c.end - c.start) * 0.6) };
      lastE = c.start; n++;
    }
    if (n) dir.notes.push(`Echo: auf ${n} starken Schlägen blitzt das vorige Bild kurz halbtransparent auf.`);
  }

  // Mehrfachbelichtung (Musikvideo): im Refrain/Drop liegt das nächste Bild hell darüber und pulsiert mit den Schlägen,
  // in einem ruhigen Teil erscheint es als klassische Doppelbelichtung in den hellen Flächen (Himmel, Licht)
  let layerN = 0;
  if (s.layers === 'on' && !flight) {
    const plain = (c) => c && !(c.grid || c.split || c.strip || c.stack || c.burst || c.rush || c.miniRew || c.pre || c.leader || c.reveal || c.flightAnim || c.loop || c.vid) && byId.get(c.mediaId) && byId.get(c.mediaId).kind === 'image';
    const phrase = (a, b, mode, amp) => {
      let n = 0;
      for (const c of clips) {
        if (c.end < a + beatDur || c.start >= b - 0.05) continue;
        const nx = clips[c.i + 1];
        if (!plain(c) || !plain(nx) || nx.mediaId === c.mediaId) continue;
        // Dosierung nach dem darübergelegten Bild: im Aufhell-Modus bringt ein helles, detailreiches Bild viel Licht ein –
        // dann sanfter, damit der Puls weich bleibt (ein dunkles Bild darf voll wirken)
        const nm = byId.get(nx.mediaId), cm = byId.get(c.mediaId);
        const light = mode === 'screen' ? (nm.luma || 0.45) * (0.7 + 0.6 * (nm.sharp != null ? nm.sharp : 0.5)) : 0;
        const dl = Math.abs((nm.luma || 0.45) - (cm.luma || 0.45));
        const k = Math.max(0.45, Math.min(1, 1.35 - light * 1.3 - dl * 0.8));
        c.layer = { from: nx.i, mode, amp: amp * k, pulse: mode === 'screen', dir: c.i % 2 ? 1 : -1 };
        n++;
      }
      return n;
    };
    const peaks = secsRel.filter((x) => isPeakSec(x) && x.rel >= fixedEndAll - 0.05 && x.rel < D - barDur);
    const calms = secsRel.filter((x) => !isPeakSec(x) && x.rel >= fixedEndAll - 0.05 && Math.min(D, x.rel + (x.end - x.start)) - x.rel >= barDur * 3);
    // im Refrain eine Phrase nach dem ersten Takt (der Einsatz selbst bleibt klar), bei längeren Filmen zwei
    for (const x of peaks.slice(0, D < 30 ? 1 : 2)) { const a = x.rel + barDur; layerN += phrase(a, Math.min(a + barDur * 3, x.rel + (x.end - x.start), D - barDur * 0.5), 'screen', 0.42); }
    const cm0 = calms.find((x) => !colorFx.some((f) => f.start < x.rel + (x.end - x.start) && f.hit > x.rel));
    if (cm0) layerN += phrase(cm0.rel, Math.min(cm0.rel + barDur * 3, cm0.rel + (cm0.end - cm0.start)), 'luma', 0.62);
    if (layerN) {
      const nS = clips.filter((c) => c.layer && c.layer.mode === 'screen').length, nL = layerN - nS;
      dir.notes.push(`Mehrfachbelichtung in ${layerN} Einstellungen: ${[nS ? 'im Refrain liegt das nächste Bild hell darüber und pulsiert im Takt' : '', nL ? 'in einem ruhigen Teil erscheint es wie eine Doppelbelichtung in den hellen Flächen' : ''].filter(Boolean).join(', ')}.`);
    }
  }
  // Musikvideo: ein Spiegelmoment auf der Eins im zweiten Takt des ersten Drops, dazu feiner Farbversatz auf den Kicks
  let chroma = null;
  if (s.mv === 'on' && !flight) {
    const pk = secsRel.find((x) => isPeakSec(x) && x.rel >= fixedEndAll + barDur && x.rel < D - barDur * 3);
    if (pk) {
      const m0 = pk.rel + barDur;
      const cm = clips.find((c) => c.start <= m0 + 0.05 && c.end > m0 + beatDur);
      if (cm && !(cm.grid || cm.split || cm.stack || cm.strip)) { fx.push({ type: 'mirror', start: m0, end: Math.min(m0 + beatDur * 2, cm.end - 0.02), amp: 1 }); dir.notes.push(`Spiegelmoment bei ${fmtMS(m0)}: zwei Beats lang spiegelt sich das Bild in der Mitte.`); }
    }
    if (kicksRel.length >= 8) chroma = { kicks: kicksRel, zones: secsRel.filter(isPeakSec).map((x) => [Math.max(x.rel, fixedEndAll), Math.min(D, x.rel + (x.end - x.start))]).filter((z) => z[1] > z[0]) };
  }

  // Mini-Rewind: entsättigt und mit Licht auf dem Einsatz
  if (miniAt) {
    fx.push({ type: 'desat', start: miniAt.a, end: miniAt.z, amp: 0.35 });
    fx.push({ type: 'flash', start: miniAt.z, end: miniAt.z + 0.2, amp: 0.2 });
    fx.push({ type: 'punch', start: miniAt.z, end: miniAt.z + 0.45, amp: 0.7 });
    dir.notes.push(`Mini-Rewind vor dem Einsatz bei ${fmtMS(miniAt.z)}: ein halber Takt spult zurück, dann steht noch einmal der beste Moment im Bild.`);
  }

  // Bassdrum-Zoom und Snare: im Drop und Refrain (Auto) oder im ganzen Film
  let accent = null;
  if (s.accent && s.accent !== 'off' && kicksRel.length >= 4 && !flight) {
    const zones = s.accentAuto
      ? secsRel.concat([]).filter(isPeakSec).map((x) => [Math.max(x.rel, fixedEndAll), Math.min(D, x.rel + (x.end - x.start))]).concat(isPeakSec(sectionAt(an, win.start + 0.02)) ? [[fixedEndAll, Math.min(D, sectionAt(an, win.start + 0.02).end - win.start)]] : []).filter((z) => z[1] > z[0])
      : [[fixedEndAll, D]];
    accent = { kicks: kicksRel, snares: snaresRel, snare: s.accent === 'kicksnare', zones, amt: s.accentAuto ? 0.7 : 1 };
  }

  // Reisefilm: nach allen Umstellungen noch einmal – keine Wiederholung
  if (chapters && chapters.length) mergeDupes();

  // Wir-Moment: eure markierten Aufnahmen – die längsten, höchstens drei – bekommen einen eigenen Moment:
  // die Kamera wird ruhiger und langsamer, das Bild wird am Anfang weich scharf (wie ein Blick, der sich fängt)
  if (!flight && s.us !== 'off') {
    const usC = clips.filter((c) => c.motion && !c.split && !c.grid && !c.burst && !c.rush && !c.stack && !c.strip && !c.pre && !c.reveal && !c.leader && !c.loop && !c.matchCut && c.role !== 'hook' && media[c.mediaIndex] && media[c.mediaIndex].us === true && media[c.mediaIndex].kind === 'image' && c.end - c.start >= beatDur * 1.8)
      .sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, 3);
    for (const c of usC) {
      scaleMotion(c.motion, 0.6);
      c.usMoment = true;
      if (!fx.some((f) => f.type === 'focus' && Math.abs(f.start - c.start) < 0.2)) fx.push({ type: 'focus', start: c.start, end: c.start + Math.min(0.9, (c.end - c.start) * 0.35), amp: 0.55 });
    }
    if (usC.length) dir.notes.push(`Wir-Moment: ${usC.length === 1 ? 'eine eurer Aufnahmen steht' : `${usC.length} eurer Aufnahmen stehen`} besonders lang, mit ruhiger Kamera und weichem Scharfwerden.`);
  }

  // Vorspann
  if (pre && pre.kind === 'countdown') {
    // im Look entsättigt (nicht hart schwarzweiß) und zum Einsatz hin weich in die Farbe: kein Bruch im Stil
    fx.push({ type: 'desat', start: 0, end: pre.end, amp: 0.6, fadeOut: beatDur * 0.5 });
    fx.push({ type: 'flash', start: pre.end, end: pre.end + 0.22, amp: 0.35 });
    fx.push({ type: 'punch', start: pre.end, end: pre.end + 0.45, amp: 1 });
    overlays.push({ type: 'leader', marks: pre.marks, start: 0, end: pre.end });
  } else if (pre && pre.kind === 'rewind') {
    fx.push({ type: 'desat', start: pre.teaseEnd, end: pre.end, amp: 0.45 });
    fx.push({ type: 'flash', start: pre.end, end: pre.end + 0.18, amp: 0.3 });
    overlays.push({ type: 'rewind', start: pre.teaseEnd - 0.12, end: pre.end, teaseEnd: pre.teaseEnd });
    dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, 'Vorspann Rewind: ein kurzer Blick auf den besten Moment, dann spult der Film zurück an den Anfang.');
  }
  if (pre && pre.kind === 'shutter' && shutter) {
    const u = shutter.u;
    // nach dem Ortsnamen öffnet sich der Vorhang ruhig und gleichmäßig (vom Schlag 15 bis zum Einsatz auf 20)
    overlays.push({ type: 'shutter', start: shutter.black - 0.03, open: shutter.open, end: shutter.end + 0.02, glide: true });
    // nach dem dritten Zug kurz Schwarz, dann auf dem Schlag Ortsname und Koordinaten; sie stehen auf Schwarz und
    // gehen mit dem Öffnen (danach kein zweites Mal als Kapitel)
    if (title) overlays.push({ type: 'city', text: title, sub: subtitle, geo, start: shutter.black, end: shutter.open + 0.5 * u, cap: shutter.open + 0.5 * u });
    // Geräusch: nur der Projektor läuft ganz leise, der Rollladen schließt still
    sfx.push({ kind: 'projector', t: 0, dur: Math.max(0.6, shutter.pulls[0] + 0.25), gain: 0.35 });
    // Musik: läuft von Anfang an unverändert (auf Instagram kommt der Song ohnehin so); der Einstieg lebt davon,
    // dass jedes Bild, jeder Farbwechsel, jeder Zug und der Ortsname auf den Schlägen sitzen
    dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `Kino-Rollladen: ${clips[0].split ? clips[0].split.ids.length : 6} Ausschnitte eurer stärksten Aufnahmen erscheinen nebeneinander im Kinoband, schwarzweiß im halben Takt, das stärkste vorn, und werden in derselben Folge farbig; der Rollladen schließt in drei Zügen auf den Schlägen, kurz Schwarz, dann erscheint ${title ? `„${title}“` : 'der Ort'}${geo ? ' mit Koordinaten' : ''} auf Schwarz und geht mit dem Öffnen. Alles sitzt auf den Schlägen des Songs, der von Anfang an voll läuft; der Einsatz kommt fünf Takte nach dem ersten Bild (${fmtMS(shutter.end)}).`);
  }
  if (rush && rush.welcome && welcome) {
    // „Welcome to…“ von Anfang an; Ortsname auf dem Schlag; Schriftwechsel genau mit den Bildwechseln; Balken in Zügen
    overlays.push({ type: 'welcome', start: 0, end: welcome.end + 0.02, text: title, nameAt: welcome.name, fonts: welcome.fonts.slice(), pulls: welcome.pulls.slice(), pullDur: Math.min(0.28, welcome.u * 0.5) });
    dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `Welcome to ${title}: zehn passende Ausschnitte, immer ruhiger, das letzte Video läuft weiter; der Ortsname erscheint in Gelb und wechselt zwölfmal die Schrift – jedes Mal im selben Augenblick wie das Bild dahinter; die Balken schließen auf den Schlägen, auf dem Einsatz geht es mit einem Video in den Film.`);
  }
  if (pre && pre.kind === 'countdown') dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, 'Vorspann Countdown: 3 · 2 · 1 wie im alten Kino, danach beginnt dein Einstieg.');

  if (intro === 'cinema') {
    const cardEnd = Math.min(clips[P].end - 1.0, T0 + Math.max(2.2, barDur * 1.1));
    // Im Hochformat nie Schwarz: das Bild liegt abgedunkelt unter der Titelkarte
    if (vertical || pre) {
      fx.push({ type: 'dim', start: T0, end: cardEnd + 0.9, amp: 0.62, fadeOut: 0.9 });
      fx.push({ type: 'blur', start: T0, end: cardEnd + 0.9, amp: 1, fadeOut: 0.9 });
    } else fx.push({ type: 'black', start: 0, end: cardEnd + 0.9, amp: 1, fadeOut: 0.9 });
    overlays.push({ type: 'titlecard', text: title, sub: subtitle, geo, start: T0 + 0.15, end: cardEnd + 0.2 });
  } else if (intro === 'city') {
    fx.push({ type: 'focus', start: T0, end: T0 + Math.min(0.7, beatDur * 1.3), amp: 0.8 });
    fx.push({ type: 'dim', start: T0, end: tEnd + 0.3, amp: 0.3, fadeOut: 0.6 });
    if (title) overlays.push({ type: 'city', text: title, sub: subtitle, geo, start: T0, end: tEnd });
  } else if (intro === 'rush' && rush) {
    fx.push({ type: 'flash', start: rush.end, end: rush.end + 0.22, amp: 0.3 });
    if (title) overlays.push({ type: 'lower', text: title, sub: subtitle, geo, start: rush.end + Math.min(0.3, beatDur * 0.5), end: Math.min(D - 0.5, rush.end + Math.max(3.2, barDur * 1.6)) });
    dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `Bilderflut: ${clips.filter((c) => c.rush).length} Bilder in einem Takt, immer schneller, auf der Eins das stärkste Bild; danach wird es ruhiger und im Drop wieder schneller.`);
  } else if (intro === 'hook') {
    if (outro !== 'loop' && !pre) fx.push({ type: 'focus', start: 0, end: Math.min(0.6, beatDur * 1.2), amp: 1 });
    if (title) overlays.push({ type: 'lower', text: title, sub: subtitle, geo, start: T0 + Math.min(0.4, beatDur), end: tEnd });
  } else if (intro === 'type') {
    const end = Math.min(clips[P].end + (clips[P + 1] ? (clips[P + 1].end - clips[P + 1].start) * 0.5 : 0), tEnd + barDur * 0.5);
    if (title) {
      overlays.push({ type: 'type', text: title, sub: subtitle, start: T0, end, beats: beatsIn(T0, end - beatDur) });
      fx.push({ type: 'dim', start: T0, end, amp: 0.45, fadeOut: 0.5 });
    }
  } else if (flight) {
    const an0 = clips.find((c) => c.flightAnim);
    if (an0) overlays.push({ type: 'flight', flight, theme: s.mapTheme, ink: s.mapInk || '', land: s.mapLand, view: s.flightView, km: s.showStats !== false, start: Math.max(0, an0.start - 0.45), end: an0.end + 0.45 });
    const tk = clips.find((c) => c.role === 'takeoff'), ld = clips.find((c) => c.role === 'landing');
    if (title && tk && flight.from && flight.from.name) overlays.push({ type: 'lower', text: flight.from.name, sub: ['Abflug', flight.dep].filter(Boolean).join(' '), start: Math.min(0.4, beatDur), end: Math.min(tk.end - 0.5, Math.max(2.4, barDur * 1.2)) });
    if (title && ld && flight.to && flight.to.name) overlays.push({ type: 'lower', text: flight.to.name, sub: ['Ankunft', flight.arr].filter(Boolean).join(' '), start: ld.start + Math.min(0.8, beatDur * 1.5), end: Math.min(D - 0.3, ld.start + Math.max(2.6, barDur * 1.4)) });
  } else if (intro === 'countdown' && leader) {
    fx.push({ type: 'desat', start: leader.marks[0], end: leader.end, amp: 0.6, fadeOut: beatDur * 0.5 });
    fx.push({ type: 'flash', start: leader.end, end: leader.end + 0.22, amp: 0.35 });
    fx.push({ type: 'punch', start: leader.end, end: leader.end + 0.45, amp: 1 });
    overlays.push({ type: 'leader', marks: leader.marks, start: leader.marks[0], end: leader.end });
    if (title) overlays.push({ type: 'lower', text: title, sub: subtitle, geo, start: leader.end + Math.min(0.3, beatDur * 0.5), end: Math.min(D - 0.5, leader.end + Math.max(2.6, barDur * 1.3)) });
  } else if (intro === 'knockout' && knock) {
    if (title) overlays.push({ type: 'knockout', text: title, sub: subtitle, geo, start: T0, end: knock.end, zoomStart: knock.zoomStart });
  } else if (intro === 'grid' && clips[P] && clips[P].grid) {
    const g0 = clips[P].grid;
    if (title) overlays.push({ type: 'lower', text: title, sub: subtitle, geo, start: g0.zoomEnd + Math.min(0.3, beatDur * 0.5), end: Math.min(D - 0.5, g0.zoomEnd + Math.max(2.4, barDur * 1.2)) });
  } else if (intro === 'split') {
    if (title) overlays.push({ type: 'lower', text: title, sub: subtitle, geo, start: Math.max(0.6, (clips[0].split ? clips[0].split.reveal.slice(-1)[0] : 0) + 0.2), end: Math.min(D * 0.45, clips[0].end + barDur * 0.5), center: true });
  }

  // Kapitel (Gesamtfilm)
  const introOvEnd = Math.max(0, ...overlays.map((o) => o.end));
  const introOvEnd0 = introOvEnd;
  let chapterCount = 0;
  for (const c of clips) if (c.chapter) chapterCount++;
  // Karten-Moment: bei Etappen ab 20 km zeigt eine kleine Karte, wie weit es zum neuen Ort ging
  const routeMap = (chIdx, st, en) => {
    const sp = trip && trip.stops;
    if (s.chapMap === 'off' || !sp || chIdx < 1 || !sp[chIdx].pos || !sp[chIdx - 1].pos || !((sp[chIdx].legKm || 0) > 20) || en - st < 2) return;
    const bt = beatsRel.filter((b) => b > st + 0.2 && b < en);
    overlays.push({ type: 'routemap', stops: sp.map((x) => x.pos || null), idx: chIdx, label: `ab ${sp[chIdx - 1].name}`, km: `${Math.round(sp[chIdx].legKm).toLocaleString('de-DE')} km`, theme: s.mapTheme, ink: s.mapInk || '', start: st, end: en, draw: bt.length > 2 ? Math.max(0.8, Math.min(2, bt[2] - st - 0.25)) : 1.6 });
  };
  for (let ci = 0; ci < clips.length; ci++) {
    const c = clips[ci];
    if (!c.chapter) continue;
    const next = clips.slice(ci + 1).find((x) => x.chapter);
    const chEnd = next ? next.start : D;
    const st = Math.max(c.start + 0.3, introOvEnd + 0.2);
    if (chEnd - st < 1.4) continue;
    if (s.showChapters === false) continue;
    // Kein zweites Mal derselbe Ort: ein Kapitel mit dem Namen des Einstiegstitels (und nach dem Kino-Rollladen das
    // erste Kapitel) wird nicht zusätzlich unten links eingeblendet
    if (title && (String(c.chapter).toLowerCase() === String(title).toLowerCase() || ((shutter && pre && pre.kind === 'shutter') || (rush && rush.welcome)) && c.chapterNo === 1)) continue;
    const chIdx = trip && trip.stops ? trip.stops.findIndex((x) => x.name === c.chapter) : -1;
    // Kapitel steht über zwei Einstellungen (mindestens 3,4 s), damit Ort und Kilometer in Ruhe lesbar sind
    const second = clips.slice(ci + 1, ci + 3).filter((x) => x.start < chEnd).pop();
    const chDur = Math.max(3.4, barDur * 2, second ? second.end - st : 0);
    if (s.chapKnock === 'on' && ci > 0 && c.chapterNo > 1) {
      // „Durch den Namen“: der Ort ist ein Fenster ins Bild, dann zoomt die Kamera auf einem Beat durch die Buchstaben
      const hold = Math.max(1.8, barDur);
      const zs = beatsRel.find((b) => b >= c.start + hold - 0.05);
      const ze = zs != null ? beatsRel.find((b) => b >= zs + Math.max(0.35, beatDur * 0.9)) : null;
      if (zs != null && ze != null && ze <= c.end - 0.3) {
        routeMap(chIdx, ze + 0.1, Math.min(chEnd - 0.2, ze + Math.max(3.2, barDur * 1.6)));
        overlays.push({ type: 'knockout', text: c.chapter, sub: `${String(c.chapterNo).padStart(2, '0')} / ${String(chapterCount).padStart(2, '0')}`, geo: chIdx >= 0 ? geoFor(chIdx) : null, start: c.start, end: ze, zoomStart: zs, chapter: true });
        continue;
      }
    }
    const chEndOv = Math.min(chEnd - 0.2, st + Math.min(chDur, 5));
    routeMap(chIdx, st, chEndOv);
    overlays.push({ type: 'chapter', text: c.chapter, no: c.chapterNo, total: chapterCount, geo: chIdx >= 0 ? geoFor(chIdx) : null, start: st, end: chEndOv });
  }

  // Ende
  const last = clips[clips.length - 1];
  // kurze Story (< 35 s): stand der Ort schon im Einstieg, kommt er am Ende nicht noch einmal (zu nah beieinander)
  const endTitle = title && !(D < 35 && overlays.some((o) => o.text === title && o.start < D * 0.5)) ? title : '';
  if (outro === 'credits') {
    const cardDur = Math.min(Math.max(1.8, barDur), D * 0.18);
    const blackStart = D - cardDur - 0.9;
    fx.push({ type: 'black', start: blackStart, end: D + 1, amp: 1, fadeIn: 0.9 });
    const sp = trip && trip.statsParts;
    const stats = s.showStats !== false && sp ? [sp.places, (kmMode === 'leg' || kmMode === 'total') && sp.km > 5 ? `${Math.round(sp.km).toLocaleString('de-DE')} km` : '', sp.days].filter(Boolean).join(' · ') : '';
    overlays.push({ type: 'endcard', text: endTitle, sub: subtitle, stats, start: D - cardDur, end: D + 0.5 });
  } else if (outro === 'freeze') {
    let fStart = Math.max(last.start + 0.3, D - Math.min(2.8, Math.max(1.8, barDur)));
    // ein Video am Ende läuft erst eine Weile, bevor es zum Standbild wird
    const lm = byId.get(last.mediaId);
    if (lm && lm.kind === 'video') fStart = Math.max(fStart, Math.min(D - 0.8, last.start + (last.end - last.start) * 0.7));
    last.freezeAt = last.freezeAt != null ? Math.min(last.freezeAt, fStart) : fStart;
    fx.push({ type: 'desat', start: fStart, end: D + 1, amp: 1, fadeIn: 0.7 });
    fx.push({ type: 'black', start: D - 0.5, end: D + 1, amp: 1, fadeIn: 0.45 });
    if (endTitle) overlays.push({ type: 'lower', text: title, sub: subtitle, start: fStart + 0.25, end: D + 0.5, freeze: true });
  } else if (outro === 'split') {
    fx.push({ type: 'black', start: D - 0.08, end: D + 1, amp: 1 });
    if (endTitle) overlays.push({ type: 'lower', text: title, sub: subtitle, start: Math.max(last.start + 0.4, D - barDur), end: D, center: true });
  } else if (outro !== 'loop') {
    fx.push({ type: 'black', start: D - 1.0, end: D + 1, amp: 1, fadeIn: 1.0 });
  }

  // Standbild-Ende: Originalton endet mit dem Standbild
  if (last && last.freezeAt != null) for (const v of voice) if (v.t0 >= last.visStart - 0.01) v.t1 = Math.min(v.t1, last.freezeAt + 0.3);
  if (voice.length) dir.notes.push(`Originalton an in ${new Set(voice.map((v) => v.mediaId)).size} ${new Set(voice.map((v) => v.mediaId)).size === 1 ? 'Video' : 'Videos'}: Die Musik wird dort automatisch leiser, diese Einstellungen laufen in Echtzeit.`);

  const firstBurst = clips.find((c) => c.burst);
  if (firstBurst) {
    if (effectsOf(s) !== 'schlicht') fx.push({ type: 'flash', start: firstBurst.start, end: firstBurst.start + 0.18, amp: 0.3 });
    if (!firstBurst.flash) dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `Foto-Serie: Im ${SEC_DE[firstBurst.label] || 'Drop'} ab ${fmtMS(firstBurst.start)} wechselt jeden ${beatDur / 2 >= 0.2 ? 'halben ' : ''}Beat das Bild.`);
  }
  // Zoom-Impulse sparsam: höchstens einer je zwei Takte (der Drop-Einsatz hat Vorrang), in ruhigen Filmen sanfter
  let lastPunch = -1e9;
  const punchAmp = s.pace === 'ruhig' ? 0.6 : 1;
  for (const c of clips) {
    if (c.punch && effectsOf(s) !== 'schlicht' && (c.start - lastPunch >= barDur * 2 || c.sectionChange)) { fx.push({ type: 'punch', start: c.start, end: c.start + 0.45, amp: punchAmp }); lastPunch = c.start; }
    if (c.freezeAt != null && !(outro === 'freeze' && c === last)) fx.push({ type: 'flash', start: c.freezeAt, end: c.freezeAt + 0.2, amp: 0.25 });
  }

  if (last && last.strip) {
    const dur = last.end - last.start;
    if (endTitle) overlays.push({ type: 'lower', text: title, sub: subtitle, geo: null, start: last.start + dur * 0.4, end: D + 0.5, center: true });
    dir.notes.push('Ende als Filmstreifen: das letzte Bild wird zum Einzelbild auf dem Streifen, der rückwärts durch deinen Film läuft.');
  }

  // Digicam: kleiner Blitz auf Fotoschnitten, Datumsstempel wie früher
  const digicam = s.look === 'digicam';
  if (digicam) {
    let k = 0;
    for (const c of clips) {
      const m = byId.get(c.mediaId);
      if (!m || m.kind !== 'image' || c.pre || c.grid || c.split || c.i === 0 || c.burst) continue;
      if (k++ % 2 === 0) fx.push({ type: 'flash', start: c.start, end: c.start + 0.12, amp: 0.22 });
    }
  }
  if (s.stamp === 'on' || (s.stamp !== 'off' && digicam)) {
    const blackAt = Math.min(D, ...fx.filter((f) => f.type === 'black' && f.start > D * 0.5).map((f) => f.start));
    const stampText = (ms) => { const d = new Date(ms); return `'${String(d.getFullYear() % 100).padStart(2, '0')} ${String(d.getMonth() + 1).padStart(2, ' ')} ${String(d.getDate()).padStart(2, '0')}`; };
    let curOv = null;
    for (const c of clips) {
      const m = byId.get(c.mediaId);
      const ok = m && m.time > 1e11 && !c.pre && !c.grid && !c.split && !c.flightAnim && !c.strip;
      const st = Math.max(c.start, introOvEnd0), en = Math.min(c.end, blackAt);
      if (!ok || en - st < 0.2) { curOv = null; continue; }
      const text = stampText(m.time);
      if (curOv && curOv.text === text && Math.abs(curOv.end - st) < 0.01) { curOv.end = en; continue; }
      curOv = { type: 'datestamp', text, start: st, end: en };
      overlays.push(curOv);
    }
  }

  // Eigene Texte und Sticker
  for (const t of overrides.texts || []) {
    let st = t.start != null ? t.start : 0, en = t.end != null ? t.end : D;
    if (t.anchor) {
      // an eine Aufnahme gebunden: folgt ihr, auch wenn sich der Schnitt ändert
      const cand = clips.filter((c) => c.mediaId === t.anchor.mediaId && !c.grid).sort((a, b) => Math.abs(a.i - t.anchor.idx) - Math.abs(b.i - t.anchor.idx))[0];
      if (!cand) continue;
      st = cand.start + Math.min(0.12, (cand.end - cand.start) * 0.1);
      en = cand.end - 0.04;
    }
    overlays.push({ ...t, type: 'usertext', start: st, end: en });
  }
  for (const st of overrides.stickers || []) if (st.kind !== 'emoji') overlays.push({ ...st, type: 'sticker', start: st.start != null ? st.start : 0, end: st.end != null ? st.end : D });

  // Lückenlos: winzige Rundungsreste an den Rändern schneller Serien (unter 20 ms) schließen – der Schnitt liegt
  // auf dem Beginn der nächsten Einstellung (dort sitzt der Schlag)
  for (let i = 1; i < clips.length; i++) {
    const a = clips[i - 1], b = clips[i], d = b.start - a.end;
    if (d !== 0 && Math.abs(d) < 0.02) { a.end = b.start; if (a.visEnd != null) a.visEnd += d; }
  }
  // Keine Doppelungen: wiederholt sich eine Aufnahme nur, weil sonst Zeit übrig wäre, wird mit längeren Einstellungen neu geplant
  const plain = clips.filter((c) => c.mediaId && !c.pre && !c.leader && !c.reveal && !c.grid && !c.burst && !c.split && !c.strip && !c.stack && !c.miniRew && !c.rush && !c.replay && !c.loop && !c.flightAnim);
  const seen = new Map();
  for (const c of plain) seen.set(c.mediaId, (seen.get(c.mediaId) || 0) + 1);
  // Foto-Serien zählen mit (sonst könnte eine Serie Bilder wiederholen, ohne dass es auffällt)
  for (const c of clips) if (c.burst && !c.flash && c.mediaId && !c.repeatSeg && !c.replay && !c.miniRew) seen.set(c.mediaId, (seen.get(c.mediaId) || 0) + 1);
  // Bilder im Split-Screen zählen mit: dasselbe Bild einzeln und im Split wäre auch eine Doppelung
  // (die Wand des Kino-Rollladens ist ein Vorgeschmack wie der Rewind-Anriss, keine Doppelung)
  for (const c of clips) for (const id of c.split && !c.pre ? c.split.ids : c.stack ? c.stack.ids : []) seen.set(id, (seen.get(id) || 0) + 1);
  const repeats = [...seen.values()].reduce((a, n) => a + Math.max(0, n - 1), 0);
  // Kapazität: wie viele Aufnahmen passen, welche bleiben draußen, welche Videos sind zu lang
  const usedSet = new Set(clips.flatMap((c) => (c.split ? c.split.ids : c.stack ? c.stack.ids : c.grid && c.grid.ids ? c.grid.ids.concat([c.mediaId]) : [c.mediaId])).filter(Boolean));
  const droppedIds = good.filter((m) => !usedSet.has(m.id)).map((m) => m.id);
  // Reisefilm (Kapitel): Zielmenge je nach Menge – Höhepunkte ≈ ein Bild je 1,8 s, mehr ≈ je 1,4 s, so viele wie möglich = alle
  const chapTarget = chapters && chapters.length ? Math.min(good.length, mengeOf(s) === 'max' ? good.length : Math.round(D / (mengeOf(s) === 'mehr' ? 1.4 : 1.8))) : 0;
  // Nachplanen, bis jede Aufnahme genau einmal vorkommt: ideale Zahl der Einstellungen = jetzige − Wiederholungen + fehlende.
  // Daraus folgt die Schnittlänge; wird sie kürzer als die ruhige Mindestlänge, wird der Film (bei „Auto“) länger.
  const tooLong = good.filter((m) => m.kind === 'video' && videoSpan(m) > fr.vmax * 1.15).map((m) => ({ id: m.id, name: m.name, dur: videoSpan(m) }));
  const songLen = Math.max(1, (an.lastSound || an.duration) - (an.firstSound || 0));
  // passt nicht alles hinein, zählt, was der Film tatsächlich zeigt; sonst die Schätzung aus Songlänge und Mindestlänge
  const imgUsed = good.filter((m) => m.kind === 'image' && usedSet.has(m.id)).length;
  const imgFit = droppedIds.length ? Math.max(1, imgUsed) : Math.max(1, Math.floor((Math.min(fr.max, songLen) - barDur - Math.min(vidT, fr.max * 0.7)) / fr.shotMin));
  // wie die Aufnahmen verdichtet wurden (für den Hinweis unter dem Format)
  const packed = {
    split: clips.filter((c) => c.split).reduce((a, c) => a + c.split.ids.filter((id) => byId.get(id) && byId.get(id).kind === 'image').length, 0),
    vsplit: clips.filter((c) => c.split).reduce((a, c) => a + c.split.ids.filter((id) => byId.get(id) && byId.get(id).kind === 'video').length, 0),
    burst: clips.filter((c) => c.burst).length,
    stack: clips.filter((c) => c.stack).reduce((a, c) => a + c.stack.ids.length, 0),
    grid: clips.filter((c) => c.gridMid && c.grid && c.grid.ids).reduce((a, c) => a + c.grid.ids.length - 1, 0),
  };
  // Blitze sparsam: ein Aufhellen wirkt nur, wenn es selten ist. Höchstens einer je zwei Takte (Digicam ausgenommen, dort ist er Stil)
  if (!digicam) {
    const fl = fx.filter((f) => f.type === 'flash').sort((a, b) => a.start - b.start || b.amp - a.amp);
    let lastF = -1e9;
    const drop = new Set();
    for (const f of fl) { if (f.start - lastF < barDur * 2) drop.add(f); else lastF = f.start; }
    for (let k = fx.length - 1; k >= 0; k--) if (drop.has(fx[k])) fx.splice(k, 1);
  }
  const capacity = { packed, all: allOn, label: fr.label, story: fr.kind === 'story' && s.target !== 'reel' && s.format === '9:16', maxFilm: fr.max, vmax: fr.vmax, imgFit, images: good.filter((m) => m.kind === 'image').length, videos: good.length - good.filter((m) => m.kind === 'image').length, droppedIds, tooLong, repeats };
  if (!flight) {
    if (droppedIds.length) dir.notes.push(`${droppedIds.length} ${droppedIds.length === 1 ? 'Aufnahme passt' : 'Aufnahmen passen'} nicht mehr in ${capacity.story ? 'diese Story' : 'diesen Film'} (${fmtMS(D)}): zu diesem Song passen etwa ${imgFit} Fotos${capacity.videos ? ' neben den Videos' : ''}. Die schwächsten bleiben draußen, im Material markiert.${capacity.story ? ' Als Reel passen mehr.' : ''}`);
    for (const v of tooLong) dir.notes.push(`Video „${v.name}“ ist ${Math.round(v.dur)} s lang, im Film laufen höchstens ${Math.round(fr.vmax)} s: tippe es im Material an und wähle einen Ausschnitt.`);
    if (repeats) dir.notes.push(`Für die gewählte Länge sind es zu wenig Aufnahmen: ${repeats} ${repeats === 1 ? 'Einstellung wiederholt' : 'Einstellungen wiederholen'} ein Bild. Wähle die Länge „Auto“ oder füge Aufnahmen hinzu.`);
  }

  // Takt: jede Einblendung beginnt auf Schlag, halbem Schlag oder Schnitt (nächster Rasterpunkt, Dauer bleibt).
  // Ausgenommen: eigene Texte/Sticker (Nutzer), Datumsstempel, Flug/Karte (laufen mit dem Bild), Rollladen selbst
  {
    const bw = Array.from(bts0), g = bw.concat(bw.slice(1).map((b, i) => (b + bw[i]) / 2), clips.map((c) => c.start)).filter((t) => t > 0.05 && t < D - 0.3);
    for (const o of overlays) {
      if (['shutter', 'sticker', 'usertext', 'datestamp', 'flight', 'routemap'].includes(o.type) || !(o.start > 0.05)) continue;
      let best = o.start, bd = Infinity;
      for (const t of g) { const d = Math.abs(t - o.start); if (d < bd - 1e-6 || (Math.abs(d - bd) < 1e-6 && t < best)) { bd = d; best = t; } }
      if (bd < 0.02 || bd > beatDur * 0.5) continue;
      const dt = best - o.start;
      o.start = best;
      if (o.end != null) o.end = Math.min(D, o.end + dt);
      if (o.cap != null && o.end > o.cap) o.end = Math.max(o.start + 0.5, o.cap);
    }
  }

  // Lesezeit: Ortsnamen und Titel der Einstiege bleiben nach dem Ausschreiben (Wörter, Datum, Koordinaten, Kilometer)
  // so lange stehen, dass man sie in Ruhe lesen kann – erst dann gleiten sie hinaus
  for (const o of overlays) {
    if (!['city', 'lower', 'type'].includes(o.type) || o.start > D * 0.5 || !o.text) continue;
    const need = o.start + titleReadTime(o, beatDur);
    const cap = o.cap != null ? o.cap : D - 0.25;
    if (o.end < need) o.end = Math.max(o.end, Math.min(need, cap));
  }

  // Titel an die ruhigste Stelle des Bilds (mit Kontrastprüfung), Ortsname hinter den Bergen (Bildverständnis)
  {
    const bh = band[1] * fmt.h, baseF = Math.min(fmt.w, bh * (vertical && band[1] < 1 ? 1.6 : 1));
    const titleSize = Math.min(0.19 * baseF, (0.86 * fmt.w) / (0.62 * Math.max(4, String(title || '').length))) / bh;
    const pl = placeTitles(overlays, clips, { byId, outAspect, vertical, fx, titleSize, band });
    if (pl.behind) dir.notes.push('Ortsname hinter den Bergen: die Himmelslinie des Bilds läuft durch die Schrift, der Vordergrund liegt davor.');
    else if (pl.placed) dir.notes.push(`Titel an die ruhigste Stelle des Bilds gesetzt, Schriftfarbe und Abdunklung nach dem Kontrast gewählt${pl.placed > 1 ? ` (${pl.placed} Einblendungen)` : ''}.`);
  }

  // von dir festgelegte Videolängen: wie viele Sekunden fehlen (über einen Schlag hinaus)? Die Suche gibt ihnen dann Raum.
  const vShort = +good.filter((m) => userVideoLen(m)).reduce((a, m) => {
    const got = clips.filter((c) => c.mediaId === m.id && !c.split && !c.burst && !c.rush && !c.leader).reduce((x, c) => x + c.end - c.start, 0);
    return a + (got ? Math.max(0, userVideoLen(m) - got - beatDur * 1.05) : 0);
  }, 0).toFixed(2);
  const extraNeed = droppedIds.reduce((a, id) => { const m = good.find((x) => x.id === id); return a + (m.kind === 'video' ? videoPlay(m, fr.vmax) : fr.shotMin); }, 0);
  return {
    _m: { repeats, vShort, dropped: droppedIds.length, short: chapTarget ? Math.max(0, chapTarget - (good.length - droppedIds.length)) : 0, target: chapTarget, scale: usedScale, floor: (fr.shotMin / fr.shot) * (level >= 1 ? 0.5 : 1), D, max: autoMax(s), settings, extraNeed, level },
    capacity,
    duration: D, win, clips: all, visibleClips: clips.length,
    look: s.look, format: s.format, frame: s.frame, band, pace: s.pace, split: s.split, font: s.font || 'klassisch', motion: s.motion || 'ken', motionAmt: s.motionAmt || 'medium',
    intro, outro, fx, overlays, sfx, notes: dir.notes, resolved: s, voice,
    beats: beatsRel, downs, beatEnergy, beatDur,
    accent, chroma, colorFx, parallax: s.parallax === 'on' ? 1 : 0,
    sections: (an.sections || []).filter((x) => x.end > win.start && x.start < win.end).map((x) => ({ ...x, start: Math.max(0, x.start - win.start), end: Math.min(D, x.end - win.start) })),
    usedMedia: usedSet.size,
  };
}
