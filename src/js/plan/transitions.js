/* Planer · Wahl der Übergänge aus Songaufbau und Bildbeziehung */
/** Kino-Übergänge: meist harte Schnitte, gezielte Blenden an Abschnittsgrenzen. */
function chooseTransition(ctx, rng) {
  const { labelA, labelB, sectionChange, weight, peak, pace, beatDur, lenA, lenB, stopEnd } = ctx;
  let type = TR.CUT, beats = 0, punch = false;
  if (stopEnd) punch = true;
  else if (sectionChange) {
    if (labelB === 'drop') { if (labelA === 'break' || labelA === 'build') punch = true; else { type = TR.ZOOM; beats = 0.5; } }
    else if (labelB === 'chorus') { type = rng() < 0.6 ? TR.WHIP : TR.ZOOM; beats = 0.5; }
    else if (labelB === 'break') { type = rng() < 0.6 ? TR.DISSOLVE : TR.DIP; beats = 1.5; }
    else if (labelB === 'outro') { type = TR.DISSOLVE; beats = 1.5; }
    else { type = rng() < 0.5 ? TR.LEAK : TR.DISSOLVE; beats = 1; }
  } else if (weight >= 5) {
    if (peak) { type = rng() < 0.55 ? TR.WHIP : TR.PUSH; beats = 0.5; }
    else { type = rng() < 0.7 ? TR.DISSOLVE : TR.LUMA; beats = pace === 'ruhig' ? 1.5 : 1; }
  } else if (!peak && (pace === 'ruhig' || labelA === 'break' || labelA === 'intro')) {
    if (rng() < 0.4) { type = TR.DISSOLVE; beats = 1; }
  }
  let dur = beats * beatDur;
  if (type !== TR.CUT) {
    dur = Math.min(dur, 0.45 * lenA, 0.45 * lenB, 2.2);
    if (dur < 0.14) { type = TR.CUT; dur = 0; }
  }
  return { type, dur, punch };
}

/**
 * Verfeinert den Übergang anhand der beiden Bilder:
 * ähnlicher Aufbau → Match-Cut (harter Schnitt, die Bewegung läuft weiter) oder „Bild aus Bild“,
 * Sprung ins Helle → Lichtblende, Sprung ins Dunkle → Schwarzblende statt Blende.
 */
function refineTransition(tr, rel, ctx) {
  if (!rel || tr.punch) return tr;
  const { A, B, beatDur, s, peak, rng } = ctx;
  const lenA = A.end - A.start, lenB = B.end - B.start;
  const fit = (beats, max = 2.4) => Math.min(beats * beatDur, 0.45 * lenA, 0.45 * lenB, max);
  if (s.morph === 'on' && !peak) {
    // kreative Übergänge, bei denen ein Bild aus dem anderen entsteht (nicht in Drops: dort bleibt es knackig)
    const d = fit(rel.sim > 0.55 ? 2 : 1.5);
    if (d >= 0.3) {
      const type = rel.sim > 0.55 ? TR.MORPH : rel.aLuma > 0.5 && rel.colorD > 45 ? TR.DOUBLE : rng() < 0.5 ? TR.INK : TR.MORPH;
      return { type, dur: d, punch: false };
    }
  }
  if (s.match !== 'off' && rel.sim > 0.78 && (tr.type === TR.CUT || tr.type === TR.DISSOLVE)) {
    return { type: TR.CUT, dur: 0, punch: false, match: true };
  }
  // großer Größensprung (Totale ↔ Detail) im Drop: ein klarer Schnitt auf den Schlag statt Wischer – wirkt ruhiger und professioneller
  if (peak && rel.sizeA != null && Math.abs(rel.sizeA - rel.sizeB) === 2 && (tr.type === TR.WHIP || tr.type === TR.PUSH || tr.type === TR.ZOOM)) return { type: TR.CUT, dur: 0, punch: false };
  // aus dem Detail zurück in die Totale in ruhigen Teilen: weich öffnen
  if (!peak && rel.sizeA === 2 && rel.sizeB === 0 && tr.type === TR.CUT) { const d = fit(1); if (d >= 0.3) return { type: rel.dl > 0.22 ? TR.LUMA : TR.DISSOLVE, dur: d, punch: false }; }
  if (tr.type === TR.DISSOLVE) {
    if (rel.dl > 0.22) return { ...tr, type: TR.LUMA };
    if (rel.dl < -0.3) return { ...tr, type: TR.DIP };
  }
  return tr;
}
