/* ============================================================
 * Bildbewertung: Schärfe, Belichtung, Farbigkeit, Duplikate,
 * spannendste Stelle in Videos
 * ============================================================ */

const SCORE_SIZE = 160;
let scoreCanvas = null;

function scoreCtx(w, h) {
  if (!scoreCanvas) scoreCanvas = document.createElement('canvas');
  scoreCanvas.width = w;
  scoreCanvas.height = h;
  return scoreCanvas.getContext('2d', { willReadFrequently: true });
}

/** Grauwerte + Farbe in kleiner Auflösung */
function samplePixels(src, sw, sh) {
  const s = SCORE_SIZE / Math.max(sw, sh);
  const w = Math.max(8, Math.round(sw * s)), h = Math.max(8, Math.round(sh * s));
  const ctx = scoreCtx(w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return { w, h, data: ctx.getImageData(0, 0, w, h).data };
}

function imageMetrics(px) {
  const { w, h, data } = px;
  const n = w * h;
  const g = new Float32Array(n);
  let sumL = 0, clip = 0, mrg = 0, myb = 0, qrg = 0, qyb = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], gg = data[i * 4 + 1], b = data[i * 4 + 2];
    const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    g[i] = l;
    sumL += l;
    if (l < 6 || l > 250) clip++;
    const rg = r - gg, yb = 0.5 * (r + gg) - b;
    mrg += rg; myb += yb; qrg += rg * rg; qyb += yb * yb;
  }
  mrg /= n; myb /= n;
  const srg = Math.sqrt(Math.max(0, qrg / n - mrg * mrg)), syb = Math.sqrt(Math.max(0, qyb / n - myb * myb));
  const colorful = Math.sqrt(srg * srg + syb * syb) + 0.3 * Math.sqrt(mrg * mrg + myb * myb);
  // Laplace-Varianz (Schärfe)
  let lm = 0, lq = 0, lc = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      lm += v; lq += v * v; lc++;
    }
  }
  lm /= Math.max(1, lc);
  // Bildschwerpunkt (einfache Saliency): Kanten + Farbabweichung, leicht zur Mitte gewichtet
  let fxs = 0, fys = 0, fw = 0;
  for (let y = 2; y < h - 2; y += 1) {
    for (let x = 2; x < w - 2; x += 1) {
      const i = y * w + x;
      const lap = Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]);
      const r = data[i * 4], gg = data[i * 4 + 1], b = data[i * 4 + 2];
      const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
      const cx = x / w - 0.5, cy = y / h - 0.45;
      const center = Math.exp(-(cx * cx + cy * cy) / 0.18);
      const wgt = (lap + 0.35 * sat) * (0.35 + center);
      fxs += wgt * (x / w); fys += wgt * (y / h); fw += wgt;
    }
  }
  let focus = fw > 0 ? [fxs / fw, fys / fw] : [0.5, 0.45];
  const scene = sceneMetrics(data, g, w, h, focus);
  // Menschen sind das Motiv: der Schwerpunkt rückt zur Haut-Region (Gesicht/Person)
  if (scene.people > 0.25) focus = [0.4 * focus[0] + 0.6 * scene.skin[0], 0.4 * focus[1] + 0.6 * scene.skin[1]];
  const lapVar = Math.max(0, lq / Math.max(1, lc) - lm * lm);
  const meanL = sumL / n / 255;
  const sharpN = Math.max(0, Math.min(1, (Math.log10(lapVar + 1) - 1.2) / 1.6));
  const expoN = Math.max(0, 1 - Math.abs(meanL - 0.48) * 1.8 - (clip / n) * 2.5);
  const colorN = Math.max(0, Math.min(1, colorful / 85));
  let ar = 0, ag = 0, ab = 0;
  for (let i = 0; i < n; i++) { ar += data[i * 4]; ag += data[i * 4 + 1]; ab += data[i * 4 + 2]; }
  return { sharp: sharpN, expo: expoN, color: colorN, luma: meanL, focus, scene, gray: g, w, h, avg: [Math.round(ar / n), Math.round(ag / n), Math.round(ab / n)] };
}

