/* Planer · Anordnung „Zum Lied“ (Standard): Welche Aufnahme an welche Stelle im Song gehört – nicht nach Aufnahmetag.
 * Momente (Aufnahmen weniger Minuten auseinander, gleicher Ort und Look) bleiben als kleine Folge zusammen; ihre
 * Reihenfolge folgt dem Songbogen: Bildenergie zur Energie der Stelle, eure Bilder in die ruhigen Teile, ruhige Videos in
 * Intro, Strophe, Break und Outro, bewegte in Refrain und Drop, ein starkes Bild auf den ersten Einsatz und zum Schluss,
 * Nachbarn gehen weich ineinander über (Helligkeit, Farbe). */

/** Energie der Songstelle (0 ruhig … 1 Höhepunkt): Abschnitt und Lautstärke um diese Stelle (Filmzeit t). */
function songEnergyAt(an, win) {
  const beats = an.beats || [], en = an.energy || [];
  return (t) => {
    const abs = win.start + t;
    const sec = sectionAt(an, abs + 0.01);
    const lab = SLOT_ENERGY[sec.label] != null ? SLOT_ENERGY[sec.label] : 0.5;
    // Lautstärke eines Takts um die Stelle
    let lo = 0, hi = beats.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (beats[m] <= abs) lo = m; else hi = m - 1; }
    let s = 0, n = 0;
    for (let k = Math.max(0, lo - 2); k <= Math.min(beats.length - 1, lo + 2); k++) if (en[k] != null) { s += en[k]; n++; }
    const e = 0.65 * lab + 0.35 * (n ? s / n : lab);
    // im Anstieg vor dem Einsatz steigen auch die Bilder – die stärksten bleiben für den Einsatz selbst
    const r = (an.rises || []).find((x) => abs >= x.start && abs < x.end);
    return r ? Math.min(e, 0.4 + 0.3 * Math.max(0, Math.min(1, (abs - r.start) / Math.max(0.1, r.end - r.start)))) : e;
  };
}

/** Wie bewegt ist ein Video (0 ruhig … 1 Action): Bildbewegung und Dichte der Aktionsmomente. */
function videoLively(v) {
  const mo = Math.max(0, Math.min(1, ((v.motion || 0) - 0.02) / 0.1));
  const hits = v.hits && v.hits.length ? Math.min(1, v.hits.length / Math.max(1, videoSpan(v)) / 0.5) : 0;
  return Math.max(mo, hits);
}

/** Momente: zeitlich nahe, gleich aussehende Aufnahmen (höchstens vier) – sie bleiben im Film beieinander. */
function liedMoments(list) {
  const ordered = orderChrono(list);
  const colorD = (a, b) => (a.avg && b.avg ? Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) : 60);
  const out = [];
  for (const m of ordered) {
    const last = out[out.length - 1], prev = last && last[last.length - 1];
    const near = prev && m.time && prev.time && m.time - prev.time <= 10 * 60000 && (m.time - prev.time <= 3 * 60000 || colorD(prev, m) < 70);
    // Videos bilden einen eigenen Moment (sie bekommen ihren Platz nach der Songstelle)
    if (near && last.length < 4 && m.kind === 'image' && prev.kind === 'image') last.push(m); else out.push([m]);
  }
  return out;
}

/**
 * Reihenfolge nach dem Song: legt die Momente der Reihe nach auf die Plätze (segs, Filmzeit), so dass jede Aufnahme an
 * eine passende Stelle kommt. Bildenergien werden über ihren Rang verglichen (die stärksten Bilder in die kräftigsten
 * Stellen, ohne dass sie vorne aufgebraucht sind). Liefert die Aufnahmen in Filmreihenfolge (ohne Startbild).
 */
