/* ============================================================
 * Planer: Schnitt nach Songaufbau, Kino-Einstiege und -Enden,
 * Split-Screens, Kapitel, Nutzeränderungen
 * ============================================================ */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Übergänge (müssen zum Shader passen)
const TR = { CUT: 0, DISSOLVE: 1, DIP: 2, ZOOM: 4, WHIP: 5, LEAK: 6, LUMA: 7, PUSH: 9, INK: 10, MORPH: 11, DOUBLE: 12, DRIFT: 13 };
const TR_NAMES = { 0: 'Schnitt', 1: 'Blende', 2: 'Schwarzblende', 4: 'Zoom', 5: 'Wischer', 6: 'Lichtleck', 7: 'Lichtblende', 9: 'Schieben', 10: 'Farbfluss', 11: 'Bild aus Bild', 12: 'Doppelbelichtung', 13: 'Drift' };

/**
 * Looks: natürliches Grading (das Bild bleibt echt), aber klar erkennbar.
 * sh/hi: Tönung der Schatten/Lichter, vib: Vibrance (hebt blasse Farben, schont Hauttöne), temp: Farbtemperatur,
 * lift/crush: Schwarz- und Weißpunkt, glow: Halation der Lichter.
 * pal: Farben für alles, was darüber liegt: Schrift immer schlicht weiß bzw. silbern, tone tönt Countdown und Rewind im Look.
 */
const LOOKS = {
  natur: { label: 'Natürlich', blurb: 'Klare, echte Farben mit Tiefe', grade: { sat: 1.0, vib: 0.3, contrast: 0.3, temp: 0.08, sh: [-0.012, 0.0, 0.018], hi: [0.02, 0.012, -0.01], lift: 0.01, crush: 0.012, bw: 0, grain: 0.012, vig: 0.24, tint: [1, 1, 1], glow: 0.05, leak: 0 },
    pal: { ink: '#f4f5f7', tone: [40, 34, 28] } },
  golden: { label: 'Golden Hour', blurb: 'Warmes Licht, weiche Lichter', grade: { sat: 0.98, vib: 0.22, contrast: 0.22, temp: 0.42, sh: [0.028, 0.004, -0.03], hi: [0.08, 0.022, -0.06], lift: 0.026, crush: 0.02, bw: 0, grain: 0.016, vig: 0.34, tint: [1.02, 1, 0.95], glow: 0.3, leak: 0 },
    pal: { ink: '#eceef1', tone: [96, 58, 22] } },
  kino: { label: 'Teal & Orange', blurb: 'Blockbuster-Kontrast', grade: { sat: 0.9, vib: 0.38, contrast: 0.44, temp: 0.06, sh: [-0.075, 0.02, 0.085], hi: [0.085, 0.025, -0.075], lift: 0.02, crush: 0.03, bw: 0, grain: 0.02, vig: 0.44, tint: [1, 1, 1], glow: 0.06, leak: 0 },
    pal: { ink: '#f4f5f7', tone: [18, 52, 60] } },
  blau: { label: 'Blue Hour', blurb: 'Kühle Nacht, satte Tiefen', grade: { sat: 0.86, vib: 0.18, contrast: 0.38, temp: -0.4, sh: [-0.035, 0.008, 0.075], hi: [-0.01, 0.02, 0.045], lift: 0.02, crush: 0.03, bw: 0, grain: 0.022, vig: 0.44, tint: [0.97, 1, 1.05], glow: 0.16, leak: 0 },
    pal: { ink: '#f4f5f7', tone: [22, 36, 70] } },
  film: { label: 'Film 35', blurb: 'Analoges Korn, sanfte Farben', grade: { sat: 0.8, vib: 0.12, contrast: 0.2, temp: 0.2, sh: [-0.02, 0.035, 0.022], hi: [0.06, 0.035, -0.04], lift: 0.07, crush: 0.045, bw: 0, grain: 0.055, vig: 0.4, tint: [1.02, 0.99, 0.93], glow: 0.2, leak: 0.05 },
    pal: { ink: '#eceef1', tone: [92, 70, 40] } },
  digicam: { label: 'Digicam', blurb: '2000er-Kamera: knackig, kühl, mit Blitz', grade: { sat: 1.1, vib: 0.1, contrast: 0.5, temp: -0.16, sh: [-0.01, 0.02, 0.03], hi: [0.0, 0.004, 0.02], lift: 0.0, crush: 0.0, bw: 0, grain: 0.018, vig: 0.08, tint: [0.99, 1.01, 1.03], glow: 0, leak: 0 },
    pal: { ink: '#ffffff', tone: [20, 32, 44] } },
  noir: { label: 'Noir', blurb: 'Schwarzweiß mit Charakter', grade: { sat: 0, vib: 0, contrast: 0.55, temp: 0, sh: [0, 0, 0], hi: [0, 0, 0], lift: 0.02, crush: 0.02, bw: 1, grain: 0.05, vig: 0.5, tint: [1, 1, 1], glow: 0.05, leak: 0 },
    pal: { ink: '#f2f2f2', tone: [30, 30, 30] } },
};

const FORMATS = {
  '9:16': { w: 9, h: 16, label: 'Story & Reel', short: 'Story', px: [1080, 1920] },
  '4:5': { w: 4, h: 5, label: 'Beitrag', short: 'Beitrag', px: [1080, 1350] },
  '16:9': { w: 16, h: 9, label: 'Film 16:9', short: 'Film', px: [1920, 1080] },
  '2.39': { w: 2.39, h: 1, label: 'Kino 2.39', short: 'Kino', px: [1920, 804] },
};
const BAND_ASPECT = 16 / 9; // Kinoband im Hochformat

const PACES = { ruhig: 1.45, mittel: 1, schnell: 0.7 };

function outputSize(format, quality, previewShort = 540) {
  const [w, h] = (FORMATS[format] || FORMATS['9:16']).px;
  if (quality === 'preview') {
    const s = Math.max(540, Math.min(Math.min(w, h), previewShort)) / Math.min(w, h);
    return { w: Math.round((w * s) / 2) * 2, h: Math.round((h * s) / 2) * 2 };
  }
  if (quality === '4k') return { w: w * 2, h: h * 2 };
  return { w, h };
}

/** Bildbereich (Kinoband) in Ausgabe-UV: [oben, Höhe] */
function bandRect(format, frame) {
  const f = FORMATS[format] || FORMATS['9:16'];
  if (frame !== 'band' || f.w >= f.h) return [0, 1];
  const aspect = f.w / f.h;
  const hgt = aspect / BAND_ASPECT;
  return [(1 - hgt) / 2 - 0.02, hgt];
}

