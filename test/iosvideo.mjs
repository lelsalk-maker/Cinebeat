// Videos auf dem iPhone: Safari spielt ohne Antippen nichts ab, liefert ohne Wiedergabe keine Bilddaten und (ältere
// Geräte) kein WebCodecs. Nachgebildet im Browser. Dann müssen trotzdem alle Videos eingelesen werden (nicht als
// unbrauchbar aussortiert), alle im Film sein (auch Favoriten), nach einem Antippen in der Vorschau laufen und ihr
// Vorschaubild nachholen. Dazu der Planer: zwei Videos derselben Szene sind keine Doppel, der Gesamtfilm zeigt alle.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong, makeLongSong } from './wav.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = (process.env.OUT || '/tmp/cinebeat-test') + '/iosvideo';
mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/Song.wav`, { bpm: 122 });
makeLongSong(`${OUT}/long.wav`, { dur: 215 });
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fails = [];
// Testdateien: echte MP4-Videos (H.264 oder VP9) und Fotos
const gen = await b.newPage();
await gen.goto('http://127.0.0.1:8124/test/pipeline.html');
const files = await gen.evaluate(async () => {
  const out = [];
  const durs = [4, 9, 16, 6];
  for (let k = 0; k < durs.length; k++) {
    const port = k % 2 === 0, W = port ? 360 : 640, H = port ? 640 : 360, fps = 30, N = durs[k] * fps;
    const avcCfg = { codec: 'avc1.42E01E', width: W, height: H, bitrate: 600000, framerate: fps, avc: { format: 'avc' } };
    const avc = (await VideoEncoder.isConfigSupported(avcCfg)).supported;
    const mux = new Mp4Muxer({ video: { codec: avc ? 'avc' : 'vp9', width: W, height: H, fps }, audio: null });
    const enc = new VideoEncoder({ output: (c, m) => mux.addVideoChunk(c, m), error: () => {} });
    enc.configure(avc ? avcCfg : { codec: 'vp09.00.10.08', width: W, height: H, bitrate: 600000, framerate: fps });
    const c = new OffscreenCanvas(W, H), x = c.getContext('2d');
    for (let i = 0; i < N; i++) {
      const t = i / fps;
      x.fillStyle = `hsl(${(k * 47 + t * 40) % 360},55%,40%)`; x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff'; x.beginPath(); x.arc(W / 2 + Math.sin(t * 2) * W * 0.35, H / 2, 40, 0, 7); x.fill();
      const f = new VideoFrame(c, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / fps) });
      enc.encode(f, { keyFrame: i % 30 === 0 }); f.close();
      if (enc.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 5));
    }
    await enc.flush(); enc.close();
    const blob = mux.finalize();
    out.push([`Clip${k}.mp4`, await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); })]);
  }
  for (let i = 0; i < 12; i++) {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const x = c.getContext('2d');
    x.fillStyle = `hsl(${i * 29},60%,45%)`; x.fillRect(0, 0, 1200, 900);
    for (let j = 0; j < 30; j++) { x.fillStyle = `hsla(${i * 29 + j * 11},80%,${35 + j % 30}%,.8)`; x.beginPath(); x.arc((j * 131 + i * 50) % 1200, (j * 77 + i * 30) % 900, 20 + (j * 7) % 50, 0, 7); x.fill(); }
    out.push([`Foto${String(i).padStart(2, '0')}.jpg`, c.toDataURL('image/jpeg', 0.85)]);
  }
  return out;
});
await gen.close();
const paths = files.map(([n, d]) => { const p = `${OUT}/${n}`; writeFileSync(p, Buffer.from(d.split(',')[1], 'base64')); return p; });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.on('pageerror', (e) => fails.push('pageerror ' + e.message));
await page.addInitScript(() => {
  try { localStorage.setItem('cinebeat-level', 'bench'); } catch (e) { /* egal */ }
  // iPhone nachbilden: play() nur aus einer Geste oder auf einem schon so gestarteten Element; Bilddaten erst nach der Wiedergabe
  window.__g = false; window.__rej = 0;
  for (const ev of ['click', 'touchend', 'keydown']) window.addEventListener(ev, () => { window.__g = true; setTimeout(() => { window.__g = false; }, 0); }, true);
  const P = HTMLMediaElement.prototype, play0 = P.play, rs = Object.getOwnPropertyDescriptor(P, 'readyState');
  P.play = function () { if (!window.__g && !this.__ok) { window.__rej++; return Promise.reject(new DOMException('blocked', 'NotAllowedError')); } this.__ok = true; this.__played = true; return play0.call(this); };
  Object.defineProperty(P, 'readyState', { get() { const r = rs.get.call(this); return this.__played ? r : Math.min(r, 1); }, configurable: true });
  window.VideoDecoder = undefined;
});
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForSelector('.place');
await page.click('#addPlace');
await page.waitForFunction(() => CineBeat.S.ctx && CineBeat.S.ctx.kind === 'place' && document.getElementById('busy').hidden, null, { timeout: 60000 });
await page.fill('#placeName', 'Porto');
await page.setInputFiles('#fileMedia', paths);
await page.waitForFunction((n) => CineBeat.S.ctx.media.length === n && CineBeat.S.ctx.media.every((m) => !m.loading) && document.getElementById('busy').hidden, paths.length, { timeout: 300000 });
const bad = await page.evaluate(() => CineBeat.S.ctx.media.filter((m) => m.kind === 'video' && (m.bad || !m.duration || !m.thumb)).map((m) => m.name));
if (bad.length) fails.push('Videos beim Einlesen aussortiert/ohne Kachel: ' + bad.join(', '));
await page.evaluate(() => { CineBeat.S.ctx.media.filter((m) => m.kind === 'video').forEach((m, k) => { if (k % 2) m.fav = true; }); });
await page.click('[data-tab="music"]');
await page.setInputFiles('#fileMusic', `${OUT}/Song.wav`);
await page.waitForFunction(() => CineBeat.S.ctx.song && document.getElementById('busy').hidden && document.querySelector('#flowStage [data-flow="cut"]'), null, { timeout: 120000 });
await page.click('#flowStage [data-flow="cut"]');
await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden && document.getElementById('flowStage').hidden, null, { timeout: 300000 });
const missing = await page.evaluate(() => {
  const ids = new Set(CineBeat.S.plan.clips.flatMap((c) => (c.split ? c.split.ids : c.stack ? c.stack.ids : [c.mediaId])));
  return CineBeat.S.ctx.media.filter((m) => m.kind === 'video' && !ids.has(m.id)).map((m) => m.name + (m.fav ? '♥' : ''));
});
if (missing.length) fails.push('Videos nicht im Film: ' + missing.join(', '));
// ein Antippen (Abspielen) – danach laufen alle Videos mit, auch ohne weitere Geste
// warten, bis die App mit dem Feinschliff im Hintergrund fertig ist (der Plan bleibt 2 s gleich)
await page.waitForFunction(() => { const p = CineBeat.engine.plan; if (window.__lp !== p) { window.__lp = p; window.__lpT = performance.now(); } return performance.now() - window.__lpT > 2000; }, null, { timeout: 120000, polling: 200 });
await page.click('#playBtn');
await page.waitForTimeout(1500);
const songNow = await page.evaluate(() => CineBeat.S.ctx.song && CineBeat.S.ctx.song.name);
if (songNow !== 'Song') fails.push('eigener Song ersetzt durch: ' + songNow);
await page.waitForTimeout(300);
const pv = await page.evaluate(async () => {
  const eng = CineBeat.engine, p = eng.plan, vids = CineBeat.S.ctx.media.filter((m) => m.kind === 'video'), res = [];
  eng.pause();
  const keys = p.clips.map((c) => [c.mediaId, c.start]);
  for (const [mid, st] of keys) {
    // die App kann zwischendurch neu schneiden (z. B. nach der Videoanalyse): immer den aktuellen Plan nehmen
    const c = eng.plan.clips.find((x) => x.mediaId === mid && Math.abs(x.start - st) < 0.01);
    const m = c && vids.find((v) => v.id === c.mediaId);
    if (!m || c.split || c.loop || c.visEnd - c.visStart < 1) continue;
    await eng.play(c.visStart + 0.05);
    const smp = [], t0 = performance.now();
    while (performance.now() - t0 < Math.min(1200, (c.visEnd - c.visStart - 0.2) * 1000)) {
      await new Promise((r) => setTimeout(r, 80));
      for (const s of eng.slots.values()) if (s.clip === c && s.video) smp.push([performance.now(), s.video.currentTime]);
    }
    eng.pause();
    const a = smp[0], z = smp[smp.length - 1];
    const sl = [...eng.slots.values()].find((s) => s.clip === c);
    res.push({ rate: c.rp ? 0.5 : c.rate || 1, name: m.name, dt: a ? (z[0] - a[0]) / 1000 : 0, dv: a ? z[1] - a[1] : 0, n: smp.length, info: `${c.start.toFixed(1)}-${c.end.toFixed(1)} vis ${c.visStart.toFixed(1)}-${c.visEnd.toFixed(1)} ${c.role} slot=${!!sl} ready=${sl && sl.ready} failed=${sl && sl.failed} v=${!!(sl && sl.video)} rs=${sl && sl.video && sl.video.readyState} rej=${window.__rej}` });
  }
  return { res, posters: vids.filter((m) => m.poster).length, n: vids.length };
});
for (const x of pv.res) if (!(x.dv > x.dt * x.rate * 0.6) || x.dt < 0.5) fails.push(`${x.name} läuft in der Vorschau nicht (${x.dv.toFixed(2)} s in ${x.dt.toFixed(2)} s, n=${x.n}) ${x.info}`);
if (pv.res.length < 3) fails.push('zu wenige Video-Einstellungen geprüft: ' + pv.res.length);
if (pv.posters < new Set(pv.res.map((x) => x.name)).size) fails.push(`Vorschaubilder nicht nachgeholt (${pv.posters}/${pv.n})`);
await page.close();
// Planer: Videos derselben Szene sind keine Doppel; der Gesamtfilm zeigt alle Videos jedes Orts
{
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:8124/test/pipeline.html');
  const r = await p.evaluate(async (b64) => {
    const f = [], base = demoScenes(), T0 = new Date(2026, 4, 3, 9, 0).getTime();
    const vid = (id, t, d = 25) => ({ id, kind: 'video', name: id, w: 1920, h: 1080, duration: d, time: t, score: 0.45, sharp: 0.6, color: 0.5, motion: 0.05, luma: 0.45, avg: [120, 120, 110], highlights: [{ t: d * 0.4, score: 0.6 }], hash: [77, 99], focus: [0.5, 0.45] });
    const vs = [vid('a', T0), vid('b', T0 + 60000)];
    markDuplicates(vs);
    if (vs.some((m) => m.dupOf)) f.push('Video als Doppel markiert');
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const an = await analyzeAudio(await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer));
    const mk = (n, nv, day, pre) => { const m = []; for (let i = 0; i < n; i++) { const c = base[i % base.length]; m.push({ id: pre + i, kind: 'image', name: 'I' + i, canvas: c, w: 4032, h: 3024, time: T0 + day * 86400e3 + i * 5 * 60000, ...scoreImage(c, c.width, c.height), score: 0.4 + ((i * 37 + day * 11) % 50) / 100, hash: [i * 7919 + day, i * 104729] }); } for (let k = 0; k < nv; k++) m.push(vid(pre + 'v' + k, T0 + day * 86400e3 + (k * 27 + 3) * 60000, [25, 12, 40, 7, 18, 30][k])); return m; };
    const chapters = ['A', 'B', 'C'].map((t, k) => ({ title: t, media: mk([50, 20, 60][k], 6, k * 2, 'c' + k + '_') }));
    const all = chapters.flatMap((c) => c.media);
    const plan = buildPlan({ an, media: all, settings: { format: '16:9', look: 'auto', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 3, title: 'X', menge: 'auto' }, overrides: { texts: [], stickers: [] }, chapters });
    const ids = new Set(plan.clips.filter((c) => !['recap', 'rush', 'leader'].includes(c.role)).flatMap((c) => (c.split ? c.split.ids : [c.mediaId])));
    const miss = all.filter((m) => m.kind === 'video' && !ids.has(m.id)).map((m) => m.id);
    if (miss.length) f.push('Gesamtfilm ohne Videos: ' + miss.join(', '));
    for (const it of planAudit(plan, all, an).slice(0, 3)) f.push(`Gesamtfilm @${it.t}s ${it.msg}`);
    return { f };
  }, (await import('node:fs')).readFileSync(`${OUT}/long.wav`).toString('base64'));
  fails.push(...r.f);
  await p.close();
}
await b.close();
console.log(fails.length ? `FAIL ${fails.length}\n` + fails.slice(0, 20).join('\n') : 'OK iosvideo');
process.exit(fails.length ? 1 : 0);
