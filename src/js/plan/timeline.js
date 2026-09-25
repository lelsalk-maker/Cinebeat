/* Planer · Welche Einstellungen zu einem Zeitpunkt sichtbar sind */
function clipIndexAt(clips, t) {
  let lo = 0, hi = clips.length - 1;
  if (hi < 0) return -1;
  if (t < clips[0].start) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (clips[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** Sichtbare Ebenen bei t: {a, b, p, type} */
function layersAt(clips, t) {
  const i = clipIndexAt(clips, t);
  if (i < 0) return null;
  let c = clips[i];
  if (c.loop && i > 0) c = clips[i - 1];
  const idx = clips.indexOf(c);
  const next = clips[idx + 1], prev = clips[idx - 1];
  if (next && next.loop && c.tout && c.tout.dur > 0 && t >= c.end - c.tout.dur) {
    return { a: c, b: next, p: (t - (c.end - c.tout.dur)) / c.tout.dur, type: c.tout.type, dirSign: c.tout.dirSign || 1 };
  }
  if (next && !next.loop && c.tout && c.tout.dur > 0 && t >= c.end - c.tout.dur / 2) {
    return { a: c, b: next, p: (t - (c.end - c.tout.dur / 2)) / c.tout.dur, type: c.tout.type, dirSign: c.tout.dirSign || 1 };
  }
  if (prev && c.tin && c.tin.dur > 0 && t < c.start + c.tin.dur / 2) {
    return { a: prev, b: c, p: (t - (c.start - c.tin.dur / 2)) / c.tin.dur, type: c.tin.type, dirSign: c.tin.dirSign || 1 };
  }
  return { a: c, b: null, p: 0, type: TR.CUT };
}