/** Länge des Aufblende-Einstiegs in Beats: zwei Takte, bei sehr langsamen Songs einer (Aufbau 3–5 s). */
function revealBeats(an) {
  return an.beatPeriod * 8 <= 5.6 ? 8 : 4;
}

/** Ist Beat i eine Eins (Taktanfang)? Folgt der erkannten Taktzählung, auch wenn sie im Song springt. */
function downSet(an) {
  if (!an._downSet) Object.defineProperty(an, '_downSet', { value: new Set(an.downIdx || Array.from(an.beats, (_, i) => i).filter((i) => i % 4 === an.downPhase)), enumerable: false });
  return an._downSet;
}

function sectionAt(an, absT) {
  const secs = an.sections || [];
  for (const s of secs) if (absT >= s.start && absT < s.end) return s;
  return secs[secs.length - 1] || { start: 0, end: an.duration, label: 'verse', energy: 0.5 };
}

/** Songausschnitt nach Wunschlänge und fester Startwahl. */
function pickWindow(an, { length, songStart }) {
  const first = Math.max(0, an.firstSound), last = Math.min(an.duration, an.lastSound + 0.2);
  const bars = an.barStart && an.barStart.length ? an.barStart : Array.from(an.beats).filter((_, i) => downSet(an).has(i));
  const barDur = an.beatPeriod * 4;
  let target = length === 'full' ? last - first : +length;
  target = Math.min(target, last - first);
  const snap = (t) => {
    let best = first, bd = Infinity;
    for (const b of bars) { const d = Math.abs(b - t); if (d < bd) { bd = d; best = b; } }
    return bd < barDur ? best : t;
  };
  let start;
  if (length === 'full' || songStart === 'start') start = first;
  else if (songStart === 'hook') start = snap(an.hook || first);
  else if (songStart === 'prehook') start = snap((an.hook || first) - (target <= 20 ? 2 : 4) * barDur);
  else if (typeof songStart === 'number') start = snap(songStart);
  else start = first;
  start = Math.max(first, start);
  if (start + target > last) start = Math.max(first, snap(last - target));
  if (start + target > last + 0.01) start = first;
  let end = Math.min(last, start + target);
  if (length !== 'full') {
    let best = end, bd = Infinity;
    for (const b of bars.concat((an.sections || []).map((s) => s.start))) {
      if (b <= start + Math.min(6, target * 0.5) || b > last) continue;
      const d = Math.abs(b - (start + target));
      if (d < bd) { bd = d; best = b; }
    }
    if (bd <= barDur * 1.01) end = best;
  }
  return { start, end };
}

/**
 * Schnittpunkte per dynamischer Programmierung auf Beats, Takten, Phrasen,
 * Abschnittswechseln und Akzenten. Zieldauer je Einstellung folgt dem Songteil.
 */
function planCuts(an, win, pace, lengthScale, shotBase, minShot = 0) {
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
      const lo = g < minLen ? beatMin : minLen;
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
  const fixed = (g) => g.burst || g.leader || g.knock || g.gridSeg || g.gridMid || g.pre || g.reveal || g.vslot || g.miniRew || g.stackSeg;
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

/** Kino-Übergänge: meist harte Schnitte, gezielte Blenden an Abschnittsgrenzen. */
function chooseTransition(ctx, rng) {
  const { labelA, labelB, sectionChange, weight, peak, pace, beatDur, lenA, lenB, stopEnd } = ctx;
  let type = TR.CUT, beats = 0, punch = false;
  if (stopEnd) punch = true;
  else if (sectionChange) {
    if (labelB === 'drop') { if (labelA === 'break' || labelA === 'build') punch = true; else { type = TR.ZOOM; beats = 0.5; } }
    else if (labelB === 'chorus') { type = rng() < 0.6 ? TR.WHIP : TR.ZOOM; beats = 0.5; }
    else if (labelB === 'break') { type = rng() < 0.6 ? TR.DISSOLVE : TR.DIP; beats = 1.5; }
    else if (labelB === 'outro') { type = TR.DISSOLVE; beats = 1.5; }
    else { type = rng() < 0.5 ? TR.LEAK : TR.DISSOLVE; beats = 1; }
  } else if (weight >= 5) {
    if (peak) { type = rng() < 0.55 ? TR.WHIP : TR.PUSH; beats = 0.5; }
    else { type = rng() < 0.7 ? TR.DISSOLVE : TR.LUMA; beats = pace === 'ruhig' ? 1.5 : 1; }
  } else if (!peak && (pace === 'ruhig' || labelA === 'break' || labelA === 'intro')) {
    if (rng() < 0.4) { type = TR.DISSOLVE; beats = 1; }
  }
  let dur = beats * beatDur;
  if (type !== TR.CUT) {
    dur = Math.min(dur, 0.45 * lenA, 0.45 * lenB, 2.2);
    if (dur < 0.14) { type = TR.CUT; dur = 0; }
  }
  return { type, dur, punch };
}

/**
 * Verfeinert den Übergang anhand der beiden Bilder:
 * ähnlicher Aufbau → Match-Cut (harter Schnitt, die Bewegung läuft weiter) oder „Bild aus Bild“,
 * Sprung ins Helle → Lichtblende, Sprung ins Dunkle → Schwarzblende statt Blende.
 */
function refineTransition(tr, rel, ctx) {
  if (!rel || tr.punch) return tr;
  const { A, B, beatDur, s, peak, rng } = ctx;
  const lenA = A.end - A.start, lenB = B.end - B.start;
  const fit = (beats, max = 2.4) => Math.min(beats * beatDur, 0.45 * lenA, 0.45 * lenB, max);
  if (s.morph === 'on' && !peak) {
    // kreative Übergänge, bei denen ein Bild aus dem anderen entsteht (nicht in Drops: dort bleibt es knackig)
    const d = fit(rel.sim > 0.55 ? 2 : 1.5);
    if (d >= 0.3) {
      const type = rel.sim > 0.55 ? TR.MORPH : rel.aLuma > 0.5 && rel.colorD > 45 ? TR.DOUBLE : rng() < 0.5 ? TR.INK : TR.MORPH;
      return { type, dur: d, punch: false };
    }
  }
  if (s.match !== 'off' && rel.sim > 0.78 && (tr.type === TR.CUT || tr.type === TR.DISSOLVE)) {
    return { type: TR.CUT, dur: 0, punch: false, match: true };
  }
  if (tr.type === TR.DISSOLVE) {
    if (rel.dl > 0.22) return { ...tr, type: TR.LUMA };
    if (rel.dl < -0.3) return { ...tr, type: TR.DIP };
  }
  return tr;
}

/** Zurückgelegte Quellzeit einer Tempo-Kurve (Punkte [Zeit, Tempo], linear dazwischen) bis t. */
function rampIntegral(pts, t) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, r0] = pts[i], [t1, r1] = pts[i + 1];
    if (t <= t0) break;
    const te = Math.min(t, t1), f = (te - t0) / Math.max(1e-6, t1 - t0);
    acc += (te - t0) * (r0 + (r0 + (r1 - r0) * f)) / 2;
  }
  const last = pts[pts.length - 1];
  if (t > last[0]) acc += (t - last[0]) * last[1];
  return acc;
}
function rampRate(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) if (t < pts[i + 1][0]) { const [t0, r0] = pts[i], [t1, r1] = pts[i + 1]; return r0 + (r1 - r0) * (t - t0) / Math.max(1e-6, t1 - t0); }
  return pts[pts.length - 1][1];
}

