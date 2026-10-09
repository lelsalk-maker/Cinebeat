// Refrain-Reime (Variante) und Cutter-Bewertung: Mit Reim beginnt jeder weitere Refrain/Drop mit Bildern, die den ersten
// Refrain-Bildern ähneln (Aufbau, Größe, Farbe, nie dasselbe Motiv), die Kamera wiederholt die Bewegung; ohne Reim
// bleibt alles wie gehabt. Die Bewertung der Varianten kennt Blickführung, Akzente, Grammatik und Spannungskurve.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async () => {
  let seed = 21; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const an = (await beatSong(beatRecipe('sommer', {}, { seed: 3, form: 'reel' }))).an;
  // sechs Bildaufbauten (Horizont oben/unten, Motiv links/rechts/Mitte, Diagonale) je in mehreren Farben
  const layouts = [
    (x, c) => { x.fillStyle = c[0]; x.fillRect(0, 0, 400, 140); x.fillStyle = c[1]; x.fillRect(0, 140, 400, 160); },
    (x, c) => { x.fillStyle = c[0]; x.fillRect(0, 0, 400, 220); x.fillStyle = c[1]; x.fillRect(0, 220, 400, 80); },
    (x, c) => { x.fillStyle = c[0]; x.fillRect(0, 0, 400, 300); x.fillStyle = c[1]; x.fillRect(40, 60, 120, 200); },
    (x, c) => { x.fillStyle = c[0]; x.fillRect(0, 0, 400, 300); x.fillStyle = c[1]; x.fillRect(240, 40, 130, 220); },
    (x, c) => { x.fillStyle = c[0]; x.fillRect(0, 0, 400, 300); x.fillStyle = c[1]; x.beginPath(); x.arc(200, 150, 90, 0, 7); x.fill(); },
    (x, c) => { x.fillStyle = c[0]; x.fillRect(0, 0, 400, 300); x.fillStyle = c[1]; x.beginPath(); x.moveTo(0, 300); x.lineTo(400, 0); x.lineTo(400, 300); x.fill(); },
  ];
  const media = [], T0 = Date.UTC(2026, 4, 1, 9);
  for (let i = 0; i < 36; i++) {
    const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    const x = c.getContext('2d'), h = Math.floor(rnd() * 360);
    layouts[i % 6](x, [`hsl(${h},50%,${30 + (i % 3) * 15}%)`, `hsl(${(h + 150) % 360},55%,${45 + (i % 2) * 15}%)`]);
    for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(255,255,255,${rnd() * 0.15})`; x.fillRect(rnd() * 400, rnd() * 300, 3, 3); }
    media.push({ id: 'r' + i, kind: 'image', name: 'R' + i, canvas: c, w: 4000, h: 3000, time: T0 + i * 11 * 60000, ...scoreImage(c, 400, 300), hash: [i * 7919 + 1, i * 104729 + 3] });
  }
  const byId = new Map(media.map((m) => [m.id, m]));
  const S0 = { format: '16:9', look: 'natur', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 5, effekte: 'schlicht' };
  const colorD = (a, b) => Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]);
  const rh = (a, b) => (sameMotif(a, b) ? -1 : 0.55 * layoutSim(a.layout, b.layout) + 0.25 * (shotSize(a) === shotSize(b) ? 1 : 0) + 0.2 * (1 - Math.min(1, colorD(a, b) / 160)));
  const measure = (pl) => {
    const special = (c) => c.split || c.grid || c.burst || c.rush || c.flash || c.stack || c.strip || c.pre || c.reveal || c.loop || !byId.get(c.mediaId);
    const peaks = pl.clips.filter((c) => c.sectionChange && (c.label === 'drop' || c.label === 'chorus')).map((c) => c.i);
    const sec = (k) => { const o = []; for (let i = k; i < pl.clips.length && (i === k || !pl.clips[i].sectionChange); i++) if (!special(pl.clips[i])) o.push(pl.clips[i]); return o; };
    if (peaks.length < 2) return { peaks: peaks.length };
    const ref = sec(peaks[0]).slice(0, 3);
    let sim = 0, n = 0, dir = 0, rhymed = 0;
    for (const pk of peaks.slice(1)) sec(pk).slice(0, ref.length).forEach((c, j) => { sim += rh(byId.get(ref[j].mediaId), byId.get(c.mediaId)); n++; if (c.rhyme != null) { rhymed++; if (c.dir === ref[j].dir) dir++; } });
    let twins = 0; for (let i = 1; i < pl.clips.length; i++) { const a = byId.get(pl.clips[i - 1].mediaId), b2 = byId.get(pl.clips[i].mediaId); if (a && b2 && sameMotif(a, b2)) twins++; }
    return { peaks: peaks.length, sim: +(sim / Math.max(1, n)).toFixed(3), rhymed, dir, twins, audit: planAudit(pl, media, an).length, notes: pl.notes.filter((x) => /Refrain-Reim/.test(x)).length };
  };
  const off = buildPlan({ an, media: media.map((m) => ({ ...m })), settings: S0, overrides: { texts: [], stickers: [] } });
  const on = buildPlan({ an, media: media.map((m) => ({ ...m })), settings: { ...S0, reim: 'on' }, overrides: { texts: [], stickers: [] } });
  const q = planQuality(on, media, true, an);
  return { off: measure(off), on: measure(on), parts: Object.keys(q.parts) };
});
console.log(JSON.stringify(r));
const fails = [];
if (r.on.peaks < 2) fails.push('Song ohne zweiten Refrain im Ausschnitt');
else {
  if (!(r.on.sim > r.off.sim + 0.05)) fails.push(`Reim nicht ähnlicher (${r.off.sim} → ${r.on.sim})`);
  if (!r.on.rhymed) fails.push('keine gereimte Einstellung');
  if (r.on.dir < r.on.rhymed * 0.6) fails.push(`Kamerabewegung reimt nicht (${r.on.dir}/${r.on.rhymed})`);
  if (r.on.twins > r.off.twins) fails.push('Reim erzeugt gleiche Motive hintereinander');
  if (r.on.audit) fails.push('planAudit ' + r.on.audit);
  if (!r.on.notes) fails.push('keine Erklärung');
  if (r.off.rhymed || r.off.notes) fails.push('Reim ohne Variante');
}
for (const k of ['blick', 'akzent']) if (!r.parts.includes(k)) fails.push(`Bewertung ohne ${k}`);
console.log('Fehler:', fails.length ? fails.join(' | ') : 'keine');
await b.close();
process.exit(fails.length ? 1 : 0);
