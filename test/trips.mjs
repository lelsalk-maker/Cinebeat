// Mehrere Reisen: Einordnung nach Datum, neue Reise außerhalb aller Reisen, Karte der aktiven Reise
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.APP || 'http://127.0.0.1:8123/index.html');
await page.waitForSelector('.place');
const r = await page.evaluate(async () => {
  const fails = [];
  const S = CineBeat.S, T = CineBeat._trips, DAY = 864e5;
  const may = new Date(2026, 4, 3).getTime(), oct = new Date(2026, 9, 10).getTime();
  const mk = (id, name, pos, from, tripId) => ({ id, tripId, name, pos, from, to: from + DAY, fps: [], flags: {}, settings: {}, overrides: {}, songId: 'demo', created: from });
  S.places = [mk('p1', 'Lissabon', [38.72, -9.14], may, 'main'), mk('p2', 'Sintra', [38.8, -9.38], may + 2 * DAY, 'main'), mk('p3', 'Porto', [41.15, -8.61], may + 5 * DAY, 'main')];
  S.trips = [S.trip]; S.trip.name = 'Portugal';
  // Etappe mitten in der Portugal-Reise ⇒ dorthin
  const made = [];
  const a = T.tripForStop({ from: may + 3 * DAY, to: may + 3 * DAY }, made);
  if (a !== S.trip) fails.push('Etappe innerhalb nicht in Portugal');
  // einen Tag nach Reiseende ⇒ noch Portugal
  if (T.tripForStop({ from: may + 7 * DAY }, made) !== S.trip) fails.push('Randtag nicht in Portugal');
  // Oktober ⇒ neue Reise; zweite Oktober-Etappe 2 Tage später ⇒ dieselbe neue Reise
  const j1 = T.tripForStop({ from: oct }, made);
  if (j1 === S.trip || made.length !== 1) fails.push('keine neue Reise für Oktober');
  S.places.push(mk('p4', 'Tokio', [35.68, 139.69], oct, j1.id));
  const j2 = T.tripForStop({ from: oct + 2 * DAY }, made);
  if (j2 !== j1) fails.push('Oktober-Etappen getrennt');
  S.places.push(mk('p5', 'Kyoto', [35.01, 135.77], oct + 2 * DAY, j1.id));
  const nm = T.autoTripName(j1);
  if (!/Tokio/.test(nm) || !/Oktober 2026/.test(nm)) fails.push('Name ' + nm);
  j1.name = nm;
  // Ansicht: nur Orte der aktiven Reise, Karte sichtbar
  await T.renderTrip();
  await new Promise((r) => setTimeout(r, 150));
  const shown = Array.from(document.querySelectorAll('#placeList .place strong')).map((e) => e.textContent);
  if (shown.join() !== 'Lissabon,Sintra,Porto') fails.push('Liste ' + shown.join());
  if (document.getElementById('tripMap').hidden) fails.push('Karte fehlt');
  if (!/Reise 1 von 2/.test(document.getElementById('tripSwitch').textContent)) fails.push('Umschalter ' + document.getElementById('tripSwitch').textContent);
  await T.switchTrip(j1.id);
  await new Promise((r) => setTimeout(r, 150));
  const shown2 = Array.from(document.querySelectorAll('#placeList .place strong')).map((e) => e.textContent);
  if (shown2.join() !== 'Tokio,Kyoto') fails.push('Liste 2 ' + shown2.join());
  await T.switchTrip('main');
  return fails;
});
await page.waitForTimeout(300);
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, clip: { x: 0, y: 0, width: 390, height: 760 } });
if (errs.length) r.push('Fehler: ' + errs.join(' | '));
console.log(r.length ? 'FAIL ' + r.join('; ') : 'OK trips');
await b.close();
process.exit(r.length ? 1 : 0);