/** Spielbarer Teil eines Videos (gewählter Ausschnitt oder ganz), in Sekunden. */
function videoSpan(m) {
  const d = m.duration || 3;
  if (m.trim && m.trim[1] > m.trim[0]) return Math.max(0.5, Math.min(d, m.trim[1]) - Math.max(0, m.trim[0]));
  return d;
}
/** So lange soll ein Video im Film laufen: fast ganz, höchstens vmax. */
function videoPlay(m, vmax) {
  return Math.max(1.5, Math.min(vmax, videoSpan(m) * 0.96));
}

/** Energie einer Aufnahme (0 … 1): kräftige Farben, Schärfe und bei Videos Bewegung. */
function mediaEnergy(m) {
  const hl = m.kind === 'video' && m.highlights && m.highlights[0] ? 0.2 : 0;
  return Math.max(0, Math.min(1, 0.5 * (m.color || 0.4) + 0.35 * (m.sharp || 0.5) + hl));
}
const isCalmLabel = (l) => l !== 'drop' && l !== 'chorus';

/**
 * Eigene Plätze für Videos: in ruhigen Songteilen, lang genug, dass sie nicht mitten in der Bewegung abreißen,
 * und zeitlich dort, wo sie in der Reise liegen. Benachbarte Schnitte werden dafür zusammengelegt (bleiben auf Beats).
 */
function videoSlots(segs, an, win, vids, all, barDur, startAt, endAt, vmax, rampDrop = false) {
  const special = (g) => g.burst || g.leader || g.knock || g.gridSeg || g.gridMid || g.pre || g.reveal || g.vslot || g.miniRew || g.stackSeg;
  const labelAt = (t) => sectionAt(an, win.start + t + 0.01).label;
  const bars = (an.barStart || []).map((b) => b - win.start);
  const onBar = (t) => bars.some((b) => Math.abs(b - t) < 0.04);
  const span = Math.max(1, endAt - startAt);
  let budget = (endAt - startAt) * 0.7;
  // Speed-Ramp an: ein längeres Video darf auf den Drop zulaufen (beschleunigt) oder auf ihm landen (Zeitlupe)
  const peaks = (an.sections || []).filter((x) => x.label === 'drop' || x.label === 'chorus').map((x) => x.start - win.start);
  const atPeak = (t) => peaks.some((x) => Math.abs(x - t) < 0.06);
  let rampLeft = rampDrop ? 1 : 0;
  for (const v of vids) {
    // fast die ganze Länge (bzw. der gewählte Ausschnitt), höchstens vmax
    const want = videoPlay(v, vmax);
    if (videoSpan(v) < 1.2 || budget < want * 0.6) continue;
    const p = all.length > 1 ? all.indexOf(v) / (all.length - 1) : 0.5;
    const target = startAt + p * span;
    // bewegte Videos (Action) passen in Drop/Refrain, ruhige in Strophe und Break
    const lively = (v.motion || 0) > 0.05;
    let best = null;
    for (let k = 0; k < segs.length - 1; k++) {
      const g = segs[k];
      if (special(g) || g.start < startAt - 0.01 || g.end > endAt + 0.01) continue;
      const lab = labelAt(g.start);
      let j = k, end = g.end, cross = 0;
      while (end - g.start < want * 0.95 && j + 1 < segs.length - 1 && !special(segs[j + 1]) && segs[j + 1].end - g.start <= want * 1.2) {
        j++; end = segs[j].end;
        if (labelAt(segs[j].start) !== lab) cross++;
      }
      const len = end - g.start;
      if (len < Math.min(want * 0.8, 1.5)) continue;
      const calm = isCalmLabel(lab);
      const cost = (Math.abs(g.start - target) / span) * 0.8 + Math.abs(len - want) / want * 0.7 + (onBar(g.start) ? 0 : 0.25) + cross * 0.15
        + (lively ? (calm ? 0.3 : 0) : (calm ? 0 : 0.6));
      const ramp = rampLeft > 0 && videoSpan(v) > want * 1.15 && (atPeak(end) || atPeak(g.start));
      const c2 = cost - (ramp ? 1.2 : 0);
      if (!best || c2 < best.cost) best = { k, j, cost: c2, end, ramp };
    }
    if (!best) continue;
    if (best.ramp) rampLeft--;
    const g0 = segs[best.k];
    segs.splice(best.k, best.j - best.k + 1, { start: g0.start, end: best.end, w: g0.w, vslot: true, vid: v.id, freezeAt: undefined });
    budget -= best.end - g0.start;
  }
  return segs;
}

/**
 * Verteilt Aufnahmen auf die Einstellungen: Videos auf ihre Plätze (oder die längste passende ruhige Einstellung),
 * Fotos in ihrer Reihenfolge, aber jeweils die, deren Energie am besten zum Songteil passt (Blick auf die nächsten drei).
 */
