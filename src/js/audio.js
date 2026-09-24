/* ============================================================
 * Audio: Dekodieren, Beat-Erkennung, Tempo, Energieverlauf
 * ============================================================ */

function makeFFT(n) {
  const levels = Math.round(Math.log2(n));
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i, r = 0;
    for (let j = 0; j < levels; j++) { r = (r << 1) | (x & 1); x >>= 1; }
    rev[i] = r;
  }
  return function fft(re, im) {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tre = re[l] * cos[k] + im[l] * sin[k];
          const tim = -re[l] * sin[k] + im[l] * cos[k];
          re[l] = re[j] - tre; im[l] = im[j] - tim;
          re[j] += tre; im[j] += tim;
        }
      }
    }
  };
}

const yieldUI = () => new Promise((r) => setTimeout(r, 0));

function percentile(arr, p) {
  if (!arr.length) return 0;
  const a = Array.from(arr).sort((x, y) => x - y);
  const idx = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
  return a[idx];
}

/**
 * Analysiert einen AudioBuffer.
 * Liefert Tempo, Beat-Zeiten (lückenloses Raster über den ganzen Song),
 * Taktphase (Downbeats), Energie je Beat und eine Hüllkurve für die Anzeige.
 */
/** Version der Analyse: gespeicherte Songs mit älterer Version werden einmal neu analysiert. */
const AN_VER = 2;

