/* ============================================================
 * Oberfläche: Reise, Orte, Editor, Export
 * ============================================================ */

const $ = (id) => document.getElementById(id);
const uid = (p) => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const DEFAULT_SETTINGS = { format: '9:16', look: 'auto', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'auto', seed: 7 };
const BESTOF_DEFAULTS = { ...DEFAULT_SETTINGS, format: '16:9' };
const SECTION_DE = { intro: 'Intro', verse: 'Strophe', build: 'Aufbau', chorus: 'Refrain', drop: 'Drop', break: 'Break', outro: 'Outro' };
const SECTION_COLOR = { intro: '#243453', verse: '#34507a', build: '#6e93c9', chorus: '#c7b48f', drop: '#e4d5b7', break: '#1c2a42', outro: '#243453' };
const LOOK_SWATCH = {
  auto: 'conic-gradient(from 200deg at 50% 60%, #2c4a74, #c7b48f, #6e93c9, #e4d5b7, #2c4a74)',
  natur: 'linear-gradient(120deg,#35607e,#7c9c78 55%,#e2d6b4)',
  golden: 'linear-gradient(120deg,#6a4020,#d99a4e 55%,#f3d9a8)',
  kino: 'linear-gradient(120deg,#0c3440,#1f6f78 40%,#d98a45 75%,#f1c27f)',
  blau: 'linear-gradient(120deg,#060d1c,#1c3560 55%,#7ea3d6)',
  film: 'linear-gradient(120deg,#4f3a2a,#a98563 50%,#e6d3b0)',
  digicam: 'linear-gradient(120deg,#0e1f33,#3b7fa8 50%,#ffa23a 88%)',
  noir: 'linear-gradient(120deg,#050505,#4d4d4d 55%,#e6e6e6)',
};
const TEXT_COLORS = ['#efe6d2', '#ffffff', '#0b0d12', '#c7b48f', '#9fb8dc'];

/** Einstellungen prüfen und auf das aktuelle Schema bringen; unbekannte oder alte Felder fallen weg. */
const pick1 = (v, list, def) => (list.includes(v) ? v : def);
function normalizeSettings(st, defaults) {
  const s = { ...defaults, ...(st || {}) };
  const legacy = { intro: { kinetic: 'type', polaroid: 'auto', glitch: 'auto', route: 'city' }, outro: { polaroid: 'auto', glitch: 'auto' }, look: { sommer: 'golden', traum: 'natur' }, format: { '1:1': '4:5' } };
  for (const k of Object.keys(legacy)) if (legacy[k][s[k]]) s[k] = legacy[k][s[k]];
  return {
    format: FORMATS[s.format] ? s.format : '9:16',
    look: s.look === 'auto' || LOOKS[s.look] ? s.look : 'auto',
    pace: pick1(s.pace, ['auto', 'ruhig', 'mittel', 'schnell'], 'auto'),
    intro: pick1(s.intro, ['auto', 'rush', 'reveal', 'countdown', 'grid', 'knockout', 'cinema', 'city', 'hook', 'type', 'split'], 'auto'),
    outro: pick1(s.outro, ['auto', 'credits', 'loop', 'freeze', 'split', 'strip'], 'auto'),
    pre: pick1(s.pre, ['off', 'countdown', 'rewind'], 'off'),
    target: pick1(s.target, ['story', 'reel'], 'story'),
    allMedia: pick1(s.allMedia, ['on', 'off'], 'on'),
    match: pick1(s.match, ['auto', 'off'], 'auto'),
    morph: pick1(s.morph, ['off', 'on'], 'off'),
    ramp: pick1(s.ramp, ['off', 'drop'], 'off'),
    stamp: pick1(s.stamp, ['auto', 'on', 'off'], 'auto'),
    midGrid: pick1(s.midGrid, ['off', 'on'], 'off'),
    midCount: pick1(s.midCount, ['off', 'drop'], 'off'),
    length: s.length === 'auto' || s.length === 'full' || (+s.length > 0 && +s.length <= 600) ? s.length : 'auto',
    songStart: s.songStart == null ? 'auto' : s.songStart,
    frame: pick1(s.frame, ['auto', 'full', 'band'], 'auto'),
    split: pick1(s.split, ['auto', 'more', 'off'], 'auto'),
    seed: Number.isFinite(+s.seed) ? +s.seed : 7,
    font: FONT_SETS[s.font] ? s.font : 'klassisch',
    km: pick1(s.km, ['off', 'coords', 'leg', 'total'], 'off'),
    mapTheme: MAP_THEMES[s.mapTheme] ? s.mapTheme : 'nacht',
    mapInk: pick1(s.mapInk, MAP_INKS, ''),
    mapLand: pick1(s.mapLand, ['dots', 'solid', 'off'], 'dots'),
    flightView: pick1(s.flightView, ['globe', 'flat'], 'globe'),
    motion: pick1(s.motion, ['ken', 'snap', 'pulse', 'sway', 'float', 'tilt', 'handheld'], 'ken'),
    motionAmt: pick1(s.motionAmt, ['soft', 'medium', 'strong'], 'medium'),
    burst: pick1(s.burst, ['off', 'drop'], 'off'),
    color: pick1(s.color, ['auto', 'off', 'drop', 'steps', 'bloom', 'sweep', 'pop'], 'auto'),
    accent: pick1(s.accent, ['auto', 'off', 'kick', 'kicksnare'], 'auto'),
    parallax: pick1(s.parallax, ['auto', 'on', 'off'], 'auto'),
    drift: pick1(s.drift, ['auto', 'on', 'off'], 'auto'),
    echo: pick1(s.echo, ['auto', 'on', 'off'], 'auto'),
    stack: pick1(s.stack, ['auto', 'on', 'off'], 'auto'),
    mini: pick1(s.mini, ['auto', 'on', 'off'], 'auto'),
    chapKnock: pick1(s.chapKnock, ['auto', 'on', 'off'], 'auto'),
    chapMap: pick1(s.chapMap, ['on', 'off'], 'on'),
    showTitle: s.showTitle !== false,
    showChapters: s.showChapters !== false,
    showStats: s.showStats !== false,
  };
}

/* ---------- Stil-Vorlage: ein Stil für alle Filme der Reise ---------- */
const STYLE_KEYS = ['look', 'font', 'motion', 'motionAmt', 'pre', 'intro', 'outro', 'match', 'morph', 'ramp', 'stamp', 'midGrid', 'midCount', 'allMedia', 'color', 'accent', 'parallax', 'drift', 'echo', 'stack', 'mini', 'chapKnock', 'chapMap', 'pace', 'frame', 'split', 'burst', 'km', 'mapTheme', 'mapInk', 'mapLand', 'flightView', 'showTitle', 'showChapters', 'showStats'];
const styleOf = (st) => Object.fromEntries(STYLE_KEYS.map((k) => [k, st[k]]));
/** Einstellungen für neue Filme: Standard, darüber die Vorlage der Reise */
function baseSettings(defaults) {
  return normalizeSettings({ ...defaults, ...((S.trip && S.trip.style) || {}), seed: Math.floor(Math.random() * 1e6) }, defaults);
}
function styleSummary(st) {
  const names = { snap: 'Impact-Zoom', sway: 'Pendeln', pulse: 'Puls', float: 'Schweben', tilt: 'Neigen', handheld: 'Handkamera' };
  const intros = { reveal: 'Aufblende', countdown: 'Countdown', grid: '9er-Raster', knockout: 'Durch den Namen', cinema: 'Titelkarte', city: 'Ortsname', hook: 'Stärkstes Bild', type: 'Wort für Wort', split: 'Split-Screen' };
  return [st.look === 'auto' ? 'Look automatisch' : `Look ${LOOKS[st.look].label}`, `Schrift ${FONT_SETS[st.font].label}`, names[st.motion], st.pre !== 'off' ? (st.pre === 'rewind' ? 'Rewind' : 'Countdown') + ' +' : '', intros[st.intro], st.morph === 'on' ? 'Bild aus Bild' : '', st.burst === 'drop' ? 'Foto-Serie' : '', st.ramp === 'drop' ? 'Speed-Ramp' : '', st.km !== 'off' ? 'Koordinaten' : ''].filter(Boolean).join(' · ');
}

function openStyleSheet() {
  const ctx = S.ctx;
  const tpl = S.trip.style ? normalizeSettings(S.trip.style, DEFAULT_SETTINGS) : null;
  const n = S.places.filter((p) => !p.demo).length;
  const body = openSheet(`
    <h3 id="sheetTitle">Stil-Vorlage</h3>
    <p class="hint">${tpl ? `Aktuelle Vorlage: <b>${esc(styleSummary(tpl))}</b>` : 'Noch keine Vorlage. Speichere den Stil dieses Films, um ihn auf deine anderen Orte zu übertragen.'}</p>
    <div class="sheet-actions">
      <button class="btn${tpl ? '' : ' primary'}" data-act="save" type="button">Stil dieses Films als Vorlage speichern</button>
      ${tpl ? '<button class="btn" data-act="here" type="button">Vorlage auf diesen Film anwenden</button>' : ''}
      ${tpl ? `<button class="btn primary" data-act="all" type="button">Vorlage auf alle ${n} Filme und den Gesamtfilm anwenden</button>` : ''}
    </div>
    <p class="hint small">Übertragen werden Look, Schrift, Bewegung, Einstieg, Ende, Tempo, Foto-Serie, Einblendungen und Flugkarte. Format, Song und eigene Texte bleiben je Film erhalten. Neue Orte übernehmen die Vorlage automatisch.</p>`);
  const applyTo = (rec, defaults) => { rec.settings = normalizeSettings({ ...rec.settings, ...S.trip.style }, defaults); };
  body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'save') {
      S.trip.style = styleOf(ctx.rec.settings);
      await S.store.put('trip', S.trip);
      closeSheet();
      renderStyle();
      toast('Stil als Vorlage gespeichert.');
      return;
    }
    if (a.dataset.act === 'here') applyTo(ctx.rec, ctx.kind === 'bestof' ? BESTOF_DEFAULTS : DEFAULT_SETTINGS);
    if (a.dataset.act === 'all') {
      for (const p of S.places) {
        if (p.demo) continue;
        applyTo(p, DEFAULT_SETTINGS);
        await S.store.put('places', p);
      }
      if (S.trip.bestof) applyTo(S.trip.bestof, BESTOF_DEFAULTS);
      await S.store.put('trip', S.trip);
      // der geöffnete Film ist evtl. eine eigene Kopie des Datensatzes
      const cur = ctx.kind === 'bestof' ? S.trip.bestof : S.places.find((p) => p.id === ctx.rec.id);
      if (cur && cur !== ctx.rec) ctx.rec.settings = cur.settings;
      if (ctx.kind === 'place' && ctx.rec.demo) applyTo(ctx.rec, DEFAULT_SETTINGS);
    }
    closeSheet();
    commit();
    savePlaceSoon();
    renderStyle();
    await rebuild();
    toast(a.dataset.act === 'all' ? 'Vorlage auf alle Filme übertragen.' : 'Vorlage angewendet.');
  });
}

const S = {
  store: new Store(),
  trip: null,
  places: [],
  ctx: null,
  plan: null,
  tab: 'style',
  selOverlay: null,
  selClip: -1,
  hist: { stack: [], idx: -1 },
  exporting: false,
  songs: new Map(),
  pool: new Map(),
};
let engine = null;
let downloadsCap = null;
let rebuildTimer = 0;
let saveTimer = 0;
let stripBase = null;

/* ---------- Hilfen ---------- */
function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('err', !!isErr);
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), isErr ? 6000 : 2800);
}
function busy(text) {
  const b = $('busy');
  if (text) { $('busyText').textContent = text; b.hidden = false; } else b.hidden = true;
}
const fmtClock = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + String(r).padStart(2, '0'); };
const fmtTC = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60), f = Math.floor((s % 1) * 30); return [m, r, f].map((x) => String(x).padStart(2, '0')).join(':'); };
const fmtBytes = (b) => (b > 1e6 ? (b / 1e6).toFixed(1).replace('.', ',') + ' MB' : Math.round(b / 1e3) + ' kB');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function monthLabel(times) {
  const ts = times.filter((t) => t && t > 946684800000);
  if (!ts.length) return '';
  const d = new Date(ts.sort((a, b) => a - b)[Math.floor(ts.length / 2)]);
  return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}
function dateStamp(times) {
  const ts = times.filter((t) => t && t > 946684800000);
  const d = ts.length ? new Date(Math.min(...ts)) : new Date();
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function setRadio(groupEl, value) {
  for (const b of groupEl.querySelectorAll('[role="radio"]')) {
    const on = b.dataset.v === String(value);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  }
  if (!groupEl.querySelector('[aria-checked="true"]')) { const f = groupEl.querySelector('[role="radio"]'); if (f) f.tabIndex = 0; }
}
function bindRadio(groupEl, onPick) {
  groupEl.addEventListener('click', (e) => {
    const b = e.target.closest('[role="radio"]');
    if (!b || !groupEl.contains(b)) return;
    onPick(b.dataset.v);
  });
  groupEl.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const items = Array.from(groupEl.querySelectorAll('[role="radio"]'));
    const i = Math.max(0, items.findIndex((x) => x.getAttribute('aria-checked') === 'true'));
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const n = items[(i + d + items.length) % items.length];
    e.preventDefault();
    n.focus();
    onPick(n.dataset.v);
  });
}
function radioHTML(name, options, value) {
  return `<div class="chips" role="radiogroup" aria-label="${esc(name)}">${options.map(([v, l]) => `<button type="button" role="radio" data-v="${esc(v)}" aria-checked="${String(v) === String(value)}" tabindex="${String(v) === String(value) ? 0 : -1}">${l}</button>`).join('')}</div>`;
}

/* ---------- Sheet ---------- */
let sheetOnClose = null;
function openSheet(html, onClose) {
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
  $('sheetBody').innerHTML = html;
  $('sheet').hidden = false;
  $('sheetBackdrop').hidden = false;
  sheetOnClose = onClose || null;
  const f = $('sheet').querySelector('button, input, textarea');
  if (f) setTimeout(() => { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 50);
  return $('sheetBody');
}
function closeSheet() {
  if (S.exporting) return;
  $('sheet').hidden = true;
  $('sheetBackdrop').hidden = true;
  // Videos im Blatt sofort freigeben (Dekoder), bevor das Blatt geleert wird
  for (const v of $('sheetBody').querySelectorAll('video')) { v.removeAttribute('src'); try { v.load(); } catch (e) { /* egal */ } }
  $('sheetBody').innerHTML = '';
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
}

/* ---------- Songs ---------- */
function decodeAudioFile(arrayBuf) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, 44100, 44100);
  return new Promise((resolve, reject) => {
    let settled = false;
    const ok = (b) => { if (!settled) { settled = true; resolve(b); } };
    const no = (e) => { if (!settled) { settled = true; reject(e || new Error('decode')); } };
    try {
      const p = ctx.decodeAudioData(arrayBuf, ok, no);
      if (p && p.then) p.then(ok, no);
    } catch (e) { no(e); }
  });
}

/** Dekodierte Songs belegen viel Speicher (3 min ≈ 60 MB): nur den aktuellen, den vorigen und das Beispiel behalten. */
function keepSong(song) {
  S.songs.delete(song.id);
  S.songs.set(song.id, song);
  const others = [...S.songs.keys()].filter((k) => k !== 'demo');
  while (others.length > 2) S.songs.delete(others.shift());
}

async function getSong(songId) {
  if (S.songs.has(songId)) { const sg = S.songs.get(songId); keepSong(sg); return sg; }
  if (songId !== 'demo') {
    const r = await S.store.get('work', songId).catch(() => null);
    if (!r || r.type !== 'song') throw new Error('Song nicht geladen');
    busy('Lade Song …');
    try {
      const buffer = r.pcm ? pcmBuffer(r.pcm, r.sampleRate) : await decodeAudioFile(await r.file.arrayBuffer());
      // ältere Analysen (ungenauere Beats) einmal erneuern und zurückschreiben
      const fresh = r.an && r.an.ver === AN_VER;
      const an = fresh ? r.an : await analyzeAudio(buffer, (p) => busy(`Analysiere Songaufbau … ${Math.round(p * 100)} %`));
      if (!fresh) { r.an = an; S.store.put('work', r).catch(() => {}); }
      const song = { id: r.id, name: r.name, buffer, an, mic: r.mic, offset: r.offset || 0 };
      keepSong(song);
      return song;
    } finally { busy(null); }
  }
  // Beispiel-Song nur einmal erzeugen (auch wenn mehrere gleichzeitig danach fragen)
  if (!S.demoSong) S.demoSong = (async () => {
    const buffer = await synthDemoSong();
    const an = await analyzeAudio(buffer);
    const song = { id: 'demo', name: 'Beispiel-Beat', buffer, an, demo: true };
    S.songs.set('demo', song);
    return song;
  })();
  return S.demoSong;
}

async function useSong(song) {
  S.ctx.song = song;
  S.ctx.rec.songId = song.id;
  busy(null);
  commit();
  savePlaceSoon();
  renderMusic();
  engine.t = 0;
  await rebuild({ fresh: true });
  toast(`Songaufbau erkannt: ${song.an.sections.length} Abschnitte, ${Math.round(song.an.bpm)} BPM.`);
}

async function importSong(file) {
  busy('Lese Song …');
  const audio = await decodeAudioFile(await file.arrayBuffer());
  if (!audio || audio.duration < 5) throw new Error('kurz');
  const an = await analyzeAudio(audio, (p) => busy(`Analysiere Songaufbau … ${Math.round(p * 100)} %`));
  const song = { id: uid('s'), name: file.name.replace(/\.[^.]+$/, ''), buffer: audio, an };
  keepSong(song);
  saveSong(song, file);
  return song;
}

/* ---------- Song mithören: Mikrofon, Analyse lokal, nie exportiert ---------- */
function parseClock(v) {
  const m = String(v || '').trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return 0;
  return m[2] === undefined ? +m[1] : +m[1] * 60 + +m[2];
}

const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
const APP_URL = 'lelsalk-maker.github.io/Cinebeat';

function micErrorText(e) {
  const n = e && e.name;
  if (inFrame) return `Im Claude-Link ist das Mikrofon grundsätzlich gesperrt. Öffne CineBeat über ${APP_URL} (am besten vom Home-Bildschirm), dort funktioniert Mithören.`;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Das Mikrofon ist für CineBeat gesperrt. iPhone: in Safari auf „aA“ bzw. das Menü links in der Adresszeile → Website-Einstellungen → Mikrofon → „Fragen“. Oder Einstellungen → Apps → Safari → Mikrofon → „Fragen“. Danach CineBeat neu öffnen.';
  if (n === 'NotFoundError') return 'Kein Mikrofon gefunden.';
  if (n === 'NotReadableError' || n === 'AbortError') return 'Das Mikrofon wird gerade von einer anderen App benutzt (z. B. Telefonat oder Sprachmemo). Beende sie und versuch es noch einmal.';
  return `Mikrofon konnte nicht gestartet werden (${n || 'unbekannt'}). Öffne CineBeat neu und versuch es noch einmal.`;
}

