/* Planer · Wir-Vorrang: Aufnahmen von euch (Menschen im Bild) tragen die ruhigen Passagen, Natur, Häuser und Dinge
 * die schnellen. Die Geschichte bleibt chronologisch: getauscht wird nur innerhalb einer Szene, und beide Gruppen
 * behalten für sich ihre Reihenfolge. */

/**
 * Zeigt die Aufnahme euch? Nur, was ihr selbst als „Wir“ markiert (automatisch erkannt wird nichts mehr: Hautton-
 * und Flächen-Schätzungen lagen zu oft daneben). 1 = markiert, sonst 0.
 */
function usScore(m) {
  return m && m.us === true ? 1 : 0;
}
const isUs = (m) => usScore(m) >= 0.5;

/**
 * Tauscht innerhalb jeder Szene Wir-Aufnahmen auf ruhige Plätze (ruhiger Songteil, lange Einstellung) und die übrigen
 * auf die schnellen – nur mit nahen Nachbarn (höchstens 4 Plätze und 3 Minuten Aufnahmezeit, wie beim übrigen Feinschliff), damit die Geschichte
 * chronologisch bleibt. Nur schlichte Foto-Einstellungen; eigene Entscheidungen, das Startbild und Bilder, auf die
 * sich Rückspulen oder Wiederholungen beziehen, bleiben stehen. Liefert die Zahl der getauschten Plätze.
 */
function usPolish(clips, { byId, ovOf = () => null, moved = new Set() }) {
  const special = (c) => c.split || c.grid || c.burst || c.rush || c.stack || c.strip || c.miniRew || c.pre || c.reveal || c.leader || c.flightAnim || c.loop || c.vid || c.gridMid || c.afterGrid || c.replay || c.replaySeg || c.repeatSeg || c.echo;
  const own = (c) => { const o = ovOf(c); return !!(o && (o.mediaId || o.again)); };
  const img = (c) => { const m = byId.get(c.mediaId); return m && m.kind === 'image' ? m : null; };
  // Bilder, die an anderer Stelle noch einmal gezeigt werden (Rückspulen, Wiederholung, Echo), nicht bewegen
  const echoed = new Set();
  for (const c of clips) if (c.miniRew || c.replay || c.loop || c.echo || c.pre) echoed.add(c.mediaId);
  const plain = (c) => c && !special(c) && !own(c) && c.role !== 'hook' && !!img(c) && !echoed.has(c.mediaId) && !moved.has(c.mediaId);
  const calmness = (c) => (isCalmLabel(c.label) ? 1 : 0) + Math.min(1, (c.end - c.start) / 3) * 0.3;
  let swaps = 0;
  // Szenengrenzen: dort wird nie über die Grenze getauscht
  const scene = [];
  let sc = 0;
  for (const c of clips) { if (c.sceneStart) sc++; scene.push(sc); }
  // ruhige Plätze mit „fremder“ Aufnahme, ruhigste zuerst
  const order = clips.map((c, k) => k).filter((k) => plain(clips[k]) && isCalmLabel(clips[k].label) && !isUs(img(clips[k]))).sort((a, b) => calmness(clips[b]) - calmness(clips[a]));
  for (const k of order) {
    const a = clips[k];
    if (isUs(img(a))) continue;
    let best = -1, bd = Infinity;
    for (let d = 1; d <= 6; d++) {
      for (const j of [k - d, k + d]) {
        const b = clips[j];
        if (!plain(b) || scene[j] !== scene[k] || isCalmLabel(b.label) || !isUs(img(b))) continue;
        if (Math.abs((img(b).time || 0) - (img(a).time || 0)) > 3 * 60000 && dayBlock(img(b)) !== dayBlock(img(a))) continue;
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) break;
    }
    if (best < 0) continue;
    const b = clips[best];
    [a.mediaId, b.mediaId] = [b.mediaId, a.mediaId];
    swaps++;
  }
  return swaps;
}

/**
 * Wir-Bilder bekommen die langen Plätze: nach dem Feinschliff tauscht jedes Wir-Foto (kürzestes zuerst) mit dem längsten
 * fremden Foto seines Tagesblocks (der darf frei geordnet werden; streng nach Uhrzeit: höchstens 6 Plätze und 3 min,
 * gleiche Szene), wenn dieses mindestens einen halben Schlag länger steht. Eigene Entscheidungen bleiben. Liefert die Zahl der Tausche.
 */
