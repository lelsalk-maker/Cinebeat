/* Planer · Grundlagen: Zufall, Looks, Formate, Übergangs-Typen, Takt- und Abschnittshilfen, Songausschnitt */
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
  if (!an._downSet) Object.defineProperty(an, '_downSet', { value: new Set(an.downIdx || Array.from(an.beats, (_, i) => i).filter((i) => i % 4 === 0)), enumerable: false });
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
