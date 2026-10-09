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
const AN_VER = 12;

/**
 * Mithören: findet in der Mikrofonaufnahme den genauen Einsatz des Songs – ohne Startton, egal wann Play gedrückt wurde.
 * 1. Pegel je Millisekunde (ohne Brummen unter 30 Hz), daraus 10-ms-Rahmen.
 * 2. Rauschen = die ruhigste Drittelsekunde, Songpegel = die lauten Stellen.
 * 3. Der Song ist der erste Moment deutlich über dem Rauschen, nach dem es hörbar weitergeht
 *    (ein Klick, Husten oder das Tippen aufs Display zählt nicht).
 * 4. Von dort zurück über leise Intros bis an den ersten Ton, dann auf die Millisekunde und das Sample genau.
 * Liefert { at (Sample), found, early (Song lief schon beim Start der Aufnahme), snr (dB), prev (Sample eines Geräuschs kurz davor oder −1) }.
 */
function findSongStart(d, sr) {
  const n = d.length, bl = Math.max(1, Math.round(sr / 1000)), nb = Math.floor(n / bl);
  if (nb < 400) return { at: 0, found: false, early: false, snr: 0 };
  // Gleichanteil und Brummen raus (Hochpass erster Ordnung, ~30 Hz)
  const hp = new Float32Array(n), R = 1 - (2 * Math.PI * 30) / sr;
  let x1 = 0, y1 = 0;
  for (let i = 0; i < n; i++) { const y = d[i] - x1 + R * y1; x1 = d[i]; y1 = y; hp[i] = y; }
  const ms = new Float32Array(nb);
  for (let b = 0; b < nb; b++) { let s = 0; for (let i = b * bl, e = i + bl; i < e; i++) s += hp[i] * hp[i]; ms[b] = s / bl; }
  const nf = Math.floor(nb / 10), f = new Float32Array(nf);
  for (let j = 0; j < nf; j++) { let s = 0; for (let b = j * 10; b < j * 10 + 10; b++) s += ms[b]; f[j] = Math.sqrt(s / 10); }
  const sorted = (a) => Float32Array.from(a).sort();
  // Rauschen: Median der ruhigsten 300 ms
  let N = Infinity;
  for (let j = 0; j + 30 <= nf; j += 5) N = Math.min(N, sorted(f.subarray(j, j + 30))[15]);
  N = Math.max(N, 1e-7);
  const fs = sorted(f), M = fs[Math.floor(nf * 0.95)];
  const snr = 20 * Math.log10(M / N);
  if (M < N * 4) return { at: 0, found: false, early: false, snr };
  const T = Math.max(N * 4, Math.sqrt(N * M));
  const loud = (a, z, k) => { let c = 0; a = Math.max(0, a); z = Math.min(nf, z); for (let j = a; j < z; j++) if (f[j] > N * k) c++; return z > a ? c / (z - a) : 0; };
  // längste Pause (Rahmen am Rauschen) zwischen a und z
  const gap = (a, z) => { let g = 0, c = 0; for (let k = a; k < Math.min(nf, z); k++) { c = f[k] <= N * 2 ? c + 1 : 0; g = Math.max(g, c); } return g; };
  // erster deutlich lauter Moment, nach dem die Musik weiterläuft: sofort hörbar, 3 s ohne Pause über 0,4 s
  // (ein Klick, Husten, Tippen oder ein kurzer Satz davor zählt so nicht)
  let j = -1;
  for (let k = 0; k < nf; k++) if (f[k] > T && loud(k, k + 10, 2.5) >= 0.5 && loud(k, k + 200, 3) >= 0.2 && gap(k, k + 300) < 40) { j = k; break; }
  if (j < 0) return { at: 0, found: false, early: false, snr };
  // zurück durch ein leises Intro, solange davor noch Musik zu hören ist
  let j0 = j;
  while (j0 > 0 && loud(j0 - 30, j0, 2.5) >= 0.25) j0 -= 10;
  // erster Rahmen, der hörbar weitergeht (nicht nur ein Knacken)
  let k0 = j0;
  for (let k = Math.max(0, j0 - 30); k <= j0 + 10 && k < nf; k++) if (f[k] > N * 3 && loud(k, k + 10, 2.5) >= 0.5) { k0 = k; break; }
  // auf die Millisekunde: zurück, solange der Pegel noch über dem Rauschen liegt
  const mN = N * N;
  let b0 = k0 * 10;
  for (let b = Math.max(0, k0 * 10 - 10); b < Math.min(nb, k0 * 10 + 10); b++) if (ms[b] > mN * 9) { b0 = b; break; }
  while (b0 > 2 && (ms[b0 - 1] + ms[b0 - 2] + ms[b0 - 3]) / 3 > mN * 1.5) b0--;
  // … und aufs Sample: erster Viertel-Millisekunden-Abschnitt deutlich über dem Rauschen
  const q = Math.max(4, Math.round(sr / 4000));
  let at = b0 * bl, acc = 0;
  const a0 = Math.max(0, (b0 - 2) * bl), a1 = Math.min(n - q, (b0 + 2) * bl);
  for (let i = a0; i < a0 + q; i++) acc += Math.abs(hp[i]);
  for (let i = a0; i < a1; i++) {
    if (acc / q > N * 1.6) { at = i + (q >> 1); break; }
    acc += Math.abs(hp[i + q]) - Math.abs(hp[i]);
  }
  // Song lief schon, als die Aufnahme begann
  if (at < sr * 0.15) return { at: 0, found: true, early: true, snr };
  // war kurz davor (bis 3 s) noch etwas Deutliches zu hören? Dann kann man dort beginnen (Prüfblatt)
  let prev = -1;
  for (let k = Math.floor(at / bl / 10) - 4; k >= Math.max(0, Math.floor(at / bl / 10) - 300); k--) if (f[k] > N * 4 && loud(k - 2, k + 3, 3) >= 0.6) { prev = k; break; }
  if (prev >= 0) { while (prev > 0 && f[prev - 1] > N * 2) prev--; prev *= 10 * bl; }
  return { at, found: true, early: false, snr, prev };
}

/**
 * Lautstärkespitzen im Ton eines Videos (Lachen, Jubel, ein Ruf, eine Welle): Momente, die deutlich lauter sind als der
 * übliche Ton der Aufnahme (gleichmäßiger Wind oder Verkehr heben den Pegel nur insgesamt). [[t, Stärke 0–1], …], höchstens 6.
 */
function loudPeaks(buffer) {
  const sr = buffer.sampleRate, n = buffer.length, hop = Math.max(1, Math.round(sr * 0.1));
  const chs = Math.min(2, buffer.numberOfChannels), data = [];
  for (let c = 0; c < chs; c++) data.push(buffer.getChannelData(c));
  const db = [];
  for (let a = 0; a + hop <= n; a += hop) {
    let s = 0;
    for (const d of data) for (let i = a; i < a + hop; i += 2) s += d[i] * d[i];
    db.push(10 * Math.log10(s / (hop / 2) / chs + 1e-10));
  }
  if (db.length < 10) return [];
  const sorted = db.slice().sort((x, y) => x - y), med = sorted[db.length >> 1], q90 = sorted[Math.floor(db.length * 0.9)];
  if (q90 < -50) return [];
  const thr = Math.max(med + 6, -40);
  const cand = [];
  for (let k = 1; k < db.length - 1; k++) {
    if (db[k] < thr || db[k] < db[k - 1] || db[k] < db[k + 1]) continue;
    cand.push([+(k * 0.1 + 0.05).toFixed(2), +Math.min(1, (db[k] - thr) / 12 + 0.2).toFixed(2)]);
  }
  cand.sort((x, y) => y[1] - x[1]);
  const out = [];
  for (const c of cand) if (out.every((o) => Math.abs(o[0] - c[0]) >= 0.8)) out.push(c);
  return out.slice(0, 6).sort((x, y) => x[0] - y[0]);
}

