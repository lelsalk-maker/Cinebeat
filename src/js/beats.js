/* ============================================================
 * Beat-Studio: eigene Beats, komplett auf dem Gerät erzeugt (Web Audio, OfflineAudioContext)
 * Jeder Beat ist ein Rezept (Stil, Tempo, Tonart, Zufallssamen, Form): gleiches Rezept = gleicher Ton, auf jedem
 * Gerät und in jedem Export. Aufbau (Intro, Strophe, Build, Drop, Break, Outro) und das Beat-Raster sind bekannt –
 * die Analyse bekommt die exakten Schläge, Takte und Abschnitte, der Schnitt sitzt auf den Sample genau.
 * Die Stile sind an Genres angelehnt (keine fremden Melodien): Hook-Motive erfindet der Zufallssamen.
 * ============================================================ */

const BEAT_STYLES = {
  sommer: {
    label: 'Sommerhaus', genre: 'Tropical House', desc: 'Marimba, Offbeat-Akkorde, Shaker – Sonne und Meer', bpm: [100, 112, 106], root: 57, mode: 'major',
    prog: [[5, 3], [3, 3], [0, 3], [4, 3]], kit: 'soft4', bass: 'sub', chords: 'offpluck', lead: 'marimba', pump: 0.45, swing: 0, color: '#e8b04a',
  },
  nacht: {
    label: 'Nachtfahrt', genre: 'Synthwave', desc: 'Achtziger-Arpeggios, Gated Snare, Neon', bpm: [100, 118, 110], root: 53, mode: 'minor',
    prog: [[0, 3], [5, 3], [2, 3], [6, 3]], kit: 'retro', bass: 'saw8', chords: 'pad', lead: 'arp', pump: 0.25, swing: 0, color: '#c05ad8',
  },
  lofi: {
    label: 'Goldene Stunde', genre: 'Lo-Fi Hip-Hop', desc: 'Warmes Rhodes, geswingte Drums, Knistern', bpm: [76, 90, 84], root: 50, mode: 'major',
    prog: [[1, 4], [4, 4], [0, 4], [5, 4]], kit: 'boombap', bass: 'soft', chords: 'rhodes', lead: 'bell', pump: 0, swing: 0.58, vinyl: true, color: '#d9a066',
  },
  stadt: {
    label: 'Stadtlichter', genre: 'Deep House', desc: 'Four-on-the-floor, Orgel-Stabs, rollender Bass', bpm: [118, 126, 122], root: 57, mode: 'minor',
    prog: [[0, 4], [3, 4], [0, 4], [6, 4]], kit: 'house', bass: 'roll', chords: 'stab', lead: 'chop', pump: 0.35, swing: 0, color: '#4a8fe8',
  },
  gipfel: {
    label: 'Gipfel', genre: 'Cinematic', desc: 'Trommeln, Streicher-Ostinato, Braam im Drop', bpm: [84, 96, 90], root: 50, mode: 'minor',
    prog: [[0, 3], [5, 3], [2, 3], [6, 3]], kit: 'epic', bass: 'sub', chords: 'strings', lead: 'horn', pump: 0, swing: 0, braam: true, color: '#8aa0b8',
  },
  glow: {
    label: 'Afterglow', genre: 'Future Bass', desc: 'Pumpende Supersaws, Halftime, Glitzer', bpm: [140, 156, 150], root: 54, mode: 'major',
    prog: [[3, 4], [4, 3], [2, 4], [5, 4]], kit: 'trap', bass: 'sub', chords: 'supersaw', lead: 'chip', pump: 0.75, swing: 0, color: '#f07aa8',
  },
  strand: {
    label: 'Strandbar', genre: 'Amapiano', desc: 'Log-Drum, Shaker, jazzige Klavierakkorde', bpm: [108, 116, 112], root: 55, mode: 'dorian',
    prog: [[0, 5], [3, 5], [0, 5], [4, 4]], kit: 'amapiano', bass: 'log', chords: 'piano', lead: 'flute', pump: 0.15, swing: 0.54, color: '#3fb9a0',
  },
  roadtrip: {
    label: 'Roadtrip', genre: 'Indie Pop', desc: 'Stampfen und Klatschen, Pluck, Pfeif-Melodie', bpm: [112, 126, 120], root: 55, mode: 'major',
    prog: [[0, 3], [4, 3], [5, 3], [3, 3]], kit: 'stomp', bass: 'warm', chords: 'strum', lead: 'whistle', pump: 0.1, swing: 0, color: '#9bc45a',
  },
  diner: {
    label: 'Diner Funk', genre: 'Disco Funk', desc: 'Slap-Bass, Clav, Streicher-Stabs – passt zum Diner-Look', bpm: [110, 122, 116], root: 52, mode: 'dorian',
    prog: [[0, 4], [3, 4], [0, 4], [3, 4]], kit: 'disco', bass: 'slap', chords: 'clav', lead: 'strings', pump: 0.1, swing: 0.52, color: '#e0703a',
  },
  // Trend-Stile (Reels/TikTok): sofort erkennbarer Groove, Hook schon im Intro, Ohrwurm-Sound als Hauptfigur
  drift: {
    label: 'Drift', genre: 'Drift Phonk', desc: 'Cowbell-Hook, verzerrter 808 mit Slides, Memphis-Hats – Tempo, Nacht, Straße', bpm: [118, 132, 126], root: 53, mode: 'phrygian',
    prog: [[0, 3], [0, 3], [5, 3], [1, 3]], kit: 'phonk', bass: '808slide', chords: 'pad', lead: 'cowbell', pump: 0, swing: 0, trend: true, color: '#c8404f',
  },
  bounce: {
    label: 'Bounce', genre: 'Jersey Club', desc: 'Hüpfende Kick-Salven, gepitchte Vocal-Chops, R&B-Akkorde', bpm: [136, 146, 140], root: 56, mode: 'minor',
    prog: [[5, 4], [3, 4], [0, 4], [4, 4]], kit: 'jersey', bass: '808', chords: 'rnb', lead: 'vox', pump: 0.2, swing: 0, trend: true, color: '#8c7cf5',
  },
  skyline: {
    label: 'Skyline', genre: 'UK Garage', desc: 'Zweischritt-Groove, Orgel-Stabs, Vocal-Chops – Stadt bei Nacht', bpm: [128, 136, 132], root: 53, mode: 'dorian',
    prog: [[0, 4], [3, 4], [5, 4], [4, 4]], kit: 'garage', bass: 'wob', chords: 'organ', lead: 'vox', pump: 0.3, swing: 0.6, trend: true, color: '#4cc3d4',
  },
  fiesta: {
    label: 'Fiesta', genre: 'Reggaeton', desc: 'Dembow-Rhythmus, Pluck-Hook, warme Flächen – Sommer, Party, Tanzfläche', bpm: [88, 100, 94], root: 57, mode: 'minor',
    prog: [[0, 3], [5, 3], [2, 3], [6, 3]], kit: 'dembow', bass: 'dembow', chords: 'pad', lead: 'pluck', pump: 0.15, swing: 0, trend: true, color: '#f0784a',
  },
};
/** Energie je Beat: Chill (reduziert), Vibe (Standard), Hype (mehr Schlagzeug, Fills, Hook doppelt, lauter). */
const BEAT_ENERGY = { chill: 'Chill', vibe: 'Vibe', hype: 'Hype' };

const BEAT_SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10] };
const BEAT_KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'H'];

/** Form je Zielformat: Abschnitte in Takten. `pre` = Takte bis zum ersten Drop (für den gewählten Einstieg). */
function beatForm(form, pre = 4) {
  const F = {
    story: [['intro', 2], ['build', 2], ['drop', 8], ['break', 2], ['drop', 4], ['outro', 2]],
    reel: [['intro', 4], ['verse', 4], ['build', 4], ['drop', 8], ['break', 4], ['build', 2], ['drop', 8], ['outro', 4]],
    film: [['intro', 4], ['verse', 8], ['build', 4], ['drop', 8], ['break', 4], ['verse', 4], ['build', 4], ['drop', 8], ['drop', 4], ['outro', 4]],
  };
  const f = (F[form] || F.reel).map((x) => x.slice());
  // der erste Drop kommt genau nach `pre` Takten (Intro wird länger oder kürzer, der Build bleibt)
  const firstDrop = f.findIndex((x) => x[0] === 'drop');
  const before = f.slice(0, firstDrop).reduce((a, x) => a + x[1], 0);
  if (pre > before) f[0][1] += pre - before;
  return f;
}

