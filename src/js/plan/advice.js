/* Planer · Song zuerst: ideale Menge an Aufnahmen, Bewertung eines Schnitts, Suche nach dem besten Schnitt */

/**
 * Ideale Filmlänge aus dem Songaufbau: Film = ganzer Song; Story/Beitrag = kurzer Aufbau plus der erste Höhepunkt
 * vollständig; Reel = bis zum zweiten Höhepunkt, wenn er hineinpasst. Endet auf einem Abschnitt, auf Takte gerundet.
 */
function idealLength(an, s) {
  const fr = formatRule(s);
  const first = Math.max(0, an.firstSound), last = Math.min(an.duration, an.lastSound + 0.2);
  const songLen = last - first, bar = an.beatPeriod * 4;
  const clamp = (v) => Math.max(Math.max(fr.min, 12), Math.min(fr.max, songLen, v));
  if (fr.kind === 'film') return clamp(songLen);
  const secs = an.sections || [];
  const peak = (x) => x.label === 'drop' || x.label === 'chorus';
  const pk = secs.find((x) => peak(x) && x.start >= first + bar * 2) || secs.find(peak);
  if (!pk) return clamp(Math.round(Math.min(songLen, 32) / bar) * bar);
  const from = Math.max(first, pk.start - bar * 4);
  let end = Math.min(pk.end, from + fr.max);
  if (fr.max > 60) {
    const nx = secs.find((x) => peak(x) && x.start > pk.end + bar * 0.5);
    if (nx && nx.end - from <= fr.max) end = nx.end;
  }
  return clamp(Math.round((end - from) / bar) * bar);
}

/**
 * Empfehlung für den Song: ideale Länge und wie viele Fotos und Videos der Schnitt bei ruhigem, musikalischem Tempo trägt.
 * Die Zahl kommt aus einem echten Testschnitt der Regie (mit Platzhaltern), nicht aus einer Faustregel.
 */
const ADVICE_CACHE = new WeakMap();
function songAdvice(an, settings) {
  // je Song und Ziel nur einmal rechnen (der Musik-Tab fragt oft)
  const key = [settings.format, settings.target, settings.pace, settings.variant, settings.allMedia].join('|');
  let byKey = ADVICE_CACHE.get(an);
  if (!byKey) { byKey = new Map(); ADVICE_CACHE.set(an, byKey); }
  if (!byKey.has(key)) byKey.set(key, songAdviceRaw(an, settings));
  return byKey.get(key);
}
function songAdviceRaw(an, settings) {
  const s = { ...settings };
  const L = idealLength(an, s);
  const nV = Math.max(1, Math.min(4, Math.round(L / 16)));
  const T0 = Date.UTC(2026, 0, 1, 9);
  const fake = [];
  for (let k = 0; k < 140; k++) fake.push({ id: 'x' + k, kind: 'image', name: '', w: 3000, h: 4000, time: T0 + k * 60000, score: 0.5 + ((k * 37) % 20) / 100, hash: [k * 2654435761 >>> 0, k * 40503 >>> 0], avg: [(k * 53) % 255, (k * 97) % 255, (k * 31) % 255], luma: 0.45, focus: [0.5, 0.45] });
  for (let k = 0; k < nV; k++) fake.push({ id: 'v' + k, kind: 'video', name: '', w: 1080, h: 1920, duration: 6, time: T0 + (k + 0.5) * (140 / nV) * 60000 + 1000, score: 0.9, highlights: [{ t: 3, score: 1 }], avg: [120, 110, 100], hash: [k, k], luma: 0.45 });
  let imgs = Math.round(L / formatRule(s).shot), vids = nV, len = L;
  try {
    const p = buildPlan({ an, media: fake, settings: { ...s, allMedia: 'off', length: Math.round(L), intro: s.intro === 'auto' ? 'hook' : s.intro, pre: 'off' }, overrides: { texts: [], stickers: [] } });
    const used = new Set();
    for (const c of p.clips) for (const id of [c.mediaId, ...(c.splitIds || [])]) if (id) used.add(id);
    imgs = [...used].filter((id) => id[0] === 'x').length;
    vids = [...used].filter((id) => id[0] === 'v').length || nV;
    len = p.duration;
  } catch (e) { /* Faustregel bleibt */ }
  const span = Math.max(2, Math.round(imgs * 0.15));
  return { length: len, images: [Math.max(3, imgs - span), imgs + span], videos: [Math.max(0, vids - 1), vids + (vids < 4 ? 1 : 0)], ideal: { images: imgs, videos: vids }, bpm: an.bpm };
}