/**
 * Originalton-Momente eines Videos (lokal, ohne Spracherkennung): kurze, klare Ereignisse, die es wert sind, gehört zu
 * werden – Lachen (stimmhafte Silben im 3,5–8-Hz-Rhythmus), Jubel/Applaus (laut, breitbandig, hell) und ein kurzer
 * Ausruf („Wow!“: ein bis drei stimmhafte Silben, davor und danach Ruhe). Verworfen wird, was nicht trägt: Wind und
 * Rumpeln (Tiefen ohne Stimme), Dauerreden (viele Silben am Stück – ohne Verständnis des Inhalts wäre das Zufall),
 * leises Gemurmel und Videos, in denen selbst Musik läuft (sie würde mit dem Song kollidieren).
 * Liefert { music, list: [[t0, t1, art, q]] } – q 0…1 = wie klar und eindeutig der Moment ist.
 */
function soundMoments(buffer) {
  const sr0 = buffer.sampleRate, f = Math.max(1, Math.round(sr0 / 16000)), sr = sr0 / f;
  const chs = Math.min(2, buffer.numberOfChannels), len = Math.floor(buffer.length / f);
  if (len < sr * 0.8) return { music: false, list: [] };
  const x = new Float32Array(len);
  for (let c = 0; c < chs; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < len; i++) x[i] += d[i * f] / chs; }
  const N = 512, hop = Math.round(sr * 0.01), nF = Math.floor((len - N) / hop);
  if (nF < 40) return { music: false, list: [] };
  const fft = makeFFT(N), re = new Float32Array(N), im = new Float32Array(N), win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const db = new Float32Array(nF), flat = new Float32Array(nF), low = new Float32Array(nF), cen = new Float32Array(nF), vo = new Float32Array(nF), f0 = new Float32Array(nF);
  const lagMin = Math.floor(sr / 500), lagMax = Math.ceil(sr / 85), A = Math.round(sr * 0.03);
  const binHz = sr / N, lowBin = Math.round(300 / binHz);
  for (let k = 0; k < nF; k++) {
    const o = k * hop;
    let e = 0;
    for (let i = 0; i < N; i++) { const v = x[o + i]; e += v * v; re[i] = v * win[i]; im[i] = 0; }
    db[k] = 10 * Math.log10(e / N + 1e-10);
    fft(re, im);
    let lg = 0, ar = 0, tot = 0, lo = 0, cw = 0, cnt = 0;
    for (let b = 2; b < N / 2; b++) { const p = re[b] * re[b] + im[b] * im[b] + 1e-12; lg += Math.log(p); ar += p; cnt++; tot += p; if (b < lowBin) lo += p; cw += p * b * binHz; }
    flat[k] = Math.exp(lg / cnt) / (ar / cnt);
    low[k] = lo / tot; cen[k] = cw / tot;
    // Stimme: deutliche Periodizität (normierte Autokorrelation) zwischen 85 und 500 Hz
    if (o + A + lagMax < len) {
      let e0 = 0; for (let i = 0; i < A; i++) e0 += x[o + i] * x[o + i];
      // (echte Periodizität hat vor dem Gipfel ein Tal – tiefes Rauschen wie Wind ist nur „glatt“, ohne Tal)
      let best = -1, bl = 0, minR = 1, minBefore = 1;
      for (let L = lagMin; L <= lagMax; L++) {
        let c = 0, e1 = 0;
        for (let i = 0; i < A; i++) { c += x[o + i] * x[o + i + L]; e1 += x[o + i + L] * x[o + i + L]; }
        const r = c / Math.sqrt(e0 * e1 + 1e-12);
        if (r < minR) minR = r;
        if (r > best) { best = r; bl = L; minBefore = minR; }
      }
      vo[k] = best - minBefore > 0.3 ? best : 0; f0[k] = bl ? sr / bl : 0;
    }
  }
  const sorted = Array.from(db).sort((a, b) => a - b);
  const bg = sorted[Math.floor(nF * 0.2)], peak = sorted[Math.floor(nF * 0.98)];
  if (peak < -48) return { music: false, list: [] };
  // Musik im Video: über weite Strecken tonal und gleichmäßig laut (auch ohne Ereignis)
  let tonal = 0, loudish = 0;
  for (let k = 0; k < nF; k++) if (db[k] > bg + 3) { loudish++; if (vo[k] > 0.75 && flat[k] < 0.08) tonal++; }
  const music = loudish > nF * 0.6 && tonal > loudish * 0.55 && peak - bg < 14;
  if (music) return { music: true, list: [] };
  // Ereignisse: zusammenhängend deutlich über dem Grundgeräusch (Lücken bis 150 ms überbrückt)
  const thr = Math.max(bg + 10, peak - 22), ev = [];
  let s0 = -1, lastOn = -1;
  for (let k = 0; k <= nF; k++) {
    const on = k < nF && db[k] > thr;
    if (on) { if (s0 < 0) s0 = k; lastOn = k; } else if (s0 >= 0 && k - lastOn > 15) { ev.push([s0, lastOn]); s0 = -1; }
  }
  // Merkmale je Ereignis
  const feats = [];
  for (const [a, b] of ev) {
    const dur = (b - a + 1) * 0.01;
    if (dur < 0.25 || dur > 4) continue;
    let vS = 0, flS = 0, loS = 0, ceS = 0, pS = 0, pN = 0, dbM = -200;
    for (let k = a; k <= b; k++) { flS += flat[k]; loS += low[k]; ceS += cen[k]; dbM = Math.max(dbM, db[k]); if (vo[k] > 0.6 && f0[k] > 0) { vS++; pS += f0[k]; pN++; } }
    const n = b - a + 1;
    // Silben: Gipfel der geglätteten Hüllkurve mit 3 dB Abstand zum Tal davor
    const peaks = [];
    let valley = 1e9, up = false;
    for (let k = a; k <= b; k++) {
      const v = (db[Math.max(a, k - 2)] + db[k] + db[Math.min(b, k + 2)]) / 3;
      if (v < valley) valley = v;
      if (!up && v > valley + 3) { up = true; peaks.push(k); }
      if (up && k < b && v > (db[k + 1] + db[Math.min(b, k + 3)]) / 2 + 2.5) { up = false; valley = v; }
    }
    // Gleichmaß der Silbenabstände (Lachen: „ha-ha-ha“ wie ein Metronom; Sprechen: unregelmäßig)
    const iv = peaks.slice(1).map((t, i) => t - peaks[i]);
    const ivM = iv.length ? iv.reduce((x, y) => x + y, 0) / iv.length : 0;
    const cv = iv.length > 1 ? Math.sqrt(iv.reduce((x, y) => x + (y - ivM) ** 2, 0) / iv.length) / Math.max(1, ivM) : 1;
    const quiet = (k0, k1) => { let q = 0, c = 0; for (let k = Math.max(0, k0); k < Math.min(nF, k1); k++) { c++; if (db[k] < thr - 4) q++; } return c ? q / c : 1; };
    feats.push({ a, b, dur, voiced: vS / n, fl: flS / n, lw: loS / n, ce: ceS / n, pitch: pN ? pS / pN : 0, dbM, snr: dbM - bg, syl: peaks.length, rate: peaks.length / dur, cv, iso: Math.min(quiet(a - 50, a), quiet(b + 1, b + 51)) });
  }
  // Bezug für einen Ausruf: das übrige Sprechen im Video (lauter und höher als das Gewöhnliche)
  const voicedEv = feats.filter((e) => e.voiced >= 0.35);
  const medOf = (arr) => { const q = arr.slice().sort((x, y) => x - y); return q.length ? q[q.length >> 1] : 0; };
  const talkDb = voicedEv.length >= 3 ? medOf(voicedEv.map((e) => e.dbM)) : -200, talkPitch = voicedEv.length >= 3 ? medOf(voicedEv.map((e) => e.pitch)) : 0;
  const list = [];
  for (const e of feats) {
    let art = null, base = 0;
    // Wind/Rumpeln: tief und ohne Stimme
    if ((e.lw > 0.55 && e.voiced < 0.25) || e.lw > 0.7) continue;
    if (e.voiced >= 0.35 && e.rate >= 3.5 && e.rate <= 8.5 && e.syl >= 3 && e.cv < 0.35 && e.dur >= 0.6 && e.dur <= 3.2 && e.pitch >= 150) { art = 'lachen'; base = 1; }
    else if (e.snr >= 16 && e.dur >= 0.5 && e.ce > 1300 && (e.fl > 0.2 || e.voiced >= 0.3) && e.syl <= Math.max(4, e.dur * 4)) { art = 'jubel'; base = 0.85; }
    else if (e.voiced >= 0.45 && e.syl >= 1 && e.syl <= 3 && e.dur <= 1.6 && e.snr >= 12 && e.pitch >= 160 && e.iso >= 0.7 && e.dbM >= talkDb + 4 && (!talkPitch || e.pitch >= talkPitch * 1.15)) { art = 'ruf'; base = 0.8; }
    if (!art) continue;
    const q = base * Math.min(1, (e.snr - 6) / 18) * (1 - Math.min(0.6, Math.max(0, e.lw - 0.3)));
    if (q < 0.3) continue;
    list.push([+(e.a * 0.01).toFixed(2), +((e.b + 1) * 0.01 + 0.05).toFixed(2), art, +q.toFixed(2)]);
  }
  return { music: false, list: list.sort((p, q) => q[3] - p[3]).slice(0, 6).sort((p, q) => p[0] - q[0]) };
}

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
  // Schlagzeug: Bassdrum 40–150 Hz, Snare-Rauschen 1,5–8 kHz (lineare Energie, für Anschlag und Ausklang)
  let kickBands = 0, hiFrom = nBands;
  for (let b = 0; b < nBands; b++) {
    if ((bandEdges[b + 1] * sr) / N <= 150) kickBands = b + 1;
    if (hiFrom === nBands && (bandEdges[b] * sr) / N >= 1500) hiFrom = b;
  }
  kickBands = Math.max(1, kickBands);

  const flux = new Float32Array(nFrames);
  const lowFlux = new Float32Array(nFrames);
  const rms = new Float32Array(nFrames);
  const re = new Float32Array(N), im = new Float32Array(N);
  let prev = new Float32Array(nBands), cur = new Float32Array(nBands);
  // lineare Energie je Band: für die genaue Lage lauter Anschläge (die Log-Kurve reagiert auch auf leise Einsätze)
  const linFlux = new Float32Array(nFrames);
  const lowE = new Float32Array(nFrames), hiE = new Float32Array(nFrames);
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
    let le = 0, he = 0;
    for (let b = 0; b < kickBands; b++) le += curL[b];
    for (let b = hiFrom; b < nBands; b++) he += curL[b];
    lowE[f] = Math.sqrt(le); hiE[f] = Math.sqrt(he);
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
  // Oktavfehler: schlägt die Bassdrum regelmäßig auch auf jedem halben Schlag, ist das Tempo doppelt so hoch
  // (150 statt 75 BPM). Ein 75er mit Achtel-Hi-Hats bleibt – dort liegt auf den Zwischenschlägen kein Kick.
  if (hasRhythm && isFinite(period) && (60 * fps) / (period / 2) <= 180) {
    const kr = new Float32Array(nFrames);
    for (let j = 4; j < nFrames; j++) { let pre = 0; for (let k = j - 4; k < j; k++) pre = Math.max(pre, lowE[k]); kr[j] = Math.max(0, lowE[j] - pre); }
    const acK = (lag) => {
      let best = 0;
      for (let l = Math.round(lag) - 1; l <= Math.round(lag) + 1; l++) {
        if (l < 1) continue;
        let v = 0;
        for (let i = 0; i + l < nFrames; i++) v += kr[i] * kr[i + l];
        best = Math.max(best, v / (nFrames - l));
      }
      return best;
    };
    const full = acK(period), half = acK(period / 2);
    if (full > 0 && half >= full * 0.6) period /= 2;
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

  const toFrame = (t) => Math.max(0, Math.min(nFrames - 1, Math.round(((t - 0.014) * sr - N / 2) / hop)));
  // Hi-Hats zwischen den Schlägen können das Raster um einen halben Schlag verschieben: die Bassdrum entscheidet
  beats = fixHalfPhase(beats, pSec, lowE, toFrame, nFrames);
  // Schnittraster beruhigt; Struktur und Energie rechnen weiter mit dem gemessenen Raster (erkennt Abschnitte besser)
  // Schnittraster: auf die Anschläge im Bassband gezogen (Struktur und Energie rechnen mit dem Tracking-Raster)
  const beatsSteady = alignToKick(beats, pSec, lowE, toFrame, frameTime, nFrames, mono, sr);

  // RMS je Beat -> Energie 0..1
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
  const drums = detectDrums(beatsSteady, pSec, lowE, hiE, toFrame, nFrames);
  const vocal = detectVocals(beats, pSec, timbreF, chromaF, toFrame, nFrames);
  const mood = songMood({ timbreF, nFrames, beats, kicks: drums.kicks, beatRms });
  // Dur/Moll aus der feinen Tonanalyse (nur bei klarem Ergebnis)
  try { const key = songKey(mono, sr); mood.minor = key.minor; mood.keyConf = key.conf; } catch (e) { /* bleibt offen */ }
  const db = Array.from(beatRms, (v) => 20 * Math.log10(v + 1e-7));
  const lo = percentile(db, 0.05), hi = percentile(db, 0.97);
  const energyRaw = db.map((v) => Math.max(0, Math.min(1, (v - lo) / Math.max(1e-6, hi - lo))));
  const energy = new Float32Array(beats.length);
  for (let i = 0; i < beats.length; i++) {
    let s = 0, c = 0;
    for (let k = i - 2; k <= i + 3; k++) if (k >= 0 && k < beats.length) { s += energyRaw[k]; c++; }
    energy[i] = s / c;
  }
  // Akzente (wie stark trifft jeder Schlag) und Spannungskurve (wohin will der Song)
  const accs = songAccents({ beats: beatsSteady, pSec, linFlux, hiE, rms, toFrame, nFrames, fps, energy });



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
  // Zeiten der Struktur (Abschnitte, Takte, Refrain, Stopps) über den Schlag-Index aufs beruhigte Raster übertragen
  const toSteady = (t) => {
    if (!(t > 0) || !beats.length) return t;
    let lo = 0, hi = beats.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (beats[m] < t) lo = m + 1; else hi = m; }
    if (lo > 0 && Math.abs(beats[lo - 1] - t) < Math.abs(beats[lo] - t)) lo--;
    return t + (beatsSteady[lo] - beats[lo]);
  };
  const st = {
    ...structure,
    sections: structure.sections.map((x) => ({ ...x, start: x.start > 0 ? toSteady(x.start) : x.start, end: x.end < duration - 0.05 ? toSteady(x.end) : x.end })),
    barStart: structure.downIdx ? structure.downIdx.map((i) => beatsSteady[i]) : structure.barStart.map(toSteady),
    hook: toSteady(structure.hook),
    stops: (structure.stops || []).map((x) => ({ ...x, t: toSteady(x.t), end: toSteady(x.end) })),
  };
  return {
    ...st,
    ver: AN_VER,
    bpm: (60 * fps) / period,
    beatPeriod: pSec,
    hasRhythm,
    beats: Float64Array.from(beatsSteady),
    energy,
    kicks: drums.kicks,
    vocal: vocal.level,
    vocalOn: vocal.onsets,
    vocalLines: vocal.lines,
    accent: accs.accent,
    impacts: accs.impacts,
    tension: accs.tension,
    rises: songRises(beatsSteady, accs.tension, st.sections),
    mood,
    snares: drums.snares,
    duration,
    firstSound,
    lastSound: Math.max(firstSound + 1, lastSound),
    env,
  };
}

