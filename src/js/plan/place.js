/* ============================================================
 * Titel platzieren (Bildverständnis): an die ruhigste Stelle des sichtbaren Bilds, mit Kontrastprüfung
 * (helle oder dunkle Schrift, Abdunklung nur wo nötig) – und der Ortsname hinter den Bergen, wenn das Bild
 * eine klare Himmelslinie hat, die durch den unteren Teil der Schrift läuft.
 * ============================================================ */

/** Sichtbarer Ausschnitt einer Einstellung (Anteile des Bilds), aus der Mitte ihrer Kamerafahrt. */
function clipView(c, m, outAspect) {
  if (c.contain || !m || !m.w || !m.h) return [0, 0, 1, 1];
  const srcA = m.w / m.h;
  const mo = c.motion || { from: { s: 1, x: 0, y: 0 }, to: { s: 1, x: 0, y: 0 } };
  const s = Math.max(1, ((mo.from.s || 1) + (mo.to.s || 1)) / 2), x = ((mo.from.x || 0) + (mo.to.x || 0)) / 2, y = ((mo.from.y || 0) + (mo.to.y || 0)) / 2;
  let fw = srcA > outAspect ? outAspect / srcA : 1, fh = srcA > outAspect ? 1 : srcA / outAspect;
  fw /= s; fh /= s;
  const cx = 0.5 + (x * (1 - fw)) / 2, cy = 0.5 + (y * (1 - fh)) / 2;
  return [cx - fw / 2, cy - fh / 2, cx + fw / 2, cy + fh / 2];
}

/**
 * overlays: Einblendungen des Plans; clips: Einstellungen; ctx: { byId, outAspect, vertical, band, fx, sizeOf }.
 * Setzt o.place = { y (Mitte 0–1 im Bildbereich), ink: 'light'|'dark', scrim } und bei Ortsnamen ggf. o.behind = { mediaId }.
 * Liefert { placed, behind } für die Erklärung der Regie.
 */