function openMicSheet() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast(inFrame ? micErrorText(null) : `Mithören braucht die Web-App über https: ${APP_URL}`, true); return; }
  engine.pause();
  let rec = null;
  const stop = () => { if (rec) { rec.stop(); rec = null; } };
  const body = openSheet(`
    <h3 id="sheetTitle">Song mithören</h3>
    <p class="hint">Spiel den Song auf einem <b>zweiten Gerät</b> oder Lautsprecher ab, z. B. Spotify am Laptop. Auf demselben iPhone stoppt iOS die Musik, sobald das Mikrofon läuft.</p>
    <label class="field"><span class="field-label">Songname für Instagram</span><input class="text-in" id="micName" maxlength="60" placeholder="z. B. Titel – Interpret" autocomplete="off"></label>
    <label class="field"><span class="field-label">Der Song läuft ab</span><input class="text-in" id="micOffset" inputmode="numeric" value="0:00" maxlength="5" aria-describedby="micOffHint"></label>
    <p class="hint small" id="micOffHint">Starte am besten am Songanfang. Wenn du später einsteigst, trag die Stelle ein, damit die Startzeit für Instagram stimmt.</p>
    ${inFrame ? `<p class="note">Im Claude-Link sperrt die Umgebung das Mikrofon. Öffne CineBeat über <b>${APP_URL}</b>, dort fragt das iPhone nach dem Zugriff.</p>` : ''}
    <p class="note" id="micDenied" hidden></p>
    <div class="mic-meter" aria-hidden="true"><span id="micLevel"></span></div>
    <p class="hint small" id="micTime">bereit</p>
    <button class="btn primary big" id="micGo" type="button">Aufnahme starten</button>
    <p class="hint small">Nur zur Analyse und Vorschau: Die Aufnahme bleibt im Zwischenspeicher auf deinem Gerät und wird nie mit exportiert.</p>`, stop);
  const go = body.querySelector('#micGo');
  // bereits abgelehnt? Dann gleich sagen, wie man es wieder erlaubt
  try {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' }).then((st) => { if (st.state === 'denied') { const d = body.querySelector('#micDenied'); if (d) { d.textContent = micErrorText({ name: 'NotAllowedError' }); d.hidden = false; } } }, () => {});
    }
  } catch (e) { /* nicht unterstützt */ }
  go.addEventListener('click', async () => {
    if (rec) { if (rec.secs() >= 12) finish(); return; }
    go.disabled = true;
    body.querySelector('#micTime').textContent = 'Mikrofon wird gestartet …';
    try {
      rec = await startMicCapture((lvl, secs) => {
        body.querySelector('#micLevel').style.transform = `scaleX(${Math.min(1, lvl * 4).toFixed(3)})`;
        body.querySelector('#micTime').textContent = `${fmtClock(secs)} · ${secs < 12 ? 'noch ' + Math.ceil(12 - secs) + ' s mindestens' : secs < 30 ? '30–60 s sind ideal' : 'gut, du kannst stoppen'}`;
        go.disabled = secs < 12;
        if (secs >= 90) finish();
      });
      go.textContent = 'Fertig';
      go.disabled = true;
    } catch (e) {
      rec = null;
      go.disabled = false;
      body.querySelector('#micTime').textContent = 'bereit';
      const d = body.querySelector('#micDenied');
      if (d) { d.textContent = micErrorText(e); d.hidden = false; }
    }
  });
  async function finish() {
    if (!rec) return;
    const r = rec;
    rec = null;
    const buffer = r.stop();
    const name = body.querySelector('#micName').value.trim() || 'Mitgehörter Song';
    const offset = parseClock(body.querySelector('#micOffset').value);
    closeSheet();
    try {
      busy('Analysiere Songaufbau …');
      const an = await analyzeAudio(buffer, (p) => busy(`Analysiere Songaufbau … ${Math.round(p * 100)} %`));
      const song = { id: uid('s'), name, buffer, an, mic: true, offset };
      keepSong(song);
      saveSong(song);
      await useSong(song);
    } catch (e) {
      busy(null);
      toast('Das war zu leise oder zu kurz. Versuch es etwas lauter und länger.', true);
    }
  }
}

/** Nimmt Mono-PCM direkt im Arbeitsspeicher auf; stop() liefert einen AudioBuffer und gibt das Mikrofon sofort frei. */
const setAudioSession = (type) => { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) { /* ältere Systeme */ } };

/**
 * Startet die Aufnahme direkt in der Nutzeraktion (iOS): Audio-Sitzung auf „abspielen und aufnehmen“,
 * AudioContext sofort anlegen, dann Mikrofon anfragen. Gibt eine Steuerung zurück.
 */
function startMicCapture(onTick) {
  setAudioSession('play-and-record');
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const resumed = ctx.resume().catch(() => {});
  const md = navigator.mediaDevices;
  const plain = () => md.getUserMedia({ audio: true });
  return md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    .catch((e) => (e && (e.name === 'OverconstrainedError' || e.name === 'TypeError') ? plain() : Promise.reject(e)))
    .then(async (stream) => {
      await Promise.race([resumed, new Promise((r) => setTimeout(r, 1500))]);
      return micRecorder(ctx, stream, onTick);
    })
    .catch((e) => { ctx.close().catch(() => {}); setAudioSession('playback'); throw e; });
}

function micRecorder(ctx, stream, onTick) {
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  const chunks = [];
  let n = 0;
  proc.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(d));
    n += d.length;
    let pk = 0;
    for (let i = 0; i < d.length; i += 16) pk = Math.max(pk, Math.abs(d[i]));
    onTick(pk, n / ctx.sampleRate);
  };
  src.connect(proc);
  proc.connect(mute).connect(ctx.destination);
  return {
    secs: () => n / ctx.sampleRate,
    stop() {
      proc.onaudioprocess = null;
      try { src.disconnect(); proc.disconnect(); } catch (e) { /* ignore */ }
      for (const t of stream.getTracks()) t.stop();
      setAudioSession('playback');
      const sr = ctx.sampleRate;
      ctx.close().catch(() => {});
      const all = new Float32Array(n);
      let o = 0, pk = 0;
      for (const c of chunks) { all.set(c, o); o += c.length; }
      chunks.length = 0;
      for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(all[i]));
      const gain = pk > 1e-4 ? 0.9 / pk : 1;
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const buf = new OAC(1, Math.max(1, n), sr).createBuffer(2, Math.max(1, n), sr);
      for (let i = 0; i < n; i++) all[i] *= gain;
      buf.getChannelData(0).set(all);
      buf.getChannelData(1).set(all);
      return buf;
    },
  };
}

/* ---------- Übergangsspeicher: angefangene Projekte bleiben mit ihren Aufnahmen erhalten ---------- */
const KEEP_DAYS = 30;
const WORK_SKIP = new Set(['url', 'file', 'poster', 'audio', 'canvas', 'loading', 'bad', 'fav', 'excluded', 'sound', 'dupOf', 'noAudio', 'demo', 'id']);
let workFullShown = false;
function workFull() {
  if (workFullShown) return;
  workFullShown = true;
  toast('Der Speicher des Geräts ist voll. Neue Aufnahmen bleiben nur, solange die App offen ist.', true);
}
const workMeta = (m) => Object.fromEntries(Object.entries(m).filter(([k, v]) => !WORK_SKIP.has(k) && v != null && typeof v !== 'function' && !(typeof v === 'object' && v.nodeType)));

/** Aufnahme lokal zwischenspeichern: Original, Vorschaubild und Analyse (kein erneutes Einlesen nötig). */
async function saveWork(m) {
  if (!m.file || m.bad || m.demo) return;
  try {
    const poster = m.poster && m.poster.toBlob ? await new Promise((r) => m.poster.toBlob(r, 'image/jpeg', 0.85)) : null;
    await S.store.put('work', { id: m.id, type: 'media', file: m.file, poster, meta: workMeta(m), savedAt: Date.now() });
    S.store.persist();
  } catch (e) { workFull(); }
}

async function saveSong(song, file) {
  const rec = { id: song.id, type: 'song', name: song.name, an: song.an, mic: !!song.mic, offset: song.offset || 0, savedAt: Date.now() };
  if (song.mic) { rec.pcm = song.buffer.getChannelData(0).slice(); rec.sampleRate = song.buffer.sampleRate; } else rec.file = file;
  try { await S.store.put('work', rec); } catch (e) {
    try { delete rec.an; await S.store.put('work', rec); } catch (e2) { workFull(); }
  }
}

function pcmBuffer(pcm, sr) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const buf = new OAC(1, 1, sr).createBuffer(2, Math.max(1, pcm.length), sr);
  buf.getChannelData(0).set(pcm);
  buf.getChannelData(1).set(pcm);
  return buf;
}

/** Beim Start: Aufnahmen angefangener Projekte zurückholen, Veraltetes und Unbenutztes löschen. */
async function restoreWork() {
  let recs = [];
  try { recs = await S.store.all('work'); } catch (e) { return; }
  const now = Date.now(), maxAge = KEEP_DAYS * 864e5;
  const lastUse = new Map();
  const use = (id, t) => { if (id) lastUse.set(id, Math.max(lastUse.get(id) || 0, t || 0)); };
  for (const p of S.places) {
    const t = p.edited || p.created || 0;
    for (const fp of p.fps || []) use(fp, t);
    use(p.songId, t);
  }
  if (S.trip.bestof) use(S.trip.bestof.songId, S.trip.edited || S.trip.created);
  for (const r of recs) {
    const last = lastUse.get(r.id);
    if (!last || now - Math.max(last, r.savedAt || 0) > maxAge) { try { await S.store.del('work', r.id); } catch (e) { /* egal */ } continue; }
    if (r.type !== 'media' || S.pool.has(r.id) || !r.file) continue;
    const it = { ...r.meta, id: r.id, file: r.file, url: URL.createObjectURL(r.file), loading: false };
    // Vorschaubild im Hintergrund dekodieren, der Start wartet nicht darauf
    if (r.poster) createImageBitmap(r.poster).then((b) => { it.poster = b; }, () => { /* ohne Vorschaubild */ });
    S.pool.set(r.id, it);
  }
}

/** Löscht zwischengespeicherte Aufnahmen und Songs, die kein Ort mehr verwendet. */
async function dropUnusedWork(ids) {
  const used = new Set();
  for (const p of S.places) { for (const fp of p.fps || []) used.add(fp); used.add(p.songId); }
  if (S.trip.bestof) used.add(S.trip.bestof.songId);
  for (const id of ids) {
    if (!id || used.has(id) || id === 'demo') continue;
    try { await S.store.del('work', id); } catch (e) { /* egal */ }
  }
}

/** Zwischenspeicher eines Orts leeren: Einstellungen bleiben, die Aufnahmen wählst du bei Bedarf neu. */
async function releasePlace(rec) {
  const others = new Set();
  for (const p of S.places) if (p !== rec && p.id !== rec.id) for (const fp of p.fps || []) others.add(fp);
  for (const fp of rec.fps || []) {
    if (others.has(fp)) continue;
    try { await S.store.del('work', fp); } catch (e) { /* egal */ }
    const m = S.pool.get(fp);
    if (m && m.url && m.file) URL.revokeObjectURL(m.url);
    S.pool.delete(fp);
  }
}

/* ---------- Medien ---------- */
function thumbFrom(source, sw, sh, size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const s = Math.max(size / sw, size / sh);
  ctx.drawImage(source, (size - sw * s) / 2, (size - sh * s) / 2, sw * s, sh * s);
  const url = c.toDataURL('image/jpeg', 0.75);
  c.width = 0; c.height = 0;
  return url;
}


/**
 * Gesichter mit der Gesichtserkennung des Browsers (lokal, wo verfügbar – sonst bleibt die Haut-Erkennung).
 * Das Motiv wird dann der Bereich um die Gesichter: Fahrten enden dort, Ausschnitte schneiden niemanden an.
 */
async function detectFaces(item, src, sw, sh) {
  if (typeof FaceDetector !== 'function') return;
  try {
    const faces = await new FaceDetector({ fastMode: true, maxDetectedFaces: 6 }).detect(src);
    if (!faces || !faces.length) return;
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const f of faces) { const b = f.boundingBox; x0 = Math.min(x0, b.x / sw); y0 = Math.min(y0, b.y / sh); x1 = Math.max(x1, (b.x + b.width) / sw); y1 = Math.max(y1, (b.y + b.height) / sh); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    item.faces = faces.length;
    item.people = 1;
    item.focus = [+cx.toFixed(3), +Math.min(0.8, cy + (y1 - y0) * 0.3).toFixed(3)];
    // Köpfe und Oberkörper sollen im Bild bleiben
    item.subject = [+cx.toFixed(3), +(cy + (y1 - y0) * 0.5).toFixed(3), +Math.min(0.95, (x1 - x0) * 1.8 + 0.1).toFixed(3), +Math.min(0.95, (y1 - y0) * 3 + 0.1).toFixed(3)];
  } catch (e) { /* nicht verfügbar */ }
}

async function probeAndScore(item) {
  if (item.kind === 'image') {
    // Maße aus dem Dateikopf (ohne das Bild zu dekodieren), dann direkt klein dekodieren:
    // Bewertung und Vorschaubild brauchen nur 480 px, nicht das volle Kamerabild
    const img = new Image();
    img.src = item.url;
    const ok = await waitEvent(img, ['load'], ['error'], 15000);
    if (!ok || !img.naturalWidth) throw new Error('Bild nicht lesbar');
    item.w = img.naturalWidth; item.h = img.naturalHeight;
    const small = await decodeImage({ ...item, url: item.url }, 480, true);
    img.src = '';
    const sw = small.width, sh = small.height;
    item.thumb = thumbFrom(small, sw, sh, 160);
    Object.assign(item, scoreImage(small, sw, sh));
    await detectFaces(item, small, sw, sh);
    if (small.close) small.close(); else { small.width = 0; small.height = 0; }
    return;
  }
  // Schnell: benötigte Stellen direkt aus der Datei dekodieren (MP4/MOV, WebCodecs)
  const fast = item.file ? await probeVideoFast(item.file) : null;
  if (fast && fast.duration > 0) {
    const { poster, ...rest } = fast;
    Object.assign(item, rest);
    item.poster = poster;
    item.thumb = thumbFrom(poster, poster.width, poster.height, 160);
    return;
  }
  const v = makeVideoEl();
  try {
    v.src = item.url;
    try { v.load(); } catch (e) { /* ignore */ }
    const ok = await waitEvent(v, ['loadedmetadata'], ['error'], 15000);
    if (!ok || !v.videoWidth) throw new Error('Video nicht lesbar');
    let dur = isFinite(v.duration) ? v.duration : 0;
    if (!dur) {
      v.currentTime = 1e7;
      await waitEvent(v, ['durationchange', 'seeked'], ['error'], 3000);
      dur = isFinite(v.duration) ? v.duration : 5;
    }
    item.duration = dur;
    item.w = v.videoWidth; item.h = v.videoHeight;
    await seekVideo(v, Math.min(1, dur * 0.2));
    if (v.readyState < 2) {
      try { await v.play(); v.pause(); } catch (e) { /* ignore */ }
      await waitEvent(v, ['loadeddata', 'canplay'], ['error'], 2500);
    }
    if (v.readyState < 2) throw new Error('Kein Bild');
    Object.assign(item, await scoreVideo(v, dur));
    const best = item.highlights && item.highlights[0] ? item.highlights[0].t : Math.min(1, dur * 0.2);
    await seekVideo(v, best);
    const s = Math.min(1, 720 / Math.max(item.w, item.h));
    const pc = document.createElement('canvas');
    pc.width = Math.max(2, Math.round(item.w * s)); pc.height = Math.max(2, Math.round(item.h * s));
    pc.getContext('2d').drawImage(v, 0, 0, pc.width, pc.height);
    item.poster = pc;
    item.thumb = thumbFrom(pc, pc.width, pc.height, 160);
  } finally {
    v.removeAttribute('src');
    try { v.load(); } catch (e) { /* ignore */ }
    v.remove();
  }
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|3gp|mkv)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i;
// Wiedererkennung ohne Dateinamen zu speichern: nur eine Prüfsumme aus Name, Größe und Datum
const fingerprint = (f) => 'f' + hashStr(`${f.name}|${f.size}|${f.lastModified || 0}`).toString(36) + (f.size % 1e6).toString(36);

/** Einfache Zählsperre: await acquire() liefert die Freigabe-Funktion. */
function semaphore(n) {
  const wait = [];
  return () => new Promise((res) => {
    const take = () => { n--; res(() => { n++; if (wait.length) wait.shift()(); }); };
    if (n > 0) take(); else wait.push(take);
  });
}