/**
 * Akzent-Hierarchie und Spannungskurve – wie ein Cutter den Song hört:
 *  - accent[i] (0…1): wie hart Schlag i trifft – Anschlag (lineare Bandenergie) gegenüber seiner Umgebung (±2 Takte)
 *    und gegenüber dem ganzen Song. Eine Bassdrum im Refrain trifft mehr als dieselbe in der Strophe.
 *  - impacts: die wenigen Treffer, die nach einem Bildakzent verlangen (Becken mit langem Ausklang oder ein deutlicher
 *    Pegelsprung, z. B. der Einsatz nach einer Pause) – höchstens einer je zwei Takte, nach Stärke sortiert.
 *  - tension[i] (0…1): Spannung = Pegel, Dichte der Anschläge und Helligkeit, über einen Takt geglättet.
 */
function songAccents({ beats, pSec, linFlux, hiE, rms, toFrame, nFrames, fps, energy }) {
  const n = beats.length;
  const accent = new Float32Array(n), tension = new Float32Array(n);
  if (n < 8) return { accent, impacts: [], tension };
  const tr = new Float32Array(n), crash = new Float32Array(n), step = new Float32Array(n), dens = new Float32Array(n), bright = new Float32Array(n), tail = new Float32Array(n), hiJump = new Float32Array(n);
  const t25 = Math.round(fps * 0.25), t60 = Math.round(fps * 0.6);
  const pk = (arr, a, b) => { let m = 0; for (let f = Math.max(0, a); f <= Math.min(nFrames - 1, b); f++) m = Math.max(m, arr[f]); return m; };
  const avg = (arr, a, b) => { let m = 0, c = 0; for (let f = Math.max(0, a); f <= Math.min(nFrames - 1, b); f++) { m += arr[f]; c++; } return c ? m / c : 0; };
  const bf = Math.max(2, Math.round(pSec * fps));
  // Anschlagsdichte über die Höhen (Snare-Wirbel, Hi-Hats, Klatschen): Spitzen, die deutlich über ihrem Umfeld stehen
  const hiRef = percentile(Array.from(hiE), 0.9) || 1e-9;
  const hiOn = new Uint8Array(nFrames);
  for (let f = 3; f < nFrames - 1; f++) if (hiE[f] > hiRef * 0.04 && hiE[f] > hiE[f - 2] * 1.35 && hiE[f] >= hiE[f - 1] && hiE[f] >= hiE[f + 1]) hiOn[f] = 1;
  for (let i = 0; i < n; i++) {
    const f = toFrame(beats[i]);
    tr[i] = pk(linFlux, f - 2, f + 3);
    const h0 = avg(hiE, f - 6, f - 2), hp = pk(hiE, f - 1, f + 3);
    hiJump[i] = hp / Math.max(1e-9, h0);
    tail[i] = avg(hiE, f + t25, f + t60);
    const rb = avg(rms, f - bf, f - 2), ra = avg(rms, f + 1, f + bf);
    step[i] = ra / Math.max(1e-9, rb);
    let c = 0;
    for (let g = f - 1; g < Math.min(nFrames, f + bf - 1); g++) c += hiOn[g];
    dens[i] = c;
    bright[i] = avg(hiE, f, f + bf) / Math.max(1e-9, avg(rms, f, f + bf));
  }
  // Becken: ein Höhen-Ausklang, der viel länger steht als bei den Schlägen ringsum (Hi-Hats, Melodie klingen gleich)
  for (let i = 0; i < n; i++) {
    // Bezug sind die Schläge danach (dort klingt das Becken über dem neuen Teil) – fällt der Song danach ab (Ende
    // eines Teils), die lautere Seite: ein Einsatz nach einer leisen Pause ist noch kein Becken
    const side = (a, z) => { const v = []; for (let k = Math.max(0, a); k < Math.min(n, z); k++) v.push(tail[k]); v.sort((x, y) => x - y); return v.length ? v[v.length >> 1] : 0; };
    const sb = side(i - 8, i), sa = side(i + 1, i + 9);
    const med = (sa >= sb * 0.5 ? sa : Math.max(sa, sb)) || 1e-9;
    crash[i] = Math.max(0, Math.min(1, (tail[i] / med - 1.3) / 1.2)) * (hiJump[i] > 1.3 ? 1 : 0.3);
  }
  const pct = (a, q) => percentile(Array.from(a), q);
  const trRef = pct(tr, 0.97) || 1e-9;
  for (let i = 0; i < n; i++) {
    const loc = [];
    for (let k = Math.max(0, i - 8); k < Math.min(n, i + 9); k++) loc.push(tr[k]);
    loc.sort((a, b) => a - b);
    const med = loc[loc.length >> 1] || 1e-9;
    const rel = Math.max(0, Math.min(1, (Math.log2(Math.max(1e-9, tr[i]) / med) + 0.3) / 1.6));
    const glob = Math.max(0, Math.min(1, tr[i] / trRef));
    // ein Einsatz nach Leiserem (Pegelsprung) trifft mehr als derselbe Schlag mitten im Refrain
    const stp = Math.max(0, Math.min(1, (step[i] - 1.2) / 1.5));
    accent[i] = Math.max(0, Math.min(1, 0.4 * rel + 0.35 * glob + 0.2 * crash[i] + 0.25 * stp));
  }
  // Spannung: Pegel, Dichte und Helligkeit (je auf ihre Spannweite im Song), über einen Takt geglättet
  const norm = (a) => { const lo = pct(a, 0.05), hi = pct(a, 0.95); return Array.from(a, (v) => Math.max(0, Math.min(1, (v - lo) / Math.max(1e-9, hi - lo)))); };
  const dN = norm(dens), bN = norm(bright);
  const raw = Array.from({ length: n }, (_, i) => 0.55 * (energy[i] || 0) + 0.27 * dN[i] + 0.18 * bN[i]);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = i - 3; k <= i; k++) if (k >= 0) { s += raw[k]; c++; } tension[i] = s / c; }
  // Treffer für einen Bildakzent: Becken oder Pegelsprung auf einem kräftigen Anschlag
  const cand = [];
  for (let i = 1; i < n; i++) {
    const v = accent[i] * (0.5 + 0.5 * Math.max(crash[i], Math.min(1, (step[i] - 1.15) / 0.8)));
    if (accent[i] > 0.55 && (crash[i] > 0.35 || step[i] > 1.45)) cand.push({ i, v });
  }
  cand.sort((a, b) => b.v - a.v);
  const taken = [];
  for (const c of cand) if (!taken.some((x) => Math.abs(x.i - c.i) < 8)) taken.push(c);
  const impacts = taken.slice(0, Math.max(2, Math.round(n / 24))).sort((a, b) => a.i - b.i).map((c) => ({ t: beats[c.i], v: +c.v.toFixed(2), crash: crash[c.i] > 0.35 }));
  return { accent, impacts, tension };
}

