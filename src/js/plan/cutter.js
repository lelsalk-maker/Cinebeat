/* Planer · Feinschliff wie ein Cutter: Standzeit nach Bildinhalt, Höhepunkt- und Schlussbild */

/**
 * Arbeitet auf fertig zugeteilten Einstellungen, bevor Übergänge und Bewegung berechnet werden.
 * Verändert nie das Material und nie die Chronologie über 3 Minuten hinaus; Schnitte bleiben auf den Beats,
 * Schnitte auf der Eins eines Takts bleiben stehen. Eigene Entscheidungen (Motiv, „Gefällt mir nicht“) bleiben unberührt.
 * Liefert { retimed, hero } für die Erklärung der Regie.
 */
function cutterPolish(clips, ctx) {
  const { an, win, byId, beatDur, ovOf = () => null, moved = new Set(), us = false, taps = [], blocks = false } = ctx;
  const beats = Array.from(an.beats || []).map((b) => b - win.start);
  const bars = Array.from(an.barStart || []).map((b) => b - win.start);
  const onBar = (t) => bars.some((b) => Math.abs(b - t) < 0.04);
  // starke Zählzeiten: Eins und Drei eines Takts; Phrasenanfang: jede vierte Eins (dort bleibt ein Schnitt immer stehen)
  const half = bars.map((b, k) => b + ((bars[k + 1] != null ? bars[k + 1] : b + beatDur * 4) - b) / 2);
  const strong = (t) => onBar(t) || half.some((h) => Math.abs(h - t) < 0.04);
  const ph = an.phrasePhase || 0;
  const onPhrase = (t) => bars.some((b, k) => Math.abs(b - t) < 0.04 && (((k - ph) % 4) + 4) % 4 === 0);
  const special = (c) => c.split || c.grid || c.burst || c.rush || c.stack || c.strip || c.miniRew || c.pre || c.reveal || c.leader || c.flightAnim || c.loop || c.vid || c.gridMid || c.afterGrid || c.replay || c.replaySeg || c.repeatSeg;
  // eigenes Motiv bleibt; „Gefällt mir nicht“ würfelt nur die Bewegung neu und ändert keine Bildwahl
  // eigene Entscheidungen bleiben: eigenes Motiv und von dir verschobene Aufnahmen (samt ihrem Ziel)
  const own = (c) => { const o = ovOf(c); return !!(o && o.mediaId) || moved.has(c.mediaId); };
  const img = (c) => { const m = byId.get(c.mediaId); return m && m.kind === 'image' ? m : null; };
  const plain = (c) => c && !special(c) && !!img(c);
  let retimed = 0, hero = 0;

  // 1. Standzeit nach Bildinhalt: in einer Folge ruhiger Einstellungen eines Abschnitts verschiebt sich jede Grenze
  //    um höchstens einen Beat (in ruhigen Teilen zwei) – Totalen und starke Bilder bekommen Zeit, Details und schwächere werden knapper,
  //    nach einer schnellen Passage darf das erste Bild atmen. Die Gesamtlänge der Folge bleibt gleich.
  const scores = clips.filter(plain).map((c) => img(c).score || 0.5);
  const sLo = Math.min(...scores, 1), sHi = Math.max(...scores, 0);
  const weight = (c, first, prev) => {
    const m = img(c), size = shotSize(m);
    const q = sHi > sLo ? ((m.score || 0.5) - sLo) / (sHi - sLo) : 0.5;
    // Wir-Vorrang: eure Aufnahmen stehen länger
    return (size === 0 ? 1.45 : size === 2 ? 0.72 : 1) * (0.85 + 0.3 * q) * (first && prev && (prev.burst || prev.rush || prev.miniRew) ? 1.2 : 1) * (us && isUs(m) ? 1.6 : 1);
  };
  for (let i = 0; i < clips.length;) {
    if (!plain(clips[i])) { i++; continue; }
    let j = i;
    while (j + 1 < clips.length && plain(clips[j + 1]) && clips[j + 1].label === clips[i].label && !clips[j + 1].sectionChange && !clips[j + 1].sceneStart) j++;
    if (j > i) {
      const run = clips.slice(i, j + 1);
      const w = run.map((c, k) => weight(c, k === 0, clips[i - 1]));
      const W = w.reduce((a, b) => a + b, 0);
      const t0 = run[0].start, total = run[run.length - 1].end - t0;
      // ruhige Teile: bis zu zwei Beats, im Refrain/Drop einer (dort trägt der Rhythmus)
      const calm = isCalmLabel(run[0].label);
      const minD = (calm ? 2 : 1) * beatDur * 0.98;
      let acc = 0;
      for (let k = 0; k < run.length - 1; k++) {
        acc += w[k];
        const a = run[k], b = run[k + 1], cur = a.end;
        // Phrasenanfänge und mitgetippte Schnitte bleiben, wo sie sind
        if (onPhrase(cur) || taps.some((t) => Math.abs(t - cur) < 0.05)) continue;
        const fromBar = onBar(cur);
        const want = t0 + (total * acc) / W;
        let best = cur;
        for (const bt of beats) {
          if (Math.abs(bt - cur) > beatDur * (calm ? 2.02 : 1.02) || Math.abs(bt - cur) < 0.02) continue;
          // ein Schnitt auf der Eins wandert höchstens auf eine andere starke Zählzeit
          if (fromBar && !strong(bt)) continue;
          // keine Einstellung unter die ruhige Mindestlänge drücken (war sie schon kürzer, nicht weiter kürzen)
          if (bt - a.start < Math.min(minD, cur - a.start) - 1e-3 || b.end - bt < Math.min(minD, b.end - cur) - 1e-3) continue;
          if (Math.abs(bt - want) < Math.abs(best - want)) best = bt;
        }
        if (best !== cur && Math.abs(best - want) < Math.abs(cur - want) - beatDur * 0.1) { a.end = best; b.start = best; retimed++; }
      }
    }
    i = j + 1;
  }

  // 2. Höhepunkt- und Schlussbild: auf dem Einsatz eines Refrains/Drops und am Ende steht das stärkste Bild
  //    aus der unmittelbaren Nachbarschaft (höchstens zwei Plätze, höchstens 3 Minuten Aufnahmezeit Abstand)
  const keys = clips.map((c, k) => k).filter((k) => {
    const c = clips[k];
    return (c.sectionChange && (c.label === 'drop' || c.label === 'chorus')) || k === clips.length - 1 - (clips[clips.length - 1] && clips[clips.length - 1].loop ? 1 : 0);
  });
  const lastK = keys.length ? keys[keys.length - 1] : -1;
  for (const k of keys) {
    const c = clips[k];
    if (!plain(c) || own(c) || c.role === 'hook') continue;
    const m = img(c);
    // Wir-Vorrang: auf dem Drop Natur und Dinge (dort ist es schnell), als Schlussbild ihr
    const isEnd = k === lastK && !c.sectionChange;
    const val = (x) => (x.score || 0.5) + (us ? (isEnd ? 0.35 : -0.35) * (isUs(x) ? 1 : 0) : 0);
    let bestK = -1, bestS = val(m) + 0.08;
    for (let d = -2; d <= 2; d++) {
      const n = clips[k + d];
      if (!d || !plain(n) || own(n) || n.role === 'hook' || keys.includes(k + d)) continue;
      const nm = img(n);
      // nach Tageszeit: im selben Tagesblock; streng: höchstens 3 min Aufnahmezeit
      if (blocks ? dayBlock(nm) !== dayBlock(m) : Math.abs((nm.time || 0) - (m.time || 0)) > 3 * 60 * 1000) continue;
      if (val(nm) > bestS) { bestS = val(nm); bestK = k + d; }
    }
    if (bestK >= 0) { const o = clips[bestK]; [c.mediaId, o.mediaId] = [o.mediaId, c.mediaId]; hero++; }
  }
  return { retimed, hero };
}
