/* Planer · Feinschliff wie ein Cutter: Standzeit nach Bildinhalt, Höhepunkt- und Schlussbild */

/**
 * Arbeitet auf fertig zugeteilten Einstellungen, bevor Übergänge und Bewegung berechnet werden.
 * Verändert nie das Material und nie die Chronologie über 3 Minuten hinaus; Schnitte bleiben auf den Beats,
 * Schnitte auf der Eins eines Takts bleiben stehen. Eigene Entscheidungen (Motiv, „Gefällt mir nicht“) bleiben unberührt.
 * Liefert { retimed, hero } für die Erklärung der Regie.
 */
function cutterPolish(clips, ctx) {
  const { an, win, byId, beatDur, ovOf = () => null, moved = new Set(), us = false, taps = [], blocks = false } = ctx;
  const beats = Array.from(an.beats || []).map((b) => b - win.start);
  const bars = Array.from(an.barStart || []).map((b) => b - win.start);
  const onBar = (t) => bars.some((b) => Math.abs(b - t) < 0.04);
  // starke Zählzeiten: Eins und Drei eines Takts; Phrasenanfang: jede vierte Eins (dort bleibt ein Schnitt immer stehen)
  const half = bars.map((b, k) => b + ((bars[k + 1] != null ? bars[k + 1] : b + beatDur * 4) - b) / 2);
  const strong = (t) => onBar(t) || half.some((h) => Math.abs(h - t) < 0.04);
  const ph = an.phrasePhase || 0;
  const onPhrase = (t) => bars.some((b, k) => Math.abs(b - t) < 0.04 && (((k - ph) % 4) + 4) % 4 === 0);
  const special = (c) => c.split || c.grid || c.burst || c.rush || c.stack || c.strip || c.miniRew || c.pre || c.reveal || c.leader || c.flightAnim || c.loop || c.vid || c.gridMid || c.afterGrid || c.replay || c.replaySeg || c.repeatSeg;
  // eigenes Motiv bleibt; „Gefällt mir nicht“ würfelt nur die Bewegung neu und ändert keine Bildwahl
  // eigene Entscheidungen bleiben: eigenes Motiv und von dir verschobene Aufnahmen (samt ihrem Ziel)
  const own = (c) => { const o = ovOf(c); return !!(o && o.mediaId) || moved.has(c.mediaId); };
  const img = (c) => { const m = byId.get(c.mediaId); return m && m.kind === 'image' ? m : null; };
  // (das Startbild hat seine Länge vom Einstieg: erster Schnitt nach zwei Schlägen – nicht verschieben)
  const plain = (c) => c && !special(c) && c.role !== 'hook' && !!img(c);
  let retimed = 0, hero = 0;

  // 1. Standzeit nach Bildinhalt: in einer Folge ruhiger Einstellungen eines Abschnitts verschiebt sich jede Grenze
  //    um höchstens einen Beat (in ruhigen Teilen zwei) – Totalen und starke Bilder bekommen Zeit, Details und schwächere werden knapper,
  //    nach einer schnellen Passage darf das erste Bild atmen. Die Gesamtlänge der Folge bleibt gleich.
  const scores = clips.filter(plain).map((c) => img(c).score || 0.5);
  const sLo = Math.min(...scores, 1), sHi = Math.max(...scores, 0);
  const weight = (c, first, prev) => {
    const m = img(c), size = shotSize(m);
    const q = sHi > sLo ? ((m.score || 0.5) - sLo) / (sHi - sLo) : 0.5;
    // Wir-Vorrang: eure Aufnahmen stehen länger
    return (size === 0 ? 1.45 : size === 2 ? 0.72 : 1) * (0.85 + 0.3 * q) * (first && prev && (prev.burst || prev.rush || prev.miniRew) ? 1.2 : 1) * (us && isUs(m) ? 1.6 : 1);
  };
  for (let i = 0; i < clips.length;) {
    if (!plain(clips[i])) { i++; continue; }
    let j = i;
    while (j + 1 < clips.length && plain(clips[j + 1]) && clips[j + 1].label === clips[i].label && !clips[j + 1].sectionChange && !clips[j + 1].sceneStart) j++;
    if (j > i) {
      const run = clips.slice(i, j + 1);
      const w = run.map((c, k) => weight(c, k === 0, clips[i - 1]));
      const W = w.reduce((a, b) => a + b, 0);
      const t0 = run[0].start, total = run[run.length - 1].end - t0;
      // ruhige Teile: bis zu zwei Beats, im Refrain/Drop einer (dort trägt der Rhythmus)
      const calm = isCalmLabel(run[0].label);
      const minD = (calm ? 2 : 1) * beatDur * 0.98;
      let acc = 0;
      for (let k = 0; k < run.length - 1; k++) {
        acc += w[k];
        const a = run[k], b = run[k + 1], cur = a.end;
        // Phrasenanfänge und mitgetippte Schnitte bleiben, wo sie sind
        if (onPhrase(cur) || taps.some((t) => Math.abs(t - cur) < 0.05)) continue;
        const fromBar = onBar(cur);
        const want = t0 + (total * acc) / W;
        let best = cur;
        for (const bt of beats) {
          if (Math.abs(bt - cur) > beatDur * (calm ? 2.02 : 1.02) || Math.abs(bt - cur) < 0.02) continue;
          // ein Schnitt auf der Eins wandert höchstens auf eine andere starke Zählzeit
          if (fromBar && !strong(bt)) continue;
          // keine Einstellung unter die ruhige Mindestlänge drücken (war sie schon kürzer, nicht weiter kürzen)
          if (bt - a.start < Math.min(minD, cur - a.start) - 1e-3 || b.end - bt < Math.min(minD, b.end - cur) - 1e-3) continue;
          if (Math.abs(bt - want) < Math.abs(best - want)) best = bt;
        }
        if (best !== cur && Math.abs(best - want) < Math.abs(cur - want) - beatDur * 0.1) { a.end = best; b.start = best; retimed++; }
      }
    }
    i = j + 1;
  }

  // 2. Höhepunkt- und Schlussbild: auf dem Einsatz eines Refrains/Drops und am Ende steht das stärkste Bild
  //    aus der unmittelbaren Nachbarschaft (höchstens zwei Plätze, höchstens 3 Minuten Aufnahmezeit Abstand)
  const keys = clips.map((c, k) => k).filter((k) => {
    const c = clips[k];
    return (c.sectionChange && (c.label === 'drop' || c.label === 'chorus')) || k === clips.length - 1 - (clips[clips.length - 1] && clips[clips.length - 1].loop ? 1 : 0);
  });
  const lastK = keys.length ? keys[keys.length - 1] : -1;
  for (const k of keys) {
    const c = clips[k];
    if (!plain(c) || own(c) || c.role === 'hook') continue;
    const m = img(c);
    // Wir-Vorrang: auf dem Drop Natur und Dinge (dort ist es schnell), als Schlussbild ihr
    const isEnd = k === lastK && !c.sectionChange;
    const val = (x) => (x.score || 0.5) + (us ? (isEnd ? 0.35 : -0.35) * (isUs(x) ? 1 : 0) : 0);
    let bestK = -1, bestS = val(m) + 0.08;
    for (let d = -2; d <= 2; d++) {
      const n = clips[k + d];
      if (!d || !plain(n) || own(n) || n.role === 'hook' || keys.includes(k + d)) continue;
      const nm = img(n);
      // nach Tageszeit: im selben Tagesblock; streng: höchstens 3 min Aufnahmezeit
      if (blocks === 'moment' ? Math.abs((nm.time || 0) - (m.time || 0)) > 10 * 60 * 1000 : blocks ? dayBlock(nm) !== dayBlock(m) : Math.abs((nm.time || 0) - (m.time || 0)) > 3 * 60 * 1000) continue;
      if (val(nm) > bestS) { bestS = val(nm); bestK = k + d; }
    }
    if (bestK >= 0) { const o = clips[bestK]; [c.mediaId, o.mediaId] = [o.mediaId, c.mediaId]; hero++; }
  }
  return { retimed, hero };
}

