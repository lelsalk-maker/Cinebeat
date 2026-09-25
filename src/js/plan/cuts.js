/* Planer · Schnittraster auf Beats (dynamische Programmierung) und Feinabstimmung der Schnittzahl */
/**
 * Schnittpunkte per dynamischer Programmierung auf Beats, Takten, Phrasen,
 * Abschnittswechseln und Akzenten. Zieldauer je Einstellung folgt dem Songteil.
 */
function planCuts(an, win, pace, lengthScale, shotBase, minShot = 0, calmMin = 0) {
  const D = win.end - win.start;
  const beatDur = an.beatPeriod;
  const bars = an.barStart || [];
  const barSet = new Set(bars.map((b) => Math.round(b * 1000)));
  const phrasePhase = an.phrasePhase || 0;
  const phraseSet = new Set(bars.filter((_, k) => (k - phrasePhase) % 4 === 0).map((b) => Math.round(b * 1000)));
  const secStarts = (an.sections || []).map((s) => s.start).filter((t) => t > win.start + 0.3 && t < win.end - 0.3);
  const stops = (an.stops || []).filter((s) => s.t > win.start + 0.5 && s.end < win.end - 0.3);
  const cands = new Map();
  const add = (abs, w, forced) => {
    const t = abs - win.start;
    if (t <= 0.15 || t >= D - 0.15) return;
    const key = Math.round(t * 100);
    const prev = cands.get(key) || cands.get(key - 1) || cands.get(key + 1);
    if (prev) { prev.w = Math.max(prev.w, w) + (w > 1 ? 0.5 : 0); prev.forced = prev.forced || !!forced; return; }
    cands.set(key, { t, w, forced: !!forced });
  };
  for (const b of an.beats) {
    const k = Math.round(b * 1000);
    add(b, phraseSet.has(k) ? 5 : barSet.has(k) ? 3 : 1);
  }
  // feiner Songbogen: Bassdrum-Schläge und neue Gesangszeilen sind bevorzugte Schnittpunkte (nur auf Beats)
  const beatIdx = (t) => { let lo = 0, hi = an.beats.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (an.beats[m] <= t) lo = m; else hi = m - 1; } return lo; };
  for (const kt of an.kicks || []) { const b = an.beats[beatIdx(kt + 0.02)]; if (b != null && Math.abs(b - kt) < 0.03) add(b, 1.5); }
  for (const vt of an.vocalOn || []) add(vt, 4);
  // Schnitte nur auf Beats: Abschnitte und Stopps rasten auf den nächsten Beat ein
  const snap = (t) => { let m = t, d = Infinity; for (const b of an.beats) { const x = Math.abs(b - t); if (x < d) { d = x; m = b; } else if (b > t) break; } return d < beatDur * 0.35 ? m : t; };
  for (const s of secStarts) add(snap(s), 12, true);
  for (const s of stops) add(snap(s.end), 10, true);
  const pts = [{ t: 0, w: 0, forced: true }, ...Array.from(cands.values()).sort((a, b) => a.t - b.t), { t: D, w: 0, forced: true }];

  // Mindestlänge je Einstellung (Format); nur die Akzent-Schnitte auf den ersten Beats des Drops dürfen kürzer sein
  const beatMin = Math.max(0.34, beatDur * 0.98);
  const minLen = Math.max(beatMin, minShot);
  const maxLen = (pace === 'ruhig' ? 7.5 : 6) * Math.max(1, Math.min(1.6, lengthScale));
  const pf = PACES[pace] * lengthScale * (shotBase || 1);
  const tgt = (t) => {
    const abs = win.start + t;
    const sec = sectionAt(an, abs);
    // ruhig genug, dass jedes Bild wirkt; auch im Drop nicht hektisch
    const base = { intro: 2.6, verse: 2.1, build: 1.7, chorus: 1.35, drop: 1.2, break: 3.3, outro: 2.7 }[sec.label] || 2;
    let v = base * pf;
    // Energie Schlag für Schlag: lautere Stellen dichter, leisere länger; beim Gesang dürfen Bilder etwas stehen
    const bi = beatIdx(abs);
    const e = an.energy ? an.energy[bi] || 0.5 : 0.5, voc = an.vocal ? an.vocal[bi] || 0 : 0;
    v *= (1.12 - 0.24 * e) * (1 + 0.12 * voc);
    if (sec.label === 'build') {
      const prog = Math.max(0, Math.min(1, (abs - sec.start) / Math.max(0.1, sec.end - sec.start)));
      v *= 1.4 - prog * 0.9;
    }
    // Einsatz des Drops: zwei Schnitte genau auf den ersten Beats, danach wieder ruhiger
    if (sec.label === 'drop' && abs - sec.start < beatDur * 2.1) return Math.max(beatMin, beatDur * (pace === 'ruhig' ? 2 : 1));
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
  for (const j of cuts) { segs.push({ start: pts[prev].t, end: pts[j].t, w: pts[prev].w }); prev = j; }
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