function assignStream(clips, idxs, list, byId) {
  const taken = new Set();
  const vids = list.filter((m) => m.kind === 'video');
  const free = new Set(idxs);
  // 1. Videoplätze
  for (const i of idxs) {
    const c = clips[i];
    if (c.vid && byId.has(c.vid) && list.includes(byId.get(c.vid))) { c.mediaId = c.vid; free.delete(i); taken.add(c.vid); }
  }
  // 2. übrige Videos: längste ruhige Einstellung nahe ihrer Zeitposition
  const idxArr = idxs.slice();
  for (const v of vids) {
    if (taken.has(v.id)) continue;
    const p = list.length > 1 ? list.indexOf(v) / (list.length - 1) : 0.5;
    let best = -1, bs = -Infinity;
    for (const i of free) {
      const c = clips[i], len = c.end - c.start;
      if (len < 1.5) continue;
      const pos = idxArr.indexOf(i) / Math.max(1, idxArr.length - 1);
      const sc = Math.min(len, 4) - Math.abs(pos - p) * 6 + (isCalmLabel(c.label) ? 1.2 : 0);
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best >= 0) { clips[best].mediaId = v.id; free.delete(best); taken.add(v.id); }
  }
  // 3. Fotos (und Videos ohne Platz nur auf langen Einstellungen) nach Reihenfolge und passender Energie
  let stream = list.filter((m) => !taken.has(m.id));
  if (!stream.length) stream = list.slice();
  let pos = 0;
  const recent = [];
  for (const i of idxs) {
    if (!free.has(i)) { recent.push(clips[i].mediaId); continue; }
    const c = clips[i];
    const want = Math.max(0, Math.min(1, c.energy != null ? c.energy : 0.5));
    let bk = -1, bv = Infinity;
    // nur unter den in dieser Runde noch nicht gezeigten wählen: sonst verdrängte ein Wiederholer eine neue Aufnahme
    for (let k = 0; k < Math.min(3, stream.length - pos); k++) {
      const m = stream[(pos + k) % stream.length];
      if (m.kind === 'video' && c.end - c.start < 1.5) continue;
      if (recent.slice(-3).includes(m.id) && stream.length > 3) continue;
      // ähnlicher Bildaufbau direkt nach dem vorigen Bild (Match-Cut) hat Vorrang vor der Energie
      const prevM = byId.get(recent[recent.length - 1]);
      const v = Math.abs(mediaEnergy(m) - want) + k * 0.16 - (prevM && layoutSim(prevM.layout, m.layout) > 0.78 ? 0.3 : 0);
      if (v < bv) { bv = v; bk = k; }
    }
    if (bk < 0) bk = 0;
    // gewählte Aufnahme mit der fälligen tauschen: keine wird übersprungen, die Reihenfolge bleibt fast erhalten
    const at = (pos + bk) % stream.length, here = pos % stream.length;
    const m = stream[at];
    stream[at] = stream[here]; stream[here] = m;
    c.mediaId = m.id;
    recent.push(m.id);
    pos = (pos + 1) % stream.length;
  }
}

function orderChrono(list) {
  return list.slice().sort((a, b) => (a.time || 0) - (b.time || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'de', { numeric: true }));
}

/** Wählt K Medien: Favoriten zuerst, dann nach Bewertung; Reihenfolge chronologisch. */
function selectMedia(pool, K, mustIds) {
  let clean = pool.filter((m) => !m.bad && !m.excluded && (!m.dupOf || m.fav || mustIds.has(m.id)));
  if (clean.length < 2) {
    // nur bei fast leerem Material dürfen Doppelte/Unscharfe aushelfen
    const dups = pool.filter((m) => !m.bad && !m.excluded && m.dupOf && !clean.includes(m)).sort((a, b) => (b.score || 0) - (a.score || 0));
    clean = clean.concat(dups.slice(0, Math.max(0, Math.min(K, 3) - clean.length)));
  }
  if (clean.length <= K) return orderChrono(clean);
  const must = clean.filter((m) => m.fav || mustIds.has(m.id));
  const rest = clean.filter((m) => !(m.fav || mustIds.has(m.id))).sort((a, b) => (b.score || 0) - (a.score || 0));
  return orderChrono(must.concat(rest.slice(0, Math.max(0, K - must.length))));
}

/**
 * Bewusste Reihenfolge: grob chronologisch, innerhalb einer Szene (Aufnahmen kurz nacheinander)
 * aber so, dass jedes Bild aus dem vorigen hervorgeht: ähnliche Farbe und Helligkeit fließen,
 * ähnlicher Bildaufbau ergibt Match-Cuts, Beinahe-Doppel stehen nie direkt hintereinander.
 */
function flowOrder(list, wantMatch) {
  if (list.length < 3) return list.slice();
  const colorD = (a, b) => (a.avg && b.avg ? Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) : 60);
  const twin = (a, b) => colorD(a, b) < 18 && a.hash && b.hash && hamming(a.hash, b.hash) < 14;
  const flow = (a, b) => {
    if (twin(a, b)) return -1;
    let v = 0.45 * (1 - Math.min(1, colorD(a, b) / 160)) + 0.25 * (1 - Math.min(1, Math.abs((a.luma || 0.45) - (b.luma || 0.45)) / 0.4));
    const sim = layoutSim(a.layout, b.layout);
    if (wantMatch && sim > 0.72) v += 0.35 * sim;
    if (a.kind !== b.kind) v += 0.05;
    return v;
  };
  // Szenen: Lücke über 40 Minuten beginnt eine neue
  const scenes = [];
  for (const m of list) {
    const last = scenes[scenes.length - 1];
    const prev = last && last[last.length - 1];
    if (!prev || !m.time || !prev.time || m.time - prev.time > 40 * 60 * 1000) scenes.push([m]); else last.push(m);
  }
  const out = [];
  for (const sc of scenes) {
    const rest = sc.slice();
    let prev = out[out.length - 1] || null;
    while (rest.length) {
      let bi = 0;
      if (prev) {
        let bv = -Infinity;
        // nur unter den nächsten vier Aufnahmen wählen: die Geschichte bleibt in ihrer Zeit
        for (let k = 0; k < Math.min(4, rest.length); k++) {
          const v = flow(prev, rest[k]) - k * 0.09;
          if (v > bv) { bv = v; bi = k; }
        }
      }
      prev = rest.splice(bi, 1)[0];
      out.push(prev);
    }
  }
  return out;
}

/** Beziehung zweier aufeinanderfolgender Aufnahmen für die Wahl des Übergangs. */
function shotRelation(a, b) {
  if (!a || !b) return null;
  const colorD = a.avg && b.avg ? Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) : 60;
  return { sim: layoutSim(a.layout, b.layout), colorD, dl: (b.luma || 0.45) - (a.luma || 0.45), aLuma: a.luma || 0.45 };
}

/** Ähnliche Bilder nicht direkt hintereinander (Farbe/Hash). */
function spreadSimilar(order) {
  const sim = (a, b) => a && b && a.avg && b.avg && Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) < 18 && (!a.hash || !b.hash || hamming(a.hash, b.hash) < 14);
  for (let i = 2; i < order.length - 1; i++) {
    if (sim(order[i], order[i - 1]) && !sim(order[i + 1], order[i - 1])) { const t = order[i]; order[i] = order[i + 1]; order[i + 1] = t; }
  }
  return order;
}