async function analyzeAudio(buffer, onProgress) {
  const sr0 = buffer.sampleRate;
  const factor = Math.max(1, Math.round(sr0 / 22050));
  const sr = sr0 / factor;
  const len = Math.floor(buffer.length / factor);
  const mono = new Float32Array(len);
  const chs = buffer.numberOfChannels;
  for (let c = 0; c < chs; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) {
      let s = 0;
      const o = i * factor;
      for (let k = 0; k < factor; k++) s += d[o + k];
      mono[i] += s / (factor * chs);
    }
  }

  const N = 1024, hop = 256;
  const fps = sr / hop;
  const nFrames = Math.max(1, Math.floor((len - N) / hop) + 1);
  const fft = makeFFT(N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  // Logarithmische Bänder 40 Hz .. 10 kHz
  const nBands = 36;
  const bandEdges = [];
  const fLo = 40, fHi = Math.min(10000, sr / 2 - 1);
  for (let b = 0; b <= nBands; b++) {
    const f = fLo * Math.pow(fHi / fLo, b / nBands);
    bandEdges.push(Math.max(1, Math.min(N / 2, Math.round((f * N) / sr))));
  }
  let lowBands = 0;
  for (let b = 0; b < nBands; b++) if ((bandEdges[b + 1] * sr) / N <= 180) lowBands = b + 1;
  lowBands = Math.max(2, lowBands);

  const flux = new Float32Array(nFrames);
  const lowFlux = new Float32Array(nFrames);
  const rms = new Float32Array(nFrames);
  const re = new Float32Array(N), im = new Float32Array(N);
  let prev = new Float32Array(nBands), cur = new Float32Array(nBands);
  // lineare Energie je Band: für die genaue Lage lauter Anschläge (die Log-Kurve reagiert auch auf leise Einsätze)
  const linFlux = new Float32Array(nFrames);
  let prevL = new Float32Array(nBands), curL = new Float32Array(nBands);
  // Klangfarbe (12 Gruppen aus den 36 Bändern) und Chroma (12 Tonklassen) je Frame
  const timbreF = new Float32Array(nFrames * 12);
  const chromaF = new Float32Array(nFrames * 12);
  const pcOfBin = new Int8Array(N / 2).fill(-1);
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N;
    if (f >= 60 && f <= 2100) pcOfBin[k] = ((Math.round(12 * Math.log2(f / 440)) + 69) % 12 + 12) % 12;
  }

  for (let f = 0; f < nFrames; f++) {
    const o = f * hop;
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = mono[o + i] || 0;
      e += v * v;
      re[i] = v * win[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(e / N);
    fft(re, im);
    for (let b = 0; b < nBands; b++) {
      let s = 0;
      const a = bandEdges[b], z = Math.max(a + 1, bandEdges[b + 1]);
      for (let k = a; k < z; k++) s += re[k] * re[k] + im[k] * im[k];
      curL[b] = s / (z - a);
      cur[b] = Math.log10(1e-9 + curL[b]);
    }
    for (let g = 0; g < 12; g++) timbreF[f * 12 + g] = (cur[g * 3] + cur[g * 3 + 1] + cur[g * 3 + 2]) / 3;
    for (let k = 1; k < N / 2; k++) {
      const pc = pcOfBin[k];
      if (pc >= 0) chromaF[f * 12 + pc] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
    if (f > 0) {
      let fl = 0, lf = 0;
      for (let b = 0; b < nBands; b++) {
        const d = cur[b] - prev[b];
        if (d > 0) { fl += d; if (b < lowBands) lf += d; }
      }
      flux[f] = fl;
      lowFlux[f] = lf;
      let ll = 0;
      for (let b = 0; b < nBands; b++) { const d = Math.sqrt(curL[b]) - Math.sqrt(prevL[b]); if (d > 0) ll += d; }
      linFlux[f] = ll;
    }
    const t = prev; prev = cur; cur = t;
    const tl = prevL; prevL = curL; curL = tl;
    if ((f & 2047) === 2047) {
      onProgress && onProgress(0.8 * (f / nFrames));
      await yieldUI();
    }
  }

  // Onset-Hüllkurve: gleitenden Mittelwert abziehen, gleichrichten, normieren
  const onset = new Float32Array(nFrames);
  const w = Math.max(3, Math.round(fps * 0.35));
  let acc = 0;
  const cs = new Float64Array(nFrames + 1);
  for (let i = 0; i < nFrames; i++) { acc += flux[i]; cs[i + 1] = acc; }
  for (let i = 0; i < nFrames; i++) {
    const a = Math.max(0, i - w), b = Math.min(nFrames, i + w + 1);
    const mean = (cs[b] - cs[a]) / (b - a);
    onset[i] = Math.max(0, flux[i] - mean);
  }
  let sum = 0, sq = 0;
  for (let i = 0; i < nFrames; i++) { sum += onset[i]; sq += onset[i] * onset[i]; }
  const mean = sum / nFrames;
  const std = Math.sqrt(Math.max(1e-12, sq / nFrames - mean * mean));
  for (let i = 0; i < nFrames; i++) onset[i] /= std;

  onProgress && onProgress(0.85);
  await yieldUI();

  // Tempo per Autokorrelation mit Prior um 120 BPM
  const minLag = Math.max(2, Math.floor((fps * 60) / 200));
  const maxLag = Math.min(nFrames - 2, Math.ceil((fps * 60) / 55));
  const ac = new Float32Array(maxLag * 2 + 2);
  const acLimit = Math.min(ac.length - 1, nFrames - 2);
  for (let l = minLag; l <= acLimit; l++) {
    let s = 0;
    for (let i = 0; i + l < nFrames; i++) s += onset[i] * onset[i + l];
    ac[l] = s / (nFrames - l);
  }
  let bestLag = 0, bestScore = -Infinity;
  const scoreLag = (l) => {
    const bpm = (60 * fps) / l;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    const harm = 2 * l <= acLimit ? 0.5 * ac[2 * l] : 0;
    return prior * (ac[l] + harm);
  };
  for (let l = minLag; l <= Math.min(maxLag, acLimit); l++) {
    const s = scoreLag(l);
    if (s > bestScore) { bestScore = s; bestLag = l; }
  }
  let hasRhythm = bestLag > 0 && bestScore > 0;
  let period = bestLag;
  if (hasRhythm && bestLag > minLag && bestLag < acLimit) {
    const y0 = ac[bestLag - 1], y1 = ac[bestLag], y2 = ac[bestLag + 1];
    const den = y0 - 2 * y1 + y2;
    if (den < 0) {
      const off = (0.5 * (y0 - y2)) / den;
      if (Math.abs(off) < 1) period = bestLag + off;
    }
  }
  if (!hasRhythm || !isFinite(period) || period <= 0) period = (60 * fps) / 100;
  // Regelmäßigkeit: wie stark ragt der Peak aus der Autokorrelation heraus?
  let acMean = 0, acCount = 0;
  for (let l = minLag; l <= Math.min(maxLag, acLimit); l++) { acMean += ac[l]; acCount++; }
  acMean /= Math.max(1, acCount);
  const clarity = acMean > 0 ? ac[Math.round(period)] / acMean : 0;
  if (clarity < 1.15) hasRhythm = false;

  // Beat-Tracking per dynamischer Programmierung (Ellis 2007)
  const local = new Float32Array(nFrames);
  {
    const sigma = Math.max(1, period / 32);
    const rad = Math.ceil(sigma * 3);
    const g = [];
    for (let k = -rad; k <= rad; k++) g.push(Math.exp(-0.5 * (k / sigma) * (k / sigma)));
    for (let i = 0; i < nFrames; i++) {
      let s = 0;
      for (let k = -rad; k <= rad; k++) {
        const j = i + k;
        if (j >= 0 && j < nFrames) s += onset[j] * g[k + rad];
      }
      local[i] = s;
    }
  }
  const cum = new Float32Array(nFrames);
  const back = new Int32Array(nFrames).fill(-1);
  const tight = 100;
  const pMin = Math.round(period / 2), pMax = Math.round(period * 2);
  for (let t = 0; t < nFrames; t++) {
    let best = -Infinity, bi = -1;
    for (let tau = t - pMax; tau <= t - pMin; tau++) {
      if (tau < 0) continue;
      const lg = Math.log((t - tau) / period);
      const s = cum[tau] - tight * lg * lg;
      if (s > best) { best = s; bi = tau; }
    }
    cum[t] = local[t] + (bi >= 0 ? Math.max(0, best) : 0);
    back[t] = bi >= 0 && best > 0 ? bi : -1;
  }
  onProgress && onProgress(0.93);
  await yieldUI();

  // Letzten Beat wählen: letztes lokales Maximum mit ordentlichem Score
  const maxima = [];
  for (let t = 1; t < nFrames - 1; t++) if (cum[t] >= cum[t - 1] && cum[t] >= cum[t + 1]) maxima.push(t);
  let beatFrames = [];
  if (hasRhythm && maxima.length) {
    const med = percentile(maxima.map((t) => cum[t]), 0.5);
    let last = maxima[maxima.length - 1];
    for (let k = maxima.length - 1; k >= 0; k--) {
      if (cum[maxima[k]] >= 0.5 * med) { last = maxima[k]; break; }
    }
    let t = last;
    while (t >= 0) { beatFrames.push(t); t = back[t]; }
    beatFrames.reverse();
    // Schwache Beats am Anfang/Ende abschneiden (Intro/Outro ohne Rhythmus)
    const strength = beatFrames.map((f) => local[f]);
    const thr = 0.3 * (strength.reduce((a, b) => a + b, 0) / Math.max(1, strength.length));
    while (beatFrames.length > 4 && local[beatFrames[0]] < thr) beatFrames.shift();
    while (beatFrames.length > 4 && local[beatFrames[beatFrames.length - 1]] < thr) beatFrames.pop();
  }

  // Zeitversatz: Onset liegt etwa in der Fenstermitte des Frames
  const frameTime = (f) => (f * hop + N / 2) / sr + 0.014;
  const duration = buffer.duration;
  const pSec = period / fps;
  // Feinjustierung: jeden Beat auf den tatsächlichen Anschlag in seiner Nähe ziehen (Zwischen-Frame-genau).
  // Schwache Stellen (kein klarer Anschlag) behalten die Position aus dem Beat-Tracking.
  const rr = Math.max(2, Math.round(period * 0.07));
  const peaks = beatFrames.map((f) => {
    let bj = f, bv = -Infinity;
    for (let j = Math.max(1, f - rr); j <= Math.min(nFrames - 2, f + rr); j++) if (onset[j] > bv) { bv = onset[j]; bj = j; }
    return { bj, bv, edge: Math.abs(bj - f) === rr };
  });
  const medPeak = percentile(peaks.map((q) => q.bv), 0.5);
  const linMed = percentile(Array.from(linFlux), 0.5) || 1e-9;
  const LIN_SHIFT = -1.3; // Versatz der linearen Kurve gegenüber der Log-Kurve (Frames), per Test kalibriert
  const anchored = peaks.map((q) => q.bv >= Math.max(1.2, medPeak * 0.35) && !q.edge);
  const strong = new Array(beatFrames.length).fill(false);
  const refined = beatFrames.map((f, i) => {
    if (!anchored[i]) return f;
    let { bj } = peaks[i];
    // lauter Anschlag in der Nähe? Dann dessen Lage (lineare Energie) statt der Log-Kurve
    let lj = -1, lv = 0;
    for (let j = Math.max(1, f - rr); j <= Math.min(nFrames - 2, f + rr); j++) if (linFlux[j] > lv) { lv = linFlux[j]; lj = j; }
    if (lj > 0 && lv > linMed * 3) {
      strong[i] = true;
      const y0 = linFlux[lj - 1], y1 = linFlux[lj], y2 = linFlux[lj + 1];
      const den = y0 - 2 * y1 + y2;
      return lj + (den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0) + LIN_SHIFT;
    }
    const y0 = onset[bj - 1], y1 = onset[bj], y2 = onset[bj + 1];
    const den = y0 - 2 * y1 + y2;
    return bj + (den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0);
  });
  // Einzelne Ausreißer (ein Beat springt aus dem gleichmäßigen Raster seiner Nachbarn) zurückholen
  for (let i = 1; i < refined.length - 1; i++) {
    const a = refined[i] - refined[i - 1], b = refined[i + 1] - refined[i];
    const mid = (refined[i - 1] + refined[i + 1]) / 2;
    const span = refined[i + 1] - refined[i - 1];
    if (anchored[i - 1] && anchored[i + 1] && Math.abs(span / 2 - period) < period * 0.12 && Math.abs(refined[i] - mid) > Math.max(1.5, period * 0.05) && Math.abs(a - b) > period * 0.1) {
      refined[i] = mid;
      anchored[i] = false;
    }
  }
  // Beats ohne eigenen Anschlag (z. B. im Break ohne Schlagzeug) gleichmäßig zwischen die sicheren Nachbarn legen:
  // so folgt das Raster auch dort dem echten Tempo, statt mit dem Durchschnittstempo wegzudriften.
  for (let i = 0; i < refined.length; i++) {
    if (anchored[i]) continue;
    let a = i - 1; while (a >= 0 && !anchored[a]) a--;
    let z = i; while (z < refined.length && !anchored[z]) z++;
    if (a >= 0 && z < refined.length) {
      const n = z - a;
      for (let k = a + 1; k < z; k++) refined[k] = refined[a] + ((refined[z] - refined[a]) * (k - a)) / n;
    }
    i = z;
  }
  // Wo kein harter Anschlag den Beat festlegt, gilt das lokale Tempo: gewichtete Gerade über ±12 Beats
  // (harte Anschläge voll, weiche Einsätze wenig, geschätzte Beats kaum). So bleibt auch ein Break ohne
  // Schlagzeug gleichmäßig und exakt im Tempo der Umgebung.
  {
    const src = refined.slice();
    const wt = src.map((_, i) => (strong[i] ? 1 : anchored[i] ? 0.25 : 0.02));
    for (let i = 0; i < src.length; i++) {
      if (strong[i]) continue;
      let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let k = Math.max(0, i - 12); k <= Math.min(src.length - 1, i + 12); k++) {
        const w = wt[k] * (1 - Math.abs(k - i) / 13);
        sw += w; sx += w * k; sy += w * src[k]; sxx += w * k * k; sxy += w * k * src[k];
      }
      const den = sw * sxx - sx * sx;
      if (sw > 0 && Math.abs(den) > 1e-9) refined[i] = (sy * sxx - sx * sxy + (sw * sxy - sx * sy) * i) / den;
    }
  }
  let beats = refined.map(frameTime).filter((t) => t >= 0 && t < duration);
  if (beats.length < 4) {
    beats = [];
    const firstLoud = 0;
    for (let t = firstLoud; t < duration; t += pSec) beats.push(t);
    hasRhythm = false;
  }
  // Lücken füllen und Raster bis Songanfang/-ende verlängern
  const filled = [];
  {
    let t0 = beats[0];
    const pre = [];
    while (t0 - pSec > -0.02) { t0 -= pSec; pre.push(Math.max(0, t0)); }
    pre.reverse();
    filled.push(...pre);
    for (let i = 0; i < beats.length; i++) {
      if (i > 0) {
        const gap = beats[i] - beats[i - 1];
        const n = Math.round(gap / pSec);
        if (n >= 2) for (let k = 1; k < n; k++) filled.push(beats[i - 1] + (gap * k) / n);
      }
      filled.push(beats[i]);
    }
    let t1 = beats[beats.length - 1];
    while (t1 + pSec < duration) { t1 += pSec; filled.push(t1); }
  }
  beats = filled.filter((t, i, a) => i === 0 || t - a[i - 1] > pSec * 0.3);

  // RMS je Beat -> Energie 0..1
  const toFrame = (t) => Math.max(0, Math.min(nFrames - 1, Math.round(((t - 0.014) * sr - N / 2) / hop)));
  const beatRms = new Float32Array(beats.length);
  const beatLow = new Float32Array(beats.length);
  for (let i = 0; i < beats.length; i++) {
    const a = toFrame(beats[i]);
    const b = Math.max(a + 1, toFrame(i + 1 < beats.length ? beats[i + 1] : beats[i] + pSec));
    let s = 0, c = 0;
    for (let f = a; f < b && f < nFrames; f++) { s += rms[f] * rms[f]; c++; }
    beatRms[i] = Math.sqrt(s / Math.max(1, c));
    let lf = 0;
    for (let f = Math.max(0, a - 2); f <= Math.min(nFrames - 1, a + 2); f++) lf = Math.max(lf, lowFlux[f] + 0.5 * flux[f]);
    beatLow[i] = lf;
  }
  const db = Array.from(beatRms, (v) => 20 * Math.log10(v + 1e-7));
  const lo = percentile(db, 0.05), hi = percentile(db, 0.97);
  const energyRaw = db.map((v) => Math.max(0, Math.min(1, (v - lo) / Math.max(1e-6, hi - lo))));
  const energy = new Float32Array(beats.length);
  for (let i = 0; i < beats.length; i++) {
    let s = 0, c = 0;
    for (let k = i - 2; k <= i + 3; k++) if (k >= 0 && k < beats.length) { s += energyRaw[k]; c++; }
    energy[i] = s / c;
  }



  // Stille am Anfang/Ende
  let peak = 0;
  for (let f = 0; f < nFrames; f++) peak = Math.max(peak, rms[f]);
  const silent = peak * 0.02;
  let fs = 0; while (fs < nFrames - 1 && rms[fs] < silent) fs++;
  let ls = nFrames - 1; while (ls > 0 && rms[ls] < silent) ls--;
  const firstSound = Math.max(0, frameTime(fs) - 0.03);
  const lastSound = Math.min(duration, frameTime(ls) + N / sr);

  // Hüllkurve zur Anzeige (0..1)
  const envPoints = 800;
  const env = new Float32Array(envPoints);
  let envMax = 1e-9;
  for (let p = 0; p < envPoints; p++) {
    const a = Math.floor((p / envPoints) * nFrames), b = Math.max(a + 1, Math.floor(((p + 1) / envPoints) * nFrames));
    let m = 0;
    for (let f = a; f < b && f < nFrames; f++) m = Math.max(m, rms[f]);
    env[p] = m; envMax = Math.max(envMax, m);
  }
  for (let p = 0; p < envPoints; p++) env[p] = Math.sqrt(env[p] / envMax);

  const structure = analyzeStructure({
    beats, beatLow, beatDb: db, timbreF, chromaF, onset, rms, fps, nFrames, toFrame, frameTime, duration, beatPeriod: pSec,
    firstSound, lastSound,
  });

  onProgress && onProgress(1);
  return {
    ...structure,
    ver: AN_VER,
    bpm: (60 * fps) / period,
    beatPeriod: pSec,
    hasRhythm,
    beats: Float64Array.from(beats),
    // häufigste Taktphase (nur noch für ältere Aufrufer; maßgeblich ist downIdx)
    downPhase: (() => { const c = [0, 0, 0, 0]; for (const i of structure.downIdx) c[i % 4]++; return c.indexOf(Math.max(...c)); })(),
    energy,
    duration,
    firstSound,
    lastSound: Math.max(firstSound + 1, lastSound),
    env,
  };
}

