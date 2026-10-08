/* ============================================================
 * Bildverständnis – lokal, ohne Netz und ohne Modelldatei:
 * Motiv-Fingerabdruck (Ähnlichkeit), ruhige Zonen und Helligkeit (Titel),
 * Bildstimmung, Bildaufbau, Horizont-Neigung, Himmelslinie (Ortsname hinter Bergen).
 * Läuft im Einlese-Thread zusammen mit score.js. Ein späteres KI-Modell liefert dieselben Felder.
 * ============================================================ */

/** Stand der Bildanalyse: Aufnahmen mit älterem Stand werden im Hintergrund nachanalysiert. */
const VIS_VER = 3;

const vHex2 = (v) => { const x = Math.max(0, Math.min(255, Math.round(v))); return (x < 16 ? '0' : '') + x.toString(16); };
const vUnhex = (s) => { const o = new Uint8Array(s.length >> 1); for (let i = 0; i < o.length; i++) o[i] = parseInt(s.substr(i * 2, 2), 16); return o; };
const vHex1 = (v) => Math.max(0, Math.min(15, Math.round(v))).toString(16);

/**
 * Merkmale auf dem kleinen Bewertungsbild (data RGBA, g = Helligkeit 0–255, w × h).
 * focus = Bildschwerpunkt, scene = sceneMetrics (Horizont, Himmel, Haut, Motiv).
 */
