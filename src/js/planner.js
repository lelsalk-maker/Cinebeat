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
const TR = { CUT: 0, DISSOLVE: 1, DIP: 2, ZOOM: 4, WHIP: 5, LEAK: 6, LUMA: 7, PUSH: 9 };
const TR_NAMES = { 0: 'Schnitt', 1: 'Blende', 2: 'Schwarzblende', 4: 'Zoom', 5: 'Wischer', 6: 'Lichtleck', 7: 'Lichtblende', 9: 'Schieben' };

const LOOKS = {
  natur: { label: 'Natürlich', blurb: 'Klare, echte Farben mit Tiefe', grade: { sat: 1.06, contrast: 0.22, temp: 0.03, split: 0.18, lift: 0.012, crush: 0.012, bw: 0, grain: 0.014, vig: 0.26, tint: [1, 1, 1], glow: 0.06, leak: 0 } },
  golden: { label: 'Golden Hour', blurb: 'Warmes Licht, weiche Lichter', grade: { sat: 1.1, contrast: 0.24, temp: 0.3, split: 0.35, lift: 0.02, crush: 0.02, bw: 0, grain: 0.018, vig: 0.3, tint: [1.02, 1, 0.96], glow: 0.2, leak: 0 } },
  kino: { label: 'Teal & Orange', blurb: 'Blockbuster-Kontrast', grade: { sat: 0.98, contrast: 0.36, temp: 0.08, split: 0.9, lift: 0.02, crush: 0.02, bw: 0, grain: 0.022, vig: 0.4, tint: [1, 1, 1], glow: 0.05, leak: 0 } },
  blau: { label: 'Blue Hour', blurb: 'Kühle Nacht, satte Tiefen', grade: { sat: 0.92, contrast: 0.34, temp: -0.22, split: 0.55, lift: 0.018, crush: 0.02, bw: 0, grain: 0.024, vig: 0.42, tint: [0.97, 1, 1.04], glow: 0.14, leak: 0 } },
  film: { label: 'Film 35', blurb: 'Analoges Korn, sanfte Farben', grade: { sat: 0.86, contrast: 0.16, temp: 0.22, split: 0.25, lift: 0.055, crush: 0.035, bw: 0, grain: 0.055, vig: 0.42, tint: [1.02, 0.99, 0.93], glow: 0.14, leak: 0.05 } },
  noir: { label: 'Noir', blurb: 'Schwarzweiß mit Charakter', grade: { sat: 0, contrast: 0.55, temp: 0, split: 0, lift: 0.02, crush: 0.02, bw: 1, grain: 0.05, vig: 0.5, tint: [1, 1, 1], glow: 0.05, leak: 0 } },
};

const FORMATS = {
  '9:16': { w: 9, h: 16, label: 'Story & Reel', short: 'Story', px: [1080, 1920] },
  '4:5': { w: 4, h: 5, label: 'Beitrag', short: 'Beitrag', px: [1080, 1350] },
  '16:9': { w: 16, h: 9, label: 'Film 16:9', short: 'Film', px: [1920, 1080] },
  '2.39': { w: 2.39, h: 1, label: 'Kino 2.39', short: 'Kino', px: [1920, 804] },
};
const BAND_ASPECT = 16 / 9; // Kinoband im Hochformat

const PACES = { ruhig: 1.45, mittel: 1, schnell: 0.7 };

