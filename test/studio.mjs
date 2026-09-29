// Beat-Studio: eigene Beats. Je Stil: reproduzierbar (gleiches Rezept = gleicher Ton), sauber (keine NaN, Spitze
// −1 dBFS), Songbogen hörbar (Drop lauter als Strophe lauter als Intro), Raster exakt (Schläge = Komposition),
// Schnitt stimmig (planAudit + planSyncAudit ohne Befund, auch mit Kino-Rollladen: Einsatz genau auf dem Drop).
// Dazu die Bedienung in der App: Studio öffnen, vorhören, verwenden, Film schneiden, neu laden – derselbe Ton.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fails = [];
{
  const p = await b.newPage();
  p.on('pageerror', (e) => fails.push('pageerror ' + e.message));
  await p.goto('http://127.0.0.1:8124/test/pipeline.html');
  const r = await p.evaluate(async () => {
    const f = [], info = {};
    const base = demoScenes(), T0 = new Date(2026, 4, 3, 9, 0).getTime();
    const media = Array.from({ length: 24 }, (_, i) => { const c = base[i % base.length]; return { id: 'p' + i, kind: 'image', name: 'P' + i, canvas: c, w: c.width, h: c.height, time: T0 + i * 11 * 60000, ...scoreImage(c, c.width, c.height), hash: [i * 7919, i * 31] }; });
    const sum = (buf) => { let s = 0; const d = buf.getChannelData(0); for (let i = 0; i < d.length; i += 97) s = (s + Math.round(d[i] * 1e6)) | 0; return s; };
    const EN = Object.keys(BEAT_ENERGY);
    for (const [si, id] of Object.keys(BEAT_STYLES).entries()) {
      const st = { format: '9:16', target: 'story', look: 'auto', pace: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 3, title: 'Lissabon', intro: id === 'gipfel' ? 'shutter' : 'auto' };
      const rec = beatRecipe(id, st, { seed: 4, energy: EN[si % 3] });
      const t = performance.now();
      const { buffer, truth } = await renderBeat(rec);
      const ms = performance.now() - t;
      const again = await renderBeat(rec);
      if (sum(buffer) !== sum(again.buffer)) f.push(`${id}: nicht reproduzierbar`);
      const d = buffer.getChannelData(0), sr = buffer.sampleRate;
      let nan = 0, pk = 0; for (let i = 0; i < d.length; i++) { if (!Number.isFinite(d[i])) nan++; pk = Math.max(pk, Math.abs(d[i])); }
      if (nan || pk > 0.9 || pk < 0.8) f.push(`${id}: Pegel ${pk.toFixed(2)} / NaN ${nan}`);
      const rms = (s) => { let a = 0, n = 0; for (let i = Math.floor(s.start * sr); i < Math.floor(s.end * sr); i++) { a += d[i] * d[i]; n++; } return 20 * Math.log10(Math.sqrt(a / Math.max(1, n)) + 1e-9); };
      const lv = (lab) => Math.max(...truth.sections.filter((s) => s.label === lab).map(rms));
      const arc = { intro: lv('intro'), drop: lv('drop'), build: lv('build') };
      if (!(arc.drop > arc.build + 1.5 && arc.build > arc.intro + 4)) f.push(`${id}: kein Songbogen ${JSON.stringify(arc)}`);
      const an = await analyzeBeat(buffer, truth);
      const B = 60 / rec.bpm;
      if (Array.from(an.beats).some((x, i) => Math.abs(x - (truth.t0 + i * B)) > 1e-6)) f.push(`${id}: Schläge nicht exakt`);
      if (an.sections.find((s) => s.label === 'drop').start !== truth.sections.find((s) => s.label === 'drop').start) f.push(`${id}: Drop nicht aus der Komposition`);
      const plan = buildPlan({ an, media, settings: st, overrides: { texts: [], stickers: [] } });
      const iss = planAudit(plan, media, an).concat(planSyncAudit(plan, an).map((x) => ({ code: x.kind, t: x.t, msg: x.msg })));
      for (const it of iss) f.push(`${id} @${it.t}s [${it.code}] ${it.msg}`);
      // der erste Drop im Film ist ein Schnitt, mit dem Rollladen genau der Einsatz
      const drop = an.sections.find((s) => s.label === 'drop' && s.start >= plan.win.start - 0.01 && s.start < plan.win.end);
      if (!drop || !plan.clips.some((c) => Math.abs(c.start - (drop.start - plan.win.start)) < 0.002)) f.push(`${id}: Drop kein Schnitt`);
      if (st.intro === 'shutter') { const sh = plan.overlays.find((o) => o.type === 'shutter'); if (!sh || Math.abs(sh.end - (drop.start - plan.win.start)) > 0.03) f.push(`${id}: Rollladen-Einsatz nicht auf dem Drop`); }
      // Lautheit wie aktuelle Produktionen: Drop kräftig (Chill ≥ −17,5, Vibe ≥ −15,5, Hype ≥ −14 dB RMS; Lo-Fi bleibt luftiger)
      if (arc.drop < [-17.5, -15.5, -14][si % 3]) f.push(`${id} ${rec.energy}: Drop zu leise ${arc.drop.toFixed(1)} dB`);
      info[id] = { en: rec.energy, bpm: rec.bpm, s: +buffer.duration.toFixed(0), ms: Math.round(ms), film: +plan.duration.toFixed(1), arc: Object.values(arc).map((x) => +x.toFixed(0)).join('/') };
    }
    // Abstimmung auf die Einstellungen
    const st0 = { target: 'story' };
    const sg = suggestBeats({ look: 'diner' });
    if (sg[0].id !== 'diner') f.push('Diner-Look schlägt nicht Diner Funk vor');
    if (beatRecipe('lofi', { variant: 'ruhig' }).bpm >= beatRecipe('lofi', { variant: 'energisch' }).bpm) f.push('Tempo folgt nicht der Variante');
    if (beatRecipe('lofi', { variant: 'ruhig' }).energy !== 'chill' || beatRecipe('glow', { variant: 'energisch' }).energy !== 'hype') f.push('Energie folgt nicht der Variante');
    if (!['drift', 'bounce'].includes(suggestBeats({ variant: 'energisch', mv: 'on', target: 'reel' })[0].id)) f.push('energisches Reel schlägt keinen Trend-Beat vor');
    // ältere Rezepte (v1) klingen unverändert: kein Energie-Schub, kein Teaser
    { const o = beatRecipe('sommer', st0, { seed: 2 }); o.v = 1; const a = await renderBeat(o, { preview: true }), c = await renderBeat({ ...o, energy: 'hype' }, { preview: true }); if (sum(a.buffer) !== sum(c.buffer)) f.push('v1-Rezept hängt von der Energie ab'); }
    const sh = beatRecipe('stadt', { intro: 'shutter', target: 'story' });
    if (sh.pre !== 5 || beatForm(sh.form, sh.pre).slice(0, 2).reduce((a, x) => a + x[1], 0) !== 5) f.push('Rollladen: Drop nicht nach fünf Takten');
    return { f, info };
  });
  fails.push(...r.f);
  if (process.argv.includes('-v')) console.log(JSON.stringify(r.info));
  await p.close();
}
{
  // App: Beat-Studio bedienen, Film schneiden, neu laden
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('cinebeat-level', 'bench'); } catch (e) { /* egal */ } });
  page.on('pageerror', (e) => fails.push('pageerror ' + e.message));
  await page.goto('http://127.0.0.1:8123/index.html');
  await page.waitForSelector('.place', { timeout: 30000 });
  await page.click('.place');
  const idle = () => page.waitForFunction(() => CineBeat.S.ctx && CineBeat.S.ctx.song && document.getElementById('busy').hidden, null, { timeout: 180000 });
  await idle();
  await page.click('[data-tab="music"]');
  await page.click('#beatSong');
  await page.waitForSelector('.beat-card');
  const cards = await page.$$eval('.beat-card', (x) => x.length);
  if (cards !== 13) fails.push('Stilkarten: ' + cards);
  const trend = await page.$$eval('.beat-card .bc-trend', (x) => x.length);
  if (trend !== 4) fails.push('Trend-Kennzeichen: ' + trend);
  await page.click('.beat-card[data-style="nacht"]');
  await page.waitForFunction(() => document.getElementById('beatPlay').textContent.includes('Stopp'), null, { timeout: 60000 }).catch(() => fails.push('Vorhören startet nicht'));
  await page.click('#beatTempo [data-v="schnell"]');
  await page.click('#beatEnergy [data-v="hype"]');
  await page.click('#beatUse');
  await page.waitForTimeout(500);
  await idle();
  const s1 = await page.evaluate(() => { const g = CineBeat.S.ctx.song; const d = g.buffer.getChannelData(0); let s = 0; for (let i = 0; i < d.length; i += 97) s = (s + Math.round(d[i] * 1e6)) | 0; return { gen: g.gen, id: g.id, name: g.name, sum: s, eng: CineBeat.engine.audioBuffer === g.buffer, ig: document.getElementById('igLine').textContent }; });
  if (!s1.gen || s1.gen.style !== 'nacht' || s1.gen.tempo !== 'schnell' || s1.gen.energy !== 'hype' || !/Hype/.test(s1.name)) fails.push('Beat nicht übernommen: ' + JSON.stringify(s1.gen));
  // Film schneiden (falls der Ort noch im Song-Schritt ist) und prüfen, dass der Ton der eigene Beat ist
  const cut = await page.$('[data-flow="cut"]');
  if (cut) { await cut.click(); await page.waitForTimeout(500); await idle(); }
  await page.waitForFunction(() => CineBeat.S.plan, null, { timeout: 120000 });
  const eng = await page.evaluate(() => CineBeat.engine.audioBuffer === CineBeat.S.ctx.song.buffer);
  if (!eng) fails.push('Vorschau/Export nicht mit dem eigenen Beat');
  const ig = await page.textContent('#igLine');
  if (!/Eigener Beat/.test(ig)) fails.push('Instagram-Hinweis fehlt: ' + ig);
  // neu laden: der gespeicherte Beat entsteht aus seinem Rezept neu – derselbe Ton, dieselbe Analyse
  // (gespeichert wird nur das Rezept, keine Tondatei; Zwischenspeicher leeren wie nach einem Neustart)
  await page.waitForTimeout(800);
  const rec = await page.evaluate(async (id) => { const r = await CineBeat.S.store.get('work', id); return r && { gen: !!r.gen, file: !!r.file, pcm: !!r.pcm }; }, s1.id);
  if (!rec || !rec.gen || rec.file || rec.pcm) fails.push('Beat nicht als Rezept gespeichert: ' + JSON.stringify(rec));
  const s2 = await page.evaluate(async (id) => { CineBeat.S.songs.delete(id); const g = await CineBeat.getSong(id); const d = g.buffer.getChannelData(0); let s = 0; for (let i = 0; i < d.length; i += 97) s = (s + Math.round(d[i] * 1e6)) | 0; return { id: g.id, sum: s, gen: !!g.gen, beats: g.an.beats.length }; }, s1.id);
  if (s2.id !== s1.id || s2.sum !== s1.sum || !s2.gen) fails.push(`nach Neuladen anderer Ton (${JSON.stringify([s1.id, s1.sum, s2])})`);
  await ctx.close();
}
await b.close();
console.log(fails.length ? `FAIL ${fails.length}\n` + fails.slice(0, 30).join('\n') : 'OK studio');
process.exit(fails.length ? 1 : 0);
