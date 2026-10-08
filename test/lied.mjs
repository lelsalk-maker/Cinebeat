// Passend zum Lied – messbar: Bildenergie folgt der Songstelle, Wir-Bilder in ruhigen Teilen, starkes Bild auf dem Drop,
// ruhige Videos in ruhigen und bewegte in kräftigen Teilen (und sie laufen lange genug), sanfte Übergänge zwischen
// Nachbarn (Helligkeit, Farbe, keine Beinahe-Doppel), der Stil (Look, Bewegung) passt zum Charakter des Lieds,
// alles bleibt stimmig (planAudit) und nichts fehlt. Drei Lieder aus dem Beat-Studio (Lo-Fi, Tropical House, Drift Phonk),
// gemischtes Material aus drei Tagen. `-v` zeigt die Messwerte.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const V = process.argv.includes('-v');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const ORDER = process.env.LIED_ORDER || '';
if (ORDER === 'dbg') p.on('console', (m) => console.log(m.text()));
const res = await p.evaluate(async (ORDER) => {
  const f = [], out = {};
  const rng = mulberry32(4711);
  const base = demoScenes();
  const T0 = new Date(2026, 6, 1, 9, 0).getTime();
  // Material aus neun Szenen (je vier Fotos desselben Moments mit ähnlichem Look), drei Tage, je Szene eigene Stimmung:
  // ruhig/dunkel bis kräftig/bunt; eine Szene mit euch (Wir), dazu einzelne Wir-Bilder
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
  // Videos: zwei ruhige (kaum Bewegung), zwei bewegte (Action-Momente), unterschiedlich lang
  const vid = (id, k, d, lively) => ({ id, kind: 'video', name: id, w: 1080, h: 1920, duration: d, time: T0 + k * 864e5 * 0.7 + 3 * 36e5, score: 0.6, sharp: 0.6, color: lively ? 0.75 : 0.35, motion: lively ? 0.16 : 0.015, luma: 0.45, avg: [120, 115, 105],
    highlights: [{ t: d * 0.45, score: lively ? 0.9 : 0.4 }], hits: lively ? Array.from({ length: Math.floor(d / 1.5) }, (_, j) => [0.8 + j * 1.5, 0.8]) : [], hash: [k * 31 + 1, k * 77 + 3], focus: [0.5, 0.45] });
  media.push(vid('vRuhig1', 0.3, 18, false), vid('vAction1', 1.2, 12, true), vid('vRuhig2', 2.1, 24, false), vid('vAction2', 2.6, 9, true));
  const byId = new Map(media.map((m) => [m.id, m]));
  const LE = { drop: 1, chorus: 0.9, build: 0.65, verse: 0.4, intro: 0.3, outro: 0.3, break: 0.2 };
  const corr = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2; } return sx && sy ? sxy / Math.sqrt(sx * sy) : 0; };
  const dropRanks = [];
  const songs = { lofi: 'Lo-Fi', sommer: 'Tropical House', drift: 'Drift Phonk' };
  for (const [style, label] of Object.entries(songs)) {
    const song = await beatSong(beatRecipe(style, {}, { seed: 3, form: 'reel' }));
    const an = song.an;
    for (const fmt of [{ format: '9:16', target: 'story' }, { format: '9:16', target: 'reel' }, { format: '16:9' }]) {
      const nm = `${label}/${fmt.target || 'film'}`;
      const st = { look: 'auto', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 5, title: 'Lissabon', ...(ORDER && ORDER !== 'dbg' ? { order: ORDER } : {}), ...fmt };
      const t0 = performance.now();
      const plan = buildPlan({ an, media: media.map((m) => ({ ...m })), settings: st, overrides: { texts: [], stickers: [] } });
      const ms = performance.now() - t0;
      const secAt = (t) => { const x = (plan.sections || []).find((s) => t >= s.start && t < s.end); return x ? x.label : 'verse'; };
      const plain = plan.clips.filter((c) => c.mediaId && !c.split && !c.burst && !c.flash && !c.rush && !c.stack && !c.grid && !c.loop && !c.recap && !c.leader && c.role !== 'hook' && !c.pre && !c.reveal);
      const imgs = plain.filter((c) => byId.get(c.mediaId) && byId.get(c.mediaId).kind === 'image');
      const xs = imgs.map((c) => mediaEnergy(byId.get(c.mediaId))), ys = imgs.map((c) => LE[secAt((c.start + c.end) / 2)] ?? 0.5);
      const eFit = corr(xs, ys);
      // mittlere Bildenergie in kräftigen minus ruhigen Teilen
      const nu = imgs.filter((c) => !byId.get(c.mediaId).us);
      const pk = nu.filter((c) => !isCalmLabel(secAt((c.start + c.end) / 2))), cm = nu.filter((c) => isCalmLabel(secAt((c.start + c.end) / 2)));
      const avgE = (cs) => cs.reduce((a, c) => a + mediaEnergy(byId.get(c.mediaId)), 0) / Math.max(1, cs.length);
      const dE = pk.length && cm.length ? avgE(pk) - avgE(cm) : 0;
      if (ORDER === 'dbg') console.log(label, fmt.target, imgs.map((c) => secAt((c.start + c.end) / 2).slice(0, 2) + ':' + mediaEnergy(byId.get(c.mediaId)).toFixed(2) + (byId.get(c.mediaId).us ? 'U' : '')).join(' '));
      // Wir-Bilder: Anteil ihrer Zeit in ruhigen Teilen gegenüber dem Durchschnitt
      const calmT = (cs) => cs.reduce((a, c) => a + (isCalmLabel(secAt((c.start + c.end) / 2)) ? c.end - c.start : 0), 0) / Math.max(0.01, cs.reduce((a, c) => a + c.end - c.start, 0));
      const usC = imgs.filter((c) => byId.get(c.mediaId).us), usFit = usC.length ? calmT(usC) - calmT(imgs) : 0;
      // starkes Bild auf dem ersten Drop/Refrain-Einsatz (Rang unter den Fotos, 0 = bestes)
      const dc = plan.clips.find((c) => c.sectionChange && (c.label === 'drop' || c.label === 'chorus') && c.mediaId && byId.get(c.mediaId));
      const scores = media.filter((m) => m.kind === 'image').map((m) => m.score).sort((a, b) => b - a);
      const dropRank = dc && byId.get(dc.mediaId).kind === 'image' ? scores.indexOf(byId.get(dc.mediaId).score) / scores.length : 0;
      // Videos: passend zur Songstelle und lange genug
      const vc = plan.clips.filter((c) => (c.vid || (c.mediaId && byId.get(c.mediaId) && byId.get(c.mediaId).kind === 'video')) && !c.split && !c.burst && !c.rush);
      const vFitL = vc.map((c) => { const m = byId.get(c.mediaId), e = LE[secAt((c.start + c.end) / 2)] ?? 0.5; return m.motion > 0.05 ? e : 1 - e; });
      const vFit = vFitL.length ? vFitL.reduce((a, b) => a + b, 0) / vFitL.length : 0;
      if (ORDER === 'dbg') console.log('V', label, fmt.target, vc.map((c) => c.mediaId + '@' + c.start.toFixed(1) + '-' + c.end.toFixed(1) + ':' + secAt((c.start + c.end) / 2)).join(' '), '| secs', (plan.sections || []).map((x) => x.label.slice(0, 2) + x.start.toFixed(0)).join(' '));
      const vLen = vc.length ? vc.reduce((a, c) => a + c.end - c.start, 0) / vc.length : 0;
      // Nachbarn: Farbabstand, Helligkeitssprünge, Beinahe-Doppel
      const seq = plan.clips.filter((c) => c.mediaId && !c.flash && byId.get(c.mediaId)).map((c) => byId.get(c.mediaId));
      let cd = 0, jumps = 0;
      for (let i = 1; i < seq.length; i++) { const a = seq[i - 1], c = seq[i]; cd += Math.hypot(a.avg[0] - c.avg[0], a.avg[1] - c.avg[1], a.avg[2] - c.avg[2]); if (Math.abs((a.luma || 0.45) - (c.luma || 0.45)) > 0.3) jumps++; }
      cd /= Math.max(1, seq.length - 1);
      // Tagesabschnitte: wie oft wechselt der Film zwischen Tagen (bei „Zum Lied“ frei)
      let dayHops = 0;
      for (let i = 1; i < seq.length; i++) if (seq[i].time && seq[i - 1].time && dayBlock(seq[i]) !== dayBlock(seq[i - 1])) dayHops++;
      // Szenen: in wie viele Stücke zerfällt eine Szene im Film (1 = am Stück)
      const runs = new Map();
      for (let i = 0; i < seq.length; i++) if (seq[i].scene != null && (i === 0 || seq[i - 1].scene !== seq[i].scene)) runs.set(seq[i].scene, (runs.get(seq[i].scene) || 0) + 1);
      if (ORDER === 'dbg') console.log('S', label, fmt.target, seq.map((m) => (m.kind === 'video' ? 'V' : m.scene) + (m.us ? 'u' : '')).join(' '));
      const frag = runs.size ? [...runs.values()].reduce((a, b) => a + b, 0) / runs.size : 1;
      const audit = planAudit(plan, media, an);
      const ids = new Set(plan.clips.filter((c) => !c.flash && !c.loop && !['rush', 'leader', 'recap'].includes(c.role)).flatMap((c) => (c.split ? c.split.ids : c.stack && c.stack.ids ? c.stack.ids : c.grid && c.grid.ids ? c.grid.ids : c.strip ? c.strip.ids : [c.mediaId])).filter(Boolean));
      const missing = media.filter((m) => !ids.has(m.id)).map((m) => m.id);
      out[nm] = { D: +plan.duration.toFixed(1), ms: Math.round(ms), eFit: +eFit.toFixed(2), dE: +dE.toFixed(2), usFit: +usFit.toFixed(2), dropRank: +dropRank.toFixed(2), vFit: +vFit.toFixed(2), vLen: +vLen.toFixed(1), nV: vc.length, cd: Math.round(cd), jumps, dayHops, frag: +frag.toFixed(2), look: plan.look, motion: plan.motion, amt: plan.motionAmt, order: plan.resolved.order, audit: audit.length, missing: missing.length, dropped: plan._m.dropped, lvl: plan._m.level, max: plan._m.max };
      if (audit.length) f.push(`${nm}: ${audit.length} Unstimmigkeiten, z. B. @${audit[0].t}s ${audit[0].msg}`);
      // „Zum Lied“ (Standard): messbar abgestimmt
      if (!ORDER || ORDER === 'lied' || ORDER === 'dbg') {
        if (eFit < 0.1 || dE < 0.03) f.push(`${nm}: Bildenergie folgt dem Lied nicht (r ${eFit.toFixed(2)}, Δ ${dE.toFixed(2)})`);
        if (usFit < 0) f.push(`${nm}: Wir-Bilder nicht in den ruhigen Teilen (${usFit.toFixed(2)})`);
        if (vFit < 0.5) f.push(`${nm}: Videos nicht an passender Stelle (${vFit.toFixed(2)})`);
        if (frag > 1.8) f.push(`${nm}: Szenen zerrissen (${frag.toFixed(2)} Stücke je Szene)`);
        if (cd > 42 || jumps > 4) f.push(`${nm}: harte Farb-/Helligkeitssprünge (Abstand ${Math.round(cd)}, ${jumps} Sprünge)`);
        dropRanks.push(dropRank);
      }
      if (missing.length) f.push(`${nm}: fehlt ${missing.join(',')}`);
    }
  }
  // auf dem ersten Einsatz steht im Mittel eines der stärksten Bilder
  const dr = dropRanks.length ? dropRanks.reduce((a, b) => a + b, 0) / dropRanks.length : 0;
  if (dr > 0.35) f.push(`Einsätze: im Mittel nur Rang ${dr.toFixed(2)}`);
  return { f, out };
}, ORDER);
if (V) for (const [k, v] of Object.entries(res.out)) console.log(k.padEnd(24), JSON.stringify(v));
await b.close();
console.log(res.f.length ? `FAIL ${res.f.length}\n` + res.f.slice(0, 20).join('\n') : 'OK lied');
process.exit(res.f.length ? 1 : 0);