/** Welche Beats passen zu diesen Einstellungen (Look, Variante, Format, Musikvideo)? Beste zuerst, mit Begründung. */
/** Charakter jedes Beat-Stils für die Auto-Regie: passender Look (wenn das Material ihn offen lässt) und Stimmung. */
const BEAT_CHAR = {
  sommer: { look: 'golden', label: 'sonnig und leicht' },
  nacht: { look: 'blau', label: 'nächtlich, mit Neon-Glanz', dark: true },
  lofi: { look: 'film', label: 'ruhig und warm', calm: true },
  stadt: { look: 'kino', label: 'treibend und urban', driving: true, dark: true },
  gipfel: { look: 'kino', label: 'episch, mit großem Aufbau', epic: true, dark: true },
  glow: { look: 'natur', label: 'hell und euphorisch', driving: true },
  strand: { look: 'golden', label: 'warm und groovig' },
  roadtrip: { look: 'natur', label: 'hell und beschwingt' },
  diner: { look: 'diner', label: 'retro und funky', driving: true },
  drift: { look: 'kino', label: 'dunkel und treibend', driving: true, dark: true },
  bounce: { look: 'natur', label: 'treibend und verspielt', driving: true },
  skyline: { look: 'natur', label: 'urban und leicht' },
  fiesta: { look: 'golden', label: 'heiß und tanzbar', driving: true },
};

function suggestBeats(st = {}) {
  const score = {}, why = {};
  for (const k of Object.keys(BEAT_STYLES)) score[k] = 0;
  const add = (k, v, w) => { score[k] += v; if (w && !why[k]) why[k] = w; };
  const look = st.look, v = st.variant;
  if (look === 'diner') add('diner', 3, 'passt zum Diner-Look');
  if (look === 'golden') { add('sommer', 2, 'warm wie Golden Hour'); add('lofi', 1.5, 'warm wie Golden Hour'); }
  if (look === 'blau' || look === 'noir') { add('nacht', 2, 'kühl wie der Look'); add('gipfel', 1.5, 'groß und kühl wie der Look'); }
  if (look === 'digicam') add('nacht', 2, 'Retro wie Digicam');
  if (look === 'film' || look === 'kino') { add('gipfel', 2, 'filmisch wie der Look'); add('roadtrip', 1, 'passt zu Film-Farben'); }
  if (look === 'natur' || !look || look === 'auto') { add('roadtrip', 1, 'natürlich und leicht'); add('sommer', 1, 'natürlich und leicht'); }
  if (v === 'ruhig') { add('lofi', 2, 'ruhige Variante'); add('gipfel', 1, 'ruhige Variante'); add('sommer', 0.5); }
  if (v === 'energisch') { add('glow', 2, 'energische Variante'); add('stadt', 1.5, 'energische Variante'); add('strand', 0.5); }
  if (st.mv === 'on') { add('nacht', 1.5, 'Musikvideo-Stil'); add('glow', 1, 'Musikvideo-Stil'); }
  if (look === 'blau' || look === 'noir' || look === 'digicam') add('drift', 1.5, 'Nacht-Vibe wie der Look');
  if (look === 'golden' || look === 'natur' || !look || look === 'auto') { add('fiesta', 0.8, 'Sommer-Vibe'); add('skyline', 0.4, 'leicht und urban'); }
  if (v === 'energisch') { add('bounce', 2, 'energische Variante'); add('drift', 1.2, 'energische Variante'); }
  if (st.mv === 'on') { add('drift', 1.5, 'Musikvideo-Stil'); add('bounce', 1, 'Musikvideo-Stil'); }
  if (st.target === 'reel' || (st.format === '9:16' && st.target !== 'story')) { add('bounce', 0.9, 'Reel-Trend'); add('skyline', 0.6, 'Reel-Trend'); add('drift', 0.5, 'Reel-Trend'); }
  if (st.intro === 'shutter' || st.intro === 'cinema') add('gipfel', 1.5, 'Kino-Einstieg');
  if (st.target === 'story') { add('bounce', 0.5, 'Story-Trend'); add('glow', 0.5, 'knackig für Storys'); add('sommer', 0.5, 'leicht für Storys'); add('stadt', 0.5, 'treibt die Story an'); }
  const order = Object.keys(BEAT_STYLES).sort((a, b) => score[b] - score[a]);
  return order.map((k) => ({ id: k, why: why[k] || BEAT_STYLES[k].genre }));
}

/** Rezept aus Stil und Einstellungen: Tempo nach Variante, Form nach Ziel, Takte bis zum Drop nach Einstieg. */
function beatRecipe(styleId, st = {}, o = {}) {
  const S = BEAT_STYLES[styleId] || BEAT_STYLES.sommer;
  const [lo, hi, def] = S.bpm;
  const tempo = o.tempo || (st.variant === 'ruhig' ? 'ruhig' : st.variant === 'energisch' ? 'schnell' : 'normal');
  const bpm = Math.round(tempo === 'ruhig' ? lo + (def - lo) * 0.3 : tempo === 'schnell' ? def + (hi - def) * 0.8 : def);
  const form = o.form || (st.target === 'story' || (st.format === '9:16' && st.target !== 'reel' && st.length !== 'auto' && +st.length <= 30) ? 'story' : st.format === '16:9' ? 'film' : 'reel');
  // Kino-Rollladen: der Drop kommt nach 20 Zählzeiten (fünf Takte), sonst nach vier Takten Aufbau
  const pre = st.intro === 'shutter' ? Math.ceil((SHUTTER.end * (60 / bpm < 0.36 ? 2 : 1)) / 4) : 4;
  // Energie: aus der Variante (ruhig = Chill, energisch = Hype), sonst Vibe
  const energy = o.energy in BEAT_ENERGY ? o.energy : st.variant === 'ruhig' ? 'chill' : st.variant === 'energisch' ? 'hype' : 'vibe';
  return { v: 2, style: styleId in BEAT_STYLES ? styleId : 'sommer', bpm, root: S.root + (o.shift || 0), seed: (o.seed >>> 0) || 1, form, pre, tempo, energy };
}

const beatName = (r) => `${BEAT_STYLES[r.style].label}${r.v >= 2 && r.energy && r.energy !== 'vibe' ? ' ' + BEAT_ENERGY[r.energy] : ''} · ${r.bpm} BPM · ${BEAT_KEYS[((r.root % 12) + 12) % 12]}${BEAT_STYLES[r.style].mode === 'major' ? '-Dur' : '-Moll'}`;

/**
 * Beat erzeugen. Liefert { buffer, truth: { beats, barStart, sections, kicks, snares, bpm, t0, duration } }.
 * Alles entsteht in schnellem JavaScript (Oszillatoren mit Anti-Aliasing, Zustandsvariablen-Filter, Hüllkurven) in vier
 * Spuren – Schlagzeug, Musik, Hall-Anteil, Echo-Anteil – und wird ebenso gemischt: Hall, Echo im Takt, Filterfahrten
 * je Abschnitt, Sidechain-Pumpen, Kompressor, Limiter. Bit für Bit reproduzierbar, ein ganzer Song in Sekunden.
 * preview: Build + erster Drop (10 Takte) zum schnellen Vorhören.
 */