/** Ken-Burns-Fahrt, die auf dem Bildschwerpunkt landet. */
function imageMotion(rng, m, outAspect, visDur, role, prevDir) {
  const srcAspect = m.w && m.h ? m.w / m.h : outAspect;
  const fw = srcAspect > outAspect ? outAspect / srcAspect : 1;
  const fh = srcAspect > outAspect ? 1 : srcAspect / outAspect;
  const fx = m.focus ? m.focus[0] : 0.5, fy = m.focus ? m.focus[1] : 0.45;
  const toPos = (f, frac) => (frac >= 0.999 ? 0 : Math.max(-1, Math.min(1, ((f - 0.5) * 2) / (1 - frac))));
  const px = toPos(fx, fw), py = toPos(fy, fh);
  const speed = Math.min(1.4, Math.max(0.6, visDur / 3.2));
  const z = (role === 'burst' ? 0.1 : 0.075) * speed;
  // feine Neigung, die über die Einstellung ausläuft (modern, nie wackelig)
  const tilt = (rng() < 0.5 ? -1 : 1) * 0.0065 * speed;
  // Richtung bleibt meist über zwei Einstellungen gleich: ruhiger Fluss statt Hin und Her
  const keep = rng() < 0.55;
  if (fh < 0.72) {
    const down = prevDir === 'up' ? !keep : prevDir === 'down' ? keep : rng() < 0.5;
    const a = Math.max(-1, Math.min(1, py + (down ? -0.6 : 0.6)));
    return { dir: down ? 'down' : 'up', m: { from: { s: 1.03, x: 0, y: a, r: tilt }, to: { s: 1.03 + z * 0.6, x: 0, y: py, r: 0 } } };
  }
  if (fw < 0.72) {
    const right = prevDir === 'left' ? !keep : prevDir === 'right' ? keep : rng() < 0.5;
    const a = Math.max(-1, Math.min(1, px + (right ? -0.65 : 0.65)));
    return { dir: right ? 'right' : 'left', m: { from: { s: 1.03, x: a, y: 0, r: tilt }, to: { s: 1.03 + z * 0.6, x: px, y: 0, r: 0 } } };
  }
  const zin = prevDir === 'in' ? keep || rng() < 0.3 : prevDir === 'out' ? !keep : rng() < 0.7;
  const tx = px * 0.8, ty = py * 0.8;
  // leichter Versatz quer zur Zoomrichtung: die Fahrt bekommt eine Kurve statt einer geraden Linie
  const sx = (rng() - 0.5) * 0.35;
  return zin
    ? { dir: 'in', m: { from: { s: 1.02, x: tx * 0.2 + sx, y: ty * 0.2, r: tilt }, to: { s: 1.02 + z, x: tx, y: ty, r: -tilt * 0.3 } } }
    : { dir: 'out', m: { from: { s: 1.02 + z, x: tx, y: ty, r: -tilt * 0.3 }, to: { s: 1.02, x: tx * 0.2 + sx, y: ty * 0.2, r: tilt } } };
}

/**
 * Hauptfunktion.
 * opts: {an, media, settings, overrides, chapters}
 * overrides: {clips: {[i]: {mediaId?, srcOffset?, trans?, speed?}}, texts: [], stickers: []}
 */
/**
 * Plan mit passender Schnittlänge: jede Aufnahme genau einmal – keine Wiederholungen, um Zeit zu füllen,
 * und nichts weglassen, solange es in die Höchstlänge passt. Sucht die Schnittlänge per Bisektion
 * (die Zahl der Einstellungen springt, weil z. B. Split-Screens mehrere Bilder zeigen) und verlängert
 * den Film bei Länge „Auto“ erst, wenn selbst die ruhige Mindestlänge nicht reicht.
 */