/**
 * Anstiege der Spannung vor einem Einsatz (Refrain, Drop oder ein deutlich kräftigerer Teil): nur wo die Spannung über
 * mindestens zwei Takte stetig steigt, beschleunigt der Schnitt – ein „Build“, der flach bleibt, wird nicht künstlich
 * gehetzt. Eine kurze Stille direkt vor dem Einsatz (Atempause) bleibt außen vor und wird gemeldet (gap).
 */
function songRises(beats, tension, sections) {
  const n = beats.length, out = [];
  if (!n || !tension || tension.length !== n) return out;
  const idx = (t) => { let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (beats[m] < t) lo = m + 1; else hi = m; } if (lo > 0 && Math.abs(beats[lo - 1] - t) < Math.abs(beats[lo] - t)) lo--; return lo; };
  const mean = (a, b) => { let s = 0, c = 0; for (let k = Math.max(0, a); k < Math.min(n, b); k++) { s += tension[k]; c++; } return c ? s / c : 0; };
  for (let si = 1; si < (sections || []).length; si++) {
    const sec = sections[si], prev = sections[si - 1];
    const E = idx(sec.start);
    if (E < 9 || E > n - 2) continue;
    const after = mean(E, E + 4);
    const strong = sec.label === 'drop' || sec.label === 'chorus' || after > mean(E - 8, E) + 0.12;
    if (!strong || prev.label === 'drop' || prev.label === 'chorus') continue;
    // Atempause: die letzten ein, zwei Schläge deutlich leiser als davor
    let g = 0;
    while (g < 2 && tension[E - 1 - g] < tension[E - 3 - g] * 0.7) g++;
    const e = E - 1 - g;
    let best = null;
    for (const L of [32, 24, 16, 8]) {
      const a = Math.max(0, idx(prev.start), e - L);
      if (e - a < 7) continue;
      let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
      const m = e - a + 1;
      for (let k = a; k <= e; k++) { const x = k - a, y = tension[k]; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; }
      const cov = sxy - (sx * sy) / m, vx = sxx - (sx * sx) / m, vy = syy - (sy * sy) / m;
      const slope = cov / Math.max(1e-9, vx), r2 = vy > 1e-9 ? (cov * cov) / (vx * vy) : 0;
      const gain = slope * (m - 1);
      if (gain > 0.14 && r2 > 0.5) { best = { a, gain, r2 }; break; }
    }
    if (!best) continue;
    out.push({ start: beats[best.a], end: beats[E], gain: +best.gain.toFixed(2), r2: +best.r2.toFixed(2), ...(g ? { gap: beats[E - g] } : {}) });
  }
  return out;
}