function visionMetrics(data, g, w, h, focus, scene) {
  const n = w * h;
  // --- Motiv-Fingerabdruck ---
  // 1. Farbverteilung: 12 Farbtöne (nach Sättigung gewichtet) + 3 Graustufen für blasse Pixel
  const hist = new Float32Array(15);
  // 2. Bildaufbau: 4 × 4 Felder mit mittlerer Helligkeit und Gegenfarben (rot–grün, gelb–blau)
  const G = 4, cell = new Float32Array(G * G * 3), cc = new Float32Array(G * G);
  // 3. Struktur: Kantenrichtungen (6) in drei Bildhöhen, gewichtet nach Kantenstärke
  const ori = new Float32Array(18);
  let warm = 0, satS = 0;
  const lumH = new Uint32Array(32);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, r = data[i * 4], gg = data[i * 4 + 1], b = data[i * 4 + 2];
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx > 0 ? (mx - mn) / mx : 0, v = mx / 255;
      if (sat > 0.14 && v > 0.12) {
        let hu = 0;
        const d = mx - mn;
        if (mx === r) hu = ((gg - b) / d) % 6; else if (mx === gg) hu = (b - r) / d + 2; else hu = (r - gg) / d + 4;
        hu = (hu + 6) % 6;
        hist[Math.min(11, Math.floor(hu * 2))] += sat;
      } else hist[12 + Math.min(2, Math.floor((g[i] / 256) * 3))] += 0.5;
      const k = Math.min(G - 1, Math.floor((y / h) * G)) * G + Math.min(G - 1, Math.floor((x / w) * G));
      cell[k * 3] += g[i] / 255; cell[k * 3 + 1] += (r - gg) / 255; cell[k * 3 + 2] += ((r + gg) / 2 - b) / 255; cc[k]++;
      warm += (r - b) / 255; satS += sat;
      lumH[Math.min(31, g[i] >> 3)]++;
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        const gx = g[i + 1] - g[i - 1], gy = g[i + w] - g[i - w], mag = Math.abs(gx) + Math.abs(gy);
        if (mag > 24) {
          const a = Math.atan2(gy, gx);
          const bin = Math.floor((((a + Math.PI) % Math.PI) / Math.PI) * 6) % 6;
          ori[Math.min(2, Math.floor((y / h) * 3)) * 6 + bin] += mag;
        }
      }
    }
  }
  let hs = 0; for (const v of hist) hs += v;
  let os = 0; for (const v of ori) os += v;
  let sig = '';
  for (const v of hist) sig += vHex2((v / Math.max(1e-6, hs)) * 255);
  for (let k = 0; k < G * G; k++) {
    const c = Math.max(1, cc[k]);
    sig += vHex2((cell[k * 3] / c) * 255) + vHex2((cell[k * 3 + 1] / c + 0.5) * 255) + vHex2((cell[k * 3 + 2] / c + 0.5) * 255);
  }
  for (const v of ori) sig += vHex2((v / Math.max(1e-6, os)) * 255 * 3);
  // Kantendichte als Ganzes (Wald, Stadt ≠ Himmel, Meer)
  sig += vHex2(Math.min(1, os / n / 40) * 255);

  // --- ruhige Zonen: 8 × 8 Felder mit Detail (Laplace) und Helligkeit ---
  // (auf leicht weichgezeichnetem Bild: Sensorrauschen zählt nicht als Unruhe, Strukturen schon)
  const gs = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    gs[i] = (g[i - w - 1] + g[i - w] + g[i - w + 1] + g[i - 1] + g[i] + g[i + 1] + g[i + w - 1] + g[i + w] + g[i + w + 1]) / 9;
  }
  const C = 8, det = new Float32Array(C * C), lum = new Float32Array(C * C), cnt = new Float32Array(C * C);
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x, k = Math.min(C - 1, Math.floor((y / h) * C)) * C + Math.min(C - 1, Math.floor((x / w) * C));
      det[k] += Math.abs(4 * gs[i] - gs[i - 1] - gs[i + 1] - gs[i - w] - gs[i + w]) * 2.5;
      lum[k] += g[i]; cnt[k]++;
    }
  }
  let calmD = '', calmL = '', detSum = 0;
  for (let k = 0; k < C * C; k++) {
    const d = det[k] / Math.max(1, cnt[k]);
    detSum += d;
    // 0 = spiegelglatt (Himmel, Wasser, Wand), 15 = sehr unruhig (Laub, Menge, Schrift)
    calmD += vHex1(Math.sqrt(Math.min(1, d / 40)) * 15);
    calmL += vHex1((lum[k] / Math.max(1, cnt[k]) / 255) * 15);
  }
  const detail = Math.min(1, detSum / (C * C) / 22);

  // --- Bildstimmung: Valenz (hell, warm, farbig = froh) und Erregung (Kontrast, Farbe, Details = lebhaft) ---
  const pct = (p) => { let acc = 0; const lim = n * p; for (let k = 0; k < 32; k++) { acc += lumH[k]; if (acc >= lim) return (k + 0.5) / 32; } return 1; };
  const contrast = Math.max(0, Math.min(1, (pct(0.95) - pct(0.05)) / 0.8));
  let ml = 0; for (let i = 0; i < n; i++) ml += g[i];
  const bright = ml / n / 255, warmth = Math.max(0, Math.min(1, warm / n * 2.2 + 0.5)), sat = Math.min(1, satS / n * 2);
  const valence = Math.max(0, Math.min(1, 0.4 * warmth + 0.35 * Math.min(1, bright * 1.6) + 0.25 * sat));
  const arousal = Math.max(0, Math.min(1, 0.4 * contrast + 0.35 * sat + 0.25 * detail));

  // --- Bildaufbau (0–1): Motiv auf Drittel oder Mitte, Horizont auf Drittel und gerade, Freistellung,
  //     Tonwertumfang, Ordnung statt Durcheinander ---
  const fx = focus[0], fy = focus[1];
  const third = Math.min(Math.abs(fx - 1 / 3), Math.abs(fx - 2 / 3), Math.abs(fx - 0.5) * 1.4) + Math.min(Math.abs(fy - 1 / 3), Math.abs(fy - 2 / 3), Math.abs(fy - 0.5) * 1.4);
  let comp = 0.5 + 0.25 * (1 - Math.min(1, third / 0.3));
  let tilt = horizonTilt(g, w, h, scene && scene.horizon);
  // gerade richten nur bei einem Wasserhorizont (Meer, See): unter der Linie kühles, ruhiges Wasser. Ein schräger
  // Hang, eine Düne oder ein Dach ist gewollt schräg und bleibt, wie es ist.
  if (tilt.conf > 0 && scene && scene.horizon != null) {
    const y0 = Math.min(h - 1, Math.floor((scene.horizon + 0.04) * h)), y1 = Math.min(h, Math.floor((scene.horizon + 0.16) * h));
    let rs = 0, bs = 0, cnt = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; rs += data[i]; bs += data[i + 2]; cnt++; }
    if (!cnt || bs / cnt < rs / cnt + 6) tilt = { deg: 0, conf: 0 };
  }
  if (scene && scene.horizon != null) {
    const hz = scene.horizon;
    comp += 0.12 * (1 - Math.min(1, Math.min(Math.abs(hz - 1 / 3), Math.abs(hz - 2 / 3)) / 0.12)) - (Math.abs(hz - 0.5) < 0.05 ? 0.06 : 0);
    if (tilt.conf > 0.5) comp -= Math.min(0.2, Math.abs(tilt.deg) * 0.05);
  }
  if (scene && scene.iso != null) comp += Math.max(-0.05, Math.min(0.15, (scene.iso - 1.3) * 0.1));
  comp += 0.12 * (contrast - 0.5);
  // Durcheinander: überall viel Detail ohne ruhige Fläche
  let calmCells = 0; for (let k = 0; k < C * C; k++) if (det[k] / Math.max(1, cnt[k]) < 9) calmCells++;
  if (calmCells < 4 && detail > 0.6) comp -= 0.12;
  comp = Math.max(0, Math.min(1, comp));

  return { sig, calm: { d: calmD, l: calmL }, mood: [+valence.toFixed(2), +arousal.toFixed(2)], comp: +comp.toFixed(3), tilt: tilt.conf > 0.7 && Math.abs(tilt.deg) >= 0.8 && Math.abs(tilt.deg) <= 5 ? +tilt.deg.toFixed(2) : 0, detail: +detail.toFixed(2) };
}

