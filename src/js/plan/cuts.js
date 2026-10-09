/* Planer · Schnittraster auf Beats (dynamische Programmierung) und Feinabstimmung der Schnittzahl */
/**
 * Schnittpunkte per dynamischer Programmierung auf Beats, Takten, Phrasen,
 * Abschnittswechseln und Akzenten. Zieldauer je Einstellung folgt dem Songteil.
 */
function planCuts(an, win, pace, lengthScale, shotBase, minShot = 0, calmMin = 0, taps = [], vary = 0, simple = false) {
  const D = win.end - win.start;
  const beatDur = an.beatPeriod;
  const bars = an.barStart || [];
  const barSet = new Set(bars.map((b) => Math.round(b * 1000)));
  const phrasePhase = an.phrasePhase || 0;
  const phraseSet = new Set(bars.filter((_, k) => (k - phrasePhase) % 4 === 0).map((b) => Math.round(b * 1000)));
  const secStarts = (an.sections || []).map((s) => s.start).filter((t) => t > win.start + 0.3 && t < win.end - 0.3);
  const stops = (an.stops || []).filter((s) => s.t > win.start + 0.5 && s.end < win.end - 0.3);
  const cands = new Map();
  const add = (abs, w, forced, tap) => {
    const t = abs - win.start;
    if (t <= 0.15 || t >= D - 0.15) return;
    const key = Math.round(t * 100);
    const prev = cands.get(key) || cands.get(key - 1) || cands.get(key + 1);
    if (prev) { prev.w = Math.max(prev.w, w) + (w > 1 ? 0.5 : 0); prev.forced = prev.forced || !!forced; prev.tap = prev.tap || !!tap; return; }
    cands.set(key, { t, w, forced: !!forced, tap: !!tap });
  };
  for (const b of an.beats) {
    const k = Math.round(b * 1000);
    add(b, phraseSet.has(k) ? 5 : barSet.has(k) ? 3 : 1);
  }
  // feiner Songbogen: Bassdrum-Schläge und neue Gesangszeilen sind bevorzugte Schnittpunkte (nur auf Beats)
  const beatIdx = (t) => { let lo = 0, hi = an.beats.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (an.beats[m] <= t) lo = m; else hi = m - 1; } return lo; };
  for (const kt of an.kicks || []) { const b = an.beats[beatIdx(kt + 0.02)]; if (b != null && Math.abs(b - kt) < 0.03) add(b, 1.5); }
  for (const vt of an.vocalOn || []) add(vt, 4);
  // Akzent-Hierarchie: harte Schläge (Becken, Einsatz nach Leiserem, betonte Snare) ziehen den Schnitt an –
  // ein Schnitt auf einem schwachen Schlag wirkt beliebig, einer auf dem Treffer wie gewollt
  const acc = an.accent;
  // (in ruhigen Teilen zählt ein Akzent nur halb: dort sollen die Bilder stehen dürfen)
  const accW = (t) => (isCalmLabel(sectionAt(an, t + 0.01).label) ? 0.5 : 1);
  if (acc && acc.length === an.beats.length) for (let i = 0; i < acc.length; i++) if (acc[i] >= 0.6) add(an.beats[i], 1 + 4 * (acc[i] - 0.5) * accW(an.beats[i]));
  for (const im of an.impacts || []) add(im.t, 3 + 3 * im.v * accW(im.t));
  // im Anstieg verdichtet sich das Raster wie in der Musik: erst halbe Takte, zum Schluss jeder Schlag
  for (const r of an.rises || []) {
    an.beats.forEach((bt) => {
      if (bt <= r.start || bt >= r.end - 0.02 || (r.gap != null && bt > r.gap - 0.02)) return;
      const prog = (bt - r.start) / Math.max(0.1, r.end - r.start), half = barSet.has(Math.round((bt - beatDur * 2) * 1000)) || barSet.has(Math.round((bt + beatDur * 2) * 1000));
      if (prog > 0.45 && half) add(bt, 3);
      else if (prog > 0.72) add(bt, 2.5);
    });
  }
  // Gesangszeilen: am Ende einer Zeile ist ein guter Schnittpunkt (auf dem Schlag danach)
  const lines = an.vocalLines || [];
  const snapB = (t) => { const b = an.beats[beatIdx(t + beatDur * 0.3)]; return b != null && Math.abs(b - t) < beatDur * 0.6 ? b : null; };
  for (const [, e] of lines) { const b = snapB(e); if (b != null) add(b, 3); }
  // Schnitte nur auf Beats: Abschnitte und Stopps rasten auf den nächsten Beat ein
  const snap = (t) => { let m = t, d = Infinity; for (const b of an.beats) { const x = Math.abs(b - t); if (x < d) { d = x; m = b; } else if (b > t) break; } return d < beatDur * 0.35 ? m : t; };
  for (const s of secStarts) add(snap(s), 12, true);
  for (const s of stops) add(snap(s.end), 10, true);
  // im Takt mitgetippt: dort wird auf jeden Fall geschnitten (Zeiten schon auf den Schlag gerastet)
  for (const t of taps || []) if (t > win.start + 0.2 && t < win.end - 0.2) add(t, 14, true, true);
  const pts = [{ t: 0, w: 0, forced: true }, ...Array.from(cands.values()).sort((a, b) => a.t - b.t), { t: D, w: 0, forced: true }];
  // mitten in einer Gesangszeile (nicht an ihrem Anfang oder Ende) schneidet ein Schnitt ins Wort
  for (const p of pts) {
    const abs = win.start + p.t;
    if (!p.forced && (an.rises || []).some((r) => r.gap != null && abs > r.gap - 0.02 && abs < r.end - 0.02)) p.gap = true;
    // (auf einer Eins darf geschnitten werden – dort atmet auch der Gesang meist; zwischen den Zählzeiten nicht)
    if (!p.forced && !barSet.has(Math.round(abs * 1000)) && lines.some(([a, e]) => abs > a + beatDur * 0.4 && abs < e - beatDur * 0.3)) p.inLine = true;
  }

  // Mindestlänge je Einstellung (Format); nur die Akzent-Schnitte auf den ersten Beats des Drops dürfen kürzer sein
  const beatMin = Math.max(0.34, beatDur * 0.98);
  const minLen = Math.max(beatMin, minShot);
  // (bei wenig Material für eine feste Länge darf ein Bild länger stehen, bevor sich etwas wiederholt)
  const maxLen = (pace === 'ruhig' ? 7.5 : 6) * Math.max(1, Math.min(lengthScale > 1.6 ? 2.6 : 1.6, lengthScale));
  const pf = PACES[pace] * lengthScale * (shotBase || 1);
  const tgt = (t) => {
    // (10 ms nach dem Schnitt: ein Platz, der genau auf dem Abschnittswechsel beginnt, gehört zum neuen Teil)
    const abs = win.start + t + 0.01;
    const sec = sectionAt(an, abs);
    // ruhig genug, dass jedes Bild wirkt; auch im Drop nicht hektisch
    const base = { intro: 2.6, verse: 2.1, build: 1.7, chorus: 1.35, drop: 1.2, break: 3.3, outro: 2.7 }[sec.label] || 2;
    let v = base * pf;
    // Energie Schlag für Schlag: lautere Stellen dichter, leisere länger; beim Gesang dürfen Bilder etwas stehen
    const bi = beatIdx(abs);
    const e = an.energy ? an.energy[bi] || 0.5 : 0.5, voc = an.vocal ? an.vocal[bi] || 0 : 0;
    v *= (1.12 - 0.24 * e) * (1 + 0.12 * voc);
    // „Neu schneiden“: je Phrase (vier Takte) etwas dichter oder ruhiger – ein anderer Rhythmus, gleicher Songcharakter
    if (vary) {
      const ph = Math.floor(Math.max(0, abs - (bars[0] || 0)) / (beatDur * 16));
      let h = (vary ^ Math.imul(ph + 1, 2654435761)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
      v *= 0.75 + ((h >>> 8) / 16777216) * 0.55;
    }
    // Spannungskurve: nur wo der Song wirklich steigt (gemessen), wird der Schnitt dichter – im Maß des Anstiegs.
    // Ein „Build“, der flach bleibt, behält seine Länge; ältere Analysen ohne Messung folgen dem Abschnitt.
    if (an.rises) {
      const r = an.rises.find((x) => abs >= x.start - 0.01 && abs < x.end);
      if (r) {
        const prog = Math.max(0, Math.min(1, (abs - r.start) / Math.max(0.1, r.end - r.start)));
        const k = Math.min(1, r.gain / 0.3);
        v *= 1 + 0.3 * k - prog ** 1.1 * 1.05 * k;
      }
    } else if (sec.label === 'build') {
      const prog = Math.max(0, Math.min(1, (abs - sec.start) / Math.max(0.1, sec.end - sec.start)));
      v *= 1.4 - prog * 0.9;
    }
    // Einsatz des Drops: zwei Schnitte genau auf den ersten Beats, danach wieder ruhiger (schlicht: nur der eine Schnitt)
    if (!simple && sec.label === 'drop' && abs - sec.start < beatDur * 2.1) return Math.max(beatMin, beatDur * (pace === 'ruhig' ? 2 : 1));
    // Kontrast bleibt: kann der Drop wegen der Mindestlänge nicht schneller werden, stehen die ruhigen Teile entsprechend
    // länger (Strophe ≈ 1,75×, Break ≈ 2,75× die Drop-Länge) – sonst schneidet der ganze Film im selben Takt
    // (nur ohne Verdichtung: müssen alle Aufnahmen hinein, geht die Menge vor)
    if (!calmMin) {
      const minEff = Math.max(minLen, Math.ceil(minLen / beatDur - 0.02) * beatDur);
      const r = { intro: 2.1, verse: 1.75, break: 2.4, outro: 2.1 }[sec.label];
      if (r) v = Math.max(v, minEff * r * (1 - 0.15 * e));
      // Aufbau: beginnt ruhiger und wird zum Einsatz hin dichter – auch wenn der Drop schon an der Mindestlänge steht
      else if (sec.label === 'build') { const prog = Math.max(0, Math.min(1, (abs - sec.start) / Math.max(0.1, sec.end - sec.start))); v = Math.max(v, minEff * (1.9 - 0.9 * prog)); }
    }
    return Math.max(minLen, Math.min(maxLen, v));
  };
  const n = pts.length;
  const dp = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  dp[0] = 0;
  for (let j = 1; j < n; j++) {
    for (let i = j - 1; i >= 0; i--) {
      const len = pts[j].t - pts[i].t;
      if (len > maxLen * 1.6 && i < j - 1) break;
      if (i < j - 1) {
        let skip = false;
        for (let k = i + 1; k < j; k++) if (pts[k].forced) { skip = true; break; }
        if (skip) break;
      }
      if (dp[i] === Infinity) continue;
      const g = tgt(pts[i].t);
      // Bonus für Schnitte auf Takt/Phrase nur anteilig bei kurzen Einstellungen: sonst gewinnen viele kurze Schnitte gegen die Wunschlänge
      let c = 4 * ((len - g) / g) ** 2 - 0.32 * pts[j].w * Math.min(1, len / g);
      // mitten in einer Gesangszeile: in ruhigen Teilen deutlich teurer (dort hört man jedes Wort), im Refrain/Drop
      // darf der Schnitt auf dem Schlag bleiben, wenn das Tempo es verlangt
      // Atempause vor dem Einsatz: das Bild steht durch die Stille bis auf den Einsatz
      if (pts[j].gap) c += 3;
      if (pts[j].inLine) { const lj = sectionAt(an, win.start + pts[j].t + 0.01).label; c += lj === 'drop' || lj === 'chorus' || lj === 'build' ? 0.8 : 6; }
      // Songdynamik: ruhige Teile (Intro, Strophe, Break, Outro) behalten auch bei viel Material längere Einstellungen
      const lab = sectionAt(an, win.start + pts[i].t + 0.01).label;
      const lo = g < minLen ? beatMin : calmMin && (lab === 'intro' || lab === 'verse' || lab === 'break' || lab === 'outro') ? Math.max(minLen, calmMin) : minLen;
      if (len < lo) c += 50 + (lo - len) * 100;
      if (len > maxLen) c += 20;
      if (dp[i] + c < dp[j]) { dp[j] = dp[i] + c; from[j] = i; }
    }
  }
  const cuts = [];
  for (let j = n - 1; j > 0; j = from[j]) { if (from[j] < 0) break; cuts.push(j); }
  cuts.reverse();
  const segs = [];
  let prev = 0;
  for (const j of cuts) { segs.push({ start: pts[prev].t, end: pts[j].t, w: pts[prev].w, ...(pts[prev].tap ? { tap: true } : {}) }); prev = j; }
  for (const s of stops) {
    const t = s.t - win.start;
    const seg = segs.find((x) => t > x.start + 0.1 && t < x.end);
    if (seg) seg.freezeAt = t;
  }
  return segs;
}

