// Wir-Vorrang: Aufnahmen von euch in die ruhigen Passagen, Natur/Dinge in die schnellen, chronologisch innerhalb der Szene
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { makeStructuredSong } from './wav.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
makeStructuredSong(`${OUT}/us.wav`, { bpm: 122 });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const wav = readFileSync(`${OUT}/us.wav`).toString('base64');
const r = await p.evaluate(async (b64) => {
  const fails = [];
  // Erkennung
  if (usScore({ us: true }) !== 1 || usScore({ us: false, faces: 2 }) !== 0) fails.push('Markierung');
  if (isUs({ people: 0.9, skinFrac: 0.4 })) fails.push('Sand gilt als Mensch');
  if (!isUs({ people: 0.7, skinFrac: 0.05 })) fails.push('Mensch nicht erkannt');
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(u.buffer);
  const an = await analyzeAudio(buf);
  const sc = demoScenes();
  // 24 Fotos einer Szene (je 1 min Abstand), jedes dritte „wir“
  const media = Array.from({ length: 24 }, (_, i) => { const c = sc[i % sc.length]; return { id: 'm' + i, kind: 'image', name: 'M' + i, canvas: c, w: c.width, h: c.height, time: 1.7e12 + i * 60000, ...scoreImage(c, c.width, c.height), us: i % 3 === 0 }; });
  const byId = new Map(media.map((m) => [m.id, m]));
  const s = { format: '9:16', look: 'natur', pace: 'auto', intro: 'auto', outro: 'auto', length: 'auto', songStart: 'auto', frame: 'auto', seed: 4, allMedia: 'on' };
  const stat = (plan) => {
    let calmUs = 0, calmN = 0, fastUs = 0, fastN = 0, usT = 0, usN = 0, oT = 0, oN = 0;
    for (const c of plan.clips) {
      const m = byId.get(c.mediaId);
      if (!m || c.split || c.grid || c.burst || c.loop) continue;
      const calm = isCalmLabel(c.label), d = c.end - c.start;
      if (calm) { calmN++; if (m.us) calmUs++; } else { fastN++; if (m.us) fastUs++; }
      if (m.us) { usT += d; usN++; } else { oT += d; oN++; }
    }
    return { calm: calmUs / Math.max(1, calmN), fast: fastUs / Math.max(1, fastN), usLen: usT / Math.max(1, usN), oLen: oT / Math.max(1, oN) };
  };
  const on = buildPlan({ an, media, settings: s, overrides: { texts: [], stickers: [] } });
  const off = buildPlan({ an, media, settings: { ...s, us: 'off' }, overrides: { texts: [], stickers: [] } });
  const a = stat(on), z = stat(off);
  if (!(a.calm > a.fast)) fails.push(`ruhig ${a.calm.toFixed(2)} ≤ schnell ${a.fast.toFixed(2)}`);
  if (!(a.calm >= z.calm)) fails.push('ohne Vorrang mehr Wir in ruhigen Teilen');
  if (!(a.usLen > a.oLen)) fails.push(`Wir nicht länger ${a.usLen.toFixed(2)} vs ${a.oLen.toFixed(2)}`);
  // nichts geht verloren (gegenüber dem Plan ohne Vorrang), jede Gruppe bleibt (fast) chronologisch
  const ids = on.clips.filter((c) => byId.get(c.mediaId)).map((c) => c.mediaId);
  const ids0 = off.clips.filter((c) => byId.get(c.mediaId)).map((c) => c.mediaId);
  for (const id of new Set(ids0)) if (!ids.includes(id)) fails.push('fehlt ' + id);
  const inv = (list, grp) => { const t = list.filter((id, k) => list.indexOf(id) === k && byId.get(id).us === grp).map((id) => byId.get(id).time); let n = 0; t.forEach((x, k) => { if (k && x < t[k - 1]) n++; }); return n; };
  for (const grp of [true, false]) if (inv(ids, grp) > inv(ids0, grp) + 2) fails.push(`Reihenfolge ${grp}: ${inv(ids, grp)} vs ${inv(ids0, grp)}`);
  // Schlussbild ist eine Wir-Aufnahme (wenn eine in der Nähe ist)
  const last = on.clips.filter((c) => !c.loop && byId.get(c.mediaId)).pop();
  if (last && !byId.get(last.mediaId).us) fails.push('Schlussbild nicht wir');
  if (!on.notes.some((n) => /Wir-Vorrang/.test(n))) fails.push('keine Notiz');
  return { fails, a, z };
}, wav);
console.log(r.fails.length ? 'FAIL ' + r.fails.join('; ') : 'OK us');
if (r.fails.length || process.argv.includes('-v')) console.log(JSON.stringify(r));
await b.close();
process.exit(r.fails.length ? 1 : 0);