/** Führt fn für alle Elemente mit begrenzter Parallelität aus. */
async function mapLimit(list, limit, fn) {
  let next = 0;
  const run = async () => { while (next < list.length) { const i = next++; await fn(list[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, run));
}

/** Nimmt Dateien in den Arbeitsspeicher auf (bereits bekannte werden wiederverwendet). */
async function ingestFiles(fileList, onProgress) {
  const files = Array.from(fileList || []).filter((f) => /^(image|video)\//.test(f.type) || VIDEO_EXT.test(f.name) || IMAGE_EXT.test(f.name));
  const fresh = [], all = [];
  for (const f of files) {
    const fp = fingerprint(f);
    let it = S.pool.get(fp);
    if (!it) {
      it = {
        id: fp, kind: f.type.startsWith('video/') || (!f.type.startsWith('image/') && VIDEO_EXT.test(f.name)) ? 'video' : 'image',
        name: f.name, file: f, url: URL.createObjectURL(f), time: f.lastModified || Date.now(), loading: true,
      };
      S.pool.set(fp, it);
      fresh.push(it);
    }
    all.push(it);
  }
  let done = 0, bad = 0;
  // Parallel, aber schonend: ein Foto wird beim Lesen kurz in voller Kameraauflösung dekodiert (48 MP ≈ 190 MB),
  // Videos brauchen einen der wenigen Hardware-Dekoder. Mehr gleichzeitig bringt kaum Tempo, aber Abstürze.
  const vids = semaphore(1);
  await mapLimit(fresh, 2, async (it) => {
    const release = it.kind === 'video' ? await vids() : null;
    try { await ingestOne(it); } finally { release && release(); }
    done++;
    onProgress && onProgress(done, fresh.length);
  });
  async function ingestOne(it) {
    const meta = await readMediaMeta(it.file, it.kind);
    if (meta.time) it.time = meta.time;
    if (meta.pos) it.pos = meta.pos;
    try { await probeAndScore(it); } catch (e) { it.bad = true; bad++; }
    it.loading = false;
    if (!it.bad) saveWork(it);
  }
  return { items: all, fresh, bad, skipped: Array.from(fileList || []).length - files.length };
}

function applyFlags(rec, items) {
  const fl = rec.flags || {};
  for (const m of items) { const f = fl[m.id]; m.fav = !!(f && f.fav); m.excluded = !!(f && f.excluded); m.sound = (f && f.sound) || 0; m.trim = (f && f.trim) || null; }
  markDuplicates(items);
}

function placeMedia(rec) {
  const items = (rec.fps || []).map((fp) => S.pool.get(fp)).filter(Boolean);
  applyFlags(rec, items);
  return items.sort((a, b) => (a.time || 0) - (b.time || 0));
}

function updatePlaceMeta(rec, items) {
  if (isFlight(rec)) { rec.mediaCount = (rec.fps || []).length; return; }
  const good = items.filter((m) => !m.bad && !m.loading);
  const pos = centroid(good);
  if (pos) rec.pos = pos;
  const times = good.map((m) => m.time).filter(Boolean);
  if (times.length) { rec.from = Math.min(...times); rec.to = Math.max(...times); }
  rec.mediaCount = (rec.fps || []).length;
}

function saveMediaFlags(item) {
  // Markierungen gehören dem Ort, zu dem die Aufnahme gehört (auch aus dem Gesamtfilm heraus)
  const rec = S.ctx && S.ctx.kind === 'place' ? S.ctx.rec : S.places.find((p) => (p.fps || []).includes(item.id));
  if (!rec) return;
  rec.flags = rec.flags || {};
  if (item.fav || item.excluded || item.sound || item.trim) rec.flags[item.id] = { fav: !!item.fav, excluded: !!item.excluded, sound: item.sound || 0, trim: item.trim || null };
  else delete rec.flags[item.id];
  if (rec === (S.ctx && S.ctx.rec)) savePlaceSoon(); else S.store.put('places', rec).catch(() => {});
}

/** Originalton eines Videos lokal dekodieren (nur im Arbeitsspeicher). */
async function ensureVoice(m) {
  if (m.kind !== 'video' || m.audio || m.noAudio) return;
  if (!m.file) { m.noAudio = 'demo'; return; }
  if (m.file.size > 450e6) { m.noAudio = 'big'; return; }
  try {
    m.audio = await decodeAudioFile(await m.file.arrayBuffer());
    if (!m.audio || m.audio.duration < 0.2) { m.audio = null; m.noAudio = 'none'; }
  } catch (e) { m.noAudio = 'none'; }
}
const VOICE_LEVELS = [['0', 'Stumm'], ['0.5', 'Leise'], ['1', 'Normal']];
const noAudioText = (m) => (m.noAudio === 'big' ? 'Dieses Video ist zu groß, um den Ton auf dem Handy zu lesen (über 450 MB). Kürze es in der Fotos-App.' : m.noAudio === 'demo' ? 'Beispielvideos haben keinen Ton.' : 'Dieses Video hat keine lesbare Tonspur.');

async function setVoice(m, level) {
  m.sound = level;
  if (level > 0) {
    busy('Lese Originalton …');
    await ensureVoice(m);
    busy(null);
    if (!m.audio) { m.sound = 0; toast(noAudioText(m), true); }
  }
  saveMediaFlags(m);
  commit();
  renderMaterial();
  await rebuild();
}

function badToast(bad, skipped) {
  const n = bad + skipped;
  if (n) toast(n === 1 ? 'Eine Datei kann dieser Browser nicht öffnen und wird übersprungen.' : `${n} Dateien kann dieser Browser nicht öffnen und werden übersprungen.`, true);
}

/** Fotos für den geöffneten Ort. Bekannte Fotos anderer Orte gehen automatisch dorthin zurück. */
async function addFiles(fileList) {
  const ctx = S.ctx;
  if (!ctx || ctx.kind !== 'place') return;
  engine && engine.pause();
  busy('Lese Aufnahmen …');
  const res = await ingestFiles(fileList, (d, n) => busy(`Lese und bewerte ${d} von ${n} …`));
  if (!res.items.length) { busy(null); toast('Keine Fotos oder Videos gefunden.', true); return; }
  const owner = new Map();
  for (const p of S.places) for (const fp of p.fps || []) owner.set(fp, p.id);
  const rec = ctx.rec;
  if (rec.demo) { rec.demo = false; rec.fps = []; rec.flags = {}; rec.sub = ''; rec.name = rec.name === 'Lissabon' ? 'Neuer Ort' : rec.name; rec.overrides = { clips: {}, texts: [], stickers: [] }; rec.hookId = null; }
  let elsewhere = 0;
  for (const it of res.items) {
    const o = owner.get(it.id);
    if (o && o !== rec.id) { elsewhere++; continue; }
    if (!(rec.fps || []).includes(it.id)) (rec.fps = rec.fps || []).push(it.id);
  }
  ctx.media = placeMedia(rec);
  updatePlaceMeta(rec, ctx.media);
  if (!rec.sub) { rec.sub = dateRangeLabel(rec.from, rec.to) || monthLabel(ctx.media.map((m) => m.time)); $('placeSub').value = rec.sub; }
  if (isFlight(rec)) { fillFlightPlaces(rec); $('placeName').value = rec.name; $('placeSub').value = rec.sub || ''; }
  if ((!rec.name || rec.name === 'Neuer Ort') && rec.pos) {
    const city = nearestCity(rec.pos);
    if (city) { rec.name = city; $('placeName').value = city; }
  }
  busy(null);
  badToast(res.bad, res.skipped);
  if (elsewhere) toast(`${elsewhere} ${elsewhere === 1 ? 'Aufnahme gehört' : 'Aufnahmen gehören'} zu anderen Orten und ${elsewhere === 1 ? 'wurde' : 'wurden'} dort wieder zugeordnet.`);
  savePlaceSoon();
  commit();
  renderMaterial();
  rebuild({ fresh: true });
}

function removeMedia(id) {
  const ctx = S.ctx;
  const rec = ctx.rec;
  rec.fps = (rec.fps || []).filter((fp) => fp !== id);
  if (rec.flags) delete rec.flags[id];
  if (rec.hookId === id) rec.hookId = null;
  ctx.media = placeMedia(rec);
  updatePlaceMeta(rec, ctx.media);
  savePlaceSoon();
  renderMaterial();
  rebuild();
  dropUnusedWork([id]);
}

/* ---------- Reise-Import: alle Fotos auf einmal, Orte automatisch ---------- */
async function importTrip(fileList) {
  const prog = openSheet(`<h3 id="sheetTitle">Reise wird gelesen</h3>
    <div class="progress"><div class="progress-bar"><span id="impBar"></span></div>
    <div class="progress-meta"><span id="impStage">Lese Aufnahmen …</span><span id="impPct">0 %</span></div></div>
    <p class="hint small">Zeit und Standort werden direkt auf deinem Gerät aus den Aufnahmen gelesen. Nichts wird hochgeladen.</p>`);
  const res = await ingestFiles(fileList, (d, n) => {
    const b = prog.querySelector('#impBar'), p = prog.querySelector('#impPct'), s = prog.querySelector('#impStage');
    if (b) b.style.width = Math.round((d / n) * 100) + '%';
    if (p) p.textContent = Math.round((d / n) * 100) + ' %';
    if (s) s.textContent = `Lese und bewerte ${d} von ${n} …`;
  });
  const items = res.items.filter((m) => !m.bad);
  if (!items.length) { closeSheet(); toast('Keine lesbaren Fotos oder Videos gefunden.', true); return; }
  // Demo-Ort weicht der echten Reise
  const demo = S.places.find((p) => p.demo);
  if (demo) { S.places = S.places.filter((p) => p !== demo); await S.store.del('places', demo.id); }
  const owner = new Map();
  for (const p of S.places) for (const fp of p.fps || []) owner.set(fp, p);
  const newItems = items.filter((m) => !owner.has(m.id));
  const stops = clusterStops(newItems);
  const touched = [];
  for (const st of stops) {
    let rec = st.pos ? S.places.find((p) => p.pos && haversineKm(p.pos, st.pos) < 25) : null;
    if (!rec) {
      rec = {
        id: uid('p'), name: st.name || `Stopp ${S.places.length + 1}`, sub: dateRangeLabel(st.from, st.to), created: Date.now(), songId: 'demo',
        settings: baseSettings(DEFAULT_SETTINGS), overrides: { clips: {}, texts: [], stickers: [] }, hookId: null, fps: [], flags: {},
        autoName: !st.name,
      };
      S.places.push(rec);
    }
    for (const m of st.items) if (!rec.fps.includes(m.id)) rec.fps.push(m.id);
    updatePlaceMeta(rec, placeMedia(rec));
    touched.push(rec);
  }
  const known = items.length - newItems.length;
  for (const p of S.places) await S.store.put('places', p);
  renderTrip();
  if (!touched.length) {
    closeSheet();
    toast(`${known} ${known === 1 ? 'Aufnahme' : 'Aufnahmen'} wieder den Orten zugeordnet.`);
    return;
  }
  showImportSummary(touched, known, res.bad + res.skipped);
}

function tripStops() {
  return S.places.filter((p) => !p.demo && p.from && !isFlight(p)).sort((a, b) => a.from - b.from);
}

/* ---------- Flüge ---------- */
const isFlight = (p) => !!(p && p.kind === 'flight');
function cityPos(name) {
  const n = String(name || '').trim().toLowerCase();
  const c = n && CITIES.find((x) => x[0].toLowerCase() === n);
  return c ? [c[1], c[2]] : null;
}
const hhmm = (t) => (t ? new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '');

/**
 * Rollen im Flug: Abflug = früheste Aufnahme (bevorzugt ein Video), Landung = späteste,
 * dazwischen die Aufnahmen an Bord. Eigene Wahl im Menü einer Aufnahme hat Vorrang.
 */
function flightRoles(rec) {
  const f = rec.flight || {};
  const items = placeMedia(rec).filter((m) => !m.bad && !m.loading && !m.excluded);
  if (!items.length) return null;
  const vids = items.filter((m) => m.kind === 'video');
  const pool = vids.length ? vids : items;
  const byT = pool.slice().sort((x, y) => (x.time || 0) - (y.time || 0));
  const has = (id) => items.some((m) => m.id === id);
  const takeoff = has(f.takeoffId) ? f.takeoffId : byT[0].id;
  const landing = has(f.landingId) && f.landingId !== takeoff ? f.landingId : (byT.filter((m) => m.id !== takeoff).pop() || byT[0]).id;
  const extras = items.filter((m) => m.id !== takeoff && m.id !== landing).sort((x, y) => (x.time || 0) - (y.time || 0)).map((m) => m.id);
  return { takeoff, landing, extras };
}

/** Flugdaten für Planer und Animation (Zeiten aus den Aufnahmen, Orte aus Eingabe oder GPS). */
function flightData(rec) {
  const roles = flightRoles(rec);
  if (!roles) return null;
  const f = rec.flight || {};
  const tk = S.pool.get(roles.takeoff), ld = S.pool.get(roles.landing);
  const from = { name: f.fromName || '', pos: cityPos(f.fromName) || (tk && tk.pos) || null };
  const to = { name: f.toName || '', pos: cityPos(f.toName) || (ld && ld.pos) || null };
  const dep = tk && tk.time, arr = ld && ld.time;
  const mins = roles.takeoff !== roles.landing && dep && arr && arr - dep > 6e5 && arr - dep < 72e6 ? Math.round((arr - dep) / 6e4) : 0;
  return {
    // Uhrzeiten nur, wenn sie plausibel eine Flugdauer ergeben
    from, to, dep: mins ? hhmm(dep) : '', arr: mins ? hhmm(arr) : '', mins, km: from.pos && to.pos ? Math.round(haversineKm(from.pos, to.pos)) : 0,
    takeoffId: roles.takeoff, landingId: roles.landing, extraIds: roles.extras,
  };
}

/** Nach dem Hinzufügen: fehlende Orte aus dem Standort von Abflug und Landung ergänzen. */
function fillFlightPlaces(rec) {
  const roles = flightRoles(rec);
  if (!roles) return;
  const f = rec.flight = rec.flight || {};
  const tk = S.pool.get(roles.takeoff), ld = S.pool.get(roles.landing);
  if (!f.fromName && tk && tk.pos) f.fromName = nearestCity(tk.pos, 90) || '';
  if (!f.toName && ld && ld.pos && roles.landing !== roles.takeoff) f.toName = nearestCity(ld.pos, 90) || '';
  rec.name = flightName(f);
  const t = tk && tk.time;
  if (t) { rec.from = t; rec.to = (ld && ld.time) || t; rec.sub = dateRangeLabel(t, t); }
}
const flightName = (f) => (f.fromName || f.toName ? `${f.fromName || '?'} – ${f.toName || '?'}` : 'Flug');

/** Flug anlegen oder Von/Nach ändern. Die Videos kommen danach wie gewohnt über „Material“ dazu. */
function openFlightSheet(rec) {
  const f = { ...(rec && rec.flight) };
  const body = openSheet(`
    <h3 id="sheetTitle">${rec ? 'Von und Nach' : 'Flug hinzufügen'}</h3>
    <p class="hint">${rec ? 'Ändere Abflug- und Zielort.' : 'Trag ein, von wo nach wo du geflogen bist. Danach wählst du die Videos vom Flug aus der Galerie: Start, Landung und gern den Blick aus dem Fenster. Die App ordnet sie nach Aufnahmezeit.'}</p>
    <div class="two-col">
      <label class="field"><span class="field-label">Von</span><input class="text-in" id="fFrom" list="cityList" autocomplete="off" maxlength="40" value="${esc(f.fromName || '')}" placeholder="z. B. Frankfurt"></label>
      <label class="field"><span class="field-label">Nach</span><input class="text-in" id="fTo" list="cityList" autocomplete="off" maxlength="40" value="${esc(f.toName || '')}" placeholder="z. B. Lissabon"></label>
    </div>
    <datalist id="cityList">${CITIES.map((c) => `<option value="${esc(c[0])}">`).join('')}</datalist>
    <p class="hint small">Städte aus der Liste erscheinen auf dem Globus. Leer lassen geht auch: Dann nimmt die App den Standort der Videos.</p>
    <button class="btn primary big" id="fSave" type="button">${rec ? 'Speichern' : 'Weiter zu den Videos'}</button>`);
  body.querySelector('#fSave').addEventListener('click', async () => {
    const r = rec || {
      id: uid('f'), kind: 'flight', created: Date.now(), songId: 'demo', settings: baseSettings(DEFAULT_SETTINGS),
      overrides: { clips: {}, texts: [], stickers: [] }, hookId: null, flags: {}, fps: [], flight: {},
    };
    r.flight = { ...(r.flight || {}), fromName: body.querySelector('#fFrom').value.trim(), toName: body.querySelector('#fTo').value.trim() };
    delete r.flight.fromPos; delete r.flight.toPos; delete r.flight.depT; delete r.flight.arrT;
    r.name = flightName(r.flight);
    if (!r.from) { r.from = Date.now(); r.to = r.from; r.sub = ''; }
    if (!rec) S.places.push(r);
    await S.store.put('places', r);
    closeSheet();
    if (S.ctx && S.ctx.rec === r) { $('placeName').value = r.name; await rebuild(); } else { renderTrip(); openPlace(r.id); }
  });
}

function tripKm(stops) {
  let km = 0;
  for (let i = 1; i < stops.length; i++) if (stops[i - 1].pos && stops[i].pos) km += haversineKm(stops[i - 1].pos, stops[i].pos);
  return km;
}

/** Reisedaten für den Film: Orte mit Position und gefahrenen Kilometern (Flugstrecken zählen nicht). */
function tripContext() {
  const ctx = S.ctx;
  if (ctx.kind === 'place' && isFlight(ctx.rec)) return null;
  const places = ctx.kind === 'bestof' ? ctx.chapters.map((c) => ({ name: c.title, pos: c.pos, from: c.from, id: c.placeId })) : tripStops().map((p) => ({ name: p.name, pos: p.pos, from: p.from, id: p.id }));
  if (!places.length) return null;
  const flights = S.places.filter(isFlight).map((p) => ({ toPos: cityPos((p.flight || {}).toName), depT: p.from })).filter((f) => f.toPos);
  const flownTo = (p) => p.pos && flights.some((f) => haversineKm(f.toPos, p.pos) < 150 && (!f.depT || !p.from || f.depT <= p.from + 864e5));
  let prev = null, total = 0;
  const stops = places.map((p, i) => {
    const d = prev && p.pos ? haversineKm(prev, p.pos) : 0;
    const legKm = i > 0 && d > 150 && flownTo(p) ? 0 : d;
    if (p.pos) prev = p.pos;
    total += legKm;
    return { name: p.name, pos: p.pos || null, legKm };
  });
  const all = ctx.kind === 'bestof';
  const idx = all ? stops.length - 1 : places.findIndex((p) => p.id === ctx.rec.id);
  if (idx < 0) return null;
  const st = tripStops();
  const days = st.length ? Math.max(1, Math.round(((st[st.length - 1].to || st[st.length - 1].from) - st[0].from) / 864e5) + 1) : 0;
  const statsParts = all ? { places: `${places.length} ${places.length === 1 ? 'Ort' : 'Orte'}`, km: total, days: days > 1 ? `${days} Tage` : '' } : null;
  return { stops, idx, all, statsParts };
}

function showImportSummary(touched, known, bad) {
  const stops = tripStops();
  const km = tripKm(stops);
  const body = openSheet(`
    <h3 id="sheetTitle">${touched.length} ${touched.length === 1 ? 'Ort' : 'Orte'} erkannt</h3>
    <p class="hint">${km > 1 ? `Strecke: ca. ${Math.round(km).toLocaleString('de-DE')} km Luftlinie. ` : ''}${known ? `${known} Aufnahmen waren schon zugeordnet. ` : ''}${bad ? `${bad} Dateien konnten nicht gelesen werden.` : ''}Namen kannst du hier anpassen.</p>
    <div class="sheet-actions">${touched.map((p) => `
      <label class="stop-row"><span class="stop-count">${(p.fps || []).length}</span>
        <input class="text-in" data-rename="${esc(p.id)}" value="${esc(p.name)}" maxlength="40" aria-label="Name für ${esc(p.name)}">
        <span class="stop-date">${esc(p.sub || '')}</span></label>`).join('')}</div>
    <p class="hint small">Kein Standort in den Fotos? Dann trennt die App nach Tagen. Du kannst Orte jederzeit umbenennen.</p>
    <button class="btn primary big" data-act="done" type="button">Fertig</button>`);
  body.addEventListener('input', (e) => {
    const inp = e.target.closest('[data-rename]');
    if (!inp) return;
    const p = S.places.find((x) => x.id === inp.dataset.rename);
    if (p) { p.name = inp.value; p.autoName = false; }
  });
  body.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-act="done"]')) return;
    for (const p of touched) await S.store.put('places', p);
    closeSheet();
    renderTrip();
  });
}

/* ---------- Weiterarbeiten nach einem Neustart ----------
 * iOS verwirft Web-Apps im Hintergrund (Galerie-Auswahl, Instagram, Sperrbildschirm) und lädt sie neu.
 * Gemerkt wird nur, wo du warst (Ort, Tab, Position), nichts von den Aufnahmen selbst. */
const RESUME_KEY = 'cinebeat.resume';
function saveResume() {
  try {
    if (!S.ctx) { localStorage.removeItem(RESUME_KEY); return; }
    localStorage.setItem(RESUME_KEY, JSON.stringify({ kind: S.ctx.kind, id: S.ctx.kind === 'place' ? S.ctx.rec.id : 'bestof', tab: S.tab, t: engine ? +engine.t.toFixed(2) : 0, at: Date.now() }));
  } catch (e) { /* ohne Speicher: dann eben Startseite */ }
}
function readResume() {
  try { return JSON.parse(localStorage.getItem(RESUME_KEY) || 'null'); } catch (e) { return null; }
}
async function resumeWork(r) {
  if (!r || Date.now() - r.at > 12 * 3600 * 1000) return false;
  if (r.kind === 'place' && !S.places.some((p) => p.id === r.id)) return false;
  if (r.tab) S.tab = r.tab;
  if (r.kind === 'bestof') await openBestof(); else await openPlace(r.id);
  if (!S.ctx) return false;
  if (r.t > 0 && S.plan) { engine.t = Math.min(r.t, S.plan.duration - 0.05); engine.renderStill(engine.t); }
  return true;
}

/* ---------- Kontext (Ort oder Gesamtfilm) ---------- */
async function openPlace(placeId) {
  const rec = S.places.find((p) => p.id === placeId);
  if (!rec) return;
  showView('edit');
  closeContext();
  if (rec.demo) await ensureDemoMedia(rec);
  rec.settings = normalizeSettings(rec.settings, DEFAULT_SETTINGS);
  rec.overrides = { clips: {}, texts: [], stickers: [], ...(rec.overrides || {}) };
  S.ctx = { kind: 'place', rec, media: placeMedia(rec), song: null };
  await attachSong(rec.songId || 'demo');
  startHistory();
  renderEditor();
  await rebuild({ fresh: true });
  saveResume();
}

async function openBestof() {
  const avail = tripStops().filter((p) => placeMedia(p).some((m) => !m.bad));
  if (!avail.length) { toast('Wähle zuerst die Fotos deiner Reise.', true); return; }
  showView('edit');
  closeContext();
  const trip = S.trip;
  if (!trip.bestof) trip.bestof = { id: 'bestof', settings: { ...baseSettings(BESTOF_DEFAULTS), seed: 11 }, overrides: { clips: {}, texts: [], stickers: [] }, songId: 'demo', include: {} };
  const rec = trip.bestof;
  rec.settings = normalizeSettings(rec.settings, BESTOF_DEFAULTS);
  rec.overrides = { clips: {}, texts: [], stickers: [], ...(rec.overrides || {}) };
  rec.include = rec.include || {};
  const chapters = [];
  const media = [];
  for (const p of avail) {
    if (rec.include[p.id] === false) continue;
    const items = placeMedia(p).filter((m) => !m.bad);
    chapters.push({ title: p.name, placeId: p.id, pos: p.pos || null, from: p.from, media: items });
    media.push(...items);
  }
  S.ctx = { kind: 'bestof', rec, media, chapters, song: null };
  await attachSong(rec.songId || 'demo');
  startHistory();
  renderEditor();
  await rebuild({ fresh: true });
  saveResume();
}

function closeContext() {
  if (engine) { engine.pause(); engine.releaseAll(); }
  S.ctx = null;
  S.plan = null;
  S.selOverlay = null;
  S.selClip = -1;
}

async function attachSong(songId) {
  try {
    S.ctx.song = await getSong(songId);
  } catch (e) {
    S.ctx.song = await getSong('demo');
    S.ctx.songMissing = songId !== 'demo';
  }
}

const ctxTitle = () => (S.ctx.kind === 'bestof' ? S.trip.name : S.ctx.rec.name) || '';
const ctxSub = () => (S.ctx.kind === 'bestof' ? (S.trip.sub || tripRangeLabel()) : S.ctx.rec.sub) || '';
function tripRangeLabel() {
  const st = tripStops();
  return st.length ? dateRangeLabel(st[0].from, st[st.length - 1].to) : '';
}

function savePlaceSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePlace, 400);
}
async function savePlace() {
  const ctx = S.ctx;
  if (!ctx) return;
  try {
    if (ctx.kind === 'bestof') { S.trip.edited = Date.now(); await S.store.put('trip', S.trip); } else {
      ctx.rec.edited = Date.now();
      ctx.rec.filmDur = S.plan ? S.plan.duration : null;
      await S.store.put('places', ctx.rec);
    }
  } catch (e) { toast('Speichern fehlgeschlagen.', true); }
}