/**
 * Nie zwei gleiche Motive direkt hintereinander (gleicher Strand, gleicher Platz, gleiche Serie, dasselbe Bild):
 * die zweite Aufnahme tauscht den Platz mit einer nahen, die zu beiden Nachbarn passt. Fest bleiben eigene
 * Entscheidungen, verschobene Aufnahmen, das Startbild, Einsätze, das Schlussbild und Stil-Mittel.
 * blocks wie beim Feinschliff ('moment' = Zum Lied, true = Tagesblock, false = streng nach Uhrzeit).
 */
function separateTwins(clips, ctx) {
  const { byId, ovOf = () => null, moved = new Set(), blocks = false } = ctx;
  const special = (c) => c.split || c.grid || c.burst || c.rush || c.flash || c.welcome || c.stack || c.strip || c.miniRew || c.pre || c.reveal || c.leader || c.flightAnim || c.loop || c.vid || c.gridMid || c.afterGrid || c.replay || c.replaySeg || c.repeatSeg || c.recap;
  const own = (c) => { const o = ovOf(c); return !!(o && o.mediaId) || moved.has(c.mediaId); };
  const img = (c) => { const m = c && byId.get(c.mediaId); return m && m.kind === 'image' ? m : null; };
  const last = clips.length - 1;
  const fixed = (k) => { const c = clips[k]; return !c || special(c) || !img(c) || own(c) || c.role === 'hook' || c.usMoment || k === last; };
  // ein Einsatz (Abschnittswechsel) behält ein mindestens gleich starkes Bild
  const keepsHero = (k, from, to) => !clips[k].sectionChange || (to.score || 0.5) >= (from.score || 0.5) - 0.05;
  // was an Platz k zu sehen ist (Einstellungen mit einer Aufnahme; Split/Raster zählen nicht als Nachbar)
  // (schnelle Folgen – Bilderflut, Serie, Welcome – sind gewollte Bildwechsel im Viertelschlag und zählen nicht)
  const at = (k) => { const c = clips[k]; return c && !c.split && !c.grid && !c.stack && !c.loop && !c.flash && !c.rush && !c.burst && !c.welcome ? byId.get(c.mediaId) || null : null; };
  const clashAt = (k, m) => [k - 1, k + 1].some((j) => { const n = at(j); return n && sameMotif(n, m); });
  // streng nach Uhrzeit: höchstens eine halbe Stunde Aufnahmezeit tauschen (die Folge bleibt erkennbar chronologisch)
  const near = (a, b) => (blocks === 'moment' ? true : blocks ? dayBlock(a) === dayBlock(b) : Math.abs((a.time || 0) - (b.time || 0)) <= 30 * 60 * 1000);
  const orient = (m) => (m.w && m.h ? (m.w > m.h * 1.1 ? 1 : m.h > m.w * 1.1 ? -1 : 0) : 0);
  let fixedN = 0;
  for (let i = 1; i < clips.length; i++) {
    const a = at(i - 1), b = at(i);
    if (!a || !b || !sameMotif(a, b)) continue;
    // lieber die hintere Aufnahme verschieben, sonst die vordere
    let done = false;
    // erst mit einer Aufnahme gleicher Ausrichtung tauschen (Kamerafahrt und Tempo bleiben gleich), sonst mit jeder
    for (const sameO of [true, false]) for (const k of [i, i - 1]) {
      if (done || fixed(k)) continue;
      const m = img(clips[k]);
      for (let d = 1; d <= 6 && !done; d++) {
        for (const j of [k + d, k - d]) {
          if (j < 0 || j > last || Math.abs(j - k) < 2 || fixed(j)) continue;
          const n = img(clips[j]);
          if (!n || !near(m, n) || isUs(m) !== isUs(n) || !keepsHero(k, m, n) || !keepsHero(j, n, m)) continue;
          if (sameO && orient(m) !== orient(n)) continue;
          // nach dem Tausch: n an Platz k ohne gleiches Motiv daneben, m an Platz j ebenso
          const save = clips[k].mediaId;
          clips[k].mediaId = n.id; clips[j].mediaId = m.id;
          if (!clashAt(k, n) && !clashAt(j, m)) { done = true; fixedN++; break; }
          clips[k].mediaId = save; clips[j].mediaId = n.id;
        }
      }
    }
  }
  return fixedN;
}

