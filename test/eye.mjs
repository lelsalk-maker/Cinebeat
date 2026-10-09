// Blickführung über den Schnitt: der Blickpunkt (Motiv) des nächsten Bilds beginnt nahe der Stelle, an der das Auge am
// Ende des vorigen war. Gemessen als mittlerer Abstand über alle harten Schnitte/kurzen Blenden zwischen Fotos – mit
// Blickführung deutlich kleiner, Tempo der Fahrten bleibt im Rahmen, Ziel-Ausschnitte nur leicht versetzt.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async () => {
  let seed = 9; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const base = demoScenes(), T0 = Date.UTC(2026, 4, 1, 8);
  const an = (await beatSong(beatRecipe('sommer', {}, { seed: 3, form: 'reel' }))).an;
  const out = {};
  for (const [fmt, w, h] of [['9:16', 3000, 4000], ['16:9', 4000, 3000]]) {
    const media = [];
    for (let i = 0; i < 26; i++) { const c = document.createElement('canvas'); c.width = 360; c.height = 480; { const x = c.getContext('2d'); x.fillStyle = `hsl(${(i * 47) % 360},45%,${35 + (i % 4) * 8}%)`; x.fillRect(0, 0, 360, 480); for (let k = 0; k < 6; k++) { x.fillStyle = `hsl(${(i * 47 + k * 60) % 360},60%,${30 + k * 8}%)`; x.fillRect(rnd() * 300, rnd() * 420, 40 + rnd() * 120, 40 + rnd() * 160); } } media.push({ id: 'e' + i, kind: 'image', name: 'E' + i, canvas: c, w, h, time: T0 + i * 7 * 60000, ...scoreImage(c, c.width, c.height), focus: [+(0.2 + rnd() * 0.6).toFixed(3), +(0.25 + rnd() * 0.5).toFixed(3)], subject: null, horizon: null, tilt: 0, hash: [i * 7919 + 1, i * 104729 + 3], avg: [90 + i * 5, 120, 150 - i * 3] }); }
    const S0 = { format: fmt, target: fmt === '9:16' ? 'reel' : undefined, look: 'natur', pace: 'auto', intro: 'hook', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 5, effekte: 'schlicht' };
    const on = buildPlan({ an, media: media.map((m) => ({ ...m })), settings: S0, overrides: { texts: [], stickers: [] } });
    const off = buildPlan({ an, media: media.map((m) => ({ ...m })), settings: { ...S0, eye: 'off' }, overrides: { texts: [], stickers: [] } });
    const byId = new Map(media.map((m) => [m.id, m]));
    // gleiche Ziel-Ausschnitte (der fotografisch gesetzte Endpunkt jeder Fahrt bleibt)
    let sameTo = 0, n = 0;
    for (let i = 0; i < on.clips.length; i++) { const a = on.clips[i], b2 = off.clips[i]; if (!a || !b2 || !a.motion || !b2.motion || a.mediaId !== b2.mediaId) continue; n++; if (Math.abs((a.motion.to.x || 0) - (b2.motion.to.x || 0)) <= 0.451 && Math.abs((a.motion.to.y || 0) - (b2.motion.to.y || 0)) <= 0.451) sameTo++; }
    // Tempo der verschobenen Fahrten
    let worst = 1;
    for (let i = 0; i < on.clips.length; i++) {
      const a = on.clips[i], b2 = off.clips[i];
      if (!a || !b2 || !a.motion || !b2.motion || a.mediaId !== b2.mediaId || !byId.get(a.mediaId)) continue;
      const m = byId.get(a.mediaId), d = Math.max(0.25, a.visEnd - a.visStart);
      const s1 = motionSpeed(a.motion, m, fmt === '9:16' ? 9 / 16 : 16 / 9, d), s0 = motionSpeed(b2.motion, m, fmt === '9:16' ? 9 / 16 : 16 / 9, d);
      if (s0 > 0.003) worst = Math.max(worst, s1 / s0, s0 / s1);
    }
    out[fmt] = { moved: on.eye && on.eye.moved, before: on.eye && +on.eye.before.toFixed(3), after: on.eye && +on.eye.after.toFixed(3), possible: on.eye && +on.eye.possible.toFixed(3), sameTo: `${sameTo}/${n}`, sameToR: n ? sameTo / n : 1, worst: +worst.toFixed(2), audit: planAudit(on, media, an).length };
  }
  return out;
});
console.log('Blickführung:', JSON.stringify(r));
const fails = [];
for (const [f, x] of Object.entries(r)) {
  if (!x.moved) fails.push(`${f}: nichts geführt`);
  // vom Spielraum, den das Bild hergibt, soll der größte Teil genutzt werden
  if (!(x.before - x.after >= 0.6 * (x.before - x.possible))) fails.push(`${f}: Blickpunkte kaum näher (${x.before} → ${x.after}, möglich ${x.possible})`);
  if (x.sameToR < 1) fails.push(`${f}: Ziel-Ausschnitte zu weit versetzt ${x.sameTo}`);
  if (x.worst > 1.45) fails.push(`${f}: Fahrt-Tempo zu stark verändert (×${x.worst})`);
  if (x.audit) fails.push(`${f}: planAudit ${x.audit}`);
}
console.log('Fehler:', fails.length ? fails.join(' | ') : 'keine');
await b.close();
process.exit(fails.length ? 1 : 0);