/**
 * Songaufbau: Abschnitte (Intro, Strophe, Aufbau, Refrain/Drop, Break, Outro),
 * Hook, Akzente (starke Einzelschläge) und Stopps (kurze Pausen im Song).
 */
function analyzeStructure(a) {
  const { beats, beatLow, beatDb, timbreF, chromaF, onset, rms, fps, nFrames, toFrame, frameTime, duration, beatPeriod } = a;
  const nb = beats.length;
  const tb = [], cb = [];
  for (let i = 0; i < nb; i++) {
    const f0 = toFrame(beats[i]);
    const f1 = Math.max(f0 + 1, toFrame(i + 1 < nb ? beats[i + 1] : beats[i] + beatPeriod));
    const t = new Float32Array(12), c = new Float32Array(12);
    let n = 0;
    for (let f = f0; f < f1 && f < nFrames; f++) {
      for (let g = 0; g < 12; g++) { t[g] += timbreF[f * 12 + g]; c[g] += chromaF[f * 12 + g]; }
      n++;
    }
    let cn = 0;
    for (let g = 0; g < 12; g++) { t[g] /= Math.max(1, n); cn += c[g] * c[g]; }
    cn = Math.sqrt(cn) || 1;
    for (let g = 0; g < 12; g++) c[g] /= cn;
    tb.push(t); cb.push(c);
  }
  // Takte: Taktposition jedes Beats per Viterbi. Hinweise auf eine Eins: Bass-Anschlag und Akkordwechsel.
  // Ein Sprung im Zählen kostet viel, ist aber möglich: ein verlorener oder zusätzlicher Beat verschiebt
  // so nicht den ganzen restlichen Song.
  const barStart = [];
  {
    const z = (arr) => { const m = arr.reduce((x, y) => x + y, 0) / Math.max(1, arr.length); const sd = Math.sqrt(arr.reduce((x, y) => x + (y - m) * (y - m), 0) / Math.max(1, arr.length)) || 1; return arr.map((v) => (v - m) / sd); };
    const nov = new Array(nb).fill(0);
    for (let i = 2; i < nb - 1; i++) {
      let dot = 0, na = 0, nn = 0;
      for (let g = 0; g < 12; g++) {
        const pa = cb[i - 1][g] + cb[i - 2][g], nx = cb[i][g] + cb[i + 1][g];
        dot += pa * nx; na += pa * pa; nn += nx * nx;
      }
      nov[i] = 1 - dot / (Math.sqrt(na * nn) || 1);
    }
    const lowZ = z(Array.from(beatLow || new Float32Array(nb))), novZ = z(nov);
    const sal = lowZ.map((v, i) => v + 1.2 * novZ[i]);
    const pen = 6;
    const sc = [new Float64Array(4)], bk = [new Int8Array(4)];
    for (let q = 0; q < 4; q++) sc[0][q] = q === 0 ? sal[0] : 0;
    for (let i = 1; i < nb; i++) {
      const row = new Float64Array(4), br = new Int8Array(4), prev = sc[i - 1];
      for (let q = 0; q < 4; q++) {
        let best = -Infinity, bq = 0;
        for (let r = 0; r < 4; r++) {
          const v = prev[r] - ((r + 1) % 4 === q ? 0 : pen);
          if (v > best) { best = v; bq = r; }
        }
        row[q] = best + (q === 0 ? sal[i] : 0);
        br[q] = bq;
      }
      sc.push(row); bk.push(br);
    }
    const pos = new Int8Array(nb);
    if (nb) {
      let q = 0;
      for (let r = 1; r < 4; r++) if (sc[nb - 1][r] > sc[nb - 1][q]) q = r;
      for (let i = nb - 1; i >= 0; i--) { pos[i] = q; q = bk[i][q]; }
    }
    for (let i = 0; i < nb; i++) if (pos[i] === 0 && (!barStart.length || i - barStart[barStart.length - 1] >= 2)) barStart.push(i);
  }
  const B = barStart.length;
  const dbLo = percentile(beatDb, 0.05), dbHi = percentile(beatDb, 0.97);
  const eNorm = (v) => Math.max(0, Math.min(1, (v - dbLo) / Math.max(1e-6, dbHi - dbLo)));
  const barT = [], barC = [], barE = [];
  for (let k = 0; k < B; k++) {
    const i0 = barStart[k], i1 = Math.min(nb, i0 + 4);
    const t = new Float32Array(12), c = new Float32Array(12);
    let e = 0;
    for (let i = i0; i < i1; i++) { for (let g = 0; g < 12; g++) { t[g] += tb[i][g]; c[g] += cb[i][g]; } e += beatDb[i]; }
    const n = Math.max(1, i1 - i0);
    for (let g = 0; g < 12; g++) { t[g] /= n; c[g] /= n; }
    barT.push(t); barC.push(c); barE.push(eNorm(e / n));
  }
  // Klangfarbe je Dimension standardisieren
  for (let g = 0; g < 12; g++) {
    let m = 0, q = 0;
    for (let k = 0; k < B; k++) { m += barT[k][g]; q += barT[k][g] * barT[k][g]; }
    m /= Math.max(1, B);
    const sd = Math.sqrt(Math.max(1e-9, q / Math.max(1, B) - m * m));
    for (let k = 0; k < B; k++) barT[k][g] = (barT[k][g] - m) / sd;
  }
  const meanVec = (arr, a0, a1) => {
    const v = new Float32Array(12);
    const n = Math.max(1, a1 - a0);
    for (let k = a0; k < a1; k++) for (let g = 0; g < 12; g++) v[g] += arr[k][g] / n;
    return v;
  };
  const meanE = (a0, a1) => { let s = 0; for (let k = a0; k < a1; k++) s += barE[k]; return s / Math.max(1, a1 - a0); };
  const dist = (k, W) => {
    const a0 = Math.max(0, k - W), a1 = k, b0 = k, b1 = Math.min(B, k + W);
    if (a1 - a0 < 1 || b1 - b0 < 1) return 0;
    const ta = meanVec(barT, a0, a1), tbv = meanVec(barT, b0, b1);
    const ca = meanVec(barC, a0, a1), cbv = meanVec(barC, b0, b1);
    let dt = 0, dot = 0, na = 0, nbb = 0;
    for (let g = 0; g < 12; g++) { dt += (ta[g] - tbv[g]) ** 2; dot += ca[g] * cbv[g]; na += ca[g] ** 2; nbb += cbv[g] ** 2; }
    const cos = dot / Math.max(1e-9, Math.sqrt(na * nbb));
    return Math.sqrt(dt / 12) + 0.8 * (1 - cos) + 1.6 * Math.abs(meanE(a0, a1) - meanE(b0, b1));
  };
  const nov = new Float32Array(B);
  for (let k = 1; k < B; k++) nov[k] = (dist(k, 2) + dist(k, 4)) / 2;
  // Nur Takte mit Musik berücksichtigen (Stille am Ende verfälscht sonst die Schwelle)
  let lastBar = B - 1;
  while (lastBar > 1 && beats[barStart[lastBar]] > a.lastSound - beatPeriod * 2) lastBar--;
  // Phrasenraster (alle 4 Takte) mit der stärksten Novelty
  const ps = [0, 0, 0, 0];
  for (let k = 1; k <= lastBar; k++) ps[k % 4] += nov[k];
  let phase = 0;
  for (let p = 1; p < 4; p++) if (ps[p] > ps[phase]) phase = p;
  const inner = [];
  for (let k = 1; k <= lastBar; k++) inner.push(nov[k]);
  const med = percentile(inner, 0.5);
  const mad = percentile(inner.map((v) => Math.abs(v - med)), 0.5);
  const novThr = med + 1.0 * mad;
  const cands = [];
  for (let k = 2; k <= lastBar; k++) {
    const grid = k % 4 === phase ? 1.3 : k % 2 === phase % 2 ? 1.0 : 0.8;
    const sc = nov[k] * grid;
    const isPeak = nov[k] >= nov[k - 1] && nov[k] >= (k + 1 < B ? nov[k + 1] : 0);
    if (sc > novThr && (isPeak || k % 4 === phase)) cands.push({ k, sc, jump: Math.abs(barE[k] - barE[k - 1]) });
  }
  cands.sort((x, y) => y.sc - x.sc);
  const chosen = [];
  // Normalfall 4+ Takte Abstand; kurze Abschnitte (2 Takte, z. B. Aufbau/Break) bei deutlichem Lautstärkesprung
  for (const c of cands) {
    const minD = Math.min(Infinity, ...chosen.map((k) => Math.abs(k - c.k)));
    if (minD >= 4 || (minD >= 2 && c.jump > 0.2)) chosen.push(c.k);
  }
  chosen.sort((x, y) => x - y);
  const bounds = [0, ...chosen, B];
  const sections = [];
  for (let s = 0; s + 1 < bounds.length; s++) {
    const k0 = bounds[s], k1 = bounds[s + 1];
    const start = s === 0 ? 0 : beats[barStart[k0]];
    const end = k1 >= B ? duration : beats[barStart[k1]];
    const e = meanE(k0, k1);
    const half = Math.max(1, Math.floor((k1 - k0) / 2));
    const slope = meanE(k0 + half, k1) - meanE(k0, k0 + half);
    let bright = 0;
    for (let k = k0; k < k1; k++) bright += (barT[k][9] + barT[k][10] + barT[k][11]) / 3;
    bright /= Math.max(1, k1 - k0);
    sections.push({ start, end, bars: k1 - k0, energy: e, bright, slope, label: '' });
  }
  // Benennung relativ zum lautesten Abschnitt des Songs
  const maxE = Math.max(...sections.map((x) => x.energy));
  const pk = (x) => x.energy + 0.12 * Math.max(-1.5, Math.min(1.5, x.bright));
  const maxP = Math.max(...sections.map(pk));
  const isPeak = (x) => x.energy >= maxE - 0.12 && pk(x) >= maxP - 0.09;
  const isLow = (x) => x.energy <= maxE - 0.4;
  sections.forEach((x, i) => {
    const prev = sections[i - 1], next = sections[i + 1];
    if (isPeak(x)) return;
    const preDrop = i > 0 && next && isPeak(next);
    if (preDrop && x.bars <= 8 && (x.slope > 0.02 || (x.bars <= 4 && x.energy < next.energy - 0.2 && !isLow(x)))) x.label = 'build';
    else if (isLow(x)) x.label = i === 0 ? 'intro' : !next ? 'outro' : 'break';
    else x.label = i === 0 ? 'intro' : !next && x.slope < 0 ? 'outro' : 'verse';
    void prev;
  });
  sections.forEach((x, i) => {
    if (!isPeak(x)) return;
    const prev = sections[i - 1];
    x.label = prev && (prev.label === 'build' || prev.label === 'break' || x.energy - prev.energy > 0.3) ? 'drop' : 'chorus';
  });
  let hookSec = sections.find((x) => x.label === 'drop') || sections.find((x) => x.label === 'chorus');
  if (!hookSec) hookSec = sections.reduce((m, x) => (x.energy > m.energy ? x : m), sections[0]);
  // Stopps: plötzliche kurze Stille mitten im Song
  const stops = [];
  const avgW = Math.round(fps * 1.5);
  const cs = new Float64Array(nFrames + 1);
  for (let f = 0; f < nFrames; f++) cs[f + 1] = cs[f] + rms[f];
  let f = Math.round(fps * 1);
  const fEnd = nFrames - Math.round(fps * 1);
  while (f < fEnd) {
    const a0 = Math.max(0, f - avgW);
    const local = (cs[f] - cs[a0]) / Math.max(1, f - a0);
    if (rms[f] < local * 0.14 && local > 0) {
      let g = f;
      while (g < fEnd && rms[g] < local * 0.2) g++;
      const dur = (g - f) / fps;
      // nur echte Pausen: danach setzt die Musik wieder kräftig ein
      const after = Math.min(nFrames, g + Math.round(fps * 0.3));
      const resume = (cs[after] - cs[g]) / Math.max(1, after - g);
      if (dur >= 0.12 && dur < 3 && resume >= local * 0.45) stops.push({ t: frameTime(f), end: frameTime(g) });
      f = g + 1;
    } else f++;
  }
  const stopsIn = stops.filter((x) => x.t > a.firstSound + 1 && x.end < a.lastSound - 1);
  return { sections: sections.map((x) => ({ ...x, slope: +x.slope.toFixed(3), bright: +x.bright.toFixed(2) })), hook: hookSec ? hookSec.start : 0, stops: stopsIn, barStart: barStart.map((i) => beats[i]), downIdx: barStart.slice(), phrasePhase: phase };
}

