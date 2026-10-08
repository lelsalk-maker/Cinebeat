// Mithören ohne Startton: findet den Song-Einsatz in der ganzen Aufnahme, egal wann Play gedrückt wurde.
// Synthetische Aufnahmen (Raumrauschen + Brummen): spät, früh, leises Intro, Klick/Husten davor, Song lief schon, nur Rauschen.
// Scharfe Einsätze: auf 4 ms genau. Weich einblendendes Intro 30 dB unter dem Refrain: die ersten ms liegen im Rauschen, daher 15 ms.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const res = await p.evaluate(() => {
  const sr = 48000;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const rec = (secs) => { const d = new Float32Array(sr * secs); for (let i = 0; i < d.length; i++) d[i] = rnd() * 0.006 + 0.002 * Math.sin(2 * Math.PI * 50 * i / sr); return d; };
  const kicks = (d, t0, amp = 0.8, from = 0) => { for (let k = 0; t0 + k * 0.5 < d.length / sr - 0.4; k++) { const a = Math.round((t0 + k * 0.5) * sr); let ph = 0; for (let i = 0; i < sr * 0.35 && a + i < d.length; i++) { const t = i / sr; ph += 2 * Math.PI * (45 + 75 * Math.exp(-t / 0.05)) / sr; d[a + i] += amp * Math.min(1, t / 0.003) * Math.exp(-t / 0.06) * Math.sin(ph); } if (k % 2) for (let i = 0; i < sr * 0.2 && a + i < d.length; i++) d[a + i] += 0.1 * Math.exp(-i / sr / 0.05) * (((i * 330 / sr) % 1) < 0.5 ? 1 : -1); } };
  const pad = (d, t0, t1, amp) => { for (let i = Math.round(t0 * sr); i < t1 * sr; i++) { const t = i / sr - t0; d[i] += amp * Math.min(1, t / 0.03) * (Math.sin(2 * Math.PI * 220 * t) + 0.6 * Math.sin(2 * Math.PI * 277 * t) + 0.5 * Math.sin(2 * Math.PI * 330 * t)) / 2.1; } };
  const burst = (d, t0, dur, amp) => { for (let i = Math.round(t0 * sr); i < (t0 + dur) * sr; i++) d[i] += amp * rnd() * 2 * Math.sin(Math.PI * (i / sr - t0) / dur); };
  const out = [];
  const run = (name, d, truth, want) => { const st = findSongStart(d, sr); out.push({ name, at: +(st.at / sr).toFixed(4), err: truth == null ? null : +((st.at / sr - truth) * 1000).toFixed(1), found: st.found, early: st.early, snr: Math.round(st.snr), prev: st.prev >= 0 ? +(st.prev / sr).toFixed(2) : -1, want }); };
  let d = rec(20); kicks(d, 5.2); run('spät gedrückt', d, 5.2, { found: true });
  d = rec(20); kicks(d, 1.3); run('früh gedrückt', d, 1.3, { found: true });
  d = rec(25); pad(d, 3.0, 25, 0.025); kicks(d, 7.0); run('leises Intro (−30 dB)', d, 3.0, { found: true, tol: 15 });
  d = rec(20); burst(d, 1.5, 0.015, 0.4); burst(d, 2.6, 0.18, 0.15); burst(d, 3.85, 0.012, 0.3); kicks(d, 4.0); run('Klick, Husten, Tippen davor', d, 4.0, { found: true, prev: true });
  d = rec(20); for (let k = 0; k < 6; k++) burst(d, 1.2 + k * 0.22, 0.15, 0.12); kicks(d, 3.4); run('kurzer Satz davor', d, 3.4, { found: true });
  d = rec(20); kicks(d, -0.2); run('Song lief schon', d, null, { early: true });
  d = rec(20); run('nur Rauschen', d, null, { found: false });
  d = rec(20); kicks(d, 3.3, 0.06); run('leise abgespielt', d, 3.3, { found: true });
  return out;
});
const errs = [];
for (const r of res) {
  console.log(`${r.name}: ${r.at} s · Abweichung ${r.err == null ? '–' : r.err + ' ms'} · gefunden ${r.found} · früh ${r.early} · SNR ${r.snr} dB${r.prev >= 0 ? ' · Geräusch davor bei ' + r.prev + ' s' : ''}`);
  if (r.want.found != null && r.found !== r.want.found) errs.push(`${r.name}: gefunden=${r.found}`);
  if (r.want.early != null && r.early !== r.want.early) errs.push(`${r.name}: früh=${r.early}`);
  if (r.want.prev && !(r.prev >= 0)) errs.push(`${r.name}: Geräusch davor nicht gemeldet`);
  if (r.err != null && r.found && !(r.err >= -1 && r.err <= (r.want.tol || 4))) errs.push(`${r.name}: ${r.err} ms daneben`);
}
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
await b.close();