/**
 * Wie gut ein Schnitt wirkt (höher = besser): gleichmäßige Kamera über die Schnitte, keine Hektik in ruhigen Teilen,
 * Bildgrößen im Wechsel, keine Doppel nebeneinander, kein Hin und Her, nichts weggelassen oder wiederholt.
 */
function planQuality(plan, media, detail) {
  const parts = {};
  const pen = (k, v) => { parts[k] = +((parts[k] || 0) + v).toFixed(3); };
  const fmt = FORMATS[plan.resolved.format] || FORMATS['9:16'];
  const outA = (fmt.w / fmt.h) / (plan.band ? plan.band[1] : 1);
  const clips = plan.clips.filter((c) => !c.loop);
  const beat = plan.beatDur || 0.5;
  const special = (c) => c.split || c.grid || c.burst || c.rush || c.stack || c.strip || c.miniRew || c.pre || c.reveal || c.revealHit || c.leader || c.flightAnim;
  const img = (c) => { const m = media[c.mediaIndex]; return m && m.kind === 'image' ? m : null; };
  let q = 0;
  // Tempo-Sprünge der Kamera an Schnitten innerhalb eines Abschnitts
  const jumps = [];
  const speed = (c) => { const m = img(c); return m && c.motion && !special(c) ? motionSpeed(c.motion, m, outA, Math.max(0.25, c.visEnd - c.visStart)) : null; };
  for (let i = 1; i < clips.length; i++) {
    if (clips[i].sectionChange) continue;
    const a = speed(clips[i - 1]), b = speed(clips[i]);
    if (a == null || b == null || Math.max(a, b) < 0.002) continue;
    jumps.push(Math.max(a, b) / Math.max(1e-4, Math.min(a, b)));
  }
  jumps.sort((x, y) => x - y);
  if (jumps.length) pen('tempo', (jumps[Math.floor(jumps.length / 2)] - 1) * 4 + (jumps[Math.floor(jumps.length * 0.9)] - 1) * 1.5);
  // stufenlos: mittlere Tempoänderung (logarithmisch), damit auch kleine Unterschiede zählen
  if (jumps.length) pen('fluss', (jumps.reduce((a, r) => a + Math.log(r), 0) / jumps.length) * 3);
  let prevDir = null, prev = null;
  for (const c of clips) {
    const dur = c.end - c.start;
    const calm = isCalmLabel(c.label);
    // Hektik in ruhigen Teilen, Stillstand im Höhepunkt
    if (calm && !special(c) && dur < beat * 1.5) pen('hektik', 0.6);
    if (!calm && !c.vid && !special(c) && dur > beat * 8.5) pen('stehend', 0.3);
    const m = img(c);
    if (m && prev && !special(c) && !special(prev)) {
      // Bildgrößen im Wechsel
      const sa = shotSize(prev), sb = shotSize(m);
      if (sa === sb && sa !== 1) pen('groesse', 0.3);
      // Beinahe-Doppel direkt nacheinander
      if (m.hash && prev.hash && m.avg && prev.avg && hamming(m.hash, prev.hash) < 10 && Math.hypot(m.avg[0] - prev.avg[0], m.avg[1] - prev.avg[1], m.avg[2] - prev.avg[2]) < 20) pen('doppel', 1);
    }
    // Hin und Her in ruhigen Teilen
    if (calm && prevDir && c.dir && ((prevDir === 'left' && c.dir === 'right') || (prevDir === 'right' && c.dir === 'left') || (prevDir === 'up' && c.dir === 'down') || (prevDir === 'down' && c.dir === 'up'))) pen('hinher', 0.4);
    prevDir = special(c) ? null : c.dir || null;
    prev = special(c) ? null : m;
  }
  // monotone Folgen: dieselbe Bewegung mehr als dreimal hintereinander (z. B. immer nur hineinzoomen)
  let run = 0, last = null;
  for (const c of clips) { const d = special(c) ? null : c.dir; if (d && d === last) { run++; if (run >= 3) pen('monoton', 0.25); } else run = 0; last = d; }
  // Match-Cuts (die Bewegung läuft über den Schnitt weiter) sind ein Gewinn
  const mc = clips.filter((c) => c.matchCut).length;
  if (mc) pen('match', -0.15 * Math.min(4, mc));
  // derselbe weiche Übergang zweimal hintereinander wirkt mechanisch
  for (let i = 2; i < clips.length; i++) if (clips[i].tin && clips[i - 1].tin && clips[i].tin.type && clips[i].tin.type === clips[i - 1].tin.type) pen('uebergang', 0.2);
  const cap = plan.capacity || {};
  if (cap.all) pen('fehlt', (cap.droppedIds ? cap.droppedIds.length : 0) * 2);
  pen('wiederholt', (cap.repeats || 0) * 3);
  for (const v of Object.values(parts)) q -= v;
  return detail ? { score: +q.toFixed(3), parts } : +q.toFixed(3);
}

