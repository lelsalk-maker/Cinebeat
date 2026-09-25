// Testlauf mit kompakter Ausgabe: `npm test` (schnell) · `npm test -- all` (alles) · `npm test -- flow videos` (einzelne)
// Startet die beiden lokalen Server bei Bedarf, zeigt je Test eine Zeile und nur bei Fehlern die letzten Zeilen.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const QUICK = ['analysis', 'flow', 'style', 'videos', 'allmedia', 'ui', 'e2e', 'features'];
const ALL = ['meta', 'beats', 'longbeats', 'structure', 'score', 'mux', 'csp', 'offline', 'chapters', 'mic', 'ui', 'e2e', 'trip', 'flight', 'overflow', 'features', 'flow', 'fastexport', 'ingest', 'adaptive', 'resume', 'sync', 'latency', 'quality', 'perf', 'style', 'stylevis', 'videos', 'allmedia', 'analysis'];
const args = process.argv.slice(2);
const list = args[0] === 'all' ? ALL : args.length ? args : QUICK;
const OUT = process.env.OUT || '/tmp/cinebeat-test';
mkdirSync(OUT, { recursive: true });
const up = (port) => { try { execSync(`curl -s -o /dev/null http://127.0.0.1:${port}/`); return true; } catch { return false; } };
for (const [port, dir] of [[8123, 'docs'], [8124, '.']]) if (!up(port)) spawn('npx', ['http-server', dir, '-p', String(port), '-s', '-c-1'], { detached: true, stdio: 'ignore' }).unref();
await new Promise((r) => setTimeout(r, 2500));
execSync('node build.mjs', { stdio: 'ignore' });
// Lint über alle Quellen (so, wie sie gebündelt werden)
const lint = (() => { try { const src = execSync("cat src/js/*.js src/js/plan/*.js").toString(); writeFileSync('test/_lint.js', src); const r = execSync('npx eslint -c test/eslint.config.mjs test/_lint.js 2>&1 || true').toString(); execSync('rm -f test/_lint.js'); return r; } catch (e) { return String(e); } })();
const lintErr = (lint.match(/(\d+) errors?/) || [0, 0])[1];
console.log(`lint: ${lintErr} Fehler, ${(lint.match(/(\d+) warnings?/) || [0, 0])[1]} Warnungen`);
let failed = 0;
for (const t of list) {
  const t0 = Date.now();
  const res = await new Promise((r) => { const p = spawn('node', [`test/${t}.mjs`], { env: { ...process.env, OUT } }); let o = ''; p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (o += d)); p.on('close', (code) => r({ code, o })); });
  const bad = res.code !== 0 || /pageerror|Fehler: (?!keine)|"fails": \[\s*"/.test(res.o);
  if (bad) failed++;
  const last = res.o.trim().split('\n').pop().slice(0, 110);
  console.log(`${bad ? '✗' : '✓'} ${t.padEnd(11)} ${((Date.now() - t0) / 1000).toFixed(0).padStart(3)} s  ${last}`);
  if (bad) console.log(res.o.trim().split('\n').slice(-12).map((l) => '    ' + l.slice(0, 160)).join('\n'));
}
console.log(failed ? `${failed} von ${list.length} fehlgeschlagen` : `alle ${list.length} bestanden`);
process.exit(failed ? 1 : 0);
