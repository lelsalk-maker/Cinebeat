// Erzeugt Test-Songs mit bekannten Beat-Zeiten
import { writeFileSync } from 'node:fs';
export function makeSong(file, { bpm, dur = 40, sr = 44100, offset = 0.37, intro = 0, swingHats = true, seed = 1 }) {
  const n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const beat = 60 / bpm;
  const truth = [];
  for (let t = offset, k = 0; t < dur - 0.5; t += beat, k++) {
    truth.push(t);
    const i0 = Math.floor(t * sr);
    const drums = t >= intro;
    // Kick
    if (drums && (k % 2 === 0 || bpm < 100)) for (let i = 0; i < 0.3 * sr && i0 + i < n; i++) {
      const tt = i / sr; const f = 50 + 90 * Math.exp(-tt * 30);
      d[i0 + i] += 0.8 * Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 9);
    }
    // Snare auf 2 und 4
    if (drums && k % 2 === 1) for (let i = 0; i < 0.18 * sr && i0 + i < n; i++) d[i0 + i] += 0.35 * rnd() * Math.exp(-i / sr * 22);
    // Hi-Hat Achtel
    if (drums) for (const off of [0, beat / 2]) { const j0 = Math.floor((t + off) * sr); for (let i = 0; i < 0.04 * sr && j0 + i < n; i++) d[j0 + i] += 0.12 * rnd() * Math.exp(-i / sr * 90); }
  }
  // Pad (tonal, gegen reinen Klick-Charakter)
  for (let i = 0; i < n; i++) { const t = i / sr; d[i] += 0.06 * Math.sin(2 * Math.PI * 220 * t) + 0.04 * Math.sin(2 * Math.PI * 277.2 * t) + 0.03 * Math.sin(2 * Math.PI * 329.6 * t); }
  let peak = 0; for (const v of d) peak = Math.max(peak, Math.abs(v));
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round((d[i] / peak) * 0.9 * 32767), 44 + i * 2);
  writeFileSync(file, buf);
  return truth;
}

// Song mit bekanntem Aufbau. Liefert Abschnittsgrenzen in Sekunden.
export function makeStructuredSong(file, { bpm = 124, sr = 44100, lead = 0.3 } = {}) {
  const plan = [['intro', 8], ['verse', 8], ['build', 4], ['drop', 8], ['break', 4], ['drop', 8], ['outro', 4]];
  const beat = 60 / bpm, bar = beat * 4;
  const totalBars = plan.reduce((a, p) => a + p[1], 0);
  const dur = lead + totalBars * bar + 1.5;
  const n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  let s = 7; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const add = (t0, len, fn) => { const i0 = Math.floor(t0 * sr); for (let i = 0; i < len * sr && i0 + i < n; i++) d[i0 + i] += fn(i / sr); };
  const kick = (t, v) => add(t, 0.3, (x) => v * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-x * 30)) * x) * Math.exp(-x * 9));
  const snare = (t, v) => add(t, 0.2, (x) => v * rnd() * Math.exp(-x * 20));
  const hat = (t, v) => add(t, 0.05, (x) => v * rnd() * Math.exp(-x * 80));
  const tone = (t, len, f, v, harm = 3) => add(t, len, (x) => { let o = 0; for (let h = 1; h <= harm; h++) o += Math.sin(2 * Math.PI * f * h * x) / h; return v * o * Math.min(1, x / 0.02) * Math.min(1, (len - x) / 0.05); });
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const verseCh = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const dropCh = [[50, 53, 57], [55, 58, 62], [52, 55, 59], [57, 61, 64]];
  const bounds = [];
  let t = lead, barIdx = 0;
  for (const [name, bars] of plan) {
    if (barIdx > 0) bounds.push({ t, name });
    for (let b = 0; b < bars; b++, barIdx++) {
      const tb = t + b * bar;
      const ch = (name === 'drop' || name === 'build' ? dropCh : verseCh)[barIdx % 4];
      const stopHere = name === 'break' && b === bars - 1;
      const padLen = stopHere ? bar * 0.5 : bar;
      const padV = name === 'drop' ? 0.05 : name === 'outro' ? 0.05 * (1 - b / bars) : 0.07;
      for (const m of ch) tone(tb, padLen, mtof(m), padV);
      if (name === 'verse' || name === 'drop') tone(tb, bar, mtof(ch[0] - 24), name === 'drop' ? 0.35 : 0.2, 2);
      for (let k = 0; k < 4; k++) {
        const tt = tb + k * beat;
        if (name === 'verse') { kick(tt, 0.5); hat(tt + beat / 2, 0.1); }
        if (name === 'drop') { kick(tt, 0.9); if (k % 2) snare(tt, 0.45); hat(tt, 0.15); hat(tt + beat / 2, 0.15); tone(tt, beat * 0.45, mtof(ch[2] + 12), 0.08, 4); }
        if (name === 'build') { const sub = 1 + Math.floor((b * 4 + k) / 4); for (let q = 0; q < sub; q++) snare(tt + (q * beat) / sub, 0.1 + 0.06 * b); }
      }
    }
    t += bars * bar;
  }
  let peak = 0; for (const v of d) peak = Math.max(peak, Math.abs(v));
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round((d[i] / peak) * 0.9 * 32767), 44 + i * 2);
  writeFileSync(file, buf);
  return { bounds, stopAt: lead + (8 + 8 + 4 + 8 + 3.5) * bar, bar };
}

