// Auswahl selbst bestimmen: Filter „Im Film / Draußen“, draußen gebliebene Aufnahme in den Film holen (die Regie nennt,
// was dafür weicht), gezielt gegen eine bestimmte tauschen, in beide Richtungen; Rückgängig; „Neu schneiden“ ergibt eine
// neue Zusammensetzung und behält die eigenen Entscheidungen.
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
const idle = () => page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 120000 });
await idle();
// „Beste Auswahl“ und kurze Länge: es bleiben Aufnahmen draußen
await page.click('[data-tab="format"]');
await page.click('#allChips [data-v="off"]');
await page.waitForTimeout(600); await idle();
await page.click('[data-tab="format"]');
await page.click('#lenChips [data-v="15"]');
await page.waitForTimeout(600); await idle();
const st = () => page.evaluate(() => { const S = CineBeat.S; return { dropped: S.plan.capacity.droppedIds.slice(), media: S.ctx.media.map((m) => ({ id: m.id, fav: !!m.fav, ex: !!m.excluded })), seed: S.ctx.rec.settings.seed, clips: S.plan.clips.map((c) => c.mediaId).join(',') }; });
// (ruhiges Tempo: lange Einstellungen – in 15 s passen dann sicher nicht alle sechs Bilder)
await page.evaluate(() => { CineBeat.S.ctx.rec.settings.pace = 'ruhig'; return CineBeat.rebuild(); });
await page.waitForTimeout(400); await idle();
let s0 = await st();
console.log('draußen', s0.dropped.length, 'von', s0.media.length);
if (!s0.dropped.length) fails.push('Testaufbau: nichts draußen');
// Filter
await page.click('[data-tab="material"]');
const chips = await page.$$eval('#matFilter [data-v]', (b) => b.map((x) => x.textContent));
if (chips.length !== 3 || !/Draußen · [1-9]/.test(chips[2])) fails.push('Filter fehlt: ' + chips.join(' | '));
await page.click('#matFilter [data-v="out"]');
const outTiles = await page.$$eval('#mediaGrid .tile', (t) => t.map((x) => x.dataset.id));
if (outTiles.length < s0.dropped.length) fails.push('Filter „Draußen“ zeigt nicht alle');
// 1. in den Film holen (Regie sucht aus, was weicht)
const a = s0.dropped[0];
await page.click(`#mediaGrid .tile[data-id="${a}"]`);
await page.waitForSelector('[data-act="bring"]');
await page.click('[data-act="bring"]');
await page.waitForTimeout(800); await idle();
let s1 = await st();
const toast1 = await page.textContent('.toast');
if (s1.dropped.includes(a) || !s1.media.find((m) => m.id === a).fav) fails.push('Holen: nicht im Film');
if (!/sicher im Film/.test(toast1)) fails.push('Holen: keine Rückmeldung');
// 2. gezielt tauschen: ein draußen gebliebenes gegen ein bestimmtes im Film
await page.click('#matFilter [data-v="out"]');
const b = (await st()).dropped[0];
await page.click(`#mediaGrid .tile[data-id="${b}"]`);
await page.click('[data-act="bringFor"]');
await page.waitForSelector('.pick-grid [data-id]');
const victim = await page.$eval('.pick-grid [data-id]', (x) => x.dataset.id);
await page.click('.pick-grid [data-id]');
await page.waitForTimeout(800); await idle();
let s2 = await st();
const inClips = (st2, id) => st2.clips.split(',').includes(id);
if (s2.dropped.includes(b) || !inClips(s2, b) || inClips(s2, victim) || !s2.media.find((m) => m.id === victim).ex) fails.push('Tauschen: falsches Ergebnis');
// 3. umgekehrt: eine im Film gegen eine draußen gebliebene
await page.click('#matFilter [data-v="in"]');
const c = await page.$eval('#mediaGrid .tile', (x) => x.dataset.id);
await page.click(`#mediaGrid .tile[data-id="${c}"]`);
await page.waitForSelector('[data-act="swapOut"]');
await page.click('[data-act="swapOut"]');
await page.waitForSelector('.pick-grid [data-id]');
const inn = await page.$eval('.pick-grid [data-id]', (x) => x.dataset.id);
await page.click('.pick-grid [data-id]');
await page.waitForTimeout(800); await idle();
let s3 = await st();
if (s3.dropped.includes(inn) || !inClips(s3, inn) || !s3.media.find((m) => m.id === c).ex) fails.push('Tausch zurück: falsches Ergebnis');
// Rückgängig holt den vorigen Stand
await page.click('#undoBtn');
await page.waitForTimeout(800); await idle();
const s4 = await st();
if (s4.media.find((m) => m.id === c).ex) fails.push('Rückgängig wirkt nicht');
// 4. Neu schneiden: neue Zusammensetzung, eigene Entscheidungen bleiben
const favs = s4.media.filter((m) => m.fav).map((m) => m.id), excl = s4.media.filter((m) => m.ex).map((m) => m.id);
await page.click('#remixBtn');
await page.waitForSelector('#remixGo');
await page.click('#remixGo');
await page.waitForTimeout(800); await idle();
const s5 = await st();
const toast5 = await page.textContent('.toast');
if (s5.seed === s4.seed) fails.push('Neu schneiden: kein neuer Schnitt');
if (favs.some((id) => s5.dropped.includes(id))) fails.push('Neu schneiden: Favorit verloren');
if (excl.some((id) => !s5.media.find((m) => m.id === id).ex)) fails.push('Neu schneiden: Ausschluss verloren');
if (!/Neu geschnitten/.test(toast5)) fails.push('Neu schneiden: keine Rückmeldung');
if (s5.clips === s4.clips) fails.push('Neu schneiden: gleiche Zusammensetzung');
console.log(JSON.stringify({ toast1, toast5: toast5.slice(0, 120), same: s5.clips === s4.clips }));
if (errs.length) fails.push(...errs.slice(0, 3));
console.log(fails.length ? 'FAIL ' + fails.join('; ') : 'OK select');
await browser.close();
process.exit(fails.length ? 1 : 0);