/**
 * Charakter des Songs (0…1): Klanghelligkeit (Höhen gegen Tiefen), Druck (Bassdrum-Dichte) und Dynamik (Abstand leiser
 * und lauter Stellen). Dur/Moll ist bei dieser Frequenzauflösung nicht verlässlich messbar und bleibt offen (null) –
 * eigene Beats bringen es aus ihrer Komposition mit. Daraus wählt die Auto-Regie Look, Bewegung und Übergänge.
 */
function songMood({ timbreF, nFrames, beats, kicks, beatRms }) {
  let lo = 0, hi = 0, n = 0;
  for (let f = 0; f < nFrames; f++) {
    const a = (timbreF[f * 12] + timbreF[f * 12 + 1] + timbreF[f * 12 + 2]) / 3;
    if (!(a > -8)) continue; // Stille
    lo += a;
    hi += (timbreF[f * 12 + 8] + timbreF[f * 12 + 9] + timbreF[f * 12 + 10] + timbreF[f * 12 + 11]) / 4;
    n++;
  }
  const tilt = n ? (hi - lo) / n : -2.7;
  const db = Array.from(beatRms, (v) => 20 * Math.log10(v + 1e-7)).sort((a, b) => a - b);
  const q = (p) => db[Math.max(0, Math.min(db.length - 1, Math.round(p * (db.length - 1))))] || 0;
  const kickD = beats.length ? kicks.length / beats.length : 0;
  const cl = (x) => +Math.max(0, Math.min(1, x)).toFixed(2);
  return { minor: null, bright: cl((tilt + 4.2) / 2.4), drive: cl(kickD * 0.9 + 0.1), dyn: cl((q(0.95) - q(0.2)) / 18) };
}

/**
 * Tonart, vor allem Dur oder Moll: eigene feine Frequenzanalyse (8192 Punkte ≈ 2,7 Hz je Linie, alle 0,5 s), nur die
 * Spitzen zwischen 110 Hz und 1,8 kHz (Töne statt Rauschen), zu Tonklassen summiert und mit den Tonart-Profilen nach
 * Krumhansl verglichen. minor: true/false nur bei klarem Abstand, sonst null (unsicher – dann zählt die Klangfarbe).
 */
