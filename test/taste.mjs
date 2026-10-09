// Lernen aus Korrekturen: Wer Landschaften ausschließt und Bilder mit Menschen hereinholt, bekommt beim nächsten Schnitt
// (Beste Auswahl) mehr Menschen – begrenzt: ein deutlich stärkeres Bild bleibt im Film. Eigene Videolängen ziehen die
// automatische Länge sanft mit. In der App: Anzeige „Gelernt …“ und „Vergessen“.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async () => {
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const an = (await beatSong(beatRecipe('sommer', {}, { seed: 3, form: 'story' }))).an;
  const base = demoScenes(), T0 = Date.UTC(2026, 4, 1, 9), media = [];
  for (let i = 0; i < 40; i++) {
    const c = base[i % base.length], ppl = i % 2 === 0;
    media.push({ id: 't' + i, kind: 'image', name: 'T' + i, canvas: c, w: 4000, h: 3000, time: T0 + i * 13 * 60000, ...scoreImage(c, c.width, c.height),
      faceBox: ppl ? [[0.4, 0.3, 0.12, 0.16]] : [], horizon: ppl ? null : 0.4, sky: ppl ? 0.1 : 0.5, score: 0.5 + rnd() * 0.2, hash: [i * 7919 + 1, i * 104729 + 3], avg: [80 + (i * 37) % 120, 110, 160 - (i * 11) % 90], vis: 4 });
  }
  const S0 = { format: '9:16', target: 'story', look: 'natur', pace: 'auto', intro: 'hook', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 5, effekte: 'schlicht', allMedia: 'off' };
  const used = (pl) => new Set(pl.clips.filter((c) => c.mediaId).map((c) => c.mediaId));
  const pplShare = (pl) => { const u = [...used(pl)].map((id) => media.find((m) => m.id === id)).filter((m) => m && m.kind === 'image'); return u.filter((m) => m.faceBox.length).length / Math.max(1, u.length); };
  let taste = null;
  for (let k = 0; k < 4; k++) { taste = tasteLearn(taste, media[k * 2 + 1], -1); taste = tasteLearn(taste, media[k * 2], 1); }
  const p0 = buildPlan({ an, media: media.map((m) => ({ ...m })), settings: S0, overrides: { texts: [], stickers: [] } });
  const p1 = buildPlan({ an, media: media.map((m) => ({ ...m })), settings: S0, overrides: { texts: [], stickers: [] }, taste });
  // Grenze: ein Landschaftsbild mit deutlich höherer Qualität bleibt drin
  const strong = media.map((m) => ({ ...m }));
  strong[3].score = 0.95; strong[3].sharp = 0.95;
  const p2 = buildPlan({ an, media: strong, settings: S0, overrides: { texts: [], stickers: [] }, taste });
  // Videolänge: deutlich längere eigene Längen → längere automatische Videos
  const vid = { id: 'v1', kind: 'video', name: 'V', w: 1920, h: 1080, duration: 20, time: T0, score: 0.6, highlights: [{ t: 9, score: 0.7 }], hits: [], hash: [1, 2], focus: [0.5, 0.45], fps: 30 };
  const vlen = (t) => { const pl = buildPlan({ an, media: [...media.slice(0, 8).map((m) => ({ ...m })), { ...vid }], settings: { ...S0, format: '16:9', target: undefined, allMedia: 'off' }, overrides: { texts: [], stickers: [] }, taste: t }); return pl.clips.filter((c) => c.mediaId === 'v1').reduce((a, c) => a + c.end - c.start, 0); };
  return { share0: +pplShare(p0).toFixed(2), share1: +pplShare(p1).toFixed(2), strongIn: used(p2).has('t3'), w: taste.w.map((x) => +x.toFixed(2)), summary: tasteSummary(taste), v0: +vlen(null).toFixed(2), v1: +vlen({ ...taste, vlenF: 1.4 }).toFixed(2), bonus: +tasteBonus(taste, media[0]).toFixed(3) };
});
console.log(JSON.stringify(r));
const fails = [];
// (sanft: ein kleiner Bonus, kein Umsturz der Auswahl)
if (!(r.share1 > r.share0 + 0.04)) fails.push(`gelernte Vorliebe wirkt nicht (Menschen ${r.share0} → ${r.share1})`);
if (!r.strongIn) fails.push('ein deutlich stärkeres Bild fiel der Vorliebe zum Opfer');
if (!/mehr Menschen/.test(r.summary)) fails.push('Zusammenfassung ohne „mehr Menschen“: ' + r.summary);
if (Math.abs(r.bonus) > 0.1001) fails.push('Bonus nicht begrenzt');
if (!(r.v1 > r.v0 + 0.3)) fails.push(`Videolänge folgt nicht (${r.v0} → ${r.v1})`);
// App: Anzeige und Vergessen
{
  const pg = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await pg.goto('http://127.0.0.1:8123/index.html');
  await pg.evaluate(() => localStorage.setItem('cinebeat-taste', JSON.stringify({ w: [0.8, -0.6, 0, 0, 0, 0, -0.5], n: 6 })));
  await pg.reload();
  await pg.waitForSelector('.place');
  await pg.click('#addPlace');
  await pg.waitForFunction(() => CineBeat.S.ctx && document.getElementById('busy').hidden, null, { timeout: 60000 });
  await pg.click('[data-tab="material"]').catch(() => {});
  await pg.waitForTimeout(400);
  const line = await pg.evaluate(() => { const el = document.getElementById('tasteLine'); return el && !el.hidden ? el.textContent : ''; });
  if (!/mehr Menschen/.test(line)) fails.push('App zeigt das Gelernte nicht: ' + line);
  await pg.click('#tasteReset').catch(() => fails.push('Vergessen-Knopf fehlt'));
  const after = await pg.evaluate(() => [localStorage.getItem('cinebeat-taste'), document.getElementById('tasteLine').hidden]);
  if (after[0] || !after[1]) fails.push('Vergessen wirkt nicht');
  console.log('App:', line.replace(/\s+/g, ' ').trim());
}
console.log('Fehler:', fails.length ? fails.join(' | ') : 'keine');
await b.close();
process.exit(fails.length ? 1 : 0);