/**
 * Sucht den besten Schnitt: mehrere vollständige Varianten (je eigene Zufallsfolge: Bewegung, Übergänge, Stilmittel)
 * werden geplant und bewertet; die beste gewinnt. Gibt { plan, seed, score, tried } zurück.
 */
async function bestCut(opts, n = 8, onProgress) {
  const s0 = opts.settings.seed >>> 0;
  const seeds = [s0];
  for (let k = 1; k < n; k++) seeds.push((Math.imul(s0 + k * 7919, 2654435761) >>> 0) % 1000000 + 1);
  let best = null, stale = 0;
  const tried = [];
  for (let k = 0; k < seeds.length; k++) {
    const plan = buildPlan({ ...opts, settings: { ...opts.settings, seed: seeds[k] } });
    // harte Regeln gegen den Song (Schlag, Drop, Mindestzeiten, Reihenfolge): jede Unstimmigkeit kostet deutlich
    const audit = opts.an ? planAudit(plan, opts.media, opts.an) : [];
    const score = planQuality(plan, opts.media) - audit.length * 4;
    tried.push({ seed: seeds[k], score, audit: audit.length });
    // bei Gleichstand bleibt die bisherige Variante (die aktuelle zuerst)
    if (!best || score > best.score + 1e-6) { best = { plan, seed: seeds[k], score, audit }; stale = 0; } else stale++;
    if (onProgress) onProgress(k + 1, seeds.length);
    await new Promise((r) => setTimeout(r, 0));
    // bringen drei Varianten nacheinander nichts mehr, ist die beste gefunden (spart Rechenzeit auf dem Handy)
    if (k >= 4 && stale >= 3) break;
  }
  return { ...best, tried };
}

/**
 * Hook-Prüfung: Stoppt jemand beim Scrollen? Kein Geschmacksurteil, sondern die Mechanik der ersten 1,5 s, die im Feed
 * über Weiterwischen entscheidet: sofort Bewegung, früh eine Veränderung, ein starkes Motiv, Menschen, Musik ohne
 * Anlauf, kein langsames Einblenden. Liefert { score 0–100, parts: [{k, label, v 0–1, tip}] }.
 */
