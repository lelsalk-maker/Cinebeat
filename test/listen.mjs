// Mithören mit Countdown: das Mikrofon wird durch einen synthetischen Song ersetzt, der kurz nach dem „Los“ einsetzt.
// Prüft Countdown-Anzeige, Zuschnitt auf den Einsatz (die Aufnahme beginnt genau mit dem Song) und die Startzeit für Instagram.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.env.OUT || '/tmp/cinebeat-test';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.addInitScript(() => {
  // Fake-Mikrofon: Stille mit leisem Rauschen, 3,35 s nach dem Anfordern setzt ein Song mit 120 BPM ein
  navigator.mediaDevices.getUserMedia = async () => {
    const ac = new AudioContext();
    await ac.resume();
    const dest = ac.createMediaStreamDestination();
    const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() - 0.5) * 0.004;
    const ns = ac.createBufferSource(); ns.buffer = noise; ns.loop = true; ns.connect(dest); ns.start();
    const t0 = ac.currentTime + 3.35;
    window.__songAt = t0;
    for (let k = 0; k < 90; k++) {
      const t = t0 + k * 0.5;
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.8, t + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(dest); o.start(t); o.stop(t + 0.35);
      if (k % 2) { const h = ac.createOscillator(), hg = ac.createGain(); h.type = 'square'; h.frequency.value = 330; hg.gain.setValueAtTime(0, t); hg.gain.linearRampToValueAtTime(0.1, t + 0.01); hg.gain.exponentialRampToValueAtTime(0.001, t + 0.2); h.connect(hg).connect(dest); h.start(t); h.stop(t + 0.25); }
    }
    return dest.stream;
  };
});
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForSelector('.place');
await page.click('.place');
await page.waitForFunction(() => CineBeat.S.plan && document.getElementById('busy').hidden, null, { timeout: 90000 });
await page.click('#tabbtn-music');
await page.click('#micSong');
await page.fill('#micName', 'Testsong');
await page.fill('#micOffset', '0:30');
await page.click('#micGo');
await page.waitForTimeout(1200);
const c1 = await page.evaluate(() => ({ shown: !document.getElementById('micCount').hidden, num: document.getElementById('micNum').textContent }));
await page.screenshot({ path: `${OUT}/listen_count.png` });
await page.waitForTimeout(2200);
const c2 = await page.evaluate(() => document.getElementById('micNum').textContent);
console.log('Countdown:', c1, '→', c2);
if (!c1.shown || c1.num !== '3' && c1.num !== '2') errs.push('Countdown nicht sichtbar');
if (c2 !== 'Los') errs.push('kein „Los“');
await page.waitForFunction(() => !document.getElementById('micGo').disabled, null, { timeout: 40000 });
await page.waitForTimeout(3000);
await page.click('#micGo');
await page.waitForFunction(() => CineBeat.S.ctx.song.mic && document.getElementById('busy').hidden && CineBeat.S.plan, null, { timeout: 90000 });
const r = await page.evaluate(() => {
  const s = CineBeat.S.ctx.song, d = s.buffer.getChannelData(0), sr = s.buffer.sampleRate;
  const rms = (a, n) => { let q = 0; for (let i = a; i < a + n; i++) q += d[i] * d[i]; return Math.sqrt(q / n); };
  // erster Kick: wo steigt die Hüllkurve über 20 % des Maximums?
  let pk = 0; for (let i = 0; i < sr * 2; i += 64) pk = Math.max(pk, rms(i, 64));
  let first = -1; for (let i = 0; i < sr * 2; i += 16) if (rms(i, 64) > pk * 0.2) { first = i / sr; break; }
  return { firstKickMs: +(first * 1000).toFixed(1), bpm: +s.an.bpm.toFixed(1), offset: s.offset, beat0: +(s.an.beats[0] * 1000).toFixed(1), dur: +s.buffer.duration.toFixed(1), ig: document.getElementById('igLine') ? document.getElementById('igLine').textContent : '' };
});
console.log('Aufnahme:', r);
if (!(r.firstKickMs >= -1 && r.firstKickMs < 25)) errs.push(`Aufnahme beginnt nicht mit dem Song (${r.firstKickMs} ms)`);
if (Math.abs(r.bpm - 120) > 1.5) errs.push('Tempo falsch: ' + r.bpm);
if (r.offset !== 30) errs.push('Startstelle falsch');
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
await b.close();
