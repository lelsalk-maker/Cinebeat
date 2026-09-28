// Wärmeschutz beim Export (Bildzeit steigt ⇒ Pausen, beruhigt ⇒ wieder volle Fahrt) und Export-Eintrag im Leistungsprotokoll
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async () => {
  const fails = [];
  const g = new HeatGuard();
  let pause = 0;
  for (let i = 0; i < 200; i++) pause += g.frame(8 + (i % 3));
  if (pause) fails.push('Pause im Normalbetrieb');
  // gleichmäßig schwerer Inhalt (1,6×) ist keine Hitze
  for (let i = 0; i < 300; i++) pause += g.frame(14);
  if (pause) fails.push('Pause bei schwerem, aber normalem Inhalt');
  let hot = 0;
  for (let i = 0; i < 400; i++) hot += g.frame(26);
  if (!g.hot || !hot) fails.push('keine Drosselung bei Hitze');
  if (hot > 400 * 26 * 0.5 + 1) fails.push('Pause länger als die halbe Arbeit');
  for (let i = 0; i < 600; i++) g.frame(8);
  if (g.hot) fails.push('erholt sich nicht');
  g.close();
  // Export legt einen Eintrag an
  perfLog.clear();
  const c = demoScenes()[0];
  const media = [{ id: 'a', kind: 'image', name: 'a', canvas: c, w: c.width, h: c.height, time: 0, ...scoreImage(c, c.width, c.height) }];
  const sr = 44100, buf = new AudioBuffer({ length: sr * 3, numberOfChannels: 2, sampleRate: sr });
  const an = await analyzeAudio(buf);
  const plan = buildPlan({ an, media, settings: { format: '9:16', look: 'natur', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 1 }, overrides: { texts: [], stickers: [] } });
  plan.duration = Math.min(plan.duration, 1.5);
  const eng = new Engine(document.getElementById('c'));
  eng.setProject({ plan, media, audioBuffer: buf, size: { w: 144, h: 256 } });
  const support = await Engine.exportSupport({ w: 144, h: 256 }, 30, true);
  await eng.exportOffline({ size: { w: 144, h: 256 }, fps: 30, withAudio: !!support.audio, support });
  const e = perfLog.list().find((x) => x.kind === 'export');
  if (!e || !(e.frames > 30) || !(e.totalMs > 0) || e.drawMs == null) fails.push('Protokoll: ' + JSON.stringify(e));
  return { fails, hot, e };
});
console.log(r.fails.length ? 'FAIL ' + r.fails.join('; ') : 'OK heat');
if (r.fails.length) console.log(JSON.stringify(r));
await b.close();
process.exit(r.fails.length ? 1 : 0);
