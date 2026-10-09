// Kinetische Schrift: der Ortstitel läuft Buchstabe für Buchstabe auf dem Schlag ein (links zuerst), steht dann ruhig und
// voll lesbar, atmet nur mit Effekten („Dezent“/„Kreativ“) auf starken Treffern kurz mit (Schlicht bleibt ruhig) und steigt
// gestaffelt auf dem letzten Schlag aus. Gemessen an der gezeichneten Schrift (Deckkraft je Spalte).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:8124/test/pipeline.html');
const r = await p.evaluate(async () => {
  await document.fonts.ready;
  const beats = Array.from({ length: 16 }, (_, i) => 0.2 + i * 0.5);
  const mk = (eff) => ({ overlays: [{ type: 'city', text: 'Lissabon', sub: 'Mai 2026', start: 0.2, end: 6.2 }], beats, beatAcc: beats.map((_, i) => (i === 6 ? 0.9 : 0.4)), band: [0, 1], look: 'natur', font: 'klassisch', format: '9:16', resolved: { effekte: eff, format: '9:16' } });
  const op = new OverlayPainter();
  op.resize(360, 640);
  const ink = (plan, t) => {
    op.lastKey = ''; op.paint(plan, t, null);
    const d = op.top.getContext('2d').getImageData(0, 200, 360, 200).data;
    let x0 = 360, x1 = -1, sum = 0, left = 0, right = 0;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 360; x++) { const a = d[(y * 360 + x) * 4 + 3]; if (a > 128) { sum++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (x < 180) left++; else right++; } }
    return { sum, w: x1 - x0, left, right };
  };
  const dz = mk('dezent'), sl = mk('schlicht');
  const full = ink(dz, 2.0);
  return { early: ink(dz, 0.32), full, hold: [1.5, 2.5, 4.5, 5.6].map((t) => ink(dz, t).sum), pulse: ink(dz, 3.3), plain: ink(sl, 3.3), exitA: ink(dz, 5.69), exitB: ink(dz, 6.0), exitC: ink(dz, 6.15), exitT: op.beatExit(dz.overlays[0]) };
});
console.log(JSON.stringify(r));
const fails = [];
if (!(r.early.sum > 0 && r.early.left > r.early.right * 2)) fails.push('kein Einlauf von links nach rechts');
if (r.hold.some((s) => s < r.full.sum * 0.95)) fails.push('Titel steht nicht ruhig und vollständig: ' + r.hold);
if (!(r.pulse.w > r.full.w + 2)) fails.push(`kein Mitatmen auf dem Treffer (${r.full.w} → ${r.pulse.w})`);
if (Math.abs(r.plain.w - r.full.w) > 1) fails.push('Schlicht atmet mit');
if (Math.abs(r.exitT - 5.7) > 0.01) fails.push('Ausstieg nicht auf dem letzten Schlag ' + r.exitT);
if (r.exitA.sum < r.full.sum * 0.9) fails.push('Ausstieg vor dem Schlag');
if (!(r.exitB.sum < r.full.sum * 0.8)) fails.push('kein Ausstieg');
if (r.exitC.sum > r.full.sum * 0.03) fails.push('Ausstieg vor dem Ende nicht fertig');
console.log('Fehler:', fails.length ? fails.join(' | ') : 'keine');
await b.close();
process.exit(fails.length ? 1 : 0);
