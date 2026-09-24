/* ============================================================
 * Auto-Regie: entscheidet Länge, Songausschnitt, Tempo, Look,
 * Bildrahmen, Split-Screens, Einstieg/Ende und Farbangleichung
 * aus Material und Songaufbau. Liefert Regie-Notizen in Klartext.
 * ============================================================ */

const FORMAT_RULES = {
  '9:16': { shot: 1.9, min: 8, max: 45, kind: 'story' },
  '4:5': { shot: 2.1, min: 10, max: 60, kind: 'post' },
  '16:9': { shot: 2.8, min: 15, max: 150, kind: 'film' },
  '2.39': { shot: 3.0, min: 15, max: 150, kind: 'film' },
};

const SEC_DE = { intro: 'Intro', verse: 'Strophe', build: 'Aufbau', chorus: 'Refrain', drop: 'Drop', break: 'Break', outro: 'Outro' };

function fmtMS(s) {
  s = Math.max(0, s);
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

function goodMedia(media) {
  return media.filter((m) => !m.bad && !m.loading && !m.excluded && (!m.dupOf || m.fav));
}

function isLandscape(m) { return m.w && m.h && m.w > m.h * 1.15; }
function isPortrait(m) { return m.w && m.h && m.h > m.w * 1.15; }

/** Anzahl sinnvoller Einstellungen, die das Material hergibt. */
function shotsAvailable(list) {
  let n = 0;
  for (const m of list) n += m.kind === 'video' ? Math.max(1, Math.min(3, (m.duration || 3) / 2.5)) : 1;
  return n;
}

/**
 * Songausschnitt, der zur Filmlänge passt und musikalisch Sinn ergibt:
 * beginnt auf einem Abschnitt oder einer Phrase, lässt den Refrain/Drop früh
 * kommen (bei kurzen Stories fast sofort) und endet auf einer Grenze.
 */
function smartWindow(an, T, lead = 0) {
  const first = Math.max(0, an.firstSound), last = Math.min(an.duration, an.lastSound + 0.2);
  const bars = an.barStart && an.barStart.length ? an.barStart : Array.from(an.beats).filter((_, i) => i % 4 === an.downPhase);
  const barDur = an.beatPeriod * 4;
  const secs = an.sections || [];
  const phase = an.phrasePhase || 0;
  const near = (t, list, tol) => list.some((x) => Math.abs(x - t) < tol);
  const secStarts = secs.map((s) => s.start);
  const phraseStarts = bars.filter((_, k) => (k - phase) % 4 === 0);
  const peaks = secs.filter((s) => s.label === 'drop' || s.label === 'chorus');
  const mu = T <= 12 ? 0.05 : T <= 20 ? 0.12 : T <= 40 ? 0.25 : 0.3;
  const ends = bars.concat(secs.map((s) => s.end), [last]);
  let best = null;
  const cands = [first].concat(bars.filter((b) => b > first + 0.05));
  for (const s of cands) {
    if (s + T * 0.75 > last + 0.01) break;
    // bestes Ende in der Nähe von s + T
    let e = null, eScore = -Infinity;
    for (const x of ends) {
      if (x < s + T * 0.8 || x > s + T * 1.25 || x > last + 0.01) continue;
      let sc = -Math.abs(x - (s + T)) / T;
      if (near(x, secStarts, 0.1) || Math.abs(x - last) < 0.3) sc += 0.3;
      else if (near(x, phraseStarts, 0.1)) sc += 0.15;
      if (sc > eScore) { eScore = sc; e = x; }
    }
    if (e == null) e = Math.min(last, s + T);
    const len = e - s;
    let en = 0, cnt = 0;
    for (let i = 0; i < an.beats.length; i++) if (an.beats[i] >= s && an.beats[i] < e) { en += an.energy[i]; cnt++; }
    en /= Math.max(1, cnt);
    let sc = en;
    // Höhepunkt früh im Film
    let peakBonus = 0;
    for (const p of peaks) {
      if (p.start < s - 0.05 || p.start > e - barDur) continue;
      if (lead > 0) {
        // Einstieg mit fester Länge (Raster): Höhepunkt genau nach dem Einstieg
        const dt = Math.abs(p.start - s - lead);
        peakBonus = Math.max(peakBonus, 1.1 * Math.exp(-(dt * dt) / (2 * 0.35 * 0.35)));
        continue;
      }
      const pos = (p.start - s) / len;
      peakBonus = Math.max(peakBonus, 0.7 * Math.exp(-((pos - mu) ** 2) / (2 * 0.13 * 0.13)));
    }
    if (!peaks.length) peakBonus = 0.2;
    sc += peakBonus;
    if (near(s, secStarts, 0.1) || Math.abs(s - first) < 0.2) sc += 0.25;
    else if (near(s, phraseStarts, 0.1)) sc += 0.15;
    else sc -= 0.1;
    sc += eScore * 0.8;
    const startSec = sectionAt(an, s + 0.05);
    if (startSec.label === 'outro' || startSec.label === 'break') sc -= 0.3;
    if (!best || sc > best.sc + 1e-6) best = { s, e, sc };
  }
  if (!best) best = { s: first, e: Math.min(last, first + T) };
  return { start: best.s, end: best.e };
}

function describeWindow(an, win) {
  const secs = (an.sections || []).filter((x) => x.end > win.start + 0.2 && x.start < win.end - 0.2);
  const barDur = an.beatPeriod * 4;
  const peak = secs.find((x) => (x.label === 'drop' || x.label === 'chorus') && x.start >= win.start - 0.05);
  const inPeak = secs.find((x) => (x.label === 'drop' || x.label === 'chorus') && x.start < win.start + 0.1 && x.end > win.start);
  let txt = `Song ${fmtMS(win.start)}–${fmtMS(win.end)}`;
  if (inPeak && Math.abs(inPeak.start - win.start) < 0.2) txt += `: startet direkt im ${SEC_DE[inPeak.label]}`;
  else if (peak) {
    const bars = Math.round((peak.start - win.start) / barDur);
    txt += bars <= 0 ? `: startet direkt im ${SEC_DE[peak.label]}` : `: ${SEC_DE[peak.label]} setzt nach ${bars} ${bars === 1 ? 'Takt' : 'Takten'} ein`;
  }
  const endSec = secs.find((x) => Math.abs(x.end - win.end) < 0.3);
  if (endSec) txt += `, endet mit dem ${SEC_DE[endSec.label] || 'Abschnitt'}`;
  return txt + '.';
}

/** Farb- und Helligkeitsangleichung je Aufnahme (Teil-Weißabgleich + Belichtung). */
function colorMatch(list) {
  const lumas = list.map((m) => m.luma).filter((v) => v > 0).sort((a, b) => a - b);
  const med = lumas.length ? lumas[Math.floor(lumas.length / 2)] : 0.45;
  const target = Math.max(0.36, Math.min(0.52, med));
  const corr = new Map();
  for (const m of list) {
    if (!m.avg || !(m.luma > 0)) { corr.set(m.id, [1, 1, 1]); continue; }
    const e = Math.max(0.8, Math.min(1.28, Math.pow(target / Math.max(0.05, m.luma), 0.55)));
    const mean = (m.avg[0] + m.avg[1] + m.avg[2]) / 3 || 1;
    const g = m.avg.map((c) => Math.max(0.93, Math.min(1.07, Math.pow(mean / Math.max(8, c), 0.28))));
    corr.set(m.id, g.map((v) => +(v * e).toFixed(3)));
  }
  return { corr, target };
}

function autoLook(list, format) {
  if (!list.length) return { look: 'natur', why: '' };
  let r = 0, b = 0, l = 0, c = 0, n = 0;
  for (const m of list) {
    if (!m.avg) continue;
    r += m.avg[0]; b += m.avg[2]; l += m.luma || 0.45; c += m.color || 0.5; n++;
  }
  if (!n) return { look: format === '16:9' || format === '2.39' ? 'kino' : 'natur', why: '' };
  r /= n; b /= n; l /= n; c /= n;
  const warm = (r - b) / 255;
  if (l < 0.3) return { look: 'blau', why: 'dein Material ist eher dunkel und abendlich' };
  if (warm > 0.13 && l > 0.38) return { look: 'golden', why: 'dein Material ist warm und sonnig' };
  if (c < 0.35) return { look: 'film', why: 'dein Material hat ruhige, zurückhaltende Farben' };
  if (format === '16:9' || format === '2.39') return { look: 'kino', why: 'Filmformat mit farbigem Material' };
  return { look: 'natur', why: 'dein Material hat kräftige, natürliche Farben' };
}

/**
 * Hauptentscheidung. s = gespeicherte Einstellungen (Werte oder 'auto').
 * Rückgabe: {rs, win, notes, corr}
 */
function direct(an, media, s, chapters, flight) {
  const notes = [];
  const rs = { ...s };
  const list = goodMedia(media);
  const all = media.filter((m) => !m.bad && !m.loading);
  const fr = FORMAT_RULES[s.format] || FORMAT_RULES['9:16'];
  const first = Math.max(0, an.firstSound), last = Math.min(an.duration, an.lastSound + 0.2);
  const songLen = last - first;
  const shots = shotsAvailable(list);
  const imgs = list.filter((m) => m.kind === 'image').length, vids = list.length - imgs;
  const sorted = all.length - list.length;

  // Länge
  let T;
  if (s.length === 'full') T = songLen;
  else if (s.length === 'auto') {
    if (chapters && chapters.length) T = Math.max(30, Math.min(120, shots * fr.shot * 0.8));
    else T = Math.max(fr.min, Math.min(fr.max, shots * fr.shot));
  } else T = +s.length;
  if (flight && s.length === 'auto') {
    // Takte: Abflug 2 · je Aufnahme an Bord 1 · Flug 2 · Landung 3
    const ex = Math.min(4, (flight.extraIds || []).length);
    T = Math.max(10, Math.min(45, (7 + ex) * an.beatPeriod * 4 + 0.5));
  }
  T = Math.min(T, songLen);

  // Songausschnitt
  let win;
  if (s.length === 'full' || s.songStart === 'start') {
    win = pickWindow(an, { length: s.length === 'full' ? 'full' : T, songStart: 'start' });
  } else if (s.songStart === 'auto' || s.songStart == null) {
    // Raster-Einstieg: der Zoom soll auf dem Drop/Refrain landen
    // Raster und Countdown: der Übergang ins erste Vollbild soll auf dem Drop/Refrain landen
    const step = an.beatPeriod < 0.42 ? 2 : 1;
    const lead = s.intro === 'grid' && list.length >= 4 ? (list.length >= 9 ? 9 : 4) * step * an.beatPeriod : s.intro === 'countdown' ? 3 * step * an.beatPeriod : 0;
    win = smartWindow(an, T, lead);
  } else {
    win = pickWindow(an, { length: T, songStart: s.songStart });
  }
  const D = win.end - win.start;

  if (list.length) {
    notes.push(`${list.length} ${list.length === 1 ? 'Aufnahme' : 'Aufnahmen'} (${imgs} ${imgs === 1 ? 'Foto' : 'Fotos'}, ${vids} ${vids === 1 ? 'Video' : 'Videos'}) ergeben einen Film von ${fmtMS(D)}${s.length === 'auto' ? ', passend zur Menge' : ''}.`);
  }
  if (sorted > 0) notes.push(`${sorted} ${sorted === 1 ? 'Aufnahme ist' : 'Aufnahmen sind'} doppelt, unscharf oder ausgeblendet und ${sorted === 1 ? 'bleibt' : 'bleiben'} draußen.`);
  notes.push(describeWindow(an, win));

  // Tempo
  if (s.pace === 'auto') {
    const density = shots / Math.max(1, D);
    let en = 0, cnt = 0;
    for (let i = 0; i < an.beats.length; i++) if (an.beats[i] >= win.start && an.beats[i] < win.end) { en += an.energy[i]; cnt++; }
    en /= Math.max(1, cnt);
    const busy = density > 0.8, energetic = en > 0.8 && density > 0.6;
    rs.pace = busy || energetic ? 'schnell' : density < 0.36 || en < 0.4 ? 'ruhig' : 'mittel';
    const why = rs.pace === 'schnell' ? (busy ? 'viel Material für die Länge' : 'ein energiegeladener Songteil') : rs.pace === 'ruhig' ? (en < 0.4 ? 'ein ruhiger Songteil, die Bilder bekommen Zeit' : 'wenig Material, die Bilder bekommen Zeit') : 'Material und Song halten sich die Waage';
    notes.push(`Schnitttempo ${rs.pace}: ${why}.`);
  }

  // Look
  if (s.look === 'auto') {
    const al = autoLook(list, s.format);
    rs.look = al.look;
    notes.push(`Look ${LOOKS[al.look].label}${al.why ? ': ' + al.why : ''}.`);
  }

  // Bildrahmen & Split-Screens
  const land = list.filter(isLandscape).length, port = list.filter(isPortrait).length;
  const vertical = s.format === '9:16' || s.format === '4:5';
  if (s.frame === 'auto') {
    rs.frame = vertical && list.length >= 4 && land / list.length >= 0.75 && D >= 18 ? 'band' : 'full';
    if (rs.frame === 'band') notes.push('Kinoband: Fast alles ist quer aufgenommen, deshalb bleibt der volle Bildausschnitt im Breitbild-Streifen erhalten.');
  }
  if (!vertical) rs.frame = 'full';
  const splitPool = vertical ? land : port;
  if (s.split === 'auto') rs.split = splitPool >= 5 && rs.frame === 'full' ? 'auto' : 'off';
  else if (s.split === 'more') rs.split = splitPool >= 3 && rs.frame === 'full' ? 'more' : 'off';
  else rs.split = 'off';

  // Einstieg & Ende
  const pick = (opts) => opts[(hashStr((s.title || '') + ':' + s.seed) >>> 0) % opts.length];
  const hasTitle = !!(s.title && s.title.trim()) && s.showTitle !== false;
  if (s.intro === 'auto') {
    if (chapters && chapters.length) rs.intro = 'cinema';
    else if (fr.kind === 'film') rs.intro = D >= 25 ? 'cinema' : 'type';
    else if (D <= 18) rs.intro = hasTitle ? 'city' : 'hook';
    else rs.intro = pick([hasTitle ? 'city' : 'hook', 'hook', 'type', ...(rs.split !== 'off' ? ['split'] : [])]);
  }
  if (flight) rs.intro = 'flight';
  if (rs.intro === 'grid' && list.length < 4) rs.intro = hasTitle ? 'city' : 'hook';
  if (rs.intro === 'knockout' && !hasTitle) rs.intro = 'hook';
  if (rs.intro === 'split' && splitPool < 3) rs.intro = 'hook';
  if (s.outro === 'auto') {
    if (fr.kind === 'film' || (chapters && chapters.length)) rs.outro = 'credits';
    else if (D <= 25) rs.outro = 'loop';
    else rs.outro = pick(['freeze', 'credits', 'loop']);
  }
  if (flight && s.outro === 'auto') rs.outro = 'freeze';
  if (rs.outro === 'split' && splitPool < 3) rs.outro = 'credits';

  const INTRO_DE = { countdown: 'Countdown wie im alten Kino, darunter blitzen deine Bilder in Schwarzweiß auf, auf dem Einsatz geht es in Farbe los', knockout: 'der Ortsname ist ein Fenster ins Bild, dann zoomt der Film durch die Buchstaben', flight: 'Abflug-Video, dann zeichnet sich deine Flugroute über dem Globus, danach die Landung', grid: 'neun Bilder in Schwarzweiß werden im Takt farbig, dann zoomt der Film ins mittlere Bild', city: 'dein stärkstes Bild mit dem Ortsnamen groß im Bild', cinema: fr.kind === 'film' ? 'Titelkarte auf Schwarz, dann blendet das erste Bild auf' : 'Titelkarte über dem abgedunkelten ersten Bild', hook: 'dein stärkstes Bild eröffnet, der Titel steht dezent unten', type: 'der Titel läuft Wort für Wort im Takt', split: 'drei Bilder öffnen den Film nacheinander im Split-Screen' };
  const OUTRO_DE = { credits: 'Abblende und Schlusstitel', loop: 'nahtloser Übergang zurück zum Anfang (Endlos-Loop)', freeze: 'Standbild, das in Schwarzweiß ausläuft', split: 'Split-Screen und harter Schnitt auf Schwarz' };
  if (s.intro === 'auto' || s.outro === 'auto') notes.push(`Einstieg: ${INTRO_DE[rs.intro]}. Ende: ${OUTRO_DE[rs.outro]}.`);

  const cm = colorMatch(all);
  if (list.length >= 2) notes.push('Helligkeit und Farbstich aller Aufnahmen sind aneinander angeglichen, damit der Film wie aus einem Guss wirkt.');

  win.fadeIn = win.start - first < 0.15 ? 0.02 : 0.012;
  win.fadeOut = rs.outro === 'loop' ? 0.25 : Math.min(1.8, D * 0.12);
  return { rs, win, notes, corr: cm.corr };
}
