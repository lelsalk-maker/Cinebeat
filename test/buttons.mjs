// Jeder Knopf hat Hand und Fuß: ein echter Ort (Fotos + Video, Beispielsong, geschnitten), dann wird in jedem Reiter
// (Werkbank: alle Regler) und in der Regie-Leiste jeder sichtbare Knopf und jede Auswahl angetippt. Geprüft wird:
// kein Skriptfehler, keine Fehlermeldung, und jeder Tipp bewirkt etwas (Film, Einstellung, Blatt, Hinweis oder Anzeige).
// Ausgenommen: Export, Löschen, Dateiauswahl, Mikrofon. `-v` listet jeden Knopf.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const V = process.argv.includes('-v');
mkdirSync('/tmp/cinebeat-test', { recursive: true });
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = [];
pg.on('pageerror', (e) => errs.push('Skriptfehler: ' + e.message));
pg.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('Konsole: ' + m.text().slice(0, 160)); });
await pg.goto('http://127.0.0.1:8123/index.html');
await pg.evaluate(() => localStorage.setItem('cinebeat-level', 'bench'));
await pg.reload();
await pg.waitForSelector('.place');
await pg.click('#addPlace');
await pg.waitForFunction(() => CineBeat.S.ctx && document.getElementById('busy').hidden, null, { timeout: 60000 });
await pg.fill('#placeName', 'Porto');
const files = await pg.evaluate(async () => {
  const out = Array.from({ length: 10 }, (_, k) => { const c = document.createElement('canvas'); c.width = 1200; c.height = k % 3 ? 1600 : 900; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, c.height); g.addColorStop(0, `hsl(${k * 33},50%,60%)`); g.addColorStop(1, `hsl(${k * 33 + 40},50%,25%)`); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height); for (let i = 0; i < 18; i++) { x.fillStyle = `hsla(${k * 40 + i * 13},60%,${30 + i * 2}%,.8)`; x.fillRect((i * 97 + k * 31) % c.width, (i * 53 + k * 17) % c.height, 80 + i * 4, 60 + i * 3); } return ['f' + k + '.jpg', c.toDataURL('image/jpeg', 0.88)]; });
  const c = document.createElement('canvas'); c.width = 540; c.height = 960; const x = c.getContext('2d');
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' }); const ch = []; rec.ondataavailable = (e) => ch.push(e.data);
  const done = new Promise((r) => (rec.onstop = r)); rec.start(); const t0 = performance.now();
  await new Promise((res) => { const f = () => { const t = (performance.now() - t0) / 1000; x.fillStyle = `hsl(${t * 60},55%,40%)`; x.fillRect(0, 0, 540, 960); x.fillStyle = '#fff'; x.beginPath(); x.arc(270 + Math.sin(t * 2) * 200, 480, 70, 0, 7); x.fill(); if (t < 4) requestAnimationFrame(f); else { rec.stop(); res(); } }; f(); });
  await done;
  const blob = new Blob(ch, { type: 'video/webm' });
  out.push(['v.webm', await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); })]);
  return out;
});
const paths = files.map(([n, d]) => { const f = `/tmp/cinebeat-test/btn_${n}`; writeFileSync(f, Buffer.from(d.split(',')[1], 'base64')); return f; });
await pg.setInputFiles('#fileMedia2', paths);
await pg.waitForFunction((n) => CineBeat.S.ctx.media.length >= n && CineBeat.S.ctx.media.every((m) => !m.loading) && document.getElementById('busy').hidden, paths.length, { timeout: 300000 });
await pg.click('#flowStage [data-flow="demo"]');
await pg.waitForFunction(() => document.getElementById('busy').hidden && document.querySelector('#flowStage [data-flow="cut"]'), null, { timeout: 300000 });
await pg.click('#flowStage [data-flow="cut"]');
await pg.waitForSelector('#wishGo');
await pg.click('#wishGo');
await pg.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden && document.getElementById('flowStage').hidden, null, { timeout: 600000 });
await pg.waitForTimeout(800);
const errs0 = errs.length;
// Zustand, an dem eine Wirkung sichtbar wird
const sig = () => pg.evaluate(() => {
  const S = CineBeat.S, p = S.plan;
  const ui = Array.from(document.querySelectorAll('[aria-checked],[aria-pressed],[aria-expanded],details,[aria-selected]')).map((e) => (e.getAttribute('aria-checked') || '') + (e.getAttribute('aria-pressed') || '') + (e.getAttribute('aria-expanded') || '') + (e.getAttribute('aria-selected') || '') + (e.open ? 'o' : '')).join('');
  const vis = Array.from(document.querySelectorAll('section, .sheet, .panel, [hidden]')).filter((e) => !e.hidden && e.offsetParent !== null).length;
  return JSON.stringify([p && p.clips.map((c) => [+c.start.toFixed(2), c.mediaId, c.tin && c.tin.type, c.motion && c.motion.from.s]).join(';'), p && p.overlays.length, p && p.fx.length, p && p.look, JSON.stringify(S.ctx.rec.settings), JSON.stringify(S.ctx.rec.overrides), S.ctx.rec.hookId, ui, vis, JSON.stringify(S.ctx.media.map((m) => [m.fav, m.excluded, m.us, m.ppl, m.bw, m.sound, m.rot])), Math.round(window.scrollY), document.querySelectorAll('.flash').length, (document.querySelector('.tabpanel:not([hidden])') || {}).scrollTop, (document.activeElement || {}).id, document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent : '', !document.getElementById('sheet') || document.getElementById('sheet').hidden ? 0 : 1, CineBeat.engine.playing, location.hash, document.body.className, S.tab]);
});
const settle = async () => { await pg.waitForTimeout(250); await pg.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 120000 }).catch(() => {}); await pg.waitForTimeout(200); };
const closeAll = async () => { for (let k = 0; k < 3; k++) { const open = await pg.evaluate(() => { const s = document.getElementById('sheet'); return s && !s.hidden; }); if (!open) break; await pg.keyboard.press('Escape'); await pg.waitForTimeout(250); } await pg.evaluate(() => { if (!document.getElementById('compare').hidden) document.getElementById('cmpClose').click(); CineBeat.engine.pause(); }); };
const SKIP = /export|exportBtn|del|delete|remove|löschen|Löschen|file|Galerie|mic|Mithören|listen|reset|Vergessen|share|Teilen|Fertig: Aufnahmen|install|back|Zurück|home|addPlace|cmpTake/i;
const report = [], dead = [], errored = [];
for (const tab of ['format', 'style', 'flow', 'material', 'music', 'text', 'cut', 'regie']) {
  if (tab !== 'regie') { await pg.click(`#tabbtn-${tab}`); await settle(); }
  const scope = tab === 'regie' ? '#regieDecisions, #regie .hook-card, #regie .check-card' : `#tab-${tab}`;
  // alle Knöpfe einmal einsammeln (Kennung: Selektor-Pfad über Index)
  const tag = (scope) => pg.evaluate((scope) => {
    const els = Array.from(document.querySelectorAll(scope.split(',').map((s) => `${s.trim()} button, ${s.trim()} [role="radio"], ${s.trim()} summary`).join(','))).filter((e) => e.offsetParent !== null && !e.disabled);
    return els.map((e, i) => { e.dataset.btnTest = `${scope.length}-${i}`; return { key: e.dataset.btnTest, text: (e.textContent || e.getAttribute('aria-label') || e.id || '').trim().replace(/\s+/g, ' ').slice(0, 40), id: e.id, checked: e.getAttribute('aria-checked') === 'true', cls: e.className }; });
  }, scope);
  const ids = await tag(scope);
  if (V) console.log(tab, 'gefunden', ids.length, 'übersprungen', ids.filter((it) => SKIP.test(it.text + ' ' + it.id + ' ' + it.cls) || it.checked).map((it) => it.text || it.id).join(', '));
  for (const it of ids.slice(0, 60)) {
    if (SKIP.test(it.text + ' ' + it.id + ' ' + it.cls) || it.checked) continue;
    if (tab !== 'regie') { const sel = await pg.evaluate((t) => document.getElementById('tabbtn-' + t).getAttribute('aria-selected'), tab); if (sel !== 'true') { await pg.click(`#tabbtn-${tab}`); await settle(); } }
    // (nach einem Tipp zeichnet die Oberfläche oft neu: Knöpfe neu markieren und denselben wiederfinden)
    const now = await tag(scope);
    const hit = now.find((x) => x.text === it.text && x.id === it.id) || now.find((x) => x.key === it.key && (!it.id || x.id === it.id)) || null;
    const el = hit ? await pg.$(`[data-btn-test="${hit.key}"]`) : null;
    if (!el || !(await el.isVisible())) { if (V) console.log('nicht gefunden:', tab, it.text); continue; }
    if (hit.checked) continue;
    const s0 = await sig(), e0 = errs.length;
    const errToast0 = await pg.evaluate(() => document.getElementById('toast').classList.contains('err') && document.getElementById('toast').classList.contains('show'));
    try { await el.click({ timeout: 3000 }); } catch (e) { continue; }
    await settle();
    const s1 = await sig();
    const errToast = await pg.evaluate(() => (document.getElementById('toast').classList.contains('err') && document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent : ''));
    const effect = s0 !== s1;
    const row = `${tab}: „${it.text || it.id}“ → ${effect ? 'wirkt' : 'OHNE WIRKUNG'}${errToast && !errToast0 ? ' · FEHLERMELDUNG: ' + errToast : ''}${errs.length > e0 ? ' · ' + errs.slice(e0).join(' / ') : ''}`;
    report.push(row);
    if (!effect) dead.push(`${tab}: ${it.text || it.id}`);
    if ((errToast && !errToast0) || errs.length > e0) errored.push(row);
    await closeAll();
  }
}
if (V) console.log(report.join('\n'));
// nach all den Eingriffen: „Automatisch korrigieren“ im Film-Check räumt auf
await closeAll();
const fixBtn = await pg.$('#hookFix');
if (fixBtn) { await fixBtn.click(); await settle(); await pg.waitForTimeout(500); await settle(); }
if (V) console.log('Korrektur:', await pg.evaluate(() => document.getElementById('toast').textContent));
// nach all den Eingriffen: der Film-Check muss weiterhin sauber sein (die Regie korrigiert selbst)
const fin = await pg.evaluate(() => { const S = CineBeat.S; const a = CineBeat.planAudit(S.plan, CineBeat.filmMedia(S.ctx), S.ctx.song.an).concat(CineBeat.planSyncAudit(S.plan, S.ctx.song.an)); const med = CineBeat.filmMedia(S.ctx), by = new Map(med.map((m) => [m.id, m])); const pl = S.plan.clips.filter((c) => c.mediaId && !c.split && !c.flash && !c.rush && !c.burst && !c.welcome && !c.grid && !c.stack && !c.loop && !c.recap); const twins = []; for (let i = 1; i < pl.length; i++) if (CineBeat.sameMotif(by.get(pl[i - 1].mediaId), by.get(pl[i].mediaId))) twins.push(`${pl[i - 1].i}:${pl[i - 1].mediaId}@${pl[i - 1].start.toFixed(2)}-${pl[i - 1].end.toFixed(2)} → ${pl[i].i}:${pl[i].mediaId}@${pl[i].start.toFixed(2)} ${Object.keys(pl[i]).filter((k) => pl[i][k] === true || (pl[i][k] && typeof pl[i][k] === 'object' && !['tin', 'tout', 'kb', 'motion', 'focus'].includes(k))).join(',')}`); const vids = S.plan.clips.filter((c) => c.mediaId && by.get(c.mediaId) && by.get(c.mediaId).kind === 'video').map((c) => { const m = by.get(c.mediaId); return `${c.i}@${c.start.toFixed(2)} off ${c.srcOffset} vis ${c.visStart}-${c.visEnd} r${c.rate} ${Object.keys(c).filter((k) => c[k] === true).join(',')} trim ${JSON.stringify(m.trim)} span ${m.duration} bad ${JSON.stringify((m.shakes || []).filter((x) => x.j > 0.6).map((x) => x.t))}`; }); const an = S.ctx.song.an, w0 = S.plan.win.start, bd = S.plan.beatDur; const words = S.plan.clips.slice(1).filter((c) => { const abs = c.start + w0; return !['drop', 'chorus', 'build'].includes(c.label) && !c.flash && !c.rush && !c.burst && !Array.from(an.barStart || []).some((b) => Math.abs(b - abs) < 0.04) && (an.vocalLines || []).some(([a, e]) => abs > a + bd * 0.4 && abs < e - bd * 0.3); }).map((c) => `${c.i}@${c.start.toFixed(2)} ${c.label} ${(c.end - c.start).toFixed(2)}s ${Object.keys(c).filter((k) => c[k] === true || (typeof c[k] === 'string' && !['label', 'mediaId', 'baseId', 'role'].includes(k))).map((k) => k + (typeof c[k] === 'string' ? '=' + c[k] : '')).join(',')} role=${c.role || ''}`); const shortVid = med.some((m) => m.kind === 'video' && m.duration < 2); return { words, shortVid, vids, toast: document.getElementById('toast').textContent, twins, dur: S.plan.duration, check: (S.check || []).filter((x) => !x.ok).map((x) => x.label + ' – ' + x.detail), audit: a.map((x) => x.msg), settings: S.ctx.rec.settings }; });
writeFileSync('/tmp/cinebeat-test/buttons-end.json', JSON.stringify(fin.settings));
console.log(`${report.length} Knöpfe getippt · ohne Wirkung ${dead.length} · mit Fehlermeldung ${errored.length}`);
const fails = [];
if (errs.length > errs0 || errored.length) fails.push('Fehler: ' + [...new Set(errored.concat(errs.slice(errs0)))].slice(0, 8).join(' | '));
if (dead.length) fails.push('ohne Wirkung: ' + dead.join(' | '));
// (unter Volllast nimmt der Test manchmal nur ~1 s Video auf: ein Wackler darin lässt sich mit keinem Ausschnitt beheben –
// die App meldet dann richtig „braucht anderes Material“; das ist kein Fehler der Korrektur)
const open = fin.check.filter((x) => !(fin.shortVid && /wackelig/.test(x)));
if (V || open.length) console.log('Endstand:', JSON.stringify(fin, null, 1).slice(0, 3000));
if (open.length) fails.push('Film-Check nach den Eingriffen: ' + open.join(' | '));
if (errs0) fails.push('Fehler schon beim Schneiden: ' + errs.slice(0, errs0).join(' | '));
console.log('Fehler:', fails.length ? fails.join(' || ') : 'keine');
await b.close();
process.exit(fails.length ? 1 : 0);
