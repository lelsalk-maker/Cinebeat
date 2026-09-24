// Bündelt src/ zu:
//   docs/index.html      – installierbare Web-App (PWA), von GitHub Pages ausgeliefert
//   docs/CineBeat.html   – eigenständige Einzeldatei, komplett offline, Netzwerk per CSP gesperrt
//   dist/cinebeat.html   – Fragment für den Claude-Link (nicht im Repository)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const order = ['mediaio', 'meta', 'world', 'audio', 'score', 'planner', 'director', 'renderer', 'overlay', 'mp4mux', 'demux', 'engine', 'store', 'demo', 'ui'];
const js = "(function () {\n'use strict';\n" + order.map((n) => r(`src/js/${n}.js`)).join('\n') + '\n})();\n';
const css = r('src/app.css');
const body = r('src/body.html');
const inner = `<style>\n${css}</style>\n${body}\n<script>\n${js}</script>\n`;
const desc = 'Reisefilme im Takt deines Songs, für Instagram Stories, Reels, Beiträge und Film';
const icon = r('docs/icon.svg').trim();
const iconData = 'data:image/svg+xml,' + encodeURIComponent(icon);

// Keine Verbindung nach außen: alles außer eingebettetem Code, blob: und data: ist verboten.
const CSP_OFFLINE = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src blob: data:',
  "connect-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const CSP_PWA = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src blob: data:",
  "connect-src 'self'",
  "font-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const head = (extra, csp) => `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<title>CineBeat</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#050608">
<meta name="color-scheme" content="dark">
${extra}
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}img{max-width:100%}</style>
</head>
<body>
${inner}</body>
</html>
`;

mkdirSync(new URL('dist/', import.meta.url), { recursive: true });
mkdirSync(new URL('docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('docs/CineBeat.html', import.meta.url), head(`<link rel="icon" href="${iconData}">`, CSP_OFFLINE));
writeFileSync(new URL('docs/index.html', import.meta.url), head(`<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="CineBeat">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-512.png">`, CSP_PWA));
writeFileSync(new URL('dist/cinebeat.html', import.meta.url), `<title>CineBeat</title>\n<meta name="description" content="${desc}">\n${inner}`);
console.log('ok', (js.length / 1024).toFixed(1) + ' KB JS');

