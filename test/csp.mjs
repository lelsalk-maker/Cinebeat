import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const page = await b.newPage();
page.on('requestfailed', (r) => console.log('fehlgeschlagen:', r.url(), '→', r.failure().errorText));
page.on('response', (r) => console.log('Antwort erhalten:', r.url()));
await page.goto('file:///home/user/cinebeat/docs/CineBeat.html');
await page.waitForSelector('.place');
console.log(await page.evaluate(async () => {
  const v = [];
  document.addEventListener('securitypolicyviolation', (e) => v.push(e.violatedDirective));
  try { await fetch('https://example.com/'); } catch (e) { /* */ }
  await new Promise((r) => { const i = new Image(); i.onerror = r; i.onload = r; i.src = 'https://example.com/x.png'; });
  await new Promise((r) => { const s = document.createElement('script'); s.src = 'https://example.com/x.js'; s.onerror = r; s.onload = r; document.head.appendChild(s); });
  await new Promise((r) => setTimeout(r, 300));
  return 'CSP-Blockaden: ' + v.join(', ');
}));
await b.close();