function songKey(mono, sr) {
  const N = 8192, hop = Math.round(sr * 0.5);
  if (mono.length < N * 2) return { minor: null, conf: 0 };
  const fft = makeFFT(N), re = new Float32Array(N), im = new Float32Array(N), win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const kb = Math.ceil((110 * N) / sr), k0 = kb, k1 = Math.floor((1800 * N) / sr);
  const pc = new Int8Array(k1 + 1);
  for (let k = kb; k <= k1; k++) pc[k] = ((Math.round(12 * Math.log2((k * sr) / N / 440)) + 69) % 12 + 12) % 12;
  const chroma = new Float64Array(12), mag = new Float32Array(k1 + 5);
  const step = Math.max(1, Math.floor((mono.length - N) / hop / 400)) * hop;
  for (let o = 0; o + N <= mono.length; o += step) {
    for (let i = 0; i < N; i++) { re[i] = mono[o + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = kb - 4; k <= k1 + 4; k++) mag[k - kb + 4] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    const fr = new Float64Array(12);
    let tot = 0;
    for (let k = kb; k <= k1; k++) {
      const m = mag[k - kb + 4];
      // nur Spitzen über der Umgebung (Ton), Rauschen und Schlagzeug fallen heraus
      let loc = 0; for (let d = -4; d <= 4; d++) loc += mag[k - kb + 4 + d];
      const pk = m - loc / 9;
      if (!(pk > 0 && m >= mag[k - kb + 3] && m >= mag[k - kb + 5])) continue;
      fr[pc[k]] += Math.sqrt(pk); tot += Math.sqrt(pk);
    }
    if (tot > 0) for (let c = 0; c < 12; c++) chroma[c] += fr[c] / tot;
  }
  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const corr = (p, r) => {
    let mx = 0, my = 0;
    for (let i = 0; i < 12; i++) { mx += chroma[(i + r) % 12]; my += p[i]; }
    mx /= 12; my /= 12;
    let sxy = 0, sx = 0, sy = 0;
    for (let i = 0; i < 12; i++) { const a = chroma[(i + r) % 12] - mx, b = p[i] - my; sxy += a * b; sx += a * a; sy += b * b; }
    return sx > 0 ? sxy / Math.sqrt(sx * sy) : 0;
  };
  let bMaj = { r: -2, k: 0 }, bMin = { r: -2, k: 0 };
  for (let r = 0; r < 12; r++) { const a = corr(MAJ, r), b = corr(MIN, r); if (a > bMaj.r) bMaj = { r: a, k: r }; if (b > bMin.r) bMin = { r: b, k: r }; }
  const d = bMin.r - bMaj.r;
  return { minor: Math.abs(d) < 0.05 ? null : d > 0, tonic: d > 0 ? bMin.k : bMaj.k, conf: +Math.abs(d).toFixed(3), r: +Math.max(bMaj.r, bMin.r).toFixed(3) };
}

/**
 * Gesang (Näherung ohne KI): Anteil der Stimmlage (≈ 250 Hz – 2,5 kHz) an der Gesamtenergie mal
 * Tonhaftigkeit (ausgeprägte Tonklassen statt Rauschen). Je Beat 0–1; Einsätze = neue Gesangszeilen.
 */
function detectVocals(beats, pSec, timbreF, chromaF, toFrame, nFrames) {
  const n = beats.length;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = toFrame(beats[i]), b = Math.max(a + 1, toFrame(i + 1 < n ? beats[i + 1] : beats[i] + pSec));
    let acc = 0, cnt = 0;
    for (let f = a; f < b && f < nFrames; f++) {
      let mid = 0, all = 0;
      for (let g = 0; g < 12; g++) { const v = timbreF[f * 12 + g]; all += v; if (g >= 4 && g <= 9) mid += v; }
      let mx = 0, sum = 0;
      for (let k = 0; k < 12; k++) { const c = chromaF[f * 12 + k]; mx = Math.max(mx, c); sum += c; }
      const tonal = sum > 0 ? (mx * 12) / sum : 1;
      acc += (mid / 6 - all / 12) + 0.8 * Math.log(tonal);
      cnt++;
    }
    raw[i] = cnt ? acc / cnt : 0;
  }
  const arr = Array.from(raw);
  const lo = percentile(arr, 0.2), hi = percentile(arr, 0.92);
  const level = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = i - 1; k <= i + 1; k++) if (k >= 0 && k < n) { s += raw[k]; c++; }
    level[i] = Math.max(0, Math.min(1, (s / c - lo) / Math.max(1e-6, hi - lo)));
  }
  const onsets = [];
  for (let i = 2; i < n; i++) if (level[i] > 0.55 && level[i - 1] < 0.4 && level[i - 2] < 0.4) onsets.push(beats[i]);
  // Gesangszeilen: zusammenhängende Strecken mit Stimme (je Schlag, ungeglättet; Lücken bis zu einem Schlag gehören
  // dazu – Atem zwischen Wörtern). Ein Schnitt mitten in einer Zeile schneidet ins Wort, an ihrem Ende passt er.
  const lines = [];
  const rawN = (i) => Math.max(0, Math.min(1, (raw[i] - lo) / Math.max(1e-6, hi - lo)));
  let s0 = -1, gap = 0;
  for (let i = 0; i <= n; i++) {
    const on = i < n && rawN(i) > 0.5;
    if (on) { if (s0 < 0) s0 = i; gap = 0; } else if (s0 >= 0 && (++gap > 1 || i === n)) {
      const e = i - gap + 1;
      if (e - s0 >= 2) lines.push([+beats[s0].toFixed(3), +(e < n ? beats[e] : beats[n - 1] + pSec).toFixed(3)]);
      s0 = -1; gap = 0;
    }
  }
  return { level, onsets: Float64Array.from(onsets), lines };
}

/** Anstieg der Energie am Anschlag gegenüber den Frames kurz davor. */
function drumRise(arr, f, nFrames) {
  let mx = 0, pre = 0;
  for (let j = f - 1; j <= f + 2; j++) if (j >= 0 && j < nFrames) mx = Math.max(mx, arr[j]);
  for (let j = f - 6; j < f - 2; j++) if (j >= 0 && j < nFrames) pre = Math.max(pre, arr[j]);
  return Math.max(0, mx - pre);
}

/**
 * Halbe Phasenlage prüfen: liegt die Bassdrum über 16 Schläge deutlich auf den Zwischenschlägen,
 * sitzt das Raster dort auf den Hi-Hats. Dann rückt dieser Teil um einen halben Schlag.
 */
/**
 * Feinabgleich auf den Anschlag: jeder Schlag rückt auf den steilsten Energieanstieg im Bassband in seiner Nähe
 * (±70 ms, höchstens ein Fünftel Schlag) – nur wenn dort ein klarer Anschlag ist. Zwischen-Frame-genau; die
 * Versatz zwischen beiden Messungen kalibriert sich je Song selbst: dort, wo das Tracking-Raster ohnehin genau auf
 * dem Anschlag liegt, bleibt es unverändert; korrigiert werden nur die unsicheren Strecken (z. B. leise Strophen).
 */
