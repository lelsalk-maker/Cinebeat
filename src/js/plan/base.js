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
  // Diner: amerikanische Farbdias der 50er–70er, modern entwickelt – warmer Gelb-Rot-Braun-Stich, cremige Lichter,
  // bräunliche Schatten, leicht angehobenes warmes Schwarz, und die Farben des Bilds stechen heraus (retro)
  diner: { label: 'Diner', blurb: 'Amerika in den 50ern–70ern: warm, kräftige Farben', grade: { sat: 1.04, vib: 0.3, contrast: 0.36, temp: 0.2, sh: [0.045, 0.008, -0.02], hi: [0.05, 0.028, -0.04], lift: 0.028, crush: 0.03, bw: 0, grain: 0.028, vig: 0.3, tint: [1.03, 1.0, 0.92], glow: 0.2, leak: 0, retro: 1 },
    pal: { ink: '#f7ecd6', tone: [118, 54, 30] } },
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
/**
 * Kino-Rollladen: Ablauf in Zähleinheiten (ein Schlag, bei schnellen Songs zwei), alles auf den Schlägen des Songs
 * (er läuft von Anfang an unverändert, wie später mit der Instagram-Musik): sechs Ausschnitte erscheinen schwarzweiß
 * im halben Takt (0–2,5), werden in derselben Folge farbig (3–5,5), der Rollladen schließt in drei Zügen von oben
 * und unten (6, 7, 8), kurz Schwarz, Ortsname mit Koordinaten auf Schwarz (9); dann öffnet sich der Vorhang langsam
 * über den Aufbau bis zum Einsatz (Soll 24 = Refrain/Drop, sechs Takte nach dem ersten Bild; den echten Einsatz und den Beginn des Öffnens bestimmt das Lied,
 * siehe `introEntry`/`introTurn`).
 */
const SHUTTER = { tiles: [0, 0.5, 1, 1.5, 2, 2.5], colors: [3, 3.5, 4, 4.5, 5, 5.5], pulls: [6, 7, 8], black: 9, open: 15, end: 24 };
/**
 * Einstieg „Welcome to…“: Soll-Einsatz (Zählzeit 24 = sechs Takte nach dem ersten Bild) – die Regie legt den
 * Songausschnitt danach; den Ablauf selbst bestimmt `welcomeTimes` aus dem Lied.
 */
const WELCOME = { end: 24 };

function shutterStep(an) {
  return an.beatPeriod < 0.36 ? 2 : 1;
}

/**
 * „Welcome to…“ nach dem Lied (at: Zählzeit → Zeit auf den Schlägen, u: Länge einer Zählzeit):
 * Einsatz E = echter Refrain-/Drop-Anfang nahe Zählzeit 24; Schwarz P = Wendepunkt davor (Anfang des Aufbaus);
 * davor passende Ausschnitte, immer langsamer, und der Vorhang schließt in einer weichen Bewegung bis P;
 * auf Schwarz erscheint „Welcome to <Ort>“, der Vorhang öffnet sich wieder, und mit jedem Bildwechsel wechselt
 * die Schrift des Ortsnamens – im Takt, auf den letzten Zählzeiten im halben Takt bis in den Einsatz.
 */
function welcomeTimes(an, win, at, u) {
  const cnt = (t) => { let b = 0, d = Infinity; for (let x = 0; x < 120; x += 0.5) { const e = Math.abs(at(x) - t); if (e < d) { d = e; b = x; } else if (at(x) > t + u) break; } return b; };
  const E = introEntry(an, win, at(WELCOME.end), at(WELCOME.end - 4), at(WELCOME.end + 6));
  const xE = cnt(E);
  const P = introTurn(an, win, E, at(10), Math.max(at(10), E - Math.max(6 * u, 3.2)), at(xE - 9));
  const xP = Math.round(cnt(P));
  // Vorhang zu: knapp ein Takt (bei langsamen Zählzeiten drei), aber nie in die ersten Ausschnitte hinein
  const cd = Math.max(2, Math.min(u >= 0.55 ? 3 : 4, xP - 6));
  // auf: eine Zählzeit Schwarz mit dem Namen, dann öffnet er sich (bis zu einem Takt); die Wechsel beginnen offen
  const xO = xP + 1, od = Math.max(2, Math.min(4, Math.round((xE - xO) * 0.4)));
  const fonts = [];
  for (let x = Math.min(xO + od, xE - 2); x < xE - 1e-6; x += x >= xE - 2 ? 0.5 : 1) fonts.push(at(x));
  // Ausschnitte: rückwärts vom letzten (das durch das Schließen läuft) immer kürzer, in halben Zählzeiten
  const xC = xP - cd - 2;
  const pat = [2, 2, 1.5, 1.5, 1, 1, 1, 1, 1];
  let n = 0, sum = 0;
  while (n < pat.length && sum + pat[n] <= xC + 1e-6) sum += pat[n++];
  const f = n ? xC / sum : 1, starts = [];
  let x = xC;
  for (let k = 0; k < n; k++) { x -= pat[k] * f; starts.unshift(Math.max(0, Math.round(x * 2) / 2)); }
  starts[0] = 0;
  const clips = [...new Set([...starts, xC])].map((y) => (y ? at(y) : 0));
  return { E, P, clips, name: P, close: [at(xP - cd), P], open: [at(xO), at(xO + od)], fonts, end: E };
}

