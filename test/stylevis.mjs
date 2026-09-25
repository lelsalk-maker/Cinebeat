// Stil-Mittel in der App: Bedienung (Schwarzweiß → Farbe, Schlagzeug, Im Film) und Standbilder der Momente.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const URL_ = process.env.APP || 'http://127.0.0.1:8123/index.html';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [], fails = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(URL_);
await page.waitForSelector('.place', { timeout: 30000 });
await page.click('.place');
const idle = () => page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
const settle = async () => { await page.waitForTimeout(700); await idle(); };
const shot = async (t, name) => { await page.evaluate((tt) => CineBeat.engine.renderStill(tt), t); await page.waitForTimeout(1200); await page.locator('#monitor').screenshot({ path: `${OUT}/style_${name}.png` }); };
await idle();
await page.click('[data-tab="style"]'); await page.evaluate(() => document.querySelectorAll('details.group').forEach((d) => { d.open = true; }));
let info = await page.evaluate(() => ({ r: CineBeat.S.plan.resolved, notes: CineBeat.S.plan.notes.filter((n) => /Stil|Schwarzweiß|Echo|Polaroid/.test(n)), color: document.getElementById('colorHint').textContent, drum: document.getElementById('drumHint').textContent, pressed: [...document.querySelectorAll('#fxChips [aria-pressed="true"]')].map((b) => b.dataset.fx), knockHidden: document.getElementById('fxChapKnock').hidden }));
console.log('Auto:', JSON.stringify({ color: info.r.color, accent: info.r.accent, echo: info.r.echo, stack: info.r.stack, mini: info.r.mini, drift: info.r.drift, parallax: info.r.parallax, notes: info.notes, color: info.color, drum: info.drum, pressed: info.pressed }));
if (!info.knockHidden) fails.push('Kapitel-Schalter im Ortsfilm sichtbar');
// Farbe vom Motiv aus + Stapel + Echo + Mini-Rewind, im ganzen Song als Reel
await page.click('[data-tab="music"]').catch(() => {});
await page.click('#lenChips [data-v="full"]'); await settle();
await page.click('[data-tab="style"]'); await page.evaluate(() => document.querySelectorAll('details.group').forEach((d) => { d.open = true; }));
await page.click('#targetChips [data-v="reel"]'); await settle();
await page.click('#colorChips [data-v="bloom"]'); await settle();
for (const k of ['stack', 'echo', 'mini']) {
  for (let n = 0; n < 2 && (await page.evaluate((kk) => CineBeat.S.ctx.rec.settings[kk], k)) !== 'on'; n++) { await page.click(`#fxChips [data-fx="${k}"]`); await settle(); }
}
await page.click('#drumChips [data-v="kicksnare"]'); await settle();
info = await page.evaluate(() => { const p = CineBeat.S.plan, s = CineBeat.S.ctx.rec.settings; return { s: [s.color, s.stack, s.echo, s.mini, s.accent], col: p.colorFx, stack: p.clips.filter((c) => c.stack).map((c) => [c.start, c.end, c.stack.times]), echo: p.clips.filter((c) => c.echo).map((c) => c.start), mini: p.clips.filter((c) => c.miniRew).map((c) => c.start), drift: p.clips.filter((c) => c.tin && c.tin.type === 13).map((c) => [c.start, c.tin.dur]), D: p.duration, sections: p.sections.map((x) => x.label + '@' + x.start.toFixed(1)).join(' ') }; });
console.log('Gewählt:', JSON.stringify(info));
if (info.s.join() !== 'bloom,on,on,on,kicksnare') fails.push('Einstellungen ' + info.s.join());
if (info.col.length) {
  const f = info.col[0];
  await shot(f.hit - 0.6, 'bw');
  await shot(f.hit + f.dur * 0.45, 'bloom');
  await shot(f.hit + f.dur + 0.3, 'color');
} else fails.push('kein Farbmoment in der App');
if (info.stack.length) { const [a, z, times] = info.stack[0]; await shot(times[1] - 0.1, 'stack_fall'); await shot(z - 0.2, 'stack_end'); } else console.log('kein Stapel (zu wenig Material/ruhiger Teil)');
if (info.echo.length) await shot(info.echo[0] + 0.06, 'echo');
if (info.mini.length) await shot(info.mini[1] + 0.05, 'mini');
if (info.drift.length) await shot(info.drift[0][0], 'drift');
// Standbild ohne Fehler und nicht schwarz
const lum = await page.evaluate(() => { const c = document.createElement('canvas'); const src = CineBeat.engine.canvas; c.width = 64; c.height = 112; const x = c.getContext('2d'); CineBeat.engine.drawAt(CineBeat.engine.t, 'still'); x.drawImage(src, 0, 0, 64, 112); const d = x.getImageData(0, 0, 64, 112).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; });
if (lum < 8) fails.push('Bild schwarz');
console.log('Fehler:', [...fails, ...errs].length ? [...fails, ...errs].join(' | ') : 'keine');
await browser.close();