/* ---------- Verlauf (Rückgängig) ---------- */
function snapshot() {
  const c = S.ctx;
  return JSON.stringify({
    settings: c.rec.settings, overrides: c.rec.overrides, hookId: c.rec.hookId || null, songId: c.rec.songId,
    flags: c.media.map((m) => [m.id, !!m.fav, !!m.excluded]),
  });
}
function startHistory() { S.hist = { stack: [snapshot()], idx: 0 }; updateUndo(); }
function commit() {
  if (!S.ctx) return;
  const snap = snapshot();
  if (S.hist.stack[S.hist.idx] === snap) return;
  S.hist.stack = S.hist.stack.slice(0, S.hist.idx + 1);
  S.hist.stack.push(snap);
  if (S.hist.stack.length > 80) S.hist.stack.shift();
  S.hist.idx = S.hist.stack.length - 1;
  updateUndo();
}
function updateUndo() {
  $('undoBtn').disabled = S.hist.idx <= 0;
  $('redoBtn').disabled = S.hist.idx >= S.hist.stack.length - 1;
}
async function applySnapshot(json) {
  const c = S.ctx;
  const s = JSON.parse(json);
  c.rec.settings = s.settings;
  c.rec.overrides = s.overrides;
  c.rec.hookId = s.hookId;
  const songChanged = s.songId && s.songId !== c.rec.songId;
  c.rec.songId = s.songId;
  const map = new Map(s.flags.map((f) => [f[0], f]));
  for (const m of c.media) {
    const f = map.get(m.id);
    if (f && (m.fav !== f[1] || m.excluded !== f[2])) { m.fav = f[1]; m.excluded = f[2]; saveMediaFlags(m); }
  }
  if (songChanged) await attachSong(c.rec.songId);
  S.selOverlay = null;
  savePlaceSoon();
  renderEditor();
  rebuild();
}
function undo() { if (S.hist.idx > 0) { S.hist.idx--; updateUndo(); applySnapshot(S.hist.stack[S.hist.idx]); } }
function redo() { if (S.hist.idx < S.hist.stack.length - 1) { S.hist.idx++; updateUndo(); applySnapshot(S.hist.stack[S.hist.idx]); } }

/* ---------- Plan & Vorschau ---------- */
function scheduleRebuild(delay = 120) {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => rebuild(), delay);
}

async function rebuild(opts = {}) {
  const ctx = S.ctx;
  if (!ctx || !engine || !ctx.song || S.exporting) return;
  const media = ctx.media.filter((m) => !m.loading && !m.bad);
  // eingeschalteter Originalton (z. B. nach erneutem Wählen der Fotos): Tonspur lokal nachladen
  const pendingVoice = media.filter((m) => m.sound > 0 && !m.audio && !m.noAudio);
  if (pendingVoice.length) { busy('Lese Originalton …'); await Promise.all(pendingVoice.map(ensureVoice)); busy(null); if (S.ctx !== ctx) return; }
  const s = ctx.rec.settings;
  const settings = { ...s, title: ctxTitle(), subtitle: ctxSub(), hookId: ctx.rec.hookId };
  let chapters = null;
  if (ctx.kind === 'bestof') chapters = ctx.chapters.map((c) => ({ title: c.title, media: c.media.filter((m) => !m.bad) }));
  let plan;
  try {
    plan = buildPlan({ an: ctx.song.an, media, settings, overrides: ctx.rec.overrides, chapters, trip: tripContext(), flight: ctx.kind === 'place' && isFlight(ctx.rec) ? flightData(ctx.rec) : null });
  } catch (e) {
    console.error(e);
    toast('Der Schnitt konnte nicht berechnet werden: ' + e.message, true);
    return;
  }
  S.plan = plan;
  const f = FORMATS[s.format];
  const mon = $('monitor');
  mon.style.setProperty('--arw', f.w);
  mon.style.setProperty('--arh', f.h);
  mon.dataset.fmt = s.format;
  // Vorschau scharf genug fürs Display, aber begrenzt (kurze Seite höchstens 720 px): die volle Retina-Auflösung
  // kostet das Mehrfache an Rechenleistung und Speicher, ohne dass man es auf dem Handy sieht. Export: immer voll.
  const r = mon.getBoundingClientRect();
  const shortCss = Math.min(r.width || 0, r.height || 0);
  const size = outputSize(s.format, 'preview', shortCss ? Math.min(720, Math.round(shortCss * Math.min(2, window.devicePixelRatio || 1))) : 540);
  const wasPlaying = engine.setProject({ plan, media, audioBuffer: ctx.song.buffer, size });
  engine.selectedOverlay = S.selOverlay;
  updatePlanInfo();
  renderRegie();
  renderStyle();
  const empty = ctx.kind === 'place' && !media.length;
  $('emptyStage').hidden = !empty;
  if (empty) {
    const missing = (ctx.rec.fps || []).length;
    const fl = isFlight(S.ctx.rec);
    $('esTitle').textContent = fl ? (missing ? 'Wähle die Videos vom Flug erneut' : 'Wähle die Videos vom Flug') : missing ? 'Wähle die Fotos dieses Orts erneut' : 'Wähle die Fotos und Videos dieses Orts';
    $('esHint').textContent = fl ? 'Start, Landung und gern den Blick aus dem Fenster. Die App ordnet sie nach Aufnahmezeit; dazwischen zeichnet sich die Flugroute.' : missing ? 'Die Aufnahmen sind nicht mehr im Zwischenspeicher. Am einfachsten wählst du alle Fotos der Reise, jede Aufnahme landet am richtigen Ort.' : 'Den Rest erledigt die Auto-Regie: Länge, Songausschnitt, Schnitt, Look.';
  }
  mon.classList.toggle('empty', empty);
  buildStripBase();
  drawStrip();
  if (S.tab === 'cut') renderCut();
  if (S.tab === 'material') renderMaterial();
  if (S.tab === 'music') renderMusic();
  if (S.tab === 'text') renderText();
  if (ctx.kind === 'place') savePlaceSoon();
  if (!media.length) { busy(null); engine.t = 0; updateTime(0); return; }
  if (wasPlaying) engine.play(engine.t);
  else if (opts.fresh || engine.t < 0.05) await showPoster();
  else { await engine.renderStill(engine.t); updateTime(engine.t); }
}

async function showPoster() {
  if (!S.plan) return;
  // Ruhebild an einer ruhigen, aussagekräftigen Stelle des Einstiegs
  const plan = S.plan;
  let pt = Math.min(0.9, plan.duration * 0.3);
  const pol = plan.overlays.find((o) => o.type === 'polaroid' && !o.outro);
  const kin = plan.overlays.find((o) => o.type === 'kinetic' && !o.small);
  if (pol && pol.drops.length) pt = Math.min(pol.zoomFrom != null ? pol.zoomFrom - 0.05 : pol.end, pol.drops[pol.drops.length - 1].t + 0.45);
  else if (kin && kin.beats && kin.beats.length) pt = Math.min(kin.end - 0.4, kin.beats[kin.beats.length - 1] + 0.35);
  else if (plan.intro === 'glitch') pt = Math.min(plan.duration * 0.3, plan.beatDur * 2 + 0.3);
  pt = Math.max(0, Math.min(pt, plan.duration - 0.05));
  await engine.renderStill(pt);
  if (!engine.playing) { engine.t = 0; updateTime(0); }
}

function updatePlanInfo() {
  const plan = S.plan, ctx = S.ctx;
  if (!plan) return;
  $('durLabel').textContent = fmtClock(plan.duration);
  const drop = plan.sections.find((x) => x.label === 'drop' || x.label === 'chorus');
  const n = plan.visibleClips;
  const r = plan.resolved;
  const parts = [`${FORMATS[r.format].short}`, `${LOOKS[r.look] ? LOOKS[r.look].label : ''}`, `${n} Einstellungen`];
  if (drop) parts.push(`${SECTION_DE[drop.label]} ab ${fmtClock(drop.start)}`);
  parts.push(`${Math.round(ctx.song.an.bpm)} BPM`);
  $('cutInfo').textContent = ctx.media.filter((m) => !m.bad && !m.loading).length ? parts.join(' · ') : 'Noch kein Material. Füge Fotos oder Videos hinzu.';
  $('sampleChip').hidden = !(ctx.kind === 'place' && ctx.rec.demo);
  $('exportBtn').disabled = !plan.usedMedia;
  const st = igStart();
  $('igLine').innerHTML = `Füge <b>${esc(ctx.song.name)}</b> in Instagram ab <b>${st}</b> hinzu. Film: <b>${fmtClock(plan.duration)}</b>`;
}

/* ---------- Zeitleiste ---------- */
function buildStripBase() {
  const c = $('strip');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(10, Math.round(c.clientWidth * dpr)), h = Math.max(10, Math.round(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const x = off.getContext('2d');
  x.fillStyle = '#0a101b';
  x.fillRect(0, 0, w, h);
  const plan = S.plan;
  if (!plan || !S.ctx || !S.ctx.song) { stripBase = off; return; }
  const an = S.ctx.song.an;
  const D = plan.duration;
  const X = (t) => (t / D) * w;
  // Abschnitte
  for (const s of plan.sections) {
    x.fillStyle = SECTION_COLOR[s.label] || '#444';
    x.globalAlpha = 0.9;
    x.fillRect(X(s.start), 0, Math.max(1, X(s.end) - X(s.start)), 5 * dpr);
    x.globalAlpha = 1;
  }
  // Energie
  const env = an.env;
  x.beginPath();
  x.moveTo(0, h - 12 * dpr);
  for (let px = 0; px <= w; px += 2) {
    const t = plan.win.start + (px / w) * D;
    const i = Math.max(0, Math.min(env.length - 1, Math.floor((t / an.duration) * env.length)));
    x.lineTo(px, h - 12 * dpr - env[i] * (h - 22 * dpr));
  }
  x.lineTo(w, h - 12 * dpr);
  x.closePath();
  x.fillStyle = 'rgba(110,147,201,0.22)';
  x.fill();
  // Clips
  plan.clips.forEach((cl, i) => {
    if (cl.loop) return;
    const x0 = X(cl.start), x1 = X(cl.end);
    x.fillStyle = i === S.selClip ? '#e4d5b7' : cl.split ? '#6e93c9' : i % 2 ? '#2a3a57' : '#1c2a42';
    x.fillRect(x0, h - 9 * dpr, Math.max(1, x1 - x0 - dpr), 7 * dpr);
    if (i > 0) {
      x.fillStyle = 'rgba(236,234,228,0.28)';
      x.fillRect(Math.round(x0), 8 * dpr, Math.max(1, dpr * 0.75), h - 17 * dpr);
    }
  });
  stripBase = off;
}

function drawStrip(t) {
  const c = $('strip');
  if (!stripBase) return;
  const x = c.getContext('2d');
  x.drawImage(stripBase, 0, 0);
  if (!S.plan) return;
  const tt = t == null ? (engine ? engine.t : 0) : t;
  const px = (tt / S.plan.duration) * c.width;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  x.fillStyle = '#e4d5b7';
  x.fillRect(Math.round(px - dpr), 0, 2 * dpr, c.height);
  c.setAttribute('aria-valuenow', String(Math.round((tt / S.plan.duration) * 100)));
}

function updateTime(t) {
  $('tc').textContent = fmtTC(t);
  drawStrip(t);
  if (engine && S.plan) {
    const p = engine.beatPulse(t);
    const dot = $('beatDot');
    dot.classList.toggle('on', engine.playing && p.env > 0.55);
    dot.classList.toggle('down', !!p.down);
    const sec = S.plan.sections.find((s) => t >= s.start && t < s.end) || S.plan.sections[S.plan.sections.length - 1];
    $('secLabel').textContent = sec ? SECTION_DE[sec.label] || sec.label : '–';
  }
}

function setupStrip() {
  const c = $('strip');
  let dragging = false, resumeAfter = false, pendingT = null, stillDone = Promise.resolve(), busyStill = false;
  // immer nur ein Standbild in Arbeit; danach sofort die neueste Position (kein Stau beim schnellen Ziehen)
  const queueStill = (t) => {
    pendingT = t;
    if (busyStill) return;
    busyStill = true;
    stillDone = (async () => { while (pendingT != null) { const tt = pendingT; pendingT = null; await engine.renderStill(tt); } busyStill = false; })();
  };
  const tAt = (e) => { const r = c.getBoundingClientRect(); return clamp01((e.clientX - r.left) / r.width) * (S.plan ? S.plan.duration : 0); };
  c.addEventListener('pointerdown', (e) => {
    if (!S.plan || S.exporting) return;
    engine.ensureAudio();
    dragging = true;
    resumeAfter = engine.playing;
    engine.pause();
    try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const t = tAt(e);
    engine.t = t; updateTime(t); queueStill(t);
  });
  c.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const t = tAt(e);
    engine.t = t; updateTime(t);
    // immer nur ein Standbild in Arbeit; danach sofort die neueste Position (kein Stau beim schnellen Ziehen)
    queueStill(t);
  });
  const end = async () => {
    if (!dragging) return;
    dragging = false;
    if (resumeAfter) { await stillDone; engine.play(engine.t); } else queueStill(engine.t);
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener('keydown', (e) => {
    if (!S.plan || S.exporting) return;
    let t = engine.t;
    if (e.key === 'ArrowRight') t += e.shiftKey ? 5 : 1;
    else if (e.key === 'ArrowLeft') t -= e.shiftKey ? 5 : 1;
    else if (e.key === 'Home') t = 0;
    else return;
    e.preventDefault();
    t = Math.max(0, Math.min(S.plan.duration - 0.05, t));
    if (engine.playing) engine.play(t); else { engine.t = t; updateTime(t); engine.renderStill(t); }
  });
}

function togglePlay() {
  if (!engine || !S.plan || S.exporting || !S.plan.usedMedia) return;
  engine.ensureAudio();
  if (engine.playing) engine.pause();
  else engine.play(engine.t >= S.plan.duration - 0.1 ? 0 : engine.t);
}
function setPlayingUI(on) {
  $('monitor').classList.toggle('playing', on);
  $('playBtn').classList.toggle('playing', on);
  $('playBtn').setAttribute('aria-label', on ? 'Pause' : 'Abspielen');
  if (!on) $('beatDot').classList.remove('on');
}

/* ---------- Ansichten ---------- */
function showView(v) {
  $('viewTrip').hidden = v !== 'trip';
  $('viewEdit').hidden = v !== 'edit';
  window.scrollTo(0, 0);
  if (v === 'trip') { closeContext(); renderTrip(); saveResume(); }
}

function placeCover(p) {
  const items = placeMedia(p).filter((m) => !m.bad && m.thumb);
  if (!items.length) return '';
  const hook = items.find((m) => m.id === p.hookId) || items.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  return hook.thumb;
}

async function renderTrip() {
  $('tripName').value = S.trip.name || 'Meine Reise';
  const list = $('placeList');
  const places = S.places.slice().sort((a, b) => (a.from || a.created) - (b.from || b.created));
  const stops = tripStops();
  const km = tripKm(stops);
  const total = places.reduce((a, p) => a + (p.fps || []).length, 0);
  const nPl = places.filter((p) => !isFlight(p)).length, nFl = places.length - nPl;
  const parts = [`${nPl} ${nPl === 1 ? 'Ort' : 'Orte'}`, ...(nFl ? [`${nFl} ${nFl === 1 ? 'Flug' : 'Flüge'}`] : []), `${total} Aufnahmen`];
  if (km > 1) parts.push(`ca. ${Math.round(km).toLocaleString('de-DE')} km`);
  if (stops.length) { const days = Math.max(1, Math.round((stops[stops.length - 1].to - stops[0].from) / 86400000) + 1); parts.push(`${days} ${days === 1 ? 'Tag' : 'Tage'}`); }
  $('tripStats').textContent = parts.join(' · ');
  if (!places.length) {
    list.innerHTML = '<div class="empty">Noch keine Orte. Wähle oben die Fotos deiner Reise, die App erkennt die Orte selbst.</div>';
  } else {
    list.innerHTML = places.map((p, i) => {
      const cover = placeCover(p);
      const n = (p.fps || []).length;
      const present = placeMedia(p).length;
      const missing = !p.demo && n > 0 && present === 0;
      const prev = places.slice(0, i).reverse().find((x) => x.pos);
      const leg = prev && p.pos ? haversineKm(prev.pos, p.pos) : 0;
      const fl = isFlight(p);
      const fd = fl ? flightData(p) : null;
      const fkm = fl && cityPos((p.flight || {}).fromName) && cityPos((p.flight || {}).toName) ? Math.round(haversineKm(cityPos(p.flight.fromName), cityPos(p.flight.toName))) : fd ? fd.km : 0;
      const meta = fl ? ['Flug', fd && fd.dep && fd.arr ? `${fd.dep}–${fd.arr}` : '', fkm ? `${fkm.toLocaleString('de-DE')} km` : '', n ? `${n} Aufnahmen` : 'noch keine Videos', p.sub || ''].filter(Boolean).join(' · ')
        : `${p.demo ? 'Beispiel' : `${n} Aufnahmen`}${p.sub ? ' · ' + esc(p.sub) : ''}${leg > 5 ? ` · +${Math.round(leg).toLocaleString('de-DE')} km` : ''}`;
      return `<div class="place${fl ? ' is-flight' : ''}" role="button" tabindex="0" data-id="${esc(p.id)}">
        <span class="place-cover">${cover ? `<img src="${cover}" alt="">` : fl ? PLANE_SVG : `<span class="mono">${esc((p.name || '?').slice(0, 1).toUpperCase())}</span>`}</span>
        <span class="place-text">
          <strong>${esc(p.name || 'Ohne Namen')}</strong>
          <span class="meta">${fl ? esc(meta) : meta}</span>
          ${missing ? '<span class="pill warn">Fotos erneut wählen</span>' : p.demo ? '<span class="pill demo">Beispiel</span>' : p.exported ? '<span class="pill ok">Exportiert</span>' : ''}
        </span>
        <button class="icon-btn place-more" type="button" data-more="${esc(p.id)}" aria-label="Optionen für ${esc(p.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>
        </button>
      </div>`;
    }).join('');
  }
  const withMedia = stops.filter((p) => placeMedia(p).length);
  $('openBestof').disabled = withMedia.length < 1;
  $('bestofHint').textContent = withMedia.length >= 2
    ? `${withMedia.length} Orte${km > 1 ? `, ${Math.round(km).toLocaleString('de-DE')} km` : ''} in einem Film, in Kapiteln.`
    : 'Sobald deine Reise zwei Orte hat, entsteht hier der Film der ganzen Reise.';
  const covers = withMedia.map(placeCover).filter(Boolean).slice(0, 3);
  const arts = covers.length ? [0, 1, 2].map((i) => covers[i % covers.length]) : [];
  $('bestofArt').innerHTML = arts.map((c, i) => `<img src="${c}" alt="" style="top:${i * 33.3}%;height:32%">`).join('');
  $('storageHint').innerHTML = `Nur auf diesem Gerät: Orte, Einstellungen und ein Zwischenspeicher deiner gewählten Aufnahmen, damit angefangene Projekte erhalten bleiben. Nichts wird hochgeladen. Aufnahmen werden ${KEEP_DAYS} Tage nach der letzten Bearbeitung automatisch gelöscht.<span id="usage"></span> <button class="linklike" id="clearWorkBtn" type="button">Zwischenspeicher leeren</button> · <button class="linklike" id="wipeBtn" type="button">Alles löschen</button>`;
  S.store.usage().then((u) => { const el = $('usage'); if (el && u && u.usage > 1e6) el.textContent = ` Belegt: ${fmtBytes(u.usage)}.`; });
}

async function newPlace() {
  const rec = {
    id: uid('p'), name: 'Neuer Ort', sub: '', created: Date.now(), songId: 'demo',
    settings: baseSettings(DEFAULT_SETTINGS),
    overrides: { clips: {}, texts: [], stickers: [] }, hookId: null, fps: [], flags: {},
  };
  S.places.push(rec);
  await S.store.put('places', rec);
  S.tab = 'style';
  await openPlace(rec.id);
}

const PLANE_SVG = '<svg class="plane-ico" viewBox="-7 -7 14 14" aria-hidden="true"><path d="M0-5.2Q.9-4.6.9-2.2L5.6.9v1L.9.7.8 3.6 2.2 4.8v.7L0 4.9-2.2 5.5v-.7L-.8 3.6-.9.7-5.6 1.9v-1L-.9-2.2Q-.9-4.6 0-5.2z" fill="currentColor"/></svg>';

function placeMenu(id) {
  const p = S.places.find((x) => x.id === id);
  if (!p) return;
  const body = openSheet(`
    <h3 id="sheetTitle">${esc(p.name)}</h3>
    <div class="sheet-actions">
      <button class="btn" data-act="open" type="button">${isFlight(p) ? 'Film bearbeiten' : 'Bearbeiten'}</button>
      ${isFlight(p) ? '<button class="btn" data-act="flight" type="button">Von und Nach ändern</button>' : ''}
      ${(p.fps || []).some((fp) => S.pool.has(fp)) ? '<button class="btn" data-act="release" type="button">Fertig: Aufnahmen aus dem Zwischenspeicher löschen</button>' : ''}
      <button class="btn danger" data-act="del" type="button">${isFlight(p) ? 'Flug entfernen' : 'Ort entfernen'}</button>
    </div>
    <p class="hint small">Beides betrifft nur CineBeat. Deine Fotos und Videos in der Galerie bleiben unberührt. Nach dem Löschen aus dem Zwischenspeicher bleiben Einstellungen und Texte erhalten; die Aufnahmen wählst du bei Bedarf neu.</p>`);
  body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'open') { closeSheet(); openPlace(id); }
    if (a.dataset.act === 'flight') { openFlightSheet(p); return; }
    if (a.dataset.act === 'release') {
      await releasePlace(p);
      await dropUnusedWork([p.songId]);
      closeSheet();
      renderTrip();
      toast('Aufnahmen aus dem Zwischenspeicher gelöscht.');
    }
    if (a.dataset.act === 'del') {
      await S.store.del('places', id);
      S.places = S.places.filter((x) => x.id !== id);
      await releasePlace(p);
      await dropUnusedWork([p.songId]);
      closeSheet();
      renderTrip();
      toast(isFlight(p) ? 'Flug entfernt.' : 'Ort entfernt.');
    }
  });
}

