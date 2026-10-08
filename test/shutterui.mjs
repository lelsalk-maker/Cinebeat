// Kino-Rollladen in der App: Einstieg wählbar, eigener Vorspann (Vorspann-Wahl gesperrt), Regie nennt ihn,
// Vorschau spielt mit Geräuschen ohne Fehler, Export nimmt die Geräusche auch ohne Song mit.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL_ = process.env.APP || 'http://127.0.0.1:8123/index.html';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.addInitScript(() => { try { localStorage.setItem('cinebeat-level', 'bench'); } catch (e) { /* egal */ } });
const errs = [], fails = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(URL_);
await page.waitForSelector('.place', { timeout: 30000 });
await page.click('.place');
const idle = () => page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
await idle();
await page.click('[data-tab="flow"]');
await page.evaluate(() => document.querySelectorAll('details.group').forEach((d) => { d.open = true; }));
await page.click('#introChips [data-v="shutter"]');
await page.waitForTimeout(700); await idle();
const info = await page.evaluate(() => {
  const p = CineBeat.S.plan;
  return {
    intro: p.intro, setting: CineBeat.S.ctx.rec.settings.intro, wall: !!(p.clips[0].split && p.clips[0].split.orient === 'wall'),
    sfx: CineBeat.engine.hasSfx,
    preLocked: [...document.querySelectorAll('#preChips [data-v]')].filter((b) => b.dataset.v !== 'off').every((b) => b.disabled),
    regie: document.getElementById('regieDecisions').textContent, notes: p.notes.some((n) => /Kino-Rollladen/.test(n)),
  };
});
console.log(JSON.stringify(info));
if (info.setting !== 'shutter' || info.intro !== 'shutter') fails.push('Einstieg nicht übernommen');
if (!info.wall || !info.sfx) fails.push('Wand/Geräusche fehlen');
if (!info.preLocked) fails.push('Vorspann nicht gesperrt');
if (!/Kino-Rollladen/.test(info.regie) || !info.notes) fails.push('Regie nennt den Einstieg nicht');
// Vorschau: ein paar Sekunden abspielen (Projektor, erster Zug)
await page.click('#playBtn');
await page.waitForTimeout(4500);
const t = await page.evaluate(() => { const e = CineBeat.engine; const t = e.t; e.pause(); return t; });
if (!(t > 2)) fails.push('Vorschau läuft nicht (' + t + ')');
// Export ohne Song: die Geräusche kommen trotzdem mit
await page.click('#exportBtn');
await page.waitForSelector('#audHint');
const hint = await page.textContent('#audHint');
if (!/Kino-Einstieg|Projektor/.test(hint)) fails.push('Export-Hinweis fehlt');
if (errs.length) fails.push(...errs.slice(0, 3));
console.log(fails.length ? 'FAIL ' + fails.join('; ') : 'OK shutterui');
await browser.close();
process.exit(fails.length ? 1 : 0);
