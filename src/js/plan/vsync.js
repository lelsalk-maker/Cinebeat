/* Planer · Videoschnitt wie ein Cutter: Aktionsmomente eines Videos (Sprung, Welle, Schwenk-Stopp) auf starke Schläge */

/**
 * Raster der Stellen, auf denen eine Bewegung „sitzen“ soll, mit Gewicht: Eins eines Takts, Snare, Bassdrum, Halbtakt, übrige Beats.
 * Zeiten relativ zum Songausschnitt.
 */
function hitGrid(an, win) {
  const rel = (a) => Array.from(a || []).map((t) => t - win.start);
  const bars = rel(an.barStart), beats = rel(an.beats);
  const out = [];
  const add = (t, w) => { const o = out.find((x) => Math.abs(x.t - t) < 0.03); if (o) o.w = Math.max(o.w, w); else out.push({ t, w }); };
  for (const t of beats) add(t, 0.5);
  bars.forEach((b, k) => { add(b, 1); const nb = bars[k + 1]; if (nb != null) add((b + nb) / 2, 0.75); });
  for (const t of rel(an.snares)) add(t, 0.8);
  for (const t of rel(an.kicks)) add(t, 0.7);
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Versatz (Quellzeit ab Ausschnitt-Beginn) so, dass möglichst viele und starke Aktionsmomente genau auf dem Raster landen,
 * keiner knapp vor dem Schnitt abreißt und der beste Moment im Bild bleibt. Sucht in der Nähe des bisherigen Versatzes.
 * Liefert { off, hits } oder null, wenn nichts überzeugend passt (dann gilt die bisherige Regel).
 */
function syncVideoOffset(m, c, { tIn = 0, off0, hi, rate = 1, grid, best }) {
  const hs = (m.hits || []).map(([t, st]) => [t - tIn, st]).filter(([t]) => t >= 0);
  if (!hs.length || !(hi >= 0)) return null;
  const len = c.visEnd - c.visStart, span = len * rate;
  const g = grid.filter((x) => x.t > c.start - 0.1 && x.t < c.end + 0.1);
  if (!g.length) return null;
  const aff = (tl) => { let a = 0; for (const x of g) { const dt = tl - x.t; if (Math.abs(dt) < 0.12) a = Math.max(a, x.w * Math.exp(-(dt * dt) / (2 * 0.028 * 0.028))); } return a; };
  const lo = Math.max(0, off0 - span * 0.6), up = Math.min(hi, off0 + span * 0.6);
  let bestOff = off0, bestScore = -Infinity, bestN = 0, base = null;
  const evalOff = (off) => {
    let sc = 0, n = 0;
    for (const [h, st] of hs) {
      const tl = c.visStart + (h - off) / rate;
      if (tl < c.start + 0.06 || tl > c.end + 0.02) continue;
      // Bewegung setzt kurz vor dem Schnitt ein: wird abgeschnitten
      if (tl > c.end - 0.14) { sc -= 0.35 * st; continue; }
      const a = aff(tl);
      sc += st * a; if (a > 0.5) n++;
    }
    sc -= 0.3 * Math.abs(off - off0) / Math.max(0.5, span);
    if (best != null && (best < off || best > off + span)) sc -= 0.4;
    return [sc, n];
  };
  for (let off = lo; off <= up + 1e-6; off += 1 / 120) {
    const [sc, n] = evalOff(off);
    if (sc > bestScore) { bestScore = sc; bestOff = off; bestN = n; }
  }
  base = evalOff(Math.max(0, Math.min(hi, off0)))[0];
  if (bestN < 1 || bestScore < 0.35 || bestScore < base + 0.05) return null;
  return { off: Math.max(0, Math.min(hi, bestOff)), hits: bestN };
}

/**
 * Wie viel Platz lässt der Song zwischen Songzeit a und b für einen Originalton (0 = keiner, 1 = ideal)?
 * Ideal: ein Stopp oder die Atempause vor einem Einsatz, der Ausklang am Filmende. Gut: ruhige Stellen ohne Gesang
 * (Intro, Strophe ohne Stimme, Break, Outro). Nie: Drop, Refrain, ein steigender Aufbau oder über Gesang.
 */
function songRoom(an, a, b, filmEnd) {
  if ((an.stops || []).some((s) => a >= s.t - 0.15 && b <= s.end + 0.4)) return 1;
  if ((an.rises || []).some((r) => r.gap != null && a >= r.gap - 0.15 && b <= r.end + 0.3)) return 1;
  const secs = (an.sections || []).filter((x) => x.end > a && x.start < b);
  if (secs.some((x) => x.label === 'drop' || x.label === 'chorus')) return 0;
  if ((an.rises || []).some((r) => a < r.end && b > r.start)) return 0;
  const bt = an.beats || [], en = an.energy || [], vc = an.vocal || [];
  let e = 0, v = 0, n = 0;
  for (let i = 0; i < bt.length; i++) if (bt[i] >= a - 0.25 && bt[i] <= b + 0.25) { e += en[i] || 0; v += vc[i] || 0; n++; }
  if (!n) return 0;
  e /= n; v /= n;
  // über gesungenem Text spricht niemand dazwischen
  if (v > 0.35) return 0;
  const tail = filmEnd != null && b > filmEnd - 2.5 ? 0.9 : 0;
  return Math.max(tail, e > 0.55 ? 0 : Math.min(0.9, 1.1 - e * 1.2));
}

/**
 * Originalton-Moment für eine Video-Einstellung suchen: das klarste Ereignis (m.snd, siehe soundMoments), das ganz in die
 * Einstellung passt und an eine Songstelle fällt, die Platz lässt. Liefert { off, t0, t1, src, art, q } (Filmzeit; off =
 * Versatz ab Ausschnitt-Anfang bei Echtzeit) oder null – ein Moment wird nie erzwungen.
 */
function pickVoiceMoment(m, c, { an, win, tIn, vd, visDur, D, minQ = 0.5 }) {
  const ev = (m.snd && !m.snd.music && m.snd.list) || [];
  if (!ev.length || visDur < 1.2) return null;
  let best = null;
  for (const [e0, e1, art, q] of ev) {
    if (e0 < tIn + 0.1 || e1 > tIn + vd - 0.05) continue;
    const ed = e1 - e0;
    if (ed > visDur - 0.4) continue;
    const maxOff = Math.max(0, vd - visDur);
    for (let fs = c.visStart + 0.2; fs <= c.visEnd - ed - 0.2 + 1e-6; fs += 0.05) {
      const off = e0 - tIn - (fs - c.visStart);
      if (off < 0 || off > maxOff) continue;
      const room = songRoom(an, win.start + fs - 0.1, win.start + fs + ed + 0.2, win.start + D);
      const v = q * room;
      if (v >= minQ && (!best || v > best.v + 1e-6)) best = { v, off, t0: fs - 0.12, t1: Math.min(c.visEnd, fs + ed + 0.25), src: e0 - 0.12, art, q };
    }
  }
  return best;
}
