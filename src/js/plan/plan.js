/* Planer · Ein Planungsdurchlauf: Einstieg, Stil-Mittel, chronologische Zuteilung, Übergänge, Effekte */
function planOnce(opts) {
  const { an, media, settings, overrides = {}, chapters = null, trip = null, flight = null } = opts;
  const pool = media.filter((m) => !m.bad && !m.loading);
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
  const allOn = s.allMedia !== 'off' && !chapters && !flight;
  // Chronologischer Durchlauf (Ortsfilme, Reels, Storys): Aufnahmen strikt nach Aufnahmezeit
  const chrono = !chapters && !flight;
  const level = opts._level || 0;

  // Schnittpunkte, ausbalanciert gegen die Menge des Materials
  const fr = formatRule(s);
  const shotBase = fr.shot / 1.7;
  // Schnittlänge nach Material: Videos bekommen (fast) ihre ganze Länge, die übrige Zeit teilen sich die Fotos.
  // Viel Material → dichter (nie kürzer als shotMin), wenig Material → ruhiger statt Bilder zu wiederholen.
  const good = goodMedia(usable, allOn);
  const vidT = good.filter((m) => m.kind === 'video').reduce((a, m) => a + videoPlay(m, fr.vmax), 0);
  const imgN = Math.max(1, good.filter((m) => m.kind === 'image').length);
  // Mindestlänge je Einstellung; müssen alle Aufnahmen hinein, darf es bis auf einen Beat dichter werden
  const minShot = flight ? 0 : level >= 1 ? Math.max(0.4, beatDur * 0.9) : fr.shotMin * (settings.pace === 'schnell' ? 0.5 : 0.7);
  // Mindestlänge in ruhigen Songteilen, wenn verdichtet wird: zwei Beats (Break/Intro/Outro), die Dynamik bleibt hörbar und sichtbar
  const calmMin = level >= 1 && level < 4 ? Math.max(0.9, beatDur * 2) : 0;
  let segs = planCuts(an, win, s.pace, opts._scale || 1, shotBase, minShot, calmMin);
  let usedScale = opts._scale || 1;
  // erste Schätzung; die Suche in buildPlan gibt die Schnittlänge danach direkt vor
  if (!flight && !opts._scale) {
    const imgTime = Math.max(barDur, D - Math.min(vidT, D * 0.7) - barDur);
    const haveShot = D / Math.max(1, segs.length), wantShot = imgTime / imgN;
    const scale = Math.max(fr.shotMin / fr.shot, Math.min(3, wantShot / haveShot));
    if (Math.abs(scale - 1) > 0.12) { segs = planCuts(an, win, s.pace, scale, shotBase, minShot, calmMin); usedScale = scale; }
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
    for (let t0 = teaseEnd; t0 < end - 0.05; t0 += sub) pieces.push({ start: t0, end: Math.min(end, t0 + sub), f: { pre: 'rew' } });
    pre = { kind: 'rewind', beats: 4 * bStep, end, teaseEnd, pieces };
  }
  if (pre && pre.end > D * 0.35) pre = null;
  const pb = pre ? pre.beats : 0;
  const T0 = pre ? pre.end : 0;

  let gridPlan = null;
  if (intro === 'grid') {
    const n = goodMedia(usable, allOn).length >= 9 ? 3 : 2;
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

  // Einstieg: Mindestdauer der ersten Einstellung
  const firstMin = knock || leader || reveal || rush || intro === 'grid' ? 0 : intro === 'city' ? Math.min(D * 0.35, Math.max(2.4, barDur * 1.2)) : intro === 'cinema' ? Math.min(D * 0.35, Math.max(3.2, barDur * 1.6)) : intro === 'type' ? Math.min(D * 0.3, Math.max(1.8, barDur)) : intro === 'split' ? Math.min(D * 0.3, Math.max(2.2, barDur)) : Math.min(Math.max(1.3, barDur * 0.95), 2.8, D * 0.3);
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
  if ((s.burst === 'drop' || rush || level >= 2) && !flight && goodMedia(usable, allOn).length >= 5) {
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
    for (const pk of peaksB.slice(0, level >= 4 ? 40 : level >= 3 ? 6 : level >= 2 ? 3 : 1)) {
      const sub = beatDur / 2 >= 0.2 ? beatDur / 2 : beatDur;
      // die Serie bleibt in ihrem Songteil (läuft nicht in einen ruhigen Teil hinein)
      const secEnd = sectionAt(an, win.start + pk.rel + 0.02).end - win.start;
      const ds = pk.rel, de = Math.min(D - 1.2, ds + sub * (level >= 3 ? 16 : 8), Math.max(ds + sub * 4, secEnd));
      if (segs.some((g) => (g.burst || g.gridSeg || g.pre || g.reveal || g.leader || g.knock || g.rush) && g.start < de && g.end > ds)) continue;
      const out = [];
      for (const g of segs) {
        if (g.end <= ds + 0.01 || g.start >= de - 0.01) { out.push(g); continue; }
        if (g.start < ds - 0.01) out.push({ ...g, end: ds });
        if (g.end > de + 0.01) out.push({ ...g, start: de });
      }
      for (let t0 = ds; t0 < de - 0.05; t0 += sub) out.push({ start: t0, end: Math.min(de, t0 + sub), w: 5, burst: true });
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
  if (s.midGrid === 'on' && !flight && goodMedia(usable, allOn).length >= 5) {
    const busy = (a, b) => segs.some((g) => (g.burst || g.gridSeg || g.pre || g.reveal || g.leader || g.knock) && g.start < b && g.end > a);
    const peaks = secsRel.filter((x) => isPeakSec(x) && x.rel > Math.max(introEnd, barDur) + barDur);
    // ohne weiteren Refrain: Anfang einer Phrase (4 Takte) mitten im Drop/Refrain
    const phase = an.phrasePhase || 0;
    const phrases = (an.barStart || []).map((b, k) => ({ rel: b - win.start, k })).filter((x) => (x.k - phase) % 4 === 0 && x.rel > introEnd + barDur * 2 && isPeakSec(sectionAt(an, win.start + x.rel + 0.02)))
      .map((x) => ({ rel: x.rel, end: x.rel + barDur * 4, start: win.start + x.rel }));
    // bevorzugt der zweite Refrain (der erste gehört oft dem Einstieg oder der Foto-Serie)
    for (const pk of [...(peaks.length > 1 ? [peaks[1], peaks[0], ...peaks.slice(2)] : peaks), ...phrases]) {
      const n = goodMedia(usable, allOn).length >= 9 && pk.end - pk.start >= barDur * 4 ? 3 : 2;
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
  if (s.mini === 'on' && !flight && goodMedia(usable, allOn).length >= 6) {
    const colorOn = s.color && s.color !== 'off';
    for (const h of colorOn && hitsRel.length > 1 ? hitsRel.slice(1).concat(hitsRel[0]) : hitsRel) {
      const k = beatIdxAt(h);
      if (k < 2 || Math.abs(bts0[k] - h) > 0.08) continue;
      const a = bts0[k - 2], z = bts0[k];
      if (a < introEnd + barDur * 0.5 || overlapsSpecial(a, z)) continue;
      const sub = (z - a) / 4 >= 0.2 ? (z - a) / 4 : (z - a) / 2;
      const pieces = [];
      for (let t0 = a; t0 < z - 0.05; t0 += sub) pieces.push({ start: t0, end: Math.min(z, t0 + sub), w: 5, miniRew: true });
      insertSegs(a, z, pieces);
      miniAt = { a, z };
      break;
    }
  }
  let stackAt = null;
  if (s.stack === 'on' && !flight && goodMedia(usable, allOn).filter((m) => m.kind === 'image').length >= 6) {
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
    const all = orderChrono(goodMedia(usable, allOn));
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
  if (chrono) {
    const all0 = orderChrono(goodMedia(usable, allOn));
    // Startbild: das stärkste Foto der ersten Momente (die Reihenfolge verschiebt sich dafür höchstens um wenige Plätze)
    const early = all0.slice(0, Math.max(3, Math.ceil(all0.length * 0.15)));
    const hk = intro === 'split' ? null : (settings.hookId && all0.find((m) => m.id === settings.hookId)) || early.filter((m) => m.kind === 'image').sort((a, b) => (b.score || 0) - (a.score || 0))[0] || all0[0] || null;
    // innerhalb eines Moments (wenige Minuten) darf ein Bild aus dem vorigen hervorgehen (Match-Cuts, Farbfluss)
    const flowed = spreadSimilar(flowOrder(all0.filter((m) => m !== hk), s.match !== 'off'));
    // eigene Reihenfolge aus der Zeitleiste geht vor
    let queue = applyMoves(hk ? [hk, ...flowed] : flowed, overrides.moves);
    const chronoCtx = { s, an, win, fr, level, allOn, intro, outro, rush, reveal, leader, gridPlan, special, splitFit, splitN, barDur, beatDur, isPeakSec, scenes: sceneStarts(all0) };
    let res = layoutChrono(chronoCtx, segs, queue, 0);
    // alle Aufnahmen: fehlen am Ende noch welche, früher etwas mehr zusammenfassen (Split-Screens)
    for (let k = 0; k < 2 && allOn && res.dropped.length; k++) {
      const r2 = layoutChrono(chronoCtx, segs, queue, res.dropped.length * (k + 1));
      if (r2.dropped.length < res.dropped.length) res = r2;
    }
    // „Beste Auswahl“: passt nicht alles, fallen die schwächsten Aufnahmen weg (nie das Startbild oder Favoriten)
    for (let k = 0; k < 3 && !allOn && res.dropped.length; k++) {
      const weak = queue.filter((m) => m !== hk && !m.fav && m.kind === 'image').sort((a, b) => (a.score || 0) - (b.score || 0)).slice(0, res.dropped.length);
      queue = queue.filter((m) => !weak.includes(m));
      res = layoutChrono(chronoCtx, segs, queue, 0);
    }
    segs = res.segs;
    chronoInfo = { hook: hk && queue[0] === hk ? hk : null, queue };
  }


  const clips = segs.map((g, i) => {
    const abs = win.start + g.start;
    const sec = sectionAt(an, abs + 0.01);
    return {
      i, start: g.start, end: g.end, label: sec.label, energy: sec.energy, weight: g.w, freezeAt: g.freezeAt, burst: !!g.burst, leader: !!g.leader, pre: g.pre || null, reveal: !!g.reveal, vid: g.vid || null, gridMid: g.gridMid || null, grid: !!g.gridMid, miniRew: !!g.miniRew, rush: !!g.rush, stack: g.stackSeg ? { times: g.stackSeg.times, reserved: g.stackIds || null } : null,
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
    const weights = chapters.map((c) => Math.max(1, c.media.length));
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
      for (let k = bounds[c]; k < bounds[c + 1]; k++) if (!clips[k].stack && !clips[k].miniRew) idxs.push(k);
      const cnt = idxs.length;
      let chMedia = chapters[c].media;
      const stC = clips.slice(bounds[c], bounds[c + 1]).find((x) => x.stack);
      if (stC) {
        const imgsC = orderChrono(chMedia.filter((m) => m.kind === 'image' && !m.bad && !m.excluded));
        const res = imgsC.length >= cnt + 3 ? imgsC.slice(Math.max(0, Math.round(imgsC.length / 2) - 2)).slice(0, 4) : [];
        stC.stack.reserved = res.map((m) => m.id);
        chMedia = chMedia.filter((m) => !res.includes(m));
      }
      const sel = spreadSimilar(flowOrder(selectMedia(chMedia, cnt, new Set()), s.match !== 'off'));
      if (sel.length) assignStream(clips, idxs, sel, byId);
      clips[bounds[c]].chapter = chapters[c].title; clips[bounds[c]].chapterNo = c + 1; clips[bounds[c]].role = 'chapter';
    }
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
      const imgsC = orderChrono(goodMedia(usable, allOn).filter((m) => m.kind === 'image' && !mustIds.has(m.id) && m.id !== settings.hookId));
      const top = imgsC.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      const cand = imgsC.filter((m) => m !== top);
      if (cand.length >= 7) { const at = Math.round((stackC.start / D) * (cand.length - 4)); reserved = cand.slice(at, at + 4); }
      stackC.stack.reserved = reserved.map((m) => m.id);
    }
    const chosen = selectMedia(pool.filter((m) => !reserved.includes(m)), clips.length - splitClips.length + 2, mustIds);
    // automatisches Startbild: kein Video, das ohnehin einen eigenen Platz hat (es liefe sonst doppelt oder der Platz bliebe leer)
    const hookCand = chosen.filter((m) => !clips.some((c) => c.vid === m.id));
    hook = settings.hookId && byId.get(settings.hookId) ? byId.get(settings.hookId) : (hookCand.length ? hookCand : chosen).slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
    const rest = spreadSimilar(flowOrder(chosen.filter((m) => m !== hook), s.match !== 'off'));
    order = hook ? [hook, ...rest] : rest;
    // zweitbestes Motiv auf den ersten Drop/Refrain
    const dropIdx = clips.findIndex((c) => (c.label === 'drop' || c.label === 'chorus') && c.sectionChange);
    if (dropIdx > 1 && rest.length > 2) {
      const best2 = rest.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      const at = order.indexOf(best2);
      if (at > 0) { order.splice(at, 1); order.splice(Math.min(dropIdx, order.length), 0, best2); }
    }
    // Einstellungen, die der Einstieg ohnehin fest belegt (Startbild, Aufblende, Countdown, Vorspann), nicht verteilen:
    // sonst würde ein Bild dort vergeben, gleich überschrieben und fehlte dann im Film
    const hookAt = hook && intro !== 'split' ? (rush ? P + clips.filter((c) => c.rush).length : reveal ? P + clips.filter((c) => c.reveal).length : leader ? P + 3 : gridPlan ? P + 1 : P) : -1;
    const fixedIdx = (c) => c.i === hookAt || c.reveal || c.pre || c.miniRew || c.stack || c.rush || (leader && c.i >= P && c.i < P + 3) || (gridPlan && c.i === P);
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
  if (rushC.length) {
    const hookC = clips.find((c) => c.role === 'hook');
    const fotos = orderChrono(goodMedia(usable, allOn).filter((m) => m.kind === 'image' && (!hookC || m.id !== hookC.mediaId)));
    const src = fotos.length ? fotos : goodMedia(usable, allOn).filter((m) => m.kind === 'image');
    rushC.forEach((c, k) => {
      const m = src.length ? src[Math.floor((k * src.length) / rushC.length) % src.length] : null;
      c.mediaId = m ? m.id : c.mediaId; c.role = 'rush';
    });
  }

  // Split-Material zuteilen: bevorzugt passende Ausrichtung, wenig benutzt
  const useCount = new Map();
  for (const c of clips) if (c.mediaId) useCount.set(c.mediaId, (useCount.get(c.mediaId) || 0) + 1);
  for (const si of splitClips.sort((a, b) => a - b)) {
    const c = clips[si];
    // Videos mit eigenem Platz nicht zusätzlich im Split-Screen
    const pool2 = goodMedia(usable, allOn).filter((m) => !(m.kind === 'video' && clips.some((x) => x.vid === m.id)));
    const fitting = pool2.filter(splitFit);
    // nur Aufnahmen, die sonst nicht zu sehen sind (sonst wäre es eine Doppelung)
    const unusedFit = fitting.filter((m) => !useCount.get(m.id)), unused = pool2.filter((m) => !useCount.get(m.id));
    const src = (unusedFit.length >= 2 ? unusedFit : unused).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    // chronologisch: die aufeinanderfolgenden Aufnahmen aus dem Durchlauf
    const ids = c.splitIds && c.splitIds.length >= 2 ? c.splitIds.slice() : orderChrono(src.slice(0, splitN)).map((m) => m.id);
    if (c.splitIds) for (const id of ids) useCount.set(id, (useCount.get(id) || 1) - 1);
    if (ids.length < 2) {
      // zu wenig freie Aufnahmen: normale Einstellung mit der am wenigsten gezeigten Aufnahme
      const pick = pool2.slice().sort((a, b) => (useCount.get(a.id) || 0) - (useCount.get(b.id) || 0) || (b.score || 0) - (a.score || 0))[0];
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

  // Polaroid-Stapel: nur Aufnahmen, die sonst nicht zu sehen sind; sonst wird es eine normale Einstellung
  for (const c of clips) {
    if (!c.stack) continue;
    // chronologisch vorab zugeteilt: genau diese Fotos (auch wenn eine Vorschau wie die Bilderflut sie schon kurz zeigte)
    const res0 = (c.stack.reserved || []).map((id) => byId.get(id)).filter((m) => m && (chrono || !useCount.get(m.id)));
    const free = res0.length >= 3 ? res0 : goodMedia(usable, allOn).filter((m) => m.kind === 'image' && !useCount.get(m.id)).sort((a, b) => (b.score || 0) - (a.score || 0));
    if (free.length < 3) {
      c.stack = null;
      const pick = goodMedia(usable, allOn).filter((m) => m.kind === 'image').sort((a, b) => (useCount.get(a.id) || 0) - (useCount.get(b.id) || 0) || (b.score || 0) - (a.score || 0))[0];
      if (pick) { c.mediaId = pick.id; useCount.set(pick.id, (useCount.get(pick.id) || 0) + 1); }
      continue;
    }
    const ids = orderChrono(free.slice(0, 4)).map((m) => m.id);
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

  {
    const sz = [0, 0, 0];
    for (const c of clips) { const m = byId.get(c.mediaId); if (m && m.kind === 'image' && !c.burst && !c.rush) sz[shotSize(m)]++; }
    if (sz.filter(Boolean).length >= 2 && sz[0] + sz[1] + sz[2] >= 6) dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `Einstellungsgrößen im Wechsel: ${sz[0]} Totalen, ${sz[1]} halbnah, ${sz[2]} Details; neue Szenen beginnen möglichst mit einer Totale.`);
  }
  const splitDone = clips.filter((c) => c.split).length;
  if (splitDone) dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `${splitDone} Split-Screen${splitDone > 1 ? 's' : ''}: ${vertical ? 'Queraufnahmen erscheinen übereinander' : 'Hochkant-Aufnahmen erscheinen nebeneinander'}, Bild für Bild im Takt.`);

  // Nutzer-Overrides
  const ov = overrides.clips || {};
  for (const c of clips) {
    const o = ov[c.i];
    if (o && o.mediaId && byId.has(o.mediaId)) { c.mediaId = o.mediaId; delete c.split; }
  }
  // „Gefällt mir nicht“ bei „Beste Auswahl“: ein anderes, noch ungenutztes Foto aus derselben Zeit
  if (!allOn) {
    const used = new Set(clips.map((c) => c.mediaId));
    for (const c of clips) {
      const o = ov[c.i];
      if (!o || !o.again || o.mediaId || c.split || c.grid || c.burst || c.stack || c.rush) continue;
      const cur = byId.get(c.mediaId);
      if (!cur || cur.kind !== 'image') continue;
      const alts = goodMedia(usable, false).filter((m) => m.kind === 'image' && !used.has(m.id))
        .sort((a, b) => Math.abs((a.time || 0) - (cur.time || 0)) - Math.abs((b.time || 0) - (cur.time || 0))).slice(0, 3);
      const alt = alts[(o.again - 1) % Math.max(1, alts.length)];
      if (alt) { used.delete(c.mediaId); c.mediaId = alt.id; used.add(alt.id); c.again = true; }
    }
  }

  // Raster füllen (Einstieg und im Film): Zielbild in der Mitte (bzw. zuletzt), die übrigen nach Qualität und Nähe, Fotos bevorzugt
  const fillGrid = (gi, gp, intro) => {
    const c0 = clips[gi], next = clips[gi + 1];
    if (!c0 || !next) return;
    const target = byId.get(next.mediaId);
    const tiles = gp.n * gp.n;
    const pool2 = goodMedia(usable, allOn).filter((m) => m !== target && (m.kind === 'image' || m.poster));
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

  // Übergänge: aus dem Songaufbau und aus dem, was das vorige Bild zeigt
  let matches = 0, morphs = 0, lastTr = -1;
  for (let i = 1; i < clips.length; i++) {
    const A = clips[i - 1], B = clips[i];
    const stopEnd = (an.stops || []).some((x) => Math.abs(x.end - (win.start + B.start)) < 0.06);
    let tr = chooseTransition({
      labelA: A.label, labelB: B.label, sectionChange: B.sectionChange, weight: B.weight,
      peak: B.label === 'drop' || B.label === 'chorus', pace: s.pace, beatDur,
      lenA: A.end - A.start, lenB: B.end - B.start, stopEnd,
    }, rng);
    const fixedCut = A.split || B.split || A.grid || A.flightAnim || B.flightAnim || A.burst || B.burst || A.leader || A.pre || B.pre || A.reveal || A.miniRew || B.miniRew || A.stack || B.stack || A.rush || B.rush;
    if (!fixedCut && B.role !== 'chapter') tr = refineTransition(tr, shotRelation(byId.get(A.mediaId), byId.get(B.mediaId)), {
      B, A, beatDur, s, peak: B.label === 'drop' || B.label === 'chorus', rng, morphCount: morphs,
    });
    // aus einem Video in einem ruhigen Teil nicht hart heraus: weich ausblenden
    const mA = byId.get(A.mediaId);
    if (!fixedCut && mA && mA.kind === 'video' && tr.type === TR.CUT && !tr.punch && !tr.match && isCalmLabel(B.label)) tr = { type: TR.DISSOLVE, dur: Math.min(beatDur, 0.45 * (A.end - A.start), 0.45 * (B.end - B.start)), punch: false };
    // Abwechslung ohne Unruhe: derselbe Effekt nie zweimal hintereinander, sondern ein Verwandter aus seiner Familie
    if (tr.type !== TR.CUT && tr.type === lastTr && !fixedCut) {
      const fam = [[TR.DISSOLVE, TR.LUMA, TR.LEAK], [TR.WHIP, TR.PUSH, TR.ZOOM], [TR.MORPH, TR.INK, TR.DOUBLE], [TR.DIP, TR.DISSOLVE], [TR.DRIFT, TR.DISSOLVE]].find((f) => f.includes(tr.type));
      if (fam) tr = { ...tr, type: fam[(fam.indexOf(tr.type) + 1) % fam.length] };
    }
    // Drift: in ruhigen Teilen gleitet die Kamera manchmal ohne Halt ins nächste Bild – statt einer Blende oder eines weichen Schnitts
    if (s.drift === 'on' && !fixedCut && B.role !== 'chapter' && !tr.match && isCalmLabel(B.label) && !B.sectionChange && lastTr !== TR.DRIFT && !A.vid && !B.vid) {
      const soft = tr.type === TR.DISSOLVE || tr.type === TR.LUMA || (tr.type === TR.CUT && !tr.punch && rng() < 0.35);
      const dur = Math.min(Math.max(0.4, beatDur * 1.1), 0.45 * (A.end - A.start), 0.45 * (B.end - B.start));
      if (soft && dur >= 0.35 && rng() < 0.6) tr = { type: TR.DRIFT, dur, punch: false };
    }

    if (tr.type !== TR.CUT) lastTr = tr.type;
    if (tr.match) { B.matchCut = true; matches++; }
    if (tr.type === TR.MORPH || tr.type === TR.INK || tr.type === TR.DOUBLE) morphs++;
    // „Gefällt mir nicht“: ein anderer, zum Songteil passender Übergang
    const again = (ov[B.i] && ov[B.i].again) || 0;
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
    const o = ov[B.i];
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
    const o = ov[c.i] || {};
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
        if (!c.rp && hl.length) off = onBeatOffset(best, off, Math.max(0, vd - needS), c, rate);
      }
      else if (c.role === 'takeoff') off = vd - needS - Math.min(1, vd * 0.05); // Abheben liegt meist gegen Ende
      else if (c.role === 'landing') off = Math.min(0.5, vd * 0.05);
      else {
        const hl = (m.highlights || []).map((h) => h.t);
        const used = videoCursor.get(m.id) || 0;
        const hlIn = hl.map((t) => t - tIn).filter((t) => t >= 0 && t <= vd);
        const center = hlIn.length ? hlIn[used % hlIn.length] : vd * 0.4;
        off = center - needS / 2;
        if (!c.rp && hlIn.length) off = onBeatOffset(center, Math.max(0, Math.min(off, Math.max(0, vd - needS))), Math.max(0, vd - needS), c, rate);
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
      const push = c.label === 'drop' || c.label === 'chorus' ? 0.025 : 0.045;
      c.motion = c.contain ? { from: { s: 0.93, x: 0, y: 0 }, to: { s: 0.965, x: 0, y: 0 } } : { from: { s: 1, x: 0, y: 0 }, to: { s: 1 + push, x: 0, y: 0 } };
    } else {
      c.srcOffset = 0; c.rate = 1; c.contain = false;
      // Ausrichtung passt nicht zum Format (Querfoto in 9:16, Hochformat im Film): ganz zeigen statt mehr als die Hälfte abzuschneiden
      const fitFrac = srcAspect > outAspect ? outAspect / srcAspect : srcAspect / outAspect;
      const framed = fitFrac < 0.5 && !c.burst && !c.reveal && !c.pre && !(clips[c.i - 1] && clips[c.i - 1].reveal);
      const role = c.label === 'drop' || c.label === 'chorus' ? 'burst' : 'normal';
      // „Gefällt mir nicht“: eigene Zufallsfolge je Versuch, die Richtung wechselt reihum
      const ag = (ov[c.i] && ov[c.i].again) || 0;
      // (die gemeinsame Zufallsfolge läuft trotzdem gleich weiter, damit sich die übrigen Einstellungen nicht ändern)
      const mo0 = imageMotion(rng, m, outAspect, visDur, role, prevDir, panHint(c));
      let mo = mo0;
      if (ag) {
        const r2 = mulberry32(((s.seed >>> 0) ^ (c.i * 977)) >>> 0);
        const cands = [];
        for (const h of ['left', 'right', 'down', 'up', null, 'in', 'out']) {
          const q = imageMotion(r2, m, outAspect, visDur, role, h === 'in' || h === 'out' ? (h === 'in' ? 'out' : 'in') : null, h === 'in' || h === 'out' ? null : h);
          if (q.dir !== mo0.dir && !cands.some((x) => x.dir === q.dir)) cands.push(q);
        }
        if (cands.length) mo = cands[(ag - 1) % cands.length];
      }
      prevDir = mo.dir;
      c.motion = mo.m;
      c.dir = mo.dir;
      // Tempo-Rampe im Foto: in einen Drop/Refrain hinein beschleunigen, auf dem Einsatz schwungvoll auslaufen
      const nx = clips[c.i + 1];
      if (nx && nx.sectionChange && !isCalmLabel(nx.label) && isCalmLabel(c.label)) { c.ease = 'in'; mo.m.to.s += 0.035; }
      else if (c.sectionChange && !isCalmLabel(c.label)) c.ease = 'out';
      // (bei „Gefällt mir nicht“ abwechselnd bildfüllend mit Fahrt oder gerahmt mit umgekehrter Richtung)
      if (framed && ag % 2 === 0) {
        // schwebt knapp innerhalb des Rahmens und wächst langsam: nichts vom Bild geht verloren
        c.contain = true;
        c.motion = ag ? { from: { s: 0.975, x: 0, y: 0 }, to: { s: 0.93, x: 0, y: 0 } } : { from: { s: 0.93, x: 0, y: 0 }, to: { s: 0.975, x: 0, y: 0 } };
      }
      let pc = c.matchCut ? clips[c.i - 1] : null;
      // gerahmte Bilder haben keinen Ausschnitt, an den die Bewegung anschließen könnte
      if (pc && (framed || pc.contain)) { c.matchCut = false; pc = null; }
      if (pc && pc.motion && media[pc.mediaIndex] && media[pc.mediaIndex].kind === 'image') {
        // Match-Cut: gleicher Ausschnitt wie am Ende des vorigen Bilds, die Kamerabewegung läuft weiter
        const f = pc.motion.from, to = pc.motion.to, k = 0.7;
        const cl = (v) => Math.max(-1, Math.min(1, v));
        c.motion = { from: { ...to }, to: { s: Math.max(1, to.s + (to.s - f.s) * k), x: cl(to.x + (to.x - f.x) * k), y: cl(to.y + (to.y - f.y) * k) } };
        c.dir = pc.dir;
        prevDir = pc.dir;
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
    if (c.rush) {
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
  // nach dem Raster-Zoom: gleiches Bild, gleicher (zentrierter) Ausschnitt, dann sanfte Fahrt
  for (const c of clips) {
    if (!c.afterGrid || !c.motion) continue;
    const to = c.motion.to;
    c.motion = { from: { s: 1, x: 0, y: 0 }, to: { s: Math.max(1.04, to.s || 1), x: (to.x || 0) * 0.5, y: (to.y || 0) * 0.5 } };
    c.contain = false;
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
  const overlays = [];
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
    for (const h of hs) {
      if (h === revHit) {
        const r0 = clips.find((c) => c.reveal);
        colorFx.push({ mode: colorMode, start: r0.start, hit: h, dur: colorMode === 'bloom' ? Math.min(beatDur * 2, 1.1) : colorMode === 'sweep' ? Math.min(beatDur * 1.5, 0.85) : 0, end: h + Math.max(colorMode === 'bloom' ? Math.min(beatDur * 2, 1.1) : colorMode === 'sweep' ? Math.min(beatDur * 1.5, 0.85) : 0, 0.05), steps: colorMode === 'steps' ? beatsRel.filter((b) => b > h - barDur + 0.02 && b < h - 0.02) : [] });
        continue;
      }
      const before = clips.filter((c) => c.start >= Math.max(fixedEndAll, h - barDur * 4) - 0.05 && c.start <= h - barDur * 0.9 + 0.05 && !c.grid);
      const start = before.length ? before[0].start : Math.max(fixedEndAll, h - barDur * 2);
      if (h - start < barDur * 0.85) continue;
      const dur = colorMode === 'bloom' ? Math.min(beatDur * 2, 1.1) : colorMode === 'sweep' ? Math.min(beatDur * 1.5, 0.85) : 0;
      const steps = colorMode === 'steps' ? beatsRel.filter((b) => b > h - barDur + 0.02 && b < h - 0.02) : [];
      colorFx.push({ mode: colorMode, start, hit: h, dur, end: h + Math.max(dur, 0.05), steps });
      if (colorMode === 'drop' || colorMode === 'steps' || colorMode === 'pop') fx.push({ type: 'flash', start: h, end: h + 0.2, amp: 0.18 });
      fx.push({ type: 'punch', start: h, end: h + 0.45, amp: colorMode === 'drop' ? 0.6 : 0.35 });
    }
    if (!colorFx.length && s.colorAuto) s.color = 'off';
    if (colorFx.length) {
      const NAMES = { drop: 'kehrt die Farbe schlagartig zurück', steps: 'kehrt die Farbe Beat für Beat zurück', bloom: 'breitet sich die Farbe vom Motiv aus', sweep: 'läuft die Farbe als Welle durchs Bild', pop: 'bleiben nur kräftige Farben, dann kommt alles zurück' };
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
  if (outro === 'credits') {
    const cardDur = Math.min(Math.max(1.8, barDur), D * 0.18);
    const blackStart = D - cardDur - 0.9;
    fx.push({ type: 'black', start: blackStart, end: D + 1, amp: 1, fadeIn: 0.9 });
    const sp = trip && trip.statsParts;
    const stats = s.showStats !== false && sp ? [sp.places, (kmMode === 'leg' || kmMode === 'total') && sp.km > 5 ? `${Math.round(sp.km).toLocaleString('de-DE')} km` : '', sp.days].filter(Boolean).join(' · ') : '';
    overlays.push({ type: 'endcard', text: title, sub: subtitle, stats, start: D - cardDur, end: D + 0.5 });
  } else if (outro === 'freeze') {
    let fStart = Math.max(last.start + 0.3, D - Math.min(2.8, Math.max(1.8, barDur)));
    // ein Video am Ende läuft erst eine Weile, bevor es zum Standbild wird
    const lm = byId.get(last.mediaId);
    if (lm && lm.kind === 'video') fStart = Math.max(fStart, Math.min(D - 0.8, last.start + (last.end - last.start) * 0.7));
    last.freezeAt = last.freezeAt != null ? Math.min(last.freezeAt, fStart) : fStart;
    fx.push({ type: 'desat', start: fStart, end: D + 1, amp: 1, fadeIn: 0.7 });
    fx.push({ type: 'black', start: D - 0.5, end: D + 1, amp: 1, fadeIn: 0.45 });
    if (title) overlays.push({ type: 'lower', text: title, sub: subtitle, start: fStart + 0.25, end: D + 0.5, freeze: true });
  } else if (outro === 'split') {
    fx.push({ type: 'black', start: D - 0.08, end: D + 1, amp: 1 });
    if (title) overlays.push({ type: 'lower', text: title, sub: subtitle, start: Math.max(last.start + 0.4, D - barDur), end: D, center: true });
  } else if (outro !== 'loop') {
    fx.push({ type: 'black', start: D - 1.0, end: D + 1, amp: 1, fadeIn: 1.0 });
  }

  // Standbild-Ende: Originalton endet mit dem Standbild
  if (last && last.freezeAt != null) for (const v of voice) if (v.t0 >= last.visStart - 0.01) v.t1 = Math.min(v.t1, last.freezeAt + 0.3);
  if (voice.length) dir.notes.push(`Originalton an in ${new Set(voice.map((v) => v.mediaId)).size} ${new Set(voice.map((v) => v.mediaId)).size === 1 ? 'Video' : 'Videos'}: Die Musik wird dort automatisch leiser, diese Einstellungen laufen in Echtzeit.`);

  const firstBurst = clips.find((c) => c.burst);
  if (firstBurst) {
    fx.push({ type: 'flash', start: firstBurst.start, end: firstBurst.start + 0.18, amp: 0.3 });
    dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `Foto-Serie: Im ${SEC_DE[firstBurst.label] || 'Drop'} ab ${fmtMS(firstBurst.start)} wechselt jeden ${beatDur / 2 >= 0.2 ? 'halben ' : ''}Beat das Bild.`);
  }
  // Zoom-Impulse sparsam: höchstens einer je zwei Takte (der Drop-Einsatz hat Vorrang), in ruhigen Filmen sanfter
  let lastPunch = -1e9;
  const punchAmp = s.pace === 'ruhig' ? 0.6 : 1;
  for (const c of clips) {
    if (c.punch && (c.start - lastPunch >= barDur * 2 || c.sectionChange)) { fx.push({ type: 'punch', start: c.start, end: c.start + 0.45, amp: punchAmp }); lastPunch = c.start; }
    if (c.freezeAt != null && !(outro === 'freeze' && c === last)) fx.push({ type: 'flash', start: c.freezeAt, end: c.freezeAt + 0.2, amp: 0.25 });
  }

  if (last && last.strip) {
    const dur = last.end - last.start;
    if (title) overlays.push({ type: 'lower', text: title, sub: subtitle, geo: null, start: last.start + dur * 0.4, end: D + 0.5, center: true });
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

  // Keine Doppelungen: wiederholt sich eine Aufnahme nur, weil sonst Zeit übrig wäre, wird mit längeren Einstellungen neu geplant
  const plain = clips.filter((c) => c.mediaId && !c.pre && !c.leader && !c.reveal && !c.grid && !c.burst && !c.split && !c.strip && !c.stack && !c.miniRew && !c.rush && !c.replay && !c.loop && !c.flightAnim);
  const seen = new Map();
  for (const c of plain) seen.set(c.mediaId, (seen.get(c.mediaId) || 0) + 1);
  // Bilder im Split-Screen zählen mit: dasselbe Bild einzeln und im Split wäre auch eine Doppelung
  for (const c of clips) for (const id of c.split ? c.split.ids : c.stack ? c.stack.ids : []) seen.set(id, (seen.get(id) || 0) + 1);
  const repeats = [...seen.values()].reduce((a, n) => a + Math.max(0, n - 1), 0);
  // Kapazität: wie viele Aufnahmen passen, welche bleiben draußen, welche Videos sind zu lang
  const usedSet = new Set(clips.flatMap((c) => (c.split ? c.split.ids : c.stack ? c.stack.ids : c.grid && c.grid.ids ? c.grid.ids.concat([c.mediaId]) : [c.mediaId])).filter(Boolean));
  const droppedIds = good.filter((m) => !usedSet.has(m.id)).map((m) => m.id);
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

  const extraNeed = droppedIds.reduce((a, id) => { const m = good.find((x) => x.id === id); return a + (m.kind === 'video' ? videoPlay(m, fr.vmax) : fr.shotMin); }, 0);
  return {
    _m: { repeats, dropped: droppedIds.length, scale: usedScale, floor: (fr.shotMin / fr.shot) * (level >= 1 ? 0.5 : 1), D, max: fr.max, settings, extraNeed, level },
    capacity,
    duration: D, win, clips: all, visibleClips: clips.length,
    look: s.look, format: s.format, frame: s.frame, band, pace: s.pace, split: s.split, font: s.font || 'klassisch', motion: s.motion || 'ken', motionAmt: s.motionAmt || 'medium',
    intro, outro, fx, overlays, notes: dir.notes, resolved: s, voice,
    beats: beatsRel, downs, beatEnergy, beatDur,
    accent, colorFx, parallax: s.parallax === 'on' ? 1 : 0,
    sections: (an.sections || []).filter((x) => x.end > win.start && x.start < win.end).map((x) => ({ ...x, start: Math.max(0, x.start - win.start), end: Math.min(D, x.end - win.start) })),
    usedMedia: usedSet.size,
  };
}
