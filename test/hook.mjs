// Hook-Prüfung: Stopp-Wert plausibel (schneller Einstieg > Kino-Aufblende), Aufschlüsselung, automatische Verbesserung
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
const tile = await page.$('.chk[data-go="hook"]');
if (!tile) fails.push('keine Hook-Karte');
const before = await page.evaluate(() => CineBeat.S.hook && CineBeat.S.hook.score);
if (!(before >= 0 && before <= 100)) fails.push('Wert ' + before);
if (tile) {
  await tile.click();
  await page.waitForTimeout(300);
  const n = await page.evaluate(() => document.querySelectorAll('.hook-parts li').length + (document.querySelector('.hook-ok') ? 4 : 0));
  if (n < 5 || n > 9) fails.push('Aufschlüsselung ' + n);
  await page.click('[data-act="improve"]');
  await page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => CineBeat.S.hook && CineBeat.S.hook.score);
  const msg = await page.evaluate(() => (document.querySelector('.toast') || {}).textContent || '');
  if (!(after >= before)) fails.push(`schlechter ${before} → ${after}`);
  if (!/Einstieg/.test(msg)) fails.push('keine Rückmeldung: ' + msg);
}
// Plausibilität im Planer: schneller Einstieg schlägt die langsame Kino-Aufblende, Bild von euch vorn hebt „Menschen“
const p2 = await b.newPage();
await p2.goto('http://127.0.0.1:8124/test/pipeline.html');
const pl = await p2.evaluate(async () => {
  const sr = 44100, len = sr * 20, buf = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: sr });
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) { const t = i / sr, ph = t % 0.5; d[i] = (ph < 0.08 ? Math.sin(2 * Math.PI * 60 * ph) * (1 - ph / 0.08) : 0) * 0.8 + Math.sin(2 * Math.PI * 220 * t) * 0.05; } }
  const an = await analyzeAudio(buf);
  const sc = demoScenes();
  const media = sc.map((c, i) => ({ id: 'm' + i, kind: 'image', name: 'M' + i, canvas: c, w: c.width, h: c.height, time: 1.7e12 + i * 60000, ...scoreImage(c, c.width, c.height) }));
  const S0 = { format: '9:16', look: 'natur', pace: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 3 };
  const hs = (x) => { const plan = buildPlan({ an, media, settings: { ...S0, ...x }, overrides: { texts: [], stickers: [] } }); return hookScore(plan, media.map((m) => m), an); };
  media.push({ ...media[0], id: 'dark', name: 'dark', luma: 0.06, sharp: 0.2, score: 0.2, time: 1.7e12 - 60000 });
  const cin = hs({ intro: 'cinema' }), rush = hs({ intro: 'rush' }), hook = hs({ intro: 'hook' }), dark = hs({ intro: 'hook', hookId: 'dark' });
  const part = (h, k) => h.parts.find((p) => p.k === k).v;
  return { cin: cin.score, rush: rush.score, hook: hook.score, dark: dark.score, errs: [rush.errors, hook.errors, cin.errors, dark.errors], cinStartErr: part(cin, 'start') < 0.5, darkQualErr: part(dark, 'quality') < 0.5, cinMotion: part(cin, 'motion'), rushMotion: part(rush, 'motion'), rushChange: part(rush, 'change'), cinChange: part(cin, 'change') };
});
// trennt: schneller Einstieg > ruhiges Startbild > Kino-Aufblende (Fehler: Anlauf aus Schwarz) > dunkles Startbild (Fehler)
if (!(pl.rush > pl.hook && pl.hook > pl.cin && pl.cin > pl.dark)) fails.push(`Reihenfolge der Einstiege falsch ${JSON.stringify(pl)}`);
if (pl.errs[0] || pl.errs[1] || !pl.cinStartErr || !pl.darkQualErr) fails.push('Fehler falsch erkannt ' + JSON.stringify(pl));
if (!(pl.rushMotion >= pl.cinMotion) || !(pl.rushChange >= pl.cinChange)) fails.push('Faktoren ' + JSON.stringify(pl));
if (process.argv.includes('-v')) console.log(JSON.stringify(pl));
if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
console.log(fails.length ? 'FAIL ' + fails.join('; ') : 'OK hook');
await b.close();
process.exit(fails.length ? 1 : 0);
