// Prüf-Set mit echten Reisen: jeder Unterordner von ./realset (oder REALSET=…) ist ein Ort mit echten Fotos und Videos,
// optional mit einem Song (song.mp3/.m4a/.wav). Der Ordner bleibt lokal (.gitignore) – private Aufnahmen kommen nie ins
// Repository. Jede Reise läuft wie in der App durch: Einlesen, Song, Wünsche, bester Schnitt. Gemessen wird der Film-Check
// (Einstieg, Takt, Abwechslung, Lesbarkeit, ruhige Videostellen, Gesang) und das Bildverständnis (gleiche Motive
// hintereinander, Titelplatz, Ortsname hinter den Bergen, schiefe Horizonte). Bericht: realset/_bericht/index.html mit einem
// Bild je Einstellung; Vergleich mit dem letzten Lauf (besser/schlechter je Ort).
// Aufruf: node test/realset.mjs   (Server wie bei den Tests: docs auf Port 8123)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
const ROOT = process.env.REALSET || new URL('../realset', import.meta.url).pathname;
const OUT = join(ROOT, '_bericht');
const MEDIA = /\.(jpe?g|png|heic|heif|webp|mp4|mov|m4v)$/i, SONG = /^song\.(mp3|m4a|aac|wav|flac|ogg)$/i;
if (!existsSync(ROOT)) {
  console.log(`Kein Prüf-Set gefunden. Lege echte Reisen als Ordner an:\n  ${ROOT}/Lissabon/*.jpg|*.mov (+ optional song.mp3)\n  ${ROOT}/Algarve/…\nDer Ordner ist in .gitignore – deine Aufnahmen bleiben auf diesem Rechner.`);
  process.exit(0);
}
const trips = readdirSync(ROOT).filter((d) => !d.startsWith('_') && statSync(join(ROOT, d)).isDirectory());
mkdirSync(OUT, { recursive: true });
const last = existsSync(join(OUT, 'letzter.json')) ? JSON.parse(readFileSync(join(OUT, 'letzter.json'), 'utf8')) : {};
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = {};
for (const name of trips) {
  const dir = join(ROOT, name);
  const files = readdirSync(dir).filter((f) => MEDIA.test(f)).map((f) => join(dir, f));
  const song = readdirSync(dir).find((f) => SONG.test(f));
  if (!files.length) continue;
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(process.env.APP || 'http://127.0.0.1:8123/index.html');
  await page.waitForSelector('.place');
  await page.click('#addPlace');
  await page.waitForFunction(() => CineBeat.S.ctx && CineBeat.S.ctx.kind === 'place' && document.getElementById('busy').hidden, null, { timeout: 60000 });
  await page.fill('#placeName', name);
  const t0 = Date.now();
  await page.setInputFiles('#fileMedia2', files);
  await page.waitForFunction((n) => CineBeat.S.ctx.media.length >= n && CineBeat.S.ctx.media.every((m) => !m.loading) && document.getElementById('busy').hidden, files.length, { timeout: 600000 });
  const ingestS = (Date.now() - t0) / 1000;
  if (song) {
    await page.setInputFiles('#fileMusic', join(dir, song));
    await page.waitForFunction(() => CineBeat.S.ctx.song && document.getElementById('busy').hidden && document.querySelector('#flowStage [data-flow="cut"]'), null, { timeout: 300000 });
  } else {
    await page.click('#flowStage [data-flow="demo"]').catch(() => {});
    await page.waitForFunction(() => document.getElementById('busy').hidden && document.querySelector('#flowStage [data-flow="cut"]'), null, { timeout: 300000 });
  }
  await page.click('#flowStage [data-flow="cut"]');
  await page.waitForSelector('#wishGo');
  await page.click('#wishGo');
  await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden && document.getElementById('flowStage').hidden, null, { timeout: 600000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const S = CineBeat.S, p = S.plan, byId = new Map(S.ctx.media.map((m) => [m.id, m]));
    const vis = S.ctx.media.filter((m) => m.kind === 'image');
    return {
      material: { fotos: vis.length, videos: S.ctx.media.length - vis.length, mitFingerabdruck: vis.filter((m) => m.sig).length, himmelslinie: vis.filter((m) => m.skyline).length, schief: vis.filter((m) => m.tilt).length, doppel: vis.filter((m) => m.dupOf).length },
      film: { dauer: +p.duration.toFixed(1), einstellungen: p.visibleClips, aufnahmen: p.usedMedia, einstieg: p.intro, ende: p.outro, look: p.look, song: S.ctx.song.name, moll: S.ctx.song.an.mood && S.ctx.song.an.mood.minor, gesangszeilen: (S.ctx.song.an.vocalLines || []).length },
      check: (S.check || []).map((x) => ({ key: x.key, ok: x.ok, label: x.label })),
      titel: p.overlays.filter((o) => o.place).map((o) => ({ typ: o.type, y: o.place.y, schrift: o.place.ink, abdunkeln: o.place.scrim, hinterBergen: !!o.behind })),
      clips: p.clips.filter((c) => c.mediaId).map((c) => ({ t: +((c.start + c.end) / 2).toFixed(2), name: (byId.get(c.mediaId) || {}).name, kind: c.flash || c.rush ? 'flut' : c.split ? 'split' : (byId.get(c.mediaId) || {}).kind })),
      notes: p.notes,
    };
  });
  // ein Bild je Einstellung (höchstens 40) für den Bericht
  const shots = [];
  const plain = r.clips.filter((c) => c.kind !== 'flut').slice(0, 40);
  mkdirSync(join(OUT, name), { recursive: true });
  for (let k = 0; k < plain.length; k++) {
    await page.evaluate((t) => CineBeat.engine.renderStill(t), plain[k].t);
    await page.waitForTimeout(250);
    const f = `${name}/${String(k).padStart(2, '0')}.jpg`;
    await page.locator('#monitor').screenshot({ path: join(OUT, f), type: 'jpeg', quality: 70 });
    shots.push({ f, ...plain[k] });
  }
  const okN = r.check.filter((x) => x.ok).length;
  report[name] = { ...r, shots, okN, ingestS: +ingestS.toFixed(1), errs };
  const prev = last[name];
  console.log(`${name}: ${files.length} Aufnahmen, Film ${r.film.dauer} s, ${r.film.einstellungen} Einstellungen, Film-Check ${okN}/${r.check.length}${prev ? ` (vorher ${prev.okN}/${prev.check.length})` : ''}${errs.length ? ' · Fehler: ' + errs.join(' | ') : ''}`);
  for (const x of r.check) if (!x.ok) console.log('   !', x.label);
  await page.context().close();
}
await b.close();
writeFileSync(join(OUT, 'letzter.json'), JSON.stringify(Object.fromEntries(Object.entries(report).map(([k, v]) => [k, { okN: v.okN, check: v.check }])), null, 1));
writeFileSync(join(OUT, 'bericht.json'), JSON.stringify(report, null, 1));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CineBeat Prüf-Set</title>
<style>body{margin:0;padding:16px;background:#0b0b0d;color:#f3f3f1;font:14px/1.5 system-ui,sans-serif}h2{margin:28px 0 6px}.c{display:flex;flex-wrap:wrap;gap:6px}.c figure{margin:0;width:120px}.c img{width:120px;border-radius:6px;display:block}.c figcaption{font-size:11px;color:#9b9ba3}.ok{color:#7aa7ff}.no{color:#ff6b5e}ul{padding-left:18px}</style>
<h1>Prüf-Set mit echten Reisen</h1>
${Object.entries(report).map(([n, r]) => `<h2>${esc(n)} · Film-Check ${r.okN}/${r.check.length}</h2>
<p>${r.material.fotos} Fotos, ${r.material.videos} Videos · Film ${r.film.dauer} s, ${r.film.einstellungen} Einstellungen · Einstieg ${esc(r.film.einstieg)} · Look ${esc(r.film.look)} · Song ${esc(r.film.song)}${r.film.moll != null ? (r.film.moll ? ' (Moll)' : ' (Dur)') : ''}</p>
<ul>${r.check.map((x) => `<li class="${x.ok ? 'ok' : 'no'}">${x.ok ? '✓' : '!'} ${esc(x.label)}</li>`).join('')}</ul>
<p>Titel: ${r.titel.map((t) => `${t.typ} bei ${Math.round(t.y * 100)} %, ${t.schrift === 'dark' ? 'dunkle' : 'helle'} Schrift${t.abdunkeln ? ', Abdunklung ' + Math.round(t.abdunkeln * 100) + ' %' : ''}${t.hinterBergen ? ', hinter den Bergen' : ''}`).join(' · ') || '–'}</p>
<div class="c">${r.shots.map((s) => `<figure><img src="${esc(s.f)}" loading="lazy"><figcaption>${s.t}s · ${esc(s.name)}</figcaption></figure>`).join('')}</div>`).join('')}`;
writeFileSync(join(OUT, 'index.html'), html);
console.log('Bericht:', join(OUT, 'index.html'));
