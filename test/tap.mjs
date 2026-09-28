// Im Takt mittippen: Tipps rasten auf Schläge, dort wird geschnitten (mit Akzent), Cutter verschiebt sie nicht
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.APP || 'http://127.0.0.1:8123/index.html');
await page.waitForSelector('.place');
await page.click('.place');
await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 120000 });
const fails = [];
await page.click('#tapBtn');
await page.waitForTimeout(300);
if (await page.evaluate(() => document.getElementById('tapBar').hidden)) fails.push('Tippleiste fehlt');
// nach dem Vorspann (dort gibt es nur Akzente): drei Tipps im Abstand von gut einer Sekunde
await page.waitForFunction(() => { const p = CineBeat.S.plan, h = p.clips.find((c) => c.role === 'hook'); return CineBeat.engine.t > (h ? h.end : 0) + 0.3; }, null, { timeout: 30000 });
const sb = await page.locator('#screen').boundingBox();
for (let k = 0; k < 3; k++) { await page.waitForTimeout(1100); await page.mouse.click(sb.x + 100, sb.y + 200); }
const shown = await page.evaluate(() => document.getElementById('tapCount').textContent);
const open = await page.evaluate(() => !document.getElementById('tapBar').hidden);
// läuft der Film unter Last schon zu Ende, übernimmt die App die Tipps selbst
if (open) { if (!/3 Momente/.test(shown)) fails.push('Zähler: ' + shown); await page.click('#tapDone'); }
await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 60000 });
await page.waitForTimeout(500);
const r = await page.evaluate(() => {
  const S = CineBeat.S, taps = S.ctx.rec.overrides.taps || [], an = S.ctx.song.an, pl = S.plan;
  const onBeat = taps.every((t) => an.beats.some((x) => Math.abs(x - t) < 1e-3));
  const rel = taps.map((t) => t - pl.win.start);
  const cutAt = rel.map((t) => pl.clips.some((c) => Math.abs(c.start - t) < 0.02));
  const acc = rel.map((t) => pl.fx.some((f) => f.tap && Math.abs(f.start - t) < 0.01));
  return { rel: rel.map((t) => +t.toFixed(2)), starts: pl.clips.map((c) => +c.start.toFixed(2) + (c.vid ? "v" : "") + (c.role ? c.role[0] : "") + (c.pre ? "p" : "") + (c.leader ? "l" : "")).join(" "), n: taps.length, onBeat, cutAt, acc, note: pl.notes.some((n) => /Mitgetippt/.test(n)), bar: document.getElementById('tapBar').hidden };
});
if (r.n !== 3) fails.push('gespeichert ' + r.n);
if (!r.onBeat) fails.push('nicht auf dem Schlag');
if (r.cutAt.some((x) => !x)) fails.push('kein Schnitt am Tipp ' + JSON.stringify(r.cutAt));
if (r.acc.some((x) => !x)) fails.push('kein Akzent');
if (!r.note) fails.push('keine Notiz');
if (!r.bar) fails.push('Leiste bleibt offen');
// Zurücksetzen löscht die Tipps
await page.click('#levelChips [data-level="bench"]');
await page.click('[data-tab="cut"]');
await page.click('#resetCuts');
await page.waitForTimeout(800);
if (await page.evaluate(() => (CineBeat.S.ctx.rec.overrides.taps || []).length)) fails.push('Zurücksetzen lässt Tipps stehen');
if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
console.log(fails.length ? 'FAIL ' + fails.join('; ') : 'OK tap');
if (fails.length) console.log(JSON.stringify(r));
await b.close();
process.exit(fails.length ? 1 : 0);