async function renderBeat(r, { preview = false, sampleRate = 44100 } = {}) {
  const S = BEAT_STYLES[r.style];
  const rng = mulberry32((r.seed * 7919 + S.label.length * 131) >>> 0);
  // Rezept v2: Energie, Hook-Teaser im Intro, Reverse-Becken vor dem Drop, Soft-Clipper (ältere Rezepte klingen unverändert)
  const v2 = (r.v || 1) >= 2, E = v2 ? r.energy || 'vibe' : 'vibe', hype = E === 'hype', chill = E === 'chill';
  const beat = 60 / r.bpm, bar = beat * 4, t0 = 0;
  let form = beatForm(r.form, r.pre);
  if (preview) form = [['build', 2], ['drop', 8]];
  const bars = form.reduce((a, x) => a + x[1], 0);
  const dur = t0 + bars * bar + bar + 2.2;
  const SR = sampleRate, N = Math.ceil(dur * SR);
  const dL = new Float32Array(N), dR = new Float32Array(N), mL = new Float32Array(N), mR = new Float32Array(N);
  const rv = new Float32Array(N), ec = new Float32Array(N);
  const kicks = [], snares = [];
  const TWO_PI = Math.PI * 2;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let nseed = 0x9e3779b9;
  const white = () => { nseed ^= nseed << 13; nseed ^= nseed >>> 17; nseed ^= nseed << 5; return ((nseed >>> 0) / 4294967296) * 2 - 1; };
  const panG = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];
  // Zustandsvariablen-Filter (TPT): stabil auch bei schnellen Filterfahrten
  const svf = () => ({ ic1: 0, ic2: 0, a1: 0, a2: 0, a3: 0, k: 1 });
  const svfSet = (F, fc, q) => { const g = Math.tan((Math.PI * Math.min(fc, SR * 0.45)) / SR); F.k = 1 / q; F.a1 = 1 / (1 + g * (g + F.k)); F.a2 = g * F.a1; F.a3 = g * F.a2; };
  const svfRun = (F, x, mode) => {
    const v3 = x - F.ic2, v1 = F.a1 * F.ic1 + F.a2 * v3, v2 = F.ic2 + F.a2 * F.ic1 + F.a3 * v3;
    F.ic1 = 2 * v1 - F.ic1; F.ic2 = 2 * v2 - F.ic2;
    return mode === 'low' ? v2 : mode === 'band' ? v1 : x - F.k * v1 - v2;
  };
  const blep = (t, dt) => { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; };
  const wave = (type, ph, dt) => {
    if (type === 'sine') return Math.sin(TWO_PI * ph);
    if (type === 'sawtooth') return 2 * ph - 1 - blep(ph, dt);
    if (type === 'square') return (ph < 0.5 ? 1 : -1) + blep(ph, dt) - blep((ph + 0.5) % 1, dt);
    return 4 * Math.abs(ph - 0.5) - 1;
  };
  const out = (to) => (to === 'drums' ? [dL, dR] : [mL, mR]);

  // ---------- Klangerzeuger ----------
  // Ton: Oszillatoren (verstimmt, im Stereobild verteilt) → Tiefpass mit Hüllkurve → Lautstärke-Hüllkurve
  const voice = (t, len, midi, vol, o = {}) => {
    const { type = 'sawtooth', cut = 2400, cutEnd = null, q = 0.8, a = 0.005, d = 0.2, s = 0.6, rl = 0.12, det = [0], to = 'music', send = 0, echoSend = 0, vib = 0, glide = 0, pan = 0 } = o;
    const i0 = Math.max(0, Math.round(t * SR)), total = len + rl * 2.2, n = Math.min(N - i0, Math.ceil(total * SR));
    if (n <= 0) return;
    const [L, R] = out(to);
    const f0 = mtof(midi), peak = vol / Math.sqrt(det.length);
    const oscs = det.map((c, k) => ({ ph: rng(), f: f0 * Math.pow(2, c / 1200), pan: det.length > 1 ? pan + (k / (det.length - 1) - 0.5) * 0.9 : pan }));
    const F = det.map(() => svf());
    const cutT = Math.max(0.02, Math.min(len, d * 2));
    const tcD = d / 3, tcR = rl / 3;
    const envLen = s + (1 - s) * Math.exp(-Math.max(0, len - a) / tcD);
    const gs = oscs.map((x) => panG(Math.max(-1, Math.min(1, x.pan))));
    for (let j = 0; j < n; j++) {
      const x = j / SR;
      if (j % 16 === 0) {
        const fc = cutEnd == null ? cut : cut * Math.pow(cutEnd / cut, Math.min(1, x / cutT));
        for (const f of F) svfSet(f, fc, q);
      }
      const env = x < a ? x / a : x < len ? s + (1 - s) * Math.exp(-(x - a) / tcD) : envLen * Math.exp(-(x - len) / tcR);
      let fm = 1;
      if (glide) fm *= Math.pow(2, (glide * Math.exp(-x / 0.02)) / 12);
      if (vib) fm *= Math.pow(2, (vib * Math.sin(TWO_PI * 5.2 * x) * Math.min(1, x / 0.25)) / 1200);
      let sl = 0, sr = 0, mono = 0;
      for (let k = 0; k < oscs.length; k++) {
        const oc = oscs[k], dt = (oc.f * fm) / SR;
        const v = svfRun(F[k], wave(type, oc.ph, dt), 'low');
        oc.ph += dt; if (oc.ph >= 1) oc.ph -= 1;
        sl += v * gs[k][0]; sr += v * gs[k][1]; mono += v;
      }
      const g = peak * env, i = i0 + j;
      L[i] += sl * g; R[i] += sr * g;
      if (send) rv[i] += mono * g * send;
      if (echoSend) ec[i] += mono * g * echoSend;
    }
  };
  // FM-Klang (Rhodes, Glocke, Marimba, Klavier): Träger mit abklingendem Modulationsindex
  const fmv = (t, len, midi, vol, ratio = 1, index = 1.5, decay = 1.2, send = 0.25, pan = 0) => {
    const i0 = Math.max(0, Math.round(t * SR)), T = Math.max(len, decay), n = Math.min(N - i0, Math.ceil((T + 0.02) * SR));
    if (n <= 0) return;
    const f = mtof(midi), [gl, gr] = panG(pan), kd = 9.2 / T;
    let pc = rng(), pm = 0;
    for (let j = 0; j < n; j++) {
      const x = j / SR;
      const I = index * (0.15 + 0.85 * Math.exp(-x / (decay * 0.25)));
      const v = Math.sin(TWO_PI * pc + I * Math.sin(TWO_PI * pm));
      pc += f / SR; pm += (f * ratio) / SR; if (pc >= 1) pc -= 1; if (pm >= 1) pm -= 1;
      const g = vol * Math.min(1, x / 0.004) * Math.exp(-x * kd), i = i0 + j;
      mL[i] += v * g * gl; mR[i] += v * g * gr;
      if (send) rv[i] += v * g * send;
    }
  };
  // Rauschen durch ein Filter (Hi-Hat, Snare, Klatschen, Shaker, Becken)
  const nz = (t, len, mode, freq, q, vol, o = {}) => {
    const { to = 'drums', attack = 0.002, send = 0, pan = 0, hold = 0, sweepTo = null } = o;
    const i0 = Math.max(0, Math.round(t * SR)), n = Math.min(N - i0, Math.ceil((len + 0.01) * SR));
    if (n <= 0) return;
    const [L, R] = out(to), [gl, gr] = panG(pan), F = svf();
    svfSet(F, freq, q);
    const kd = 9.2 / Math.max(0.005, len - hold);
    for (let j = 0; j < n; j++) {
      const x = j / SR;
      if (sweepTo && j % 32 === 0) svfSet(F, freq * Math.pow(sweepTo / freq, x / len), q);
      const v = svfRun(F, white(), mode);
      const env = x < attack ? x / attack : x < attack + hold ? 1 : Math.exp(-(x - attack - hold) * kd);
      const g = vol * env, i = i0 + j;
      L[i] += v * g * gl; R[i] += v * g * gr;
      if (send) rv[i] += v * g * send;
    }
  };
  // Sinus mit Tonhöhen-Fahrt (Bassdrum, Tom, Einschlag)
  const drop808 = (t, f0, f1, sweep, len, vol, send = 0, to = 'drums') => {
    const i0 = Math.max(0, Math.round(t * SR)), n = Math.min(N - i0, Math.ceil((len + 0.01) * SR));
    if (n <= 0) return;
    const [L, R] = out(to), kd = 9.2 / len;
    let ph = 0;
    for (let j = 0; j < n; j++) {
      const x = j / SR, f = f1 + (f0 - f1) * Math.exp(-x / (sweep / 3));
      ph += f / SR; if (ph >= 1) ph -= 1;
      const v = Math.sin(TWO_PI * ph) * vol * Math.min(1, x / 0.003) * Math.exp(-x * kd), i = i0 + j;
      L[i] += v; R[i] += v;
      if (send) rv[i] += v * send;
    }
  };

  // Vocal-Chop: Sägezahn durch drei Formantfilter (Vokale), kurz angeschnitten wie ein geschnittenes Gesangs-Sample
  const VOW = { a: [800, 1150, 2900], o: [480, 820, 2800], e: [480, 1900, 2600], i: [320, 2250, 3000], u: [340, 720, 2500] };
  const vox = (t, len, midi, vol, vw = 'a', o = {}) => {
    const { send = 0.2, echoSend = 0.3, pan = 0, bend = 0 } = o;
    const i0 = Math.max(0, Math.round(t * SR)), n = Math.min(N - i0, Math.ceil((len + 0.05) * SR));
    if (n <= 0) return;
    const f0 = mtof(midi), fm = VOW[vw] || VOW.a, F = fm.map(() => svf()), gk = [1, 0.6, 0.35];
    fm.forEach((f, k) => svfSet(F[k], f, 6 + k * 3));
    const [gl, gr] = panG(pan);
    let ph = 0;
    for (let j = 0; j < n; j++) {
      const x = j / SR, f = f0 * Math.pow(2, (bend * Math.exp(-x / 0.035) + 0.2 * Math.sin(TWO_PI * 5.5 * x) * Math.min(1, x / 0.12)) / 12);
      const dt = f / SR, src = 2 * ph - 1 - blep(ph, dt);
      ph += dt; if (ph >= 1) ph -= 1;
      let v = 0; for (let k = 0; k < 3; k++) v += svfRun(F[k], src, 'band') * F[k].k * gk[k];
      const g = vol * Math.min(1, x / 0.006) * (x < len ? 1 : Math.exp(-(x - len) / 0.012)), i = i0 + j;
      mL[i] += v * g * gl; mR[i] += v * g * gr;
      if (send) rv[i] += v * g * send;
      if (echoSend) ec[i] += v * g * echoSend;
    }
  };
  // Cowbell (808-Prinzip: zwei Rechtecke im Verhältnis 1 : 1,48, Bandpass, angezerrt) – als Melodie gespielt
  const cowbell = (t, midi, vol, len = 0.3, pan = 0.1) => {
    const i0 = Math.max(0, Math.round(t * SR)), n = Math.min(N - i0, Math.ceil((len + 0.03) * SR));
    if (n <= 0) return;
    const f1 = mtof(midi), f2 = f1 * 1.48, F = svf(), [gl, gr] = panG(pan), tc = len / 3.5;
    svfSet(F, f1 * 1.25, 1.4);
    let p1 = 0, p2 = 0;
    for (let j = 0; j < n; j++) {
      const x = j / SR, d1 = f1 / SR, d2 = f2 / SR;
      const sq = (p1 < 0.5 ? 1 : -1) + blep(p1, d1) - blep((p1 + 0.5) % 1, d1) + (p2 < 0.5 ? 1 : -1) + blep(p2, d2) - blep((p2 + 0.5) % 1, d2);
      p1 += d1; if (p1 >= 1) p1 -= 1; p2 += d2; if (p2 >= 1) p2 -= 1;
      const v = Math.tanh(svfRun(F, sq, 'band') * F.k * 1.8);
      const g = vol * Math.min(1, x / 0.0015) * (0.4 * Math.exp(-x / 0.012) + 0.6 * Math.exp(-x / tc)), i = i0 + j;
      mL[i] += v * g * gl; mR[i] += v * g * gr;
      rv[i] += v * g * 0.15; ec[i] += v * g * 0.22;
    }
  };
  // 808-Bass: Sinus mit Gleiten vom vorigen Ton und Sättigung (Obertöne – hörbar auch auf Handy-Lautsprechern)
  const b808 = (t, len, midi, vol, drive = 2, from = null) => {
    const i0 = Math.max(0, Math.round(t * SR)), n = Math.min(N - i0, Math.ceil((len + 0.08) * SR));
    if (n <= 0) return;
    const f1 = mtof(midi), fa = from == null ? f1 : mtof(from), td = Math.tanh(drive);
    let ph = 0;
    for (let j = 0; j < n; j++) {
      const x = j / SR, f = f1 + (fa - f1) * Math.exp(-x / 0.03);
      ph += f / SR; if (ph >= 1) ph -= 1;
      const env = Math.min(1, x / 0.004) * (x < len ? 0.8 + 0.2 * Math.exp(-x / 0.12) : 0.8 * Math.exp(-(x - len) / 0.025));
      const v = (Math.tanh(Math.sin(TWO_PI * ph) * drive) / td) * vol * env, i = i0 + j;
      mL[i] += v; mR[i] += v;
    }
  };
  // Reverse-Becken: schwillt an und endet genau auf dem Einsatz
  const revCym = (tEnd, len, vol = 0.2) => {
    const i0 = Math.max(0, Math.round((tEnd - len) * SR)), n = Math.min(N - i0, Math.round(tEnd * SR) - i0), F = svf();
    svfSet(F, 7200, 0.6);
    for (let j = 0; j < n; j++) {
      const u = j / n, v = svfRun(F, white(), 'band') * vol * u * u * u, i = i0 + j;
      dL[i] += v * 0.9; dR[i] += v; rv[i] += v * 0.3;
    }
  };

  // ---------- Schlagzeug ----------
  const kick = (t, v = 1, kind = 'house') => {
    const f0 = kind === '808' ? 120 : kind === 'soft' ? 110 : kind === 'epic' ? 90 : 150, f1 = kind === '808' ? mtof(r.root - 24) : kind === 'epic' ? 38 : 46;
    const len = kind === '808' ? 0.9 : kind === 'epic' ? 1.1 : kind === 'soft' ? 0.35 : 0.45;
    drop808(t, f0, f1, kind === '808' ? 0.08 : 0.11, len, v, kind === 'epic' ? 0.35 : 0);
    if (kind !== 'soft') nz(t, 0.012, 'band', 3500, 0.6, 0.25 * v);
    kicks.push(t);
  };
  const snare = (t, v = 1, kind = 'snare', main = true) => {
    if (main) snares.push(t);
    if (kind === 'clap') {
      for (let k = 0; k < 3; k++) nz(t + k * 0.009, 0.02, 'band', 1300, 1.2, 0.5 * v, { pan: (k - 1) * 0.2 });
      nz(t + 0.022, 0.2, 'band', 1200, 0.9, 0.55 * v, { send: 0.35 });
      return;
    }
    if (kind === 'rim') { nz(t, 0.03, 'band', 2400, 4, 0.35 * v, { pan: 0.25 }); return; }
    const i0 = Math.round(t * SR), n = Math.min(N - i0, Math.round(0.16 * SR));
    let ph = 0;
    for (let j = 0; j < n; j++) { const x = j / SR, f = 160 + 60 * Math.exp(-x / 0.03); ph += f / SR; if (ph >= 1) ph -= 1; const val = (4 * Math.abs(ph - 0.5) - 1) * 0.5 * v * Math.min(1, x / 0.002) * Math.exp(-x * 9.2 / 0.14); dL[i0 + j] += val; dR[i0 + j] += val; }
    if (kind === 'gated') nz(t, 0.3, 'band', 2600, 0.45, 0.7 * v, { hold: 0.22, send: 0.8 });
    else nz(t, 0.2, 'band', 3800, 0.45, 0.7 * v, { send: 0.3 });
  };
  // Becken: bandbegrenztes Rauschen (echte Hi-Hats haben ihre Energie um 7–12 kHz, nicht bis ganz oben)
  const hat = (t, v = 1, open = false) => nz(t, open ? 0.22 : 0.035, 'band', open ? 8500 : 9500, 0.9, (open ? 0.34 : 0.3) * v, { pan: 0.3 });
  const shaker = (t, v = 1) => nz(t, 0.06, 'band', 6500, 1.2, 0.19 * v, { attack: 0.012, pan: -0.35 });
  const tom = (t, v = 1, f = 110) => { drop808(t, f, f * 0.6, 0.3, 0.6, 0.7 * v, 0.4); nz(t, 0.08, 'low', 900, 0.8, 0.3 * v); };
  const crash = (t, v = 1) => nz(t, 1.8, 'band', 7000, 0.5, 0.22 * v, { send: 0.3, pan: -0.2 });
  const impact = (t) => { drop808(t, 70, 30, 0.8, 1.6, 0.8); crash(t, 1); };
  const riser = (t, len) => {
    const i0 = Math.round(t * SR), n = Math.min(N - i0, Math.round(len * SR)), F = svf();
    for (let j = 0; j < n; j++) {
      const u = j / n;
      if (j % 32 === 0) svfSet(F, 350 * Math.pow(9000 / 350, u), 2.5);
      const g = 0.14 * Math.pow(u, 1.6) * (u > 0.95 ? (1 - u) / 0.05 : 1), v = svfRun(F, white(), 'band') * g;
      mL[i0 + j] += v; mR[i0 + j] += v; rv[i0 + j] += v * 0.5;
    }
  };

  // ---------- Harmonie ----------
  const scale = BEAT_SCALES[S.mode];
  const deg = (d) => { const o = Math.floor(d / 7), k = ((d % 7) + 7) % 7; return r.root + 12 * o + scale[k]; };
  let prevC = 62;
  const chordAt = (ci) => {
    const [d0, n] = S.prog[ci % S.prog.length];
    const notes = Array.from({ length: n }, (_, k) => deg(d0 + 2 * k));
    // Stimmführung: jede Stimme nah an die Lage des vorigen Akkords (um C4–C5)
    const v = notes.map((m) => { let x = m; while (x < prevC - 7) x += 12; while (x > prevC + 6) x -= 12; return x; }).sort((a, b) => a - b);
    prevC = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 0.5 + 62 * 0.5);
    return { v, bass: deg(d0) - 12 * (deg(d0) >= r.root + 5 ? 3 : 2), root: deg(d0) };
  };
  // Hook: zwei Takte aus Akkord- und Skalentönen, in der Form A A' A A''
  const RHY = [
    [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  ];
  const rhy = RHY[Math.floor(rng() * RHY.length)];
  const leadBase = deg(7) + (S.lead === 'horn' || S.lead === 'strings' ? -12 : 0);
  const motif = [];
  {
    let pos = 2 + Math.floor(rng() * 3);
    for (let s = 0; s < 32; s++) {
      if (!rhy[s]) continue;
      pos += s % 4 === 0 ? Math.round((rng() - 0.45) * 4) : Math.round((rng() - 0.5) * 2) || 1;
      pos = Math.max(-2, Math.min(7, pos));
      let len = 1; while (s + len < 32 && !rhy[s + len] && len < 4) len++;
      motif.push({ s, pos, len });
    }
  }
  const variantOf = (k) => motif.map((n, i) => (k && i >= motif.length - 2 ? { ...n, pos: n.pos + (k === 1 ? -2 : 2) } : n));

  // ---------- Arrangement ----------
  const beats = [], barStart = [], sections = [], secT = [];
  let b0 = 0;
  for (const [label, n] of form) { secT.push({ label, start: t0 + b0 * bar, end: t0 + (b0 + n) * bar, bars: n }); b0 += n; }
  for (let k = 0; t0 + k * beat < dur - 0.05; k++) beats.push(t0 + k * beat);
  for (let k = 0; t0 + k * bar < dur - 0.05; k++) barStart.push(t0 + k * bar);
  const swingT = (s) => (S.swing && s % 2 === 1 ? (S.swing - 0.5) * (beat / 2) : 0);
  const at16 = (tb, s) => tb + s * (beat / 4) + swingT(s);
  const pumps = [];
  let ci = 0, dropNo = 0, prev808 = null, vi = 0;
  for (let si = 0; si < secT.length; si++) {
    const sec = secT[si], L = sec.label, next = secT[si + 1];
    const drop = L === 'drop', calm = L === 'intro' || L === 'break' || L === 'outro';
    if (drop) { dropNo++; impact(sec.start); }
    if (L === 'build') riser(sec.start, sec.end - sec.start - beat * 0.5);
    // Reverse-Becken saugt in den Drop hinein (nach dem Build über zwei Zählzeiten, sonst über eine)
    if (v2 && drop && si > 0) revCym(sec.start, beat * (secT[si - 1].label === 'build' ? 2 : 1), hype ? 0.26 : chill ? 0.14 : 0.2);
    const energy = drop ? (dropNo > 1 ? 1 : 0.92) : L === 'verse' ? 0.62 : L === 'build' ? 0.7 : 0.35;
    const K = S.kit;
    const kickKind = K === 'trap' || K === 'amapiano' ? '808' : K === 'epic' ? 'epic' : K === 'soft4' || K === 'boombap' ? 'soft' : 'house';
    for (let b = 0; b < sec.bars; b++) {
      const tb = sec.start + b * bar, last = b === sec.bars - 1;
      const ch = chordAt(ci++);
      const gap = L === 'build' && last && next && next.label === 'drop';
      // ----- Schlagzeug -----
      if (drop || L === 'verse' || (L === 'build' && !gap) || (L === 'outro' && !last)) {
        let ks;
        if (K === 'boombap') ks = [0, 7, 10];
        else if (K === 'trap') ks = drop ? [0, 11] : [0];
        else if (K === 'amapiano') ks = [0, 6, 10];
        else if (K === 'retro') ks = drop ? [0, 4, 8, 12] : [0, 8];
        else if (K === 'stomp') ks = [0, 8];
        else if (K === 'epic') ks = drop ? [0, 6, 8] : [0];
        else if (K === 'phonk') ks = drop ? [0, 3, 6, 10] : [0, 10];
        else if (K === 'jersey') ks = drop ? (hype ? [0, 4, 8, 11, 13, 14] : [0, 4, 8, 11, 14]) : [0, 8];
        else if (K === 'garage') ks = drop ? [0, 7, 10] : [0, 10];
        else ks = [0, 4, 8, 12];
        for (const s of ks) {
          const t = at16(tb, s);
          kick(t, drop ? 0.95 : 0.75, kickKind);
          if (S.pump && (drop || L === 'verse')) pumps.push([t, S.pump * (drop ? 1 : 0.5) * (chill ? 0.6 : 1)]);
        }
      }
      if (drop || L === 'verse') {
        const sn = K === 'retro' ? 'gated' : K === 'house' || K === 'soft4' || K === 'stomp' || K === 'disco' || K === 'phonk' || K === 'jersey' ? 'clap' : K === 'amapiano' ? 'rim' : 'snare';
        for (const s of K === 'trap' || K === 'epic' ? [8] : K === 'dembow' ? (drop ? [3, 6, 11, 14] : [6, 14]) : [4, 12]) snare(at16(tb, s), drop ? 1 : 0.7, sn);
        if (K === 'garage' && drop) for (const s of [7, 15]) snare(at16(tb, s), 0.5, 'rim', false);
        if (K === 'stomp' && drop) for (const s of [4, 12]) snare(at16(tb, s) + 0.012, 0.6, 'clap', false);
        if (K === 'epic') for (const s of drop ? [0, 3, 6, 10, 12, 14] : [0, 10]) tom(at16(tb, s), drop ? 0.8 : 0.5, s % 3 ? 95 : 130);
      }
      if (!calm || (L === 'outro' && b === 0)) {
        for (let s = 0; s < 16; s++) {
          if (chill && s % 2) continue;
          const t = at16(tb, s);
          if (hype && drop && s % 4 === 2 && K !== 'house' && K !== 'disco' && K !== 'garage') hat(t, 0.4, true);
          if (K === 'soft4' || K === 'amapiano') shaker(t, s % 4 === 2 ? 1 : s % 2 ? 0.55 : 0.75);
          else if (K === 'boombap') { if (s % 2 === 0) hat(t, s % 4 === 0 ? 0.8 : 0.55); }
          else if (K === 'trap') { if (s % 2 === 0) hat(t, 0.6); if (drop && b % 2 === 1 && s >= 12) { hat(t + beat / 8, 0.4); if (s >= 14) hat(t + beat / 12, 0.35); } }
          else if (K === 'house' || K === 'disco') { if (s % 4 === 2) hat(t, 0.9, drop); else if (s % 2 === 1 || drop) hat(t, 0.45); }
          else if (K === 'retro') { if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.8 : 0.5); }
          else if (K === 'stomp') { if (s % 2 === 0) shaker(t, s % 4 === 2 ? 1 : 0.6); }
          else if (K === 'epic' && drop && s % 4 === 2) hat(t, 0.4);
          else if (K === 'phonk') { hat(t, s % 4 === 0 ? 0.55 : s % 2 ? 0.3 : 0.42); if (drop && b % 2 === 1 && s >= 12 && s % 2 === 0) { hat(t + beat / 12, 0.32); hat(t + beat / 6, 0.28); } }
          else if (K === 'jersey') { if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.75 : 0.42); }
          else if (K === 'garage') { if (s % 4 === 2) hat(t, 0.75, drop); else if (s % 2 === 1) hat(t, 0.45); else if (drop) shaker(t, 0.6); }
          else if (K === 'dembow') { if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.55 : 0.38); shaker(t, s % 4 === 2 ? 0.8 : 0.45); }
        }
      }
      // Build: Wirbel immer dichter (Achtel → Sechzehntel → Zweiunddreißigstel), vor dem Drop eine halbe Zählzeit Stille
      if (L === 'build') {
        const frac = (b + 1) / sec.bars, step = frac <= 0.5 ? 2 : frac < 1 ? 1 : 0.5;
        for (let s = 0; s < 16; s += step) {
          if (gap && s >= 14) break;
          snare(tb + s * (beat / 4), (0.25 + 0.6 * ((b * 16 + s) / (sec.bars * 16))) * (v2 && (K === 'boombap' || chill) ? 0.6 : 1), K === 'house' || K === 'soft4' ? 'clap' : 'snare', false);
        }
      }
      if (drop && b === 0) crash(tb, 0.8);
      if (v2) {
        // Intro als Teaser: leise Achtel-Hats über dem gedämpften Hook (Chill ohne), damit der erste Moment schon groovt
        if (L === 'intro' && !chill && (hype || b >= sec.bars - 2)) for (let s = 0; s < 16; s += 2) hat(at16(tb, s), s % 4 === 2 ? 0.42 : 0.25);
        // Hype: Fill am Ende jeder Vier-Takt-Phrase, Becken zu Beginn der nächsten
        if (hype && drop && b % 4 === 3) for (let s = 12; s < 16; s++) snare(at16(tb, s), 0.3 + 0.12 * (s - 12), K === 'house' || K === 'soft4' || K === 'jersey' || K === 'phonk' ? 'clap' : 'snare', false);
        if (hype && drop && b % 4 === 0 && b) crash(tb, 0.45);
      }
      // ----- Bass -----
      // (v2: der Build läuft ohne Bass – der Drop bringt ihn zurück und schlägt spürbar ein)
      if ((!calm || (L === 'outro' && !last)) && !(v2 && L === 'build')) {
        const bn = ch.bass, bv = drop ? 0.34 : 0.25, bo = { to: 'music' };
        if (S.bass === 'sub') for (const s of drop ? [0, 6, 8, 14] : [0, 8]) voice(at16(tb, s), beat * (s === 6 || s === 14 ? 0.4 : 1.4), bn, bv, { ...bo, type: 'triangle', cut: 520, d: 0.3, s: 0.8, rl: 0.08 });
        else if (S.bass === 'saw8') for (let s = 0; s < 16; s += 2) voice(at16(tb, s), beat * 0.42, bn + (s % 4 === 2 ? 12 : 0), bv * 0.8, { ...bo, cut: 1400, cutEnd: 300, d: 0.12, s: 0.3, rl: 0.05 });
        else if (S.bass === 'roll') for (const s of [2, 6, 10, 14]) voice(at16(tb, s), beat * 0.45, bn + (s === 14 ? 7 : 0), bv, { ...bo, cut: 900, cutEnd: 200, d: 0.15, s: 0.4, det: [-6, 6] });
        else if (S.bass === 'soft') for (const s of [0, 7, 10]) voice(at16(tb, s), beat * 0.9, bn, bv * 0.9, { ...bo, type: 'triangle', cut: 700, d: 0.4, s: 0.5 });
        else if (S.bass === 'log') for (const s of [0, 3, 6, 10, 13]) voice(at16(tb, s), beat * 0.5, bn + (s === 10 ? 5 : s === 13 ? 7 : 0), bv * 1.1, { ...bo, type: 'sine', cut: 1200, d: 0.18, s: 0.25, glide: 7 });
        else if (S.bass === 'warm') for (const s of [0, 6, 8, 12]) voice(at16(tb, s), beat * 0.8, bn + (s === 12 ? 7 : 0), bv * 0.9, { ...bo, type: 'triangle', cut: 900, d: 0.3, s: 0.6 });
        else if (S.bass === '808slide') {
          // Phonk: 808 mit Oktav-Slides (gleitet vom vorigen Ton), Sättigung nach Energie
          const dv = chill ? 1.4 : hype ? 3 : 2.2;
          b808(at16(tb, 0), beat * 1.4, bn, bv * 1.05, dv, prev808);
          if (drop) {
            b808(at16(tb, 6), beat * 0.9, bn, bv, dv);
            b808(at16(tb, 10), beat * (b % 2 ? 0.9 : 1.4), bn + 12, bv * 0.9, dv, bn);
            if (b % 2) b808(at16(tb, 14), beat * 0.45, bn + 7, bv * 0.9, dv, bn + 12);
            prev808 = b % 2 ? bn + 7 : bn + 12;
          } else { b808(at16(tb, 10), beat * 1.4, bn, bv * 0.9, dv); prev808 = bn; }
        }
        else if (S.bass === '808') for (const s of drop ? [0, 8, 11] : [0, 8]) b808(at16(tb, s), beat * (s === 0 ? 1.8 : s === 8 ? 0.6 : 1.1), bn + (s === 11 ? 12 : 0), bv, chill ? 1.3 : hype ? 2.4 : 1.8, s === 11 ? bn : null);
        else if (S.bass === 'wob') for (const s of drop ? [0, 7, 10] : [0, 10]) {
          const len = beat * (s === 7 ? 0.6 : 1.3);
          voice(at16(tb, s), len, bn + 12, bv * 0.55, { ...bo, cut: 750, cutEnd: 260, q: 1.4, d: 0.25, s: 0.5, det: [-9, 9] });
          voice(at16(tb, s), len, bn, bv * 1.15, { ...bo, type: 'sine', cut: 400, d: 0.3, s: 0.8, rl: 0.06 });
        }
        else if (S.bass === 'dembow') for (const s of drop ? [0, 3, 8, 11] : [0, 8]) b808(at16(tb, s), beat * (s % 8 === 0 ? 0.7 : 1.1), bn, bv * 0.95, chill ? 1.1 : 1.4);
        else if (S.bass === 'slap') for (const s of [0, 3, 4, 7, 10, 12, 14]) voice(at16(tb, s), beat * 0.22, bn + (s === 4 || s === 12 ? 12 : s === 14 ? 10 : 0), bv * 0.9, { ...bo, type: 'square', cut: 2200, cutEnd: 400, d: 0.08, s: 0.25, rl: 0.04 });
      }
      // ----- Akkorde -----
      const cv = drop ? 0.13 : 0.1;
      if (!(L === 'outro' && last)) {
        if (S.chords === 'offpluck') {
          for (const s of [2, 6, 10, 14]) ch.v.forEach((m, k) => voice(at16(tb, s), beat * 0.3, m, cv, { type: 'triangle', cut: 3000, cutEnd: 600, d: 0.12, s: 0.1, send: 0.2, pan: (k - 1) * 0.6 }));
          // warme Fläche darunter (füllt die Mitten)
          if (!calm) ch.v.forEach((m, k) => voice(tb, bar, m - 12, 0.045, { cut: 900, a: 0.3, d: 0.8, s: 0.9, rl: 0.4, det: [-7, 7], send: 0.25, pan: (k - 1) * 0.5 }));
        }
        else if (S.chords === 'pad') ch.v.forEach((m, k) => voice(tb, bar, m, cv * 0.9, { cut: drop ? 2600 : 1500, a: 0.25, d: 0.6, s: 0.8, rl: 0.4, det: [-9, 0, 9], send: 0.3, pan: (k - 1) * 0.55 }));
        else if (S.chords === 'rhodes') ch.v.forEach((m, k) => fmv(tb + k * 0.012 + (b % 2 ? beat * 2.5 : 0), bar * 0.9, m, cv * 1.1, 1, 1.2, 1.6, 0.3, (k - 1.5) * 0.4));
        else if (S.chords === 'stab') for (const s of drop ? [2, 7, 10] : [2, 10]) ch.v.forEach((m, k) => voice(at16(tb, s), beat * 0.35, m, cv * 1.1, { type: 'square', cut: 2600, cutEnd: 800, d: 0.1, s: 0.3, send: 0.25, echoSend: 0.25, pan: (k - 1.5) * 0.45 }));
        else if (S.chords === 'strings') ch.v.forEach((m, k) => voice(tb, bar, m, cv * 0.9, { cut: drop ? 3000 : 1600, a: 0.4, d: 0.8, s: 0.9, rl: 0.6, det: [-12, 0, 12], vib: 8, send: 0.45, pan: (k - 1) * 0.65 }));
        else if (S.chords === 'supersaw') for (const s of drop ? [0, 3, 6, 10, 12] : [0, 8]) ch.v.forEach((m) => voice(at16(tb, s), beat * (drop ? 0.55 : 1.8), m, cv * 1.05, { cut: 5200, cutEnd: 1800, d: 0.25, s: 0.6, det: [-18, -7, 0, 7, 18], send: 0.3 }));
        else if (S.chords === 'piano') for (const s of drop ? [0, 3, 6, 10] : [0, 6]) ch.v.forEach((m, k) => fmv(at16(tb, s), beat * 0.8, m, cv * 0.9, 2, 0.8, 0.9, 0.22, (k - 2) * 0.3));
        else if (S.chords === 'strum') for (const s of [0, 3, 6, 8, 10, 14]) ch.v.forEach((m, k) => voice(at16(tb, s) + k * 0.012, beat * 0.4, m, cv * 0.75, { cut: 2600, cutEnd: 700, d: 0.14, s: 0.15, send: 0.15, pan: 0.45 - k * 0.1 }));
        else if (S.chords === 'clav') for (const s of [0, 3, 6, 8, 11, 14]) ch.v.slice(-3).forEach((m) => voice(at16(tb, s), beat * 0.14, m + 12, cv * 0.75, { type: 'square', cut: 3200, cutEnd: 1100, q: 3, d: 0.05, s: 0.2, rl: 0.03, pan: -0.45 }));
        else if (S.chords === 'rnb') for (const s of drop ? [0, 6, 10] : [0]) ch.v.forEach((m, k) => fmv(at16(tb, s) + k * 0.01, drop ? beat * 1.2 : bar * 0.9, m, cv, 1, 1.1, drop ? 1.1 : 1.8, 0.3, (k - 1.5) * 0.4));
        else if (S.chords === 'organ') for (const s of drop ? [3, 6, 10, 13] : [3, 10]) ch.v.forEach((m, k) => {
          voice(at16(tb, s), beat * 0.3, m, cv * 0.7, { type: 'square', cut: 2000, cutEnd: 900, d: 0.08, s: 0.35, rl: 0.05, send: 0.2, echoSend: 0.15, pan: (k - 1.5) * 0.4 });
          voice(at16(tb, s), beat * 0.3, m + 12, cv * 0.35, { type: 'sine', cut: 5000, d: 0.08, s: 0.4, rl: 0.05 });
        });
        // Grundfläche in ruhigen Teilen, damit Intro und Break tragen
        if (calm && S.chords !== 'pad' && S.chords !== 'strings') ch.v.forEach((m, k) => voice(tb, bar, m, 0.05, { cut: 1100, a: 0.4, d: 0.8, s: 0.9, rl: 0.5, det: [-8, 8], send: 0.4, pan: (k - 1) * 0.6 }));
      }
      if (S.braam && drop && b % 4 === 0) for (const m of [ch.root - 24, ch.root - 17, ch.root - 12]) voice(tb, bar * 1.6, m, 0.14, { cut: 380, cutEnd: 1600, q: 2, a: 0.02, d: 1.2, s: 0.9, rl: 0.8, det: [-15, 0, 15], send: 0.5 });
      // Ausklang: der letzte Takt endet mit einem Schlag und dem Grundakkord, der ausklingt
      if (L === 'outro' && last) {
        const fin = chordAt(0);
        impact(tb);
        fin.v.forEach((m, k) => voice(tb, bar * 1.2, m, 0.09, { cut: 2200, cutEnd: 600, d: 1.2, s: 0.4, rl: 1.2, det: [-8, 8], send: 0.6, pan: (k - 1) * 0.3 }));
        voice(tb, bar, fin.bass, 0.4, { type: 'sine', cut: 600, d: 0.8, s: 0.5, rl: 0.8 });
      }
      // ----- Hook-Melodie -----
      // (Rezept v2: der Hook klingt schon im Intro an – gedämpft, als Teaser; Hype doppelt ihn im Drop eine Oktave höher)
      if (drop || (L === 'break' && S.lead !== 'arp') || (v2 && L === 'intro' && S.lead !== 'arp')) {
        const ph2 = Math.floor(b / 2) % 4;
        const mt = variantOf(ph2 === 3 ? 2 : ph2 === 1 ? 1 : 0), half = b % 2, lv0 = L === 'break' ? 0.8 : L === 'intro' ? 0.75 : 1.3;
        for (const n of mt) {
          if (Math.floor(n.s / 16) !== half) continue;
          const t = at16(tb, n.s % 16), len = n.len * (beat / 4);
          const m0 = leadBase + scale[((n.pos % 7) + 7) % 7] + 12 * Math.floor(n.pos / 7) - scale[0];
          for (const oct of hype && drop ? [0, 12] : [0]) {
          const m = m0 + oct, lv = oct ? lv0 * 0.4 : lv0;
          if (S.lead === 'cowbell') cowbell(t, m + 12, 0.17 * lv, Math.max(0.18, len * 1.2));
          else if (S.lead === 'vox') { vi++; vox(t, len * 0.85, m + 12, 0.24 * lv, 'aoei'[vi % 4], { bend: n.s % 8 === 0 ? -1.2 : 0, pan: vi % 2 ? 0.2 : -0.2 }); }
          else if (S.lead === 'pluck') voice(t, len * 0.8, m + 12, 0.08 * lv, { cut: 4200, cutEnd: 700, d: 0.12, s: 0.12, rl: 0.08, det: [-8, 8], echoSend: 0.35, send: 0.2 });
          else if (S.lead === 'marimba') fmv(t, len, m, 0.16 * lv, 4, 0.9, 0.45, 0.2, 0.15);
          else if (S.lead === 'bell') fmv(t, len, m + 12, 0.1 * lv, 3.5, 1.1, 1.1, 0.35, 0.2);
          else if (S.lead === 'chop') voice(t, len * 0.9, m, 0.08 * lv, { cut: 1800, q: 3, d: 0.1, s: 0.5, echoSend: 0.35, send: 0.2 });
          else if (S.lead === 'horn') voice(t, len * 1.5, m, 0.1 * lv, { cut: 1200, cutEnd: 2600, a: 0.06, d: 0.4, s: 0.9, rl: 0.3, det: [-6, 6], vib: 6, send: 0.45 });
          else if (S.lead === 'chip') voice(t, len * 0.8, m + 12, 0.085 * lv, { type: 'square', cut: 5000, d: 0.12, s: 0.4, echoSend: 0.35, send: 0.2 });
          else if (S.lead === 'flute') voice(t, len * 1.1, m + 12, 0.065 * lv, { type: 'sine', cut: 4000, a: 0.03, d: 0.3, s: 0.8, vib: 12, send: 0.35, echoSend: 0.2 });
          else if (S.lead === 'whistle') voice(t, len * 1.1, m + 12, 0.07 * lv, { type: 'sine', cut: 6000, a: 0.02, d: 0.2, s: 0.85, vib: 18, send: 0.3, glide: -1 });
          else if (S.lead === 'strings') voice(t, len * 1.2, m, 0.09 * lv, { cut: 2400, a: 0.04, d: 0.3, s: 0.8, det: [-10, 10], vib: 8, send: 0.4 });
          }
        }
      }
      // Synthwave: Sechzehntel-Arpeggio
      if (S.lead === 'arp' && (drop || L === 'verse' || L === 'build')) {
        const ns = [...ch.v, ch.v[0] + 12];
        for (let s = 0; s < 16; s++) voice(at16(tb, s), beat * 0.22, ns[s % ns.length] + 12, drop ? 0.06 : 0.045, { type: 'square', cut: 2600, cutEnd: 1200, d: 0.08, s: 0.3, echoSend: 0.3, pan: s % 2 ? 0.35 : -0.35 });
      }
      // Lo-Fi: Plattenknistern
      if (S.vinyl) for (let k = 0; k < 10; k++) nz(tb + rng() * bar, 0.004 + rng() * 0.006, 'band', 3000, 0.7, 0.03 + rng() * 0.05, { pan: rng() - 0.5 });
    }
    sections.push({ label: L, start: sec.start, end: sec.end, bars: sec.bars, energy });
  }
  if (sections.length) { sections[0].start = 0; sections[sections.length - 1].end = dur; }

  // ---------- Mischung komplett in JavaScript: Bit für Bit reproduzierbar, auf jedem Gerät gleich ----------
  // Musik: Filterfahrt je Abschnitt (Intro/Break gedämpft, Build öffnet, Drop offen) und Sidechain-Pumpen
  const lpOf = { intro: v2 ? 1200 : 900, verse: 3200, build: 1400, drop: 18000, break: 1500, outro: 2400 };
  const cutAt = (t) => {
    let sc = secT[0];
    for (const x of secT) if (t >= x.start) sc = x;
    if (t >= sc.end) return 2400;
    const u = (t - sc.start) / Math.max(0.01, sc.end - sc.start);
    if (sc.label === 'build') return Math.min(16000, lpOf.build * Math.pow(16000 / lpOf.build, Math.min(1, u * (sc.end - sc.start) / Math.max(0.01, sc.end - sc.start - beat * 0.5))));
    if (sc.label === 'outro') return 8000 * Math.pow(lpOf.outro / 8000, u);
    return lpOf[sc.label] || 3000;
  };
  const FL = svf(), FR = svf();
  let pi = 0, pg = 1, secG = 1;
  // v2: Intro-Teaser leiser (er soll neugierig machen, der Drop bleibt der Höhepunkt – auch nach dem Lautheits-Schub)
  const introEnd = secT[0].label === 'intro' ? secT[0].end : 0;
  pumps.sort((x, y) => x[0] - y[0]);
  const tcP = beat * 0.22;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    if (i % 32 === 0) { const fc = cutAt(t); svfSet(FL, fc, 0.8); svfSet(FR, fc, 0.8); if (v2) secG = t < introEnd ? 0.7 : 1; }
    while (pi < pumps.length && pumps[pi][0] + 0.004 <= t) { pg = 1 - pumps[pi][1]; pi++; }
    const g = pg * secG;
    pg += (1 - pg) * (1 - Math.exp(-1 / (tcP * SR)));
    mL[i] = svfRun(FL, mL[i], 'low') * g;
    mR[i] = svfRun(FR, mR[i], 'low') * g;
  }
  // Echo im Takt (punktierte Achtel), im Rücklauf gefiltert
  const eL = new Float32Array(N);
  {
    const D = Math.round(beat * 0.75 * SR), line = new Float32Array(D);
    let w = 0, lpS = 0; const kLp = 1 - Math.exp((-2 * Math.PI * 3200) / SR);
    for (let i = 0; i < N; i++) { const y = line[w]; lpS += kLp * (y - lpS); eL[i] = lpS; line[w] = ec[i] + lpS * 0.32; w = (w + 1) % D; }
  }
  // Hall (Freeverb-Prinzip): 8 gedämpfte Kammfilter + 4 Allpässe je Kanal, rechts leicht versetzt (Breite)
  const hL = new Float32Array(N), hR = new Float32Array(N);
  {
    const big = S.kit === 'epic', room = big ? 0.9 : 0.84, damp = 0.35, sc = SR / 44100;
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], alls = [556, 441, 341, 225];
    const mk = (spread) => ({ c: combs.map((n) => ({ b: new Float32Array(Math.round((n + spread) * sc)), i: 0, f: 0 })), a: alls.map((n) => ({ b: new Float32Array(Math.round((n + spread) * sc)), i: 0 })) });
    const chans = [mk(0), mk(23)], outs = [hL, hR];
    let hp = 0, px = 0; const kHp = Math.exp((-2 * Math.PI * 220) / SR);
    for (let i = 0; i < N; i++) {
      hp = kHp * (hp + rv[i] - px); px = rv[i];
      const x = hp * 0.015;
      for (let c = 0; c < 2; c++) {
        const ch = chans[c];
        let o = 0;
        for (const cb of ch.c) { const y = cb.b[cb.i]; cb.f = y * (1 - damp) + cb.f * damp; cb.b[cb.i] = x + cb.f * room; if (++cb.i >= cb.b.length) cb.i = 0; o += y; }
        for (const ap of ch.a) { const y = ap.b[ap.i]; ap.b[ap.i] = o + y * 0.5; o = y - o; if (++ap.i >= ap.b.length) ap.i = 0; }
        outs[c][i] = o;
      }
    }
  }
  // Summe, Mastering: Tiefbass unter 30 Hz weg, oberste Höhen sanft zurück, Bus-Kompressor, Limiter
  const revG = S.kit === 'epic' ? 1.25 : 0.85;
  const biq = (type, f, gainDb = 0) => {
    const A = Math.pow(10, gainDb / 40), w0 = (2 * Math.PI * f) / SR, cs = Math.cos(w0), sn = Math.sin(w0), al = sn / (2 * 0.707);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else { const sq = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sq); a0 = (A + 1) - (A - 1) * cs + sq; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sq; }
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
  };
  const bq = (F, x) => { const y = F.b0 * x + F.b1 * F.x1 + F.b2 * F.x2 - F.a1 * F.y1 - F.a2 * F.y2; F.x2 = F.x1; F.x1 = x; F.y2 = F.y1; F.y1 = y; return y; };
  const eq = [[biq('hp', 30), biq('shelf', 12000, -2)], [biq('hp', 30), biq('shelf', 12000, -2)]];
  const outL = new Float32Array(N), outR = new Float32Array(N);
  const att = (ms) => 1 - Math.exp(-1 / ((ms / 1000) * SR));
  let envC = 0, envL = 0;
  const cA = att(10), cR = att(180), lA = att(2), lR = att(80);
  for (let i = 0; i < N; i++) {
    let l = (dL[i] + mL[i] + eL[i] + hL[i] * revG) * 0.75, r2 = (dR[i] + mR[i] + eL[i] + hR[i] * revG) * 0.75;
    l = bq(eq[0][1], bq(eq[0][0], l)); r2 = bq(eq[1][1], bq(eq[1][0], r2));
    // Kompressor (−16 dB, 2,5 : 1) auf die Summe
    const lv = Math.max(Math.abs(l), Math.abs(r2));
    envC += (lv > envC ? cA : cR) * (lv - envC);
    const dbC = 20 * Math.log10(envC + 1e-9), grC = dbC > -16 ? (dbC + 16) * (1 - 1 / 2.5) : 0;
    let g = Math.pow(10, -grC / 20);
    // Limiter (−3 dB, 20 : 1)
    const lv2 = lv * g;
    envL += (lv2 > envL ? lA : lR) * (lv2 - envL);
    const dbL = 20 * Math.log10(envL + 1e-9);
    if (dbL > -3) g *= Math.pow(10, (-(dbL + 3) * (1 - 1 / 20)) / 20);
    outL[i] = l * g; outR[i] = r2 * g;
  }
  // Rezept v2: Soft-Clipper auf der Summe (Spitzen rund abgeschnitten → dichter und lauter wie aktuelle Produktionen)
  if (v2) {
    let pk = 0;
    for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(outL[i]), Math.abs(outR[i]));
    const drive = chill ? 1.1 : hype ? 2 : 1.5, k = drive / Math.max(1e-9, pk), td = Math.tanh(drive);
    for (let i = 0; i < N; i++) { outL[i] = Math.tanh(outL[i] * k) / td; outR[i] = Math.tanh(outR[i] * k) / td; }
    // Lautheit wie aktuelle Produktionen: Drop auf Ziel-RMS anheben (je Energie, höchstens um `push`), Spitzen fängt ein
    // Limiter mit Vorausschau ab (Minimum über ±W, gemittelt über W → nie über der Decke, ohne harte Knicke; Rückweg 70 ms)
    let sq = 0, cnt = 0;
    for (const x of secT) if (x.label === 'drop') for (let i = Math.floor(x.start * SR); i < Math.min(N, Math.floor(x.end * SR)); i += 3) { sq += outL[i] * outL[i] + outR[i] * outR[i]; cnt += 2; }
    const pk2 = 1, dropDb = 20 * Math.log10(Math.sqrt(sq / Math.max(1, cnt)) / pk2 + 1e-9) - 1;
    const target = chill ? -14 : hype ? -10.5 : -12, push = chill ? 4 : hype ? 8.5 : 6;
    const G = Math.pow(10, Math.max(0, Math.min(push, target - dropDb)) / 20) * (0.89 / pk2), ceil = 0.89;
    const W = Math.round(0.003 * SR), req = new Float32Array(N);
    for (let i = 0; i < N; i++) { const a = Math.max(Math.abs(outL[i]), Math.abs(outR[i])) * G; req[i] = a > ceil ? ceil / a : 1; }
    // gleitendes Minimum über [i−W, i+W] (Deque, linear)
    const mn = new Float32Array(N), dq = new Int32Array(N);
    let h = 0, q = 0;
    for (let i = 0; i < N + W; i++) {
      if (i < N) { while (q > h && req[dq[q - 1]] >= req[i]) q--; dq[q++] = i; }
      const c = i - W;
      if (c >= 0) { while (dq[h] < c - W) h++; mn[c] = req[dq[h]]; }
    }
    // Mittel über W (Kasten, zentriert) und Rückweg
    let acc = 0, g = 1; const half = W >> 1, rel = 1 - Math.exp(-1 / (0.07 * SR));
    for (let i = 0; i < Math.min(N, half); i++) acc += mn[i];
    for (let i = 0; i < N; i++) {
      if (i + half < N) acc += mn[i + half];
      if (i - half - 1 >= 0) acc -= mn[i - half - 1];
      const nIn = Math.min(N - 1, i + half) - Math.max(0, i - half) + 1, sm = Math.min(acc / nIn, mn[i]);
      g = sm < g ? sm : g + (sm - g) * rel;
      if (g > sm) g = sm;
      outL[i] *= G * g; outR[i] *= G * g;
    }
  }
  // Lautheit angleichen: Spitze auf −1 dBFS
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
  const kN = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < N; i++) { outL[i] *= kN; outR[i] *= kN; }
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const buffer = new OAC(2, 1, SR).createBuffer(2, N, SR);
  buffer.getChannelData(0).set(outL); buffer.getChannelData(1).set(outR);
  return { buffer, truth: { beats, barStart, sections, kicks, snares, bpm: r.bpm, t0, duration: buffer.duration, mode: S.mode, style: r.style } };
}

