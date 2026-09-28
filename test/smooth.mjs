// Glätte: misst, was einen Film abgehackt wirken lässt (Kamerageschwindigkeit, Richtungswechsel, Effektdichte, Übergänge).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/struct.wav`, { bpm: 124 });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const wav = readFileSync(`${OUT}/struct.wav`).toString('base64');
const res = await p.evaluate(async ([b64, SDBG]) => {
  const process = { env: { SDBG } };
  const fails = [], out = {};
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const an = await analyzeAudio(await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer));
  const base = demoScenes();
  const T0 = Date.UTC(2026, 6, 1, 8);
  const media = [];
  for (let k = 0; k < 36; k++) {
    const c = base[k % base.length];
    const land = k % 3 !== 0;
    media.push({ id: 'i' + k, kind: 'image', name: 'B', canvas: c, w: land ? 4000 : 3000, h: land ? 3000 : 4000, time: T0 + k * 200000 + (k > 18 ? 3600000 : 0), ...scoreImage(c, c.width, c.height), score: 0.3 + ((k * 37) % 60) / 100, hash: [k * 7919, k * 104729], avg: [(k * 37) % 255, (k * 91) % 255, (k * 53) % 255] });
    if (k % 9 === 4) media.push({ id: 'v' + k, kind: 'video', name: 'V', url: '', w: 1080, h: 1920, duration: 5, time: T0 + k * 200000 + 60000, score: 0.7, highlights: [{ t: 2.5, score: 1 }], avg: [120, 100, 90], hash: [k, k], luma: 0.5 });
  }
  const S0 = { look: 'natur', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'auto', seed: 4, target: 'reel' };
  const audit = (name, st) => {
    const pl = buildPlan({ an, media, settings: { ...S0, ...st }, overrides: { texts: [], stickers: [] } });
    const fmt = FORMATS[pl.resolved.format]; const outA = fmt.w / fmt.h;
    const W = 1080;
    let maxPan = 0, maxZoom = 0, flips = 0, calmShort = 0, pans = 0;
    const cuts = pl.clips.filter((c, i) => i > 0);
    const sp = [];
    let prevDir = null;
    for (const c of pl.clips) {
      const m = pl.media ? null : null;
      const mo = c.motion; if (!mo || c.contain || c.split || c.grid) { prevDir = null; continue; }
      const it = media[c.mediaIndex] || {};
      const srcA = it.w && it.h ? it.w / it.h : outA;
      const fw = srcA > outA ? outA / srcA : 1, fh = srcA > outA ? 1 : srcA / outA;
      const dur = Math.max(0.2, c.visEnd - c.visStart);
      const dispW = W / fw * ((mo.from.s + mo.to.s) / 2), dispH = (W / outA) / fh;
      const dx = Math.abs(mo.to.x - mo.from.x) * (1 - fw) / 2 * dispW, dy = Math.abs(mo.to.y - mo.from.y) * (1 - fh) / 2 * dispH;
      const v = Math.hypot(dx, dy) / dur * 1.28; // Spitze der Kurve
      if (dx + dy > 5) pans++;
      const zv = Math.abs(mo.to.s - mo.from.s) / dur;
      if (c.miniRew || c.rush) { prevDir = null; continue; }
      maxPan = Math.max(maxPan, v); maxZoom = Math.max(maxZoom, zv);
      sp.push(+v.toFixed(0));
      if (isCalmLabel(c.label) && c.end - c.start < pl.beatDur * 1.5 && !c.rush && !c.burst) calmShort++;
      if (prevDir && c.dir && isCalmLabel(c.label) && ((prevDir === 'left' && c.dir === 'right') || (prevDir === 'right' && c.dir === 'left') || (prevDir === 'up' && c.dir === 'down') || (prevDir === 'down' && c.dir === 'up'))) flips++;
      prevDir = c.dir;
    }
    // Geschwindigkeit der Kamera am Ende einer Einstellung und am Anfang der nächsten (Bildschirm-Pixel je Sekunde)
    const easeD = (c, u) => { const h = 1e-3; const f = (x) => (c.ease === 'in' ? x + 0.8 * x * x * (x - 1) : c.ease === 'out' ? x + 0.8 * x * (1 - x) * (1 - x) : easeMotion(x)); return (f(Math.min(1, u + h)) - f(Math.max(0, u - h))) / (Math.min(1, u + h) - Math.max(0, u - h)); };
    const speed = (c, u) => {
      const mo = c.motion; if (!mo || c.contain || c.split || c.grid || c.burst || c.rush || c.miniRew || c.stack || c.reveal || c.revealHit || c.loop || c.pre || c.leader || c.freezeAt != null) return null;
      const it = media[c.mediaIndex] || {}; if (it.kind === 'video') return null;
      const srcA = it.w && it.h ? it.w / it.h : outA;
      const fw = srcA > outA ? outA / srcA : 1, fh = srcA > outA ? 1 : srcA / outA;
      const dur = Math.max(0.2, c.visEnd - c.visStart);
      const dispW = W / fw, dispH = (W / outA) / fh;
      const px = Math.abs(mo.to.x - mo.from.x) * (1 - fw) / 2 * dispW + Math.abs(mo.to.y - mo.from.y) * (1 - fh) / 2 * dispH;
      const zp = Math.abs(mo.to.s - mo.from.s) * W * 0.5;
      return (px + zp) / dur * easeD(c, u);
    };
    const jumps = [];
    for (let i = 1; i < pl.clips.length; i++) {
      const a = pl.clips[i - 1], b2 = pl.clips[i];
      if (b2.sectionChange) continue;
      const va = speed(a, 1), vb = speed(b2, 0);
      if (va == null || vb == null || Math.max(va, vb) < 3) continue;
      jumps.push(Math.max(va, vb) / Math.max(1, Math.min(va, vb)));
      if (process.env.SDBG) (out._dbg = out._dbg || []).push(`${name} ${i} ${va.toFixed(0)}→${vb.toFixed(0)} A:${a.dir}/${(a.visEnd - a.visStart).toFixed(1)}s ${JSON.stringify(a.motion)} B:${b2.dir}/${(b2.visEnd - b2.visStart).toFixed(1)}s ${JSON.stringify(b2.motion)} ${media[a.mediaIndex].w}x${media[a.mediaIndex].h}/${media[b2.mediaIndex].w}x${media[b2.mediaIndex].h}`);
    }
    jumps.sort((x, y) => x - y);
    const q = (f) => (jumps.length ? +jumps[Math.min(jumps.length - 1, Math.floor(jumps.length * f))].toFixed(2) : 0);
    const D = pl.duration / 60;
    const fx = {}; for (const f of pl.fx) fx[f.type] = (fx[f.type] || 0) + 1;
    const tr = {}; for (const c of cuts) { const k = c.tin ? TR_NAMES[c.tin.type] || c.tin.type : '-'; tr[k] = (tr[k] || 0) + 1; }
    const perMin = Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, +(v / D).toFixed(1)]));
    out[name] = { D: +pl.duration.toFixed(1), clips: pl.clips.length, speedJumpMed: q(0.5), speedJumpP90: q(0.9), maxPanPxS: Math.round(maxPan), maxZoomPerS: +maxZoom.toFixed(3), pans, flipsCalm: flips, calmShort, fxPerMin: perMin, tr, notes: pl.notes.length };
    return out[name];
  };
  for (const [n, st] of [['story', { format: '9:16' }], ['energisch', { format: '9:16', variant: 'energisch' }], ['ruhig', { format: '9:16', variant: 'ruhig' }], ['film', { format: '16:9' }], ['beitrag', { format: '4:5', allMedia: 'off' }], ['musikvideo', { format: '9:16', mv: 'on' }]]) audit(n, st);
  for (const [n, o] of Object.entries(out)) {
    if (o.maxPanPxS > 420) fails.push(`${n}: Schwenk zu schnell (${o.maxPanPxS} px/s)`);
    if (o.flipsCalm > 2) fails.push(`${n}: ${o.flipsCalm} Hin-und-Her-Schwenks in ruhigen Teilen`);
    if (o.speedJumpMed > 1.45 || o.speedJumpP90 > 2.2) fails.push(`${n}: Kameratempo springt an Schnitten (Median ${o.speedJumpMed}×, 90 % ${o.speedJumpP90}×)`);
  }
  return { out, fails };
}, [wav, process.env.SDBG || '']);
console.log(JSON.stringify(res.out, null, 1));
console.log('Fehler:', res.fails.length ? res.fails.join(' | ') : 'keine');
await b.close();
