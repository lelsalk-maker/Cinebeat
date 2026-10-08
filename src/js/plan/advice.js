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
  const key = [settings.format, settings.target, settings.pace, settings.variant, settings.allMedia, settings.menge].join('|');
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
      if ((m.sig && prev.sig && sameMotif(m, prev)) || (m.hash && prev.hash && m.avg && prev.avg && hamming(m.hash, prev.hash) < 10 && Math.hypot(m.avg[0] - prev.avg[0], m.avg[1] - prev.avg[1], m.avg[2] - prev.avg[2]) < 20)) pen('doppel', 1);
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
/**
 * Takt-Prüfer für alles, was nicht Schnitt ist: Effekte (Blitz, Zoom-Stoß, Spiegel, Scharfwerden), Einblendungen
 * (Titel, Kapitel, Countdown …), Farbmomente (Schwarzweiß → Farbe) – jedes Ereignis muss auf einem Schlag, einem
 * halben Schlag, einer Bassdrum oder einem Schnitt liegen (±25 ms). Liefert [{ kind, t, msg }].
 */
function planSyncAudit(plan, an) {
  const w0 = plan.win.start, D = plan.duration;
  const beats = Array.from(an.beats || []).map((b) => b - w0).filter((t) => t > -0.1 && t < D + 0.1);
  const grid = beats.concat(beats.slice(1).map((b, i) => (b + beats[i]) / 2));
  const kicks = Array.from(an.kicks || []).map((k) => k - w0);
  const cuts = plan.clips.map((c) => c.start);
  const ok = (t) => [grid, kicks, cuts].some((l) => l.some((x) => Math.abs(x - t) < 0.025));
  const out = [];
  const add = (kind, t, msg) => out.push({ kind, t: +t.toFixed(2), msg });
  for (const f of plan.fx || []) if (['flash', 'punch', 'mirror', 'focus'].includes(f.type) && f.start > 0.05 && !ok(f.start)) add('fx', f.start, `${f.type} neben dem Schlag`);
  for (const o of plan.overlays || []) if (!['shutter', 'sticker', 'usertext', 'datestamp', 'flight', 'routemap'].includes(o.type) && o.start > 0.05 && !ok(o.start)) add('overlay', o.start, `${o.type} beginnt neben dem Schlag`);
  for (const c of plan.colorFx || []) {
    for (const k of ['at', 'start', 'hit']) if (typeof c[k] === 'number' && c[k] > 0.05 && c[k] < D - 0.05 && !ok(c[k])) add('color', c[k], `Farbmoment (${c.mode || c.type || ''}) neben dem Schlag`);
  }
  return out;
}

/** Wie ähnlich sind zwei Schnitte (0–1)? Gleiche Aufnahme am gleichen Platz und gleiche Schnittstellen. */
function cutSimilarity(a, b) {
  const seqA = a.clips.filter((c) => !c.loop).map((c) => c.mediaId || (c.split && c.split.ids.join('+')) || '');
  const seqB = b.clips.filter((c) => !c.loop).map((c) => c.mediaId || (c.split && c.split.ids.join('+')) || '');
  let same = 0;
  for (let k = 0; k < Math.min(seqA.length, seqB.length); k++) if (seqA[k] === seqB[k]) same++;
  const cutsB = b.clips.map((c) => c.start);
  const cutSame = a.clips.filter((c) => cutsB.some((t) => Math.abs(t - c.start) < 0.03)).length / Math.max(1, a.clips.length);
  return 0.65 * (same / Math.max(1, seqA.length, seqB.length)) + 0.35 * cutSame;
}