function alignToKick(beats, pSec, lowE, toFrame, frameTime, nFrames, mono = null, sr = 22050) {
  const rise = new Float32Array(nFrames);
  for (let j = 4; j < nFrames; j++) { let pre = 0; for (let k = j - 4; k < j; k++) pre = Math.max(pre, lowE[k]); rise[j] = Math.max(0, lowE[j] - pre); }
  const peaks = [];
  for (let j = 1; j < nFrames - 1; j++) if (rise[j] > 0 && rise[j] >= rise[j - 1] && rise[j] > rise[j + 1]) peaks.push(rise[j]);
  const thr = percentile(peaks, 0.75) * 0.5 || 1e-9;
  const fr = frameTime(1) - frameTime(0);
  const R = Math.max(2, Math.round(Math.min(0.07, pSec * 0.2) / fr));
  const hit = beats.map((t) => {
    const f = toFrame(t);
    let bj = -1, bv = thr;
    for (let j = Math.max(1, f - R); j <= Math.min(nFrames - 2, f + R); j++) if (rise[j] > bv && rise[j] >= rise[j - 1] && rise[j] >= rise[j + 1]) { bv = rise[j]; bj = j; }
    if (bj < 0) return null;
    const y0 = rise[bj - 1], y1 = rise[bj], y2 = rise[bj + 1], den = y0 - 2 * y1 + y2;
    const sub = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0;
    return frameTime(bj + sub);
  });
  // Selbstkalibrierung: typischer Versatz der Anschlags-Messung gegenüber dem Raster, wo beide fast übereinstimmen
  const d = hit.map((h, i) => (h == null ? null : h - beats[i])).filter((x) => x != null && Math.abs(x) < 0.04);
  if (d.length < 8) return beats;
  const off = percentile(d, 0.5);
  // Anschlag im Signal selbst, auf ≈ 1 ms: tiefe Frequenzen (zwei Tiefpass-Stufen bei 160 Hz), Hüllkurve mit
  // schnellem Anstieg und 4 ms Abklingen; der Schlag liegt am Beginn des Anstiegs (20 % der Spitze) – nicht dort,
  // wo das grobe Analyse-Raster (12-ms-Schritte) die Energie steigen sieht
  let attackAt = null;
  if (mono && mono.length) {
    // Band des Bassdrum-Anschlags (≈ 90–250 Hz): darunter liegt der Bass, der lange klingt und den Anstieg verdeckt
    const env = new Float32Array(mono.length);
    const kl = 1 - Math.exp((-2 * Math.PI * 250) / sr), kh = 1 - Math.exp((-2 * Math.PI * 90) / sr), rel = Math.exp(-1 / (sr * 0.004));
    let l1 = 0, l2 = 0, h1 = 0, h2 = 0, e = 0;
    for (let i = 0; i < mono.length; i++) {
      l1 += kl * (mono[i] - l1); l2 += kl * (l1 - l2);
      h1 += kh * (l2 - h1); h2 += kh * (h1 - h2);
      e = Math.max(Math.abs(l2 - h2), e * rel);
      env[i] = e;
    }
    attackAt = (t) => {
      const i0 = Math.max(1, Math.round((t - 0.045) * sr)), i1 = Math.min(env.length - 1, Math.round((t + 0.03) * sr));
      let pk = i0, P = 0;
      for (let i = i0; i <= i1; i++) if (env[i] > P) { P = env[i]; pk = i; }
      // eindeutiger Anstieg über dem, was vorher klang
      let base = Infinity;
      for (let i = i0; i < pk; i++) base = Math.min(base, env[i]);
      if (!(P > 0) || !(base < P * 0.55)) return null;
      const thr = base + (P - base) * 0.2;
      let j = pk;
      while (j > i0 && env[j] > thr) j--;
      return j > i0 ? j / sr : null;
    };
  }
  // Feinlage je Treffer; wo kein klarer Anstieg messbar ist, gilt der grobe Wert plus der typische Unterschied
  const fineT = hit.map((h) => (h == null || !attackAt ? null : attackAt(h - off)));
  const fd = fineT.map((f, i) => (f != null && Math.abs(f - (hit[i] - off)) < 0.035 ? f - (hit[i] - off) : null)).filter((x) => x != null);
  const fShift = fd.length >= 8 ? percentile(fd, 0.5) : 0;
  const out = beats.map((t, i) => {
    if (hit[i] == null) return t;
    const fine = fineT[i];
    // gemessener Anschlag gilt immer (≈ 1 ms genau); der grobe Ersatzwert nur, wo das Raster deutlich daneben liegt
    if (fine != null && Math.abs(fine - (hit[i] - off)) < 0.035) return fine;
    const a = hit[i] - off + fShift;
    return Math.abs(a - t) > Math.max(0.012, fr * 1.2) ? a : t;
  });
  // Ausreißer und unsichere Schläge: die lokale Tempo-Linie der sicher gemessenen Nachbarn (±8, bei Bedarf ±16 Schläge)
  // gilt. Ein gemessener Schlag weicht nur, wenn er deutlich daneben liegt (falsch eingerastet); ein nicht gemessener
  // (kein klarer Anstieg, weil Bass den Anschlag verdeckt) kommt immer auf die Linie und dort auf den Anschlag
  // Schläge ohne eigenen Bassdrum-Anschlag lagen auf dem groben Raster: um den gemessenen typischen Versatz nachziehen
  if (attackAt) {
    const dl = out.map((x, i) => (hit[i] != null ? x - beats[i] : null)).filter((x) => x != null && Math.abs(x) < 0.04);
    if (dl.length >= 8) { const md = percentile(dl, 0.5); for (let i = 0; i < out.length; i++) if (hit[i] == null) out[i] = beats[i] + md; }
  }
  // Strecken ohne Bassdrum (Intro nur mit Flächen, Build mit Wirbeln, Break): weiche Einsätze (Akkordwechsel,
  // Triolen) ziehen das Raster dort weg. Die Schläge gehören aufs Tempo der Bassdrum links und rechts,
  // am Anfang/Ende auf das Tempo der nächsten sicheren Schläge. Anzahl und Reihenfolge bleiben gleich.
  const C = [];
  for (let i = 0; i < out.length; i++) if (hit[i] != null) C.push(i);
  if (C.length < 8) return out;
  const ok = (per) => Math.abs(per - pSec) < pSec * 0.08;
  for (let q = 0; q + 1 < C.length; q++) {
    const a = C[q], z = C[q + 1], m = z - a;
    if (m < 2) continue;
    const span = out[z] - out[a], n = Math.round(span / pSec);
    if (n !== m || Math.abs(span / pSec - n) > 0.15 || !ok(span / n)) continue;
    // nur, wo das Raster sichtbar holpert (Abstände weichen > 12 % ab); ein gleichmäßig schwingendes Tempo bleibt
    const per = span / n, src = out.slice(a, z + 1);
    const rough = src.some((t, k) => k > 0 && Math.abs(t - src[k - 1] - per) > per * 0.12);
    if (rough) for (let k = a + 1; k < z; k++) out[k] = out[a] + per * (k - a);
  }
  // Tempo am Rand: Ausgleichsgerade über bis zu 48 sichere Schläge (8 Schläge allein schätzen das Tempo zu grob)
  const fit = (cs) => {
    const xs = cs.map((c) => Math.round((out[c] - out[cs[0]]) / pSec)), ys = cs.map((c) => out[c]);
    const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    for (let k = 0; k < n; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += (xs[k] - mx) * (xs[k] - mx); }
    return sxx > 0 ? sxy / sxx : 0;
  };
  // Beginn/Ende der durchgehenden Bassdrum (vereinzelte tiefe Töne davor zählen nicht)
  let q0 = 0; while (q0 + 6 < C.length && C[q0 + 6] - C[q0] > 8) q0++;
  let q1 = C.length - 1; while (q1 - 6 >= 0 && C[q1] - C[q1 - 6] > 8) q1--;
  if (q0 + 6 < C.length) {
    const f = C[q0], perF = fit(C.slice(q0, q0 + 48));
    if (f >= 2 && ok(perF) && out[f] - perF * f > -perF * 0.35) for (let k = 0; k < f; k++) out[k] = Math.max(0, out[f] - perF * (f - k));
  }
  if (q1 - 6 >= 0) {
    const l = C[q1], perL = fit(C.slice(Math.max(0, q1 - 47), q1 + 1));
    if (out.length - 1 - l >= 2 && ok(perL)) for (let k = l + 1; k < out.length; k++) out[k] = out[l] + perL * (k - l);
  }
  // Messwerte je Schlag (Feinlage, sonst grob); einzelne davon irren (Bass/Flächen überlagern den Anschlag)
  const meas = beats.map((t, i) => (hit[i] == null ? null : fineT[i] != null && Math.abs(fineT[i] - (hit[i] - off)) < 0.035 ? fineT[i] : hit[i] - off + fShift));
  if (attackAt && meas.filter((x) => x != null).length >= 8) {
    // robuste lokale Tempo-Linie (±8 Schläge, Ausreißer verworfen): gleicht einzelne Fehlmessungen aus, folgt aber
    // langsamer Drift. Ein Messwert nah an der Linie bleibt (Feel), ein abweichender kommt auf die Linie.
    const fitAt = (i, w, edge = false, at = null) => {
      // ohne den Schlag selbst; innen nur mit Messungen auf beiden Seiten (sonst kippt die Linie)
      let idx = [];
      for (let j = Math.max(0, i - w); j <= Math.min(out.length - 1, i + w); j++) if (j !== i && meas[j] != null) idx.push(j);
      if (!edge && !(idx.some((j) => j < i) && idx.some((j) => j > i))) return null;
      if (idx.length < 6) return null;
      // Theil-Sen (Median der paarweisen Steigungen): ein einzelner Fehlmesswert am Fensterrand kippt die Linie nicht;
      // danach kleinste Quadrate über die Punkte nah an dieser Linie
      const sl = [];
      for (let p = 0; p < idx.length; p++) for (let q = p + 1; q < idx.length; q++) sl.push((meas[idx[q]] - meas[idx[p]]) / (idx[q] - idx[p]));
      let bb = percentile(sl, 0.5), aa = percentile(idx.map((j) => meas[j] - bb * j), 0.5);
      const res = idx.map((j) => Math.abs(meas[j] - aa - bb * j));
      const lim = Math.max(0.004, percentile(res, 0.5) * 2.5);
      idx = idx.filter((j, k) => res[k] <= lim);
      if (idx.length < 6) return null;
      if (!edge && !(idx.some((j) => j < i) && idx.some((j) => j > i))) return null;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const j of idx) { sx += j; sy += meas[j]; sxx += j * j; sxy += j * meas[j]; }
      const n = idx.length, den = n * sxx - sx * sx;
      if (Math.abs(den) > 1e-9) { bb = (n * sxy - sx * sy) / den; aa = (sy - bb * sx) / n; }
      if (idx.length < 6 || Math.abs(bb - pSec) > pSec * 0.08) return null;
      return at == null ? aa + bb * i : aa + bb * at;
    };
    const fixed = out.slice();
    for (let i = 0; i < out.length; i++) {
      const pred = fitAt(i, 8) ?? fitAt(i, 16) ?? fitAt(i, 16, true);
      if (pred == null) continue;
      if (meas[i] != null && Math.abs(meas[i] - pred) <= 0.006) { fixed[i] = meas[i]; continue; }
      if (hit[i] == null && Math.abs(out[i] - pred) > pSec * 0.25) continue;
      fixed[i] = pred;
    }
    // Anfang/Ende ohne Messung: Linie der ersten/letzten 16 sicheren Schläge weiterführen
    const mi = meas.map((x, i) => (x != null ? i : -1)).filter((i) => i >= 0);
    const f0 = mi[0], l0 = mi[mi.length - 1];
    for (let i = 0; i < f0; i++) { const p = fitAt(f0, 16, true, i); if (p != null && Math.abs(p - out[i]) < pSec * 0.25) fixed[i] = Math.max(0, p); }
    for (let i = l0 + 1; i < out.length; i++) { const p = fitAt(l0, 16, true, i); if (p != null && Math.abs(p - out[i]) < pSec * 0.25) fixed[i] = p; }
    for (let i = 0; i < out.length; i++) out[i] = fixed[i];
  }
  return out;
}

