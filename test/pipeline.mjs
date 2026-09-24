import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/struct.wav`, { bpm: 124 });
const settings = JSON.parse(process.argv[2] || '{}');
const W = +(process.env.W || 180), H = +(process.env.H || 320);
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.text()); });
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const wav = readFileSync(`${OUT}/struct.wav`).toString('base64');
const res = await p.evaluate(async ({ b64, settings, W, H }) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer);
  const an = await analyzeAudio(buf);
  const scenes = demoScenes();
  if (settings.many) for (let k = 0; k < 6; k++) { const src = scenes[k]; const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.filter = `hue-rotate(${60 + k * 45}deg)`; x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); x.filter = 'none'; x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = 'rgba(255,255,255,.85)'; x.font = `bold ${c.width / 8}px sans-serif`; x.fillText(String(k + 7), c.width * 0.1, c.height * 0.55); scenes.push(c); }
  const media = scenes.map((c, i) => ({ id: 'd' + i, kind: 'image', name: 'Bild ' + i, canvas: c, w: c.width, h: c.height, time: i, ...scoreImage(c, c.width, c.height) }));
  // Testvideo erzeugen
  const vc = document.createElement('canvas'); vc.width = 640; vc.height = 360; const vx = vc.getContext('2d');
  const vstream = vc.captureStream(30);
  let actx = null;
  if (settings.voice) { actx = new AudioContext(); const osc = actx.createOscillator(); osc.frequency.value = 880; const og = actx.createGain(); og.gain.value = 0.5; const d = actx.createMediaStreamDestination(); osc.connect(og).connect(d); osc.start(); vstream.addTrack(d.stream.getAudioTracks()[0]); }
  const rec = new MediaRecorder(vstream, { mimeType: settings.voice ? 'video/webm;codecs=vp8,opus' : 'video/webm' }); const ch = []; rec.ondataavailable = (e) => ch.push(e.data);
  const done = new Promise((r) => (rec.onstop = r)); rec.start(); const t0 = performance.now();
  await new Promise((res) => { const f = () => { const t = (performance.now() - t0) / 1000; vx.fillStyle = `hsl(${t * 90},60%,45%)`; vx.fillRect(0, 0, 640, 360); vx.fillStyle = '#fff'; vx.font = 'bold 60px sans-serif'; vx.fillText('VIDEO ' + t.toFixed(1), 40, 200); if (t < 4) requestAnimationFrame(f); else { rec.stop(); res(); } }; f(); });
  await done;
  const vurl = URL.createObjectURL(new Blob(ch, { type: 'video/webm' }));
  const vv = makeVideoEl(); vv.src = vurl; await waitEvent(vv, ['loadedmetadata'], ['error'], 5000);
  let vdur = vv.duration; if (!isFinite(vdur)) { vv.currentTime = 1e7; await waitEvent(vv, ['durationchange', 'seeked'], [], 3000); vdur = vv.duration; }
  await seekVideo(vv, 1);
  const sv = await scoreVideo(vv, vdur);
  const vitem = { id: 'v0', kind: 'video', name: 'Video', url: vurl, w: 640, h: 360, duration: vdur, time: 1.5, poster: null, ...sv };
  if (settings.voice) { vitem.audio = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await new Blob(ch).arrayBuffer()); vitem.sound = 1; vitem.fav = true; }
  media.splice(2, 0, vitem);
  const s = { format: '9:16', look: 'auto', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', split: 'auto', title: 'Lissabon', subtitle: 'Mai 2026', seed: 7, ...settings };
  const plan = buildPlan({ an, media, settings: s, trip: settings.trip || null, overrides: { texts: settings.texts || [], stickers: settings.stickers || [] } });
  const eng = new Engine(document.getElementById('c'));
  
  eng.setProject({ plan, media, audioBuffer: buf, size: { w: W, h: H } });
  const fps = 30;
  const support = await Engine.exportSupport({ w: W, h: H }, fps, true);
  const t0e = performance.now();
  const out = await eng.exportOffline({ size: { w: W, h: H }, fps, withAudio: true, support });
  const secs = (performance.now() - t0e) / 1000;
  // Zurücklesen
  const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(out.blob); document.body.appendChild(v);
  const ok = await new Promise((r) => { v.onloadedmetadata = () => r(true); v.onerror = () => r('ERR ' + (v.error && v.error.message)); });
  if (ok !== true) return { err: ok };
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const shots = [];
  const step = +(settings.step || 0.5);
  for (let t = 0.0; t < v.duration - 0.02; t += step) { v.currentTime = t + 0.001; await new Promise((r) => (v.onseeked = r)); x.drawImage(v, 0, 0); shots.push({ t: t.toFixed(2), img: c.toDataURL('image/jpeg', 0.8) }); }
  const audio = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await out.blob.arrayBuffer());
  // 880-Hz-Anteil (Originalton) je 0,5 s messen
  const tone = [];
  if (settings.voice) {
    const d = audio.getChannelData(0), sr = audio.sampleRate, N = Math.floor(sr * 0.1);
    for (let t = 0; t < audio.duration - 0.1; t += 0.5) {
      const o = Math.floor(t * sr); let re = 0, im = 0, en = 0;
      for (let i = 0; i < N; i++) { const x = d[o + i] || 0; const w = 2 * Math.PI * 880 * i / sr; re += x * Math.cos(w); im += x * Math.sin(w); en += x * x; }
      tone.push(t.toFixed(1) + ':' + (2 * Math.hypot(re, im) / N).toFixed(2));
    }
  }
  return { voice: JSON.stringify((plan.voice || []).map((v) => [v.t0.toFixed(2), v.t1.toFixed(2), v.src.toFixed(2)])), tone: tone.join(' '), notes: plan.notes, resolved: JSON.stringify(plan.resolved), codec: out.codec, audio: out.audio, audioDur: audio.duration.toFixed(2), size: out.blob.size, dur: v.duration, D: plan.duration, renderSec: secs.toFixed(1), fpsRender: (plan.duration * fps / secs).toFixed(1), intro: plan.intro, outro: plan.outro, clips: plan.clips.map((c) => `${c.start.toFixed(2)}${c.loop ? 'L' : ''}${c.split ? 'S' : ''}[${c.label[0]}${c.tin && c.tin.type ? ' t' + c.tin.type : ''}]#${c.mediaId}`).join(' '), shots };
}, { b64: wav, settings, W, H });
if (res.err) { console.log(res.err); process.exit(1); }
const name = process.env.NAME || 'pipe';
const { shots, ...info } = res;
console.log(info);
const p2 = await b.newPage({ viewport: { width: 1500, height: 900 } });
await p2.setContent(`<body style="margin:0;background:#111;display:flex;flex-wrap:wrap;gap:4px;padding:4px;font:11px sans-serif;color:#fff">${shots.map((s) => `<div><img src="${s.img}" style="height:${H > W ? 200 : 110}px;display:block"><span>${s.t}s</span></div>`).join('')}</body>`);
await p2.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
await b.close();