function hookScore(plan, media, an) {
  const W = 1.5;
  const clips = plan.clips.filter((c) => !c.loop);
  const early = clips.filter((c) => c.visStart < W);
  const mOf = (c) => media[c.mediaIndex];
  const cl = (x) => Math.max(0, Math.min(1, x));
  const parts = [];
  const add = (k, label, v, w, tip) => parts.push({ k, label, v: cl(v), w, tip });
  // 1. Bewegung ab dem ersten Bild: Kamerafahrt je Sekunde oder bewegtes Video
  const c0 = early[0] || clips[0];
  const m0 = c0 && mOf(c0);
  let mv = 0;
  if (c0 && c0.motion) {
    const d = Math.max(0.3, c0.visEnd - c0.visStart), a = c0.motion.from, b = c0.motion.to;
    // sanfte Kamerafahrt zählt wenig, deutliche Bewegung viel (Zoom-Anteil und Weg je Sekunde)
    mv = (Math.abs(b.s - a.s) * 4 + Math.hypot(b.x - a.x, b.y - a.y) * 0.8) / d / 0.45;
  }
  if (m0 && m0.kind === 'video') mv = Math.max(mv, (m0.motion || 0) / 0.04);
  if (plan.intro === 'rush' || plan.intro === 'knockout') mv = Math.max(mv, 1);
  // Kino-Rollladen: jedes Feld setzt mit einem Zoom ein und fährt im Ausschnitt weiter, Videos laufen
  const wall = c0 && c0.split && c0.split.orient === 'wall' ? c0.split : null;
  if (wall) mv = Math.max(mv, 1);
  add('motion', 'Bewegung ab dem ersten Bild', mv, 0.2, 'Stillstand in der ersten Sekunde wird weggewischt: ein Video oder eine schnelle Bilderfolge vorn hilft.');
  // 2. frühe Veränderung: ein Schnitt in den ersten 1,5 s zeigt „hier passiert etwas“
  // (im Kino-Rollladen ist jedes neu erscheinende Feld eine Veränderung wie ein Schnitt)
  const cuts = clips.filter((c) => c.start > 0.05 && c.start < W).length + (wall ? wall.reveal.filter((r) => r > 0.05 && r < W).length : 0);
  add('change', 'Früher Schnitt', cuts >= 2 ? 1 : cuts === 1 ? 0.8 : 0.15, 0.2, 'Der erste Schnitt kommt spät: eine schnelle Bilderfolge oder ein kürzeres erstes Bild.');
  // 3. stärkstes Motiv vorn (verglichen mit dem, was der Film sonst zeigt)
  const used = clips.map(mOf).filter(Boolean).map((m) => m.score || 0).sort((a, b) => a - b);
  const q = (p) => used.length ? used[Math.min(used.length - 1, Math.floor(p * used.length))] : 0.5;
  const top = Math.max(0, ...early.map(mOf).filter(Boolean).map((m) => m.score || 0));
  add('strong', 'Starkes Motiv vorn', (top - q(0.5)) / Math.max(0.02, q(0.92) - q(0.5)), 0.2, 'Vorn steht nicht euer bestes Bild: das stärkste als Startbild nehmen.');
  // 4. Menschen: Gesichter halten den Blick
  const ppl = Math.max(0, ...clips.filter((c) => c.visStart < 2).map(mOf).filter(Boolean).map((m) => usScore(m)));
  add('people', 'Menschen im Bild', 0.3 + ppl * 0.7, 0.15, 'In den ersten 2 s ist niemand zu sehen: ein Bild von euch vorn bindet stärker.');
  // 5. Musik trägt sofort: Energie der ersten Schläge gegenüber dem Song
  const en = Array.from(an.energy || []), bt = Array.from(an.beats || []);
  const med = en.length ? en.slice().sort((a, b) => a - b)[en.length >> 1] : 0.5;
  const firstE = bt.map((b, i) => [b, en[i] || 0]).filter(([b]) => b >= plan.win.start - 0.05 && b < plan.win.start + W).map(([, e]) => e);
  const eAvg = firstE.length ? firstE.reduce((a, b) => a + b, 0) / firstE.length : med;
  // ehrlich: ist der Song am Anfang leiser gemischt (Hüllkurve eines Einstiegs), zählt er entsprechend weniger
  const env = plan.win.env;
  let envG = 1;
  if (env && env.length) {
    const gAt = (x) => { if (x <= env[0][0]) return env[0][1]; for (let k = 1; k < env.length; k++) if (x <= env[k][0]) { const [a, ga] = env[k - 1], [b, gb] = env[k]; return ga + (gb - ga) * ((x - a) / Math.max(1e-6, b - a)); } return env[env.length - 1][1]; };
    let sum = 0;
    for (let k = 0; k < 15; k++) sum += gAt((k + 0.5) * W / 15);
    envG = Math.min(1, (sum / 15) / 0.5);
  }
  add('music', 'Musik trägt sofort', ((eAvg / Math.max(0.05, med) - 0.6) / 0.6) * envG, 0.15, 'Der Song beginnt leise: „Ab Refrain“ oder „Kurz davor“ als Songstart.');
  // 6. kein langsamer Anlauf aus Schwarz
  const black = (plan.fx || []).some((f) => (f.type === 'black' || f.type === 'dim') && f.start < 0.3 && f.end > 0.45);
  const slow = plan.intro === 'cinema' || (plan.win.fadeIn || 0) > 0.3;
  add('start', 'Kein Anlauf aus Schwarz', black ? 0 : slow ? 0.4 : 1, 0.1, 'Der Film blendet langsam auf: einen Einstieg ohne Schwarzbild wählen.');
  const score = Math.round(100 * parts.reduce((a, p) => a + p.v * p.w, 0) / parts.reduce((a, p) => a + p.w, 0));
  return { score, parts };
}