/**
 * Analyse eines eigenen Beats: die gewöhnliche Analyse für Hüllkurve, Stille und Stopps – Schläge, Takte, Abschnitte,
 * Bassdrum und Snare kommen exakt aus der Komposition, die Energie je Schlag aus dem fertigen Ton.
 */
async function analyzeBeat(buffer, truth, onProgress) {
  const an = await analyzeAudio(buffer, onProgress);
  const bt = truth.beats.filter((t) => t < buffer.duration - 0.02), B = 60 / truth.bpm, n = bt.length;
  // Energie je Schlag wie in der Analyse: Pegel in dB, auf 5.–97. Perzentil normiert, leicht geglättet
  const d0 = buffer.getChannelData(0), d1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : d0, sr = buffer.sampleRate;
  const db = bt.map((t, i) => {
    const a = Math.floor(t * sr), z = Math.min(d0.length, Math.floor((i + 1 < n ? bt[i + 1] : t + B) * sr));
    let s = 0; for (let k = a; k < z; k += 2) s += (d0[k] * d0[k] + d1[k] * d1[k]) / 2;
    return 20 * Math.log10(Math.sqrt(s / Math.max(1, (z - a) / 2)) + 1e-7);
  });
  const lo = percentile(db, 0.05), hi = percentile(db, 0.97);
  const raw = db.map((v) => Math.max(0, Math.min(1, (v - lo) / Math.max(1e-6, hi - lo))));
  const energy = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = i - 2; k <= i + 3; k++) if (k >= 0 && k < n) { s += raw[k]; c++; } energy[i] = s / c; }
  an.beats = Float64Array.from(bt);
  an.energy = energy;
  an.vocal = new Float32Array(n);
  an.vocalOn = [];
  an.kicks = truth.kicks.slice().sort((a, b) => a - b);
  an.snares = truth.snares.slice().sort((a, b) => a - b);
  an.bpm = truth.bpm; an.beatPeriod = B;
  // Charakter aus der Komposition: Druck aus den echten Bassdrums, Tongeschlecht aus der Tonleiter des Stils
  an.mood = { ...(an.mood || {}), drive: +Math.min(1, (an.kicks.length / Math.max(1, n)) * 0.9 + 0.1).toFixed(2), minor: truth.mode ? (/minor|phrygian/.test(truth.mode) ? 1 : truth.mode === 'dorian' ? 0.5 : 0) : null, style: truth.style || null };
  an.barStart = truth.barStart.filter((t) => t < buffer.duration - 0.05);
  an.downIdx = an.barStart.map((t) => Math.round((t - truth.t0) / B));
  an.phrasePhase = 0;
  an.sections = truth.sections.map((s) => {
    const e = Array.from(energy).filter((_, i) => bt[i] >= s.start && bt[i] < s.end);
    const avg = e.length ? e.reduce((a, b) => a + b, 0) / e.length : s.energy;
    return { start: s.start, end: s.end, bars: s.bars, label: s.label, energy: +(0.5 * avg + 0.5 * s.energy).toFixed(3), slope: s.label === 'build' ? 0.05 : 0, bright: 0.5 };
  });
  const firstDrop = an.sections.find((s) => s.label === 'drop');
  if (firstDrop) an.hook = firstDrop.start;
  an.stops = [];
  // der Beat beginnt exakt auf der ersten Eins (kein Anlauf, keine gemessene Stille davor)
  an.firstSound = truth.t0;
  an.hasRhythm = true;
  an.gen = true;
  return an;
}

/** Fertiger Song aus einem Rezept (für die App): Ton, Analyse mit Wahrheit, Name. */
async function beatSong(recipe, onProgress) {
  const { buffer, truth } = await renderBeat(recipe);
  const an = await analyzeBeat(buffer, truth, onProgress);
  return { name: beatName(recipe), buffer, an, gen: recipe };
}