/**
 * Blickführung über den Schnitt (eye trace): Wo das Auge am Ende einer Einstellung hinschaut (Blickpunkt des Motivs im
 * Ausgabebild), dort soll das nächste Bild seinen Blickpunkt haben – dann merkt man den Schnitt kaum. Verschoben wird
 * die nächste Fahrt: erst als Ganzes ein Stück (Tempo bleibt, das Motiv bleibt am Ende gut im Bild), dann nur ihr
 * Anfang, solange ihr Tempo um höchstens ein Drittel abweicht. Gilt für harte Schnitte und kurze Blenden zwischen zwei bildfüllenden
 * Fotos; Match-Cuts, gerahmte Bilder, gedrehte Horizonte und Stil-Mittel bleiben, wie sie sind.
 * Liefert { moved, before, after, possible } (mittlerer Abstand der Blickpunkte vorher/nachher/bestenfalls, Anteil der
 * Bildbreite; der Spielraum hängt davon ab, wie viel Bild über den Ausschnitt hinausreicht).
 */
function eyeTrace(clips, { media, outAspect }) {
  const plain = (c) => c && c.motion && !c.contain && !c.matchCut && !(c.split || c.grid || c.burst || c.rush || c.flash || c.stack || c.strip || c.miniRew || c.pre || c.reveal || c.revealHit || c.leader || c.flightAnim || c.loop || c.recap) && media[c.mediaIndex] && media[c.mediaIndex].kind === 'image';
  const geo = (m, e) => {
    const srcA = m.w && m.h ? m.w / m.h : outAspect;
    const s = Math.max(1, e.s || 1);
    const fw = (srcA > outAspect ? outAspect / srcA : 1) / s, fh = (srcA > outAspect ? 1 : srcA / outAspect) / s;
    return { fw, fh };
  };
  // Blickpunkt des Motivs im Ausgabebild (0–1) bei Fahrtzustand e
  const eyeAt = (m, e) => {
    const f = m.focus || [0.5, 0.45], { fw, fh } = geo(m, e);
    const cx = 0.5 + ((e.x || 0) * (1 - fw)) / 2, cy = 0.5 + ((e.y || 0) * (1 - fh)) / 2;
    return [(f[0] - (cx - fw / 2)) / fw, (f[1] - (cy - fh / 2)) / fh];
  };
  // Fahrtposition, die den Blickpunkt an die Stelle u (Ausgabebild) bringt
  const posFor = (m, e, u, k) => {
    const f = (m.focus || [0.5, 0.45])[k], g = geo(m, e), fs = k ? g.fh : g.fw;
    if (1 - fs < 0.02) return e[k ? 'y' : 'x'] || 0;
    const c = f - (u - 0.5) * fs;
    return Math.max(-1, Math.min(1, ((c - 0.5) * 2) / (1 - fs)));
  };
  const dist = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) / Math.max(0.5, outAspect));
  let moved = 0, sb = 0, sa = 0, sp = 0, n = 0;
  for (let i = 1; i < clips.length; i++) {
    const A = clips[i - 1], B = clips[i];
    if (!plain(A) || !plain(B)) continue;
    // (schließt das nächste Bild als Match-Cut an B an, ist B's Endpunkt fest)
    if (clips[i + 1] && clips[i + 1].matchCut) continue;
    const tr = B.tin;
    if (tr && tr.type !== TR.CUT && tr.type !== TR.DISSOLVE && tr.type !== TR.LUMA) continue;
    const mA = media[A.mediaIndex], mB = media[B.mediaIndex];
    const eA = eyeAt(mA, A.motion.to), from = B.motion.from;
    // (gerade gerichteter Horizont: der Spielraum ist schon verbraucht; die feine Neigung der Fahrten zählt nicht)
    if (Math.abs(from.r || 0) > 0.02 || Math.abs(B.motion.to.r || 0) > 0.02) continue;
    const d0 = dist(eA, eyeAt(mB, from));
    n++; sb += d0;
    // ein kleiner Versatz bleibt (das Auge springt gern ein Stück), Ziel ist der Blickpunkt nahe der Mitte des Bilds
    const target = [Math.max(0.2, Math.min(0.8, eA[0])), Math.max(0.2, Math.min(0.8, eA[1]))];
    const want = { x: posFor(mB, from, target[0], 0), y: posFor(mB, from, target[1], 1) };
    // (bestenfalls erreichbar, ohne Rücksicht auf Tempo und Ausschnitt – Maßstab für die Prüfung)
    sp += Math.min(d0, dist(eA, eyeAt(mB, { ...from, ...want })));
    const dur = Math.max(0.25, B.visEnd - B.visStart);
    const sp0 = motionSpeed(B.motion, mB, outAspect, dur);
    const to = B.motion.to;
    // 1. die ganze Fahrt ein Stück versetzen (Tempo bleibt gleich): knapp ein Viertel des Spielraums, und das Motiv
    //    bleibt am Ende gut im Bild
    const cl = (v) => Math.max(-1, Math.min(1, v));
    let dx = Math.max(-0.45, Math.min(0.45, want.x - (from.x || 0))), dy = Math.max(-0.45, Math.min(0.45, want.y - (from.y || 0)));
    for (let k = 0; k < 4; k++) {
      const e = eyeAt(mB, { ...to, x: cl((to.x || 0) + dx), y: cl((to.y || 0) + dy) });
      if (e[0] > 0.15 && e[0] < 0.85 && e[1] > 0.15 && e[1] < 0.85) break;
      dx *= 0.6; dy *= 0.6;
    }
    const f1 = { ...from, x: cl((from.x || 0) + dx), y: cl((from.y || 0) + dy) }, t1 = { ...to, x: cl((to.x || 0) + dx), y: cl((to.y || 0) + dy) };
    // 2. der Rest nur am Anfang, solange das Tempo innerhalb von ±⅓ bleibt
    let best = null;
    for (const k of [1, 0.75, 0.5, 0.3, 0]) {
      const cand = { ...f1, x: f1.x + (want.x - f1.x) * k, y: f1.y + (want.y - f1.y) * k };
      const sp = motionSpeed({ from: cand, to: t1 }, mB, outAspect, dur);
      if (sp0 > 0.001 ? sp <= sp0 * 1.33 && sp >= sp0 * 0.67 : sp < 0.02) { best = cand; break; }
    }
    if (best && dist(eA, eyeAt(mB, best)) < d0 - 0.03) { B.motion.from = best; B.motion.to = t1; moved++; }
    sa += dist(eA, eyeAt(mB, B.motion.from));
  }
  return { moved, before: n ? sb / n : 0, after: n ? sa / n : 0, possible: n ? sp / n : 0 };
}