function confirmClearWork() {
  const body = openSheet(`
    <h3 id="sheetTitle">Zwischenspeicher leeren?</h3>
    <p class="hint">Löscht die zwischengespeicherten Aufnahmen und Songs aller Orte. Orte, Einstellungen und Texte bleiben; die Aufnahmen wählst du bei Bedarf neu. Deine Galerie bleibt unberührt.</p>
    <div class="sheet-actions"><button class="btn danger" data-act="clear" type="button">Zwischenspeicher leeren</button><button class="btn ghost" data-act="cancel" type="button">Abbrechen</button></div>`);
  body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'clear') {
      try { await S.store.clear('work'); } catch (err) { /* egal */ }
      for (const [k, m] of Array.from(S.pool)) if (m.file) { URL.revokeObjectURL(m.url); S.pool.delete(k); }
      for (const k of Array.from(S.songs.keys())) if (k !== 'demo') S.songs.delete(k);
      toast('Zwischenspeicher geleert.');
    }
    closeSheet();
    renderTrip();
  });
}

function confirmWipe() {
  const body = openSheet(`
    <h3 id="sheetTitle">Alles löschen?</h3>
    <p class="hint">Entfernt alle Orte, Einstellungen und die geladenen Aufnahmen aus CineBeat. Deine Fotos, Videos und bereits gespeicherten Filme in der Galerie bleiben erhalten.</p>
    <div class="sheet-actions"><button class="btn danger" data-act="wipe" type="button">Ja, alles löschen</button><button class="btn ghost" data-act="cancel" type="button">Abbrechen</button></div>`);
  body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'cancel') { closeSheet(); return; }
    for (const m of S.pool.values()) if (m.url) URL.revokeObjectURL(m.url);
    S.pool.clear();
    for (const k of Array.from(S.songs.keys())) if (k !== 'demo') S.songs.delete(k);
    await S.store.wipe();
    await S.store.open();
    S.trip = { id: 'main', name: 'Meine Reise', created: Date.now() };
    S.places = [createDemoPlace()];
    await S.store.put('trip', S.trip);
    closeSheet();
    renderTrip();
    toast('Alles gelöscht.');
  });
}

/* ---------- Editor-Darstellung ---------- */
function renderEditor() {
  const ctx = S.ctx;
  const isBest = ctx.kind === 'bestof';
  $('placeName').value = isBest ? 'Gesamtfilm' : ctx.rec.name;
  $('placeName').readOnly = isBest;
  $('placeSub').value = isBest ? `${ctx.chapters.length} Kapitel · ${S.trip.name}` : ctx.rec.sub || '';
  $('placeSub').readOnly = isBest;
  $('tabbtn-material').textContent = isBest ? 'Kapitel' : 'Material';
  renderTabs();
  renderMaterial();
  renderMusic();
  renderStyle();
}

function renderTabs() {
  for (const b of document.querySelectorAll('.tabs [role="tab"]')) {
    const on = b.dataset.tab === S.tab;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
    $('tab-' + b.dataset.tab).hidden = !on;
  }
  $('monitor').classList.toggle('text-mode', S.tab === 'text');
  if (S.tab !== 'text' && S.selOverlay) { S.selOverlay = null; if (engine) { engine.selectedOverlay = null; if (!engine.playing) engine.renderStill(engine.t); } }
  if (S.tab === 'cut') renderCut();
  if (S.tab === 'text') renderText();
  if (S.tab === 'music') renderMusic();
}

function renderMaterial() {
  const ctx = S.ctx;
  if (!ctx) return;
  const g = $('mediaGrid');
  const addRow = $('fileMedia').closest('.row');
  if (ctx.kind === 'bestof') {
    addRow.hidden = true;
    $('mediaHint').textContent = 'Jeder Ort ist ein Kapitel. Die App nimmt deine Favoriten und die stärksten Aufnahmen. Tippe auf ein Kapitel, um es ein- oder auszuschließen.';
    const all = tripStops().filter((p) => placeMedia(p).length);
    g.style.gridTemplateColumns = '1fr';
    g.innerHTML = all.map((p) => {
      const on = ctx.rec.include[p.id] !== false;
      const cover = placeCover(p);
      return `<button class="ov-item${on ? ' sel' : ''}" type="button" data-chapter="${esc(p.id)}" aria-pressed="${on}">
        <span class="place-cover" style="width:40px;height:52px">${cover ? `<img src="${cover}" alt="">` : ''}</span>
        <span class="v"><strong>${esc(p.name)}</strong><br><span class="hint small">${(p.fps || []).length} Aufnahmen</span></span>
        <span class="pill ${on ? 'ok' : ''}">${on ? 'Im Film' : 'Nicht im Film'}</span></button>`;
    }).join('');
    return;
  }
  addRow.hidden = false;
  g.style.gridTemplateColumns = '';
  const n = ctx.media.filter((m) => !m.bad).length;
  const v = ctx.media.filter((m) => m.kind === 'video' && !m.bad).length;
  const missing = (ctx.rec.fps || []).length - ctx.media.length;
  $('mediaHint').textContent = ctx.rec.demo
    ? 'Das sind Beispielbilder. Deine eigenen Fotos und Videos ersetzen sie.'
    : missing > 0 && !n ? `Die Aufnahmen dieses Orts sind nicht mehr im Zwischenspeicher (gelöscht oder länger als ${KEEP_DAYS} Tage unbearbeitet). Wähle die ${missing} Aufnahmen erneut aus der Galerie, am einfachsten alle Fotos der Reise: Jede Aufnahme landet automatisch am richtigen Ort.`
      : !n ? 'Füge die Fotos und Videos dieses Orts hinzu. 10 bis 60 Stück ergeben einen guten Film.'
        : `${n - v} Fotos, ${v} Videos. Videos laufen stumm unter dem Song; den Originalton schaltest du pro Video ein (antippen).`;
  const roles = isFlight(ctx.rec) ? flightRoles(ctx.rec) : null;
  if (isFlight(ctx.rec) && n) $('mediaHint').textContent = `${n} Aufnahmen vom Flug, nach Aufnahmezeit geordnet: die erste ist der Abflug, die letzte die Landung, dazwischen die Aufnahmen an Bord. Antippen, um das zu ändern oder den Originalton einzuschalten.`;
  const hookId = ctx.rec.hookId;
  const autoHook = S.plan && S.plan.clips[0] ? S.plan.clips[0].mediaId : null;
  // was nicht in den Film passt und welche Videos zu lang sind (aus der Planung)
  const cap = S.plan && S.plan.capacity;
  const dropped = new Set(cap ? cap.droppedIds : []), tooLong = new Set(cap ? cap.tooLong.map((v) => v.id) : []);
  if (n && !isFlight(ctx.rec) && cap) $('mediaHint').textContent += ' ' + capacityText();
  g.innerHTML = ctx.media.map((m) => {
    const cls = ['tile', m.loading ? 'loading' : '', m.bad ? 'bad' : '', m.excluded ? 'excluded' : '', !m.fav && m.dupOf ? 'dim' : ''].join(' ');
    const isStart = !roles && (hookId ? hookId === m.id : autoHook === m.id);
    const role = roles ? (roles.takeoff === m.id ? 'ABFLUG' : roles.landing === m.id ? 'LANDUNG' : '') : '';
    return `<button class="${cls}" type="button" data-id="${esc(m.id)}" aria-label="${esc(m.name)}${m.fav ? ', Favorit' : ''}${isStart ? ', Startbild' : ''}">
      ${m.thumb ? `<img src="${m.thumb}" alt="" draggable="false">` : ''}
      ${m.kind === 'video' && m.duration ? `<span class="badge${tooLong.has(m.id) ? ' warn' : ''}">▶ ${m.trim ? '✂ ' + fmtClock(videoSpan(m)) : fmtClock(m.duration)}</span>` : ''}
      ${dropped.has(m.id) && !m.excluded ? '<span class="out">nicht im Film</span>' : ''}
      ${m.fav ? '<span class="flag fav">♥</span>' : ''}
      ${m.kind === 'video' && m.sound ? '<span class="flag snd" aria-label="Originalton an"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M17.8 6.8a7 7 0 010 10.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>' : ''}
      ${isStart ? '<span class="flag start">START</span>' : ''}
      ${role ? `<span class="flag start">${role}</span>` : ''}
    </button>`;
  }).join('');
}

function openMediaSheet(id) {
  const ctx = S.ctx;
  const m = ctx.media.find((x) => x.id === id);
  if (!m || m.loading) return;
  const isStart = ctx.rec.hookId === m.id;
  const roles = ctx.kind === 'place' && isFlight(ctx.rec) ? flightRoles(ctx.rec) : null;
  const flightRole = roles ? (roles.takeoff === m.id ? 'takeoff' : roles.landing === m.id ? 'landing' : 'extra') : null;
  const quality = m.score != null ? Math.round(m.score * 100) : null;
  const body = openSheet(`
    <img class="preview-img" src="${m.thumb || ''}" alt="">
    <h3 id="sheetTitle">${m.kind === 'video' ? 'Video' : 'Foto'}${m.duration ? ' · ' + fmtClock(m.duration) : ''}</h3>
    ${quality != null ? `<p class="hint">Bewertung ${quality} von 100${m.dupOf ? ' · ähnelt einer besseren Aufnahme' : ''}${m.sharp != null && m.sharp < 0.35 ? ' · eher unscharf' : ''}</p>` : ''}
    ${m.kind === 'video' && m.duration ? trimHTML(m) : ''}
    ${m.kind === 'video' ? `<div class="field"><span class="field-label">Originalton</span><div id="sndPick">${radioHTML('Originalton', VOICE_LEVELS, String(m.sound || 0))}</div>
      <p class="hint small">Mit Ton läuft das Video in Echtzeit, die Musik wird dort automatisch leiser.</p></div>` : ''}
    <div class="sheet-actions">
      <button class="btn" data-act="fav" type="button">${m.fav ? '♥ Kein Favorit mehr' : '♡ Als Favorit markieren'}</button>
      ${flightRole ? `<button class="btn" data-act="takeoff" type="button">${flightRole === 'takeoff' ? '✓ Abflug' : 'Als Abflug verwenden'}</button>
      <button class="btn" data-act="landing" type="button">${flightRole === 'landing' ? '✓ Landung' : 'Als Landung verwenden'}</button>` : `<button class="btn" data-act="start" type="button">${isStart ? 'Startbild automatisch wählen' : 'Als Startbild verwenden'}</button>`}
      <button class="btn" data-act="excl" type="button">${m.excluded ? 'Wieder im Film verwenden' : 'Nicht im Film verwenden'}</button>
      <button class="btn danger" data-act="del" type="button">Aus diesem Film nehmen</button>
    </div>`);
  if (m.kind === 'video' && m.duration) setupTrim(body, m);
  body.addEventListener('click', async (e) => {
    const r = e.target.closest('#sndPick [role="radio"]');
    if (r) { setRadio(r.closest('.chips'), r.dataset.v); await setVoice(m, +r.dataset.v); if (!m.audio) setRadio(r.closest('.chips'), '0'); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'fav') { m.fav = !m.fav; saveMediaFlags(m); }
    if (a.dataset.act === 'start') { ctx.rec.hookId = isStart ? null : m.id; if (!isStart) m.excluded = false; }
    if (a.dataset.act === 'takeoff' || a.dataset.act === 'landing') {
      const f = ctx.rec.flight = ctx.rec.flight || {};
      const key = a.dataset.act === 'takeoff' ? 'takeoffId' : 'landingId', other = key === 'takeoffId' ? 'landingId' : 'takeoffId';
      f[key] = m.id;
      if (f[other] === m.id) delete f[other];
      m.excluded = false;
      saveMediaFlags(m);
      fillFlightPlaces(ctx.rec);
    }
    if (a.dataset.act === 'excl') { m.excluded = !m.excluded; saveMediaFlags(m); }
    if (a.dataset.act === 'del') { closeSheet(); removeMedia(m.id); commit(); return; }
    closeSheet();
    commit();
    savePlaceSoon();
    renderMaterial();
    rebuild();
  });
}

/** Ausschnitt eines Videos: Start und Länge; im Film läuft das Video dann (fast) genau diesen Teil. */
function trimHTML(m) {
  const vmax = S.plan && S.plan.capacity ? S.plan.capacity.vmax : 8;
  const long = m.duration > vmax * 1.15;
  return `<div class="field trim" id="trimBox">
    <span class="field-label">Ausschnitt</span>
    <p class="hint small">${long ? `Das Video ist ${fmtClock(m.duration)} lang, im Film laufen höchstens ${Math.round(vmax)} s am Stück. Wähle den Teil, der zählt.` : 'Das Video läuft im Film fast ganz. Hier kannst du es auf einen Teil begrenzen.'}</p>
    <video id="trimVid" src="${m.url}" muted playsinline preload="metadata" style="width:100%;max-height:30vh;border-radius:10px;background:#000"></video>
    <div class="trim-bar"><div class="trim-sel" id="trimSel"></div></div>
    <label class="trim-row"><span>Start</span><span id="trimInT"></span></label>
    <input type="range" id="trimIn" min="0" max="${m.duration.toFixed(2)}" step="0.05">
    <label class="trim-row"><span>Länge</span><span id="trimLenT"></span></label>
    <input type="range" id="trimLen" min="1.5" max="${Math.max(1.5, m.duration).toFixed(2)}" step="0.05">
    <div class="sheet-actions"><button class="btn" data-trim="full" type="button">Ganzes Video</button><button class="btn" data-trim="best" type="button">Vorschlag der App</button></div>
  </div>`;
}

function setupTrim(body, m) {
  const vmax = S.plan && S.plan.capacity ? S.plan.capacity.vmax : 8;
  const d = m.duration;
  const inEl = body.querySelector('#trimIn'), lenEl = body.querySelector('#trimLen'), vid = body.querySelector('#trimVid');
  let tin = m.trim ? m.trim[0] : 0, len = m.trim ? m.trim[1] - m.trim[0] : d;
  const show = () => {
    len = Math.max(1.5, Math.min(len, d)); tin = Math.max(0, Math.min(tin, d - len));
    inEl.value = tin; lenEl.value = len;
    body.querySelector('#trimInT').textContent = fmtClock(tin);
    body.querySelector('#trimLenT').textContent = `${len.toFixed(1).replace('.', ',')} s${len > vmax * 1.15 ? ` · im Film ${Math.round(vmax)} s` : ''}`;
    const sel = body.querySelector('#trimSel');
    sel.style.left = `${(tin / d) * 100}%`; sel.style.width = `${(len / d) * 100}%`;
  };
  let seekT = 0;
  const seek = (t) => { clearTimeout(seekT); seekT = setTimeout(() => { try { vid.currentTime = Math.min(d - 0.05, t); } catch (e) { /* noch nicht geladen */ } }, 60); };
  const save = () => {
    m.trim = tin < 0.05 && len > d - 0.05 ? null : [+tin.toFixed(2), +(tin + len).toFixed(2)];
    saveMediaFlags(m); commit(); savePlaceSoon(); renderMaterial(); scheduleRebuild(250);
  };
  inEl.addEventListener('input', () => { tin = +inEl.value; show(); seek(tin); });
  lenEl.addEventListener('input', () => { len = +lenEl.value; show(); seek(tin + len); });
  inEl.addEventListener('change', save); lenEl.addEventListener('change', save);
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-trim]');
    if (!b) return;
    if (b.dataset.trim === 'full') { tin = 0; len = d; } else {
      // bester Moment in der Mitte, Länge = was im Film läuft
      const best = m.highlights && m.highlights[0] ? m.highlights[0].t : d * 0.4;
      len = Math.min(d, vmax); tin = best - len * 0.4;
    }
    show(); seek(tin); save();
  });
  show();
  vid.addEventListener('loadedmetadata', () => seek(tin), { once: true });
}

function renderMusic() {
  const ctx = S.ctx;
  if (!ctx || !ctx.song) return;
  const an = ctx.song.an;
  $('songName').textContent = ctx.song.name;
  const counts = {};
  for (const s of an.sections) counts[s.label] = (counts[s.label] || 0) + 1;
  $('songMeta').textContent = `${ctx.song.mic ? 'mitgehört ab ' + fmtClock(ctx.song.offset || 0) : fmtClock(an.duration)} · ${Math.round(an.bpm)} BPM · ${an.sections.length} Abschnitte`;
  const st = ctx.rec.settings;
  setRadio($('startChips'), typeof st.songStart === 'number' ? '' : st.songStart);
  setRadio($('lenChips'), String(st.length));
  drawSongMap();
  const labels = Array.from(new Set(an.sections.map((s) => s.label)));
  $('songLegend').innerHTML = labels.map((l) => `<span><i style="background:${SECTION_COLOR[l]}"></i>${SECTION_DE[l] || l}</span>`).join('') + '<span>▢ im Film</span>';
}

function drawSongMap() {
  const c = $('songMap');
  const ctx = S.ctx;
  if (!ctx || !ctx.song || c.clientWidth === 0) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const an = ctx.song.an;
  const D = an.duration;
  x.fillStyle = '#0f1a2c';
  x.fillRect(0, 0, w, h);
  for (const s of an.sections) {
    x.fillStyle = SECTION_COLOR[s.label] || '#444';
    x.globalAlpha = 0.85;
    x.fillRect((s.start / D) * w, h - 8 * dpr, Math.max(1, ((s.end - s.start) / D) * w - dpr), 8 * dpr);
  }
  x.globalAlpha = 1;
  const env = an.env;
  x.beginPath();
  x.moveTo(0, h - 10 * dpr);
  for (let px = 0; px <= w; px += 2) {
    const i = Math.min(env.length - 1, Math.floor((px / w) * env.length));
    x.lineTo(px, h - 10 * dpr - env[i] * (h - 16 * dpr));
  }
  x.lineTo(w, h - 10 * dpr);
  x.fillStyle = 'rgba(236,234,228,0.2)';
  x.fill();
  if (S.plan) {
    const a = (S.plan.win.start / D) * w, b = (S.plan.win.end / D) * w;
    x.strokeStyle = '#e4d5b7';
    x.lineWidth = 2 * dpr;
    x.strokeRect(a + dpr, dpr, Math.max(2, b - a - 2 * dpr), h - 2 * dpr);
    x.fillStyle = 'rgba(228,213,183,0.08)';
    x.fillRect(a, 0, b - a, h);
  }
}