/**
 * Neigung des Horizonts in Grad (positiv = rechts tiefer). In 12 Spalten die stärkste waagerechte Kante nahe dem
 * erkannten Horizont suchen, Gerade robust anpassen; conf = wie gut die Punkte auf einer Geraden liegen.
 */
function horizonTilt(g, w, h, horizon) {
  if (horizon == null) return { deg: 0, conf: 0 };
  const S = 12, pts = [];
  const y0 = Math.max(2, Math.floor((horizon - 0.18) * h)), y1 = Math.min(h - 2, Math.ceil((horizon + 0.18) * h));
  for (let s = 0; s < S; s++) {
    const xa = Math.floor((s / S) * w) + 1, xb = Math.floor(((s + 1) / S) * w) - 1;
    let by = -1, bv = 0;
    for (let y = y0; y < y1; y++) {
      let v = 0;
      for (let x = xa; x < xb; x++) v += Math.abs(g[(y + 1) * w + x] - g[(y - 1) * w + x]);
      v /= Math.max(1, xb - xa);
      if (v > bv) { bv = v; by = y; }
    }
    if (by >= 0 && bv > 10) pts.push([((xa + xb) / 2) / w, by / h, bv]);
  }
  if (pts.length < 7) return { deg: 0, conf: 0 };
  // Theil-Sen: Median aller Steigungen (unempfindlich gegen Boote, Bäume, Menschen am Horizont)
  const sl = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (pts[j][0] - pts[i][0] > 0.15) sl.push((pts[j][1] - pts[i][1]) / (pts[j][0] - pts[i][0]));
  if (sl.length < 6) return { deg: 0, conf: 0 };
  sl.sort((a, b) => a - b);
  const m = sl[sl.length >> 1];
  const ys = pts.map((p) => p[1] - m * p[0]).sort((a, b) => a - b), c0 = ys[ys.length >> 1];
  const inl = pts.filter((p) => Math.abs(p[1] - (m * p[0] + c0)) < 1.6 / h).length;
  const deg = (Math.atan2(m * h, w) * 180) / Math.PI;
  // echter Horizont (Meer, Ebene): über die ganze Breite gleich kräftige Kante – ein schräger Hang oder Grat
  // wechselt seine Stärke und zählt nicht
  const str = pts.map((p) => p[2]).sort((a, b) => a - b);
  const even = str[Math.floor(str.length * 0.2)] / Math.max(1, str[Math.floor(str.length * 0.8)]);
  return { deg, conf: (inl / pts.length) * (even > 0.55 ? 1 : 0.5) };
}

/**
 * Himmelslinie: für jede Spalte, bis wohin von oben Himmel reicht (0–1 der Bildhöhe), auf ~240 Spalten.
 * Himmel = von oben zusammenhängend, glatt und im Farbbereich des oberen Rands (Blau, Grau, Weiß, Abendrot).
 * Nur wenn die Linie eindeutig ist (klare Kante, darunter deutlich anderes Bild) – sonst null.
 * Grundlage für „Ortsname hinter den Bergen“: was unter der Linie liegt, wird über den Titel gelegt.
 */
