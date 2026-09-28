// Testlauf, schnell und knapp:
//   npm test               schnelle Auswahl
//   npm test -- all        alles
//   npm test -- changed    nur die Tests, die zu geänderten Dateien gehören (git)
//   npm test -- flow ui    einzelne
//   -v                     eine Zeile je Test (sonst nur Ergebnis und Fehler)
// Läuft parallel (CB_JOBS, Standard 3), die längsten zuerst; zeitkritische Tests laufen danach allein.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
const QUICK = ['analysis', 'smooth', 'flow', 'style', 'videos', 'allmedia', 'ui', 'e2e', 'features'];
const ALL = ['meta', 'beats', 'longbeats', 'structure', 'score', 'mux', 'csp', 'offline', 'chapters', 'ui', 'e2e', 'trip', 'flight', 'overflow', 'features', 'flow', 'fastexport', 'ingest', 'adaptive', 'resume', 'sync', 'latency', 'quality', 'perf', 'style', 'stylevis', 'videos', 'allmedia', 'analysis', 'bgexport', 'smooth', 'judder', 'listen', 'workerscore', 'heat', 'grade', 'vsync', 'trips', 'levels', 'us', 'tap', 'hook', 'stimmig', 'carousel', 'carouselui', 'shutter', 'shutterui'];
// messen Zeit oder Bildrate: nie unter Last anderer Tests
const SERIAL = new Set(['flight', 'ingest', 'perf', 'latency', 'sync', 'adaptive', 'fastexport', 'bgexport', 'tap']);
// welche Tests eine Datei berühren
const MAP = [
  [/^src\/js\/plan\/|^src\/js\/director\.js/, ['analysis', 'smooth', 'flow', 'style', 'allmedia', 'videos', 'chapters', 'overflow', 'features', 'grade', 'vsync', 'us', 'tap', 'hook', 'stimmig', 'carousel', 'carouselui', 'shutter', 'shutterui']],
  [/^src\/js\/audio\.js/, ['beats', 'longbeats', 'structure', 'listen', 'analysis', 'stimmig']],
  [/^src\/js\/(score|scoreworker)\.js/, ['score', 'analysis', 'ingest', 'workerscore', 'vsync']],
  [/^src\/js\/perflog\.js/, ['heat', 'workerscore']],
  [/^src\/js\/(renderer|overlay)\.js/, ['judder', 'stylevis', 'quality', 'style', 'shutter']],
  [/^src\/js\/engine\.js/, ['judder', 'fastexport', 'bgexport', 'sync', 'latency', 'perf', 'adaptive', 'resume', 'heat', 'carouselui', 'shutter']],
  [/^src\/js\/(mp4mux|demux)\.js/, ['mux', 'fastexport', 'bgexport', 'vsync', 'ingest']],
  [/^src\/js\/(meta|world)\.js/, ['meta', 'trip', 'flight']],
  [/^src\/(js\/ui\.js|body\.html|app\.css)/, ['ui', 'e2e', 'features', 'listen', 'workerscore', 'trips', 'levels', 'tap', 'hook', 'carouselui', 'shutter', 'shutterui']],
  [/^src\/js\/store\.js/, ['resume', 'trip', 'offline', 'trips']],
  [/^src\/js\/(mediaio|demo)\.js/, ['ingest', 'videos', 'e2e']],
  [/^(build\.mjs|docs\/sw\.js)/, ['offline', 'csp', 'workerscore']],
];
const args = process.argv.slice(2);
const verbose = args.includes('-v');
const names = args.filter((a) => a !== '-v');
let list;
if (names[0] === 'all') list = ALL;
else if (names[0] === 'changed') {
  const files = execSync('git diff --name-only HEAD; git ls-files --others --exclude-standard').toString().split('\n').filter(Boolean);
  const set = new Set();
  for (const f of files) {
    const t = /^test\/(\w+)\.mjs$/.exec(f);
    if (t && ALL.includes(t[1])) set.add(t[1]);
    for (const [re, tests] of MAP) if (re.test(f)) tests.forEach((x) => set.add(x));
  }
  list = [...set];
  if (!list.length) { console.log('keine betroffenen Tests'); process.exit(0); }
} else list = names.length ? names : QUICK;
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
const up = (port) => { try { execSync(`curl -s -o /dev/null http://127.0.0.1:${port}/`); return true; } catch { return false; } };
for (const [port, dir] of [[8123, 'docs'], [8124, '.']]) if (!up(port)) spawn('npx', ['http-server', dir, '-p', String(port), '-s', '-c-1'], { detached: true, stdio: 'ignore' }).unref();
execSync('node build.mjs', { stdio: 'ignore' });
// bisherige Laufzeiten: die längsten zuerst starten, dann ist der Pool am Ende nicht mit einem Nachzügler allein
const TIMES = 'test/.times.json';
const times = existsSync(TIMES) ? JSON.parse(readFileSync(TIMES, 'utf8')) : {};
const t0 = Date.now();
// Lint über alle Quellen (so, wie sie gebündelt werden)
const lint = (() => { try { const src = execSync('cat src/js/*.js src/js/plan/*.js').toString(); writeFileSync('test/_lint.js', src); const r = execSync('npx eslint -c test/eslint.config.mjs test/_lint.js 2>&1 || true').toString(); execSync('rm -f test/_lint.js'); return r; } catch (e) { return String(e); } })();
const lintErr = +(lint.match(/(\d+) errors?/) || [0, 0])[1], lintWarn = +(lint.match(/(\d+) warnings?/) || [0, 0])[1];
if (lintErr || lintWarn) console.log(lint.split('\n').filter((l) => /error|warning/.test(l)).slice(0, 8).join('\n'));
await new Promise((r) => setTimeout(r, 1500));
// lange Tests in unabhängige Teile zerlegen, damit sie parallel laufen (Name „test/teil“)
const SPLIT = {
  judder: { story: '[["story",{}]]', musikvideo: '[["musikvideo",{"mv":"on","variant":"energisch"}]]', film: '[["film",{"format":"16:9","variant":"ruhig"}]]' },
};
list = list.flatMap((t) => (SPLIT[t] ? Object.keys(SPLIT[t]).map((k) => `${t}/${k}`) : [t]));
const run = (t) => new Promise((r) => {
  const s = Date.now();
  const [file, part] = t.split('/');
  const env = { ...process.env, OUT };
  if (part) env.JCONF = SPLIT[file][part];
  const p = spawn('node', [`test/${file}.mjs`], { env });
  let o = '';
  p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (o += d));
  p.on('close', (code) => {
    const secs = (Date.now() - s) / 1000;
    const bad = code !== 0 || /pageerror|Fehler: (?!keine)|"fails": \[\s*"/.test(o);
    times[t] = Math.round(secs);
    if (verbose || bad) console.log(`${bad ? '✗' : '✓'} ${t.padEnd(11)} ${secs.toFixed(0).padStart(3)} s  ${o.trim().split('\n').pop().slice(0, 100)}`);
    if (bad) console.log(o.trim().split('\n').filter((l) => !/GroupMarker|swiftshader/.test(l)).slice(-10).map((l) => '    ' + l.slice(0, 160)).join('\n'));
    r(bad);
  });
});
const par = list.filter((t) => !SERIAL.has(t)).sort((a, b) => (times[b] || 30) - (times[a] || 30));
const ser = list.filter((t) => SERIAL.has(t));
const jobs = Math.max(1, +(process.env.CB_JOBS || 3));
let failed = 0;
await Promise.all(Array.from({ length: Math.min(jobs, par.length) }, async () => { while (par.length) if (await run(par.shift())) failed++; }));
for (const t of ser) if (await run(t)) failed++;
writeFileSync(TIMES, JSON.stringify(times));
const el = Math.round((Date.now() - t0) / 1000);
console.log(`${failed ? `${failed} von ${list.length} fehlgeschlagen` : `alle ${list.length} bestanden`} · ${Math.floor(el / 60)}:${String(el % 60).padStart(2, '0')} min · lint ${lintErr}/${lintWarn}`);
process.exit(failed || lintErr ? 1 : 0);
