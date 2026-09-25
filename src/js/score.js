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
  const focus = fw > 0 ? [fxs / fw, fys / fw] : [0.5, 0.45];
  const lapVar = Math.max(0, lq / Math.max(1, lc) - lm * lm);
  const meanL = sumL / n / 255;
  const sharpN = Math.max(0, Math.min(1, (Math.log10(lapVar + 1) - 1.2) / 1.6));
  const expoN = Math.max(0, 1 - Math.abs(meanL - 0.48) * 1.8 - (clip / n) * 2.5);
  const colorN = Math.max(0, Math.min(1, colorful / 85));
  let ar = 0, ag = 0, ab = 0;
  for (let i = 0; i < n; i++) { ar += data[i * 4]; ag += data[i * 4 + 1]; ab += data[i * 4 + 2]; }
  return { sharp: sharpN, expo: expoN, color: colorN, luma: meanL, focus, gray: g, w, h, avg: [Math.round(ar / n), Math.round(ag / n), Math.round(ab / n)] };
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

function combineScore(m) {
  return 0.42 * m.sharp + 0.3 * m.expo + 0.28 * m.color;
}

function scoreImage(src, sw, sh) {
  const m = imageMetrics(samplePixels(src, sw, sh));
  return { score: combineScore(m), sharp: m.sharp, expo: m.expo, color: m.color, avg: m.avg, luma: +m.luma.toFixed(3), focus: m.focus.map((v) => +v.toFixed(3)), hash: dHash(src, sw, sh), layout: layoutSig(m) };
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
    let motion = 0;
    if (src) {
      const g2 = imageMetrics(samplePixels(src, W, H)).gray;
      let s = 0;
      for (let i = 0; i < g2.length; i++) s += Math.abs(g2[i] - a.gray[i]);
      motion = s / g2.length / 255;
    }
    // Moderate Bewegung ist spannend, extremes Wackeln nicht
    const motionN = Math.max(0, Math.min(1, motion / 0.06)) * (motion > 0.2 ? 0.5 : 1);
    res.push({ t, score: 0.7 * combineScore(a) + 0.3 * motionN, motion, a });
  }
  res.sort((x, y) => y.score - x.score);
  if (res.length) layout = layoutSig(res[0].a);
  const top = res[0] && res[0].a;
  // Bewegung im Video (Durchschnitt): entscheidet, ob es eher in ruhige Songteile oder in den Drop passt
  const motion = res.length ? +(res.reduce((a, r) => a + r.motion, 0) / res.length).toFixed(4) : 0;
  return { motion, score: res.length ? res[0].score : 0.3, hash: hash || [0, 0], avg, luma: +luma.toFixed(3), focus: top ? top.focus.map((v, i) => +(0.5 * v + 0.5 * [0.5, 0.45][i]).toFixed(3)) : undefined, layout, highlights: res.map((r) => ({ t: r.t, score: r.score })) };
}

/** Markiert Beinahe-Duplikate (nur das beste Bild einer Serie bleibt aktiv). */
function markDuplicates(items) {
  const list = items.filter((m) => m.hash && !m.bad);
  for (const m of list) m.dupOf = null;
  const sorted = list.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
  const kept = [];
  for (const m of sorted) {
    const sameColor = (a, b) => !a.avg || !b.avg || Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) < 40;
    const twin = kept.find((k) => k.kind === m.kind && hamming(k.hash, m.hash) <= 6 && sameColor(k, m) && Math.abs((k.time || 0) - (m.time || 0)) < 10 * 60 * 1000);
    if (twin) m.dupOf = twin.id; else kept.push(m);
  }
}