/**
 * Hook automatisch verbessern: probiert Einstieg, Songstart und Startbild durch und nimmt die Kombination mit dem
 * höchsten Stopp-Wert – nur, wenn der übrige Film dadurch nicht schlechter wird. Liefert { settings, hookId, from, to }.
 */
async function improveHook(opts, onProgress) {
  const s0 = opts.settings;
  const base = buildPlan(opts);
  const h0 = hookScore(base, opts.media, opts.an).score, q0 = planQuality(base, opts.media);
  const imgs = opts.media.filter((m) => m.kind === 'image' && !m.bad && !m.excluded);
  const byScore = imgs.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
  const bestUs = imgs.filter((m) => isUs(m)).sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const hooks = [s0.hookId || null, byScore[0] && byScore[0].id, bestUs && bestUs.id].filter((v, i, a) => a.indexOf(v) === i);
  const intros = [s0.intro || 'auto', 'rush', 'hook', 'knockout'].filter((v, i, a) => a.indexOf(v) === i);
  const starts = [s0.songStart == null ? 'auto' : s0.songStart, 'hook', 'prehook'].filter((v, i, a) => a.indexOf(v) === i);
  let best = { h: h0, settings: null, hookId: s0.hookId || null };
  const total = intros.length * starts.length * hooks.length;
  let k = 0;
  for (const intro of intros) for (const songStart of starts) for (const hookId of hooks) {
    k++;
    if (onProgress) { onProgress(k, total); await new Promise((r) => setTimeout(r, 0)); }
    const settings = { ...s0, intro, songStart, hookId };
    let plan;
    try { plan = buildPlan({ ...opts, settings }); } catch (e) { continue; }
    const h = hookScore(plan, opts.media, opts.an).score;
    if (h <= best.h + 2) continue;
    // der Rest des Films darf nicht leiden
    if (planQuality(plan, opts.media) < q0 - Math.max(0.5, Math.abs(q0) * 0.08)) continue;
    best = { h, settings: { intro, songStart }, hookId };
  }
  return { from: h0, to: best.h, settings: best.settings, hookId: best.hookId };
}

/**
 * Stimmigkeits-Prüfung: harte Regeln, die jeder fertige Schnitt gegenüber dem Song erfüllen muss.
 * Liefert [{ code, t, msg }] – leer heißt: alles stimmt.
 */
