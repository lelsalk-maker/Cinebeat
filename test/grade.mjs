// Colorist und Bildausschnitt: Szenenstimmung bleibt, Ausreißer rücken heran, Lichter bleiben; Motiv/Horizont auf Dritteln
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(() => {
  const fails = [];
  const T = 1.7e12, min = 60000;
  // Szene 1: warmer Abend (drei Aufnahmen), eine davon mit kühlem Weißabgleich; Szene 2 (2 h später): neutraler Mittag
  const L = [
    { id: 'a', avg: [200, 140, 90], luma: 0.55, time: T },
    { id: 'b', avg: [205, 145, 92], luma: 0.52, time: T + min },
    { id: 'c', avg: [150, 150, 170], luma: 0.5, time: T + 2 * min },
    { id: 'd', avg: [130, 130, 128], luma: 0.2, time: T + 120 * min },
    { id: 'e', avg: [128, 131, 130], luma: 0.48, time: T + 121 * min },
  ];
  const { corr } = colorMatch(L);
  const apply = (m) => { const k = corr.get(m.id); return m.avg.map((v, i) => 255 * Math.pow(v / 255, k[3]) * k[i]); };
  const warm = (c) => c[0] - c[2];
  const a = apply(L[0]), c0 = warm(L[2].avg), c1 = warm(apply(L[2]));
  if (warm(a) < warm(L[0].avg) * 0.85) fails.push(`Abend verliert Wärme ${warm(L[0].avg)}→${warm(a).toFixed(0)}`);
  if (!(c1 > c0 + 8)) fails.push(`kühler Ausreißer rückt nicht heran ${c0}→${c1.toFixed(0)}`);
  const kd = corr.get('d');
  if (!(kd[3] < 0.95)) fails.push('dunkle Aufnahme wird nicht über Gamma aufgehellt ' + kd);
  for (const [id, k] of corr) { if (k.length !== 6 || k.slice(0, 4).some((v) => !(v > 0.7 && v < 1.35)) || !(k[4] >= 0 && k[4] <= 0.08) || !(k[5] >= 0.82 && k[5] <= 1)) fails.push('Grenzen ' + id + ' ' + k); }
  // Weiß bleibt Weiß: Gamma hält Lichter, Verstärkung ≤ 7 %
  const wmax = Math.max(...corr.get('d').slice(0, 3));
  if (wmax > 1.075) fails.push('Lichter-Verstärkung ' + wmax);
  // Ausschnitt: Motiv links im Querbild ⇒ im Hochkant-Ausschnitt auf dem linken Drittel (nicht in der Mitte)
  const fw = 0.4, fh = 1;
  const [fx] = framePoint({ focus: [0.3, 0.5], subject: [0.3, 0.5, 0.12, 0.3] }, fw, fh);
  const onScreen = 0.5 + (0.3 - fx) / fw;
  if (!(onScreen > 0.32 && onScreen < 0.4)) fails.push('Motiv nicht auf dem Drittel: ' + onScreen.toFixed(2));
  const [cx] = framePoint({ focus: [0.5, 0.5], subject: [0.5, 0.5, 0.1, 0.2] }, fw, fh);
  if (Math.abs(cx - 0.5) > 1e-6) fails.push('Motiv in der Mitte bleibt nicht mittig');
  // großes Motiv: kein Drittel-Versatz
  const [bx] = framePoint({ focus: [0.3, 0.5], subject: [0.3, 0.5, 0.35, 0.6] }, fw, fh);
  if (Math.abs(bx - 0.3) > 1e-6) fails.push('großes Motiv verschoben');
  // Horizont: viel Himmel ⇒ Horizont eher unten im Ausschnitt
  const [, hy] = framePoint({ focus: [0.5, 0.5], horizon: 0.55, sky: 0.7 }, 1, 0.5);
  const hOn = 0.5 + (0.55 - hy) / 0.5;
  if (!(hOn > 0.55)) fails.push('Horizont nicht Richtung unteres Drittel: ' + hOn.toFixed(2));
  // Menschen: Kopf bleibt im Bild
  const sub = [0.5, 0.35, 0.2, 0.3];
  const [, py] = framePoint({ focus: [0.5, 0.6], subject: sub, people: 0.6 }, 1, 0.5);
  if (py - 0.25 > sub[1] - sub[3] / 2) fails.push('Kopf angeschnitten');
  return fails;
});
console.log(r.length ? 'FAIL ' + r.join('; ') : 'OK grade');
await b.close();
process.exit(r.length ? 1 : 0);