/** 64-Bit-Differenzhash (9x8) als zwei 32-Bit-Zahlen */
function dHash(src, sw, sh) {
  const ctx = scoreCtx(9, 8);
  ctx.drawImage(src, 0, 0, sw, sh, 0, 0, 9, 8);
  const d = ctx.getImageData(0, 0, 9, 8).data;
  let hi = 0, lo = 0, bit = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = (y * 9 + x) * 4, j = i + 4;
      const a = d[i] + d[i + 1] + d[i + 2], b = d[j] + d[j + 1] + d[j + 2];
      const v = a > b ? 1 : 0;
      if (bit < 32) hi = (hi << 1) | v; else lo = (lo << 1) | v;
      bit++;
    }
  }
  return [hi >>> 0, lo >>> 0];
}

function hamming(a, b) {
  let x = (a[0] ^ b[0]) >>> 0, y = (a[1] ^ b[1]) >>> 0, c = 0;
  while (x) { x &= x - 1; c++; }
  while (y) { y &= y - 1; c++; }
  return c;
}

/**
 * Bildinhalt ohne KI-Modell, lokal und schnell (auf 160 px):
 * Horizont (stärkste durchgehende waagerechte Kante), Himmelsanteil, Haut-Regionen (Menschen)
 * und der Motivbereich (gewichtete Ausdehnung der auffälligen Bildteile).
 */
function sceneMetrics(data, g, w, h, focus) {
  // Horizont: Zeile mit der stärksten, über die Breite gleichmäßigen Helligkeitskante
  const rowGrad = new Float32Array(h);
  for (let y = 2; y < h; y++) {
    let sgn = 0, sum = 0;
    for (let x = 0; x < w; x++) { const d = g[y * w + x] - g[(y - 2) * w + x]; sum += Math.abs(d); sgn += d; }
    rowGrad[y] = (sum / w) * (0.4 + 0.6 * Math.min(1, Math.abs(sgn) / Math.max(1, sum)));
  }
  let hy = -1, hv = 0;
  const sorted = Array.from(rowGrad).sort((a, b) => a - b), med = sorted[Math.floor(h / 2)] || 1;
  for (let y = Math.floor(h * 0.18); y < Math.floor(h * 0.82); y++) {
    const v = (rowGrad[y - 1] + rowGrad[y] * 2 + rowGrad[y + 1]) / 4;
    if (v > hv) { hv = v; hy = y; }
  }
  const horizon = hv > med * 2.2 && hv > 6 ? +(hy / h).toFixed(3) : null;
  // Himmel: helle, blaue oder sehr gleichmäßige Flächen im oberen Bilddrittel
  let sky = 0, skinN = 0, sx = 0, sy = 0;
  const top = Math.floor(h * 0.4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, r = data[i], gg = data[i + 1], b = data[i + 2];
      if (y < top && ((b > r + 12 && b > gg - 10 && b > 90) || (r > 205 && gg > 205 && b > 205))) sky++;
      // Haut (YCbCr-Bereich), unabhängig vom Hautton
      const cb = 128 - 0.1687 * r - 0.3313 * gg + 0.5 * b, cr = 128 + 0.5 * r - 0.4187 * gg - 0.0813 * b, yy = 0.299 * r + 0.587 * gg + 0.114 * b;
      if (yy > 45 && cb > 77 && cb < 127 && cr > 135 && cr < 175) { skinN++; sx += x; sy += y; }
    }
  }
  const skinFrac = skinN / (w * h);
  // Menschen: zusammenhängende Haut in mittlerem Umfang (nicht Sand, nicht Holz: dann ist sie meist großflächig)
  const people = skinFrac > 0.008 && skinFrac < 0.3 ? Math.min(1, skinFrac * 18) : 0;
  const skin = skinN ? [sx / skinN / w, sy / skinN / h] : focus;
  // Motivbereich: um den Schwerpunkt, so weit, dass die auffälligen Teile hineinpassen
  let vx = 0, vy = 0, wv = 0;
  for (let y = 2; y < h - 2; y += 2) {
    for (let x = 2; x < w - 2; x += 2) {
      const i = y * w + x;
      const lap = Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]);
      if (lap < 18) continue;
      const dx = x / w - focus[0], dy = y / h - focus[1];
      vx += lap * dx * dx; vy += lap * dy * dy; wv += lap;
    }
  }
  const sw = wv ? Math.min(0.9, Math.max(0.2, 2.4 * Math.sqrt(vx / wv))) : 0.5, sh = wv ? Math.min(0.9, Math.max(0.2, 2.4 * Math.sqrt(vy / wv))) : 0.5;
  // Freistellung: Detailreichtum im Motivbereich gegenüber dem Rest (hoch bei Nahaufnahmen mit unscharfem Hintergrund)
  let eIn = 0, nIn = 0, eOut = 0, nOut = 0;
  const bx0 = focus[0] - sw / 2, bx1 = focus[0] + sw / 2, by0 = focus[1] - sh / 2, by1 = focus[1] + sh / 2;
  for (let y = 2; y < h - 2; y += 2) {
    for (let x = 2; x < w - 2; x += 2) {
      const i = y * w + x;
      const lap = Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]);
      const u = x / w, v = y / h;
      if (u > bx0 && u < bx1 && v > by0 && v < by1) { eIn += lap; nIn++; } else { eOut += lap; nOut++; }
    }
  }
  const iso = nIn && nOut ? +Math.min(9, (eIn / nIn + 0.5) / (eOut / nOut + 0.5)).toFixed(2) : 1;
  return { horizon, sky: +(sky / (w * top)).toFixed(3), people: +people.toFixed(2), skin: skin.map((v) => +v.toFixed(3)), skinFrac: +skinFrac.toFixed(3), iso, subject: [+focus[0].toFixed(3), +focus[1].toFixed(3), +sw.toFixed(3), +sh.toFixed(3)] };
}