function planAudit(plan, media, an) {
  const out = [];
  const add = (code, t, msg) => out.push({ code, t: +(+t).toFixed(2), msg });
  const flags = (c) => ['burst', 'rush', 'leader', 'pre', 'miniRew', 'reveal', 'knock', 'grid', 'stack', 'split', 'vid', 'replay', 'strip', 'gridMid', 'afterGrid', 'loop', 'tap'].filter((k) => c[k]).concat(c.role ? ['role=' + c.role] : []).join(',');
  const win = plan.win, D = plan.duration, beat = plan.beatDur || an.beatPeriod || 0.5;
  const rel = (a) => Array.from(a || []).map((x) => x - win.start);
  const beats = rel(an.beats), bars = rel(an.barStart);
  const near = (arr, t, tol = 0.035) => arr.some((b) => Math.abs(b - t) < tol);
  const clips = plan.clips.filter((c) => !c.loop);
  const fr = formatRule(plan.resolved);
  // 1. Film lückenlos, nichts ragt über das Ende
  for (let i = 1; i < clips.length; i++) if (Math.abs(clips[i].start - clips[i - 1].end) > 0.001) add('luecke', clips[i].start, `Lücke/Überlappung ${(clips[i].start - clips[i - 1].end).toFixed(3)} s zwischen Einstellung ${i} (${flags(clips[i - 1])}) und ${i + 1} (${flags(clips[i])})`);
  if (clips.length && Math.abs(clips[clips.length - 1].end - D) > 0.02) add('ende', D, 'letzte Einstellung endet nicht mit dem Film');
  // 2. jeder Schnitt auf einem Schlag
  // bewusst schnelle Serien (Bilderflut, Serie, Rückspulen) schneiden auf Achtel/Sechzehntel des Schlags
  const sub = [];
  for (let i = 0; i + 1 < beats.length; i++) for (let q = 1; q < 4; q++) sub.push(beats[i] + ((beats[i + 1] - beats[i]) * q) / 4);
  const fast = (c) => c.burst || c.rush || c.miniRew || c.leader || c.knock;
  for (const c of clips) if (c.start > 0.05 && !near(beats, c.start) && !(fast(c) || fast(clips[c.i - 1] || {})) || (c.start > 0.05 && (fast(c) || fast(clips[c.i - 1] || {})) && !near(beats, c.start) && !near(sub, c.start))) add('beat', c.start, `Schnitt neben dem Schlag (Einstellung ${c.i + 1} ${flags(c)} ${c.label})`);
  // 3. jeder Einsatz eines Refrains/Drops im Film ist ein Schnitt
  for (const s of an.sections || []) {
    // wie der Planer: der Einsatz rastet auf den nächsten Schlag (höchstens ein gutes Drittel Schlag daneben)
    const t0 = s.start - win.start;
    let t = t0, bd = Infinity;
    for (const b of beats) { const d = Math.abs(b - t0); if (d < bd) { bd = d; t = b; } }
    if (bd > beat * 0.35) t = t0;
    if ((s.label !== 'drop' && s.label !== 'chorus') || t < 0.5 || t > D - 0.5) continue;
    const prev = (an.sections || []).find((x) => Math.abs(x.end - s.start) < 0.05);
    if (prev && (prev.label === 'drop' || prev.label === 'chorus')) continue;
    if (!clips.some((c) => Math.abs(c.start - t) < 0.04)) add('drop', t, 'Einsatz von Refrain/Drop ist kein Schnitt');
  }
  // 4. keine Sekundenbruchteile: normale Einstellungen mindestens ein Schlag, in ruhigen Teilen mindestens zwei (außer bewusst dicht)
  const busyC = (c) => c.burst || c.rush || c.leader || c.pre || c.miniRew || c.reveal || c.knock || c.grid || c.stack || c.split;
  for (const c of clips) {
    if (busyC(c) || c.i === clips.length - 1) continue;
    const len = c.end - c.start;
    if (len < beat * 0.95) add('kurz', c.start, `Einstellung ${c.i + 1} kürzer als ein Schlag (${len.toFixed(2)} s)`);
    else if ((c.label === 'intro' || c.label === 'verse' || c.label === 'break' || c.label === 'outro') && len < beat * 1.85 && (plan._m ? plan._m.level < 4 : true) && !(c.tapCut)) add('hektik', c.start, `ruhiger Teil (${c.label}), aber Einstellung ${c.i + 1} nur ${len.toFixed(2)} s ${flags(c)}`);
  }
  // 5. Videos: laufen über keinen Drop-Einsatz, lang genug, sinnvolles Tempo
  const snapB = (t0) => { let t = t0, bd = Infinity; for (const b of beats) { const d = Math.abs(b - t0); if (d < bd) { bd = d; t = b; } } return bd <= beat * 0.35 ? t : t0; };
  const drops = (an.sections || []).filter((s) => s.label === 'drop' || s.label === 'chorus').map((s) => snapB(s.start - win.start));
  for (const c of clips) {
    const m = media[c.mediaIndex];
    if (!m || m.kind !== 'video' || c.split || c.grid) continue;
    if (drops.some((t) => t > c.start + 0.05 && t < c.end - 0.05)) add('video-drop', c.start, `Video läuft über einen Drop-Einsatz (Einstellung ${c.i + 1})`);
    const len = c.end - c.start;
    if (c.vid && len < Math.min(videoSpan(m) * 0.9, 1.2) - 0.03) add('video-kurz', c.start, `Video nur ${len.toFixed(2)} s`);
    if (c.rate && (c.rate < 0.34 || c.rate > 2.7)) add('video-tempo', c.start, `Video-Tempo ${c.rate}`);
  }
  // 6. Songausschnitt: beginnt auf einer Eins, endet auf einer Eins oder einem Abschnittsende; Länge im Format
  if (bars.length && !near(bars, 0, 0.06)) add('start', 0, 'Songausschnitt beginnt nicht auf einer Eins');
  const secEnds = (an.sections || []).map((s) => s.end - win.start);
  // (am natürlichen Songende – nach der letzten Eins – ist Schluss richtig, auch wenn das Raster dort ausläuft)
  const songEnd = (an.lastSound != null && win.end >= Math.min(an.duration || Infinity, an.lastSound + 0.2) - 0.05) || (bars.length && D >= bars[bars.length - 1] - 0.1);
  if (bars.length && !near(bars, D, 0.08) && !near(secEnds, D, 0.08) && !songEnd) add('schluss', D, `Songausschnitt endet mitten im Takt (${(win.start).toFixed(2)}–${win.end.toFixed(2)})`);
  if (D > fr.max + 0.5) add('laenge', D, `Film ${D.toFixed(1)} s länger als ${fr.max} s (${fr.label})`);
  // 7. nichts doppelt, nichts vergessen (alle Aufnahmen)
  const cap = plan.capacity || {};
  // Wiederholung nur, wenn das Material die gewählte Länge nicht füllen kann (Fotos höchstens 6 s, Videos ganz)
  const fill = media.filter((m) => !m.bad && !m.excluded).reduce((a, m) => a + (m.kind === 'video' ? videoSpan(m) : 6), 0);
  if (cap.repeats && fill >= D) add('doppelt', 0, `${cap.repeats}× dieselbe Aufnahme mehrfach, obwohl das Material reicht`);
  // „Alle Aufnahmen“: fehlen darf nur etwas, wenn die Länge fest gewählt ist und schlicht nicht alles hineinpasst
  const fixedLen = typeof plan.resolved.length === 'number' || +plan.resolved.length > 0;
  // (ebenso, wenn der Film schon an der Formatgrenze oder am Songende steht – dann sagt die Notiz, was draußen bleibt)
  const bar = an.bpm ? 240 / an.bpm : 2;
  const atLimit = D >= fr.max - bar * 1.6 - 0.05 || songEnd;
  if (plan.resolved.allMedia !== 'off' && cap.droppedIds && cap.droppedIds.length && !fixedLen && !atLimit) add('fehlt', 0, `${cap.droppedIds.length} Aufnahmen fehlen`);
  // 8. Reihenfolge: Tagesblöcke nie vertauscht (Vorschau-Einstiege ausgenommen)
  if (plan.resolved.order !== 'streng') {
    // Startbild-Einstiege (Aufblende, Countdown, Raster) und Vorschauen zeigen bewusst das stärkste Bild der Reise vorab
    const seq = clips.filter((c) => !c.rush && !c.pre && !c.reveal && !c.revealHit && !c.leader && !c.knock && !c.grid && c.role !== 'hook' && c.role !== 'rush' && !c.replay && !c.miniRew && media[c.mediaIndex] && media[c.mediaIndex].time).map((c) => media[c.mediaIndex]);
    // Wiederholungen (zu wenig Material für die gewählte Länge) zählen nicht als Reihenfolge
    const cnt = new Map();
    for (const c of plan.clips) cnt.set(c.mediaId, (cnt.get(c.mediaId) || 0) + 1);
    const seen = new Set([...cnt].filter(([, n]) => n > 1).map(([id]) => id));
    for (let i = 1; i < seq.length; i++) {
      seen.add(seq[i - 1].id);
      if (seen.has(seq[i].id)) continue;
      const a = dayBlock(seq[i - 1]), b = dayBlock(seq[i]);
      if (a !== b && seq[i].time < seq[i - 1].time) { add('reihenfolge', i, `Tagesblock ${b} nach ${a} (Position ${i}: ${seq[i - 1].id}→${seq[i].id})`); break; }
    }
  }
  return out;
}