function buildPlan(opts) {
  let best = planOnce(opts);
  if (opts.flight) return best;
  const bad = (p) => p._m.repeats * 3 + p._m.dropped;
  const better = (p, q) => bad(p) < bad(q) || (bad(p) === bad(q) && !p._m.repeats && p._m.scale < q._m.scale);
  let cur = best;
  for (let ext = 0; ext < 3 && bad(best); ext++) {
    // Bisektion über die Schnittlänge bei dieser Filmlänge
    let lb = cur;
    const m0 = cur._m;
    let lo = m0.floor, hi = 5, cand = m0.scale;
    if (m0.repeats) lo = m0.scale; else hi = m0.scale;
    let pLo = cur._m.repeats ? cur : null, pHi = cur._m.repeats ? null : cur;
    for (let it = 0; it < 8 && bad(lb); it++) {
      cand = (lo + hi) / 2;
      const p = planOnce({ ...opts, settings: m0.settings, _scale: cand });
      if (better(p, lb)) lb = p;
      if (p._m.repeats) { lo = cand; pLo = p; } else { hi = cand; pHi = p; }
      if (hi - lo < 0.01) break;
    }
    // das Taktraster springt über die passende Zahl hinweg: einzelne Einstellungen teilen bzw. zusammenlegen
    const fine = (base, dir) => {
      for (let k = 1; k <= 6 && bad(lb); k++) {
        const p = planOnce({ ...opts, settings: m0.settings, _scale: base._m.scale, _adj: dir * k });
        if (better(p, lb)) lb = p;
        if (dir > 0 ? p._m.repeats : p._m.dropped) break;
      }
    };
    if (bad(lb) && pHi && pHi._m.dropped) fine(pHi, 1);
    if (bad(lb) && pLo) fine(pLo, -1);
    if (better(lb, best)) best = lb;
    // weiterhin Aufnahmen übrig, obwohl schon so dicht wie ruhig möglich: bei „Auto“ den Film verlängern
    const m = lb._m;
    if (!bad(best) || !m.dropped || m.repeats || opts.settings.length !== 'auto' || m.D >= m.max - 1) break;
    cur = planOnce({ ...opts, settings: { ...m.settings, _minT: m.D + Math.max(m.extraNeed, 1) }, _scale: m.scale });
    if (cur._m.D <= m.D + 0.05) break;
    if (better(cur, best)) best = cur;
  }
  return best;
}

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

  // Schnittpunkte, ausbalanciert gegen die Menge des Materials
  const fr = formatRule(s);
  const shotBase = fr.shot / 1.7;
  // Schnittlänge nach Material: Videos bekommen (fast) ihre ganze Länge, die übrige Zeit teilen sich die Fotos.
  // Viel Material → dichter (nie kürzer als shotMin), wenig Material → ruhiger statt Bilder zu wiederholen.
  const good = goodMedia(usable);
  const vidT = good.filter((m) => m.kind === 'video').reduce((a, m) => a + videoPlay(m, fr.vmax), 0);
  const imgN = Math.max(1, good.filter((m) => m.kind === 'image').length);
  const minShot = flight ? 0 : fr.shotMin * (settings.pace === 'schnell' ? 0.5 : 0.7);
  let segs = planCuts(an, win, s.pace, opts._scale || 1, shotBase, minShot);
  let usedScale = opts._scale || 1;
  // erste Schätzung; die Suche in buildPlan gibt die Schnittlänge danach direkt vor
  if (!flight && !opts._scale) {
    const imgTime = Math.max(barDur, D - Math.min(vidT, D * 0.7) - barDur);
    const haveShot = D / Math.max(1, segs.length), wantShot = imgTime / imgN;
    const scale = Math.max(fr.shotMin / fr.shot, Math.min(3, wantShot / haveShot));
    if (Math.abs(scale - 1) > 0.12) { segs = planCuts(an, win, s.pace, scale, shotBase, minShot); usedScale = scale; }
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
    const n = goodMedia(usable).length >= 9 ? 3 : 2;
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

  // Einstieg: Mindestdauer der ersten Einstellung
  const firstMin = knock || leader || reveal || intro === 'grid' ? 0 : intro === 'city' ? Math.min(D * 0.35, Math.max(2.4, barDur * 1.2)) : intro === 'cinema' ? Math.min(D * 0.35, Math.max(3.2, barDur * 1.6)) : intro === 'type' ? Math.min(D * 0.3, Math.max(1.8, barDur)) : intro === 'split' ? Math.min(D * 0.3, Math.max(2.2, barDur)) : Math.min(Math.max(1.3, barDur * 0.95), 2.8, D * 0.3);
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
        : reveal ? reveal.marks.map((m, i) => ({ start: m, end: i < reveal.marks.length - 1 ? reveal.marks[i + 1] : reveal.end, f: { reveal: true } })) : [];
  if (pre || mainPieces.length) {
    // nach der Aufblende bekommt das Highlight mindestens einen ganzen Takt
    const ok = forceStart([...(pre ? pre.pieces : []), ...mainPieces], reveal ? barDur : mainPieces.length ? 0 : firstMin);
    if (!ok) { pre = null; knock = null; leader = null; gridPlan = null; reveal = null; }
  }
  // Foto-Serie im Drop: ein Takt, jeder halbe Beat ein neues Bild
  // Einstiege mit fester Länge enden auf dem Drop: die Foto-Serie darf direkt dort beginnen
  const forced = segs.filter((g) => g.knock || g.leader || g.gridSeg || g.pre || g.reveal);
  // nach Raster und „Durch den Namen“ behält das freigelegte Bild seine volle Einstellung
  const lastForced = forced[forced.length - 1];
  const introEnd = !lastForced ? segs[0].end : lastForced.leader ? lastForced.end : (segs[forced.length] || lastForced).end;
  if (s.burst === 'drop' && !flight && goodMedia(usable).length >= 5) {
    const secs = (an.sections || []).map((x) => ({ ...x, rel: x.start - win.start }));
    const isPeak = (x) => x.label === 'drop' || x.label === 'chorus';
    let peak = secs.find((x) => isPeak(x) && x.rel > Math.max(1.2, introEnd - 0.05) && x.rel < D - 3);
    // läuft ein fester Einstieg schon in einen Drop hinein, beginnt die Serie direkt nach ihm
    const atIntro = forced.length ? secs.find((x) => x.rel <= introEnd + 0.05 && x.rel + (x.end - x.start) > introEnd + 1) : null;
    if (atIntro && isPeak(atIntro) && (!peak || peak.rel > introEnd + barDur * 2)) peak = { ...atIntro, rel: introEnd };
    if (peak) {
      const sub = beatDur / 2 >= 0.2 ? beatDur / 2 : beatDur;
      const ds = peak.rel, de = Math.min(D - 1.2, ds + sub * 8);
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
        const fixed = (x) => x && (x.burst || x.leader || x.knock || x.gridSeg || x.pre || x.reveal);
        if (fixed(g) || g.end - g.start >= 0.6) continue;
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
  const special = (g) => g.burst || g.leader || g.knock || g.gridSeg || g.gridMid || g.pre || g.reveal || g.vslot || g.miniRew || g.stackSeg;
  let midGrid = null;
  if (s.midGrid === 'on' && !flight && goodMedia(usable).length >= 5) {
    const busy = (a, b) => segs.some((g) => (g.burst || g.gridSeg || g.pre || g.reveal || g.leader || g.knock) && g.start < b && g.end > a);
    const peaks = secsRel.filter((x) => isPeakSec(x) && x.rel > Math.max(introEnd, barDur) + barDur);
    // ohne weiteren Refrain: Anfang einer Phrase (4 Takte) mitten im Drop/Refrain
    const phase = an.phrasePhase || 0;
    const phrases = (an.barStart || []).map((b, k) => ({ rel: b - win.start, k })).filter((x) => (x.k - phase) % 4 === 0 && x.rel > introEnd + barDur * 2 && isPeakSec(sectionAt(an, win.start + x.rel + 0.02)))
      .map((x) => ({ rel: x.rel, end: x.rel + barDur * 4, start: win.start + x.rel }));
    // bevorzugt der zweite Refrain (der erste gehört oft dem Einstieg oder der Foto-Serie)
    for (const pk of [...(peaks.length > 1 ? [peaks[1], peaks[0], ...peaks.slice(2)] : peaks), ...phrases]) {
      const n = goodMedia(usable).length >= 9 && pk.end - pk.start >= barDur * 4 ? 3 : 2;
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
        if (special(g) || g.end - g.start >= 0.6) continue;
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
      if (special(g) || g.end - g.start >= 0.6) continue;
      const prev = out[i - 1], next = out[i + 1];
      if (prev && !special(prev)) { prev.end = g.end; out.splice(i--, 1); } else if (next && !special(next)) { next.start = g.start; out.splice(i--, 1); }
    }
    segs = out;
  };
  // Einsätze: Drop/Refrain nach einem ruhigeren Teil, nicht im Einstieg und nicht ganz am Ende
  const hitsRel = secsRel.filter((x) => isPeakSec(x) && x.rel > introEnd + barDur * 1.5 && x.rel < D - barDur * 2 && !isPeakSec(sectionAt(an, x.start - 0.05)) && !(countIn && Math.abs(countIn.end - x.rel) < 0.2)).map((x) => x.rel);
  const overlapsSpecial = (a, z) => segs.some((g) => special(g) && g.start < z - 0.02 && g.end > a + 0.02);
  let miniAt = null;
  if (s.mini === 'on' && !flight && goodMedia(usable).length >= 6) {
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
  if (s.stack === 'on' && !flight && goodMedia(usable).filter((m) => m.kind === 'image').length >= 6) {
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
    const all = orderChrono(goodMedia(usable));
    // das vom Nutzer gewählte Startbild läuft als Einstieg, nicht zusätzlich auf einem eigenen Platz
    const vids = all.filter((m) => m.kind === 'video' && m.id !== settings.hookId);
    // erst nach dem Einstieg und seiner ersten Vollbild-Einstellung (dem Highlight)
    const afterIntro = segs[forced.length] ? segs[forced.length].end : segs[0] ? segs[0].end : 0;
    if (vids.length) segs = videoSlots(segs, an, win, vids, all, barDur, afterIntro, D, fr.vmax, s.ramp === 'drop');
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

  const clips = segs.map((g, i) => {
    const abs = win.start + g.start;
    const sec = sectionAt(an, abs + 0.01);
    return {
      i, start: g.start, end: g.end, label: sec.label, energy: sec.energy, weight: g.w, freezeAt: g.freezeAt, burst: !!g.burst, leader: !!g.leader, pre: g.pre || null, reveal: !!g.reveal, vid: g.vid || null, gridMid: g.gridMid || null, grid: !!g.gridMid, miniRew: !!g.miniRew, stack: g.stackSeg ? { times: g.stackSeg.times } : null,
      sectionChange: i > 0 && (an.sections || []).some((x) => Math.abs(x.start - abs) < 0.05),
      mediaId: null, role: 'normal',
    };
  });

  // Split-Screens festlegen (vor der Medienzuteilung, damit Material gezielt gewählt wird)
  const splitN = vertical ? (fmt.h / fmt.w > 1.5 ? 3 : 2) : 3;
  const splitFit = (m) => (vertical ? isLandscape(m) : isPortrait(m));
  const splitClips = [];
  // P: erste Einstellung des eigentlichen Einstiegs (nach dem Vorspann)
  const P = clips.filter((c) => c.pre).length;
  if (intro === 'split' && clips.length > 1) splitClips.push(0);
  if (gridPlan) clips[P].grid = true;
  if (outro === 'split' && clips.length > 2) splitClips.push(clips.length - 1);
  if (s.split !== 'off' && !flight) {
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
  } else {
    for (const c of clips) if (c.vid) mustIds.add(c.vid);
    // Polaroid-Stapel: vier Fotos aus der Zeit, in der der Stapel im Film liegt, vorab zurücklegen
    const stackC = clips.find((c) => c.stack);
    let reserved = [];
    if (stackC) {
      const imgsC = orderChrono(goodMedia(usable).filter((m) => m.kind === 'image' && !mustIds.has(m.id) && m.id !== settings.hookId));
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
    const hookAt = hook && intro !== 'split' ? (reveal ? P + clips.filter((c) => c.reveal).length : leader ? P + 3 : gridPlan ? P + 1 : P) : -1;
    const fixedIdx = (c) => c.i === hookAt || c.reveal || c.pre || c.miniRew || c.stack || (leader && c.i >= P && c.i < P + 3) || (gridPlan && c.i === P);
    const idxs = clips.map((c) => c.i).filter((i) => !(splitClips.includes(i) && i !== 0) && !clips[i].gridMid && !fixedIdx(clips[i]));
    if (order.length) assignStream(clips, idxs, hookAt >= 0 ? order.filter((m) => m !== hook) : order, byId);
    if (hookAt >= 0 && clips[hookAt]) clips[hookAt].mediaId = hook.id;
    if (hook && intro !== 'split' && clips[P]) { clips[P].mediaId = hook.id; clips[P].role = 'hook'; }
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
      if (x.mediaId && !x.grid && !x.split && !x.stack && !x.strip && !x.flightAnim) back.push(x.mediaId);
    }
    miniC.forEach((c, k) => { c.mediaId = back.length ? back[Math.min(k, back.length - 1)] : c.mediaId; c.role = 'rew'; });
    const hit = clips[f + miniC.length];
    const best = [hook, ...pool.filter((m) => m.kind === 'image' && !m.excluded && !m.bad).sort((a, b) => (b.score || 0) - (a.score || 0))].find((m) => m && m.kind === 'image');
    if (hit && best && !hit.vid && !hit.split && !hit.grid && !hit.stack) { hit.mediaId = best.id; hit.replay = true; }
  }

  // Split-Material zuteilen: bevorzugt passende Ausrichtung, wenig benutzt
  const useCount = new Map();
  for (const c of clips) if (c.mediaId) useCount.set(c.mediaId, (useCount.get(c.mediaId) || 0) + 1);
  for (const si of splitClips.sort((a, b) => a - b)) {
    const c = clips[si];
    // Videos mit eigenem Platz nicht zusätzlich im Split-Screen
    const pool2 = goodMedia(usable).filter((m) => !(m.kind === 'video' && clips.some((x) => x.vid === m.id)));
    const fitting = pool2.filter(splitFit);
    // nur Aufnahmen, die sonst nicht zu sehen sind (sonst wäre es eine Doppelung)
    const unusedFit = fitting.filter((m) => !useCount.get(m.id)), unused = pool2.filter((m) => !useCount.get(m.id));
    const src = (unusedFit.length >= 2 ? unusedFit : unused).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const ids = orderChrono(src.slice(0, splitN)).map((m) => m.id);
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
    const res0 = (c.stack.reserved || []).map((id) => byId.get(id)).filter((m) => m && !useCount.get(m.id));
    const free = res0.length >= 3 ? res0 : goodMedia(usable).filter((m) => m.kind === 'image' && !useCount.get(m.id)).sort((a, b) => (b.score || 0) - (a.score || 0));
    if (free.length < 3) {
      c.stack = null;
      const pick = goodMedia(usable).filter((m) => m.kind === 'image').sort((a, b) => (useCount.get(a.id) || 0) - (useCount.get(b.id) || 0) || (b.score || 0) - (a.score || 0))[0];
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

  const splitDone = clips.filter((c) => c.split).length;
  if (splitDone) dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `${splitDone} Split-Screen${splitDone > 1 ? 's' : ''}: ${vertical ? 'Queraufnahmen erscheinen übereinander' : 'Hochkant-Aufnahmen erscheinen nebeneinander'}, Bild für Bild im Takt.`);

  // Nutzer-Overrides
  const ov = overrides.clips || {};
  for (const c of clips) {
    const o = ov[c.i];
    if (o && o.mediaId && byId.has(o.mediaId)) { c.mediaId = o.mediaId; delete c.split; }
  }

  // Raster füllen (Einstieg und im Film): Zielbild in der Mitte (bzw. zuletzt), die übrigen nach Qualität und Nähe, Fotos bevorzugt
  const fillGrid = (gi, gp, intro) => {
    const c0 = clips[gi], next = clips[gi + 1];
    if (!c0 || !next) return;
    const target = byId.get(next.mediaId);
    const tiles = gp.n * gp.n;
    const pool2 = goodMedia(usable).filter((m) => m !== target && (m.kind === 'image' || m.poster));
    const tt = target && target.time ? target.time : 0;
    const others = pool2.sort((a, b) => (a.kind === 'image' ? 0 : 1) - (b.kind === 'image' ? 0 : 1) || (intro ? (b.score || 0) - (a.score || 0) : Math.abs((a.time || 0) - tt) - Math.abs((b.time || 0) - tt))).slice(0, tiles - 1);
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
    const fixedCut = A.split || B.split || A.grid || A.flightAnim || B.flightAnim || A.burst || B.burst || A.leader || A.pre || B.pre || A.reveal || A.miniRew || B.miniRew || A.stack || B.stack;
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
    if (fixedCut) tr = { type: TR.CUT, dur: 0, punch: false };
    // in den Polaroid-Stapel weich hinein; nach dem Mini-Rewind hart auf den Einsatz
    if (B.stack && !A.split && !A.grid && !A.burst) tr = { type: TR.DISSOLVE, dur: Math.min(beatDur, 0.45 * (A.end - A.start), 0.4 * (B.end - B.start)), punch: false };
    if (A.miniRew && !B.miniRew) tr = { type: TR.CUT, dur: 0, punch: true };
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
        // läuft (fast) ganz: Anfang so, dass der beste Moment sicher drin ist
        const hl = (m.highlights || []).map((h) => h.t - tIn).filter((t) => t >= 0 && t <= vd);
        const best = hl.length ? hl[0] : vd * 0.4;
        off = Math.min(Math.max(0, best - needS * 0.4), Math.max(0, vd - needS));
      }
      else if (c.role === 'takeoff') off = vd - needS - Math.min(1, vd * 0.05); // Abheben liegt meist gegen Ende
      else if (c.role === 'landing') off = Math.min(0.5, vd * 0.05);
      else {
        const hl = (m.highlights || []).map((h) => h.t);
        const used = videoCursor.get(m.id) || 0;
        const hlIn = hl.map((t) => t - tIn).filter((t) => t >= 0 && t <= vd);
        const center = hlIn.length ? hlIn[used % hlIn.length] : vd * 0.4;
        off = center - needS / 2;
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
      const mo = imageMotion(rng, m, outAspect, visDur, role, prevDir);
      prevDir = mo.dir;
      c.motion = mo.m;
      c.dir = mo.dir;
      if (framed) {
        // schwebt knapp innerhalb des Rahmens und wächst langsam: nichts vom Bild geht verloren
        c.contain = true;
        c.motion = { from: { s: 0.93, x: 0, y: 0 }, to: { s: 0.975, x: 0, y: 0 } };
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
        overlays.push({ type: 'knockout', text: c.chapter, sub: `${String(c.chapterNo).padStart(2, '0')} / ${String(chapterCount).padStart(2, '0')}`, geo: chIdx >= 0 ? geoFor(chIdx) : null, start: c.start, end: ze, zoomStart: zs, chapter: true });
        continue;
      }
    }
    overlays.push({ type: 'chapter', text: c.chapter, no: c.chapterNo, total: chapterCount, geo: chIdx >= 0 ? geoFor(chIdx) : null, start: st, end: Math.min(chEnd - 0.2, st + Math.min(chDur, 5)) });
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
    const fStart = Math.max(last.start + 0.3, D - Math.min(2.8, Math.max(1.8, barDur)));
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
  for (const c of clips) {
    if (c.punch) fx.push({ type: 'punch', start: c.start, end: c.start + 0.45, amp: 1 });
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
  const plain = clips.filter((c) => c.mediaId && !c.pre && !c.leader && !c.reveal && !c.grid && !c.burst && !c.split && !c.strip && !c.stack && !c.miniRew && !c.replay && !c.loop && !c.flightAnim);
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
  const capacity = { label: fr.label, story: fr.kind === 'story' && s.target !== 'reel' && s.format === '9:16', maxFilm: fr.max, vmax: fr.vmax, imgFit, images: good.filter((m) => m.kind === 'image').length, videos: good.length - good.filter((m) => m.kind === 'image').length, droppedIds, tooLong, repeats };
  if (!flight) {
    if (droppedIds.length) dir.notes.push(`${droppedIds.length} ${droppedIds.length === 1 ? 'Aufnahme passt' : 'Aufnahmen passen'} nicht mehr in ${capacity.story ? 'diese Story' : 'diesen Film'} (${fmtMS(D)}): zu diesem Song passen etwa ${imgFit} Fotos${capacity.videos ? ' neben den Videos' : ''}. Die schwächsten bleiben draußen, im Material markiert.${capacity.story ? ' Als Reel passen mehr.' : ''}`);
    for (const v of tooLong) dir.notes.push(`Video „${v.name}“ ist ${Math.round(v.dur)} s lang, im Film laufen höchstens ${Math.round(fr.vmax)} s: tippe es im Material an und wähle einen Ausschnitt.`);
    if (repeats) dir.notes.push(`Für die gewählte Länge sind es zu wenig Aufnahmen: ${repeats} ${repeats === 1 ? 'Einstellung wiederholt' : 'Einstellungen wiederholen'} ein Bild. Wähle die Länge „Auto“ oder füge Aufnahmen hinzu.`);
  }

  const extraNeed = droppedIds.reduce((a, id) => { const m = good.find((x) => x.id === id); return a + (m.kind === 'video' ? videoPlay(m, fr.vmax) : fr.shotMin); }, 0);
  return {
    _m: { repeats, dropped: droppedIds.length, scale: usedScale, floor: fr.shotMin / fr.shot, D, max: fr.max, settings, extraNeed },
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

function clipIndexAt(clips, t) {
  let lo = 0, hi = clips.length - 1;
  if (hi < 0) return -1;
  if (t < clips[0].start) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (clips[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** Sichtbare Ebenen bei t: {a, b, p, type} */
function layersAt(clips, t) {
  const i = clipIndexAt(clips, t);
  if (i < 0) return null;
  let c = clips[i];
  if (c.loop && i > 0) c = clips[i - 1];
  const idx = clips.indexOf(c);
  const next = clips[idx + 1], prev = clips[idx - 1];
  if (next && next.loop && c.tout && c.tout.dur > 0 && t >= c.end - c.tout.dur) {
    return { a: c, b: next, p: (t - (c.end - c.tout.dur)) / c.tout.dur, type: c.tout.type, dirSign: c.tout.dirSign || 1 };
  }
  if (next && !next.loop && c.tout && c.tout.dur > 0 && t >= c.end - c.tout.dur / 2) {
    return { a: c, b: next, p: (t - (c.end - c.tout.dur / 2)) / c.tout.dur, type: c.tout.type, dirSign: c.tout.dirSign || 1 };
  }
  if (prev && c.tin && c.tin.dur > 0 && t < c.start + c.tin.dur / 2) {
    return { a: prev, b: c, p: (t - (c.start - c.tin.dur / 2)) / c.tin.dur, type: c.tin.type, dirSign: c.tin.dirSign || 1 };
  }
  return { a: c, b: null, p: 0, type: TR.CUT };
}