/**
 * Kameraschwenk zwischen zwei Graubildern (Block-Matching über die Bildmitte, ±5 px auf 160 px).
 * Liefert die Verschiebung des Inhalts als Anteil der Bildbreite/-höhe.
 */
function panShift(a, b, w, h) {
  let best = [0, 0], bs = Infinity;
  const R = 5, x0 = Math.floor(w * 0.2), x1 = Math.floor(w * 0.8), y0 = Math.floor(h * 0.2), y1 = Math.floor(h * 0.8);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      let sad = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) sad += Math.abs(a[y * w + x] - b[(y + dy) * w + x + dx]);
      if (sad < bs) { bs = sad; best = [dx, dy]; }
    }
  }
  return [best[0] / w, best[1] / h];
}

function combineScore(m) {
  return 0.42 * m.sharp + 0.3 * m.expo + 0.28 * m.color;
}

function scoreImage(src, sw, sh) {
  const m = imageMetrics(samplePixels(src, sw, sh));
  return { score: combineScore(m), sharp: m.sharp, expo: m.expo, color: m.color, avg: m.avg, luma: +m.luma.toFixed(3), focus: m.focus.map((v) => +v.toFixed(3)), hash: dHash(src, sw, sh), layout: layoutSig(m), ...sceneFields(m.scene) };
}

/** Motiv-Felder für die Aufnahme (werden mit gespeichert). */
function sceneFields(sc) {
  return sc ? { horizon: sc.horizon, sky: sc.sky, people: sc.people, subject: sc.subject, iso: sc.iso, skinFrac: sc.skinFrac } : {};
}

/**
 * Bildaufbau als 6 × 6 Helligkeitsraster (0–15, normiert) plus Kantenrichtung.
 * Grundlage für Match-Cuts: ähnlich aufgebaute Bilder schneiden unsichtbar ineinander.
 */
function layoutSig(m) {
  const { gray: g, w, h } = m;
  const N = 6, cells = new Float32Array(N * N), cnt = new Float32Array(N * N);
  let gx = 0, gy = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const k = Math.min(N - 1, Math.floor((y / h) * N)) * N + Math.min(N - 1, Math.floor((x / w) * N));
      cells[k] += g[i]; cnt[k]++;
      gx += Math.abs(g[i + 1] - g[i - 1]); gy += Math.abs(g[i + w] - g[i - w]);
    }
  }
  let lo = 255, hi = 0;
  for (let k = 0; k < cells.length; k++) { cells[k] /= Math.max(1, cnt[k]); lo = Math.min(lo, cells[k]); hi = Math.max(hi, cells[k]); }
  const span = Math.max(12, hi - lo);
  let str = '';
  for (let k = 0; k < cells.length; k++) str += Math.round(((cells[k] - lo) / span) * 15).toString(16);
  // Anteil waagrechter Strukturen (Horizont, Straßen) gegenüber senkrechten (Häuser, Bäume)
  const dir = gx + gy > 0 ? +(gy / (gx + gy)).toFixed(2) : 0.5;
  return { g: str, dir };
}

/** Ähnlichkeit zweier Bildaufbauten (0 … 1). */
function layoutSim(a, b) {
  if (!a || !b || !a.g || !b.g || a.g.length !== b.g.length) return 0;
  let d = 0;
  for (let i = 0; i < a.g.length; i++) d += Math.abs(parseInt(a.g[i], 16) - parseInt(b.g[i], 16));
  const grid = 1 - d / (a.g.length * 7.5);
  return Math.max(0, grid - Math.abs(a.dir - b.dir) * 0.8);
}

