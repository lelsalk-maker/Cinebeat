import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
console.log(await p.evaluate(async () => {
  const an = await analyzeAudio(await synthDemoSong());
  const mk = (pfx, n) => Array.from({ length: n }, (_, i) => ({ id: pfx + i, kind: 'image', w: 1600, h: 1000, time: i, score: 0.5 + (i % 5) / 10, name: pfx + i }));
  const chapters = [{ title: 'Porto', media: mk('p', 8) }, { title: 'Lissabon', media: mk('l', 16) }, { title: 'Algarve', media: mk('a', 8) }];
  const media = chapters.flatMap((c) => c.media);
  const plan = buildPlan({ an, media, chapters, settings: { format: '9:16', look: 'natur', pace: 'mittel', intro: 'kinetic', outro: 'freeze', length: 'full', songStart: 'start', title: 'Portugal', subtitle: 'Mai 2026', seed: 3 } });
  const starts = plan.clips.filter((c) => c.chapter).map((c) => c.chapter + '@' + c.start.toFixed(1));
  const own = plan.clips.filter((c) => !c.loop).map((c) => c.mediaId[0]).join('');
  return { D: plan.duration.toFixed(1), starts, order: own, kinetic: plan.overlays.filter((o) => o.type === 'kinetic').map((o) => o.text + '@' + o.start.toFixed(1)) };
}));
await b.close();