/**
 * Refrain-Reime (Variante, `settings.reim = 'on'`): Jeder weitere Refrain/Drop beginnt mit Bildern, die den ersten Bildern
 * des ersten Refrains/Drops ähneln – gleicher Aufbau, gleiche Einstellungsgröße, verwandte Farbe, aber nie dasselbe Motiv –
 * und die Kamera wiederholt deren Bewegung (c.rhyme = Index des Vorbilds, die Fahrt übernimmt dessen Richtung).
 * Getauscht wird nur innerhalb desselben Songteils: jede Aufnahme bleibt an einer Stelle mit gleicher Energie.
 * Liefert die Zahl der gereimten Einstellungen.
 */
function refrainRhyme(clips, { byId, ovOf = () => null, moved = new Set() }) {
  const special = (c) => c.split || c.grid || c.burst || c.rush || c.flash || c.stack || c.strip || c.miniRew || c.pre || c.reveal || c.leader || c.loop || c.vid || c.replay || c.echo;
  const img = (c) => { const m = byId.get(c.mediaId); return m && m.kind === 'image' ? m : null; };
  const free = (c) => c && !special(c) && img(c) && !(ovOf(c) && ovOf(c).mediaId) && !moved.has(c.mediaId) && !c.usMoment;
  const peaks = clips.filter((c) => c.sectionChange && (c.label === 'drop' || c.label === 'chorus')).map((c) => c.i);
  if (peaks.length < 2) return 0;
  const sectionOf = (k) => { const out = []; for (let i = k; i < clips.length && (i === k || !clips[i].sectionChange); i++) out.push(clips[i]); return out; };
  const ref = sectionOf(peaks[0]).filter((c) => !special(c) && img(c)).slice(0, 3);
  if (!ref.length) return 0;
  const colorD = (a, b) => (a.avg && b.avg ? Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) : 90);
  // Reim: ähnlicher Aufbau und gleiche Größe – ein Beinahe-Doppel wäre eine Wiederholung, kein Reim
  const rhyme = (a, b) => (sameMotif(a, b) ? -1 : 0.55 * layoutSim(a.layout, b.layout) + 0.25 * (shotSize(a) === shotSize(b) ? 1 : 0) + 0.2 * (1 - Math.min(1, colorD(a, b) / 160)));
  let n = 0;
  for (const p of peaks.slice(1)) {
    const sec = sectionOf(p).filter(free);
    for (let j = 0; j < ref.length && j < sec.length; j++) {
      const r = img(ref[j]), slot = sec[j];
      let best = null, bv = rhyme(r, img(slot)) + 0.1;
      for (let q = j + 1; q < sec.length; q++) { const v = rhyme(r, img(sec[q])); if (v > bv) { bv = v; best = sec[q]; } }
      if (best) [slot.mediaId, best.mediaId] = [best.mediaId, slot.mediaId];
      if (rhyme(r, img(slot)) > 0.45) { slot.rhyme = ref[j].i; n++; }
    }
  }
  return n;
}
