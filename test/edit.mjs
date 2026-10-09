// Eigene Eingriffe wirken genau so, wie gewählt – und nur dort:
// Ausschließen nimmt genau diese Aufnahme heraus (nichts anderes fällt weg), Einstellungs-Änderungen (Übergang, Tempo,
// Ausschnitt) hängen an der Aufnahme und überleben jede Änderung am Schnitt, Verschieben landet exakt vor dem Ziel (auch
// Videos, Stapel, Tagesgrenzen), eine festgelegte Videolänge gilt auf den Schlag genau, die Bilderflut zeigt im
// Viertelschlag Bilder, die ohnehin lang im Film sind, Wir-Bilder bekommen die langen Plätze, der Kino-Vorhang öffnet
// in Zügen auf den echten Schlägen. Danach dasselbe über die Oberfläche der App (Material, Einstellung, Rückgängig).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
const OUT = (process.env.OUT || '/tmp/cinebeat-test') + '/edit';
mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/Song.wav`, { bpm: 122 });
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fails = [];
const wav = readFileSync(`${OUT}/Song.wav`).toString('base64');
{
  const p = await b.newPage();
  p.on('pageerror', (e) => fails.push('pageerror ' + e.message));
  await p.goto('http://127.0.0.1:8124/test/pipeline.html');
  const r = await p.evaluate(async (b64) => {
    const f = [], info = {};
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const an = await analyzeAudio(await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer));
    const B = an.beatPeriod, base = demoScenes(), T0 = new Date(2026, 4, 3, 9, 0).getTime();
    const media = [];
    // zwei Tage, je Vormittag und Abend; jedes sechste Foto „Wir“
    for (let i = 0; i < 28; i++) { const c = base[i % base.length]; const day = Math.floor(i / 14), h = i % 14 < 7 ? 9 : 17; media.push({ id: 'p' + i, kind: 'image', name: 'P' + i, canvas: c, w: c.width, h: c.height, time: T0 + day * 864e5 + (h - 9) * 36e5 + (i % 7) * 9 * 60000, ...scoreImage(c, c.width, c.height), score: 0.4 + ((i * 37) % 50) / 100, hash: [i * 7919, i * 104729], us: i % 6 === 2 ? true : undefined }); }
    [4, 9, 16, 22].forEach((d, k) => media.push({ id: 'v' + k, kind: 'video', name: 'V' + k, w: 1080, h: 1920, duration: d, time: T0 + Math.floor(k / 2) * 864e5 + (k % 2 ? 8 : 0) * 36e5 + 25 * 60000, score: 0.6, sharp: 0.6, color: 0.5, motion: 0.05, luma: 0.45, avg: [120, 120, 110], highlights: [{ t: d * 0.5, score: 0.7 }], hash: [k * 31, k * 77], focus: [0.5, 0.45] }));
    // im Film: jede Aufnahme mit eigenem Platz, im Split/Stapel oder in einer verdichtenden Serie (nicht die Bilderflut, die nur wiederholt)
    const ids = (pl) => { const s = []; for (const c of pl.clips) { if (c.loop || c.flash || ['rush', 'recap', 'leader', 'rew', 'tease', 'reveal'].includes(c.role)) continue; for (const id of c.split ? c.split.ids : c.stack ? c.stack.ids : [c.mediaId]) if (id && !s.includes(id)) s.push(id); } return s; };
    const own = (pl, id) => pl.clips.filter((c) => c.mediaId === id && !c.split && !c.burst && !c.rush && !c.leader);
    const plan = (st, ov = {}) => buildPlan({ an, media, settings: st, overrides: { texts: [], stickers: [], ...ov } });
    for (const st0 of [{ target: 'story' }, { target: 'reel' }, { format: '16:9' }]) {
      const nm = st0.target || st0.format;
      const st = { format: '9:16', look: 'auto', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 3, title: 'Porto', ...st0 };
      const P0 = plan(st), S0 = ids(P0);
      // 1. ausschließen: genau diese Aufnahme fehlt, alle anderen bleiben
      for (const X of [S0[4], S0.find((id) => id[0] === 'v')]) {
        media.find((m) => m.id === X).excluded = true;
        const S1 = ids(plan(st));
        media.find((m) => m.id === X).excluded = false;
        if (S1.includes(X)) f.push(`${nm}: ${X} trotz Ausschluss im Film`);
        const lost = S0.filter((id) => id !== X && !S1.includes(id));
        if (lost.length) f.push(`${nm}: Ausschluss von ${X} nimmt auch ${lost.join(',')} heraus`);
      }
      // 2. Einstellungs-Änderungen hängen an der Aufnahme: nach einem Ausschluss davor bleiben sie, wo sie hingehören
      const Y = S0.find((id, k) => k > 10 && id[0] === 'p' && own(P0, id).length), V = S0.find((id) => id[0] === 'v' && own(P0, id).length);
      const ovm = { media: { [Y]: { trans: TR.DIP }, [V]: { speed: 0.5 } } };
      // (ausgeschlossen wird ein Foto weit vorn, nie die beiden geprüften Aufnahmen selbst)
      const X2 = S0.find((id, k) => k >= 2 && id !== Y && id !== V && id[0] === 'p');
      media.find((m) => m.id === X2).excluded = true;
      const P2 = plan(st, ovm);
      media.find((m) => m.id === X2).excluded = false;
      const cy = own(P2, Y)[0], cv = own(P2, V)[0];
      if (own(P2, Y).length && (!cy || !cy.tin || cy.tin.type !== TR.DIP)) f.push(`${nm}: Übergang hängt nicht mehr an ${Y} (${cy && JSON.stringify({ i: cy.i, tin: cy.tin, start: cy.start, len: cy.end - cy.start, prev: P2.clips[cy.i - 1] && Object.keys(P2.clips[cy.i - 1]).filter((k) => P2.clips[cy.i - 1][k] === true) })})`);
      if (!cv || Math.abs((cv.rate || 1) - 0.5) > 0.01) f.push(`${nm}: Zeitlupe hängt nicht mehr an ${V} (${cv && cv.rate})`);
      // ältere Projekte (Änderungen nach Platznummer) gelten weiter, bis die App sie umstellt
      const k0 = P0.clips.indexOf(own(P0, Y)[0]);
      const PL = plan(st, { clips: { [k0]: { trans: TR.DIP } } });
      if (!PL.clips[k0].tin || PL.clips[k0].tin.type !== TR.DIP) f.push(`${nm}: ältere Einstellungs-Änderung wirkt nicht`);
      // 3. verschieben: exakt vor das Ziel
      const L = S0.length, cases = [[S0[L - 2], S0[2]], [S0[3], S0[L - 3]], [S0[8], S0[9]], [S0[10], S0[6]]];
      for (const v of ['v0', 'v1', 'v2', 'v3']) if (S0.includes(v)) { const k = S0.indexOf(v); cases.push([v, S0[Math.max(1, k - 6)]], [v, S0[Math.min(L - 1, k + 7)]]); }
      for (const [id, before] of cases) {
        if (!id || id === before) continue;
        const S = ids(plan(st, { moves: [{ id, before }] }));
        if (S.indexOf(id) < 0 || S.indexOf(id) !== S.indexOf(before) - 1) f.push(`${nm}: ${id} vor ${before} verschoben, steht an ${S.indexOf(id)} (Ziel ${S.indexOf(before)})`);
        if (S0.some((x) => !S.includes(x))) f.push(`${nm}: Verschieben verliert ${S0.filter((x) => !S.includes(x)).join(',')}`);
      }
      // 4. Länge im Film: genau so lang (auf den Schlag gerundet), auch mit Ausschnitt; nichts fällt weg
      for (const [vid, tr, vl] of [['v2', [2, 5], 3], ['v3', [1, 13], 12], ['v1', null, 9], ['v0', null, 1.5]]) {
        const m = media.find((x) => x.id === vid);
        m.trim = tr; m.vlen = vl;
        const P = plan(st);
        const cs = own(P, vid), len = cs.reduce((a, c) => a + c.end - c.start, 0);
        m.trim = null; m.vlen = 0;
        if (Math.abs(len - vl) > B * 1.05) f.push(`${nm}: ${vid} soll ${vl} s laufen, läuft ${len.toFixed(2)} s`);
        if (tr && cs.some((c) => c.srcOffset < tr[0] - 0.05 || c.srcOffset + (c.visEnd - c.visStart) * (c.rate || 1) > tr[1] + 0.05)) f.push(`${nm}: ${vid} läuft außerhalb des Ausschnitts`);
        const lost = S0.filter((x) => !ids(P).includes(x));
        if (lost.length) f.push(`${nm}: Videolänge ${vid} verliert ${lost.join(',')}`);
      }
      // 5. Wir-Bilder auf den langen Plätzen
      const img = P0.clips.filter((c) => !c.burst && !c.rush && !c.split && !c.grid && !c.stack && !c.miniRew && c.role !== 'hook' && media[c.mediaIndex] && media[c.mediaIndex].kind === 'image');
      const wir = img.filter((c) => media[c.mediaIndex].us === true), top = img.slice().sort((a, x) => (x.end - x.start) - (a.end - a.start)).slice(0, wir.length);
      const nTop = top.filter((c) => media[c.mediaIndex].us === true).length;
      const avg = (a) => a.reduce((s, c) => s + c.end - c.start, 0) / Math.max(1, a.length);
      // je Tagesblock (dort darf die Regie frei ordnen) steht ein Wir-Foto am längsten, und im Mittel deutlich länger
      for (const blk of new Set(img.map((c) => dayBlock(media[c.mediaIndex])))) {
        const inB = img.filter((c) => dayBlock(media[c.mediaIndex]) === blk), w = inB.filter((c) => wir.includes(c)), o = inB.filter((c) => !wir.includes(c));
        const mx = (a) => Math.max(0, ...a.map((c) => c.end - c.start));
        if (w.length && o.length && mx(w) < mx(o) - B * 0.55) f.push(`${nm}: Tagesblock ${blk}: längstes Wir-Foto ${mx(w).toFixed(2)} s, anderes ${mx(o).toFixed(2)} s [${inB.map((c) => `${c.mediaId}${wir.includes(c) ? '*' : ''}:${(c.end - c.start).toFixed(2)}@${c.i}${c.hookNext ? 'H' : ''}${c.sectionChange ? 'S' : ''}`).join(' ')}]`);
      }
      if (avg(wir) < avg(img.filter((c) => !wir.includes(c))) * 1.5) f.push(`${nm}: Wir-Fotos im Mittel nicht deutlich länger (${avg(wir).toFixed(2)} s)`);
      info[nm] = { D: +P0.duration.toFixed(1), wir: `${nTop}/${wir.length}`, wirAvg: +avg(wir).toFixed(2), wl: wir.map((c) => `${c.mediaId}:${(c.end - c.start).toFixed(2)}@${c.i}`).join(' '), top: top.map((c) => `${c.mediaId}:${(c.end - c.start).toFixed(2)}@${c.i}`).join(' ') };
    }
    // 6. Bilderflut: Viertelschlag, Bilder, die ohnehin lang im Film stehen, nie zweimal direkt hintereinander
    for (const st0 of [{ target: 'story', burst: 'drop' }, { target: 'reel', variant: 'energisch' }]) {
      const st = { format: '9:16', look: 'auto', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 3, title: 'Porto', ...st0 };
      const P = plan(st), fl = P.clips.filter((c) => c.flash);
      const long = new Set(P.clips.filter((c) => !c.burst && !c.rush && c.end - c.start >= B * 0.95).flatMap((c) => (c.split ? c.split.ids : [c.mediaId])));
      if (fl.length < 8) f.push(`Bilderflut ${st0.target}: nur ${fl.length} Bilder`);
      if (fl.some((c) => Math.abs(c.end - c.start - B / 4) > 0.03)) f.push(`Bilderflut ${st0.target}: nicht im Viertelschlag`);
      if (fl.some((c) => !long.has(c.mediaId))) f.push(`Bilderflut ${st0.target}: zeigt Bilder, die nicht lang im Film stehen`);
      if (fl.some((c, k) => k && fl[k - 1].mediaId === c.mediaId)) f.push(`Bilderflut ${st0.target}: dasselbe Bild direkt hintereinander`);
      if (P._m.repeats) f.push(`Bilderflut ${st0.target}: ${P._m.repeats} Wiederholungen gezählt`);
      const iss = planAudit(P, media, an).concat(planSyncAudit(P, an).map((x) => ({ code: x.kind, t: x.t, msg: x.msg })));
      for (const it of iss.slice(0, 3)) f.push(`Bilderflut ${st0.target} @${(+it.t).toFixed(2)} [${it.code}] ${it.msg}`);
    }
    // 7. Kino-Vorhang: nach dem Schwarz jeder Bildwechsel und jeder Zug des Öffnens auf einem echten Schlag
    {
      const st = { format: '9:16', look: 'auto', pace: 'auto', intro: 'shutter', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 3, title: 'Porto', target: 'story' };
      const P = plan(st), sh = P.overlays.find((o) => o.type === 'shutter');
      const grid = []; const bt = Array.from(an.beats).map((x) => x - P.win.start);
      for (let i = 0; i + 1 < bt.length; i++) grid.push(bt[i], (bt[i] + bt[i + 1]) / 2);
      const on = (t) => grid.some((x) => Math.abs(x - t) < 0.005);
      // (der Vorhang öffnet sich ruhig und gleichmäßig: Beginn und Ende auf den Schlägen)
      if (!sh || !sh.glide) f.push('Vorhang: öffnet nicht gleichmäßig');
      else if (!on(sh.open) || !on(sh.end - 0.02)) f.push('Vorhang: Öffnen nicht auf den Schlägen ' + [sh.open, sh.end].map((t) => t.toFixed(3)).join(','));
      const rc = P.clips.filter((c) => c.rush && c.start >= sh.open - 0.01);
      if (rc.some((c) => !on(c.start))) f.push('Vorhang: Bildwechsel nach dem Schwarz neben dem Schlag ' + rc.filter((c) => !on(c.start)).map((c) => c.start.toFixed(3)).join(','));
    }
    return { f, info };
  }, wav);
  fails.push(...r.f);
  if (process.argv.includes('-v')) console.log(JSON.stringify(r.info));
  await p.close();
}
// App: Material, Einstellung, Ort holen, Videolänge, Rückgängig
{
  const gen = await b.newPage();
  await gen.goto('http://127.0.0.1:8124/test/pipeline.html');
  const files = await gen.evaluate(async () => {
    const out = [];
    for (const [k, dur] of [[0, 12], [1, 8]]) {
      const W = 360, H = 640, fps = 30, N = dur * fps;
      const avcCfg = { codec: 'avc1.42E01E', width: W, height: H, bitrate: 500000, framerate: fps, avc: { format: 'avc' } };
      const avc = (await VideoEncoder.isConfigSupported(avcCfg)).supported;
      const mux = new Mp4Muxer({ video: { codec: avc ? 'avc' : 'vp9', width: W, height: H, fps }, audio: null });
      const enc = new VideoEncoder({ output: (c, m) => mux.addVideoChunk(c, m), error: () => {} });
      enc.configure(avc ? avcCfg : { codec: 'vp09.00.10.08', width: W, height: H, bitrate: 500000, framerate: fps });
      const c = new OffscreenCanvas(W, H), x = c.getContext('2d');
      for (let i = 0; i < N; i++) {
        const t = i / fps;
        x.fillStyle = `hsl(${(k * 120 + t * 30) % 360},55%,40%)`; x.fillRect(0, 0, W, H);
        x.fillStyle = '#fff'; x.beginPath(); x.arc(W / 2 + Math.sin(t * 2) * 120, H / 2, 40, 0, 7); x.fill();
        const fr = new VideoFrame(c, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / fps) });
        enc.encode(fr, { keyFrame: i % 30 === 0 }); fr.close();
        if (enc.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 5));
      }
      await enc.flush(); enc.close();
      out.push([`Clip${k}.mp4`, await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(mux.finalize()); })]);
    }
    for (let i = 0; i < 14; i++) {
      const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const x = c.getContext('2d');
      x.fillStyle = `hsl(${i * 25},60%,45%)`; x.fillRect(0, 0, 1200, 900);
      for (let j = 0; j < 30; j++) { x.fillStyle = `hsla(${i * 25 + j * 11},80%,${35 + j % 30}%,.8)`; x.beginPath(); x.arc((j * 131 + i * 50) % 1200, (j * 77 + i * 30) % 900, 20 + (j * 7) % 50, 0, 7); x.fill(); }
      out.push([`Foto${String(i).padStart(2, '0')}.jpg`, c.toDataURL('image/jpeg', 0.85)]);
    }
    return out;
  });
  await gen.close();
  const paths = files.map(([n, d]) => { const pth = `${OUT}/${n}`; writeFileSync(pth, Buffer.from(d.split(',')[1], 'base64')); return pth; });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on('pageerror', (e) => fails.push('App pageerror ' + e.message));
  await page.addInitScript(() => { try { localStorage.setItem('cinebeat-level', 'bench'); } catch (e) { /* egal */ } });
  await page.goto('http://127.0.0.1:8123/index.html');
  await page.waitForSelector('.place');
  await page.click('#addPlace');
  await page.waitForFunction(() => CineBeat.S.ctx && CineBeat.S.ctx.kind === 'place' && document.getElementById('busy').hidden, null, { timeout: 60000 });
  await page.setInputFiles('#fileMedia', paths);
  await page.waitForFunction((n) => CineBeat.S.ctx.media.length === n && CineBeat.S.ctx.media.every((m) => !m.loading) && document.getElementById('busy').hidden, paths.length, { timeout: 300000 });
  await page.click('[data-tab="music"]');
  await page.setInputFiles('#fileMusic', `${OUT}/Song.wav`);
  await page.waitForFunction(() => CineBeat.S.ctx.song && document.getElementById('busy').hidden && document.querySelector('#flowStage [data-flow="cut"]'), null, { timeout: 120000 });
  await page.click('#flowStage [data-flow="cut"]');
  await page.click('#wishGo');
  const stable = () => page.waitForFunction(() => { const p = CineBeat.S.plan; if (!p || !document.getElementById('busy').hidden) return false; if (window.__lp !== p) { window.__lp = p; window.__lpT = performance.now(); } return performance.now() - window.__lpT > 1500; }, null, { timeout: 120000, polling: 150 });
  await stable();
  const seq = () => page.evaluate(() => { const s = []; for (const c of CineBeat.S.plan.clips) { if (c.loop || c.burst || ['rush', 'recap', 'leader', 'rew', 'tease', 'reveal'].includes(c.role)) continue; for (const id of c.split ? c.split.ids : c.stack ? c.stack.ids : [c.mediaId]) if (id && !s.includes(id)) s.push(id); } return s; });
  const nameOf = (id) => page.evaluate((id) => CineBeat.S.ctx.media.find((m) => m.id === id).name, id);
  const clipOf = (id) => page.evaluate((id) => CineBeat.S.plan.clips.findIndex((c) => c.mediaId === id && !c.split && !c.burst && !c.rush && !c.leader && c.role !== 'hook'), id);
  const S0 = await seq();
  // a) Material: „Nicht im Film verwenden“
  const imgs = await page.evaluate(() => CineBeat.S.ctx.media.filter((m) => m.kind === 'image').map((m) => m.id));
  const X = S0.find((id, k) => k > 3 && imgs.includes(id));
  await page.click('[data-tab="material"]');
  await page.click(`#mediaGrid [data-id="${X}"]`);
  await page.click('.sheet [data-act="excl"]');
  await stable();
  const S1 = await seq();
  if (S1.includes(X)) fails.push(`App: ${await nameOf(X)} trotz „Nicht im Film verwenden“ im Film`);
  if (S0.some((id) => id !== X && !S1.includes(id))) fails.push('App: Ausschließen nimmt auch andere heraus: ' + S0.filter((id) => id !== X && !S1.includes(id)).join(','));
  // b) Einstellung: Übergang wählen, dann ändert sich der Schnitt – der Übergang bleibt bei seiner Aufnahme
  const Y = S1.filter((id) => imgs.includes(id))[5];
  await page.click(`#clipRow [data-clip="${await clipOf(Y)}"]`);
  await page.click('.sheet #trPick [data-v="2"]');
  await stable();
  await page.click('.sheet [data-act="done"]');
  const ovY = await page.evaluate((Y) => (CineBeat.S.ctx.rec.overrides.media || {})[Y], Y);
  if (!ovY || ovY.trans !== 2) fails.push('App: Übergang nicht an der Aufnahme gespeichert ' + JSON.stringify(ovY));
  const Z = S1.filter((id) => imgs.includes(id))[1];
  await page.evaluate((Z) => { CineBeat.S.ctx.media.find((m) => m.id === Z).excluded = true; return CineBeat.rebuild(); }, Z);
  await stable();
  const trY = await page.evaluate((Y) => { const c = CineBeat.S.plan.clips.find((x) => x.mediaId === Y && !x.burst && !x.rush && !x.flash); return c && c.tin && c.tin.type; }, Y);
  if (trY !== 2) fails.push(`App: Übergang nach Schnittänderung nicht mehr bei seiner Aufnahme (${trY})`);
  // c) Einstellung: andere Aufnahme an diese Stelle holen – sie steht davor, nichts fällt weg
  const S2 = await seq();
  const A = S2.filter((id) => imgs.includes(id))[3], Bm = S2.filter((id) => imgs.includes(id)).slice(-2)[0];
  await page.click(`#clipRow [data-clip="${await clipOf(A)}"]`);
  await page.click(`.sheet .pick-grid [data-media="${Bm}"]`);
  await stable();
  const S3 = await seq();
  if (S3.indexOf(Bm) !== S3.indexOf(A) - 1) fails.push(`App: an die Stelle geholt, steht aber an ${S3.indexOf(Bm)} statt vor ${S3.indexOf(A)}`);
  if (S2.some((id) => !S3.includes(id))) fails.push('App: an die Stelle holen nimmt heraus: ' + S2.filter((id) => !S3.includes(id)).join(','));
  // d) Video: Ausschnitt 1–4 s wählen → läuft genau diesen Teil (≈ 3 s) im Film; Rückgängig stellt es wieder her
  const V = await page.evaluate(() => CineBeat.S.ctx.media.find((m) => m.kind === 'video' && m.duration > 10).id);
  const lenOf = () => page.evaluate((V) => CineBeat.S.plan.clips.filter((c) => c.mediaId === V && !c.split && !c.burst && !c.rush && !c.leader).reduce((a, c) => a + c.end - c.start, 0), V);
  const len0 = await lenOf();
  // (die automatische Korrektur beim Schnitt kann schon einen ruhigeren Ausschnitt gesetzt haben – Rückgängig führt dorthin zurück)
  const trim0 = await page.evaluate((V) => CineBeat.S.ctx.media.find((x) => x.id === V).trim || null, V);
  await page.click('[data-tab="material"]');
  await page.click(`#mediaGrid [data-id="${V}"]`);
  await page.evaluate(() => { const i = document.getElementById('trimIn'), l = document.getElementById('trimLen'); l.value = 3; l.dispatchEvent(new Event('input')); i.value = 1; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(600);
  await stable();
  const st = await page.evaluate((V) => { const m = CineBeat.S.ctx.media.find((x) => x.id === V); return { trim: m.trim, vlen: m.vlen, exact: document.querySelector('#vlenPick [data-v="exact"]').getAttribute('aria-checked'), hint: document.getElementById('vlenHint').textContent }; }, V);
  const len1 = await lenOf();
  const beat = await page.evaluate(() => CineBeat.S.ctx.song.an.beatPeriod);
  if (!st.trim || Math.abs(st.trim[0] - 1) > 0.06 || Math.abs(st.vlen - 3) > 0.06 || st.exact !== 'true') fails.push('App: Ausschnitt/Länge nicht übernommen ' + JSON.stringify(st));
  if (Math.abs(len1 - 3) > beat * 1.05) fails.push(`App: Video soll 3 s laufen, läuft ${len1.toFixed(2)} s (vorher ${len0.toFixed(2)})`);
  if (!/Gerade im Film/.test(st.hint)) fails.push('App: Hinweis „Gerade im Film“ fehlt: ' + st.hint);
  // „Automatisch“: die Regie entscheidet wieder
  await page.click('.sheet #vlenPick [data-v="auto"]');
  await page.waitForTimeout(600);
  await stable();
  if (await page.evaluate((V) => CineBeat.S.ctx.media.find((x) => x.id === V).vlen, V)) fails.push('App: „Automatisch“ hebt die Länge nicht auf');
  await page.click('.sheet [data-act]:last-child').catch(() => {});
  await page.keyboard.press('Escape');
  // Rückgängig: Ausschnitt weg
  await page.evaluate(() => { document.querySelector('.sheet-backdrop, .scrim')?.click(); });
  for (let k = 0; k < 2; k++) { await page.click('#undoBtn').catch(() => {}); await page.waitForTimeout(400); }
  await stable();
  const after = await page.evaluate((V) => { const m = CineBeat.S.ctx.media.find((x) => x.id === V); return { trim: m.trim, vlen: m.vlen }; }, V);
  if (JSON.stringify(after.trim || null) !== JSON.stringify(trim0)) fails.push('App: Rückgängig stellt den Ausschnitt nicht wieder her ' + JSON.stringify({ ...after, vorher: trim0 }));
}
await b.close();
console.log(fails.length ? `FAIL ${fails.length}\n` + fails.slice(0, 30).join('\n') : 'OK edit');
process.exit(fails.length ? 1 : 0);