/** Eingebauter Beispiel-Song mit Aufbau: Intro, Strophe, Aufbau, Drop, Break (mit Stopp), Drop, Outro. */
async function synthDemoSong() {
  const bpm = 118, sr = 44100;
  const beat = 60 / bpm, barLen = beat * 4;
  const plan = [['intro', 4], ['verse', 4], ['build', 2], ['drop', 8], ['break', 2], ['drop', 4], ['outro', 2]];
  const bars = plan.reduce((a, p) => a + p[1], 0);
  const t0 = 0.05;
  const dur = t0 + bars * barLen + 2;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil(dur * sr), sr);
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  const noiseBuf = ctx.createBuffer(1, sr, sr);
  { const d = noiseBuf.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x7fffffff) * 2 - 1; } }
  const kick = (t, v = 1) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.95 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.45);
  };
  let nOff = 0;
  const noiseHit = (t, len, freq, q, vol, type = 'highpass') => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    nOff = (nOff + 0.137) % 0.6;
    s.connect(f).connect(g).connect(master); s.start(t, nOff); s.stop(t + len + 0.02);
  };
  const tone = (t, len, freq, vol, type = 'sawtooth', cutoff = 1200, attack = 0.02) => {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, len - 0.2));
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + len + 0.05);
  };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const verseCh = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const dropCh = [[50, 53, 57], [55, 58, 62], [52, 55, 59], [57, 61, 64]];
  let bar = 0;
  for (const [name, n] of plan) {
    for (let b = 0; b < n; b++, bar++) {
      const tb = t0 + bar * barLen;
      const drop = name === 'drop';
      const ch = (drop || name === 'build' ? dropCh : verseCh)[bar % 4];
      const stop = name === 'break' && b === n - 1;
      const padLen = stop ? barLen * 0.5 : barLen + 0.08;
      const padVol = name === 'outro' ? 0.05 * (1 - b / n) : drop ? 0.04 : 0.055;
      for (const m of ch) tone(tb, padLen, mtof(m), padVol, 'sawtooth', drop ? 2400 : 900, 0.25);
      if (name === 'verse' || drop) tone(tb, barLen, mtof(ch[0] - 24), drop ? 0.2 : 0.14, 'triangle', 420, 0.01);
      for (let k = 0; k < 4; k++) {
        const t = tb + k * beat;
        if (name === 'verse') { kick(t, 0.7); noiseHit(t + beat / 2, 0.05, 7000, 0.7, 0.07); }
        if (drop) {
          kick(t, 1);
          if (k % 2) noiseHit(t, 0.2, 1800, 0.8, 0.35, 'bandpass');
          noiseHit(t, 0.04, 8000, 0.7, 0.08); noiseHit(t + beat / 2, 0.05, 7000, 0.7, 0.12);
          if (k % 2 === 0) tone(t + beat * 0.75, beat * 0.4, mtof(ch[2] + 12), 0.03, 'square', 3000, 0.005);
        }
        if (name === 'build') { const sub = b === 0 ? 2 : 4; for (let q = 0; q < sub; q++) noiseHit(t + (q * beat) / sub, 0.12, 1800, 0.8, 0.12 + 0.08 * b + 0.02 * k, 'bandpass'); }
      }
      if (name === 'intro') for (let k = 0; k < 2; k++) tone(tb + k * 2 * beat, 1.1, mtof(76 + [0, 3, 7, 5][(bar * 2 + k) % 4]), 0.03, 'sine', 4000, 0.005);
    }
  }
  return ctx.startRendering();
}