function placeTitles(overlays, clips, ctx) {
  const { byId, outAspect, vertical, fx = [], titleSize = 0.1, band = [0, 1] } = ctx;
  let placed = 0, behind = 0;
  for (const o of overlays) {
    if (!['city', 'lower', 'chapter'].includes(o.type) || !o.text || o.place) continue;
    // im Kinoband stehen Bauchbinde und Kapitel unter dem Bild im Schwarz
    if (o.type !== 'city' && band[1] < 0.9) continue;
    const parts = clips.filter((c) => c.end > o.start && c.start < o.end && c.mediaId && !c.split && !c.grid && !c.stack && !c.rush && !c.flash && !c.burst && !c.strip)
      .map((c) => ({ c, m: byId.get(c.mediaId), w: Math.min(c.end, o.end) - Math.max(c.start, o.start) }))
      .filter((p) => p.m && p.m.calm && p.w > 0.05);
    if (!parts.length) continue;
    const dim = fx.filter((f) => f.type === 'dim' && f.start <= o.start + 0.2 && f.end >= o.start + 0.6).reduce((a, f) => Math.max(a, f.amp || 0), 0);
    // erlaubte Höhen: im Hochformat nicht in Instagrams Kopf- und Antwortzeile
    const bands = vertical ? [0.22, 0.3, 0.38, 0.46, 0.54, 0.62, 0.7] : [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const prefer = o.type === 'city' ? 0.5 : vertical ? 0.7 : 0.8;
    const h = o.type === 'city' ? Math.max(0.12, titleSize * 1.6) : 0.14;
    let best = null;
    for (const yc of bands) {
      let sc = 0, ws = 0, dark = 0, scrim = 0;
      for (const p of parts) {
        const st = bandStats(p.m, clipView(p.c, p.m, outAspect), yc, h, dim);
        if (!st) continue;
        sc += st.sc * p.w; ws += p.w; scrim = Math.max(scrim, st.scrim); if (st.ink === 'dark') dark += p.w;
      }
      if (!ws) continue;
      const v = sc / ws - Math.abs(yc - prefer) * 0.3;
      // dunkle Schrift nur, wenn sie über die ganze Lesezeit trägt
      const ink = dark / ws > 0.85 ? 'dark' : 'light';
      if (!best || v > best.v) best = { v, y: yc, ink, scrim: ink === 'dark' ? 0 : +scrim.toFixed(2) };
    }
    if (!best) continue;
    // nur umsetzen, wenn die neue Stelle spürbar besser ist als die gewohnte
    o.place = { y: best.y, ink: best.ink, scrim: best.scrim };
    placed++;
    if (o.type === 'city') {
      const bh = behindTitle(o, parts, outAspect, titleSize);
      if (bh) { o.place = { ...o.place, y: bh.y }; o.behind = { mediaId: bh.mediaId }; behind++; }
    }
  }
  return { placed, behind };
}

/**
 * Ortsname hinter den Bergen: die Einstellung, die den größten Teil der Lesezeit zeigt, braucht eine sichere
 * Himmelslinie (vision.js skyProfile). Gesucht wird die Höhe, bei der die Linie den unteren Teil der Buchstaben
 * verdeckt (15–45 %) und dabei sichtbar auf und ab geht (Gipfel, Dächer) – darüber muss ruhiger Himmel sein.
 */
function behindTitle(o, parts, outAspect, titleSize) {
  const main = parts.slice().sort((a, b) => b.w - a.w)[0];
  if (!main || main.w < (o.end - o.start) * 0.6 || main.m.kind !== 'image' || main.m.rot90) return null;
  const line = skyLine(main.m.skyline);
  if (!line) return null;
  // Himmelslinie im Ausgabebild über der Schriftbreite (12–88 %) – am Anfang und am Ende der Kamerafahrt
  const mo = main.c.motion || { from: { s: 1, x: 0, y: 0 }, to: { s: 1, x: 0, y: 0 } };
  const views = ['from', 'to'].map((k) => clipView({ ...main.c, motion: { from: mo[k], to: mo[k] } }, main.m, outAspect));
  const N = 48;
  // gerahmtes Bild (ganzes Querfoto in der Box): Bild- und Ausgabekoordinaten über die Boxgröße
  const srcA = main.m.w / main.m.h;
  const lines = (main.c.contain ? ['from', 'to'] : views).map((v) => {
    const ys = [];
    for (let k = 0; k < N; k++) {
      const xo = 0.12 + (0.76 * (k + 0.5)) / N;
      let xs, map;
      if (main.c.contain) {
        const sc = mo[v].s || 1, bw = Math.min(1, srcA / outAspect) * sc, bhF = Math.min(1, outAspect / srcA) * sc;
        xs = 0.5 + (xo - 0.5) / bw;
        map = (y) => 0.5 + (y - 0.5) * bhF;
      } else { xs = v[0] + xo * (v[2] - v[0]); map = (y) => (y - v[1]) / (v[3] - v[1]); }
      // neben dem gerahmten Bild ist kein Vordergrund
      if (xs < 0 || xs > 1) { ys.push(9); continue; }
      const idx = Math.max(0, Math.min(line.length - 1, Math.floor(xs * line.length)));
      ys.push(map(line[idx]));
    }
    return ys;
  });
  // Schrifthöhe im Bildbereich: Versalhöhe ≈ 0,7 der Schriftgröße, Grundlinie bei Mitte + 0,3
  const em = titleSize, top = (yc) => yc - 0.4 * em, base = (yc) => yc + 0.3 * em;
  const inImg = lines[0].filter((y) => y < 2), lo = Math.min(...inImg), hi = Math.max(...inImg);
  if (inImg.length < N * 0.6) return null;
  if (hi - lo < 0.25 * 0.7 * em) return null;
  let best = null;
  for (let yc = 0.2; yc <= 0.72; yc += 0.01) {
    const t0 = top(yc), t1 = base(yc);
    if (t0 < 0.12) continue;
    let ok = true, covSum = 0;
    for (const ys of lines) {
      // Anteil der Schriftfläche unter der Linie (Vordergrund); kein Buchstabe mehr als zu zwei Dritteln verdeckt
      let cov = 0, worst = 0;
      let hit = 0;
      for (const y of ys) { const c = Math.max(0, Math.min(1, (t1 - Math.max(t0, y)) / (t1 - t0))); cov += c; worst = Math.max(worst, c); if (c > 0.1) hit++; }
      cov /= ys.length;
      // die Linie muss sichtbar in die Schrift greifen (mindestens ein Siebtel der Breite)
      if (hit < ys.length / 7) ok = false;
      // über der Schrift Himmel: kein Teil der Linie über der Oberkante
      if (!ys.every((y) => y > t0 - 0.015) || cov < 0.05 || cov > 0.38 || worst > 0.65) ok = false;
      covSum += cov;
    }
    if (!ok) continue;
    const cov = covSum / lines.length;
    const score = 1 - Math.abs(cov - 0.2) * 2 - Math.abs(yc - 0.42) * 0.5;
    if (!best || score > best.score) best = { y: +yc.toFixed(2), score, cov };
  }
  return best ? { y: best.y, mediaId: main.m.id, cov: best.cov } : null;
}