/**
 * Tastet ein Video an mehreren Stellen ab und bewertet Bildqualität und Bewegung.
 * Liefert {score, hash, highlights:[{t, score}]} (Zeit = Mitte der besten Stelle).
 */
async function scoreVideo(v, duration) {
  const grab = async (t) => { await seekVideo(v, t); return v.readyState >= 2 ? v : null; };
  return scoreFrames(grab, v.videoWidth, v.videoHeight, duration);
}

/** Bewertet ein Video über grab(t) → Bildquelle (Videoelement oder dekodiertes Bild). */
async function scoreFrames(grab, W, H, duration) {
  const K = Math.max(3, Math.min(8, Math.round(duration / 1.5)));
  const pts = [];
  for (let k = 0; k < K; k++) pts.push(Math.min(duration - 0.3, ((k + 0.5) / K) * duration));
  const res = [];
  let hash = null, avg = null, luma = 0.45, layout = null;
  for (const t of pts) {
    if (!(t >= 0)) continue;
    let src = await grab(t);
    if (!src) continue;
    const a = imageMetrics(samplePixels(src, W, H));
    if (!hash) { hash = dHash(src, W, H); avg = a.avg; luma = a.luma; }
    src = await grab(Math.min(duration - 0.05, t + 0.2));
    let motion = 0, pan = [0, 0];
    if (src) {
      const g2 = imageMetrics(samplePixels(src, W, H)).gray;
      let s = 0;
      for (let i = 0; i < g2.length; i++) s += Math.abs(g2[i] - a.gray[i]);
      motion = s / g2.length / 255;
      // Kameraschwenk (Inhalt wandert um pan je 0,2 s): Richtung für Anschlüsse an Fotos und Übergänge
      pan = panShift(a.gray, g2, a.w, a.h);
    }
    // Moderate Bewegung ist spannend, extremes Wackeln nicht
    const motionN = Math.max(0, Math.min(1, motion / 0.06)) * (motion > 0.2 ? 0.5 : 1);
    res.push({ t, score: 0.7 * combineScore(a) + 0.3 * motionN, motion, pan, a });
  }
  res.sort((x, y) => y.score - x.score);
  if (res.length) layout = layoutSig(res[0].a);
  const top = res[0] && res[0].a;
  // Bewegung im Video (Durchschnitt): entscheidet, ob es eher in ruhige Songteile oder in den Drop passt
  const motion = res.length ? +(res.reduce((a, r) => a + r.motion, 0) / res.length).toFixed(4) : 0;
  // Schwenk über die Zeit (in Aufnahme-Reihenfolge): Inhalt bewegt sich je Sekunde um diesen Bildanteil
  const byT = res.slice().sort((x, y) => x.t - y.t);
  const pans = byT.map((r) => ({ t: r.t, x: +(r.pan[0] * 5).toFixed(3), y: +(r.pan[1] * 5).toFixed(3) }));
  return { pans, ...sceneFields(top && top.scene), motion, score: res.length ? res[0].score : 0.3, hash: hash || [0, 0], avg, luma: +luma.toFixed(3), focus: top ? top.focus.map((v, i) => +(0.5 * v + 0.5 * [0.5, 0.45][i]).toFixed(3)) : undefined, layout, highlights: res.map((r) => ({ t: r.t, score: r.score })) };
}

/** Markiert Beinahe-Duplikate (nur das beste Bild einer Serie bleibt aktiv). */
function markDuplicates(items) {
  const list = items.filter((m) => m.hash && !m.bad);
  for (const m of list) { m.dupOf = null; m.dupD = m.dupDt = undefined; }
  const sorted = list.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
  const kept = [];
  for (const m of sorted) {
    const sameColor = (a, b) => !a.avg || !b.avg || Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) < 40;
    const twin = kept.find((k) => k.kind === m.kind && hamming(k.hash, m.hash) <= 6 && sameColor(k, m) && Math.abs((k.time || 0) - (m.time || 0)) < 10 * 60 * 1000);
    if (twin) { m.dupOf = twin.id; m.dupD = hamming(twin.hash, m.hash); m.dupDt = Math.abs((twin.time || 0) - (m.time || 0)); } else kept.push(m);
  }
}