// Einstiege nach dem Lied (Kino-Rollladen, Welcome to…): Zeiten relativ zum Songausschnitt, auf echten Schlägen
function snapBeat(an, win, t) {
  let m = t, d = Infinity;
  for (const b of an.beats) { const x = Math.abs(b - win.start - t); if (x < d) { d = x; m = b - win.start; } }
  return m;
}
/** Einsatz eines Einstiegs: der echte Refrain-/Drop-Anfang nahe der Soll-Zeit (lo … hi), sonst die Soll-Zeit. */
function introEntry(an, win, nominal, lo, hi) {
  const c = (an.sections || []).filter((x) => (x.label === 'drop' || x.label === 'chorus') && x.start - win.start >= lo - 0.02 && x.start - win.start <= hi + 0.02)
    .map((x) => snapBeat(an, win, x.start - win.start)).sort((a, b) => Math.abs(a - nominal) - Math.abs(b - nominal));
  return c.length ? c[0] : nominal;
}
/**
 * Wendepunkt vor dem Einsatz E (lo … hi): wo der Anstieg in den Einsatz beginnt, sonst der Abschnittswechsel davor
 * (Strophe → Aufbau), sonst die Takt-Eins nahe pref – dort ändert sich auch die Musik.
 */
function introTurn(an, win, E, lo, hi, pref) {
  const rel = (x) => x - win.start, inR = (t) => t >= lo - 0.02 && t <= hi + 0.02;
  const r = (an.rises || []).find((x) => Math.abs(rel(x.end) - E) < 0.35 && inR(rel(x.start)));
  if (r) return snapBeat(an, win, rel(r.start));
  const near = (a, b) => Math.abs(a - pref) - Math.abs(b - pref);
  const sb = (an.sections || []).map((x) => rel(x.start)).filter((t) => inR(t) && t < E - 0.1).sort(near);
  if (sb.length) return snapBeat(an, win, sb[0]);
  const bars = Array.from(an.barStart || [], rel).filter(inR).sort(near);
  return bars.length ? bars[0] : snapBeat(an, win, Math.max(lo, Math.min(hi, pref)));
}

/**
 * Wie lange ein Einstiegs-Titel mindestens stehen muss (ab seinem Start): Wörter kommen auf den Schlägen, danach
 * Datum und Koordinaten (die Koordinaten schreiben sich ≈ 1 s aus, ein Kilometerzähler läuft danach noch ≈ 1 s).
 * Dann bleibt alles je nach Textmenge 1,2–2,6 s ruhig stehen, plus der Ausstieg (≈ 0,35 s).
 */
function titleReadTime(o, beatDur) {
  const step = beatDur < 0.36 ? beatDur * 2 : beatDur;
  const words = Math.max(1, String(o.text || '').trim().split(/\s+/).length);
  let done = step * words + 0.5 + (o.sub ? step : 0);
  const chars = String(o.text || '').length + String(o.sub || '').length + (o.geo ? 22 : 0);
  const hold = Math.min(2.6, 1.2 + chars * 0.03);
  if (o.geo) done = Math.max(done, o.geo.km != null ? Math.max(2.2, 0.9 / 0.55) : 1.2);
  let need = done + hold + 0.35;
  // Kilometerzähler: sein Einsatz hängt an der Titeldauer (45 %) – so lange, bis auch er gelesen werden kann
  if (o.geo && o.geo.km != null) need = Math.max(need, (0.9 + hold + 0.35) / 0.55);
  return need;
}

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

/** Akzentstärke (0…1) des Schlags, der bei Songzeit absT liegt (±⅓ Schlag); ohne Messung 0,5. */
function accentAt(an, absT) {
  const acc = an.accent, bt = an.beats;
  if (!acc || !bt || acc.length !== bt.length || !bt.length) return 0.5;
  let lo = 0, hi = bt.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (bt[m] < absT) lo = m + 1; else hi = m; }
  if (lo > 0 && Math.abs(bt[lo - 1] - absT) < Math.abs(bt[lo] - absT)) lo--;
  return Math.abs(bt[lo] - absT) < an.beatPeriod / 3 ? acc[lo] : 0.15;
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
