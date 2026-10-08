/* ============================================================
 * Auto-Regie: entscheidet Länge, Songausschnitt, Tempo, Look,
 * Bildrahmen, Split-Screens, Einstieg/Ende und Farbangleichung
 * aus Material und Songaufbau. Liefert Regie-Notizen in Klartext.
 * ============================================================ */

/**
 * Regeln je Ziel: shot = übliche Länge einer Foto-Einstellung, shotMin = kürzeste, die noch ruhig wirkt,
 * max = längster Film (Story: Instagram zeigt ein Video bis 60 s am Stück), vmax = längster Platz für ein Video.
 */
const FORMAT_RULES = {
  '9:16': { shot: 1.9, shotMin: 1.35, min: 8, max: 60, vmax: 7.5, kind: 'story', label: 'Story' },
  // Reels dürfen bei Instagram bis 3 Minuten lang sein
  reel: { shot: 1.9, shotMin: 1.35, min: 8, max: 180, vmax: 10, kind: 'story', label: 'Reel' },
  '4:5': { shot: 2.1, shotMin: 1.5, min: 10, max: 60, vmax: 8, kind: 'post', label: 'Beitrag' },
  // Filme dürfen so lang sein wie der Song (bis 10 min)
  '16:9': { shot: 2.8, shotMin: 2, min: 15, max: 600, vmax: 15, kind: 'film', label: 'Film' },
  '2.39': { shot: 3.0, shotMin: 2.2, min: 15, max: 600, vmax: 15, kind: 'film', label: 'Film' },
};
/**
 * Menge der Aufnahmen: 'auto' folgt „Alle Aufnahmen“/„Beste Auswahl“; 'mehr' nimmt alle guten Aufnahmen und jedes zweite
 * Serienbild, Videos etwas kürzer (mehr Zeit für Fotos); 'max' nimmt alle Serienbilder (als Foto-Serien im Takt), Videos noch kürzer.
 */
const mengeOf = (s) => (s && (s.menge === 'mehr' || s.menge === 'max') ? s.menge : 'auto');
/** Höchstlänge bei „Passend zum Material“: Reels 90 s (mit Menge „Mehr“/„So viele wie möglich“ bis 3 min), sonst das Format. */
const autoMax = (s) => (s.format === '9:16' && s.target === 'reel' && mengeOf(s) === 'auto' ? 90 : formatRule(s).max);
const allMediaOn = (s) => s.allMedia !== 'off' || mengeOf(s) !== 'auto';
const formatRule = (s) => {
  const r = s.format === '9:16' && s.target === 'reel' ? FORMAT_RULES.reel : FORMAT_RULES[s.format] || FORMAT_RULES['9:16'];
  const k = mengeOf(s) === 'max' ? 0.55 : mengeOf(s) === 'mehr' ? 0.75 : 1;
  return k === 1 ? r : { ...r, vmax: Math.max(3.5, r.vmax * k) };
};

const SEC_DE = { intro: 'Intro', verse: 'Strophe', build: 'Aufbau', chorus: 'Refrain', drop: 'Drop', break: 'Break', outro: 'Outro' };

