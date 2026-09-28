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
    const score = planQuality(plan, opts.media);
    tried.push({ seed: seeds[k], score });
    // bei Gleichstand bleibt die bisherige Variante (die aktuelle zuerst)
    if (!best || score > best.score + 1e-6) { best = { plan, seed: seeds[k], score }; stale = 0; } else stale++;
    if (onProgress) onProgress(k + 1, seeds.length);
    await new Promise((r) => setTimeout(r, 0));
    // bringen drei Varianten nacheinander nichts mehr, ist die beste gefunden (spart Rechenzeit auf dem Handy)
    if (k >= 4 && stale >= 3) break;
  }
  return { ...best, tried };
}