async function bestCut(opts, n = 8, onProgress) {
  const s0 = opts.settings.seed >>> 0;
  const seeds = [s0];
  for (let k = 1; k < n; k++) seeds.push((Math.imul(s0 + k * 7919, 2654435761) >>> 0) % 1000000 + 1);
  let best = null, stale = 0;
  const tried = [];
  for (let k = 0; k < seeds.length; k++) {
    const plan = buildPlan({ ...opts, settings: { ...opts.settings, seed: seeds[k] } });
    // harte Regeln gegen den Song (Schlag, Drop, Mindestzeiten, Reihenfolge): jede Unstimmigkeit kostet deutlich
    // dazu jedes Ereignis neben dem Takt (Effekt, Einblendung, Farbmoment)
    const audit = opts.an ? planAudit(plan, opts.media, opts.an).concat(planSyncAudit(plan, opts.an)) : [];
    // „Neu schneiden“: eine Variante, die fast wie der bisherige Schnitt aussieht, zählt deutlich weniger
    const same = opts.avoid ? cutSimilarity(plan, opts.avoid) : 0;
    const score = planQuality(plan, opts.media) - audit.length * 4 - (same > 0.7 ? 30 * (same - 0.7) / 0.3 + 10 : 0);
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
 * über Weiterwischen entscheidet. Zwei Arten von Befunden:
 *  - Fehler (kind 'fehler'): Anlauf aus Schwarz, Stillstand (weder Bewegung noch Schnitt), unscharfes/zu dunkles erstes
 *    Bild, Song beginnt in der Stille – jeder kostet 25 Punkte und gehört behoben.
 *  - Hinweise (kind 'hinweis'): Bewegung, früher Schnitt, stärkstes Motiv, Menschen, Musik – machen den Einstieg stärker.
 * Liefert { score 0–100, parts: [{k, label, v 0–1, w, tip, kind}], errors }.
 */
function hookScore(plan, media, an) {
  const W = 1.5;
  const clips = plan.clips.filter((c) => !c.loop);
  const early = clips.filter((c) => c.visStart < W);
  const mOf = (c) => media[c.mediaIndex];
  const cl = (x) => Math.max(0, Math.min(1, x));
  const parts = [];
  const add = (k, label, v, w, tip, kind = 'hinweis') => parts.push({ k, label, v: cl(v), w, tip, kind });
  const c0 = early[0] || clips[0];
  const m0 = c0 && mOf(c0);
  const wall = c0 && c0.split && c0.split.orient === 'wall' ? c0.split : null;
  // Bewegung ab dem ersten Bild: Kamerafahrt je Sekunde oder bewegtes Video
  let mv = 0;
  if (c0 && c0.motion) {
    const d = Math.max(0.3, c0.visEnd - c0.visStart), a = c0.motion.from, b = c0.motion.to;
    mv = (Math.abs(b.s - a.s) * 4 + Math.hypot(b.x - a.x, b.y - a.y) * 0.8) / d / 0.45;
  }
  if (m0 && m0.kind === 'video') mv = Math.max(mv, (m0.motion || 0) / 0.04);
  if (plan.intro === 'rush' || plan.intro === 'knockout' || wall) mv = Math.max(mv, 1);
  // frühe Veränderung: Schnitte in den ersten 1,5 s (im Kino-Rollladen zählt jedes neu erscheinende Feld)
  const cuts = clips.filter((c) => c.start > 0.05 && c.start < W).length + (wall ? wall.reveal.filter((r) => r > 0.05 && r < W).length : 0);
  // Musik: Energie der ersten Schläge gegenüber dem Song
  const en = Array.from(an.energy || []), bt = Array.from(an.beats || []);
  const med = en.length ? en.slice().sort((a, b) => a - b)[en.length >> 1] : 0.5;
  const firstE = bt.map((b, i) => [b, en[i] || 0]).filter(([b]) => b >= plan.win.start - 0.05 && b < plan.win.start + W).map(([, e]) => e);
  const eRel = (firstE.length ? firstE.reduce((a, b) => a + b, 0) / firstE.length : med) / Math.max(0.05, med);

  // ---- Fehler ----
  // (ein abgedunkeltes Bild unter dem Titel ist kein Schwarz – nur echtes Schwarz bzw. fast schwarz zählt)
  const black = (plan.fx || []).some((f) => (f.type === 'black' || (f.type === 'dim' && (f.amp == null || f.amp >= 0.75))) && f.start < 0.3 && f.end > 0.45);
  const slow = plan.intro === 'cinema' || (plan.win.fadeIn || 0) > 0.3;
  add('start', 'Kein Anlauf aus Schwarz', black || slow ? 0 : 1, 0, 'Der Film beginnt mit Schwarz oder einer langsamen Aufblende: einen Einstieg ohne Schwarzbild wählen (z. B. Startbild mit Titel).', 'fehler');
  // (eine ruhige Kamerafahrt ist kein Stillstand – Fehler ist nur: kaum Bewegung und kein Schnitt)
  add('still', 'Sofort etwas los', mv >= 0.1 || cuts >= 1 ? 1 : 0, 0, 'In den ersten 1,5 s bewegt sich nichts und es gibt keinen Schnitt: ein Video oder einen früheren Schnitt vorn.', 'fehler');
  // erstes Bild, das man wirklich sieht (mindestens 0,4 s; Blitzbilder einer Bilderflut zählen nicht)
  const seen0 = early.find((c) => c.end - Math.max(0, c.start) >= 0.4 && mOf(c));
  const m1 = seen0 && mOf(seen0);
  const poor = m1 && m1.kind === 'image' && ((m1.sharp != null && m1.sharp < 0.3) || (m1.luma != null && m1.luma < 0.15));
  add('quality', 'Erstes Bild scharf und hell genug', poor ? 0 : 1, 0, 'Das erste Bild ist unscharf oder sehr dunkel: ein anderes Startbild wählen.', 'fehler');
  const silent = eRel < 0.35 || (an.firstSound != null && an.firstSound > plan.win.start + 0.3);
  add('silence', 'Musik von Anfang an', silent ? 0 : 1, 0, 'Der Song beginnt in der Stille oder sehr leise: als Songstart „Ab Refrain“ oder „Kurz davor“ wählen.', 'fehler');

  // ---- Hinweise ----
  add('motion', 'Bewegung ab dem ersten Bild', mv, 0.25, 'Ein Video oder eine deutliche Kamerafahrt vorn hält den Blick noch stärker.');
  add('change', 'Früher Schnitt', cuts >= 2 ? 1 : cuts === 1 ? 0.8 : 0.3, 0.2, 'Ein zweiter Schnitt in der ersten Sekunde (z. B. Bilderflut-Einstieg) macht neugierig.');
  const used = clips.map(mOf).filter(Boolean).map((m) => m.score || 0).sort((a, b) => a - b);
  const q = (p) => (used.length ? used[Math.min(used.length - 1, Math.floor(p * used.length))] : 0.5);
  const top = Math.max(0, ...early.map(mOf).filter(Boolean).map((m) => m.score || 0));
  add('strong', 'Starkes Motiv vorn', (top - q(0.5)) / Math.max(0.02, q(0.92) - q(0.5)), 0.25, 'Vorn steht nicht euer bestes Bild: das stärkste als Startbild nehmen.');
  // Menschen: erkannt (Gesichter/Haut im Bild) oder von dir als „Wir“ markiert
  const ppl = Math.max(0, ...clips.filter((c) => c.visStart < 2).map(mOf).filter(Boolean).map((m) => Math.max(usScore(m), m.faces ? 1 : 0, Math.min(1, (m.people || 0) * 1.5))));
  add('people', 'Menschen im Bild', 0.4 + ppl * 0.6, 0.15, 'Ein Bild mit Menschen in den ersten 2 s bindet noch stärker.');
  add('music', 'Musik trägt sofort', (eRel - 0.6) / 0.6, 0.15, 'Der Song ist am Anfang eher leise: „Ab Refrain“ als Songstart setzt sofort ein.');

  const hints = parts.filter((p) => p.kind === 'hinweis');
  const errors = parts.filter((p) => p.kind === 'fehler' && p.v < 0.5);
  const base = 100 * hints.reduce((a, p) => a + p.v * p.w, 0) / hints.reduce((a, p) => a + p.w, 0);
  const score = Math.max(0, Math.round(base - errors.length * 25));
  return { score, parts, errors: errors.length };
}

/**
 * Hook automatisch verbessern: probiert Einstieg, Songstart und Startbild durch und nimmt die Kombination mit dem
 * höchsten Stopp-Wert – nur, wenn der übrige Film dadurch nicht schlechter wird. Liefert { settings, hookId, from, to }.
 */
async function improveHook(opts, onProgress, only = {}) {
  const s0 = opts.settings;
  const base = buildPlan(opts);
  const hs0 = hookScore(base, opts.media, opts.an), h0 = hs0.score, q0 = planQuality(base, opts.media);
  const imgs = opts.media.filter((m) => m.kind === 'image' && !m.bad && !m.excluded);
  const byScore = imgs.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
  const bestUs = imgs.filter((m) => isUs(m)).sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const hooks = [s0.hookId || null, byScore[0] && byScore[0].id, bestUs && bestUs.id].filter((v, i, a) => a.indexOf(v) === i);
  // only.intros / only.starts: was durchprobiert werden darf (z. B. nur, was der Nutzer auf Auto gelassen hat)
  // Abwechslung über die Reise: Einstiege der anderen Orte werden nicht durchprobiert
  const avoid = s0.avoidIntros || [];
  const intros = (only.intros || [s0.intro || 'auto', 'rush', 'hook', 'knockout']).filter((v, i, a) => a.indexOf(v) === i && (i === 0 || !avoid.includes(v)));
  const starts = (only.starts || [s0.songStart == null ? 'auto' : s0.songStart, 'hook', 'prehook']).filter((v, i, a) => a.indexOf(v) === i);
  // zuerst Fehler beheben, dann den Stopp-Wert heben
  let best = { h: h0, e: hs0.errors, settings: null, hookId: s0.hookId || null };
  const total = intros.length * starts.length * hooks.length;
  let k = 0;
  for (const intro of intros) for (const songStart of starts) for (const hookId of hooks) {
    k++;
    if (onProgress) { onProgress(k, total); await new Promise((r) => setTimeout(r, 0)); }
    const settings = { ...s0, intro, songStart, hookId };
    let plan;
    try { plan = buildPlan({ ...opts, settings }); } catch (e) { continue; }
    const hs = hookScore(plan, opts.media, opts.an), h = hs.score;
    if (hs.errors > best.e || (hs.errors === best.e && h <= best.h + 2)) continue;
    // der Rest des Films darf nicht leiden
    if (planQuality(plan, opts.media) < q0 - Math.max(0.5, Math.abs(q0) * 0.08)) continue;
    best = { h, e: hs.errors, settings: { intro, songStart }, hookId };
  }
  return { from: h0, to: best.h, errorsFrom: hs0.errors, errorsTo: best.e, settings: best.settings, hookId: best.hookId };
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
  const fast = (c) => c.burst || c.rush || c.miniRew || c.leader || c.knock || c.pre === 'rew';
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
  // (beginnt der Film mit dem Song selbst – erster Ton –, ist das der natürliche Anfang, auch vor der ersten Eins)
  if (bars.length && !near(bars, 0, 0.06) && !(plan.win.start <= (an.firstSound || 0) + 0.06)) add('start', 0, 'Songausschnitt beginnt nicht auf einer Eins');
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
  if (allMediaOn(plan.resolved) && cap.droppedIds && cap.droppedIds.length && !fixedLen && !atLimit) add('fehlt', 0, `${cap.droppedIds.length} Aufnahmen fehlen`);
  // 8. Reihenfolge: Tagesblöcke nie vertauscht (Vorschau-Einstiege ausgenommen)
  // (nur „Nach Tageszeit“: „Zum Lied“ ordnet bewusst nach Songstelle, „Streng“ prüft die Uhrzeit anders)
  if (plan.resolved.order === 'tageszeit') {
    // Startbild-Einstiege (Aufblende, Countdown, Raster) und Vorschauen zeigen bewusst das stärkste Bild der Reise vorab
    const seq = clips.filter((c) => !c.flash && !c.rush && !c.pre && !c.reveal && !c.revealHit && !c.leader && !c.knock && !c.grid && c.role !== 'hook' && c.role !== 'rush' && !c.replay && !c.miniRew && media[c.mediaIndex] && media[c.mediaIndex].time).map((c) => media[c.mediaIndex]);
    // Wiederholungen (zu wenig Material für die gewählte Länge) zählen nicht als Reihenfolge
    const cnt = new Map();
    for (const c of plan.clips) if (!c.flash) cnt.set(c.mediaId, (cnt.get(c.mediaId) || 0) + 1);
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

/**
 * Film-Check statt einer Punktzahl: sechs messbare Eigenschaften eines fertigen Schnitts, jede erfüllt oder mit
 * konkretem Hinweis. Liefert [{ key, ok, label, detail }] – Einstieg (Stopp-Kraft der ersten 1,5 s), Takt (jede Regel
 * gegen den Song), Abwechslung (keine gleichen Motive hintereinander), Lesbarkeit der Titel, ruhige Videostellen,
 * Schnitte und Gesang (nicht mitten in eine Zeile in ruhigen Teilen).
 */
function filmCheck(plan, media, an, hook) {
  const byId = new Map(media.map((m) => [m.id, m]));
  const out = [];
  const h = hook || hookScore(plan, media, an);
  out.push({ key: 'hook', ok: !h.errors && h.score >= 70, label: !h.errors && h.score >= 70 ? 'Einstieg stoppt beim Scrollen' : h.errors ? 'Einstieg hat einen Fehler' : 'Einstieg kann stärker sein', detail: h.errors ? 'Schwarzbild, Standbild oder schwaches erstes Bild am Anfang.' : 'Bewegung, früher Schnitt und ein starkes Motiv in den ersten 1,5 s.' });
  let audit = [];
  try { audit = planAudit(plan, media, an).concat(planSyncAudit(plan, an)); } catch (e) { audit = []; }
  out.push({ key: 'takt', ok: !audit.length, label: audit.length ? `${audit.length} ${audit.length === 1 ? 'Stelle weicht' : 'Stellen weichen'} vom Song ab` : 'Jeder Schnitt sitzt im Takt', detail: audit.length ? audit[0].msg : 'Schnitte, Effekte und Einblendungen auf Schlag, Takt oder Einsatz.' });
  const plain = plan.clips.filter((c) => c.mediaId && !c.split && !c.flash && !c.rush && !c.burst && !c.welcome && !c.grid && !c.stack && !c.loop && !c.recap);
  let twins = 0;
  for (let i = 1; i < plain.length; i++) if (sameMotif(byId.get(plain[i - 1].mediaId), byId.get(plain[i].mediaId))) twins++;
  out.push({ key: 'motiv', ok: !twins, label: twins ? `${twins}× gleiches Motiv hintereinander` : 'Nie zwei gleiche Motive hintereinander', detail: twins ? 'Dein Material hat hier zu wenig Abwechslung – Neu schneiden oder ein ähnliches Bild ausschließen.' : 'Ähnliche Strände, Plätze und Serien stehen nie direkt nebeneinander.' });
  const titles = plan.overlays.filter((o) => ['city', 'lower', 'chapter'].includes(o.type) && o.text);
  const weak = titles.filter((o) => !o.place).length;
  out.push({ key: 'text', ok: !weak, label: !titles.length ? 'Keine Titel im Film' : weak ? 'Titel ohne Kontrastprüfung' : titles.some((o) => o.behind) ? 'Ortsname hinter den Bergen, gut lesbar' : 'Titel an ruhiger Stelle, gut lesbar', detail: 'Schriftfarbe und Abdunklung nach dem Bild darunter (Kontrast ≥ 4,5 : 1).' });
  let shaky = 0;
  for (const c of plan.clips) {
    const m = byId.get(c.mediaId);
    if (!m || m.kind !== 'video' || !m.shakes || c.srcOffset == null) continue;
    const a = c.srcOffset, z = a + (c.visEnd - c.visStart) * (c.rate || 1);
    if (m.shakes.some((x) => x.t >= a - 0.2 && x.t <= z && x.j > 0.6)) shaky++;
  }
  out.push({ key: 'video', ok: !shaky, label: shaky ? `${shaky} Videostelle${shaky === 1 ? '' : 'n'} wackelig` : 'Videos an ruhigen, starken Stellen', detail: shaky ? 'Im Material antippen und einen ruhigeren Ausschnitt wählen.' : 'Bewegungshöhepunkte, Lachen und Menschen zuerst; kein Wackeln, kein Start-Ruck.' });
  const lines = an.vocalLines || [], w0 = plan.win.start, bd = plan.beatDur || an.beatPeriod || 0.5;
  let inWord = 0;
  for (const c of plan.clips.slice(1)) {
    const abs = c.start + w0, lab = c.label;
    if (lab === 'drop' || lab === 'chorus' || lab === 'build' || c.flash || c.rush || c.burst) continue;
    if (lines.some(([a, e]) => abs > a + bd * 0.4 && abs < e - bd * 0.3)) inWord++;
  }
  out.push({ key: 'gesang', ok: inWord <= 1, label: inWord > 1 ? `${inWord} Schnitte mitten in Gesangszeilen` : lines.length ? 'Schnitte am Ende der Gesangszeilen' : 'Schnitte auf Takt und Phrase', detail: 'In ruhigen Teilen schneidet der Film nie mitten ins Wort.' });
  return out;
}