function renderStyle() {
  const st = S.ctx.rec.settings;
  const r = S.plan ? S.plan.resolved : st;
  setRadio($('fmtChips'), st.format);
  setRadio($('paceChips'), st.pace);
  setRadio($('introChips'), st.intro);
  setRadio($('outroChips'), st.outro);
  setRadio($('frameChips'), st.frame);
  setRadio($('splitChips'), st.split);
  $('frameField').hidden = !(st.format === '9:16' || st.format === '4:5');
  $('introChips').closest('.field').hidden = isFlight(S.ctx.rec);
  setRadio($('kmChips'), st.km);
  setRadio($('motionChips'), st.motion);
  setRadio($('motionAmtChips'), st.motionAmt);
  $('motionAmtChips').hidden = st.motion === 'ken';
  $('motionHint').textContent = { ken: 'Gleitende Fahrten mit feiner Neigung; die Richtung fließt über die Schnitte weiter.', snap: 'Jeder Schnitt setzt mit einem kurzen Zoom-Impuls ein und gleitet zurück, genau auf dem Beat.', float: 'Schwereloses Gleiten in einer weichen Acht über zwei Takte.', tilt: 'Auf jeder Eins kippt das Bild weich zur anderen Seite.', sway: 'Die Bilder pendeln sanft von links nach rechts, der Wendepunkt sitzt genau auf dem Beat. Im Drop etwas stärker.', pulse: 'Jeder Beat gibt dem Bild einen kurzen Zoom-Impuls.', handheld: 'Ruhiges, organisches Schweben wie aus der Hand gefilmt.' }[st.motion];
  setRadio($('drumChips'), st.accent);
  const accR = r && r.accent ? r.accent : st.accent;
  $('drumHint').textContent = st.accent === 'auto' ? (accR === 'off' ? 'Auto: bei diesem Song ohne Schlagzeug-Akzente.' : 'Auto: ein feiner Zoom-Impuls nur auf der Bassdrum, im Drop und Refrain.') : st.accent === 'kick' ? 'Der Zoom-Impuls folgt nur der Bassdrum, nicht jedem Beat.' : st.accent === 'kicksnare' ? 'Bassdrum-Zoom, dazu ein kurzes, feines Rütteln auf der Snare.' : 'Keine Schlagzeug-Akzente.';
  setRadio($('colorChips'), st.color);
  const colR = st.color === 'auto' && r ? r.color : st.color;
  const COLOR_DE = { drop: 'Vor dem Drop schwarzweiß, auf dem ersten Schlag ist die Farbe schlagartig zurück.', steps: 'Im Takt vor dem Einsatz kommt die Farbe Beat für Beat zurück.', bloom: 'Die Farbe breitet sich auf dem Einsatz vom Motiv aus über das Bild aus.', sweep: 'Die Farbe läuft auf dem Einsatz als weiche Welle durchs Bild.', pop: 'Vor dem Einsatz bleiben nur kräftige Farben stehen, auf dem Schlag kommt alles zurück.', off: 'Kein Schwarzweiß-Moment.' };
  $('colorHint').textContent = (st.color === 'auto' ? 'Auto: ' : '') + (COLOR_DE[colR] || COLOR_DE.off);
  setRadio($('targetChips'), st.target);
  $('targetChips').hidden = st.format !== '9:16';
  setRadio($('allChips'), st.allMedia);
  $('allChips').hidden = S.ctx.kind === 'bestof' || isFlight(S.ctx.rec);
  $('capHint').textContent = capacityText();
  setRadio($('preChips'), st.pre);
  $('preField').hidden = isFlight(S.ctx.rec);
  const introR = st.intro === 'auto' && r ? r.intro : st.intro;
  for (const b of $('preChips').querySelectorAll('[data-v]')) b.disabled = (b.dataset.v !== 'off' && introR === 'split') || (b.dataset.v === 'countdown' && introR === 'countdown');
  $('preHint').textContent = introR === 'split' ? 'Der Split-Screen-Einstieg steht für sich, ohne Vorspann.' : st.pre === 'rewind' ? 'Ein kurzer Blick auf den besten Moment, dann spult der Film wie eine Kassette zurück an den Anfang.' : st.pre === 'countdown' ? 'Countdown wie im alten Kino, danach dein Einstieg.' : 'Läuft vor dem Einstieg und lässt sich mit jedem Einstieg kombinieren, z. B. Countdown und danach das 9er-Raster.';
  renderFx(st, r);
  const mt = $('mapThemeChips');
  if (!mt.children.length) mt.innerHTML = Object.entries(MAP_THEMES).map(([k, th]) => `<button type="button" role="radio" data-v="${k}"><i class="map-sw" style="background:radial-gradient(circle at 35% 35%, ${th.body0}, ${th.bg1});box-shadow:inset 0 0 0 2px ${th.ink}"></i>${th.label}</button>`).join('');
  setRadio(mt, st.mapTheme);
  const mi = $('mapInkChips');
  if (!mi.children.length) mi.innerHTML = MAP_INKS.map((c) => `<button type="button" role="radio" data-v="${c}" aria-label="${c ? 'Farbe ' + c : 'Farbe des Stils'}" style="background:${c || 'conic-gradient(#efe6d2, #ff6a2b, #7fb2ff, #efe6d2)'}"></button>`).join('');
  setRadio(mi, st.mapInk);
  setRadio($('mapLandChips'), st.mapLand);
  setRadio($('flightViewChips'), st.flightView);
  const fc = $('fontChips');
  if (!fc.children.length) fc.innerHTML = Object.entries(FONT_SETS).map(([k, f]) => `<button type="button" role="radio" data-v="${k}" style="font-family:${esc(f.css)};font-weight:${f.weight || 400};${f.italic ? 'font-style:italic;' : ''}${f.upper ? 'text-transform:uppercase;letter-spacing:.08em;font-size:12.5px;' : 'font-size:16px;'}">${f.label}</button>`).join('');
  setRadio(fc, st.font);
  for (const b of $('elChips').querySelectorAll('[data-k]')) b.setAttribute('aria-pressed', String(st[b.dataset.k] !== false));
  $('styleInfo').textContent = S.trip.style ? 'Vorlage: ' + styleSummary(normalizeSettings(S.trip.style, DEFAULT_SETTINGS)) : 'Einen Stil für alle Orte: speichern und mit einem Tipp übertragen.';
  const flightFilm = S.ctx.kind === 'place' && isFlight(S.ctx.rec);
  $('kmField').hidden = flightFilm;
  $('mapField').hidden = !flightFilm;
  $('elChips').querySelector('[data-k="showChapters"]').hidden = S.ctx.kind !== 'bestof';
  const autoLabel = (group, val, names) => {
    const b = $(group).querySelector('[data-v="auto"]');
    if (b) b.textContent = st[val] === 'auto' && r && names[r[val]] ? `Auto · ${names[r[val]]}` : 'Auto';
  };
  autoLabel('introChips', 'intro', { reveal: 'Aufblende', countdown: 'Countdown', grid: '9er-Raster', knockout: 'Durch den Namen', cinema: 'Titelkarte', city: 'Ortsname', hook: 'Stärkstes Bild', type: 'Wort für Wort', split: 'Split' });
  autoLabel('outroChips', 'outro', { credits: 'Schlusstitel', loop: 'Loop', freeze: 'Standbild', split: 'Split', strip: 'Filmstreifen' });
  autoLabel('frameChips', 'frame', { full: 'Vollbild', band: 'Kinoband' });
  autoLabel('paceChips', 'pace', { ruhig: 'ruhig', mittel: 'mittel', schnell: 'schnell' });
  const g = $('lookGrid');
  const autoBlurb = st.look === 'auto' && r && LOOKS[r.look] ? LOOKS[r.look].label : 'passend zum Material';
  g.innerHTML = [['auto', { label: 'Auto', blurb: autoBlurb }], ...Object.entries(LOOKS)].map(([k, l]) => `<button class="look-card" type="button" role="radio" data-v="${k}" aria-checked="${k === st.look}"><span class="sw" style="background:${LOOK_SWATCH[k]}"></span><span class="tx"><strong>${l.label}</strong><span>${esc(l.blurb)}</span></span></button>`).join('');
  setRadio(g, st.look);
}

/** Wie viele Aufnahmen passen in diesen Film (Story/Reel) und was bleibt draußen. */
function capacityText() {
  const c = S.plan && S.plan.capacity;
  if (!c || !S.ctx || isFlight(S.ctx.rec)) return '';
  const len = fmtClock(S.plan.duration);
  const parts = [`Zu diesem Song passen in ${c.story ? 'eine Story' : c.label === 'Reel' ? 'ein Reel' : 'diesen Film'} etwa ${c.imgFit} Fotos${c.videos ? ` neben ${c.videos} ${c.videos === 1 ? 'Video' : 'Videos'}` : ''}.`];
  if (c.droppedIds.length) parts.push(`${c.droppedIds.length} ${c.droppedIds.length === 1 ? 'Aufnahme bleibt' : 'Aufnahmen bleiben'} draußen (${len} voll)${c.story ? '; als Reel passen mehr' : ''}.`);
  else parts.push(`Alle ${c.images + c.videos} Aufnahmen sind im Film (${len}), in ihrer Aufnahme-Reihenfolge, keine doppelt.`);
  const pk = c.packed || {};
  const how = [pk.split ? `${pk.split} Fotos im Split-Screen` : '', pk.vsplit ? `${pk.vsplit} Videos gleichzeitig` : '', pk.burst ? `${pk.burst} in Foto-Serien` : '', pk.stack ? `${pk.stack} im Polaroid-Stapel` : '', pk.grid ? `${pk.grid} im Raster` : ''].filter(Boolean);
  if (how.length) parts.push(`Verdichtet: ${how.join(', ')}.`);
  if (c.all && c.droppedIds.length) parts.push('Mehr passt selbst verdichtet nicht sinnvoll hinein: wähle eine längere Länge oder ein Reel.');
  if (c.repeats) parts.push(`${c.repeats} ${c.repeats === 1 ? 'Einstellung wiederholt' : 'Einstellungen wiederholen'} ein Bild: für diese Länge fehlen Aufnahmen.`);
  if (c.tooLong.length) parts.push(`${c.tooLong.length === 1 ? 'Ein Video ist' : c.tooLong.length + ' Videos sind'} länger als ${Math.round(c.vmax)} s: im Material antippen und einen Ausschnitt wählen.`);
  return parts.join(' ');
}

/** „Im Film“: mehrere Elemente gleichzeitig; jedes hat seinen festen Platz, damit sie sich ergänzen statt stören. */
const FX_KEYS = {
  match: { on: 'auto', off: 'off', is: (st) => st.match !== 'off' },
  morph: { on: 'on', off: 'off', is: (st) => st.morph === 'on' },
  split: { on: 'auto', off: 'off', is: (st) => st.split !== 'off' },
  burst: { on: 'drop', off: 'off', is: (st) => st.burst === 'drop' },
  ramp: { on: 'drop', off: 'off', is: (st) => st.ramp === 'drop' },
  stamp: { on: 'on', off: 'off', is: (st, r) => st.stamp === 'on' || (st.stamp !== 'off' && ((r && r.look) || st.look) === 'digicam') },
  midGrid: { on: 'on', off: 'off', is: (st) => st.midGrid === 'on' },
  midCount: { on: 'drop', off: 'off', is: (st) => st.midCount === 'drop' },
  chapMap: { on: 'on', off: 'off', is: (st) => st.chapMap !== 'off' },
};
// Stil-Mittel mit „Auto“: angezeigt wird, was die Regie gewählt hat; Antippen legt es fest (an/aus)
for (const k of ['echo', 'stack', 'mini', 'drift', 'parallax', 'chapKnock']) FX_KEYS[k] = { on: 'on', off: 'off', is: (st, r) => st[k] === 'on' || (st[k] === 'auto' && !!r && r[k] === 'on') };
function renderFx(st, r) {
  for (const b of $('fxChips').querySelectorAll('[data-fx]')) b.setAttribute('aria-pressed', String(FX_KEYS[b.dataset.fx].is(st, r)));
  const on = (k) => FX_KEYS[k].is(st, r);
  const parts = [];
  if (on('match') || on('morph')) parts.push(`Übergänge: ${[on('match') ? 'Match-Cuts bei ähnlichem Bildaufbau' : '', on('morph') ? 'Bild aus Bild in ruhigen Teilen' : ''].filter(Boolean).join(', ')}`);
  if (on('split') || on('midGrid')) parts.push(`Refrain: ${[on('midGrid') ? 'einmal das Raster, das im Takt farbig wird' : '', on('split') ? 'Split-Screens' : ''].filter(Boolean).join(', ')}`);
  if (on('midCount')) parts.push('Vor dem Drop: Countdown 3 · 2 · 1');
  if (on('burst') || on('ramp')) parts.push(`Drop: ${[on('burst') ? 'Foto-Serie' : '', on('ramp') ? 'Videos beschleunigen hinein und landen in Zeitlupe' : ''].filter(Boolean).join(', ')}`);
  if (on('stamp')) parts.push('Datum wie bei einer alten Digicam unten rechts');
  if (on('echo')) parts.push('Echo: auf starken Schlägen blitzt das vorige Bild kurz auf');
  if (on('stack')) parts.push('Polaroid-Stapel in einem ruhigen Teil');
  if (on('mini')) parts.push('Mini-Rewind: vor einem Drop spult der Film einen halben Takt zurück');
  if (on('drift')) parts.push('Drift: in ruhigen Teilen gleitet die Kamera ins nächste Bild');
  if (on('parallax')) parts.push('Tiefe: Vorder- und Hintergrund bewegen sich leicht versetzt');
  if (on('chapKnock') && S.ctx && S.ctx.kind === 'bestof') parts.push('Kapitel: Zoom durch den Namen jedes Ortes');
  if (on('chapMap') && S.ctx && S.ctx.kind === 'bestof') parts.push('Karten-Moment: bei jeder Etappe zeichnet eine kleine Karte die Strecke zum neuen Ort');
  const chk = $('fxChapKnock');
  const best = !!(S.ctx && S.ctx.kind === 'bestof');
  if (chk) chk.hidden = !best;
  $('fxChapMap').hidden = !best;
  $('fxHint').textContent = parts.length ? parts.join(' · ') + '.' : 'Tippe an, was im Film vorkommen soll. Die Regie setzt jedes Element an die Stelle im Song, wo es am besten wirkt.';
}

function renderRegie() {
  const ul = $('regieNotes');
  if (!S.plan || !S.ctx) { ul.innerHTML = ''; return; }
  const good = S.ctx.media.filter((m) => !m.bad && !m.loading).length;
  const notes = good ? S.plan.notes : ['Wähle Fotos und Videos. Die Auto-Regie bestimmt dann Filmlänge, Songausschnitt, Schnitt, Look und Farbangleichung.'];
  const open = ul.dataset.open === '1';
  const shown = open ? notes : notes.slice(0, 3);
  ul.innerHTML = shown.map((n) => `<li>${esc(n)}</li>`).join('') + (notes.length > 3 ? `<li class="more-toggle"><button type="button" id="regieMore">${open ? 'Weniger anzeigen' : `${notes.length - 3} weitere Entscheidungen`}</button></li>` : '');
  const mb = $('regieMore');
  if (mb) mb.addEventListener('click', () => { ul.dataset.open = open ? '0' : '1'; renderRegie(); });
}

function clipThumb(c) {
  const m = S.ctx.media.find((x) => x.id === c.mediaId);
  return m ? m.thumb : '';
}

function renderCut() {
  const plan = S.plan;
  const row = $('clipRow');
  if (!plan || !S.ctx) { row.innerHTML = ''; return; }
  const ov = S.ctx.rec.overrides.clips || {};
  const perSec = 34;
  row.innerHTML = plan.clips.filter((c) => !c.loop).map((c) => {
    const w = Math.max(34, Math.round((c.end - c.start) * perSec));
    const tr = c.tin && c.tin.type ? TR_NAMES[c.tin.type] || '' : '';
    const edited = ov[c.i] && Object.keys(ov[c.i]).length;
    const secTag = c.sectionChange ? `<span class="sectag">${SECTION_DE[c.label] || ''}</span>` : '';
    return `<button class="clip${edited ? ' edited' : ''}${c.i === S.selClip ? ' sel' : ''}" type="button" data-clip="${c.i}" style="width:${w}px" aria-label="Einstellung ${c.i + 1}, ${fmtClock(c.start)}">
      ${clipThumb(c) ? `<img src="${clipThumb(c)}" alt="" draggable="false">` : ''}
      ${tr ? `<span class="ctr">${esc(tr)}</span>` : ''}${c.split ? '<span class="cs">SPLIT</span>' : ''}
      <span class="ct">${(c.end - c.start).toFixed(1).replace('.', ',')}s</span>${secTag}
    </button>`;
  }).join('');
}

function openClipSheet(i) {
  const plan = S.plan, ctx = S.ctx;
  const c = plan.clips[i];
  if (!c) return;
  S.selClip = i;
  buildStripBase(); drawStrip();
  renderCut();
  engine.pause();
  const mid = c.freezeAt != null ? Math.min(c.freezeAt, (c.start + c.end) / 2) : (c.start + c.end) / 2;
  engine.t = mid;
  engine.renderStill(mid).then(() => updateTime(mid));
  const ov = (ctx.rec.overrides.clips[i] = ctx.rec.overrides.clips[i] || {});
  const m = ctx.media.find((x) => x.id === c.mediaId);
  const usable = ctx.media.filter((x) => !x.bad && !x.loading);
  const trOpts = [['', 'Automatisch'], [String(TR.CUT), 'Schnitt'], [String(TR.DISSOLVE), 'Blende'], [String(TR.DIP), 'Schwarzblende'], [String(TR.WHIP), 'Wischer'], [String(TR.ZOOM), 'Zoom'], [String(TR.PUSH), 'Schieben'], [String(TR.LUMA), 'Lichtblende'], [String(TR.LEAK), 'Lichtleck'], [String(TR.MORPH), 'Bild aus Bild'], [String(TR.INK), 'Farbfluss'], [String(TR.DOUBLE), 'Doppelbelichtung']];
  const isVideo = m && m.kind === 'video';
  const visDur = c.visEnd - c.visStart;
  const maxOff = isVideo ? Math.max(0, (m.duration || 0) - visDur * (c.rate || 1)) : 0;
  const body = openSheet(`
    <h3 id="sheetTitle">Einstellung ${i + 1} · ${fmtClock(c.start)}–${fmtClock(c.end)}</h3>
    <p class="hint">${SECTION_DE[c.label] || ''} · ${(c.end - c.start).toFixed(2).replace('.', ',')} s${c.freezeAt != null ? ' · friert im Stopp ein' : ''}</p>
    <div class="field"><span class="field-label">Motiv</span>
      <div class="pick-grid" role="radiogroup" aria-label="Motiv wählen">${usable.map((x) => `<button type="button" role="radio" data-media="${esc(x.id)}" aria-checked="${x.id === c.mediaId}" aria-label="${esc(x.name)}"><img src="${x.thumb || ''}" alt=""></button>`).join('')}</div>
    </div>
    ${i > 0 ? `<div class="field"><span class="field-label">Übergang hierher</span><div id="trPick">${radioHTML('Übergang', trOpts, ov.trans != null ? String(ov.trans) : '')}</div></div>` : ''}
    ${isVideo ? `<div class="field"><span class="field-label">Originalton dieses Videos</span><div id="sndPick">${radioHTML('Originalton', VOICE_LEVELS, String(m.sound || 0))}</div></div>` : ''}
    ${isVideo ? `<div class="field"><span class="field-label">Tempo</span><div id="spPick">${radioHTML('Tempo', [['', 'Automatisch'], ['1', 'Normal'], ['0.5', 'Zeitlupe']], ov.speed ? String(ov.speed) : '')}</div></div>
    <div class="field"><label class="field-label" for="offRange">Videoausschnitt</label>
      <input class="range" id="offRange" type="range" min="0" max="${maxOff.toFixed(2)}" step="0.05" value="${(c.srcOffset || 0).toFixed(2)}" ${maxOff < 0.1 ? 'disabled' : ''}>
      <p class="hint small" id="offLabel">Start bei ${(c.srcOffset || 0).toFixed(1).replace('.', ',')} s von ${fmtClock(m.duration)}</p></div>` : ''}
    ${c.mediaId && !c.grid ? '<button class="btn small" data-act="text" type="button">+ Text auf dieser Einstellung</button>' : ''}
    <div class="row"><button class="btn ghost small" data-act="reset" type="button">Zurücksetzen</button><button class="btn primary small" data-act="done" type="button">Fertig</button></div>`,
  () => { S.selClip = -1; buildStripBase(); drawStrip(); if (S.tab === 'cut') renderCut(); });
  const changed = () => { commit(); savePlaceSoon(); rebuild().then(() => { const cc = S.plan.clips[i]; if (cc) { const t = (cc.start + cc.end) / 2; engine.renderStill(t); updateTime(t); } }); };
  body.addEventListener('click', (e) => {
    const pm = e.target.closest('[data-media]');
    if (pm) {
      ov.mediaId = pm.dataset.media;
      delete ov.srcOffset;
      for (const b of body.querySelectorAll('[data-media]')) b.setAttribute('aria-checked', b === pm ? 'true' : 'false');
      changed();
      return;
    }
    const r = e.target.closest('[role="radio"][data-v]');
    if (r && r.closest('#sndPick')) {
      setRadio(r.closest('.chips'), r.dataset.v);
      setVoice(m, +r.dataset.v).then(() => { if (!m.audio) setRadio(r.closest('.chips'), '0'); changed(); });
      return;
    }
    if (r && r.closest('#trPick')) {
      if (r.dataset.v === '') delete ov.trans; else ov.trans = +r.dataset.v;
      setRadio(r.closest('.chips'), r.dataset.v);
      changed();
      return;
    }
    if (r && r.closest('#spPick')) {
      if (r.dataset.v === '') delete ov.speed; else ov.speed = +r.dataset.v;
      setRadio(r.closest('.chips'), r.dataset.v);
      changed();
      return;
    }
    const a = e.target.closest('[data-act]');
    if (a && a.dataset.act === 'text') {
      closeSheet();
      engine.t = c.start + 0.3;
      addOverlay('text', { anchor: { mediaId: c.mediaId, idx: i }, start: c.start, end: c.end, anim: 'fade', style: 'editorial', y: 0.7 });
      return;
    }
    if (a && a.dataset.act === 'reset') { delete ctx.rec.overrides.clips[i]; closeSheet(); changed(); }
    if (a && a.dataset.act === 'done') closeSheet();
  });
  const rng = body.querySelector('#offRange');
  if (rng) {
    rng.addEventListener('input', () => {
      ov.srcOffset = +rng.value;
      body.querySelector('#offLabel').textContent = `Start bei ${(+rng.value).toFixed(1).replace('.', ',')} s von ${fmtClock(m.duration)}`;
      scheduleRebuild(150);
    });
    rng.addEventListener('change', () => { commit(); savePlaceSoon(); });
  }
}