function skyProfile(src, sw, sh) {
  const W = Math.min(240, Math.round(sw)), H = Math.max(8, Math.round((sh / sw) * W));
  if (H < 40 || W < 60) return null;
  const ctx = scoreCtx(W, H);
  ctx.drawImage(src, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const L = new Float32Array(W * H), A = new Float32Array(W * H), B = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    L[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b; A[i] = r - g; B[i] = (r + g) / 2 - b;
  }
  // Himmelsfarbe aus dem oberen Rand (oberste 6 %): Mittelwert und Streuung
  const top = Math.max(2, Math.round(H * 0.06));
  let sL = 0, sA = 0, sB = 0, qL = 0, nT = 0, rough = 0;
  for (let y = 0; y < top; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; sL += L[i]; sA += A[i]; sB += B[i]; qL += L[i] * L[i]; nT++;
    rough += Math.abs(L[i + 1] - L[i - 1]);
  }
  const mL = sL / nT, mA = sA / nT, mB = sB / nT, vL = Math.sqrt(Math.max(0, qL / nT - mL * mL));
  // Himmel ist hell genug, eher kühl oder neutral (Abendrot erlaubt), oben glatt
  if (mL < 70 || rough / nT > 9 || vL > 38) return null;
  // je Spalte von oben nach unten: Himmel geht weiter, solange sich die Farbe nur allmählich ändert (Verläufe,
  // Abendrot) und die Fläche glatt bleibt; die Linie ist der erste Sprung – an ihr muss eine echte Kante liegen
  const prof = new Float32Array(W), edge = new Uint8Array(W);
  const cd = (i, j) => Math.abs(L[i] - L[j]) + 1.2 * Math.abs(A[i] - A[j]) + 1.2 * Math.abs(B[i] - B[j]);
  for (let x = 0; x < W; x++) {
    let y = 1, miss = 0, stop = H;
    let rL = L[x], rA = A[x], rB = B[x];
    for (; y < H; y++) {
      const i = y * W + x;
      const gx = x > 0 && x < W - 1 ? Math.abs(L[i + 1] - L[i - 1]) : 0;
      const step = Math.abs(L[i] - rL) + 1.2 * Math.abs(A[i] - rA) + 1.2 * Math.abs(B[i] - rB);
      if (step < 16 && gx < 14) { miss = 0; rL = rL * 0.6 + L[i] * 0.4; rA = rA * 0.6 + A[i] * 0.4; rB = rB * 0.6 + B[i] * 0.4; }
      else if (++miss >= 2) { stop = y - 1; break; }
    }
    prof[x] = Math.min(H, stop) / H;
    // echte Kante: drei Pixel darüber und darunter deutlich verschieden
    const yy = Math.min(H - 4, Math.max(3, stop));
    edge[x] = stop < H && cd((yy - 3) * W + x, (yy + 2) * W + x) > 28 ? 1 : 0;
  }
  let edges = 0; for (let x = 0; x < W; x++) edges += edge[x];
  if (edges < W * 0.85) return null;
  // glätten (Median über 5 Spalten) gegen einzelne Ausreißer (Vögel, Leitungen)
  const sm = new Float32Array(W);
  for (let x = 0; x < W; x++) { const win = []; for (let k = -2; k <= 2; k++) win.push(prof[Math.max(0, Math.min(W - 1, x + k))]); win.sort((a, b) => a - b); sm[x] = win[2]; }
  // Eindeutigkeit: unter der Linie deutlich anderes Bild (dunkler/strukturierter), Linie nicht am Bildrand,
  // Himmel nimmt einen guten Teil ein
  let below = 0, nb = 0, mean = 0, mn = 1, mx = 0;
  for (let x = 0; x < W; x++) {
    mean += sm[x]; mn = Math.min(mn, sm[x]); mx = Math.max(mx, sm[x]);
    const y = Math.min(H - 1, Math.round(sm[x] * H) + 3);
    if (y < H) { const i = y * W + x; below += Math.abs(L[i] - mL) + Math.abs(A[i] - mA) * 0.8 + Math.abs(B[i] - mB) * 0.8; nb++; }
  }
  mean /= W;
  const contrast = below / Math.max(1, nb);
  if (mean < 0.15 || mean > 0.8 || mx > 0.97 || contrast < 20) return null;
  // Spalten, die bis ganz unten Himmel wären, sind unsicher (Lücke im Motiv): dann lieber keine Linie
  let full = 0; for (let x = 0; x < W; x++) if (sm[x] > 0.95) full++;
  if (full > W * 0.05) return null;
  let s = '';
  for (let x = 0; x < W; x++) s += vHex2(sm[x] * 255);
  return { p: s, top: +mn.toFixed(3), mean: +mean.toFixed(3), bottom: +mx.toFixed(3), rise: +(mx - mn).toFixed(3) };
}

/** Himmelslinie als Zahlen 0–1 (Spalten von links). */
function skyLine(sky) { if (!sky || !sky.p) return null; const u = vUnhex(sky.p); return Array.from(u, (v) => v / 255); }

/**
 * Ähnlichkeit zweier Aufnahmen (0 … 1) aus dem Motiv-Fingerabdruck: Farbverteilung, Bildaufbau mit Farben
 * und Struktur. Zwei Strände, zweimal derselbe Platz, zwei Fotos derselben Serie liegen hoch.
 * Ohne Fingerabdruck (ältere Aufnahmen): aus Differenzhash und Durchschnittsfarbe geschätzt.
 */
function motifSim(a, b) {
  if (!a || !b) return 0;
  if (a.id && a.id === b.id) return 1;
  if (a.sig && b.sig && a.sig.length === b.sig.length) {
    const key = a.sig < b.sig ? a.sig + b.sig : b.sig + a.sig;
    const hit = motifSim.cache.get(key);
    if (hit != null) return hit.v;
    const p = vUnhex(a.sig), q = vUnhex(b.sig);
    // Farbverteilung (Schnittmenge)
    let inter = 0, sa = 0, sb = 0;
    for (let i = 0; i < 15; i++) { inter += Math.min(p[i], q[i]); sa += p[i]; sb += q[i]; }
    const simH = inter / Math.max(1, Math.min(sa, sb));
    // Aufbau: Helligkeit und Gegenfarben je Feld und je Bildzeile (Zeilen: unempfindlich gegen seitliches Verschieben,
    // entscheidend bei Landschaften – Himmel/Meer/Sand); Helligkeit relativ zum Bildmittel (Belichtung egal)
    let mLp = 0, mLq = 0;
    for (let k = 0; k < 16; k++) { mLp += p[15 + k * 3]; mLq += q[15 + k * 3]; }
    const off = (mLp - mLq) / 16 * 0.8;
    let dC = 0;
    const rowP = new Float32Array(12), rowQ = new Float32Array(12);
    for (let k = 0; k < 16; k++) {
      const o = 15 + k * 3, r = (k >> 2) * 3;
      dC += Math.abs(p[o] - q[o] - off) + 1.4 * Math.abs(p[o + 1] - q[o + 1]) + 1.4 * Math.abs(p[o + 2] - q[o + 2]);
      for (let c = 0; c < 3; c++) { rowP[r + c] += p[o + c] / 4; rowQ[r + c] += q[o + c] / 4; }
    }
    let dR = 0;
    for (let r = 0; r < 4; r++) dR += Math.abs(rowP[r * 3] - rowQ[r * 3] - off) + 1.4 * Math.abs(rowP[r * 3 + 1] - rowQ[r * 3 + 1]) + 1.4 * Math.abs(rowP[r * 3 + 2] - rowQ[r * 3 + 2]);
    const simS = 0.6 * Math.max(0, 1 - dR / 4 / 170) + 0.4 * Math.max(0, 1 - dC / 16 / 210);
    // Struktur: Kantenrichtungen in drei Höhen und Kantendichte
    let dT = 0;
    for (let i = 63; i < 81; i++) dT += Math.abs(p[i] - q[i]);
    const simT = Math.max(0, 1 - dT / 18 / 60) * (1 - Math.min(0.5, Math.abs(p[81] - q[81]) / 255));
    const v = +(0.36 * simH + 0.4 * simS + 0.24 * simT).toFixed(3);
    if (motifSim.cache.size > 20000) motifSim.cache.clear();
    motifSim.cache.set(key, { v, h: simH });
    return v;
  }
  if (a.hash && b.hash && a.avg && b.avg) {
    const cd = Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]);
    return Math.max(0, Math.min(1, 1 - hamming(a.hash, b.hash) / 40 - cd / 220));
  }
  return 0;
}
motifSim.cache = new Map();