/**
 * Langer Song mit realistischen Tücken: krumme BPM, langsame Tempodrift (wie eine Live-Band),
 * ein Break ohne Schlagzeug in der Mitte, Downbeat mit tieferem Kick. Liefert {beats, downs}.
 */
export function makeLongSong(file, { bpm = 123.4, dur = 185, sr = 22050, offset = 0.53, drift = 0.015, breakBars = [40, 48], seed = 3 } = {}) {
  const n = Math.floor(dur * sr);
  const d = new Float32Array(n);
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const add = (t0, len, fn) => { const i0 = Math.floor(t0 * sr); for (let i = 0; i < len * sr && i0 + i < n; i++) d[i0 + i] += fn(i / sr); };
  const beats = [], downs = [];
  let t = offset, k = 0;
  while (t < dur - 1) {
    beats.push(t);
    const bar = Math.floor(k / 4), pos = k % 4;
    if (pos === 0) downs.push(t);
    const inBreak = bar >= breakBars[0] && bar < breakBars[1];
    if (!inBreak) {
      const v = pos === 0 ? 0.95 : 0.6;
      if (pos === 0 || pos === 2) add(t, 0.28, (x) => v * Math.sin(2 * Math.PI * (45 + 90 * Math.exp(-x * 30)) * x) * Math.exp(-x * 9));
      if (pos === 1 || pos === 3) add(t, 0.18, (x) => 0.35 * rnd() * Math.exp(-x * 22));
      add(t + (60 / bpm) / 2, 0.04, (x) => 0.1 * rnd() * Math.exp(-x * 90));
    }
    // Akkord je Takt (auch im Break: dort trägt nur die Harmonie)
    if (pos === 0) { const f = [220, 196, 174.6, 246.9][bar % 4]; add(t, 4 * 60 / bpm, (x) => (inBreak ? 0.09 : 0.05) * (Math.sin(2 * Math.PI * f * x) + 0.6 * Math.sin(2 * Math.PI * f * 1.26 * x)) * Math.min(1, x / 0.03)); }
    // Tempo driftet sinusförmig um ±drift
    const cur = bpm * (1 + drift * Math.sin((2 * Math.PI * t) / dur));
    t += 60 / cur; k++;
  }
  let peak = 0; for (const v of d) peak = Math.max(peak, Math.abs(v));
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round((d[i] / peak) * 0.9 * 32767), 44 + i * 2);
  writeFileSync(file, buf);
  return { beats, downs };
}