function usLength(clips, { byId, ovOf = () => null, moved = new Set(), blocks = true, beatDur = 0.5, beats = null, taps = [] }) {
  const special = (c) => c.split || c.grid || c.burst || c.rush || c.stack || c.strip || c.miniRew || c.pre || c.reveal || c.leader || c.flightAnim || c.loop || c.vid || c.gridMid || c.afterGrid || c.replay || c.replaySeg || c.repeatSeg || c.echo || c.recap || c.chapter;
  const own = (c) => { const o = ovOf(c); return !!(o && (o.mediaId || o.again)); };
  const img = (c) => { const m = byId.get(c.mediaId); return m && m.kind === 'image' ? m : null; };
  const echoed = new Set();
  for (const c of clips) if (c.miniRew || c.replay || c.loop || c.echo || c.pre || c.flash) echoed.add(c.mediaId);
  const plain = (c) => c && !special(c) && !own(c) && c.role !== 'hook' && !!img(c) && !echoed.has(c.mediaId) && !moved.has(c.mediaId);
  const scene = [], chap = [];
  let sc = 0, ch = 0;
  for (const c of clips) { if (c.sceneStart) sc++; if (c.chapter) ch++; scene.push(sc); chap.push(ch); }
  const len = (c) => c.end - c.start;
  const near = (a, b) => (blocks ? dayBlock(a) === dayBlock(b) : Math.abs((a.time || 0) - (b.time || 0)) <= 3 * 60000);
  const wir = clips.map((c, k) => k).filter((k) => plain(clips[k]) && isUs(img(clips[k]))).sort((a, b) => len(clips[a]) - len(clips[b]));
  const done = new Set();
  let swaps = 0;
  for (const k of wir) {
    const a = clips[k];
    if (done.has(k)) continue;
    let best = -1, bl = len(a) + beatDur * 0.5;
    const R = blocks ? clips.length : 6;
    for (let d = -R; d <= R; d++) {
      const j = k + d, b = clips[j];
      if (!d || done.has(j) || !plain(b) || isUs(img(b)) || chap[j] !== chap[k] || (!blocks && scene[j] !== scene[k]) || !near(img(a), img(b))) continue;
      if (len(b) > bl) { bl = len(b); best = j; }
    }
    if (best < 0) continue;
    const b = clips[best];
    [a.mediaId, b.mediaId] = [b.mediaId, a.mediaId];
    done.add(best); done.add(k);
    swaps++;
  }
  // dazu mehr Standzeit: ein Wir-Foto übernimmt bis zu zwei Schläge vom fremden Nachbarn (der behält in Drop/Refrain
  // mindestens einen, in ruhigen Teilen zwei Schläge); Schnitte bleiben auf den Schlägen, Songteil-Wechsel und Tipps fest
  if (beats && beats.length) {
    const onB = (t) => beats.some((x) => Math.abs(x - t) < 0.02);
    const fixed = (t) => taps.some((x) => Math.abs(x - t) < 0.05) || clips.some((c) => c.sectionChange && Math.abs(c.start - t) < 0.05);
    const minOf = (c) => (isCalmLabel(c.label) ? 2 : 1) * beatDur;
    for (let k = 0; k < clips.length; k++) {
      const a = clips[k];
      if (!plain(a) || !isUs(img(a)) || len(a) >= beatDur * 8 - 0.02) continue;
      for (const j of [k + 1, k - 1]) {
        const n = clips[j];
        if (!plain(n) || isUs(img(n))) continue;
        const edge = j > k ? a.end : a.start;
        if (fixed(edge) || !onB(edge)) continue;
        const room = len(n) - minOf(n);
        const steps = Math.min(2, Math.floor((room + 0.02) / beatDur));
        if (steps < 1) continue;
        const t = j > k ? edge + steps * beatDur : edge - steps * beatDur;
        const tt = beats.reduce((x, y) => (Math.abs(y - t) < Math.abs(x - t) ? y : x), beats[0]);
        if (Math.abs(tt - t) > beatDur * 0.3) continue;
        if (j > k) { a.end = tt; n.start = tt; } else { a.start = tt; n.end = tt; }
        swaps++;
        break;
      }
    }
  }
  return swaps;
}