function outputSize(format, quality) {
  const [w, h] = (FORMATS[format] || FORMATS['9:16']).px;
  if (quality === 'preview') {
    const s = 540 / Math.min(w, h);
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

function sectionAt(an, absT) {
  const secs = an.sections || [];
  for (const s of secs) if (absT >= s.start && absT < s.end) return s;
  return secs[secs.length - 1] || { start: 0, end: an.duration, label: 'verse', energy: 0.5 };
}

/** Songausschnitt nach Wunschlänge und fester Startwahl. */
function pickWindow(an, { length, songStart }) {
  const first = Math.max(0, an.firstSound), last = Math.min(an.duration, an.lastSound + 0.2);
  const bars = an.barStart && an.barStart.length ? an.barStart : Array.from(an.beats).filter((_, i) => i % 4 === an.downPhase);
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
function planCuts(an, win, pace, lengthScale, shotBase) {
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
  for (const a of an.accents || []) if (a.off && a.s > 0) add(a.t, 2.2);
  for (const s of secStarts) add(s, 12, true);
  for (const s of stops) add(s.end, 10, true);
  const pts = [{ t: 0, w: 0, forced: true }, ...Array.from(cands.values()).sort((a, b) => a.t - b.t), { t: D, w: 0, forced: true }];

  const minLen = Math.max(0.34, beatDur * 0.98);
  const maxLen = pace === 'ruhig' ? 7.5 : 6;
  const pf = PACES[pace] * lengthScale * (shotBase || 1);
  const tgt = (t) => {
    const abs = win.start + t;
    const sec = sectionAt(an, abs);
    const base = { intro: 2.5, verse: 2.0, build: 1.6, chorus: 1.15, drop: 0.95, break: 3.2, outro: 2.6 }[sec.label] || 1.9;
    let v = base * pf;
    if (sec.label === 'build') {
      const prog = Math.max(0, Math.min(1, (abs - sec.start) / Math.max(0.1, sec.end - sec.start)));
      v *= 1.4 - prog * 0.9;
    }
    if (sec.label === 'drop' && abs - sec.start < beatDur * 4.1) v = beatDur * (pace === 'ruhig' ? 2 : 1);
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
      let c = 4 * ((len - g) / g) ** 2 - 0.32 * pts[j].w;
      if (len < minLen) c += 50 + (minLen - len) * 100;
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
  const z = (role === 'burst' ? 0.09 : 0.07) * speed;
  if (fh < 0.72) {
    const down = prevDir === 'up' ? true : prevDir === 'down' ? false : rng() < 0.5;
    const a = Math.max(-1, Math.min(1, py + (down ? -0.55 : 0.55)));
    return { dir: down ? 'down' : 'up', m: { from: { s: 1.02, x: 0, y: a }, to: { s: 1.02 + z * 0.5, x: 0, y: py } } };
  }
  if (fw < 0.72) {
    const right = prevDir === 'left' ? true : prevDir === 'right' ? false : rng() < 0.5;
    const a = Math.max(-1, Math.min(1, px + (right ? -0.6 : 0.6)));
    return { dir: right ? 'right' : 'left', m: { from: { s: 1.02, x: a, y: 0 }, to: { s: 1.02 + z * 0.5, x: px, y: 0 } } };
  }
  const zin = prevDir === 'in' ? rng() < 0.35 : rng() < 0.72;
  const tx = px * 0.8, ty = py * 0.8;
  return zin
    ? { dir: 'in', m: { from: { s: 1.0, x: tx * 0.2, y: ty * 0.2 }, to: { s: 1 + z, x: tx, y: ty } } }
    : { dir: 'out', m: { from: { s: 1 + z, x: tx, y: ty }, to: { s: 1.0, x: tx * 0.2, y: ty * 0.2 } } };
}

/**
 * Hauptfunktion.
 * opts: {an, media, settings, overrides, chapters}
 * overrides: {clips: {[i]: {mediaId?, srcOffset?, trans?, speed?}}, texts: [], stickers: []}
 */
function buildPlan(opts) {
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
  const shotBase = (FORMAT_RULES[s.format] || FORMAT_RULES['9:16']).shot / 1.7;
  let segs = planCuts(an, win, s.pace, 1, shotBase);
  const M = Math.max(1, goodMedia(usable).length);
  if (segs.length > M * 1.7 && M < 40) segs = planCuts(an, win, s.pace, Math.min(2.2, segs.length / (M * 1.4)), shotBase);

  // Flug: Abflug (2 Takte) · Aufnahmen an Bord (je 1 Takt) · Fluganimation (2 Takte) · Landung (Rest)
  let flightRoles = null;
  if (flight) {
    const byIdF = new Map(pool.map((m) => [m.id, m]));
    const extras = (flight.extraIds || []).filter((id) => byIdF.has(id) && !byIdF.get(id).excluded).slice(0, 4);
    const dbs = an.beats.filter((_, i) => i % 4 === an.downPhase).map((b) => b - win.start).filter((t) => t > 0.3 && t < D - 0.3);
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
  let gridPlan = null;
  if (intro === 'grid') {
    const n = goodMedia(usable).length >= 9 ? 3 : 2;
    const step = beatDur < 0.42 ? 2 : 1;
    const bts = an.beats.map((b) => b - win.start).filter((t) => t >= -0.02 && t < D);
    const at = (k) => (bts[k] != null ? Math.max(0, bts[k]) : k * beatDur);
    const tiles = n * n;
    const times = Array.from({ length: tiles }, (_, k) => (k === 0 ? Math.min(0.12, at(0)) : at(k * step)));
    const zoomEnd = at(tiles * step);
    if (zoomEnd < D * 0.7) gridPlan = { n, times, zoomStart: times[tiles - 1], zoomEnd };
  }

  // „Durch den Namen“: Ortsname als Fenster ins Bild, dann Zoom durch die Buchstaben auf einen Beat
  let knock = null;
  if (intro === 'knockout') {
    const step = beatDur < 0.42 ? 2 : 1;
    const bts = an.beats.map((b) => b - win.start).filter((t) => t >= -0.02 && t < D);
    const at = (k) => (bts[k] != null ? Math.max(0, bts[k]) : k * beatDur);
    knock = { zoomStart: at(5 * step), end: at(6 * step) };
    if (knock.end > D * 0.6) knock = null;
  }

  // Countdown wie ein alter Filmvorspann: 3 · 2 · 1 auf den Beats, darunter wechseln Bilder in Schwarzweiß
  let leader = null;
  if (intro === 'countdown') {
    const step = beatDur < 0.42 ? 2 : 1;
    const bts = an.beats.map((b) => b - win.start).filter((t) => t >= -0.02 && t < D);
    const at = (k) => (bts[k] != null ? Math.max(0, bts[k]) : k * beatDur);
    leader = { marks: [0, at(step), at(2 * step)], end: at(3 * step) };
    if (leader.end > D * 0.5 || leader.marks[1] < 0.2) leader = null;
  }

  // Einstieg: Mindestdauer der ersten Einstellung
  const firstMin = knock || leader || intro === 'grid' ? 0 : intro === 'city' ? Math.min(D * 0.35, Math.max(2.4, barDur * 1.2)) : intro === 'cinema' ? Math.min(D * 0.35, Math.max(3.2, barDur * 1.6)) : intro === 'type' ? Math.min(D * 0.3, Math.max(1.8, barDur)) : intro === 'split' ? Math.min(D * 0.3, Math.max(2.2, barDur)) : Math.min(Math.max(1.3, barDur * 0.95), 2.8, D * 0.3);
  if (!flight && segs.length > 1 && segs[0].end < firstMin) {
    let k = 0;
    while (k < segs.length - 1 && segs[k].end < firstMin) k++;
    segs = [{ start: 0, end: segs[k].end, w: 0 }, ...segs.slice(k + 1)];
  }
  // Einstiege mit fester Länge: Schnitte genau auf die Beats legen, danach normal weiter
  const forceStart = (bounds, mark) => {
    const e = bounds[bounds.length - 1];
    if (e >= D - 1) return false;
    let k = segs.findIndex((g) => g.end > e + 0.05);
    if (k < 0) k = segs.length - 1;
    if (segs[k].end - e < Math.max(0.9, beatDur * 2) && k < segs.length - 1) k++;
    const head = bounds.slice(0, -1).map((b, i) => ({ start: b, end: bounds[i + 1], w: 0, [mark]: true }));
    segs = [...head, { start: e, end: Math.max(segs[k].end, e + 0.3), w: 10 }, ...segs.slice(k + 1)];
    return true;
  };
  if (knock && !forceStart([0, knock.end], 'knock')) knock = null;
  if (leader && !forceStart([...leader.marks, leader.end], 'leader')) leader = null;
  if (gridPlan && !forceStart([0, gridPlan.zoomEnd], 'gridSeg')) gridPlan = null;
  // Foto-Serie im Drop: ein Takt, jeder halbe Beat ein neues Bild
  // Einstiege mit fester Länge enden auf dem Drop: die Foto-Serie darf direkt dort beginnen
  const forced = segs.filter((g) => g.knock || g.leader || g.gridSeg);
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
        const fixed = (x) => x && (x.burst || x.leader || x.knock || x.gridSeg);
        if (fixed(g) || g.end - g.start >= 0.6) continue;
        const prev = out[i - 1], next = out[i + 1];
        if (prev && !fixed(prev)) { prev.end = g.end; out.splice(i--, 1); } else if (next && !fixed(next)) { next.start = g.start; out.splice(i--, 1); }
      }
      segs = out;
    }
  }
  // Ende: letzte Einstellung lang genug für Schlusstitel/Standbild
  const lastMin = outro === 'credits' ? Math.min(D * 0.3, Math.max(3.4, barDur * 1.5)) : outro === 'freeze' ? Math.min(D * 0.3, Math.max(2.6, barDur)) : outro === 'split' ? Math.min(D * 0.3, Math.max(2.2, barDur)) : 0;
  if (!flight && lastMin && segs.length > 2 && segs[segs.length - 1].end - segs[segs.length - 1].start < lastMin) {
    let k = segs.length - 1;
    while (k > 1 && D - segs[k].start < lastMin) k--;
    segs = [...segs.slice(0, k), { start: segs[k].start, end: D, w: segs[k].w }];
  }

  const clips = segs.map((g, i) => {
    const abs = win.start + g.start;
    const sec = sectionAt(an, abs + 0.01);
    return {
      i, start: g.start, end: g.end, label: sec.label, energy: sec.energy, weight: g.w, freezeAt: g.freezeAt, burst: !!g.burst, leader: !!g.leader,
      sectionChange: i > 0 && (an.sections || []).some((x) => Math.abs(x.start - abs) < 0.05),
      mediaId: null, role: 'normal',
    };
  });

  // Split-Screens festlegen (vor der Medienzuteilung, damit Material gezielt gewählt wird)
  const splitN = vertical ? (fmt.h / fmt.w > 1.5 ? 3 : 2) : 3;
  const splitFit = (m) => (vertical ? isLandscape(m) : isPortrait(m));
  const splitClips = [];
  if (intro === 'split' && clips.length > 1) splitClips.push(0);
  if (gridPlan) clips[0].grid = true;
  if (outro === 'split' && clips.length > 2) splitClips.push(clips.length - 1);
  if (s.split !== 'off' && !flight) {
    const every = s.split === 'more' ? 3 : 5;
    let since = every;
    for (const c of clips) {
      since++;
      if (c.i <= (gridPlan ? 1 : leader ? 3 : 0) || c.i === clips.length - 1 || splitClips.includes(c.i)) continue;
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
        const dt = Math.abs(clips[k].start - idealT);
        if (dt > Math.max(4, barDur * 2)) continue;
        const w = clips[k].weight + (clips[k].sectionChange ? 10 : 0) - dt * 2;
        if (w > bw) { bw = w; bi = k; }
      }
      if (bi < 0) { bi = prevB + 1; let bd = Infinity; for (let k = prevB + 1; k < clips.length - 1; k++) { const d = Math.abs(clips[k].start - idealT); if (d < bd) { bd = d; bi = k; } } }
      bounds.push(Math.max(prevB + 1, Math.min(clips.length - 1, bi)));
    }
    bounds.push(clips.length);
    for (let c = 0; c < chapters.length; c++) {
      const cnt = bounds[c + 1] - bounds[c];
      const sel = spreadSimilar(selectMedia(chapters[c].media, cnt, new Set()));
      for (let k = 0; k < cnt; k++) {
        order.push(sel.length ? sel[k % sel.length] : null);
        if (k === 0) { clips[bounds[c]].chapter = chapters[c].title; clips[bounds[c]].chapterNo = c + 1; clips[bounds[c]].role = 'chapter'; }
      }
    }
    for (let i = 0; i < clips.length; i++) clips[i].mediaId = order[i] ? order[i].id : null;
    hook = order[0];
  } else {
    const chosen = selectMedia(pool, clips.length - splitClips.length + 2, mustIds);
    hook = settings.hookId && byId.get(settings.hookId) ? byId.get(settings.hookId) : chosen.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
    const rest = spreadSimilar(chosen.filter((m) => m !== hook));
    order = hook ? [hook, ...rest] : rest;
    // zweitbestes Motiv auf den ersten Drop/Refrain
    const dropIdx = clips.findIndex((c) => (c.label === 'drop' || c.label === 'chorus') && c.sectionChange);
    if (dropIdx > 1 && rest.length > 2) {
      const best2 = rest.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      const at = order.indexOf(best2);
      if (at > 0) { order.splice(at, 1); order.splice(Math.min(dropIdx, order.length), 0, best2); }
    }
    let cur = 0;
    for (let i = 0; i < clips.length; i++) {
      if (splitClips.includes(i) && i !== 0) continue;
      let m = order.length ? order[cur % order.length] : null;
      cur++;
      const prevId = i > 0 ? clips[i - 1].mediaId : null;
      if (m && prevId === m.id && order.length > 1) { m = order[cur % order.length]; cur++; }
      clips[i].mediaId = m ? m.id : null;
    }
    if (hook && intro !== 'split') { clips[0].mediaId = hook.id; clips[0].role = 'hook'; }
    if (leader && hook && clips[3]) {
      // Nach dem Countdown kommt das stärkste Bild in Farbe; der Vorspann zeigt andere Motive
      const others = order.filter((m) => m && m !== hook);
      for (let i = 0; i < 3; i++) { clips[i].mediaId = others.length ? others[i % others.length].id : hook.id; clips[i].role = 'leader'; }
      clips[3].mediaId = hook.id; clips[3].role = 'hook';
    }
    if (gridPlan && hook && clips[1]) {
      // Das Zielbild des Rasters läuft nach dem Zoom als erste Vollbild-Einstellung weiter
      const was = clips[1].mediaId;
      clips[1].mediaId = hook.id; clips[1].role = 'hook';
      clips[0].mediaId = was && was !== hook.id ? was : clips[0].mediaId;
    }
  }

  // Split-Material zuteilen: bevorzugt passende Ausrichtung, wenig benutzt
  const useCount = new Map();
  for (const c of clips) if (c.mediaId) useCount.set(c.mediaId, (useCount.get(c.mediaId) || 0) + 1);
  for (const si of splitClips.sort((a, b) => a - b)) {
    const c = clips[si];
    const fitting = goodMedia(usable).filter(splitFit);
    const src = (fitting.length >= splitN ? fitting : goodMedia(usable)).slice().sort((a, b) => (useCount.get(a.id) || 0) - (useCount.get(b.id) || 0) || (b.score || 0) - (a.score || 0));
    const ids = orderChrono(src.slice(0, splitN)).map((m) => m.id);
    if (ids.length < 2) continue;
    for (const id of ids) useCount.set(id, (useCount.get(id) || 0) + 1);
    const bts = [];
    for (const b of an.beats) { const t = b - win.start; if (t >= c.start - 0.01 && t < c.end - 0.3) bts.push(t); }
    const reveal = ids.map((_, k) => (bts[k] != null ? bts[k] : c.start + k * beatDur));
    if (si === 0) reveal[0] = -1; // erstes Feld steht vom ersten Bild an, kein schwarzer Start
    c.split = { ids, orient: vertical ? 'stack' : 'row', reveal };
    c.mediaId = ids[0];
    // Split am Anfang: öffnet sich danach nicht, sondern schneidet hart weiter
  }

  const splitDone = clips.filter((c) => c.split).length;
  if (splitDone) dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `${splitDone} Split-Screen${splitDone > 1 ? 's' : ''}: ${vertical ? 'Queraufnahmen erscheinen übereinander' : 'Hochkant-Aufnahmen erscheinen nebeneinander'}, Bild für Bild im Takt.`);

  // Nutzer-Overrides
  const ov = overrides.clips || {};
  for (const c of clips) {
    const o = ov[c.i];
    if (o && o.mediaId && byId.has(o.mediaId)) { c.mediaId = o.mediaId; delete c.split; }
  }

  // Raster füllen: Zielbild in der Mitte (bzw. zuletzt), die übrigen nach Qualität, Fotos bevorzugt
  if (gridPlan && clips.length > 1) {
    const c0 = clips[0];
    const target = byId.get(clips[1].mediaId);
    const tiles = gridPlan.n * gridPlan.n;
    const others = goodMedia(usable).filter((m) => m !== target && (m.kind === 'image' || m.poster))
      .sort((a, b) => (a.kind === 'image' ? 0 : 1) - (b.kind === 'image' ? 0 : 1) || (b.score || 0) - (a.score || 0)).slice(0, tiles - 1);
    const center = gridPlan.n === 3 ? 4 : 3;
    const cells = orderChrono(others).map((m) => m.id);
    cells.splice(center, 0, target ? target.id : null);
    while (cells.length < tiles) cells.push(cells[cells.length % Math.max(1, cells.length)] || null);
    // Reihenfolge des Einfärbens: zufällig verteilt, Zielbild zuletzt
    const orderIdx = Array.from({ length: tiles }, (_, k) => k).filter((k) => k !== center);
    for (let k = orderIdx.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [orderIdx[k], orderIdx[j]] = [orderIdx[j], orderIdx[k]]; }
    orderIdx.push(center);
    const colorAt = new Array(tiles);
    orderIdx.forEach((cell, k) => { colorAt[cell] = gridPlan.times[k]; });
    c0.grid = { n: gridPlan.n, ids: cells, colorAt, target: center, zoomStart: gridPlan.zoomStart, zoomEnd: gridPlan.zoomEnd };
    c0.mediaId = target ? target.id : c0.mediaId;
    dir.notes.splice(Math.max(0, dir.notes.length - 1), 0, `Einstieg im ${gridPlan.n === 3 ? '9er' : '4er'}-Raster: die Bilder werden Beat für Beat farbig, dann zoomt der Film ins ${gridPlan.n === 3 ? 'mittlere' : 'letzte'} Bild${Math.abs(clips[1].start - gridPlan.zoomEnd) < 0.01 && clips[1].label !== clips[0].label ? ` und landet genau auf dem ${SEC_DE[clips[1].label] || 'Einsatz'}` : ''}.`);
  }

  // Übergänge
  for (let i = 1; i < clips.length; i++) {
    const A = clips[i - 1], B = clips[i];
    const stopEnd = (an.stops || []).some((x) => Math.abs(x.end - (win.start + B.start)) < 0.06);
    let tr = chooseTransition({
      labelA: A.label, labelB: B.label, sectionChange: B.sectionChange, weight: B.weight,
      peak: B.label === 'drop' || B.label === 'chorus', pace: s.pace, beatDur,
      lenA: A.end - A.start, lenB: B.end - B.start, stopEnd,
    }, rng);
    if (A.split || B.split || A.grid || A.flightAnim || B.flightAnim || A.burst || B.burst || A.leader) tr = { type: TR.CUT, dur: 0, punch: false };
    if (B.role === 'chapter') tr = { type: TR.DIP, dur: Math.min(beatDur * 1.5, 0.45 * (A.end - A.start), 0.45 * (B.end - B.start)), punch: false };
    const o = ov[B.i];
    if (o && o.trans != null) {
      const dur = o.trans === TR.CUT ? 0 : Math.min(beatDur * (o.trans === TR.DISSOLVE || o.trans === TR.LUMA || o.trans === TR.DIP || o.trans === TR.LEAK ? 1 : 0.5), 0.45 * (A.end - A.start), 0.45 * (B.end - B.start));
      tr = { type: dur < 0.1 ? TR.CUT : o.trans, dur: dur < 0.1 ? 0 : dur, punch: false };
    }
    B.tin = { type: tr.type, dur: tr.dur };
    B.punch = tr.punch;
    A.tout = B.tin;
  }
  if (clips.length) {
    clips[0].tin = { type: TR.CUT, dur: 0 };
    clips[clips.length - 1].tout = { type: TR.CUT, dur: 0 };
  }

  // Loop-Ende: letzter Wischer läuft ins erste Bild
  let loopClip = null;
  if (outro === 'loop' && clips.length > 1 && !clips[0].split) {
    const last = clips[clips.length - 1];
    const L = Math.min(beatDur * 0.5, (last.end - last.start) * 0.45);
    last.tout = { type: TR.WHIP, dur: L };
    loopClip = { ...clips[0], i: clips.length, start: D, end: D + 1, tin: last.tout, tout: { type: TR.CUT, dur: 0 }, loop: true, punch: false };
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
      const vd = Math.max(0.1, m.duration || visDur);
      let rate = 1;
      const withSound = m.sound > 0 && m.audio;
      if (o.speed) rate = o.speed;
      else if (withSound) rate = 1; // Originalton: kein Zeitlupen-Effekt, damit Ton und Bild zusammenpassen
      else if (c.label === 'break' && vd >= visDur * 0.5) rate = 0.5;
      else if ((c.label === 'intro' || c.label === 'outro' || s.pace === 'ruhig' || c.i === 0) && vd >= visDur * 0.75) rate = 0.75;
      let needS = visDur * rate;
      if (vd < needS) { rate = Math.max(0.5, vd / visDur); needS = visDur * rate; }
      let off;
      if (o.srcOffset != null) off = o.srcOffset;
      else if (c.role === 'takeoff') off = vd - needS - Math.min(1, vd * 0.05); // Abheben liegt meist gegen Ende
      else if (c.role === 'landing') off = Math.min(0.5, vd * 0.05);
      else {
        const hl = (m.highlights || []).map((h) => h.t);
        const used = videoCursor.get(m.id) || 0;
        const center = hl.length ? hl[used % hl.length] : vd * 0.4;
        off = center - needS / 2;
        videoCursor.set(m.id, used + 1);
      }
      c.srcOffset = Math.max(0, Math.min(off, Math.max(0, vd - needS)));
      c.rate = rate;
      if (withSound && Math.abs(rate - 1) < 0.01) {
        const t1 = Math.min(c.freezeAt != null ? c.freezeAt : c.visEnd, c.visStart + (vd - c.srcOffset));
        if (t1 - c.visStart > 0.15) voice.push({ mediaIndex: media.indexOf(m), mediaId: m.id, t0: Math.max(0, c.visStart), t1: Math.min(D, t1), src: c.srcOffset + Math.max(0, -c.visStart), gain: m.sound });
      }
      const fitFrac = srcAspect > outAspect ? outAspect / srcAspect : srcAspect / outAspect;
      c.contain = fitFrac < 0.5;
      const push = c.label === 'drop' || c.label === 'chorus' ? 0.025 : 0.045;
      c.motion = { from: { s: 1, x: 0, y: 0 }, to: { s: 1 + push, x: 0, y: 0 } };
    } else {
      c.srcOffset = 0; c.rate = 1; c.contain = false;
      const role = c.label === 'drop' || c.label === 'chorus' ? 'burst' : 'normal';
      const mo = imageMotion(rng, m, outAspect, visDur, role, prevDir);
      prevDir = mo.dir;
      c.motion = mo.m;
      c.dir = mo.dir;
    }
    if (c.tout && c.tout.type === TR.WHIP) c.tout.dirSign = c.dir === 'left' ? -1 : 1;
  }
  // nach dem Raster-Zoom: gleiches Bild, gleicher (zentrierter) Ausschnitt, dann sanfte Fahrt
  if (clips[0] && clips[0].grid && clips[1] && clips[1].motion) {
    const to = clips[1].motion.to;
    clips[1].motion = { from: { s: 1, x: 0, y: 0 }, to: { s: Math.max(1.04, to.s || 1), x: (to.x || 0) * 0.5, y: (to.y || 0) * 0.5 } };
    clips[1].contain = false;
  }
  if (loopClip) {
    const c0 = clips[0];
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
    if (t >= -0.01 && t <= D + 0.01) { beatsRel.push(t); downs.push(i % 4 === an.downPhase); beatEnergy.push(an.energy[i]); }
  }
  const beatsIn = (a, b) => beatsRel.filter((t) => t >= a - 0.01 && t < b);
  const tEnd = Math.min(D * 0.45, Math.max(2.6, barDur * 1.4));

  if (intro === 'cinema') {
    const cardEnd = Math.min(clips[0].end - 1.0, Math.max(2.2, barDur * 1.1));
    // Im Hochformat nie Schwarz: das Bild liegt abgedunkelt unter der Titelkarte
    if (vertical) {
      fx.push({ type: 'dim', start: 0, end: cardEnd + 0.9, amp: 0.62, fadeOut: 0.9 });
      fx.push({ type: 'blur', start: 0, end: cardEnd + 0.9, amp: 1, fadeOut: 0.9 });
    } else fx.push({ type: 'black', start: 0, end: cardEnd + 0.9, amp: 1, fadeOut: 0.9 });
    overlays.push({ type: 'titlecard', text: title, sub: subtitle, geo, start: 0.15, end: cardEnd + 0.2 });
  } else if (intro === 'city') {
    fx.push({ type: 'focus', start: 0, end: Math.min(0.7, beatDur * 1.3), amp: 0.8 });
    fx.push({ type: 'dim', start: 0, end: tEnd + 0.3, amp: 0.3, fadeOut: 0.6 });
    if (title) overlays.push({ type: 'city', text: title, sub: subtitle, geo, start: 0, end: tEnd });
  } else if (intro === 'hook') {
    if (outro !== 'loop') fx.push({ type: 'focus', start: 0, end: Math.min(0.6, beatDur * 1.2), amp: 1 });
    if (title) overlays.push({ type: 'lower', text: title, sub: subtitle, geo, start: Math.min(0.4, beatDur), end: tEnd });
  } else if (intro === 'type') {
    const end = Math.min(clips[0].end + (clips[1] ? (clips[1].end - clips[1].start) * 0.5 : 0), tEnd + barDur * 0.5);
    if (title) {
      overlays.push({ type: 'type', text: title, sub: subtitle, start: 0, end, beats: beatsIn(0, end - beatDur) });
      fx.push({ type: 'dim', start: 0, end, amp: 0.45, fadeOut: 0.5 });
    }
  } else if (flight) {
    const an0 = clips.find((c) => c.flightAnim);
    if (an0) overlays.push({ type: 'flight', flight, theme: s.mapTheme, ink: s.mapInk || '', land: s.mapLand, view: s.flightView, km: s.showStats !== false, start: Math.max(0, an0.start - 0.45), end: an0.end + 0.45 });
    const tk = clips.find((c) => c.role === 'takeoff'), ld = clips.find((c) => c.role === 'landing');
    if (title && tk && flight.from && flight.from.name) overlays.push({ type: 'lower', text: flight.from.name, sub: ['Abflug', flight.dep].filter(Boolean).join(' '), start: Math.min(0.4, beatDur), end: Math.min(tk.end - 0.5, Math.max(2.4, barDur * 1.2)) });
    if (title && ld && flight.to && flight.to.name) overlays.push({ type: 'lower', text: flight.to.name, sub: ['Ankunft', flight.arr].filter(Boolean).join(' '), start: ld.start + Math.min(0.8, beatDur * 1.5), end: Math.min(D - 0.3, ld.start + Math.max(2.6, barDur * 1.4)) });
  } else if (intro === 'countdown' && leader) {
    fx.push({ type: 'desat', start: 0, end: leader.end, amp: 1 });
    fx.push({ type: 'flash', start: leader.end, end: leader.end + 0.22, amp: 0.35 });
    fx.push({ type: 'punch', start: leader.end, end: leader.end + 0.45, amp: 1 });
    overlays.push({ type: 'leader', marks: leader.marks, start: 0, end: leader.end });
    if (title) overlays.push({ type: 'lower', text: title, sub: subtitle, geo, start: leader.end + Math.min(0.3, beatDur * 0.5), end: Math.min(D - 0.5, leader.end + Math.max(2.6, barDur * 1.3)) });
  } else if (intro === 'knockout' && knock) {
    if (title) overlays.push({ type: 'knockout', text: title, sub: subtitle, geo, start: 0, end: knock.end, zoomStart: knock.zoomStart });
  } else if (intro === 'grid' && clips[0].grid) {
    const g0 = clips[0].grid;
    if (title) overlays.push({ type: 'lower', text: title, sub: subtitle, geo, start: g0.zoomEnd + Math.min(0.3, beatDur * 0.5), end: Math.min(D - 0.5, g0.zoomEnd + Math.max(2.4, barDur * 1.2)) });
  } else if (intro === 'split') {
    if (title) overlays.push({ type: 'lower', text: title, sub: subtitle, geo, start: Math.max(0.6, (clips[0].split ? clips[0].split.reveal.slice(-1)[0] : 0) + 0.2), end: Math.min(D * 0.45, clips[0].end + barDur * 0.5), center: true });
  }

  // Kapitel (Gesamtfilm)
  const introOvEnd = Math.max(0, ...overlays.map((o) => o.end));
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
    overlays.push({ type: 'chapter', text: c.chapter, no: c.chapterNo, total: chapterCount, geo: chIdx >= 0 ? geoFor(chIdx) : null, start: st, end: Math.min(chEnd - 0.2, st + Math.max(2.4, barDur)) });
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

  return {
    duration: D, win, clips: all, visibleClips: clips.length,
    look: s.look, format: s.format, frame: s.frame, band, pace: s.pace, split: s.split, font: s.font || 'klassisch', motion: s.motion || 'ken', motionAmt: s.motionAmt || 'medium',
    intro, outro, fx, overlays, notes: dir.notes, resolved: s, voice,
    beats: beatsRel, downs, beatEnergy, beatDur,
    sections: (an.sections || []).filter((x) => x.end > win.start && x.start < win.end).map((x) => ({ ...x, start: Math.max(0, x.start - win.start), end: Math.min(D, x.end - win.start) })),
    usedMedia: new Set(clips.flatMap((c) => (c.split ? c.split.ids : c.grid ? c.grid.ids.concat([c.mediaId]) : [c.mediaId])).filter(Boolean)).size,
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
