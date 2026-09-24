// Flug anlegen: Abflug- und Landungsvideo, Fluganimation über dem Globus
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'http://127.0.0.1:8123/index.html';
const FROM = process.env.FROM || 'Frankfurt', TO = process.env.TO || 'Lissabon', FMT = process.env.FMT || '9:16';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const errs = [];
page.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message); });
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(APP);
await page.waitForSelector('.place');
const vids = await page.evaluate(async () => {
  const mk = async (label, hue) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360; const x = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' }); const ch = []; rec.ondataavailable = (e) => ch.push(e.data);
    const done = new Promise((r) => (rec.onstop = r)); rec.start(); const t0 = performance.now();
    await new Promise((res) => { const f = () => { const t = (performance.now() - t0) / 1000; const g = x.createLinearGradient(0, 0, 0, 360); g.addColorStop(0, `hsl(${hue},55%,${60 - t * 5}%)`); g.addColorStop(1, `hsl(${hue + 30},40%,20%)`); x.fillStyle = g; x.fillRect(0, 0, 640, 360); x.fillStyle = '#fff'; x.font = 'bold 54px sans-serif'; x.fillText(label + ' ' + t.toFixed(1), 30, 200); if (t < 5) requestAnimationFrame(f); else { rec.stop(); res(); } }; f(); });
    await done;
    const buf = new Uint8Array(await new Blob(ch).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192)); return btoa(s);
  };
  return [await mk('START', 200), await mk('LANDUNG', 30)];
});
const paths = vids.map((v, i) => { const p = `${OUT}/flight_${i}.webm`; writeFileSync(p, Buffer.from(v, 'base64')); return p; });
await page.click('#addFlight');
await page.fill('#fFrom', FROM);
await page.fill('#fTo', TO);
await page.screenshot({ path: `${OUT}/flight_sheet.png` });
await page.click('#fSave');
await page.waitForSelector('#emptyStage:not([hidden])', { timeout: 30000 });
console.log('Leerer Flug:', await page.textContent('#esTitle'));
await page.setInputFiles('#fileMedia2', paths);
await page.waitForFunction(() => CineBeat.S.plan && CineBeat.S.plan.clips.some((c) => c.flightAnim) && document.getElementById('busy').hidden, null, { timeout: 90000 });
const EXTRA = JSON.parse(process.env.SET || '{}');
await page.evaluate(async ([f, x]) => { Object.assign(CineBeat.S.ctx.rec.settings, { format: f }, x); await CineBeat.rebuild(); }, [FMT, EXTRA]);
const TAG = process.env.TAG || FMT.replace(':', 'x');
const info = await page.evaluate(() => { const p = CineBeat.S.plan; return { D: p.duration.toFixed(2), clips: p.clips.map((c) => `${c.start.toFixed(2)}-${c.end.toFixed(2)} ${c.role}${c.mediaId ? '' : ' (Animation)'}`), notes: p.notes, ov: p.overlays.map((o) => o.type + ' ' + o.start.toFixed(2) + '-' + o.end.toFixed(2)), flight: JSON.stringify(p.overlays.find((o) => o.type === 'flight')?.flight) }; });
console.log(info);
const an = await page.evaluate(() => { const c = CineBeat.S.plan.clips.find((x) => x.flightAnim); return [c.start, c.end]; });
for (const [k, t] of [['a', an[0] - 0.2], ['b', an[0] + (an[1] - an[0]) * 0.35], ['c', an[0] + (an[1] - an[0]) * 0.7], ['d', an[1] + 1]]) {
  await page.evaluate((t) => CineBeat.engine.renderStill(t), t);
  await page.waitForTimeout(250);
  await page.locator('#monitor').screenshot({ path: `${OUT}/flight_${TAG}_${k}.png` });
}
// Rollen tauschen: zweites Video als Abflug
await page.click('#tabbtn-material');
const before = await page.evaluate(() => CineBeat.S.plan.clips[0].mediaId);
const other = await page.evaluate((b) => CineBeat.S.ctx.media.find((m) => m.id !== b).id, before);
await page.click(`#mediaGrid [data-id="${other}"]`);
await page.click('#sheetBody [data-act="takeoff"]');
await page.waitForFunction((o) => CineBeat.S.plan && CineBeat.S.plan.clips[0].mediaId === o && document.getElementById('busy').hidden, other, { timeout: 60000 });
console.log('Rollentausch:', await page.evaluate(() => Array.from(document.querySelectorAll('#mediaGrid .flag.start')).map((f) => f.textContent).join(',')));
await page.click('#backBtn'); await page.waitForSelector('.place');
await page.screenshot({ path: `${OUT}/flight_trip.png` });
// Übergangsspeicher: nach Neustart ist alles wieder da
await page.reload(); await page.waitForSelector('.place');
console.log('Nach Neustart:', await page.textContent('.place .meta'), '| Hinweis:', await page.evaluate(() => !!document.querySelector('.pill.warn')));
await page.click('.place');
await page.waitForFunction(() => CineBeat.S.plan && CineBeat.S.plan.clips.some((c) => c.flightAnim) && document.getElementById('busy').hidden, null, { timeout: 90000 });
console.log('Flug wieder da:', await page.evaluate(() => ({ media: CineBeat.S.ctx.media.length, first: CineBeat.S.plan.clips[0].mediaId, thumbs: CineBeat.S.ctx.media.every((m) => m.thumb && m.poster) })), 'erwartet', other);
await page.click('#backBtn'); await page.waitForSelector('.place');
console.log('Reise:', await page.textContent('#tripStats'));
console.log('Fehler:', errs.join('\n') || 'keine');
await b.close();
