import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/js/meta.js', import.meta.url), 'utf8');
const M = new Function(src + '; return { readMediaMeta, clusterStops, nearestCity, haversineKm, dateRangeLabel };')();
// JPEG mit EXIF (big endian): DateTimeOriginal + GPS
function exifJpeg(lat, lon, date) {
  const b = []; const u16 = (v) => b.push(v >> 8, v & 255); const u32 = (v) => b.push(v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255);
  const tiff = [];
  // Aufbau über Offsets relativ zum TIFF-Start
  const T = { data: [] };
  const w16 = (a, v) => a.push(v >> 8, v & 255), w32 = (a, v) => a.push(v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255);
  const ifd0At = 8, exifAt = ifd0At + 2 + 2 * 12 + 4, gpsAt = exifAt + 2 + 12 + 4, dataAt = gpsAt + 2 + 4 * 12 + 4;
  const dt = date + '\0'; const dtAt = dataAt; const latAt = dtAt + dt.length; const lonAt = latAt + 24;
  const t = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8];
  w16(t, 2); w16(t, 0x8769); w16(t, 4); w32(t, 1); w32(t, exifAt); w16(t, 0x8825); w16(t, 4); w32(t, 1); w32(t, gpsAt); w32(t, 0);
  w16(t, 1); w16(t, 0x9003); w16(t, 2); w32(t, dt.length); w32(t, dtAt); w32(t, 0);
  const dms = (x) => { x = Math.abs(x); const d = Math.floor(x), m = Math.floor((x - d) * 60), s = Math.round(((x - d) * 60 - m) * 60 * 100); return [d, 1, m, 1, s, 100]; };
  w16(t, 4);
  w16(t, 1); w16(t, 2); w32(t, 2); t.push(lat < 0 ? 83 : 78, 0, 0, 0);
  w16(t, 2); w16(t, 5); w32(t, 3); w32(t, latAt);
  w16(t, 3); w16(t, 2); w32(t, 2); t.push(lon < 0 ? 87 : 69, 0, 0, 0);
  w16(t, 4); w16(t, 5); w32(t, 3); w32(t, lonAt); w32(t, 0);
  for (const c of dt) t.push(c.charCodeAt(0));
  for (const v of dms(lat)) w32(t, v);
  for (const v of dms(lon)) w32(t, v);
  const app1 = [0xff, 0xe1]; w16(app1, t.length + 8); app1.push(0x45, 0x78, 0x69, 0x66, 0, 0, ...t);
  return new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
}
function mov(iso, date) {
  const txt = Buffer.from('....keys....com.apple.quicktime.location.ISO6709....' + iso + '....' + date + '....');
  const moov = Buffer.alloc(8 + txt.length); moov.writeUInt32BE(8 + txt.length); moov.write('moov', 4); txt.copy(moov, 8);
  const ftyp = Buffer.from([0, 0, 0, 16, ...Buffer.from('ftypqt  '), 0, 0, 0, 0]);
  const mdat = Buffer.alloc(1000); mdat.writeUInt32BE(1000); mdat.write('mdat', 4);
  return Buffer.concat([ftyp, mdat, moov]);
}
const files = [
  ['lis1.jpg', exifJpeg(38.7139, -9.1394, '2026:05:10 10:12:00')],
  ['lis2.jpg', exifJpeg(38.70, -9.15, '2026:05:10 18:40:00')],
  ['lis3.jpg', exifJpeg(38.72, -9.13, '2026:05:11 09:02:00')],
  ['sintra.jpg', exifJpeg(38.797, -9.39, '2026:05:11 15:00:00')],
  ['porto1.jpg', exifJpeg(41.14, -8.61, '2026:05:13 11:00:00')],
  ['porto2.jpg', exifJpeg(41.15, -8.62, '2026:05:13 20:00:00')],
  ['porto3.jpg', exifJpeg(41.16, -8.63, '2026:05:14 10:00:00')],
  ['douro.jpg', exifJpeg(41.16, -7.79, '2026:05:15 12:00:00')],
  ['douro2.jpg', exifJpeg(41.17, -7.80, '2026:05:15 13:00:00')],
  ['douro3.jpg', exifJpeg(41.18, -7.78, '2026:05:15 14:00:00')],
];
const items = [];
for (const [n, d] of files) { const f = new File([d], n, { type: 'image/jpeg' }); const m = await M.readMediaMeta(f, 'image'); items.push({ name: n, ...m }); }
const v = new File([mov('+41.1496-008.6109+000.000/', '2026-05-14T08:30:00+0100')], 'porto.mov', { type: 'video/quicktime' });
const vm = await M.readMediaMeta(v, 'video');
items.push({ name: 'porto.mov', ...vm });
console.log(items.map((m) => `${m.name}: ${m.pos ? m.pos.map((x) => x.toFixed(4)).join(',') : '-'} ${m.time ? new Date(m.time).toISOString().slice(0, 16) : '-'}`).join('\n'));
const stops = M.clusterStops(items);
let prev = null, total = 0;
for (const s of stops) { const km = prev ? M.haversineKm(prev, s.pos) : 0; total += km; prev = s.pos; console.log(`Stopp: ${s.name || 'unbekannt'} (${s.items.length}) ${M.dateRangeLabel(s.from, s.to)} +${km.toFixed(0)} km`); }
console.log('Gesamt', total.toFixed(0), 'km');