/* ---------- Texte & Sticker ---------- */
function allUserOverlays() {
  const o = S.ctx.rec.overrides;
  return [...(o.texts || []).map((x) => ({ ...x, _k: 'text' })), ...(o.stickers || []).map((x) => ({ ...x, _k: 'sticker' }))];
}

/** Drei Titel-Varianten aus Ort und Zeitraum: sachlich, knapp, erzählend. */
function titleVariants(rec, media) {
  const name = (rec.name || '').trim();
  if (!name || name === 'Neuer Ort') return [];
  const ts = media.map((m) => m.time).filter((t) => t && t > 946684800000).sort((a, b) => a - b);
  const from = rec.from || ts[0], to = rec.to || ts[ts.length - 1];
  const range = dateRangeLabel(from, to) || monthLabel(ts);
  if (!from) return [[name, range], [name, ''], ['Tage in ' + name, '']];
  const a = new Date(from), days = Math.max(1, Math.round((new Date(to).setHours(0, 0, 0, 0) - new Date(from).setHours(0, 0, 0, 0)) / 864e5) + 1);
  const season = ['Winter', 'Winter', 'Frühling', 'Frühling', 'Frühling', 'Sommer', 'Sommer', 'Sommer', 'Herbst', 'Herbst', 'Herbst', 'Winter'][a.getMonth()];
  const yy = String(a.getFullYear()).slice(2);
  const story = days === 1 ? 'Ein Tag in ' : days <= 3 && [5, 6, 0].includes(a.getDay()) ? 'Wochenende in ' : 'Tage in ';
  return [[name, range], [`${name} ’${yy}`, `${season} · ${days} ${days === 1 ? 'Tag' : 'Tage'}`], [story + name, monthLabel(ts)]];
}

function renderTitleChips() {
  const box = $('titleChips');
  const rec = S.ctx && S.ctx.rec;
  const vs = rec && S.ctx.kind === 'place' && !isFlight(rec) ? titleVariants(rec, S.ctx.media) : [];
  box.hidden = !vs.length;
  box.innerHTML = vs.map(([t, sub], i) => `<button type="button" role="radio" aria-checked="${rec.name === t && (rec.sub || '') === sub}" data-i="${i}"><b>${esc(t)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</button>`).join('');
  box._vs = vs;
}

function renderText() {
  const list = $('ovList');
  if (!S.ctx) return;
  renderTitleChips();
  const items = allUserOverlays();
  if (!items.length) { list.innerHTML = '<p class="hint small">Noch keine eigenen Texte oder Sticker.</p>'; return; }
  list.innerHTML = items.map((o) => `<button class="ov-item${o.id === S.selOverlay ? ' sel' : ''}" type="button" data-ov="${esc(o.id)}">
    <span class="k">${o._k === 'text' ? (TEXT_STYLES[o.style] || TEXT_STYLES.bold).label : STICKERS[o.kind].label}</span>
    <span class="v">${esc(o.text || '')}</span><span class="hint small">${o.anchor ? 'auf einer Aufnahme' : `${o.start != null ? fmtClock(o.start) : '0:00'}–${o.end != null ? fmtClock(o.end) : 'Ende'}`}</span></button>`).join('');
}

function findOverlay(id) {
  const o = S.ctx.rec.overrides;
  return (o.texts || []).find((x) => x.id === id) || (o.stickers || []).find((x) => x.id === id) || null;
}

function selectOverlay(id) {
  S.selOverlay = id;
  engine.selectedOverlay = id;
  renderText();
  if (!engine.playing) engine.renderStill(engine.t);
}

function addOverlay(kind, extra) {
  const ctx = S.ctx;
  const D = S.plan ? S.plan.duration : 10;
  const t = engine ? engine.t : 0;
  const start = Math.max(0, Math.min(t, D - 1));
  const base = { id: uid('o'), x: 0.5, y: 0.5, size: 1, rot: 0, start, end: Math.min(D, start + 3) };
  const o = ctx.rec.overrides;
  let item;
  if (kind === 'text') { item = { ...base, text: 'Dein Text', style: 'modern', color: '#efe6d2', rot: 0, y: 0.62, ...extra }; (o.texts = o.texts || []).push(item); }
  else { item = { ...base, kind, text: kind === 'pin' ? ctxTitle() || 'Ort' : dateStamp(ctx.media.map((m) => m.time)), y: kind === 'date' ? 0.2 : 0.24, x: 0.5, rot: 0, ...extra }; (o.stickers = o.stickers || []).push(item); }
  commit();
  savePlaceSoon();
  S.selOverlay = item.id;
  rebuild().then(() => { engine.t = Math.min(start + 0.5, D); engine.renderStill(engine.t); updateTime(engine.t); });
  openOverlaySheet(item.id);
}

function openOverlaySheet(id) {
  const o = findOverlay(id);
  if (!o) return;
  selectOverlay(id);
  const isText = o.style != null;
  const D = S.plan ? S.plan.duration : 10;
  const timing = o.anchor ? 'clip' : o.start <= 0.01 && o.end >= D - 0.01 ? 'all' : o.start <= 0.01 ? 'begin' : o.end >= D - 0.01 ? 'end' : 'here';
  const styleChips = `<div class="chips font-chips" role="radiogroup" aria-label="Schrift">${Object.entries(TEXT_STYLES).map(([k, st]) => `<button type="button" role="radio" data-v="${k}" aria-checked="${k === o.style}" style="font-family:${esc(st.css)};${st.upper ? 'text-transform:uppercase;letter-spacing:.06em;font-size:12.5px;' : 'font-size:15px;'}">${st.label}</button>`).join('')}</div>`;
  const body = openSheet(`
    <h3 id="sheetTitle">${isText ? 'Text' : STICKERS[o.kind].label}</h3>
    ${isText || o.kind === 'pin' || o.kind === 'date' ? `<textarea class="text-in" id="ovText" rows="2" maxlength="80" aria-label="Inhalt">${esc(o.text)}</textarea>` : ''}
    ${isText ? `<div class="field"><span class="field-label">Schrift</span><div id="stylePick">${styleChips}</div></div>
      <div class="field"><span class="field-label">Animation</span><div id="animPick">${radioHTML('Animation', Object.entries(TEXT_ANIMS), o.anim || 'rise')}</div></div>
      <div class="field"><span class="field-label">Hintergrund</span><div id="bgPick">${radioHTML('Hintergrund', Object.entries(TEXT_BGS), o.bg || 'none')}</div></div>
      <div class="field"><span class="field-label">Farbe</span><div class="swatches" role="radiogroup" aria-label="Farbe" id="colorPick">${TEXT_COLORS.map((c) => `<button type="button" role="radio" data-color="${c}" aria-checked="${c === o.color}" aria-label="Farbe ${c}" style="background:${c}"></button>`).join('')}</div></div>` : ''}
    <div class="field"><label class="field-label" for="ovSize">Größe</label><input class="range" id="ovSize" type="range" min="0.5" max="2.5" step="0.05" value="${o.size || 1}"></div>
    <div class="field"><label class="field-label" for="ovRot">Drehung</label><input class="range" id="ovRot" type="range" min="-30" max="30" step="1" value="${o.rot || 0}"></div>
    <div class="field"><span class="field-label">Sichtbar</span><div id="timePick">${radioHTML('Sichtbar', [['clip', 'Nur auf dieser Aufnahme'], ['begin', 'Am Anfang'], ['here', 'Ab jetzt 3 s'], ['end', 'Am Ende'], ['all', 'Ganzer Film']], timing)}</div></div>
    <div class="row"><button class="btn danger small" data-act="del" type="button">Löschen</button><button class="btn primary small" data-act="done" type="button">Fertig</button></div>
    <p class="hint small">Tipp: In der Vorschau kannst du das Element mit dem Finger verschieben.</p>`,
  () => { commit(); savePlaceSoon(); });
  const live = () => {
    if (!S.plan) return;
    const planned = S.plan.overlays.find((x) => x.id === o.id);
    const ovs = S.plan.overlays.filter((x) => x.id !== o.id);
    ovs.push({ ...o, type: isText ? 'usertext' : 'sticker', layer: 'top', ...(o.anchor && planned ? { start: planned.start, end: planned.end } : {}) });
    S.plan.overlays = ovs;
    engine.setOverlays(ovs);
    if (!engine.playing) {
      const t = Math.max(o.start + 0.45, Math.min(engine.t, o.end - 0.3));
      engine.t = t;
      engine.renderStill(t);
      updateTime(t);
    }
    renderText();
  };
  const txt = body.querySelector('#ovText');
  if (txt) txt.addEventListener('input', () => { o.text = txt.value; live(); });
  body.querySelector('#ovSize').addEventListener('input', (e) => { o.size = +e.target.value; live(); });
  body.querySelector('#ovRot').addEventListener('input', (e) => { o.rot = +e.target.value; live(); });
  body.addEventListener('click', (e) => {
    const col = e.target.closest('[data-color]');
    if (col) { o.color = col.dataset.color; for (const b of body.querySelectorAll('[data-color]')) b.setAttribute('aria-checked', b === col ? 'true' : 'false'); live(); return; }
    const r = e.target.closest('[role="radio"][data-v]');
    if (r && r.closest('#stylePick')) { o.style = r.dataset.v; setRadio(r.closest('.chips'), r.dataset.v); live(); return; }
    if (r && r.closest('#animPick')) { o.anim = r.dataset.v; setRadio(r.closest('.chips'), r.dataset.v); live(); return; }
    if (r && r.closest('#bgPick')) { o.bg = r.dataset.v; setRadio(r.closest('.chips'), r.dataset.v); live(); return; }
    if (r && r.closest('#timePick')) {
      const v = r.dataset.v;
      const t = engine.t;
      if (v === 'clip') {
        let ci = clipIndexAt(S.plan.clips, t);
        if (S.plan.clips[ci] && (S.plan.clips[ci].grid || S.plan.clips[ci].loop)) ci = Math.min(S.plan.visibleClips - 1, ci + 1);
        const c = S.plan.clips[ci];
        if (!c || !c.mediaId) return;
        o.anchor = { mediaId: c.mediaId, idx: ci };
        setRadio(r.closest('.chips'), v);
        commit(); savePlaceSoon();
        rebuild().then(() => { const p2 = S.plan.overlays.find((x) => x.id === o.id); if (p2) { engine.t = Math.min(p2.end - 0.1, p2.start + 0.8); engine.renderStill(engine.t); updateTime(engine.t); } renderText(); });
        return;
      }
      delete o.anchor;
      if (v === 'all') { o.start = 0; o.end = D; }
      if (v === 'begin') { o.start = 0; o.end = Math.min(D, 3); }
      if (v === 'end') { o.start = Math.max(0, D - 3); o.end = D; }
      if (v === 'here') { o.start = Math.max(0, Math.min(t, D - 1)); o.end = Math.min(D, o.start + 3); }
      setRadio(r.closest('.chips'), v);
      live();
      return;
    }
    const a = e.target.closest('[data-act]');
    if (a && a.dataset.act === 'del') {
      const ov = S.ctx.rec.overrides;
      ov.texts = (ov.texts || []).filter((x) => x.id !== o.id);
      ov.stickers = (ov.stickers || []).filter((x) => x.id !== o.id);
      S.selOverlay = null;
      engine.selectedOverlay = null;
      closeSheet();
      rebuild();
    }
    if (a && a.dataset.act === 'done') closeSheet();
  });
}

function setupOverlayDrag() {
  const mon = $('monitor');
  let drag = null;
  const norm = (e) => { const r = mon.getBoundingClientRect(); return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }; };
  mon.addEventListener('pointerdown', (e) => {
    if (S.tab !== 'text' || !S.plan || S.exporting) return;
    const p = norm(e);
    const t = engine.t;
    const cands = allUserOverlays().filter((o) => t >= o.start - 0.01 && t <= o.end + 0.01);
    let best = null, bd = 0.16;
    for (const o of cands) { const d = Math.hypot(o.x - p.x, (o.y - p.y) * 0.7); if (d < bd) { bd = d; best = o; } }
    if (!best) return;
    engine.pause();
    const o = findOverlay(best.id);
    drag = { o, dx: o.x - p.x, dy: o.y - p.y };
    selectOverlay(o.id);
    mon.classList.add('dragging');
    try { mon.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  });
  mon.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = norm(e);
    drag.o.x = clamp01(p.x + drag.dx);
    drag.o.y = clamp01(p.y + drag.dy);
    const ovs = S.plan.overlays.map((x) => (x.id === drag.o.id ? { ...x, x: drag.o.x, y: drag.o.y } : x));
    S.plan.overlays = ovs;
    engine.setOverlays(ovs);
    engine.drawAt(engine.t, 'still');
  });
  const end = () => { if (!drag) return; drag = null; mon.classList.remove('dragging'); commit(); savePlaceSoon(); };
  mon.addEventListener('pointerup', end);
  mon.addEventListener('pointercancel', end);
}

/* ---------- Export ---------- */
const QUALITY = {
  ig: { label: 'Instagram · 1080p', bpp: 0.22, size: 'final' },
  max: { label: 'Maximal · 1080p', bpp: 0.42, size: 'final' },
  '4k': { label: '4K-Archiv', bpp: 0.12, size: '4k' },
};
const igStart = () => fmtClock((S.ctx.song.offset || 0) + S.plan.win.start);

function openExportSheet() {
  if (!S.plan || !S.plan.usedMedia) { toast('Füge zuerst Fotos oder Videos hinzu.', true); return; }
  engine.pause();
  const st = S.ctx.rec.settings;
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('cinebeat.export') || '{}'); } catch (e) { return {}; } })();
  const micSong = !!S.ctx.song.mic;
  let fps = prefs.fps === 60 ? 60 : 30;
  let audio = prefs.audio === 'with' && !micSong ? 'with' : 'without';
  let quality = QUALITY[prefs.quality] && prefs.quality !== '4k' ? prefs.quality : 'max';
  const sizeOf = () => outputSize(st.format, QUALITY[quality].size);
  const body = openSheet(`
    <h3 id="sheetTitle">Film exportieren</h3>
    <p class="hint" id="expInfo"></p>
    <div class="field"><span class="field-label">Qualität</span><div id="qPick">${radioHTML('Qualität', Object.entries(QUALITY).map(([k, q]) => [k, q.label]), quality)}</div>
      <p class="hint small" id="qHint"></p></div>
    <div class="field"><span class="field-label">Bildrate</span><div id="fpsPick">${radioHTML('Bildrate', [['30', '30 fps · empfohlen'], ['60', '60 fps · extra flüssig']], fps)}</div></div>
    <div class="field"><span class="field-label">Song im Video</span><div id="audPick">${radioHTML('Song', [['without', 'Ohne Song, für Instagram'], ['with', 'Mit Song']], audio)}</div>
      <p class="hint small" id="audHint"></p></div>
    <button class="btn primary big" id="startExport" type="button"><i class="rec-dot" aria-hidden="true"></i>Export starten</button>
    <button class="btn ghost" id="coverExport" type="button">Titelbild für Reels erstellen</button>
    <div class="progress" id="expProgress" hidden>
      <div class="progress-bar"><span id="expBar"></span></div>
      <div class="progress-meta"><span id="expStage">Bereite vor …</span><span id="expPct">0 %</span></div>
      <button class="btn ghost small" id="cancelExport" type="button">Abbrechen</button>
    </div>
    <div class="result" id="expResult" hidden></div>`);
  const q4k = body.querySelector('#qPick [data-v="4k"]');
  q4k.hidden = true;
  // 4K nur anbieten, wenn das Gerät es wirklich kodieren kann
  Engine.exportSupport(outputSize(st.format, '4k'), 30, false, QUALITY['4k'].bpp).then((sup) => { if (sup.video) q4k.hidden = false; }, () => {});
  if (micSong) body.querySelector('#audPick [data-v="with"]').disabled = true;
  const info = () => {
    const size = sizeOf();
    const mbit = Math.round(Math.min(80e6, size.w * size.h * fps * QUALITY[quality].bpp) / 1e6);
    body.querySelector('#expInfo').textContent = `${FORMATS[st.format].label} · ${size.w} × ${size.h} · ${fmtClock(S.plan.duration)} · ca. ${mbit} Mbit/s`;
    body.querySelector('#qHint').textContent = quality === 'ig'
      ? 'Genau das, was Instagram erwartet. Kleine Datei, schneller Upload.'
      : quality === 'max' ? 'Doppelte Datenrate: feinere Details und Verläufe, auch nachdem Instagram das Video neu komprimiert.'
        : 'Für dein Archiv und große Bildschirme. Braucht deutlich länger; Instagram verkleinert 4K wieder auf 1080p.';
    const voiceNote = engine.hasVoice ? ' Der Originalton deiner Videos ist in jedem Fall dabei.' : '';
    body.querySelector('#audHint').textContent = (micSong
      ? `Der Song wurde nur mitgehört, deshalb exportiert die App ohne Ton. Füge „${S.ctx.song.name}“ in Instagram ab ${igStart()} hinzu.`
      : audio === 'without'
        ? `Lade das Video hoch und füge „${S.ctx.song.name}“ über Instagrams Musik-Sticker ab ${igStart()} hinzu. So ist der Song lizenziert und das Video wird nicht stummgeschaltet.`
        : 'Für WhatsApp, dein Archiv oder andere Apps. Instagram schaltet Videos mit fremder Musik oft stumm.') + voiceNote;
  };
  info();
  let cancel = false;
  body.addEventListener('click', async (e) => {
    const r = e.target.closest('[role="radio"][data-v]');
    if (r && !r.disabled) {
      if (r.closest('#fpsPick')) fps = +r.dataset.v;
      if (r.closest('#audPick')) audio = r.dataset.v;
      if (r.closest('#qPick')) quality = r.dataset.v;
      setRadio(r.closest('.chips'), r.dataset.v);
      info();
    }
    if (e.target.closest('#cancelExport')) cancel = true;
    if (e.target.closest('#coverExport')) await makeCover(body, sizeOf());
    if (e.target.closest('#startExport')) {
      try { localStorage.setItem('cinebeat.export', JSON.stringify({ fps, audio, quality })); } catch (err) { /* egal */ }
      await runExport(body, { size: sizeOf(), fps, bpp: QUALITY[quality].bpp, withSong: audio === 'with', withAudio: audio === 'with' || engine.hasVoice, isCancelled: () => cancel });
    }
  });
}