/** Gleiches Motiv (gleicher Strand, gleicher Platz, gleiche Serie): nie direkt hintereinander. */
const SAME_MOTIF = 0.56;
const sameMotif = (a, b) => {
  if (!a || !b) return false;
  if (a.id === b.id || a.dupOf === b.id || b.dupOf === a.id) return true;
  // gleicher Aufbau in ganz anderen Farben ist kein gleiches Motiv, sondern ein Match-Cut-Kandidat: die Farbverteilung
  // muss ebenfalls passen
  if (a.sig && b.sig) { const v = motifSim(a, b), c = motifSim.cache.get(a.sig < b.sig ? a.sig + b.sig : b.sig + a.sig); return v >= SAME_MOTIF && (!c || c.h >= 0.55); }
  // ältere Aufnahmen ohne Fingerabdruck: Differenzhash und Durchschnittsfarbe
  return !!(a.hash && b.hash && a.avg && b.avg && hamming(a.hash, b.hash) < 12 && Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) < 30);
};

/**
 * Wie gut trägt ein waagerechtes Band (Mitte yc, Höhe h, 80 % breit) im sichtbaren Ausschnitt view = [x0, y0, x1, y1]
 * (Anteile des Bilds) einen Titel? Detail, Helligkeit, Gleichmäßigkeit → Schriftfarbe und nötige Abdunklung.
 * dim = Abdunklung, die der Einstieg ohnehin über das Bild legt. Liefert { sc, ink, scrim, calm, contrast } oder null.
 */
