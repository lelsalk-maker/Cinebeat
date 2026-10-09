// Originalton-Momente: die Ton-Analyse erkennt Lachen, Jubel und einen kurzen Ausruf und verwirft Wind, Dauerreden,
// leises Gemurmel und Musik im Video. Der Planer setzt einen Moment nur, wo der Song Platz lässt (Stopp, ruhiger Teil
// ohne Gesang, Ausklang) – nie im Drop/Refrain, nie über Gesang, höchstens wenige je Film, nie erzwungen.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(() => {
  const sr = 48000;
  let seed = 17; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const mkBuf = (dur, fill) => { const d = new Float32Array(Math.floor(dur * sr)); fill(d); return { sampleRate: sr, length: d.length, numberOfChannels: 1, duration: dur, getChannelData: () => d }; };
  const room = (d, amp = 0.004) => { for (let i = 0; i < d.length; i++) d[i] += amp * rnd(); };
  // stimmhafte Silbe: Grundton mit Obertönen, Formanten grob über die Gewichtung (a-Laut), weicher Ein-/Ausklang
  const syl = (d, t0, len, f0a, f0b, amp, breath = 0.15) => {
    const i0 = Math.floor(t0 * sr), n = Math.floor(len * sr);
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
      const u = i / n, f0 = f0a + (f0b - f0a) * u;
      ph += (2 * Math.PI * f0) / sr;
      let v = 0;
      for (let h = 1; h <= 12; h++) { const fh = f0 * h, w = Math.exp(-((fh - 750) ** 2) / 2e5) + 0.6 * Math.exp(-((fh - 1250) ** 2) / 3e5) + 0.15; v += (w * Math.sin(h * ph)) / h; }
      const env = Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.7;
      d[i0 + i] += amp * env * (v * 0.6 + breath * rnd());
    }
  };
  const cases = {
    lachen: mkBuf(6, (d) => { room(d); for (let k = 0; k < 6; k++) syl(d, 2 + k * 0.19, 0.12, 290 - k * 8, 270 - k * 8, 0.35, 0.35); }),
    ausruf: mkBuf(6, (d) => { room(d); for (let k = 0; k < 4; k++) syl(d, 0.3 + k * 0.32, 0.18, 150, 140, 0.06); syl(d, 3, 0.55, 230, 330, 0.4); }),
    jubel: mkBuf(6, (d) => { room(d); const a = Math.floor(2 * sr), n = Math.floor(1.6 * sr); let lp = 0; for (let i = 0; i < n; i++) { const r = rnd(); const hp = r - lp; lp = 0.7 * lp + 0.3 * r; const env = Math.min(1, i / (0.08 * sr)) * Math.min(1, (n - i) / (0.4 * sr)); d[a + i] += 0.35 * env * hp * (0.6 + 0.4 * Math.abs(Math.sin(i / sr * 31))); } syl(d, 2.2, 0.5, 300, 360, 0.25); }),
    wind: mkBuf(6, (d) => { let lp = 0, lp2 = 0; for (let i = 0; i < d.length; i++) { lp = 0.995 * lp + 0.005 * rnd(); lp2 = 0.98 * lp2 + 0.02 * lp; d[i] = 6 * lp2 * (1 + 0.8 * Math.sin(i / sr * 1.3)) * (i > 2 * sr && i < 3.5 * sr ? 3 : 1); } }),
    reden: mkBuf(8, (d) => { room(d); let t = 0.5; while (t < 7.4) { syl(d, t, 0.13 + Math.abs(rnd()) * 0.08, 150 + rnd() * 30, 140 + rnd() * 30, 0.2); t += 0.2 + Math.abs(rnd()) * 0.12; } }),
    gemurmel: mkBuf(6, (d) => { room(d, 0.01); for (let k = 0; k < 5; k++) syl(d, 1 + k * 0.6, 0.15, 140, 130, 0.02); }),
    musik: mkBuf(8, (d) => { room(d); const ch = [[220, 277, 330], [196, 247, 294], [175, 220, 262]]; for (let b2 = 0; b2 < 8; b2++) { const c = ch[b2 % 3], i0 = Math.floor(b2 * sr); for (let i = 0; i < sr; i++) { let v = 0; for (const f of c) v += Math.sin((2 * Math.PI * f * (i0 + i)) / sr); d[i0 + i] += 0.08 * v; } } }),
  };
  const out = {};
  for (const [k, buf] of Object.entries(cases)) { const s = soundMoments(buf); out[k] = { music: s.music, list: s.list }; }
  return out;
});
const fails = [];
for (const [k, x] of Object.entries(r)) console.log(k.padEnd(9), JSON.stringify(x));
const arts = (k) => r[k].list.map((e) => e[2]);
if (!arts('lachen').includes('lachen')) fails.push('Lachen nicht erkannt');
if (!arts('ausruf').includes('ruf')) fails.push('Ausruf nicht erkannt');
if (!arts('jubel').some((a) => a === 'jubel' || a === 'ruf')) fails.push('Jubel nicht erkannt');
for (const k of ['wind', 'reden', 'gemurmel', 'musik']) if (r[k].list.length) fails.push(`${k}: falscher Moment ${JSON.stringify(r[k].list)}`);
if (arts('ausruf').length > 1) fails.push('Ausruf: das Reden davor zählt mit');
// Planer: Momente nur, wo der Song Platz lässt
const { makeStructuredSong } = await import('./wav.mjs');
const { readFileSync, mkdirSync } = await import('node:fs');
mkdirSync('/tmp/cinebeat-test', { recursive: true });
makeStructuredSong('/tmp/cinebeat-test/otone.wav', { bpm: 112 });
const wav = readFileSync('/tmp/cinebeat-test/otone.wav').toString('base64');
const pl = await p.evaluate(async (b64) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const an = await analyzeAudio(await new OfflineAudioContext(1, 1, 44100).decodeAudioData(u.buffer));
  const base = demoScenes(), T0 = Date.UTC(2026, 4, 1, 9);
  const media = [];
  for (let i = 0; i < 16; i++) { const c = base[i % base.length]; media.push({ id: 'p' + i, kind: 'image', name: 'P' + i, canvas: c, w: 4000, h: 3000, time: T0 + i * 9 * 60000, ...scoreImage(c, c.width, c.height), hash: [i * 7919 + 1, i * 104729 + 3], avg: [90 + i * 7, 120, 150 - i * 4] }); }
  const vid = (id, k, d, lively, snd) => ({ id, kind: 'video', name: id, w: 1920, h: 1080, duration: d, time: T0 + k * 36e5, score: 0.6, sharp: 0.6, color: 0.5, motion: lively ? 0.14 : 0.015, luma: 0.45, avg: [120, 115, 105], highlights: [{ t: d * 0.45, score: 0.7 }], hits: [], hash: [k * 31 + 1, k * 77 + 3], focus: [0.5, 0.45], fps: 30, snd });
  const evs = (d) => ({ music: false, list: [[1.2, 2.3, 'lachen', 0.95], [d * 0.5, d * 0.5 + 0.9, 'ruf', 0.85], [d - 2.4, d - 1.4, 'lachen', 0.9]] });
  media.push(vid('vA', 0.4, 14, false, evs(14)), vid('vB', 1.4, 12, false, evs(12)), vid('vC', 2.2, 10, true, evs(10)), vid('vD', 3.1, 16, false, evs(16)));
  const S0 = { format: '16:9', look: 'natur', pace: 'auto', intro: 'auto', outro: 'auto', length: 'full', songStart: 'start', frame: 'auto', seed: 5, effekte: 'schlicht', allMedia: 'on' };
  const plan = (x, a = an) => buildPlan({ an: a, media: media.map((m) => ({ ...m })), settings: { ...S0, ...x }, overrides: { texts: [], stickers: [] } });
  const look = (pl, a = an) => (pl.voice || []).filter((v) => v.auto).map((v) => ({ t0: +v.t0.toFixed(2), t1: +v.t1.toFixed(2), art: v.auto, room: +songRoom(a, pl.win.start + v.t0 + 0.02, pl.win.start + v.t1 - 0.15, pl.win.start + pl.duration).toFixed(2), sec: sectionAt(a, pl.win.start + (v.t0 + v.t1) / 2).label, rate: (pl.clips.find((c) => c.mediaId === v.mediaId && c.visStart <= v.t0 + 0.13 && c.visEnd >= v.t1 - 0.01) || {}).rate }));
  const on = plan({}), off = plan({ otone: 'off' }), story = plan({ format: '9:16', target: 'story', length: 'auto' });
  const sung = { ...an, vocal: Float32Array.from(an.vocal || an.beats, () => 0.8) };
  const withVocals = plan({}, sung);
  const muted = buildPlan({ an, media: media.map((m) => ({ ...m, sound: -1 })), settings: S0, overrides: { texts: [], stickers: [] } });
  return { on: look(on), off: look(off), story: look(story), sung: look(withVocals, sung), muted: look(muted), notes: on.notes.filter((n) => /Originalton/.test(n)), audit: planAudit(on, media, an).length };
}, wav);
console.log('Planer:', JSON.stringify(pl));
if (!pl.on.length) fails.push('kein Originalton-Moment, obwohl ruhige Stellen und klare Momente da sind');
for (const v of [...pl.on, ...pl.story]) {
  if (!(v.room > 0)) fails.push(`Moment ohne Platz im Song bei ${v.t0} (${v.sec})`);
  if (v.sec === 'drop' || v.sec === 'chorus') fails.push(`Moment im ${v.sec} bei ${v.t0}`);
  if (v.rate !== 1) fails.push(`Video nicht in Echtzeit beim Moment ${v.t0} (rate ${v.rate})`);
}
for (const set of [pl.on, pl.story]) for (let i = 1; i < set.length; i++) if (set[i].t0 - set[i - 1].t0 < 8) fails.push('Momente zu dicht');
if (pl.story.length > 2) fails.push('Story: zu viele Momente');
if (pl.off.length) fails.push('„Nur Musik“ mit Originalton');
if (pl.sung.length) fails.push('Originalton über Gesang');
if (pl.muted.length) fails.push('stumm gestelltes Video mit Originalton');
if (pl.audit) fails.push('planAudit ' + pl.audit);
console.log('Fehler:', fails.length ? fails.join(' | ') : 'keine');
await b.close();
process.exit(fails.length ? 1 : 0);
