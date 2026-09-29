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
function usPolish(clips, { byId, ov = {}, moved = new Set() }) {
  const special = (c) => c.split || c.grid || c.burst || c.rush || c.stack || c.strip || c.miniRew || c.pre || c.reveal || c.leader || c.flightAnim || c.loop || c.vid || c.gridMid || c.afterGrid || c.replay || c.replaySeg || c.repeatSeg || c.echo;
  const own = (c) => { const o = ov[c.i]; return !!(o && (o.mediaId || o.again)); };
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