function fmtMS(s) {
  s = Math.max(0, s);
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

/**
 * Aufnahmen, die sicher nicht in den Film gehören (auch bei „Alle Aufnahmen“): Bildschirmfotos,
 * fast schwarze oder ausgebrannte Bilder (Taschenauslöser), unscharf und zugleich schlecht belichtet,
 * und identische Serienbilder innerhalb weniger Sekunden. Liefert den Grund oder ''. Favoriten bleiben immer.
 */
/** keepBursts: true = alle Serienbilder behalten, 'half' = jedes zweite (fest nach Kennung), sonst aussortieren. */
function autoOut(m, keepBursts = false) {
  if (m.fav || m.kind !== 'image') return '';
  if (/^(screenshot|bildschirmfoto|screen shot)/i.test(m.name || '')) return 'Bildschirmfoto';
  if (m.expo != null && m.expo < 0.04 && (m.luma < 0.08 || m.luma > 0.94)) return m.luma < 0.5 ? 'fast schwarz' : 'überbelichtet';
  if (m.sharp != null && m.sharp < 0.03 && m.expo != null && m.expo < 0.35) return 'unscharf';
  if (keepBursts !== true && m.dupOf && m.dupD != null && m.dupD <= 2 && m.dupDt != null && m.dupDt < 20000 && !(keepBursts === 'half' && (hashStr(m.id) & 1) === 0)) return 'Serienbild';
  return '';
}

/** Serienbilder je Menge: 'max' alle, 'mehr' jedes zweite. */
const burstKeep = (all) => (all === 'max' ? true : all === 'mehr' ? 'half' : false);
/** Verwendbare Aufnahmen; all: auch Beinahe-Doppel, wenn alle Aufnahmen in den Film sollen; 'mehr'/'max': auch Serienbilder. */
function goodMedia(media, all) {
  return media.filter((m) => !m.bad && !m.loading && !m.excluded && (all ? !autoOut(m, burstKeep(all)) : !m.dupOf || m.fav));
}

function isLandscape(m) { return m.w && m.h && m.w > m.h * 1.15; }
function isPortrait(m) { return m.w && m.h && m.h > m.w * 1.15; }

/** Anzahl sinnvoller Einstellungen, die das Material hergibt. */
/** Zeit, die das Material braucht: Fotos je eine Einstellung, Videos (fast) ihre ganze Länge bis zum Videoplatz-Maximum. */
function materialTime(list, fr, paceF = 1) {
  let t = 0;
  for (const m of list) t += m.kind === 'video' ? videoPlay(m, fr.vmax) : fr.shot * paceF;
  return t;
}

/**
 * Songausschnitt, der zur Filmlänge passt und musikalisch Sinn ergibt:
 * beginnt auf einem Abschnitt oder einer Phrase, lässt den Refrain/Drop früh
 * kommen (bei kurzen Stories fast sofort) und endet auf einer Grenze.
 */
function smartWindow(an, T, lead = 0, maxLen = Infinity, minFrac = 0.8) {
  const first = Math.max(0, an.firstSound), last = Math.min(an.duration, an.lastSound + 0.2);
  const bars = an.barStart && an.barStart.length ? an.barStart : Array.from(an.beats).filter((_, i) => downSet(an).has(i));
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
      if (x < s + T * minFrac || x > s + T * 1.25 || x > last + 0.01 || x - s > maxLen + 0.01) continue;
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

/** Aufblende als Standard: bei Songs mit Höhepunkt (Drop/Refrain), nicht für Flüge, Kapitel-Filme und Kinoformat */
function autoReveal(an, chapters, flight, fr) {
  return !flight && !(chapters && chapters.length) && fr.kind !== 'film' && (an.sections || []).some((x) => x.label === 'drop' || x.label === 'chorus');
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

/**
 * Farb- und Helligkeitsangleichung je Aufnahme, wie ein Colorist: innerhalb einer Szene (zeitlich/örtlich zusammenhängend)
 * wird jede Aufnahme an die gemeinsame Stimmung der Szene angeglichen – ein warmer Abend bleibt warm, nur Ausreißer
 * (anderer Weißabgleich, Blitz, Gegenlicht) rücken heran. Zwischen Szenen gleicht nur die Helligkeit sanft an.
 * Helligkeit über eine Gammakurve (Mitteltöne, Lichter brennen nicht aus), Farbstich über kleine Kanal-Verstärkungen.
 * Rückgabe je Id: [r, g, b, gamma].
 */
function colorMatch(list) {
  const lumas = list.map((m) => m.luma).filter((v) => v > 0).sort((a, b) => a - b);
  const med = lumas.length ? lumas[Math.floor(lumas.length / 2)] : 0.45;
  const target = Math.max(0.36, Math.min(0.52, med));
  const corr = new Map();
  const cast = (m) => { const [r, g, b] = m.avg; return [r - g, (r + g) / 2 - b]; };
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  // Szenen in Aufnahme-Reihenfolge
  const ok = list.filter((m) => m.avg && m.luma > 0);
  const chrono = ok.slice().sort((a, b) => (a.time || 0) - (b.time || 0));
  const starts = typeof sceneStarts === 'function' ? sceneStarts(chrono) : new Set();
  const scenes = [];
  for (const m of chrono) { if (!scenes.length || starts.has(m.id)) scenes.push([]); scenes[scenes.length - 1].push(m); }
  for (const sc of scenes) {
    const cs = sc.map(cast);
    const rg0 = median(cs.map((c) => c[0])), yb0 = median(cs.map((c) => c[1]));
    const sl = median(sc.map((m) => m.luma));
    // Szenenhelligkeit halb zur Filmmitte: Nacht bleibt dunkler als Mittag, aber kein Sprung ins Schwarze
    const sceneT = Math.max(0.3, Math.min(0.56, sl * 0.5 + target * 0.5));
    for (let k = 0; k < sc.length; k++) {
      const m = sc[k], [rg, yb] = cs[k];
      // Stimmung der Szene, zum Teil in Richtung neutral (starker Gesamtstich einer ganzen Szene, z. B. Kunstlicht, wird gemildert)
      const trg = rg0 * 0.75, tyb = yb0 * 0.75;
      const nrg = rg + (trg - rg) * 0.6, nyb = yb + (tyb - yb) * 0.6;
      const mean = (m.avg[0] + m.avg[1] + m.avg[2]) / 3;
      const sum = (3 * mean + nyb) / 1.5, tb = sum / 2 - nyb;
      const want = [(sum + nrg) / 2, (sum - nrg) / 2, tb];
      const g = m.avg.map((c, i) => Math.max(0.93, Math.min(1.07, Math.pow(Math.max(8, want[i]) / Math.max(8, c), 0.8))));
      // Helligkeit: Gamma bringt die Mitteltöne zum Ziel (gedämpft), Verstärkung bleibt beim Farbstich
      const l = Math.max(0.05, Math.min(0.95, m.luma));
      const gam = Math.max(0.8, Math.min(1.25, Math.pow(Math.log(sceneT) / Math.log(l), 0.6)));
      const n = (g[0] + g[1] + g[2]) / 3;
      corr.set(m.id, [...g.map((v) => +(v / n).toFixed(3)), +gam.toFixed(3)]);
    }
  }
  for (const m of list) if (!corr.has(m.id)) corr.set(m.id, [1, 1, 1, 1]);
  return { corr, target };
}

/**
 * Stil des Lieds aus seinem Charakter (an.mood: Helligkeit, Druck, Dynamik, bei eigenen Beats Dur/Moll) und Tempo:
 * ruhig, treibend, episch, dunkel – daraus Look, Schnitttempo und Kamerabewegung.
 */
function songStyle(an) {
  const md = (an && an.mood) || {};
  // eigener Beat: die App kennt seine Stilrichtung
  const bc = md.style && typeof BEAT_CHAR !== 'undefined' && BEAT_CHAR[md.style];
  if (bc) return { calm: !!bc.calm, driving: !!bc.driving, dark: !!bc.dark, epic: !!bc.epic, label: bc.label, look: bc.look };
  const drive = md.drive != null ? md.drive : 0.5, bright = md.bright != null ? md.bright : 0.6, dyn = md.dyn != null ? md.dyn : 0.5;
  const bpm = (an && an.bpm) || 110;
  const calm = bpm < 88 || (drive < 0.4 && bpm < 100);
  const driving = !calm && drive >= 0.6 && bpm >= 108;
  const dark = md.minor != null ? md.minor >= 0.6 : bright < 0.42;
  const epic = !calm && !driving && dyn >= 0.62;
  const label = calm ? (dark ? 'ruhig und melancholisch' : 'ruhig und warm') : driving ? (dark ? 'treibend und dunkel' : 'treibend und hell') : epic ? 'episch, mit großem Aufbau' : dark ? 'atmosphärisch und dunkel' : 'hell und beschwingt';
  return { calm, driving, dark, epic, label, look: null };
}

function autoLook(list, format, an) {
  const st = an ? songStyle(an) : null;
  const base = autoLookMaterial(list, format);
  if (!st || !base.neutral) return base;
  // das Material lässt den Look offen: der Stil des Lieds entscheidet
  const film = format === '16:9' || format === '2.39';
  if (st.look) return { look: st.look === 'natur' && film ? 'kino' : st.look, why: `das Lied ist ${st.label}` };
  if (st.calm) return base.warm > 0.04 && !st.dark ? { look: 'golden', why: `das Lied ist ${st.label}, dein Material warm` } : { look: 'film', why: `das Lied ist ${st.label}: zurückhaltende Farben, feines Korn` };
  if (st.epic || st.dark) return { look: 'kino', why: `das Lied ist ${st.label}` };
  return { look: film ? 'kino' : 'natur', why: `das Lied ist ${st.label}: klare, kräftige Farben` };
}

function autoLookMaterial(list, format) {
  if (!list.length) return { look: 'natur', why: '', neutral: true, warm: 0 };
  let r = 0, b = 0, l = 0, c = 0, n = 0;
  for (const m of list) {
    if (!m.avg) continue;
    r += m.avg[0]; b += m.avg[2]; l += m.luma || 0.45; c += m.color || 0.5; n++;
  }
  if (!n) return { look: format === '16:9' || format === '2.39' ? 'kino' : 'natur', why: '', neutral: true, warm: 0 };
  r /= n; b /= n; l /= n; c /= n;
  const warm = (r - b) / 255;
  if (l < 0.3) return { look: 'blau', why: 'dein Material ist eher dunkel und abendlich', warm };
  if (warm > 0.13 && l > 0.38) return { look: 'golden', why: 'dein Material ist warm und sonnig', warm };
  if (c < 0.35) return { look: 'film', why: 'dein Material hat ruhige, zurückhaltende Farben', warm };
  if (format === '16:9' || format === '2.39') return { look: 'kino', why: 'Filmformat mit farbigem Material', neutral: true, warm };
  return { look: 'natur', why: 'dein Material hat kräftige, natürliche Farben', neutral: true, warm };
}

/**
 * Hauptentscheidung. s = gespeicherte Einstellungen (Werte oder 'auto').
 * Rückgabe: {rs, win, notes, corr}
 */
/**
 * Drei Varianten desselben Films. Sie füllen nur, was auf „Auto“ steht (eigene Entscheidungen bleiben),
 * und mischen mit eigenem Zufall, damit Bewegungen und Übergänge wirklich anders ausfallen.
 */
const VARIANTS = {
  ruhig: { label: 'Ruhig', set: { pace: 'ruhig', echo: 'off', mini: 'off', accent: 'off', drift: 'on', color: 'bloom', stack: 'on' }, intro: 'cinema', seed: 0x5a17 },
  ausgewogen: { label: 'Ausgewogen', set: {}, seed: 0 },
  energisch: { label: 'Energisch', set: { pace: 'schnell', echo: 'on', mini: 'on', accent: 'kick', drift: 'off', color: 'pop', stack: 'off' }, intro: 'rush', burst: true, seed: 0x3e9b },
};
/**
 * Effekte (`settings.effekte`): „schlicht“ (Standard) = der Film lebt vom Schnitt auf die Musik – keine automatischen
 * Effekt-Momente (Echo, Stapel, Mini-Rewind, Farbmoment, Zoom-Stöße, Drift, Tiefe, Datumsstempel), harte Schnitte auf den
 * Schlägen, weiche Blenden nur, wo der Song ruhig wird. „dezent“ = sparsam gesetzte Momente, „kreativ“ = mehr davon.
 * Was du selbst einschaltest, gilt immer.
 */
const effectsOf = (s) => (s.effekte === 'dezent' || s.effekte === 'kreativ' ? s.effekte : 'schlicht');
function withEffects(s) {
  if (effectsOf(s) !== 'schlicht' || s.mv === 'on') return s;
  const o = { ...s };
  for (const k of ['echo', 'stack', 'mini', 'parallax', 'drift', 'chapKnock', 'accent', 'color']) if (o[k] == null || o[k] === 'auto') o[k] = 'off';
  // (der Datumsstempel gehört zum Digicam-Look und bleibt dort)
  if ((o.stamp == null || o.stamp === 'auto') && o.look !== 'digicam') o.stamp = 'off';
  return o;
}

function withVariant(s) {
  const v = VARIANTS[s.variant];
  if (!v || s.variant === 'ausgewogen') return s;
  const o = { ...s, seed: ((s.seed >>> 0) ^ v.seed) >>> 0 };
  for (const [k, val] of Object.entries(v.set)) if (o[k] == null || o[k] === 'auto') o[k] = val;
  if (s.variant === 'ruhig' && o.motionAmt === 'medium') o.motionAmt = 'soft';
  if (s.variant === 'energisch' && o.motionAmt === 'medium') o.motionAmt = 'strong';
  // schlicht: die Variante bestimmt Tempo und Bewegung (energisch: Bilderflut im Drop), keine Effekt-Einstiege
  const simple = effectsOf(s) === 'schlicht';
  if (v.intro && o.intro === 'auto' && !(simple && v.intro === 'cinema')) o.intro = v.intro === 'cinema' && !(s.title && s.title.trim() && s.showTitle !== false) ? 'hook' : v.intro;
  if (v.burst && o.burst === 'off') { o.burst = 'drop'; if (!simple) o.ramp = 'drop'; }
  return o;
}

/**
 * Musikvideo: Mehrfachbelichtungen im Takt, Schwarzweiß mit Farbe auf dem Schlag, Echo und Bassdrum-Impulse,
 * ein Spiegelmoment und feiner Farbversatz auf den Kicks. Füllt nur, was auf Auto steht.
 */
function withMusicVideo(s) {
  if (s.mv !== 'on') return s;
  const o = { ...s, layers: 'on' };
  if (o.color == null || o.color === 'auto') o.color = 'pulse';
  if (o.echo == null || o.echo === 'auto') o.echo = 'on';
  if (o.parallax == null || o.parallax === 'auto') o.parallax = 'on';
  return o;
}

function direct(an, media, s, chapters, flight) {
  const notes = [];
  s = withMusicVideo(withVariant(withEffects(s)));
  const rs = { ...s };
  const listAll = allMediaOn(s) && !(chapters && chapters.length) && !flight;
  const list = goodMedia(media, listAll && mengeOf(s) !== 'auto' ? mengeOf(s) : listAll);
  const all = media.filter((m) => !m.bad && !m.loading);
  const fr = formatRule(s);
  const first = Math.max(0, an.firstSound), last = Math.min(an.duration, an.lastSound + 0.2);
  const songLen = last - first;
  // Tempo bestimmt mit, wie lange jedes Foto steht: ruhig länger, schnell kürzer (der Film wird entsprechend länger/kürzer)
  const need = materialTime(list, fr, s.pace === 'ruhig' ? 1.3 : s.pace === 'schnell' ? 0.75 : 1) + an.beatPeriod * 4;
  const imgs = list.filter((m) => m.kind === 'image').length, vids = list.length - imgs;
  const sorted = all.length - list.length;

  // Länge
  let T;
  if (s.length === 'full') T = songLen;
  else if (s.length === 'auto') {
    // Reisefilm (Kapitel): so lang wie der Song – die ganze Reise, jeder Ort mit seinen Höhepunkten
    if (chapters && chapters.length) T = Math.min(fr.max, songLen);
    // Reel „passend zum Material“: höchstens 90 s (länger nur, wenn gewählt – „Ganzer Song“ oder eine feste Länge bis 3 min)
    else T = Math.max(fr.min, Math.min(autoMax(s), need));
    // Nachplanung: länger als der vorige Versuch, damit die übrigen Aufnahmen Platz finden
    if (s._minT) T = Math.max(T, Math.min(autoMax(s), s._minT));
  } else T = +s.length;
  // Story: nie länger als Instagram am Stück zeigt
  if (fr.kind === 'story' && s.target !== 'reel' && s.format === '9:16') T = Math.min(T, fr.max);
  if (flight && s.length === 'auto') {
    // Takte: Abflug 2 · je Aufnahme an Bord 1 · Flug 2 · Landung 3
    const ex = Math.min(4, (flight.extraIds || []).length);
    T = Math.max(10, Math.min(45, (7 + ex) * an.beatPeriod * 4 + 0.5));
  }
  // Kino-Rollladen: der Einstieg bringt seine eigene Zeit mit (automatische Länge wächst um ihn)
  if ((s.intro === 'shutter' || s.intro === 'welcome') && !flight && (s.length === 'auto' || s.length == null)) T = Math.min(fr.max, T + (s.intro === 'welcome' ? WELCOME.end : SHUTTER.end) * shutterStep(an) * an.beatPeriod);
  T = Math.min(T, songLen);

  // Songausschnitt
  // Story: der ganze Song passt nicht in 60 s – dann der beste 60-s-Ausschnitt
  const storyCap = fr.kind === 'story' && s.target !== 'reel' && s.format === '9:16';
  // Instagram-Formate haben harte Grenzen (Story 60 s, Reel 3 min, Beitrag 60 s); nur der Film darf länger
  const hardCap = fr.kind !== 'film';
  // Reisefilm (Kapitel) bei „Auto“: der ganze Song
  const full = (s.length === 'full' || (chapters && chapters.length && s.length === 'auto')) && !(storyCap && songLen > fr.max);
  if (s.length === 'full' && !full) notes.push(`Eine Story zeigt höchstens ${fr.max} s am Stück: der Film nimmt den besten ${fr.max}-s-Ausschnitt. Den ganzen Song bekommst du als Reel.`);
  let win;
  if (full || s.songStart === 'start') {
    win = pickWindow(an, { length: full ? 'full' : T, songStart: 'start' });
  } else if (s.songStart === 'auto' || s.songStart == null) {
    // Raster-Einstieg: der Zoom soll auf dem Drop/Refrain landen
    // Raster und Countdown: der Übergang ins erste Vollbild soll auf dem Drop/Refrain landen
    const step = an.beatPeriod < 0.42 ? 2 : 1;
    const preLead = s.pre === 'countdown' && s.intro !== 'countdown' ? 3 : s.pre === 'rewind' ? 4 : 0;
    const willReveal = s.intro === 'reveal' || (s.intro === 'auto' && autoReveal(an, chapters, flight, fr));
    const lead = (s.intro === 'shutter' ? SHUTTER.end * shutterStep(an) * an.beatPeriod : s.intro === 'welcome' ? WELCOME.end * shutterStep(an) * an.beatPeriod : 0) + (willReveal ? revealBeats(an) * an.beatPeriod : 0) + (s.intro === 'grid' && list.length >= 4 ? (list.length >= 9 ? 9 : 4) * step * an.beatPeriod : s.intro === 'countdown' ? 3 * step * an.beatPeriod : 0) + (flight || s.intro === 'split' ? 0 : preLead * step * an.beatPeriod);
    // Nachplanung für mehr Material: das Ende darf nicht wieder auf dieselbe kürzere Stelle einrasten
    win = smartWindow(an, T, lead, hardCap ? fr.max : Infinity, s._minT ? 0.97 : 0.8);
  } else {
    win = pickWindow(an, { length: T, songStart: s.songStart });
  }
  // harte Grenze (Story, Reel, Beitrag), Ende auf einem Taktanfang davor
  // (auch bei genau der Grenze: das Ende muss auf einer Eins liegen, nicht mitten im Takt)
  if (hardCap && win.end - win.start > fr.max - 0.05) {
    const lim = win.start + fr.max + 0.02;
    const onBar = (an.barStart || []).some((b) => Math.abs(b - win.end) < 0.06);
    if (!onBar || win.end > lim) {
      const bar = Array.from(an.barStart || []).filter((b) => b > win.start + fr.max * 0.8 && b <= lim).pop();
      const beat = Array.from(an.beats || []).filter((b) => b > win.start + fr.max * 0.8 && b <= lim).pop();
      win = { ...win, end: bar || beat || Math.min(win.end, lim) };
    }
  }
  const D = win.end - win.start;

  if (list.length) {
    notes.push(`${list.length} ${list.length === 1 ? 'Aufnahme' : 'Aufnahmen'} (${imgs} ${imgs === 1 ? 'Foto' : 'Fotos'}, ${vids} ${vids === 1 ? 'Video' : 'Videos'}) ergeben einen Film von ${fmtMS(D)}${s.length === 'auto' ? ', passend zur Menge' : ''}.`);
  }
  if (sorted > 0) notes.push(`${sorted} ${sorted === 1 ? 'Aufnahme ist' : 'Aufnahmen sind'} doppelt, unscharf oder ausgeblendet und ${sorted === 1 ? 'bleibt' : 'bleiben'} draußen.`);
  notes.push(describeWindow(an, win));

  // Tempo
  if (s.pace === 'auto') {
    // Tempo folgt der Musik; wie viel Material in den Film passt, regelt die Schnittlängen-Suche des Planers
    let en = 0, cnt = 0;
    for (let i = 0; i < an.beats.length; i++) if (an.beats[i] >= win.start && an.beats[i] < win.end) { en += an.energy[i]; cnt++; }
    en /= Math.max(1, cnt);
    rs.pace = en > 0.8 ? 'schnell' : en < 0.4 ? 'ruhig' : 'mittel';
    // der Stil des Lieds zählt mit: ein ruhiges Lied schneidet ruhiger, ein treibendes nie träge
    const sty = songStyle(an);
    if (sty.calm && rs.pace === 'mittel') rs.pace = 'ruhig';
    else if (sty.driving && rs.pace === 'ruhig') rs.pace = 'mittel';
    const why = rs.pace === 'schnell' ? 'ein energiegeladener Songteil' : rs.pace === 'ruhig' ? 'ein ruhiger Songteil, die Bilder bekommen Zeit' : 'Song und Bilder halten sich die Waage';
    notes.push(`Schnitttempo ${rs.pace}: ${why}.`);
  }
  // Stil des Lieds: zu einem ruhigen Lied eine sanfte Kamera (eigene Wahl und Variante „Energisch“ bleiben)
  {
    const sty = songStyle(an);
    if (sty.calm && (rs.motionAmt || 'medium') === 'medium' && s.variant !== 'energisch') rs.motionAmt = 'soft';
    notes.push(`Stil des Lieds: ${sty.label}${sty.calm ? ' – ruhigere Schnitte, sanfte Kamerabewegung' : sty.driving ? ' – Schnitte auf den Schlägen, klare Bewegung' : ''}.`);
  }

  // Look
  if (s.look === 'auto') {
    const al = autoLook(list, s.format, an);
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
  // Querfotos in der Story: „Split-Screen“ = immer paarweise übereinander, „Gedreht“ kommt schon gedreht an (Hochkant)
  if (s.quer === 'split' && vertical) { rs.frame = 'full'; rs.split = 'more'; }
  else if (s.split === 'auto') rs.split = splitPool >= 5 && rs.frame === 'full' ? 'auto' : 'off';
  else if (s.split === 'more') rs.split = splitPool >= 3 && rs.frame === 'full' ? 'more' : 'off';
  else rs.split = 'off';

  // Einstieg & Ende
  const pick = (opts) => opts[(hashStr((s.title || '') + ':' + s.seed) >>> 0) % opts.length];
  const hasTitle = !!(s.title && s.title.trim()) && s.showTitle !== false;
  if (s.intro === 'auto') {
    // Standard: Aufblende, wenn der Höhepunkt im Ausschnitt genau nach dem kurzen Aufbau kommt
    const peakAt = win.start + revealBeats(an) * an.beatPeriod;
    const fits = autoReveal(an, chapters, flight, fr) && (an.sections || []).some((x) => (x.label === 'drop' || x.label === 'chorus') && Math.abs(x.start - peakAt) < an.beatPeriod * 0.6);
    // schlicht: immer derselbe ruhige Einstieg – euer stärkstes Bild mit dem Ort (im Film eine Titelkarte)
    if (effectsOf(s) === 'schlicht') rs.intro = chapters && chapters.length ? 'cinema' : fr.kind === 'film' && D >= 25 ? 'cinema' : hasTitle ? 'city' : 'hook';
    else if (fits) rs.intro = 'reveal';
    else if (chapters && chapters.length) rs.intro = 'cinema';
    else if (fr.kind === 'film') rs.intro = D >= 25 ? 'cinema' : 'type';
    else if (D <= 18) rs.intro = hasTitle ? 'city' : 'hook';
    else rs.intro = pick([hasTitle ? 'city' : 'hook', 'hook', 'type', ...(rs.split !== 'off' ? ['split'] : []), ...(list.length >= 12 && rs.pace !== 'ruhig' ? ['rush'] : [])]);
  }
  if (flight) rs.intro = 'flight';
  if (rs.intro === 'grid' && list.length < 4) rs.intro = hasTitle ? 'city' : 'hook';
  if (rs.intro === 'knockout' && !hasTitle) rs.intro = 'hook';
  if (rs.intro === 'split' && splitPool < 3) rs.intro = 'hook';
  if (rs.intro === 'rush' && list.filter((m) => m.kind === 'image').length < 6) rs.intro = 'hook';
  // Kino-Rollladen braucht ein paar Aufnahmen für die Wand und Platz bis zum Einsatz
  if (rs.intro === 'shutter' && (list.length < 3 || flight || D < SHUTTER.end * shutterStep(an) * an.beatPeriod + Math.max(3, an.beatPeriod * 8))) rs.intro = 'hook';
  // „Welcome to…“ braucht einen Ortsnamen, genug Material und Zeit für sechs Takte plus Film
  if (rs.intro === 'welcome' && (list.length < 4 || flight || !hasTitle || D < WELCOME.end * shutterStep(an) * an.beatPeriod + Math.max(3, an.beatPeriod * 8))) rs.intro = hasTitle ? 'city' : 'hook';
  if (rs.intro === 'welcome') rs.pre = 'off';
  if (s.outro === 'auto') {
    if (fr.kind === 'film' || (chapters && chapters.length)) rs.outro = 'credits';
    else if (D <= 25) rs.outro = 'loop';
    else rs.outro = effectsOf(s) === 'schlicht' ? 'credits' : pick(['freeze', 'credits', 'loop']);
  }
  if (flight && s.outro === 'auto') rs.outro = 'freeze';
  if (rs.outro === 'split' && splitPool < 3) rs.outro = 'credits';

  const INTRO_DE = { rush: 'eine Bilderflut: viele Bilder in einem Takt, immer schneller, dann steht das stärkste Bild, danach wird es ruhiger und im Drop wieder schneller', reveal: 'ein kurzer, ruhiger Aufbau aus Details deiner Bilder, auf dem Höhepunkt öffnet sich das stärkste Bild', countdown: 'Countdown wie im alten Kino, darunter blitzen deine Bilder in Schwarzweiß auf, auf dem Einsatz geht es in Farbe los', knockout: 'der Ortsname ist ein Fenster ins Bild, dann zoomt der Film durch die Buchstaben', flight: 'Abflug-Video, dann zeichnet sich deine Flugroute über dem Globus, danach die Landung', grid: 'neun Bilder in Schwarzweiß werden im Takt farbig, dann zoomt der Film ins mittlere Bild', city: 'dein stärkstes Bild mit dem Ortsnamen groß im Bild', cinema: fr.kind === 'film' ? 'Titelkarte auf Schwarz, dann blendet das erste Bild auf' : 'Titelkarte über dem abgedunkelten ersten Bild', hook: 'dein stärkstes Bild eröffnet, der Titel steht dezent unten', type: 'der Titel läuft Wort für Wort im Takt', split: 'drei Bilder öffnen den Film nacheinander im Split-Screen', shutter: 'Kino-Rollladen: sechs Hochkant-Aufnahmen erscheinen, der Rollladen schließt, der Ort erscheint, das Bild öffnet sich zum Song-Einsatz', welcome: '„Welcome to…“: passende Ausschnitte, immer ruhiger, der Ortsname in Gelb wechselt mit jedem Bild die Schrift, Balken schließen im Takt, auf dem Einsatz geht es mit einem Video los' };
  const OUTRO_DE = { strip: 'Filmstreifen, der rückwärts durch deinen Film läuft', credits: 'Abblende und Schlusstitel', loop: 'nahtloser Übergang zurück zum Anfang (Endlos-Loop)', freeze: 'Standbild, das in Schwarzweiß ausläuft', split: 'Split-Screen und harter Schnitt auf Schwarz' };
  if (s.intro === 'auto' || s.outro === 'auto') notes.push(`Einstieg: ${INTRO_DE[rs.intro]}. Ende: ${OUTRO_DE[rs.outro]}.`);

  // Stil-Regie: wenige, aufeinander abgestimmte Mittel statt „alles auf einmal“.
  // Durchgehend und dezent: Tiefe (Parallax), Drift in ruhigen Teilen, Bassdrum-Zoom im Drop.
  // Dazu je nach Filmlänge ein bis drei besondere Momente an den passenden Stellen im Song.
  const inWin = (t) => t >= win.start && t < win.end;
  const barDur = an.beatPeriod * 4;
  const kicksIn = Array.from(an.kicks || []).filter(inWin).length;
  const secsW = (an.sections || []).filter((x) => x.start > win.start + barDur * 1.5 && x.start < win.end - barDur * 2);
  const isPeak = (x) => x && (x.label === 'drop' || x.label === 'chorus');
  const hits = secsW.filter((x) => isPeak(x) && !isPeak((an.sections || [])[(an.sections || []).indexOf(x) - 1]));
  const calmLong = (an.sections || []).some((x) => (x.label === 'verse' || x.label === 'break' || x.label === 'intro') && Math.min(x.end, win.end) - Math.max(x.start, win.start) >= barDur * 3);
  const bwLook = (LOOKS[rs.look] && LOOKS[rs.look].grade.bw >= 0.9) || false;
  const imgs0 = list.filter((m) => m.kind === 'image').length;
  const auto = [];
  // fehlende Angaben (ältere Projekte) gelten als „Auto“
  for (const k of ['accent', 'parallax', 'drift', 'chapKnock', 'color', 'echo', 'stack', 'mini']) if (s[k] == null) s = { ...s, [k]: 'auto' };
  if (s.accent === 'auto') {
    rs.accent = !flight && kicksIn >= 8 && s.motion !== 'pulse' && s.motion !== 'snap' && rs.pace !== 'ruhig' ? 'kick' : 'off';
    rs.accentAuto = true;
    if (rs.accent !== 'off') auto.push('ein feiner Zoom-Impuls auf der Bassdrum im Drop');
  }
  if (s.parallax === 'auto') rs.parallax = flight ? 'off' : 'on';
  if (s.drift === 'auto') rs.drift = rs.pace === 'schnell' ? 'off' : 'on';
  if (s.chapKnock === 'auto') rs.chapKnock = chapters && chapters.length >= 2 && chapters.length <= 8 ? 'on' : 'off';
  const budget = flight || effectsOf(s) === 'schlicht' ? 0 : (D < 22 ? 1 : D < 45 ? 2 : 3) + (effectsOf(s) === 'kreativ' ? 1 : 0);
  let used = ['echo', 'stack', 'mini'].filter((k) => s[k] === 'on').length + (s.color && s.color !== 'auto' && s.color !== 'off' ? 1 : 0)
    + (s.midGrid === 'on' ? 1 : 0) + (s.midCount === 'drop' ? 1 : 0) + (s.burst === 'drop' ? 1 : 0);
  if (s.color === 'auto') {
    const colHits = (an.sections || []).filter((x, k, arr) => isPeak(x) && x.start > win.start + barDur * 0.9 && x.start < win.end - barDur && !isPeak(arr[k - 1]));
    const ok = !flight && !bwLook && s.midGrid !== 'on' && used < budget && (colHits.length || rs.intro === 'reveal' || D >= 20);
    rs.color = ok ? pick(colHits.length ? ['drop', 'bloom', 'steps', 'drop', 'sweep', ...(kicksIn >= 16 ? ['pulse'] : []), ...(rs.pace === 'schnell' ? ['strobe'] : [])] : ['bloom', 'sweep']) : 'off';
    rs.colorAuto = true;
    if (ok) used++;
  }
  // energiegeladen: Echo auf den starken Schlägen; ruhig: Polaroid-Stapel
  const lively = rs.pace !== 'ruhig' && kicksIn >= 16 && hits.length;
  for (const k of lively ? ['echo', 'stack', 'mini'] : ['stack', 'echo', 'mini']) {
    if (s[k] !== 'auto') continue;
    let ok = !flight && used < budget;
    if (k === 'echo') ok = ok && lively;
    if (k === 'stack') ok = ok && calmLong && imgs0 >= 10 && D >= 20;
    if (k === 'mini') ok = ok && hits.length >= (rs.color !== 'off' ? 2 : 1) && D >= 30 && list.length >= 8;
    rs[k] = ok ? 'on' : 'off';
    if (ok) used++;
  }
  const MOM = { echo: 'Echo auf starken Schlägen', stack: 'Polaroid-Stapel in einem ruhigen Teil', mini: 'Mini-Rewind vor einem Drop' };
  for (const k of ['echo', 'stack', 'mini']) if (s[k] === 'auto' && rs[k] === 'on') auto.push(MOM[k]);
  if (s.drift === 'auto' && rs.drift === 'on') auto.push('Drift-Übergänge in ruhigen Teilen');
  if (s.parallax === 'auto' && rs.parallax === 'on') auto.push('leichte Tiefe in den Kamerafahrten');
  if (auto.length) notes.push(`Stil: ${auto.join(', ')}. Bewusst sparsam, damit der Film wie aus einem Guss wirkt.`);
  else if (effectsOf(s) === 'schlicht' && !flight) notes.push('Schlicht: keine Effekte, der Film lebt vom Schnitt auf die Musik – harte Schnitte auf den Schlägen, weiche Blenden nur, wo der Song ruhig wird, ruhige Kamerafahrten.');

  const cm = colorMatch(all);
  if (list.length >= 2) notes.push('Farbe und Licht wie vom Coloristen: jede Szene behält ihre Stimmung, Ausreißer (Weißabgleich, Gegenlicht) sind angeglichen, helle Stellen bleiben erhalten.');

  win.fadeIn = win.start - first < 0.15 ? 0.02 : 0.012;
  win.fadeOut = rs.outro === 'loop' ? 0.25 : Math.min(1.8, D * 0.12);
  return { rs, win, notes, corr: cm.corr };
}
