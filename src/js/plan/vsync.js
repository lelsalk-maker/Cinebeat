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