function bandStats(m, view, yc, h = 0.18, dim = 0) {
  if (!m || !m.calm || !m.calm.d) return null;
  const C = 8, D = m.calm.d, Lg = m.calm.l;
  const v = view || [0, 0, 1, 1];
  const ya = v[1] + (yc - h / 2) * (v[3] - v[1]), yb = v[1] + (yc + h / 2) * (v[3] - v[1]);
  const xa = v[0] + 0.1 * (v[2] - v[0]), xb = v[0] + 0.9 * (v[2] - v[0]);
  let dS = 0, lS = 0, lQ = 0, wS = 0;
  for (let cy = 0; cy < C; cy++) {
    const oy = Math.max(0, Math.min(yb, (cy + 1) / C) - Math.max(ya, cy / C));
    if (oy <= 0) continue;
    for (let cx = 0; cx < C; cx++) {
      const ox = Math.max(0, Math.min(xb, (cx + 1) / C) - Math.max(xa, cx / C));
      if (ox <= 0) continue;
      const wgt = ox * oy, k = cy * C + cx, dd = parseInt(D[k], 16) / 15, ll = (parseInt(Lg[k], 16) / 15) * (1 - dim);
      dS += dd * wgt; lS += ll * wgt; lQ += ll * ll * wgt; wS += wgt;
    }
  }
  if (!wS) return null;
  const det = dS / wS, lum = lS / wS, lvar = Math.sqrt(Math.max(0, lQ / wS - lum * lum));
  // Kontrast wie WCAG: helle Schrift (mit Schatten) gegen dunkle Schrift
  const Lb = Math.pow(lum, 2.2), cW = 1.05 / (Lb + 0.05), cD = (Lb + 0.05) / 0.05;
  const ink = cD > cW * 1.6 && det < 0.45 ? 'dark' : 'light';
  const cr = ink === 'light' ? cW : cD;
  // nötige Abdunklung hinter heller Schrift, damit sie sicher lesbar ist (≥ 4,5 : 1 auch über Details)
  const scrim = ink === 'light' ? Math.max(0, Math.min(0.6, (4.5 - cW) / 9 + det * 0.3 + lvar * 0.5)) : 0;
  const sc = (1 - det) * 0.55 + (1 - Math.min(1, lvar * 3)) * 0.2 + Math.min(1, cr / 7) * 0.25;
  return { sc, ink, scrim: +scrim.toFixed(2), calm: +(1 - det).toFixed(2), contrast: +cr.toFixed(1) };
}

/** Ruhigstes Band aus bands (Mitten 0–1 im Ausschnitt); prefer zieht zur gewohnten Stelle. */
function calmBand(m, view, opts = {}) {
  const bands = opts.bands || [0.2, 0.33, 0.5, 0.66, 0.8];
  let best = null;
  for (const yc of bands) {
    const st = bandStats(m, view, yc, opts.h, opts.dim || 0);
    if (!st) continue;
    const sc = st.sc - (opts.prefer != null ? Math.abs(yc - opts.prefer) * 0.35 : 0);
    if (!best || sc > best.score) best = { y: yc, ...st, score: sc };
  }
  return best;
}
