// Reise-Import mit echten JPEGs inkl. EXIF-GPS; prüft Orte, Namen, km und dass nichts gespeichert wird
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { makeSong } from './wav.mjs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
(await import('node:fs')).mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'file:///home/user/cinebeat/docs/CineBeat.html';
function exifSeg(lat, lon, date) {
  const w16 = (a, v) => a.push(v >> 8, v & 255), w32 = (a, v) => a.push(v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255);
  const ifd0At = 8, exifAt = ifd0At + 2 + 2 * 12 + 4, gpsAt = exifAt + 2 + 12 + 4, dataAt = gpsAt + 2 + 4 * 12 + 4;
  const dt = date + '\0', latAt = dataAt + dt.length, lonAt = latAt + 24;
  const t = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8];
  w16(t, 2); w16(t, 0x8769); w16(t, 4); w32(t, 1); w32(t, exifAt); w16(t, 0x8825); w16(t, 4); w32(t, 1); w32(t, gpsAt); w32(t, 0);
  w16(t, 1); w16(t, 0x9003); w16(t, 2); w32(t, dt.length); w32(t, dataAt); w32(t, 0);
  const dms = (x) => { x = Math.abs(x); const d = Math.floor(x), m = Math.floor((x - d) * 60), s = Math.round(((x - d) * 60 - m) * 60 * 100); return [d, 1, m, 1, s, 100]; };
  w16(t, 4);
  w16(t, 1); w16(t, 2); w32(t, 2); t.push(lat < 0 ? 83 : 78, 0, 0, 0);
  w16(t, 2); w16(t, 5); w32(t, 3); w32(t, latAt);
  w16(t, 3); w16(t, 2); w32(t, 2); t.push(lon < 0 ? 87 : 69, 0, 0, 0);
  w16(t, 4); w16(t, 5); w32(t, 3); w32(t, lonAt); w32(t, 0);
  for (const c of dt) t.push(c.charCodeAt(0));
  for (const v of dms(lat)) w32(t, v);
  for (const v of dms(lon)) w32(t, v);
  const app1 = [0xff, 0xe1]; w16(app1, t.length + 8); app1.push(0x45, 0x78, 0x69, 0x66, 0, 0, ...t);
  return Buffer.from(app1);
}
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const errs = [];
page.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); console.log('CONSOLEERR', m.text()); } });
await page.goto(APP);
await page.waitForSelector('.place');
const shots = [
  ['Lissabon', 38.713, -9.139, '2026:05:10 10:00:00', 20], ['Lissabon', 38.70, -9.15, '2026:05:10 19:00:00', 40], ['Lissabon', 38.72, -9.13, '2026:05:11 09:00:00', 60], ['Lissabon', 38.71, -9.14, '2026:05:11 12:00:00', 80],
  ['Porto', 41.14, -8.61, '2026:05:13 11:00:00', 200], ['Porto', 41.15, -8.62, '2026:05:13 20:00:00', 220], ['Porto', 41.16, -8.63, '2026:05:14 10:00:00', 240],
  ['Douro', 41.16, -7.79, '2026:05:15 12:00:00', 120], ['Douro', 41.17, -7.80, '2026:05:15 13:00:00', 130], ['Douro', 41.18, -7.78, '2026:05:15 14:00:00', 140],
];
const jpegs = await page.evaluate((shots) => Promise.all(shots.map(([label, , , , hue], i) => new Promise((res) => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 1200, 900); g.addColorStop(0, `hsl(${hue},60%,55%)`); g.addColorStop(1, `hsl(${hue + 40},55%,25%)`); x.fillStyle = g; x.fillRect(0, 0, 1200, 900);
  for (let k = 0; k < 30; k++) { x.fillStyle = `hsla(${hue + k * 11},70%,${40 + (k * 7) % 40}%,.8)`; x.fillRect((k * 173 + i * 40) % 1100, (k * 97) % 800, 60 + k % 50, 40 + k % 60); }
  x.fillStyle = '#fff'; x.font = 'bold 120px sans-serif'; x.fillText(label + ' ' + (i + 1), 80, 480);
  c.toBlob((bl) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(bl); }, 'image/jpeg', 0.9);
}))), shots);
const paths = jpegs.map((d, i) => {
  const raw = Buffer.from(d.split(',')[1], 'base64');
  const [, lat, lon, date] = shots[i];
  const out = Buffer.concat([raw.subarray(0, 2), exifSeg(lat, lon, date), raw.subarray(2)]);
  const p = `${OUT}/trip_${i}.jpg`; writeFileSync(p, out); return p;
});
await page.setInputFiles('#tripFiles', paths);
await page.waitForSelector('.stop-row', { timeout: 60000 });
await page.waitForTimeout(300);
console.log('Erkannt:', await page.evaluate(() => Array.from(document.querySelectorAll('.stop-row')).map((r) => r.querySelector('.stop-count').textContent + ' × ' + r.querySelector('input').value + ' (' + r.querySelector('.stop-date').textContent + ')')));
console.log('Hinweis:', await page.textContent('#sheetBody .hint'));
await page.screenshot({ path: `${OUT}/trip_summary.png` });
await page.click('#sheetBody [data-act="done"]');
await page.waitForTimeout(400);
console.log('Reise:', await page.textContent('#tripStats'));
await page.screenshot({ path: `${OUT}/trip_view.png`, fullPage: true });
// Gespeichert? Nur leichte Daten
const stored = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('cinebeat'); r.onsuccess = () => { const db = r.result; const out = {}; let n = 0; const names = Array.from(db.objectStoreNames); for (const s of names) { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => { out[s] = JSON.stringify(q.result).length + ' Zeichen, ' + q.result.length + ' Einträge, Blobs: ' + q.result.some((x) => Object.values(x).some((v) => v instanceof Blob)); if (++n === names.length) res(out); }; } }; }));
console.log('Gespeichert:', stored);
// Ort öffnen
await page.click('.place');
await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
console.log('Lissabon-Plan:', await page.evaluate(() => ({ n: CineBeat.S.ctx.media.length, D: CineBeat.S.plan.duration.toFixed(1), intro: CineBeat.S.plan.intro, title: CineBeat.S.ctx.rec.name, sub: CineBeat.S.ctx.rec.sub })));
await page.click('#backBtn');
await page.waitForSelector('.place');
// Neu laden: Orte und Aufnahmen bleiben (Übergangsspeicher); erneutes Wählen erkennt Bekanntes
await page.reload();
await page.waitForSelector('.place');
console.log('Nach Neuladen:', await page.evaluate(() => Array.from(document.querySelectorAll('.place')).map((p) => p.querySelector('strong').textContent + ' | ' + (p.querySelector('.pill') ? p.querySelector('.pill').textContent : ''))));
await page.setInputFiles('#tripFiles', paths);
await page.waitForSelector('.stop-row, .toast.show', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(600);
console.log('Erneut gewählt:', await page.evaluate(() => ({ sheet: document.querySelector('#sheetTitle') && document.querySelector('#sheetTitle').textContent, places: CineBeat.S.places.map((p) => p.name + ':' + p.fps.length) })));
// Einstiege mit Koordinaten → Kilometer unter dem Ortsnamen
async function introShots(tag, set, open, times) {
  await page.evaluate(async ([set, open]) => {
    if (open === 'bestof') await CineBeat.openBestof(); else await CineBeat.openPlace(CineBeat.S.places.find((p) => p.name.startsWith(open)).id);
    Object.assign(CineBeat.S.ctx.rec.settings, set); await CineBeat.rebuild();
  }, [set, open]);
  await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
  const info = await page.evaluate(() => ({ intro: CineBeat.S.plan.intro, ov: CineBeat.S.plan.overlays.filter((o) => o.type !== 'usertext').map((o) => o.type + (o.geo ? ` [${o.geo.lat != null ? o.geo.lat.toFixed(2) + '/' + o.geo.lon.toFixed(2) : '-'} ${o.geo.km != null ? Math.round(o.geo.km) + 'km ' + o.geo.mode : ''}]` : '') + (o.stats ? ' {' + o.stats + '}' : '')).join(', ') }));
  console.log(tag, info);
  for (const t of times) {
    await page.evaluate((t) => CineBeat.engine.renderStill(t), t);
    await page.waitForTimeout(150);
    const lum = await page.evaluate(() => { const c = document.querySelector('#monitor canvas'); const x = document.createElement('canvas'); x.width = 18; x.height = 32; const g = x.getContext('2d'); g.drawImage(c, 0, 0, 18, 32); const d = g.getImageData(0, 0, 18, 32).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return Math.round(s / 3 / 576); });
    console.log('  t=' + t, 'Helligkeit', lum);
    await page.locator('#monitor').screenshot({ path: `${OUT}/intro_${tag}_${t}.png` });
  }
  await page.click('#backBtn'); await page.waitForSelector('.place');
}
await introShots('city_porto_total', { intro: 'city', km: 'total' }, 'Porto', [0.05, 0.8, 2.2]);
await introShots('countdown_douro_leg', { intro: 'countdown', km: 'leg', font: 'modern' }, 'Douro', [0, 0.6, 1.2]);
await introShots('knockout_lissabon', { intro: 'knockout', km: 'coords' }, 'Lissabon', [0.05, 1]);
await introShots('grid_porto', { intro: 'grid', km: 'off' }, 'Porto', [0.05]);
await introShots('bestof_total', { intro: 'auto', km: 'total', showStats: true }, 'bestof', []);
const bestofChapters = await page.evaluate(async () => { await CineBeat.openBestof(); return CineBeat.S.plan.overlays.filter((o) => o.type === 'chapter').map((o) => ({ start: +o.start.toFixed(2), geo: o.geo && Math.round(o.geo.km || 0) })); });
console.log('Kapitel:', bestofChapters);
await page.evaluate((t) => CineBeat.engine.renderStill(t), bestofChapters[1] ? bestofChapters[1].start + 2 : 3);
await page.waitForTimeout(300);
await page.locator('#monitor').screenshot({ path: `${OUT}/chapter_geo.png` });
const maps = await page.evaluate(async () => { Object.assign(CineBeat.S.ctx.rec.settings, { format: '9:16', mapTheme: 'nacht' }); await CineBeat.rebuild(); return CineBeat.S.plan.overlays.filter((o) => o.type === 'routemap').map((o) => ({ start: +o.start.toFixed(2), idx: o.idx })); });
console.log('Karten-Momente:', maps);
if (!maps.length) errs.push('kein Karten-Moment im Gesamtfilm');
else {
  await page.evaluate((t) => CineBeat.engine.renderStill(t), maps[0].start + 2.6);
  await page.waitForTimeout(300);
  await page.locator('#monitor').screenshot({ path: `${OUT}/routemap.png` });
}
await page.click('#backBtn'); await page.waitForSelector('.place');
// Stil-Vorlage: in Lissabon speichern, auf alle übertragen, neuer Ort übernimmt sie
await page.evaluate(async () => { await CineBeat.openPlace(CineBeat.S.places.find((p) => p.name === 'Lissabon').id); });
await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
await page.click('#lookGrid [data-v="golden"]'); await page.waitForTimeout(400);
await page.click('#fontChips [data-v="editorial"]'); await page.waitForTimeout(400);
await page.click('#motionChips [data-v="sway"]'); await page.waitForTimeout(400);
await page.click('#introChips [data-v="countdown"]'); await page.waitForTimeout(400);
await page.click('#styleBtn'); await page.click('#sheetBody [data-act="save"]'); await page.waitForTimeout(300);
console.log('Vorlage-Info:', await page.textContent('#styleInfo'));
await page.click('#styleBtn'); await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/style_sheet.png` });
await page.click('#sheetBody [data-act="all"]');
await page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 60000 }); await page.waitForTimeout(500);
await page.click('#backBtn'); await page.waitForSelector('.place');
await page.reload(); await page.waitForSelector('.place');
console.log('Nach Übertragen:', await page.evaluate(async () => CineBeat.S.places.map((p) => `${p.name}: ${p.settings.look}/${p.settings.font}/${p.settings.motion}/${p.settings.intro}/${p.settings.format}`)));
console.log('Alte Felder weg:', await page.evaluate(() => CineBeat.S.places.every((p) => !('route' in p.settings) && !('routeStyle' in p.settings))));
await page.click('#addPlace');
await page.waitForFunction(() => CineBeat.S.ctx && CineBeat.S.ctx.rec.name === 'Neuer Ort', null, { timeout: 30000 });
console.log('Neuer Ort:', await page.evaluate(() => { const s = CineBeat.S.ctx.rec.settings; return `${s.look}/${s.font}/${s.motion}/${s.intro}`; }));
console.log('DB-Bereiche:', await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('cinebeat'); r.onsuccess = () => { res(Array.from(r.result.objectStoreNames).join(',') + ' v' + r.result.version); r.result.close(); }; })));
// Song bleibt: eigene Songdatei in Lissabon, nach Neustart wieder da
makeSong(`${OUT}/trip_song.wav`, { bpm: 104, dur: 40 });
await page.evaluate(async () => { await CineBeat.openPlace(CineBeat.S.places.find((p) => p.name === 'Lissabon').id); });
await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
await page.setInputFiles('#fileMusic', `${OUT}/trip_song.wav`);
await page.waitForFunction(() => CineBeat.S.ctx.song && CineBeat.S.ctx.song.name === 'trip_song' && document.getElementById('busy').hidden, null, { timeout: 90000 });
await page.click('#backBtn'); await page.waitForSelector('.place');
await page.reload(); await page.waitForSelector('.place');
await page.evaluate(async () => { await CineBeat.openPlace(CineBeat.S.places.find((p) => p.name === 'Lissabon').id); });
await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
console.log('Song nach Neustart:', await page.evaluate(() => `${CineBeat.S.ctx.song.name} · ${Math.round(CineBeat.S.ctx.song.an.bpm)} BPM · ${CineBeat.S.ctx.media.length} Aufnahmen`));
await page.click('#backBtn'); await page.waitForSelector('.place');
// Ort fertig: Zwischenspeicher leeren
const porto = await page.evaluate(() => CineBeat.S.places.find((p) => p.name === 'Porto').id);
await page.click(`[data-more="${porto}"]`);
await page.click('#sheetBody [data-act="release"]');
await page.waitForTimeout(500);
const counts = async () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('cinebeat'); r.onsuccess = () => { const q = r.result.transaction('work').objectStore('work').getAll(); q.onsuccess = () => { res(q.result.map((x) => x.type).join(',')); r.result.close(); }; }; }));
console.log('Porto freigegeben:', await page.evaluate(() => Array.from(document.querySelectorAll('.place')).map((p) => p.querySelector('strong').textContent + (p.querySelector('.pill.warn') ? ' (erneut wählen)' : '')).join(' | ')), '| Speicher:', await counts());
// 30-Tage-Regel: Lissabon künstlich alt machen, nach Neustart ist der Zwischenspeicher dort leer
await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('cinebeat'); r.onsuccess = () => { const db = r.result; const tx = db.transaction(['places', 'work'], 'readwrite'); const ps = tx.objectStore('places'); const old = Date.now() - 40 * 864e5; ps.getAll().onsuccess = (e) => { for (const p of e.target.result) if (p.name === 'Lissabon') { p.edited = old; ps.put(p); } }; const ws = tx.objectStore('work'); ws.getAll().onsuccess = (e) => { for (const w of e.target.result) { w.savedAt = old; ws.put(w); } }; tx.oncomplete = () => { db.close(); res(); }; }; }));
await page.reload(); await page.waitForSelector('.place');
console.log('Nach 40 Tagen:', await page.evaluate(() => Array.from(document.querySelectorAll('.place')).map((p) => p.querySelector('strong').textContent + (p.querySelector('.pill.warn') ? ' (erneut wählen)' : '')).join(' | ')), '| Speicher:', await counts());
console.log('Speicherhinweis:', await page.textContent('#storageHint'));
console.log('Fehler:', errs.join('\n') || 'keine');
await b.close();
