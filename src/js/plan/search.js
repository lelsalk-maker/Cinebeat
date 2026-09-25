/* Planer · Suche nach Schnittlänge und Verdichtungsstufe (buildPlan) */
/**
 * Hauptfunktion.
 * opts: {an, media, settings, overrides, chapters}
 * overrides: {clips: {[i]: {mediaId?, srcOffset?, trans?, speed?}}, texts: [], stickers: []}
 */
/**
 * Plan mit passender Schnittlänge: jede Aufnahme genau einmal – keine Wiederholungen, um Zeit zu füllen,
 * und nichts weglassen, solange es in die Höchstlänge passt. Sucht die Schnittlänge per Bisektion
 * (die Zahl der Einstellungen springt, weil z. B. Split-Screens mehrere Bilder zeigen) und verlängert
 * den Film bei Länge „Auto“ erst, wenn selbst die ruhige Mindestlänge nicht reicht.
 */
function buildPlan(opts) {
  let best = searchPlan(opts);
  if (opts.flight || (opts.chapters && opts.chapters.length)) return best;
  // Alle Aufnahmen: reicht es nicht, verdichtet die Regie stufenweise – dichtere Schnitte und mehr Split-Screens,
  // dann Foto-Serien in den Refrains/Drops und gemeinsam laufende Videos, zuletzt längere Foto-Serien
  if (best.resolved.allMedia === 'off') return best;
  // fehlt sehr viel, gleich auf einer höheren Stufe beginnen (spart Rechenzeit auf dem Handy)
  const nAll = best.capacity.images + best.capacity.videos;
  const start = best._m.dropped > nAll * 0.4 ? 3 : best._m.dropped > nAll * 0.2 ? 2 : 1;
  for (let lv = start; lv <= 4 && best._m.dropped; lv++) {
    const p = searchPlan({ ...opts, _level: lv });
    if (p._m.dropped < best._m.dropped || (p._m.dropped === best._m.dropped && p._m.repeats < best._m.repeats)) best = p;
  }
  return best;
}

function searchPlan(opts) {
  let best = planOnce(opts);
  if (opts.flight) return best;
  // „Beste Auswahl“: Weglassen ist gewollt – es zählt nur, dass sich nichts wiederholt (das Tempo bleibt beim Song)
  const pick = best.resolved.allMedia === 'off' && !(opts.chapters && opts.chapters.length);
  const bad = (p) => p._m.repeats * 3 + (pick ? 0 : p._m.dropped);
  const better = (p, q) => bad(p) < bad(q) || (bad(p) === bad(q) && !p._m.repeats && p._m.scale < q._m.scale);
  let cur = best;
  for (let ext = 0; ext < 3 && bad(best); ext++) {
    // Bisektion über die Schnittlänge bei dieser Filmlänge
    let lb = cur;
    const m0 = cur._m;
    let lo = m0.floor, hi = 5, cand = m0.scale;
    if (m0.repeats) lo = m0.scale; else hi = m0.scale;
    let pLo = cur._m.repeats ? cur : null, pHi = cur._m.repeats ? null : cur;
    for (let it = 0; it < 8 && bad(lb); it++) {
      cand = (lo + hi) / 2;
      const p = planOnce({ ...opts, settings: m0.settings, _scale: cand });
      if (better(p, lb)) lb = p;
      if (p._m.repeats) { lo = cand; pLo = p; } else { hi = cand; pHi = p; }
      if (hi - lo < 0.01) break;
    }
    // das Taktraster springt über die passende Zahl hinweg: einzelne Einstellungen teilen bzw. zusammenlegen
    const fine = (base, dir) => {
      for (let k = 1; k <= 6 && bad(lb); k++) {
        const p = planOnce({ ...opts, settings: m0.settings, _scale: base._m.scale, _adj: dir * k });
        if (better(p, lb)) lb = p;
        if (dir > 0 ? p._m.repeats : p._m.dropped) break;
      }
    };
    if (bad(lb) && pHi && pHi._m.dropped) fine(pHi, 1);
    if (bad(lb) && pLo) fine(pLo, -1);
    if (better(lb, best)) best = lb;
    // weiterhin Aufnahmen übrig, obwohl schon so dicht wie ruhig möglich: bei „Auto“ den Film verlängern
    const m = lb._m;
    if (!bad(best) || !m.dropped || m.repeats || opts.settings.length !== 'auto' || m.D >= m.max - 1) break;
    cur = planOnce({ ...opts, settings: { ...m.settings, _minT: m.D + Math.max(m.extraNeed, 1) }, _scale: m.scale });
    if (cur._m.D <= m.D + 0.05) break;
    if (better(cur, best)) best = cur;
  }
  return best;
}