/**
 * Feinabstimmung der Schnittzahl: das Taktraster lässt die Zahl der Einstellungen springen (z. B. 6 → 4).
 * delta > 0 teilt die längsten Einstellungen auf dem Beat nahe ihrer Mitte, delta < 0 legt die kürzesten
 * Nachbarn zusammen – nie über eine Abschnittsgrenze oder einen Stopp hinweg.
 */
function adjustCuts(segs, an, win, delta, minLen, from = 1, to = segs.length) {
  segs = segs.slice();
  const fixed = (g) => g.burst || g.leader || g.knock || g.gridSeg || g.gridMid || g.pre || g.reveal || g.vslot || g.miniRew || g.stackSeg || g.rush;
  const bts = Array.from(an.beats, (b) => b - win.start);
  for (let k = 0; k < delta; k++) {
    let bi = -1, bt = 0, bl = 0;
    for (let i = from; i < Math.min(to, segs.length); i++) {
      const g = segs[i], len = g.end - g.start;
      if (fixed(g) || len < 2 * minLen || len <= bl) continue;
      const mid = (g.start + g.end) / 2;
      let t = null, d = Infinity;
      for (const b of bts) {
        if (b < g.start + minLen - 1e-3 || b > g.end - minLen + 1e-3) continue;
        const x = Math.abs(b - mid);
        if (x < d) { d = x; t = b; }
      }
      if (t != null) { bi = i; bt = t; bl = len; }
    }
    if (bi < 0) break;
    to++;
    const g = segs[bi], fz = g.freezeAt;
    segs.splice(bi, 1, { ...g, end: bt, freezeAt: fz != null && fz < bt ? fz : undefined }, { start: bt, end: g.end, w: 1, freezeAt: fz != null && fz >= bt ? fz : undefined });
  }
  for (let k = 0; k < -delta; k++) {
    let bi = -1, bc = Infinity;
    for (let i = from; i < Math.min(to, segs.length) - 1; i++) {
      const a = segs[i], b = segs[i + 1];
      if (b.w >= 10 || fixed(a) || fixed(b)) continue;
      const c = b.end - a.start + b.w * 0.3;
      if (c < bc) { bc = c; bi = i; }
    }
    if (bi < 0) break;
    to--;
    const a = segs[bi], b = segs[bi + 1];
    segs.splice(bi, 2, { ...a, end: b.end, freezeAt: a.freezeAt != null ? a.freezeAt : b.freezeAt });
  }
  return segs;
}
