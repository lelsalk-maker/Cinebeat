// Cutter-Prüfstand: schneidet wie die App (beste von 8 Varianten, dann Einstieg-Suche) über mehrere Lieder (Beat-Studio)
// und Ziele (Story, Reel, Film) mit demselben Material und misst, was einen Cutter ausmacht:
//  - Songbezug: Schnitt auf jedem Abschnittswechsel, Einstellungslänge folgt der Energie, starkes Bild auf dem Drop
//  - Wir-Bilder: lange Plätze, ruhige Teile oder besondere Momente – nie im Blitzgewitter
//  - kein Schema: im Film keine langen Ketten gleicher Übergänge/Kamerafahrten/Längen, über die Lieder hinweg
//    unterschiedliche Handschrift (Einstieg, Ende, Look, Stil-Mittel)
// `-v` zeigt je Film die Messwerte; Ergebnis als JSON in $OUT/regie.json.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const V = process.argv.includes('-v');
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
const STYLES = (process.env.REGIE_STYLES || 'sommer,nacht,lofi,gipfel,drift,roadtrip,fiesta').split(',');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const res = await p.evaluate(async (STYLES) => {
  const rng = mulberry32(4711);
  const base = demoScenes();
  const T0 = new Date(2026, 6, 1, 9, 0).getTime();
  // Material wie in lied.mjs: neun Szenen à vier Fotos über drei Tage, eine Szene mit euch und einzelne Wir-Bilder, vier Videos
  const media = [];
  for (let sc = 0; sc < 9; sc++) {
    const day = Math.floor(sc / 3), e0 = rng(), l0 = 0.25 + rng() * 0.5, hue = rng();
    for (let j = 0; j < 4; j++) {
      const i = sc * 4 + j, c = base[i % base.length];
      const e = Math.max(0, Math.min(1, e0 + (rng() - 0.5) * 0.3)), l = Math.max(0.12, Math.min(0.9, l0 + (rng() - 0.5) * 0.12));
      const avg = [Math.round(70 + 160 * Math.max(0, Math.cos(hue * 6.28)) * l + rng() * 12), Math.round(70 + 130 * l + rng() * 12), Math.round(70 + 160 * Math.max(0, Math.sin(hue * 6.28)) * l + rng() * 12)];
      media.push({ id: 'p' + i, kind: 'image', name: 'P' + i, canvas: c, w: i % 4 ? 3000 : 4000, h: i % 4 ? 4000 : 3000, time: T0 + day * 864e5 + (sc % 3) * 3 * 36e5 + j * 2 * 60000, scene: sc,
        ...scoreImage(c, c.width, c.height), color: 0.15 + e * 0.8, sharp: 0.3 + e * 0.6, luma: l, avg, mood: [+(0.25 + 0.6 * l).toFixed(2), +e.toFixed(2)], score: 0.35 + rng() * 0.5, hash: [i * 7919 + 13, i * 104729 + 7], us: sc === 4 || i === 9 || i === 30 ? true : undefined });
    }
  }
  const vid = (id, k, d, lively) => ({ id, kind: 'video', name: id, w: 1080, h: 1920, duration: d, time: T0 + k * 864e5 * 0.7 + 3 * 36e5, score: 0.6, sharp: 0.6, color: lively ? 0.75 : 0.35, motion: lively ? 0.16 : 0.015, luma: 0.45, avg: [Math.round(60 + k * 60), Math.round(170 - k * 40), Math.round(90 + k * 25)],
    highlights: [{ t: d * 0.45, score: lively ? 0.9 : 0.4 }], hits: lively ? Array.from({ length: Math.floor(d / 1.5) }, (_, j) => [0.8 + j * 1.5, 0.8]) : [], hash: [k * 31 + 1, k * 77 + 3], focus: [0.5, 0.45] });
  media.push(vid('vRuhig1', 0.3, 18, false), vid('vAction1', 1.2, 12, true), vid('vRuhig2', 2.1, 24, false), vid('vAction2', 2.6, 9, true));
  const byId = new Map(media.map((m) => [m.id, m]));
  const LE = { drop: 1, chorus: 0.9, build: 0.65, verse: 0.4, intro: 0.3, outro: 0.3, break: 0.2 };
  const corr = (xs, ys) => { const n = xs.length; if (n < 3) return 0; const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2; } return sx && sy ? sxy / Math.sqrt(sx * sy) : 0; };
  const TRN = Object.fromEntries(Object.entries(TR).map(([k, v]) => [v, k]));
  // Kamerafahrt grob einordnen
  const moveOf = (c) => {
    if (c.dir && !c.contain) return c.dir;
    const m = c.motion; if (!m || !m.from || !m.to) return 'still';
    const ds = m.to.s - m.from.s, dx = m.to.x - m.from.x, dy = m.to.y - m.from.y;
    if (Math.abs(ds) > 0.03 && Math.abs(ds) > Math.hypot(dx, dy) * 0.6) return ds > 0 ? 'in' : 'out';
    if (Math.hypot(dx, dy) > 0.02) return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    return 'still';
  };
  const maxRun = (arr) => { let best = 0, run = 0; for (let i = 0; i < arr.length; i++) { run = i && arr[i] === arr[i - 1] ? run + 1 : 1; best = Math.max(best, run); } return best; };
  const films = [];
  for (const style of STYLES) {
    const song = await beatSong(beatRecipe(style, {}, { seed: 3, form: 'reel' }));
    const an = song.an;
    // je Ziel eine andere Effektstufe: Story schlicht (Standard), Reel dezent, Film kreativ – so ist jede Stufe dabei
    for (const fmt of [{ format: '9:16', target: 'story', effekte: 'schlicht' }, { format: '9:16', target: 'reel', effekte: 'dezent' }, { format: '16:9', effekte: 'kreativ' }]) {
      const settings = { look: 'auto', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 5, title: 'Lissabon', allMedia: 'off', order: 'lied', ...fmt };
      const opts = { an, media: media.map((m) => ({ ...m })), settings, overrides: { texts: [], stickers: [] } };
      const t0 = performance.now();
      const bc = await bestCut(opts, 8);
      opts.settings = { ...settings, seed: bc.seed };
      let hookId = null;
      const intro0 = buildPlan(opts).intro;
      const hr = await improveHook(opts, null, { wide: true });
      if (hr && hr.settings && (hr.errorsTo < hr.errorsFrom || hr.to >= hr.from + 8)) { Object.assign(opts.settings, hr.settings); hookId = hr.hookId; }
      if (hookId) opts.settings.hookId = hookId;
      const plan = buildPlan(opts);
      const ms = performance.now() - t0;
      const D = plan.duration, w0 = plan.win.start, bd = plan.beatDur, r = plan.resolved;
      const secs = (an.sections || []).filter((x) => x.end > w0 + 0.1 && x.start < w0 + D - 0.1);
      const secAt = (t) => { const x = secs.find((s) => t + w0 >= s.start && t + w0 < s.end); return x ? x.label : 'verse'; };
      const cuts = plan.clips.map((c) => c.start);
      // 1. Songbezug
      const bounds = secs.map((x) => x.start - w0).filter((t) => t > 0.3 && t < D - 0.3);
      const secMiss = bounds.filter((t) => !cuts.some((c) => Math.abs(c - t) < 0.05)).map((t) => { const c = plan.clips.find((x) => x.start < t && x.end > t); return `${t.toFixed(1)}:${secAt(t - 0.1)}→${secAt(t + 0.1)}${c ? '/' + (c.vid ? 'vid' : c.split ? 'split' : c.mediaId && byId.get(c.mediaId) && byId.get(c.mediaId).kind === 'video' ? 'video' : c.leader || c.pre || c.knock || c.reveal || c.rush ? 'intro' : c.strip ? 'strip' : 'foto') + '#' + c.i : ''}`; });
      const secCut = bounds.length ? bounds.filter((t) => cuts.some((c) => Math.abs(c - t) < 0.05)).length / bounds.length : 1;
      const plain = plan.clips.filter((c) => c.mediaId && !c.split && !c.burst && !c.flash && !c.rush && !c.stack && !c.grid && !c.loop && !c.recap && !c.leader && !c.pre && !c.reveal && !c.miniRew && !c.welcome && c.end - c.start > 0.05);
      const lens = plain.map((c) => (c.end - c.start) / bd);
      // (nur Fotos: bewegte Videos laufen im Drop bewusst lang)
      const photos = plain.filter((c) => byId.get(c.mediaId).kind === 'image');
      const eFit = -corr(photos.map((c) => LE[secAt((c.start + c.end) / 2)] ?? 0.5), photos.map((c) => (c.end - c.start) / bd));
      const dc = plan.clips.find((c) => c.sectionChange && (c.label === 'drop' || c.label === 'chorus') && c.mediaId && byId.get(c.mediaId));
      const imgScores = media.filter((m) => m.kind === 'image').map((m) => m.score).sort((a, b) => b - a);
      const dropRank = dc ? (byId.get(dc.mediaId).kind === 'video' ? 0 : imgScores.indexOf(byId.get(dc.mediaId).score) / imgScores.length) : null;
      // 2. Wir-Bilder
      const usC = plan.clips.filter((c) => !c.loop && c.mediaId && byId.get(c.mediaId) && byId.get(c.mediaId).us);
      // (Mini-Rewind und Rückspul-Vorspann zeigen Bilder, die schon lang zu sehen waren – das ist ein Rückblick, kein Platz)
      const usBad = usC.filter((c) => !c.miniRew && c.pre !== 'rew' && (c.flash || c.rush || c.burst || (!c.split && !c.grid && !c.stack && c.end - c.start < bd * 1.5)));
      if (usBad.length) console.log('usBad', style, fmt.target, usBad.map((c) => JSON.stringify(Object.fromEntries(Object.entries(c).filter(([k, v]) => v === true || typeof v === 'string' || typeof v === 'number')))).join(' '));
      const usPlain = usC.filter((c) => !usBad.includes(c) && !c.split && !c.grid && !c.stack && !c.miniRew && !c.pre);
      const usSeq = usC.map((c) => `${c.i}@${c.start.toFixed(1)} ${((c.end - c.start) / bd).toFixed(1)}b${c.miniRew ? ' mini' : ''}${c.pre ? ' ' + c.pre : ''}${c.split ? ' split' : ''} ${secAt((c.start + c.end) / 2)}`);
      const avgLen = (cs) => cs.reduce((a, c) => a + c.end - c.start, 0) / Math.max(1, cs.length);
      // (verglichen mit den übrigen Fotos – Videos stehen ohnehin länger)
      const plainImg = plain.filter((c) => byId.get(c.mediaId).kind === 'image' && !byId.get(c.mediaId).us);
      const usLenRatio = usPlain.length && plainImg.length ? avgLen(usPlain) / avgLen(plainImg) : null;
      const usGood = usPlain.filter((c) => isCalmLabel(secAt((c.start + c.end) / 2)) || c.sectionChange || c.i === plan.clips.filter((x) => !x.loop).length - 1 || c.end - c.start >= bd * 4).length / Math.max(1, usPlain.length);
      // 3. Schema im Film
      const trans = plan.clips.slice(1).filter((c) => !c.loop).map((c) => (c.tin ? TRN[c.tin.type] || c.tin.type : 'CUT'));
      const softT = trans.filter((t) => t !== 'CUT');
      const moves = plain.map(moveOf);
      const lenSeq = plain.map((c) => Math.round((c.end - c.start) / bd));
      let sameLen = 0; for (let i = 1; i < lenSeq.length; i++) if (lenSeq[i] === lenSeq[i - 1]) sameLen++;
      const fxTypes = [...new Set(plan.fx.map((f) => f.type))].sort();
      const tools = ['echo', 'stack', 'mini', 'midGrid', 'burst', 'color', 'accent', 'drift', 'parallax', 'mv'].filter((k) => r[k] && r[k] !== 'off').map((k) => k + (k === 'color' ? ':' + r[k] : ''));
      const f = {
        name: `${style}/${fmt.target || 'film'}`, ms: Math.round(ms), D: +D.toFixed(1), clips: plain.length, intro: plan.intro, intro0, usSeq, outro: plan.outro, look: plan.look, pace: plan.pace, motion: plan.motion,
        tools, fxTypes, secMiss, secCut: +secCut.toFixed(2), eFit: +eFit.toFixed(2), dropRank: dropRank == null ? null : +dropRank.toFixed(2),
        us: usC.length, usBad: usBad.map((c) => `${c.i}@${c.start.toFixed(1)} ${((c.end - c.start) / bd).toFixed(1)}b ${c.flash ? 'flash' : c.rush ? 'rush' : c.burst ? 'burst' : c.miniRew ? 'mini' : c.pre || 'kurz'}`), usLenRatio: usLenRatio == null ? null : +usLenRatio.toFixed(2), usGood: +usGood.toFixed(2),
        transMaxRun: maxRun(softT.length ? trans.map((t) => (t === 'CUT' ? 'CUT' : t)).filter((t, i, a) => t !== 'CUT' || a[i - 1] !== 'CUT') : []), softKinds: [...new Set(softT)].length, soft: softT.length,
        moveSeq: plain.map((c) => moveOf(c)[0] + (c.contain ? 'f' : '') + (c.matchCut ? 'm' : '') + (c.usMoment ? 'u' : '')).join(' '),
        // (eine Einstellung anderer Art dazwischen – Video, Split, Serie – unterbricht die Kette)
        moveMaxRun: maxRun(plan.clips.filter((c) => !c.loop).map((c) => (plain.includes(c) ? moveOf(c) : '#' + c.i))), moveKinds: [...new Set(moves)].length, sameLenShare: +(sameLen / Math.max(1, lenSeq.length - 1)).toFixed(2), lenKinds: [...new Set(lenSeq)].length,
        hook: hookScore(plan, opts.media, an).score, audit: planAudit(plan, opts.media, an).length + planSyncAudit(plan, an).length,
        check: filmCheck(plan, opts.media, an, null, {}).filter((x) => !x.ok).map((x) => x.key),
      };
      films.push(f);
    }
  }
  // Handschrift über die Lieder: wie viele verschiedene Kombinationen aus Einstieg, Ende, Look, Stil-Mitteln
  const fp = (f) => [f.intro, f.outro, f.look, f.motion, f.tools.join('+')].join('|');
  const byTarget = {};
  for (const f of films) { const t = f.name.split('/')[1]; (byTarget[t] = byTarget[t] || []).push(f); }
  const diversity = Object.fromEntries(Object.entries(byTarget).map(([t, fs]) => [t, { fingerprints: new Set(fs.map(fp)).size, intros: [...new Set(fs.map((f) => f.intro))], outros: [...new Set(fs.map((f) => f.outro))], looks: new Set(fs.map((f) => f.look)).size, n: fs.length }]));
  return { films, diversity };
}, STYLES);
writeFileSync(`${OUT}/regie.json`, JSON.stringify(res, null, 1));
const fails = [];
for (const f of res.films) {
  if (V) console.log(`${f.name.padEnd(16)} ${f.D}s ${String(f.clips).padStart(2)}E ${f.intro}${f.intro0 !== f.intro ? '←' + f.intro0 : ''}/${f.outro} ${f.look} ${f.pace} | Sec ${f.secCut}${f.secMiss.length ? '[' + f.secMiss.join(' ') + ']' : ''} E ${f.eFit} Drop ${f.dropRank} | Wir ${f.us} gut ${f.usGood} L×${f.usLenRatio} ${f.usBad.join(',')} | Ü-Kette ${f.transMaxRun} (${f.softKinds}/${f.soft}) Fahrt-Kette ${f.moveMaxRun} (${f.moveKinds}) gleicheL ${f.sameLenShare} (${f.lenKinds}) | Hook ${f.hook} Audit ${f.audit} Check ${f.check.join(',') || 'ok'} | ${f.tools.join(' ')} ${f.ms}ms`);
  if (f.secCut < 1) fails.push(`${f.name}: Abschnittswechsel ohne Schnitt (${f.secCut})`);
  if (f.eFit < 0.1) fails.push(`${f.name}: Einstellungslänge folgt der Energie kaum (${f.eFit})`);
  if (f.usBad.length) fails.push(`${f.name}: Wir-Bild im Blitzgewitter/zu kurz: ${f.usBad.join(', ')}`);
  if (f.usLenRatio != null && f.usLenRatio < 0.9 && V) console.log('  Wir:', f.usSeq.join(' | '));
  if (f.usLenRatio != null && f.usLenRatio < 0.9) fails.push(`${f.name}: Wir-Bilder kürzer als der Schnitt (${f.usLenRatio})`);
  if (f.transMaxRun > 3) fails.push(`${f.name}: ${f.transMaxRun}× derselbe Übergang hintereinander`);
  if (f.moveMaxRun > 5) fails.push(`${f.name}: ${f.moveMaxRun}× dieselbe Kamerafahrt hintereinander`);
  if (f.sameLenShare > 0.6) fails.push(`${f.name}: Einstellungen fast alle gleich lang (${f.sameLenShare})`);
  if (f.audit) fails.push(`${f.name}: ${f.audit} Stellen weichen vom Song ab`);
  // (das Prüfmaterial nutzt dieselben Demo-Bilder mehrfach – echte Doppel; „Abwechslung“ zählt hier daher nicht)
  const open = f.check.filter((k) => k !== 'motiv');
  if (open.length) fails.push(`${f.name}: Film-Check offen: ${open.join(', ')}`);
  if (f.hook < 70) fails.push(`${f.name}: Einstieg schwach (${f.hook})`);
}
for (const [t, d] of Object.entries(res.diversity)) {
  if (V) console.log(`Handschrift ${t}: ${d.fingerprints}/${d.n} verschieden · Einstiege ${d.intros.join(',')} · Enden ${d.outros.join(',')} · ${d.looks} Looks`);
  if (d.fingerprints < Math.ceil(d.n * 0.7)) fails.push(`${t}: nur ${d.fingerprints} verschiedene Handschriften bei ${d.n} Liedern`);
  // (schlicht kennt bewusst nur Startbild/Ortsname/Wort für Wort – dort reichen zwei verschiedene)
  if (d.intros.length < Math.min(t === 'story' ? 2 : 3, d.n)) fails.push(`${t}: immer dieselben Einstiege (${d.intros.join(', ')})`);
  if (d.outros.length < Math.min(2, d.n)) fails.push(`${t}: immer dasselbe Ende (${d.outros.join(', ')})`);
}
console.log('Fehler:', fails.length ? fails.join(' | ') : 'keine');
await b.close();
process.exit(fails.length ? 1 : 0);