async function runExport(body, { size, fps, bpp, withSong, withAudio, isCancelled }) {
  engine.ensureAudio();
  S.exporting = true;
  $('sheetBackdrop').onclick = null;
  body.querySelector('#startExport').hidden = true;
  for (const el of body.querySelectorAll('.field')) el.hidden = true;
  const prog = body.querySelector('#expProgress');
  prog.hidden = false;
  const bar = body.querySelector('#expBar'), pct = body.querySelector('#expPct'), stage = body.querySelector('#expStage');
  let wake = null;
  try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; }
  let res = null, mode = 'offline';
  const t0 = performance.now();
  try {
    const support = await Engine.exportSupport(size, fps, withAudio, bpp);
    if (!support.video || (withAudio && !support.audio)) mode = 'realtime';
    // Echtzeit-Aufnahme schafft kein 4K flüssig: dann 1080p
    if (mode === 'realtime' && size.w * size.h > 2200000) size = { w: size.w / 2, h: size.h / 2 };
    stage.textContent = mode === 'offline' ? 'Berechne Bild für Bild …' : 'Nehme in Echtzeit auf …';
    const onProgress = (p) => {
      bar.style.width = Math.round(p * 100) + '%';
      pct.textContent = Math.round(p * 100) + ' %';
      if (mode === 'offline' && p > 0.03) {
        const el = (performance.now() - t0) / 1000;
        const rest = Math.max(0, el / p - el);
        stage.textContent = `Bild für Bild · noch ca. ${rest < 60 ? Math.ceil(rest) + ' s' : Math.ceil(rest / 60) + ' min'}`;
      }
    };
    if (mode === 'offline') res = await engine.exportOffline({ size, fps, withAudio, withSong, support, onProgress, isCancelled });
    else {
      stage.textContent = 'Echtzeit-Aufnahme: App geöffnet und Bildschirm an lassen';
      res = await engine.exportRealtime({ size, withAudio, withSong, onProgress, isCancelled, fps: Math.min(fps, 30), bpp });
    }
  } catch (e) {
    console.error(e);
    toast('Export fehlgeschlagen: ' + (e && e.message ? e.message : 'unbekannter Fehler'), true);
  } finally {
    try { if (wake) await wake.release(); } catch (e) { /* ignore */ }
    S.exporting = false;
    prog.hidden = true;
  }
  await rebuild();
  if (!res) {
    body.querySelector('#startExport').hidden = false;
    for (const el of body.querySelectorAll('.field')) el.hidden = false;
    if (isCancelled()) toast('Export abgebrochen.');
    return;
  }
  if (S.ctx.kind === 'place') { S.ctx.rec.exported = Date.now(); savePlaceSoon(); }
  showExportResult(body, res, size, fps, withAudio, withSong);
}

function showExportResult(body, res, size, fps, withAudio, withSong) {
  const url = URL.createObjectURL(res.blob);
  const name = `${(S.ctx.kind === 'bestof' ? S.trip.name : S.ctx.rec.name || 'CineBeat').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_') || 'CineBeat'}_${S.ctx.rec.settings.format.replace(':', 'x')}.${res.ext}`;
  const box = body.querySelector('#expResult');
  box.hidden = false;
  const start = igStart();
  const canShare = (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([res.blob], name, { type: res.type })] })); } catch (e) { return false; } })();
  box.innerHTML = `
    <video src="${url}" controls playsinline ${withAudio ? '' : 'muted'} loop></video>
    <p class="hint small">${res.ext.toUpperCase()} · ${size.w} × ${size.h} · ${fps} fps · ${fmtBytes(res.blob.size)}${res.codec === 'vp9' ? ' · VP9 (dieser Browser kann kein H.264)' : ''}${res.codec === 'realtime' ? ' · Echtzeit-Aufnahme' : ''}</p>
    <div class="sheet-actions">
      ${canShare ? '<button class="btn primary big" data-act="share" type="button">In Fotos sichern oder teilen</button>' : ''}
      <button class="btn ${canShare ? '' : 'primary big'}" data-act="save" type="button">${canShare ? 'Als Datei laden' : 'Video speichern'}</button>
    </div>
    ${canShare ? '<p class="hint small">iPhone: Im Teilen-Menü auf <b>„Video sichern“</b> tippen, dann liegt der Film in deiner Fotos-App, in voller Qualität.</p>' : ''}
    ${S.ctx.kind === 'place' && !S.ctx.rec.demo ? `<p class="hint small">Projekt fertig? Über das Menü (⋯) des ${isFlight(S.ctx.rec) ? 'Flugs' : 'Orts'} löschst du die Aufnahmen aus dem Zwischenspeicher. Sonst passiert das ${KEEP_DAYS} Tage nach der letzten Bearbeitung automatisch.</p>` : ''}
    ${withSong ? '' : `<div class="note"><ol class="steps">
      <li>Video speichern oder direkt an Instagram teilen.</li>
      <li>In Instagram Story oder Reel mit diesem Video starten.</li>
      <li>Musik hinzufügen und nach <b>${esc(S.ctx.song.name)}</b> suchen.</li>
      ${withAudio ? '<li>Der Originalton deiner Videos ist schon im Film. Im Musik-Editor von Instagram kannst du Musik und Originalton gegeneinander abstimmen.</li>' : ''}
      <li>Startpunkt auf <b>${start}</b> ziehen, Länge <b>${fmtClock(S.plan.duration)}</b>. Die Schnitte sitzen dann auf der Musik.</li>
    </ol></div>`}
    <button class="btn ghost" data-act="close" type="button">Fertig</button>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  box.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'close') { closeSheet(); URL.revokeObjectURL(url); }
    if (a.dataset.act === 'share') {
      try { await navigator.share({ files: [new File([res.blob], name, { type: res.type })], title: name }); } catch (err) { if (err && err.name !== 'AbortError') toast('Teilen nicht möglich. Speichere das Video stattdessen.', true); }
    }
    if (a.dataset.act === 'save') saveBlob(res.blob, name, url);
  });
  toast('Dein Film ist fertig.');
}

/** Reel-Titelbild: stärkstes Bild mit Titel, als JPEG in Exportgröße (bleibt auf dem Gerät). */
async function makeCover(body, size) {
  const btn = body.querySelector('#coverExport');
  btn.disabled = true;
  busy('Erstelle Titelbild …');
  try {
    const rec = S.ctx.rec;
    const best = S.ctx.kind === 'bestof';
    const title = best ? S.trip.name : rec.name, sub = ctxSub();
    const cv = await engine.renderCover(size, { text: rec.settings.showTitle === false ? '' : title || '', sub });
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.95));
    const url = URL.createObjectURL(blob);
    const name = `${(title || 'CineBeat').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_') || 'CineBeat'}_Titelbild.jpg`;
    const file = new File([blob], name, { type: 'image/jpeg' });
    const canShare = (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { return false; } })();
    let box = body.querySelector('#coverResult');
    if (!box) { box = document.createElement('div'); box.id = 'coverResult'; box.className = 'result'; btn.after(box); }
    box.innerHTML = `<img src="${url}" alt="Titelbild" class="cover-preview">
      <p class="hint small">${size.w} × ${size.h} · JPEG · ${fmtBytes(blob.size)}. In Instagram beim Reel unter „Titelbild bearbeiten“ → „Aus Aufnahmen hinzufügen“ wählen. Der Titel sitzt im Bereich, den das Profilraster zeigt.</p>
      <div class="sheet-actions">
        ${canShare ? '<button class="btn primary" data-cover="share" type="button">In Fotos sichern oder teilen</button>' : ''}
        <button class="btn" data-cover="save" type="button">Als Datei laden</button>
      </div>`;
    box.onclick = async (e) => {
      const a = e.target.closest('[data-cover]');
      if (!a) return;
      if (a.dataset.cover === 'share') { try { await navigator.share({ files: [file], title: name }); } catch (err) { /* abgebrochen */ } }
      else saveBlob(blob, name, url);
    };
  } catch (e) {
    toast('Titelbild konnte nicht erstellt werden: ' + e.message, true);
  } finally {
    busy(null);
    btn.disabled = false;
  }
}

async function saveBlob(blob, name, url) {
  if (downloadsCap) {
    try { await downloadsCap.save({ filename: name, data: blob }); toast('Gespeichert.'); return; } catch (e) {
      if (e && e.code === 'declined') return;
      if (e && e.code === 'rate_limited') { toast('Bitte kurz warten und erneut tippen.'); return; }
    }
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('Download gestartet.');
}

/* ---------- Beispiel ---------- */
function createDemoPlace() {
  return {
    id: 'demo-place', name: 'Lissabon', sub: 'Mai 2026', created: Date.now(), songId: 'demo', demo: true,
    settings: { ...DEFAULT_SETTINGS, seed: 3 }, overrides: { clips: {}, texts: [], stickers: [] }, hookId: null,
    fps: [0, 1, 2, 3, 4, 5].map((i) => 'demo-m' + i), flags: {}, pos: [38.722, -9.139],
  };
}

/** Beispielbilder werden bei Bedarf gemalt und nur im Arbeitsspeicher gehalten. */
async function ensureDemoMedia(rec) {
  if ((rec.fps || []).every((fp) => S.pool.has(fp))) return;
  const scenes = demoScenes();
  scenes.forEach((c, i) => {
    const id = 'demo-m' + i;
    if (S.pool.has(id)) return;
    S.pool.set(id, { id, kind: 'image', name: 'Beispielbild ' + (i + 1), canvas: c, w: c.width, h: c.height, time: Date.UTC(2026, 4, 12, 9 + i), demo: true, thumb: thumbFrom(c, c.width, c.height, 160), ...scoreImage(c, c.width, c.height) });
  });
}

/* ---------- Start ---------- */
function initCapabilities() {
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then((d) => { downloadsCap = d || null; }).catch(() => { downloadsCap = null; });
    }
  } catch (e) { downloadsCap = null; }
  try {
    const framed = window.top !== window.self;
    if (!framed && 'serviceWorker' in navigator && location.protocol === 'https:' && document.querySelector('link[rel="manifest"]')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  } catch (e) { /* im Rahmen: kein Service Worker */ }
}

function bindSetting(groupId, key, parse) {
  bindRadio($(groupId), (v) => {
    const st = S.ctx.rec.settings;
    st[key] = parse ? parse(v) : v;
    setRadio($(groupId), v);
    commit();
    savePlaceSoon();
    engine && (engine.t = 0);
    scheduleRebuild(0);
  });
}

async function init() {
  initCapabilities();
  try {
    engine = new Engine($('screen'));
  } catch (e) {
    document.querySelector('.app').innerHTML = '<p class="empty">Dein Browser unterstützt kein WebGL. Bitte ein aktuelles Safari oder Chrome verwenden.</p>';
    return;
  }
  engine.onTime = updateTime;
  engine.onState = setPlayingUI;
  engine.onEnded = () => { if (!S.exporting) { engine.t = 0; showPoster(); } };

  await S.store.open();
  S.trip = (await S.store.get('trip', 'main')) || { id: 'main', name: 'Meine Reise', created: Date.now() };
  S.places = (await S.store.all('places')).filter((p) => !p.demo);
  for (const p of S.places) { if (!p.fps) { p.fps = []; p.flags = {}; } delete p.cover; }
  // Beispiel nur, solange es keine eigenen Orte gibt (wird nicht gespeichert)
  await restoreWork();
  if (!S.places.length) S.places.push(createDemoPlace());
  await S.store.put('trip', S.trip);

  // Reise
  $('tripName').addEventListener('input', (e) => { S.trip.name = e.target.value; clearTimeout(saveTimer); saveTimer = setTimeout(() => S.store.put('trip', S.trip), 400); });
  $('addPlace').addEventListener('click', newPlace);
  $('addFlight').addEventListener('click', () => openFlightSheet(null));
  $('tripFiles').addEventListener('change', (e) => { const fl = Array.from(e.target.files || []); e.target.value = ''; if (fl.length) importTrip(fl); });
  $('storageHint').addEventListener('click', (e) => { if (e.target.closest('#wipeBtn')) confirmWipe(); if (e.target.closest('#clearWorkBtn')) confirmClearWork(); });
  $('openBestof').addEventListener('click', openBestof);
  $('placeList').addEventListener('click', (e) => {
    const more = e.target.closest('[data-more]');
    if (more) { e.stopPropagation(); placeMenu(more.dataset.more); return; }
    const p = e.target.closest('.place');
    if (p) openPlace(p.dataset.id);
  });
  $('placeList').addEventListener('keydown', (e) => {
    const p = e.target.closest('.place');
    if (p && e.target === p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPlace(p.dataset.id); }
  });

  // Editor
  $('backBtn').addEventListener('click', async () => { await savePlace(); S.places = await S.store.all('places'); showView('trip'); });
  $('placeName').addEventListener('input', (e) => { if (S.ctx.kind !== 'place') return; S.ctx.rec.name = e.target.value; savePlaceSoon(); scheduleRebuild(350); });
  $('placeName').addEventListener('change', commit);
  $('placeSub').addEventListener('input', (e) => { if (S.ctx.kind !== 'place') return; S.ctx.rec.sub = e.target.value; savePlaceSoon(); scheduleRebuild(350); });
  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[role="tab"]');
    if (!b) return;
    S.tab = b.dataset.tab;
    renderTabs();
    saveResume();
  });
  document.querySelector('.tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = Array.from(document.querySelectorAll('.tabs [role="tab"]'));
    const i = tabs.findIndex((t) => t.dataset.tab === S.tab);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    S.tab = n.dataset.tab;
    renderTabs();
    n.focus();
  });
  $('mediaGrid').addEventListener('click', (e) => {
    const ch = e.target.closest('[data-chapter]');
    if (ch) {
      const inc = S.ctx.rec.include;
      inc[ch.dataset.chapter] = inc[ch.dataset.chapter] === false;
      S.store.put('trip', S.trip);
      openBestof();
      return;
    }
    const t = e.target.closest('.tile');
    if (t) openMediaSheet(t.dataset.id);
  });
  for (const id of ['fileMedia', 'fileMedia2']) $(id).addEventListener('change', (e) => { const fl = Array.from(e.target.files || []); e.target.value = ''; addFiles(fl); });
  $('micSong').addEventListener('click', openMicSheet);
  $('fileMusic').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    engine.pause();
    try {
      await useSong(await importSong(f));
    } catch (err) {
      busy(null);
      toast('Diese Audiodatei kann nicht gelesen werden. Versuche MP3, M4A/AAC oder WAV (ohne Kopierschutz).', true);
    }
  });
  for (const id of ['fileMedia', 'fileMedia2', 'fileMusic', 'tripFiles']) {
    const lab = document.querySelector(`label[for="${id}"]`);
    lab.tabIndex = 0;
    lab.addEventListener('click', () => engine && engine.ensureAudio());
    lab.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $(id).click(); } });
  }
  bindSetting('startChips', 'songStart');
  bindSetting('fontChips', 'font');
  $('styleBtn').addEventListener('click', openStyleSheet);
  bindSetting('kmChips', 'km');
  bindSetting('motionChips', 'motion');
  bindSetting('motionAmtChips', 'motionAmt');
  bindSetting('drumChips', 'accent');
  bindSetting('allChips', 'allMedia');
  bindSetting('colorChips', 'color');
  bindSetting('preChips', 'pre');
  bindSetting('targetChips', 'target');
  $('fxChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fx]');
    if (!b) return;
    const st = S.ctx.rec.settings;
    const k = b.dataset.fx, d = FX_KEYS[k];
    st[k] = d.is(st, S.plan && S.plan.resolved) ? d.off : d.on;
    renderFx(st, S.plan && S.plan.resolved);
    commit(); savePlaceSoon(); engine && (engine.t = 0); scheduleRebuild(0);
  });
  bindSetting('mapThemeChips', 'mapTheme');
  bindSetting('mapInkChips', 'mapInk');
  bindSetting('mapLandChips', 'mapLand');
  bindSetting('flightViewChips', 'flightView');
  $('elChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    const st = S.ctx.rec.settings;
    st[b.dataset.k] = st[b.dataset.k] === false;
    b.setAttribute('aria-pressed', String(st[b.dataset.k]));
    commit(); savePlaceSoon(); scheduleRebuild(0);
  });
  bindSetting('lenChips', 'length', (v) => (v === 'auto' || v === 'full' ? v : +v));
  bindSetting('fmtChips', 'format');
  bindSetting('paceChips', 'pace');
  bindSetting('introChips', 'intro');
  bindSetting('outroChips', 'outro');
  bindSetting('lookGrid', 'look');
  bindSetting('frameChips', 'frame');
  bindSetting('splitChips', 'split');
  $('remixBtn').addEventListener('click', () => { S.ctx.rec.settings.seed = (S.ctx.rec.settings.seed * 1103515245 + 12345) >>> 0 || 1; commit(); savePlaceSoon(); engine.t = 0; scheduleRebuild(0); toast('Neu gemischt.'); });
  $('songMap').addEventListener('click', (e) => {
    if (!S.ctx || !S.ctx.song) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = clamp01((e.clientX - r.left) / r.width) * S.ctx.song.an.duration;
    S.ctx.rec.settings.songStart = t;
    setRadio($('startChips'), '');
    commit(); savePlaceSoon();
    engine.t = 0;
    scheduleRebuild(0);
  });
  $('igCopy').addEventListener('click', async () => {
    const txt = S.plan ? igStart() : '';
    try { await navigator.clipboard.writeText(txt); toast(`Startzeit ${txt} kopiert.`); } catch (e) { toast(`Startzeit: ${txt}`); }
  });
  $('clipRow').addEventListener('click', (e) => { const c = e.target.closest('[data-clip]'); if (c) openClipSheet(+c.dataset.clip); });
  $('resetCuts').addEventListener('click', () => { S.ctx.rec.overrides.clips = {}; commit(); savePlaceSoon(); rebuild(); toast('Schnitt zurückgesetzt.'); });
  $('addText').addEventListener('click', () => addOverlay('text'));
  $('addPin').addEventListener('click', () => addOverlay('pin'));
  $('addDate').addEventListener('click', () => addOverlay('date'));
  $('titleChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]'); const v = b && $('titleChips')._vs[+b.dataset.i];
    if (!v || S.ctx.kind !== 'place') return;
    [S.ctx.rec.name, S.ctx.rec.sub] = v;
    $('placeName').value = v[0]; $('placeSub').value = v[1];
    savePlaceSoon(); renderTitleChips(); commit(); scheduleRebuild(0);
  });
  $('ovList').addEventListener('click', (e) => { const b = e.target.closest('[data-ov]'); if (b) { const o = findOverlay(b.dataset.ov); if (o) { engine.t = Math.min(o.end - 0.2, Math.max(o.start + 0.5, engine.t)); } openOverlaySheet(b.dataset.ov); } });
  $('safeBtn').addEventListener('click', (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(on)); $('safeZones').hidden = !on; });
  $('playBtn').addEventListener('click', togglePlay);
  $('bigPlay').addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
  $('screen').addEventListener('click', () => { if (S.tab !== 'text') togglePlay(); });
  $('exportBtn').addEventListener('click', openExportSheet);
  $('sheetBackdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('sheet').hidden) closeSheet();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && S.ctx && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  });
  // Hintergrund: Stelle merken und Speicher freigeben; zurück im Vordergrund das Bild neu aufbauen
  document.addEventListener('visibilitychange', () => {
    if (!engine) return;
    if (document.hidden) { saveResume(); if (!engine.exporting) engine.trim(); }
    else if (S.ctx && S.plan && !engine.playing && !engine.exporting) engine.renderStill(engine.t);
  });
  window.addEventListener('pagehide', saveResume);
  // iOS meldet beim Scrollen (Adressleiste) ständig resize: nur echte Breitenänderungen neu zeichnen, einmal pro Frame
  let lastW = window.innerWidth, resizeRaf = 0;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW || resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; lastW = window.innerWidth; buildStripBase(); drawStrip(); drawSongMap(); });
  }, { passive: true });
  setupStrip();
  setupOverlayDrag();
  const resume = readResume();
  showView('trip');
  // Beispiel-Song schon im Hintergrund vorbereiten: neue Orte öffnen dann ohne Wartezeit
  setTimeout(() => {
    getSong('demo').catch(() => {});
    const demo = S.places.find((p) => p.demo);
    if (demo) ensureDemoMedia(demo).catch(() => {});
  }, resume ? 0 : 600);
  // nach einem Neustart durch iOS direkt dorthin zurück, wo du warst
  resumeWork(resume).catch(() => showView('trip'));
}

window.CineBeat = {
  get S() { return S; },
  get engine() { return engine; },
  openPlace, openBestof, addFiles, rebuild, newPlace, importSong,
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