function fixHalfPhase(beats, pSec, lowE, toFrame, nFrames) {
  const n = beats.length;
  if (n < 16) return beats;
  // Verschiebung um einen Bruchteil q des Schlags (½; bei einem Raster im halben Tempo auch ¼ und ¾)
  const at = (i, q) => beats[i] + ((i + 1 < n ? beats[i + 1] : beats[i] + pSec) - beats[i]) * q;
  const QS = [0.5, 0.25, 0.75];
  // etwas breiter suchen (±4 Frames): ein Raster, das nicht genau einen halben Schlag, sondern knapp daneben liegt, wird auch erkannt
  const wide = (t) => { const f = toFrame(t); let m = 0; for (let d = -3; d <= 3; d++) m = Math.max(m, drumRise(lowE, f + d, nFrames)); return m; };
  const on = beats.map(wide);
  const offs = QS.map((q) => beats.map((_, i) => wide(at(i, q))));
  const ref = percentile(on.concat(offs[0]), 0.95) || 1e-9;
  const shift = new Array(n).fill(0);
  for (let s0 = 0; s0 < n; s0 += 8) {
    const e = Math.min(n, s0 + 16), c = e - s0;
    let a = 0;
    for (let i = s0; i < e; i++) a += on[i];
    let bestQ = 0, bestB = 0;
    QS.forEach((q, qi) => { let b = 0; for (let i = s0; i < e; i++) b += offs[qi][i]; if (b > bestB) { bestB = b; bestQ = q; } });
    if (bestB > a * 2 && bestB / c > ref * 0.06) for (let i = s0; i < Math.min(n, s0 + 8); i++) shift[i] = bestQ;
  }
  if (!shift.some(Boolean)) return beats;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = shift[i] ? at(i, shift[i]) : beats[i];
    if (!out.length || t - out[out.length - 1] > pSec * 0.6) out.push(t);
  }
  return out;
}

/**
 * Bassdrum und Snare auf dem Achtelraster: Anstieg der tiefen bzw. der hellen Energie gegenüber
 * den Frames davor. Die Snare zählt über ihren Ausklang (≈ 50 ms), so fallen kurze Hi-Hats heraus.
 * Schwellen relativ zum Song, damit leise und laute Produktionen gleich behandelt werden.
 */
function detectDrums(beats, pSec, lowE, hiE, toFrame, nFrames) {
  const pos = [];
  for (let i = 0; i < beats.length; i++) {
    pos.push(beats[i]);
    const nx = i + 1 < beats.length ? beats[i + 1] : beats[i] + pSec;
    pos.push((beats[i] + nx) / 2);
  }
  // Snare: mittlere Energie über ihren Ausklang (≈ 58 ms) statt Spitze, so fallen kurze Hi-Hats heraus
  const body = (arr, f) => {
    let m = 0, pre = 0;
    for (let j = f; j < f + 5; j++) if (j >= 0 && j < nFrames) m += arr[j];
    for (let j = f - 6; j < f - 2; j++) if (j >= 0 && j < nFrames) pre = Math.max(pre, arr[j]);
    return Math.max(0, m / 5 - pre);
  };
  const ks = [], ss = [];
  for (const t of pos) {
    const f = toFrame(t);
    ks.push(drumRise(lowE, f, nFrames));
    ss.push(body(hiE, f));
  }
  // Bezug: die kräftigsten Schläge des Songs; ein Teil mit leiserem Schlagzeug zählt über seinen eigenen Pegel
  const refK = percentile(ks, 0.97) || 1e-9, refS = percentile(ss, 0.97) || 1e-9;
  const kicks = [], snares = [];
  const W = 16;
  pos.forEach((t, i) => {
    let lk = 0, ls = 0;
    for (let j = Math.max(0, i - W); j < Math.min(pos.length, i + W); j++) { lk = Math.max(lk, ks[j]); ls = Math.max(ls, ss[j]); }
    // zwischen den Schlägen (i ungerade) nur ein deutlicher Anschlag: Hi-Hats über dem Nachklang sind keine Bassdrum
    if (ks[i] > Math.max(refK * 0.035, lk * (i % 2 ? 0.55 : 0.3))) kicks.push(t);
    if (ss[i] > Math.max(refS * 0.12, ls * 0.55)) snares.push(t);
  });
  // Rauschen ohne Schlagzeug: Treffer auf fast jeder Achtel sind keine Snare
  const sn = snares.length > pos.length * 0.6 ? [] : snares;
  return { kicks: Float64Array.from(kicks), snares: Float64Array.from(sn) };
}

/**
 * Songaufbau: Abschnitte (Intro, Strophe, Aufbau, Refrain/Drop, Break, Outro),
 * Hook, Akzente (starke Einzelschläge) und Stopps (kurze Pausen im Song).
 */
function analyzeStructure(a) {
  const { beats, beatLow, beatDb, timbreF, chromaF, rms, fps, nFrames, toFrame, frameTime, duration, beatPeriod } = a;
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