function songQueue(list, { an, win, segs, startAt = 0, want, us = true, ramp = false }) {
  if (list.length < 3) return list.slice();
  const eAt = songEnergyAt(an, win);
  const slots = segs.filter((g) => g.end > startAt + 0.05 && !g.pre && !g.leader && !g.reveal && !g.rush && !g.gridSeg && !g.flash);
  if (!slots.length) return list.slice();
  const secIdx = (t) => (an.sections || []).findIndex((x) => win.start + t >= x.start && win.start + t < x.end);
  const sl = slots.map((g) => ({ start: g.start, end: g.end, e: eAt((g.start + g.end) / 2), calm: isCalmLabel(sectionAt(an, win.start + (g.start + g.end) / 2).label), sec: secIdx((g.start + g.end) / 2), rise: (an.rises || []).some((r) => win.start + (g.start + g.end) / 2 >= r.start && win.start + (g.start + g.end) / 2 < r.end) }));
  // Ränge: Energie der Plätze und der Fotos auf 0…1 verteilt
  const rankMap = (vals) => { const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(vals.length); idx.forEach(([, i], k) => { r[i] = vals.length > 1 ? k / (vals.length - 1) : 0.5; }); return r; };
  const slotQ = rankMap(sl.map((x) => x.e));
  const avgLen = sl.reduce((a, x) => a + x.end - x.start, 0) / sl.length;
  sl.forEach((x, k) => { x.q = slotQ[k]; });
  const imgs = list.filter((m) => m.kind === 'image');
  const imgQ = new Map();
  rankMap(imgs.map((m) => mediaEnergy(m) + 0.15 * (m.score || 0.5))).forEach((q, k) => imgQ.set(imgs[k].id, q));
  // Bildstimmung zur Songstimmung: helle, warme Bilder in die hellen Stellen (Refrain, Höhepunkt), dunklere, kühlere in
  // Strophe, Break und Moll-Passagen – nach Rang, damit es bei jedem Material wirkt
  const sv0 = songValence(an);
  const valQ = new Map();
  const withMood = imgs.filter((m) => m.mood);
  if (withMood.length >= 3) rankMap(withMood.map((m) => m.mood[0])).forEach((q, k) => valQ.set(withMood[k].id, q));
  const slotV = rankMap(sl.map((x) => x.e * 0.7 + sv0 * 0.3 + (x.calm ? -0.05 : 0.05)));
  sl.forEach((x, k) => { x.vq = slotV[k]; });
  const scores = imgs.map((m) => m.score || 0.5).sort((a, b) => b - a);
  const strong = (m) => (scores.length ? 1 - scores.indexOf(m.score || 0.5) / Math.max(1, scores.length - 1) : 0.5);
  // erster Einsatz eines Refrains/Drops und Schlussplatz
  const peakK = sl.findIndex((x, k) => k > 0 && !x.calm && sl[k - 1].calm);
  const lastK = sl.length - 1;
  const colorD = (a, b) => (a && b && a.avg && b.avg ? Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) : 60);
  const flowCost = (a, b) => (a && b ? 0.25 * Math.min(1, colorD(a, b) / 160) + 0.25 * Math.min(1, Math.abs((a.luma || 0.45) - (b.luma || 0.45)) / 0.4) : 0);
  // Wie gut passt Aufnahme m auf Platz k?
  const fitImg = (m, k) => {
    const x = sl[Math.min(k, lastK)];
    let v = -1.2 * Math.abs(imgQ.get(m.id) - x.q);
    if (valQ.has(m.id)) v -= 0.45 * Math.abs(valQ.get(m.id) - x.vq);
    const u = us ? usScore(m) : 0;
    // eure Bilder: in die ruhigen Teile und auf die langen Plätze
    v += u * (x.calm ? 0.5 : -0.6) + u * 0.6 * Math.max(-1, Math.min(1, (x.end - x.start - avgLen) / avgLen));
    // im Anstieg vor dem Einsatz nicht die stärksten Bilder verbrauchen – sie gehören auf den Einsatz
    if (x.rise) v -= 0.8 * Math.max(0, imgQ.get(m.id) - 0.7);
    if (k === peakK) v += 0.8 * (strong(m) - 0.5);
    if (k >= lastK) v += 0.5 * (strong(m) - 0.5) + 0.3 * u;
    return v;
  };
  // Videos: bewegte in kräftige, ruhige in ruhige Stellen; sie sollen nicht über den nächsten Einsatz laufen
  const peakStarts = sl.filter((x, k) => k > 0 && !x.calm && sl[k - 1].calm).map((x) => x.start);
  const fitVid = (v, k) => {
    const x = sl[Math.min(k, lastK)], w = want ? want(v) : videoPlay(v, 7.5);
    const lv = videoLively(v) > 0.5;
    let f = lv ? 1.2 * (x.e - 0.5) : 1.2 * (0.5 - x.e);
    // ein Video, das kurz vor einem Einsatz beginnt, würde abgeschnitten (oder der Einsatz verschoben)
    const nextPeak = peakStarts.find((t) => t > x.start + 0.05);
    // läuft es genau in den Einsatz hinein (endet auf dem Drop), ist das stark – mit Speed-Ramp erst recht
    // (ein kurzes Video soll dabei fast ganz laufen; mit Speed-Ramp beschleunigt es und zeigt auf kürzerem Platz mehr)
    const room = nextPeak != null ? nextPeak - x.start : Infinity, shortV = videoSpan(v) <= w * 1.2;
    const lo = ramp ? Math.max(1.5, w * 0.4) : shortV ? Math.min(w, videoSpan(v) * 0.96) * 0.85 : w * 0.6;
    if (room >= lo && room <= w * 1.1) f += ramp ? 0.9 : 0.3;
    else if (room < (shortV ? Math.min(w, videoSpan(v) * 0.96) * 0.85 : w * 0.7)) f -= lv && room < 0.3 ? 0 : 0.5;
    // mit Speed-Ramp: auf dem Einsatz beginnen (Zeitlupe auf dem Drop)
    if (ramp && peakStarts.some((t) => Math.abs(t - x.start) < 0.05)) f += 0.9;
    // am Filmende fehlt ihm die Zeit (mit Abstand: die Plätze verschieben sich noch)
    if (sl[lastK].end - x.start < w * 1.25) f -= 0.8;
    if (!lv && x.calm) { let room = 0; for (let j = k; j <= lastK && sl[j].calm; j++) room = sl[j].end - x.start; if (room >= w * 0.9) f += 0.25; }
    return f;
  };
  // wie viele Plätze belegt ein Video ab Platz k
  const span = (v, k) => { const w = want ? want(v) : videoPlay(v, 7.5); let j = k; while (j < lastK && sl[j].end - sl[k].start < w * 0.9) j++; return j - k + 1; };

  // erst die Videos: jedes auf die Stelle, die am besten passt (sie sind wenige und brauchen Raum), mit Abstand
  // zueinander; die längsten zuerst
  const vids = list.filter((m) => m.kind === 'video').sort((a, b) => span(b, 0) - span(a, 0));
  const taken = new Array(sl.length).fill(false), vAt = new Map();
  for (const v of vids) {
    let bk = -1, bf = -Infinity;
    for (let kk = 0; kk <= lastK; kk++) {
      const n = span(v, kk);
      let free = true;
      for (let j = kk; j < Math.min(lastK + 1, kk + n); j++) if (taken[j]) { free = false; break; }
      if (!free) continue;
      // (direkt neben einem anderen Video nur, wenn es dort deutlich besser passt)
      const f = fitVid(v, kk) - ((kk > 0 && taken[kk - 1]) || taken[Math.min(lastK, kk + n)] ? 0.3 : 0);
      if (f > bf + 1e-6) { bf = f; bk = kk; }
    }
    if (bk < 0) continue;
    for (let j = bk; j < bk + span(v, bk) && j <= lastK; j++) taken[j] = true;
    vAt.set(v.id, bk);
  }
  // mehr Fotos als freie Plätze: Split-Screens und Serien nehmen mehrere auf – ein Foto rückt dann weniger als einen Platz vor
  const nImg = imgs.length, vSlots = taken.filter(Boolean).length;
  const step = Math.min(1, Math.max(0.4, (sl.length - vSlots) / Math.max(1, nImg)));
  // dann die Momente aus Fotos, der Reihe nach auf die freien Plätze; ein Video kommt, sobald seine Stelle erreicht ist
  const vQueue = vids.filter((v) => vAt.has(v.id)).sort((a, b) => vAt.get(a.id) - vAt.get(b.id));
  const vLeft = vids.filter((v) => !vAt.has(v.id));
  const moments = liedMoments(list.filter((m) => m.kind === 'image')).concat(vLeft.map((v) => [v]));
  const rest = moments.slice();
  const out = [];
  let k = 0;
  const flushVideos = () => { while (vQueue.length && vAt.get(vQueue[0].id) <= Math.round(k)) { const v = vQueue.shift(); out.push(v); k = Math.max(k, vAt.get(v.id)) + span(v, vAt.get(v.id)); } };
  while (rest.length) {
    flushVideos();
    const prev = out[out.length - 1];
    let best = -1, bv = -Infinity;
    for (let r = 0; r < rest.length; r++) {
      const mo = rest[r];
      let v = 0, kk = k;
      for (const m of mo) {
        if (m.kind === 'video') { v += fitVid(m, Math.round(kk)); kk += span(m, Math.round(kk)); }
        else { v += fitImg(m, Math.round(kk)); kk += step; }
      }
      v = v / mo.length + 0.15 * Math.min(1, mo.length - 1) - flowCost(prev, mo[0]);
      // eine Szene bleibt in ihrem Songteil: über einen Abschnittswechsel hinweg zerfiele sie
      if (mo.length > 1 && sl[Math.min(lastK, Math.round(k))].sec !== sl[Math.min(lastK, Math.round(kk - step))].sec) v -= 0.2;
      if (v > bv) { bv = v; best = r; }
    }
    const mo = rest.splice(best, 1)[0];
    // innerhalb des Moments: das kräftigste Bild auf den kräftigsten Platz (bei steigender Energie zuletzt)
    const k0 = Math.min(lastK, Math.round(k)), rising = sl[Math.min(lastK, Math.round(k + (mo.length - 1) * step))].e > sl[k0].e + 0.1;
    const inner = mo.length > 1 && mo.every((m) => m.kind === 'image') ? mo.slice().sort((a, b) => (rising ? 1 : -1) * ((imgQ.get(a.id) || 0) - (imgQ.get(b.id) || 0))) : mo;
    for (const m of inner) {
      flushVideos();
      out.push(m);
      k += m.kind === 'video' ? span(m, Math.round(k)) : step;
    }
  }
  while (vQueue.length) out.push(vQueue.shift());
  return out;
}
